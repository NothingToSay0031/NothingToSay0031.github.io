---
title: "GPU-Driven Rendering Pipelines and Clustered Tile-Based Deferred Shading"
date: 2024-12-25 18:11:48
description: "Two pass culling with mesh shader and clustered tile-based deferred shading in Vulkan."
math: true
---

# Mesh Shader

## 为什么选择 Mesh Shader

在深入代码之前，我们先来聊聊“为什么”。传统的顶点着色 (Vertex Shading) 管线虽然服务了我们很多年，但它存在一些固有的效率瓶颈。[Mesh Shader](https://developer.nvidia.com/blog/introduction-turing-mesh-shaders/) 的出现正是为了解决这些痛点。

### 传统管线的瓶颈

[[GPUArchitecture.md#turing-架构-mesh-shader|Turing 架构: Mesh Shader]]

1.  **重复的顶点批处理**：即使场景中模型的拓扑结构（顶点连接关系）固定不变，硬件的“图元分发器” (Primitive Distributor) 每次绘制时仍然需要扫描整个索引缓冲区来创建顶点批次。这是一种不必要的重复劳动。
2.  **无效的数据拉取**：传统管线会拉取并处理大量最终不可见的顶点数据。这些顶点可能因为背面剔除 (Back-face Culling)、视锥剔除 (Frustum Culling) 或被遮挡而被丢弃，但 GPU 带宽和计算资源已经被浪费了。

### Mesh Shader 的解决方案

Mesh Shader 引入了两个新的可编程阶段：Task Shader 和 Mesh Shader，它们以工作组 (workgroup) 的形式运作，将更多的控制权交给了开发者。

  * **Task Shader** (可选): 任务着色器，负责剔除和分发工作。它可以看作是 Mesh Shader 工作组的“调度员”，能够高效地剔除掉整个物体或大块的网格，决定是否需要启动后续的 Mesh Shader。
  * **Mesh Shader**: 网格着色器，负责生成图元。它取代了传统的顶点、几何和曲面细分着色器，直接在一个工作组内生成一小批顶点和图元。

这种新模式带来了三大核心优势：

  * **极致的性能与可扩展性**：通过减少固定功能硬件的干预，渲染负载更多地转移到通用的着色器核心上。这意味着我们可以充分利用现代 GPU 强大的并行计算能力。
  * **显著的带宽节省**：顶点重用 (vertex re-use) 可以在预处理阶段完成，并将结果（称为 **Meshlet**）缓存起来复用。Meshlet 是一种高度优化的微型网格，它包含一小撮唯一的顶点和引用这些顶点的图元。这意味着 GPU 不再需要每次都扫描庞大的主索引缓冲区。使用 Meshlet 后，索引数据的大小通常能减少到原来的 75% 左右。
  * **前所未有的灵活性**：开发者可以自由定义网格拓扑，甚至在 GPU 上程序化地生成几何体，而无需受限于旧管线的固定模式。

## 构建 Meshlet

让我们看看如何将传统的顶点/索引数据转换为 Meshlet。我们使用 [meshoptimizer](https://github.com/zeux/meshoptimizer) 来简化这个过程。

整个流程可以分解为以下几个步骤：

### 定义 Meshlet 的大小并准备数据

首先，我们需要为每个 Meshlet 定义顶点和图元的上限。这些值需要权衡，以适应硬件特性。`64` 个顶点和 `124` 个三角形是常见且高效的选择。

接着，我们遍历 glTF 场景中的每个图元 (primitive)，提取其顶点数据（位置、法线、UV 等）。

```cpp
// 为每个 meshlet 定义顶点和图元的上限
const sizet max_vertices = 64;
const sizet max_triangles = 124;

// 遍历 glTF 场景中的所有 mesh 和 primitive
for (u32 p = 0; p < mesh.primitives_count; ++p) {
    glTF::MeshPrimitive& mesh_primitive = mesh.primitives[p];

    // ... 省略了从 glTF 加载顶点、法线、UV 等属性数据的代码 ...
    // f32* vertices = ...
    // u16* indices = ...
    // u32 index_count = ...
    // u32 vertex_count = ...
}
```

### 使用 meshoptimizer 构建 Meshlet

这是整个流程的魔法所在。我们调用 `meshopt_buildMeshlets` 函数，它会智能地将输入的网格分割成符合我们设定大小限制的、对 GPU 缓存友好的 Meshlet。

```cpp
// 计算构建 meshlet 所需的最大空间
const sizet max_meshlets = meshopt_buildMeshletsBound(index_count, max_vertices, max_triangles);

// 分配临时内存来存储 meshoptimizer 的输出
Array<meshopt_Meshlet> local_meshlets;
local_meshlets.init(temp_allocator, max_meshlets, max_meshlets);
// ... 为 meshlet_vertex_indices 和 meshlet_triangles 分配内存 ...

// 核心调用：构建 Meshlet！
sizet meshlet_count = meshopt_buildMeshlets(
    local_meshlets.data,          // 输出的 meshlet 数组
    meshlet_vertex_indices.data,  // 输出的顶点索引数组
    meshlet_triangles.data,       // 输出的图元索引数组
    indices,                      // 输入的原始索引数据
    index_count,                  // 输入的索引数量
    (f32*)vertices,               // 输入的顶点位置数据
    vertex_count,                 // 输入的顶点数量
    sizeof(vec3s),                // 每个顶点的大小
    max_vertices,                 // 单个 meshlet 的最大顶点数
    max_triangles,                // 单个 meshlet 的最大图元数
    cone_weight);                 // 用于锥形剔除优化的权重
```

`meshoptimizer` 会为我们生成三个关键数组：

1.  `local_meshlets`: 描述每个 Meshlet 的元数据（顶点/图元数量和偏移量）。
2.  `meshlet_vertex_indices`: 所有 Meshlet 使用的顶点索引的集合。
3.  `meshlet_triangles`: 所有 Meshlet 使用的图元索引的集合。

### 数据打包与优化

`meshoptimizer` 生成了原始数据，但我们还需要将其转换为 GPU 更喜欢的紧凑格式，以便在 Shader 中高效访问。

首先，我们处理顶点数据。为了节省带宽，我们会对法线和切线进行量化（例如，从 `float` 转换为 8 位整数），对 UV 坐标进行半精度浮点数（`half`）的量化。

```cpp
// 遍历所有顶点，转换并打包数据
for (u32 v = 0; v < vertex_count; ++v) {
    GpuMeshletVertexData meshlet_vertex_data{};

    // 将法线从 [-1, 1] 范围的 float 压缩到 [0, 255] 范围的 u8
    if (normals != nullptr) {
        meshlet_vertex_data.normal[0] = (normals[v * 3 + 0] + 1.0f) * 127.0f;
        // ... y 和 z 分量 ...
    }

    // 将 UV 坐标转换为 16 位半精度浮点数
    meshlet_vertex_data.uv_coords[0] = meshopt_quantizeHalf(tex_coords[v * 2 + 0]);
    meshlet_vertex_data.uv_coords[1] = meshopt_quantizeHalf(tex_coords[v * 2 + 1]);

    meshlets_vertex_data.push(meshlet_vertex_data);
}
```

### 生成最终的 GPU Meshlet 结构

现在，我们将 `meshoptimizer` 的输出和我们打包好的顶点数据组合成最终的 `GpuMeshlet` 结构体。这个结构体包含了在 GPU 上进行渲染和剔除所需的一切信息。

我们通过`reinterpret_cast`将`unsigned char*`指针强制转换为`unsigned int*`（`uint32_t*`）指针。这使我们能够将原始的索引流按4字节的块进行处理。一个`uint32_t`可以容纳四个8位的局部索引。在Mesh Shader内部，我们可以用一条指令加载一个`uint32_t`，然后通过廉价的位移（`>>`）和位掩码（`& 0xFF`）操作来解包得到四个独立的索引。

```cpp
// 遍历 meshoptimizer 生成的每个 meshlet
for (u32 m = 0; m < meshlet_count; ++m) {
    meshopt_Meshlet& local_meshlet = local_meshlets[m];

    // 1. 计算用于剔除的边界球和锥体
    meshopt_Bounds bounds = meshopt_computeMeshletBounds(/* ... */);

    // 2. 填充我们自定义的 GpuMeshlet 结构体
    GpuMeshlet meshlet{};
    meshlet.vertex_count   = local_meshlet.vertex_count;
    meshlet.triangle_count = local_meshlet.triangle_count;
    // ... 填充 center, radius, cone_axis, cone_cutoff 等剔除信息 ...
    meshlet.mesh_index     = ...; // 记录它所属的原始网格索引

    // 3. 将该 meshlet 的顶点索引和图元索引打包到一个连续的缓冲中
    // 顶点索引
    for (u32 i = 0; i < meshlet.vertex_count; ++i) {
        meshlets_data.push(/* ... vertex index ... */);
    }

    // 4. 将图元索引打包到我们最终的GPU缓冲中
    // 将 u8 指针重新解释为 u32 指针，以便进行块读取
    const uint32_t* index_groups =
        reinterpret_cast<const uint32_t*>(meshlet_triangles.data() + local_meshlet.triangle_offset);

    // 计算需要多少个u32的块才能容纳所有三角形索引
    const uint32_t index_group_count = (local_meshlet.triangle_count * 3 + 3) / 4;

    // 将打包好的 u32 数据块追加到最终的缓冲中
    for (uint32_t i = 0; i < index_group_count; ++i) {
        meshlets_data.push_back(index_groups[i]);
    }

    meshlets.push(meshlet);
}
```

# Two Pass Culling

我们已经介绍了如何使用 Mesh Shader 构建高效的 Meshlet。现在，我们将探讨如何在 Vulkan 中基于 [SIGGRAPH 2015 "GPU-Driven Rendering Pipelines"](https://advances.realtimerendering.com/s2015/aaltonenhaar_siggraph2015_combined_final_footer_220dpi.pdf) 实现一个高效的基于 Meshlet 的双通道剔除管线。

## 整体管线架构

系统的核心思想是利用时域剔除 (temporal culling)，即借助前一帧的渲染结果来加速当前帧的剔除过程。具体来说，它主要复用前一帧的深度信息。这种方法虽然高效，但也可能引发一些问题，例如前一帧的遮挡物在当前帧移开时，会导致被遮挡的物体突然“闪现”(pop-in)。

为了在保证效率的同时规避这类瑕疵，管线设计了一个双通道架构来确保渲染的正确性。

整个渲染管线分为以下几个主要阶段：

1. 初步剔除与绘制列表生成

    * 输入: 场景中的所有物体列表，以及上一帧生成的深度金字塔 (Depth Pyramid)。
    * 处理: 在一个 Compute Shader 中，对场景里的每个物体进行初步的视锥剔除 (Frustum Culling) 和基于上一帧深度的遮挡剔除 (Occlusion Culling)。
    * 输出: 此阶段会生成两个列表：一个包含了“可能可见”物体的绘制指令 (DrawIndirect commands)，另一个是暂时被剔除的物体列表，留待后续检查。

2. 首次 Task/Mesh Shader 绘制

    * 处理: 使用第一阶段生成的“可能可见”物体绘制列表，执行 G-buffer 的主要绘制流程。在这一步的 Task Shader 中，还会对网格簇 (meshlet) 再次进行精细的视锥和遮挡剔除。
    * 输出: 生成当前帧的深度缓冲 (Depth Buffer)。

3. 生成当前帧的深度金字塔

    * 输入: 当前帧的深度缓冲。
    * 处理: 构建一个新的深度金字塔。
    * 输出: 一个可用于后续遮挡测试的深度金字塔纹理。

4. 二次剔除与修正绘制

    * 输入: 在第一阶段被剔除的物体列表，以及当前帧的深度金字塔。
    * 处理: 再次启动 Compute Shader，处理那些在第一阶段可能被错误剔除的物体（即“假阴性”或 False-Negatives）。这些物体由于使用的是过时的深度信息而被剔除，现在将使用当前帧精确的深度数据进行重新测试。
    * 输出: 一个需要补充绘制的物体指令列表。

5. 最终 Task/Mesh Shader 绘制

    * 处理: 执行上一阶段生成的补充绘制列表。
    * 输出: 经过修正和完善的最终 G-buffer。

该设计的巧妙之处在于，它将绝大部分（通常超过95%）的剔除工作交给了高效但允许少量错误的阶段一。然后，它通过阶段四和阶段五，仅针对那一小部分可能出错的物体进行精确的修正渲染。这种策略在性能和渲染质量之间取得了出色的平衡。


## 剔除并生成Draw指令

这是整个系统的核心，其目标是尽可能早、尽可能快地剔除掉大量不可见的物体。这个过程放在了一个Compute Shader中，每个着色器调用（Invocation）负责处理一个独立的物体实例。

```glsl
// COMPUTE_GPU_MESH_CULLING
// 每个工作组派发64个线程，每个线程处理一个物体实例
layout (local_size_x = 64, local_size_y = 1, local_size_z = 1) in;

void main() {
    uint mesh_instance_index = gl_GlobalInvocationID.x;
    // ... 边界检查 ...

    // 获取物体实例数据和包围球信息
    MeshDraw mesh_draw = mesh_draws[mesh_draw_index];
    vec4 bounding_sphere = mesh_bounds[mesh_draw_index];
    mat4 model = mesh_instance_draws[mesh_instance_index].model;

    // 将包围球从模型空间转换到世界空间和观察空间
    vec4 world_bounding_center = model * vec4(bounding_sphere.xyz, 1);
    vec4 view_bounding_center = world_to_camera * world_bounding_center;

    // 计算世界空间下的包围球半径
    float scale = length(model[0]);
    float radius = bounding_sphere.w * scale;

    // 1. 视锥剔除
    bool frustum_visible = true;
    for (uint i = 0; i < 6; ++i) {
        // 平面方程: dot(N, P) + D = 0。我们预先计算好平面法线指向视锥内部
        // dot(plane, point) > -radius 表示球体在平面的内侧或与平面相交
        frustum_visible = frustum_visible && (dot(frustum_planes[i], view_bounding_center) > -radius);
    }

    // 2. 遮挡剔除
    bool occlusion_visible = true;
    if (frustum_visible) {
        occlusion_visible = occlusion_cull(...); // 详细实现在下文
    }
    
    // 3. 生成绘制指令
    if (frustum_visible && occlusion_visible) {
        // ... 使用 atomicAdd 将该物体的绘制指令写入可见列表 ...
    } else {
        // ... 使用 atomicAdd 将该物体的ID写入被剔除列表，用于Pass 3重检 ...
    }
}
```

### 视锥剔除 (Frustum Culling)

视锥剔除是相对直接的步骤。我预先在CPU端计算好当前摄像机视锥的六个平面方程，并将其作为Uniform数据传入Shader。平面方程的形式为 $Ax + By + Cz + D = 0$，其中法线 $(A, B, C)$ 指向视锥内部。

剔除测试基于球体-平面相交检测。对于一个中心在 $C_{view}$、半径为 $r$ 的包围球（在观察空间下），它与一个平面 $P$ 的带符号距离为 $d = \vec{N} \cdot C_{view} + D$。

  * 如果 $d > r$，球体完全在平面内侧。
  * 如果 $d < -r$，球体完全在平面外侧（被剔除）。
  * 如果 $-r \le d \le r$，球体与平面相交。

为了保守起见，我们只剔除完全在视锥外的物体。因此，只要球体与所有六个平面都满足 $d > -r$ 的条件，它就被认为是视锥内可见的。

### 遮挡剔除 (Occlusion Culling)

遮挡剔除利用了上一帧的深度信息构建的层级Z缓冲（Hierarchical-Z Buffer），也即深度金字塔（Depth Pyramid）。

深度金字塔是一个Mipmap链，但它的每个层级存储的不是平均颜色，而是其覆盖的4个子像素（或上一层级纹素）中的最大深度值（最远深度）。这使得我们可以快速查询屏幕上一个区域内的“最远”遮挡物深度。

遮挡测试的逻辑如下：

1.  将物体的3D包围球投影到2D屏幕空间，得到一个2D包围盒（AABB）。
2.  根据该2D包围盒的大小，选择深度金字塔中合适的Mipmap层级进行采样。
3.  获取采样区域内的**最远遮挡物深度** $Z_{occluder}$。
4.  计算物体本身投影到屏幕后的**最近深度** $Z_{object}$。
5.  如果 $Z_{object} > Z_{occluder}$，意味着物体完全在已知遮挡物的后面，可以安全剔除。

#### 包围球投影与Mip层级选择

将3D球体精确投影为2D屏幕范围并非易事。我参照了 Michael Mara 和 Morgan McGuire 在2013年提出的方法，它能为透视投影下的球体计算出紧密的2D多边形边界，我们这里简化为AABB。

`project_sphere()` 函数实现了这个逻辑，它将观察空间下的球心 `C` 和半径 `r`，转换为屏幕UV空间的AABB `aabb`。

```glsl
// 2D Polyhedral Bounds of a Clipped, Perspective-Projected 3D Sphere. Michael Mara, Morgan McGuire. 2013
bool project_sphere(vec3 C, float r, float znear, float P00, float P11, out vec4 aabb) {
  // C.z 是观察空间深度，必须在近平面外
  if (C.z - r < znear) return false;

  // ... 复杂的数学变换，计算球体轮廓线投影后的边界 ...
  // P00 和 P11 是投影矩阵的 [0][0] 和 [1][1] 项

  aabb = vec4(minx.x / minx.y * P00, miny.x / miny.y * P11, maxx.x / maxx.y * P00, maxy.x / maxy.y * P11);
  // 将裁剪空间坐标 [-1, 1] 转换为 UV 空间 [0, 1]
  aabb = aabb.xwzy * vec4(0.5f, -0.5f, 0.5f, -0.5f) + vec4(0.5f);

  return true;
}
```

得到屏幕空间的 `aabb` 后，我们可以计算其宽高，并使用 `log2` 来选择一个能大致覆盖此区域的Mipmap层级。这避免了在高分辨率深度图上进行大量采样的开销。

`occlusion_cull()` 中的Mip层级选择：

```glsl
// ... in occlusion_cull()
ivec2 depth_pyramid_size = textureSize(depth_pyramid_texture, 0);
float width = (aabb.z - aabb.x) * depth_pyramid_size.x;
float height = (aabb.w - aabb.y) * depth_pyramid_size.y;

// 选择能覆盖AABB的最粗糙（但足够精细）的Mip层级
float level = floor(log2(max(width, height)));
```

#### 深度比较

选定Mip层级后，我们在该层级上进行采样。为了提高准确性，我不仅采样了AABB的中心点，还采样了四个角点，并取其中的最大值作为最可靠的遮挡深度 $Z_{occluder}$。

```glsl
// ... in occlusion_cull()
// 采样器设置为 MAX reduction，所以一次采样即可得到区域最大深度
vec2 uv = (aabb.xy + aabb.zw) * 0.5;
float depth = textureLod(depth_pyramid_texture, uv, level).r;
// ... (采样角点并取最大值)
```

接下来，计算物体自身的最近深度。这个深度点是包围球表面上离摄像机最近的点。该点可以通过从球心沿“球心到摄像机”方向的反方向移动一个半径的距离得到。

```glsl
// ... in occlusion_cull()
// 计算球体表面最靠近相机的点的深度
vec3 dir = normalize(camera_world_position - world_bounding_center.xyz);
vec4 sceen_space_center_last = culling_view_projection * vec4(world_bounding_center + dir * radius, 1.0);
float depth_sphere = sceen_space_center_last.z / sceen_space_center_last.w;
```

最后进行关键的比较：

```glsl
// ... in occlusion_cull()
// 如果物体最近点的深度大于（远于）采样区域的最远遮挡物深度，则被遮挡
occlusion_visible = (depth_sphere <= depth);
```

这里的 `depth` 是上一帧的 $Z_{occluder}$，`depth_sphere` 是上一帧的 $Z_{object}$。如果 $Z_{object} \le Z_{occluder}$，则物体不被上一帧的深度所遮挡，判定为可见。

第二次剔除则使用当前帧的深度。

### 原子操作生成绘制列表

当一个物体通过了所有剔除测试后，我们需要将其加入到本帧的绘制列表中。在GPU上并行执行此操作，必须使用原子操作 (Atomic Operations) 来避免竞争条件。

我使用一个 `atomicAdd` 指令来安全地递增一个计数器，该计数器作为索引，将当前可见物体的绘制参数写入到一个SSBO（Shader Storage Buffer Object）中。这个SSBO的结构与Vulkan的 `VkDrawMeshTasksIndirectCommandNV` 完全匹配，可以直接用于后续的 `vkCmdDrawMeshTasksIndirectNV` 调用。

```glsl
// ... in main()
if (frustum_visible && occlusion_visible) {
    // 为不透明物体列表申请一个索引
    uint draw_index = atomicAdd(opaque_mesh_visible_count, 1);
    
    // 填充间接绘制指令
    draw_commands[draw_index].drawId = mesh_instance_index; // 传递实例ID
    // ... (填充 taskCount, firstTask 等)
} else if (late_flag == 0) { // late_flag=0表示这是第一次剔除
    // 将被剔除的物体加入到“待重检”列表
    uint draw_index = atomicAdd(opaque_mesh_culled_count, 1);
    draw_late_commands[draw_index].drawId = mesh_instance_index;
}
```

通过这种方式，整个剔除和绘制指令生成过程无需任何CPU干预，也无需GPU到CPU的数据回读，实现了真正高效的GPU驱动管线。

## Task Shader and Mesh Shader

  * **输入**：由第一阶段 Compute Shader 生成的、包含“可能可见”物体的间接绘制指令列表 (`DrawIndirect commands`)。同时，也接收上一帧生成的深度金字塔（Depth Pyramid）用于遮挡测试。
  * **处理**：
      * **Task Shader**：每个 Task Shader 工作组 (Workgroup) 负责处理一个或多个 Meshlet。它首先对每个 Meshlet 的包围体（通常是包围球）进行视锥剔除和遮挡剔除。然后，它会动态计算出有多少 Meshlet 通过了测试，并将这些可见的 Meshlet 索引传递给其对应的 Mesh Shader 工作组。
      * **Mesh Shader**：Mesh Shader 只为那些由 Task Shader 确认可见的 Meshlet 生成顶点和图元。它从 Buffer 中读取顶点数据，进行模型-视图-投影变换，并输出最终的三角形图元给光栅化器。
  * **输出**：当前帧的 G-buffer（包含深度、法线、颜色等信息）。其中，深度缓冲将被用于构建当前帧的深度金字塔，为第四阶段的二次剔除做准备。

### Task Shader

Task Shader 是剔除逻辑的核心。它像一个调度员，决定了哪些 Meshlet 值得后续的 Mesh Shader 去处理。让我们逐段分析代码。

```glsl
layout(local_size_x = 32, local_size_y = 1, local_size_z = 1) in;

// ... Buffer Definitions ...

out taskNV block
{
    uint meshlet_indices[32]; // 输出给 Mesh Shader 的共享数据
};

void main()
{
    // 索引计算
    uint task_index = gl_LocalInvocationID.x;
    uint meshlet_group_index = gl_WorkGroupID.x;
    uint global_meshlet_index = meshlet_group_index * 32 + task_index;

    // ... 获取模型矩阵等实例数据 ...
    mat4 model = mesh_instance_draws[mesh_instance_index].model;

    // Meshlet 包围体变换
    vec4 world_center = model * vec4(meshlets[global_meshlet_index].center, 1);
    float scale = length(model[0]);
    float radius = meshlets[global_meshlet_index].radius * scale * 1.1; // 稍微放大包围球，避免精度问题

    // ... 背面剔除 (Cone Culling) ...
    
    bool accept = false;
    vec4 view_center = world_to_camera_debug * world_center;

    // 视锥剔除
    bool frustum_visible = true;
    for (uint i = 0; i < 6; ++i) {
        frustum_visible = frustum_visible && (dot(frustum_planes[i], view_center) > -radius);
    }

    // ... 遮挡剔除... 

    uvec4 ballot = subgroupBallot(accept);

    uint index = subgroupBallotExclusiveBitCount(ballot);

    if (accept)
        meshlet_indices[index] = global_meshlet_index;

    uint count = subgroupBallotBitCount(ballot);

    if (task_index == 0)
        gl_TaskCountNV = count;
```

#### Cone Culling

在传统的渲染管线中，背面剔除（Backface Culling）通常发生在光栅化阶段，由硬件对逐个三角形进行。然而，在以 Meshlet 为单位的渲染管线中，我们有机会在更早的 Task Shader 阶段，对一整个网格簇（Meshlet）进行剔除。

**核心思想**：一个 Meshlet 是由一组朝向大致相同的三角形构成的。我们可以计算出这些三角形法线的平均方向，并构建一个能够包裹所有法线的“锥体”（Cone）。如果摄像机位于这个锥体的“背面”，那么这个 Meshlet 内的所有三角形都将是不可见的，可以被安全地剔除。

```c++
// As described in meshoptimizer.h
bool coneCull(vec3 center, float radius, vec3 cone_axis, float cone_cutoff, vec3 camera_position) {
  return dot(center - camera_position, cone_axis) >=
         cone_cutoff * length(center - camera_position) + radius;
}
```
这个函数返回 `true` 代表“应该被剔除”，`false` 代表“可能可见”。

  * `vec3 center`: Meshlet 的包围球中心点（世界空间）。
  * `float radius`: Meshlet 的包围球半径。
  * `vec3 cone_axis`: 锥体的中心轴，通常是 Meshlet 内所有三角形法线的平均值，并且是单位向量。它代表了整个 Meshlet 的“平均朝向”。
  * `float cone_cutoff`: 锥体张角的余弦值。它定义了锥体的“胖瘦”。`cone_cutoff = cos(α)`，其中 `α` 是锥体轴与锥体表面之间的夹角（锥体的半角）。该值在预处理阶段生成，与 `cone_axis` 一同存储。
  * `vec3 camera_position`: 摄像机的位置（世界空间）。

让我们来拆解这个不等式，理解其几何意义。

`dot(center - camera_position, cone_axis) >= cone_cutoff * length(center - camera_position) + radius;`

为方便理解，我们定义几个向量和变量：

  * 视角向量 $\vec{V} = \text{center} - \text{camera\_position}$，即从摄像机指向 Meshlet 中心的向量。
  * 锥体轴向量 $\vec{A} = \text{cone\_axis}$ (单位向量)。
  * 锥体张角余弦值 $k = \text{cone\_cutoff}$。
  * 包围球半径 $r = \text{radius}$。

于是，公式可以写作：
$$\vec{V} \cdot \vec{A} \ge k \cdot ||\vec{V}|| + r$$

我们可以分两步来理解它：

**第一步：基础点对象的锥体测试**

首先忽略半径 `r`，我们来看 `dot(V, A) >= k * ||V||`。
根据点积的定义，我们知道 $\vec{V} \cdot \vec{A} = ||\vec{V}|| \cdot ||\vec{A}|| \cdot \cos(\theta)$，其中 $\theta$ 是视角向量 $\vec{V}$ 和锥体轴 $\vec{A}$ 之间的夹角。

因为 $\vec{A}$ 是单位向量（$||\vec{A}|| = 1$），所以公式简化为：
$$||\vec{V}|| \cdot \cos(\theta) \ge k \cdot ||\vec{V}||$$
两边同时除以 $||\vec{V}||$（一个正数），得到：
$$\cos(\theta) \ge k$$
又因为我们之前定义了 $k = \cos(\alpha)$，所以：
$$\cos(\theta) \ge \cos(\alpha)$$
由于余弦函数在 $[0, \pi]$ 区间是单调递减的，这个不等式等价于：
$$\theta \le \alpha$$

**几何意义**：这个不等式判断了视角向量 $\vec{V}$ 是否在锥体内部。如果夹角 $\theta$ 小于或等于锥体的半角 $\alpha$，意味着摄像机正对着锥体的“正面”，Meshlet 可能是可见的。反之，如果 $\theta > \alpha$ (即 $\cos(\theta) < k$)，则意味着摄像机在锥体的“背面”，Meshlet 是不可见的。

因此，`dot(V, A) < k * ||V||` 是剔除条件。我们的代码使用了 `>=`，这意味着它判断的是“**不剔除**”的对立面，也就是“**剔除**”。

**第二步：考虑包围球的保守测试**

现在，我们把半径 `r` 加回来：
$$ \vec{V} \cdot \vec{A} \ge k \cdot ||\vec{V}|| + r $$

为什么要加上这个 `r`？

因为基础的锥体测试是针对一个**点**（Meshlet 的中心 `center`）进行的。但 Meshlet 是一个有体积的物体，由一个半径为 `r` 的包围球所包裹。

如上图所示，即使 Meshlet 的中心点 `C` 根据基础锥体测试判断应该被剔除（即摄像机 `P` 在剔除区域），但由于 Meshlet 自身有半径，它的边缘（点 `E`）仍然可能延伸到可见区域内。直接剔除会导致视觉错误。

`+ r` 这一项就是为了解决这个问题。它是一个**保守的补偿项**。它通过在不等式的右侧增加一个正值，使得不等式更难成立。换句话说，它**收缩了剔除区域**，扩大了“安全区域”（不被剔除的区域），确保只有当整个包围球都完全处于锥体背面时，剔除才会发生。这是一种用略微降低剔除率来换取绝对渲染正确性的经典策略。


#### Subgroup 操作与动态任务分发

  * **原理**：Task Shader 以工作组（Workgroup）为单位执行，一个工作组通常包含多个线程（例如这里的32个）。我们需要一种高效的方式来汇总组内所有线程的剔除结果。Vulkan 中的 Subgroup (在 CUDA 中称为 Warp) 操作提供了硬件级别的支持。
  * **代码实现**：
      * `subgroupBallot(accept)`: 这是核心。它会收集当前 Subgroup 中所有线程的 `accept` 布尔值，并生成一个位掩码（`uvec4 ballot`）。如果第 N 个线程的 `accept` 为 `true`，那么结果位掩码的第 N 位就为 1。
      * `subgroupBallotBitCount(ballot)`: 计算位掩码中为 1 的位的数量，即通过剔除测试的 Meshlet 数量。
      * `subgroupBallotExclusiveBitCount(ballot)`: 计算在当前线程之前，有多少个线程的 `accept` 为 `true`。这个结果可以完美地用作写入共享数组 `meshlet_indices` 的本地索引，实现了一个无冲突的并行数据压缩。
      * `gl_TaskCountNV = count`: 最后，工作组的第一个线程 (lane 0) 将可见的 Meshlet 总数写入 `gl_TaskCountNV`。GPU 会根据这个值，启动相应数量的 Mesh Shader 工作组。如果 `count` 为 0，则不会启动任何 Mesh Shader。

### Mesh Shader

只有在 Task Shader 判定有可见的 Meshlet 时，Mesh Shader 才会被启动。它的任务很简单：根据传入的 Meshlet 索引，生成最终的顶点和图元。

```glsl
layout(local_size_x = 32, local_size_y = 1, local_size_z = 1) in;
layout(triangles, max_vertices = 64, max_primitives = 124) out;

// ... Buffer Definitions ...

in taskNV block
{
    uint meshlet_indices[32]; // 从 Task Shader 接收的共享数据
};

// ... Output Vertex Attributes ...

void main()
{
    // 1. 获取 Meshlet 索引
    uint task_index = gl_LocalInvocationID.x;
    // 注意：这里 gl_WorkGroupID.x 不再是 Meshlet 组索引，而是可见 Meshlet 的索引
    uint global_meshlet_index = meshlet_indices[gl_WorkGroupID.x];

    // 2. 解压 Meshlet 数据
    Meshlet meshlet = meshlets[global_meshlet_index];
    uint vertex_count = uint(meshlet.vertex_count);
    uint triangle_count = uint(meshlet.triangle_count);
    uint data_offset = meshlet.data_offset;
    uint vertexOffset = data_offset;
    uint indexOffset = data_offset + vertex_count;

    // ... 获取模型矩阵 ...
    mat4 model = mesh_instance_draws[mesh_instance_index].model;

    // 3. 顶点处理 (并行)
    // 每个线程处理一部分顶点
    for (uint i = task_index; i < vertex_count; i += 32)
    {
        uint vi = meshletData[vertexOffset + i]; // 获取局部顶点索引
        vec3 position = ...; // 从 Buffer 中读取顶点位置

        // ... 法线、切线等属性的解压和变换 ...

        // 核心：顶点变换
        gl_MeshVerticesNV[i].gl_Position = view_projection * (model * vec4(position, 1));

        // ... 设置其他输出给片元着色器的 varying 变量 ...
    }

    // 4. 索引处理 (并行)
    uint indexGroupCount = (indexCount + 3) / 4; // 索引被打包存储
    for (uint i = task_index; i < indexGroupCount; i += 32)
    {
        // 高效的索引解包函数
        writePackedPrimitiveIndices4x8NV(i * 4, meshletData[indexOffset + i]);
    }

    // 5. 设置图元数量
    if (task_index == 0)
        gl_PrimitiveCountNV = triangle_count;
}
```

#### 并行顶点生成与图元装配

  * **并行处理**：Mesh Shader 的一个工作组（`local_size_x = 32`）共同负责一个 Meshlet 的绘制。工作组内的线程并行处理顶点和索引。代码中的 `for (uint i = task_index; i < vertex_count; i += 32)` 循环就是一个典型的并行处理模式，每个线程以 32 为步长处理顶点数组中的一部分数据。
  * **数据解压**：顶点属性（法线、切线）和索引通常会经过压缩存储（例如，法线用8位整数表示，索引打包到一个 `uint` 中）以减少显存占用和带宽。在 Mesh Shader 中，这些数据被实时解压。`i8_inverse = 1.0 / 127.0` 就是用于将 8 位有符号整数还原为 `[-1, 1]` 范围的浮点数。
  * **图元输出**：
      * `gl_MeshVerticesNV`：这是一个内置的输出数组，用于存放变换后的顶点数据。
      * `gl_PrimitiveCountNV`：设置当前 Meshlet 包含的图元（三角形）数量。
      * `writePackedPrimitiveIndices4x8NV()`：这是一个 NVidia 扩展提供的函数，用于高效地从一个 32 位整数中解压出四个 8 位的局部顶点索引。

#### PrimitiveIndices

简单来说，`PrimitiveIndices` 指的是**定义图元（在这里是三角形）的局部顶点索引 (Local Vertex Indices)**。

在传统的渲染管线（Vertex Shader）中，我们有一个全局的顶点缓冲区（Vertex Buffer）和一个全局的索引缓冲区（Index Buffer）。索引缓冲区中的每个数字都是一个**全局顶点索引**，它直接指向全局顶点缓冲区中的一个顶点。

然而，在 Mesh Shader 的世界里，数据被组织成了更小的块，也就是 **网格簇（Meshlet）**。每个 Meshlet 包含：

1.  **一小部分顶点** (例如，最多64个顶点)。
2.  **一小部分图元** (例如，最多124个三角形)，这些图元完全由上述的这些顶点构成。

这里的 `PrimitiveIndices` 就是用来定义这些图元的索引列表。它的关键特性是：

  * **它是局部的 (Local)**：这些索引指向的是**当前 Meshlet 自带的顶点列表**，而不是整个模型的全局顶点列表。如果一个 Meshlet 有64个顶点，那么它的 `PrimitiveIndices` 的值范围就在 `[0, 63]` 之间。
  * **它定义了连接关系**：和传统的索引一样，它的作用是告诉 GPU 如何将顶点连接起来形成三角形。一个三角形由三个索引构成。

```glsl
writePackedPrimitiveIndices4x8NV(i * 4, meshletData[indexOffset + i]);
```

1.  **`meshletData[indexOffset + i]`**: 这是一个 `uint` 类型的值（32位）。它从一个名为 `MeshletData` 的大缓冲区中被读取。这个 `uint` 并不是一个索引，而是**包含了多个索引的压缩包**。

2.  **Packed (压缩)**: 因为每个局部顶点索引通常很小（例如，一个 Meshlet 最多64或128个顶点，用一个8位的 `uchar` 就足够表示了），为了节省显存和带宽，我们会把多个局部索引“塞进”一个更大的数据类型里。在这里，一个32位的 `uint` 被用来存储 **4个** 8位的局部顶点索引。

3.  **`writePackedPrimitiveIndices4x8NV`**: 这是一个由 NVIDIA 扩展提供的、高度优化的 Mesh Shader 内置函数。它的作用是：

      * 接收一个压缩好的 `uint` 值。
      * 在硬件内部高效地将其解包（Unpack），得到4个8位的局部顶点索引。
      * 将这些索引添加到图元流中。GPU 会根据 `layout(triangles)` 的设置，将这些索引三个一组，自动装配成三角形。


| | 传统的 Index Buffer | Mesh Shader 的 PrimitiveIndices |
| :--- | :--- | :--- |
| **指的是** | 全局顶点索引 (Global Vertex Index) | **局部顶点索引 (Local Vertex Index)** |
| **指向** | 整个模型的全局顶点缓冲区 | **当前 Meshlet 自己的那一小部分顶点** |
| **数值范围** | `[0, 总顶点数 - 1]` (可能很大) | `[0, Meshlet内顶点数 - 1]` (通常很小, 如 `[0, 63]`) |
| **作用** | 定义如何连接全局顶点来组成三角形 | 定义如何连接**局部**顶点来组成三角形 |

所以，`PrimitiveIndices` 可以理解为：“**一个定义了如何将当前 Meshlet 的内部顶点连接成三角形的、经过压缩的局部索引列表。**”


## 深度金字塔

深度金字塔本质上是场景深度缓冲（Depth Buffer）的一个Mipmap链。但它与普通的Mipmap不同：普通Mipmap通常对颜色值进行平均，而深度金字塔的每个像素存储的是其对应到上一级更高分辨率纹理中**2x2区域内最远（最大）的深度值**。

这个特性让它成为遮挡查询的利器。当测试一个物体的包围盒（Bounding Box）是否被遮挡时，我们只需将包围盒投影到屏幕空间，然后在深度金字塔的某个Mipmap层级进行采样。如果包围盒的**最近**深度值大于采样到的**最远**深度值，那么这个包围盒所代表的物体一定被完全遮挡。我们可以在较低分辨率的层级上进行测试，极大地降低了采样和计算开销。

### 资源创建与设置

在生成金字塔之前，我们必须先在GPU上分配好所需的资源。这包括多级Mipmap的纹理、每个Mipmap层级的视图（View）以及用于数据绑定的描述符集（Descriptor Set）。

```cpp
// 资源创建
void DepthPyramidPass::create_depth_pyramid_resource(Texture* depth_texture) {
    u32 width = depth_texture->width / 2;
    u32 height = depth_texture->height / 2;

    // 1. 计算金字塔层数
    depth_pyramid_levels = 0;
    while (width >= 2 && height >= 2) {
        depth_pyramid_levels++;
        width /= 2;
        height /= 2;
    }

    // 2. 创建一个带有多级 Mipmap 的纹理
    TextureCreation depth_hierarchy_creation{};
    depth_hierarchy_creation.set_format_type(VK_FORMAT_R32_SFLOAT, TextureType::Enum::Texture2D)
        .set_flags(TextureFlags::Compute_mask) // 标记为可用于Compute Shader读写
        .set_size(depth_texture->width / 2, depth_texture->height / 2, 1)
        .set_name("depth_hierarchy")
        .set_mips(depth_pyramid_levels); // 指定 Mipmap 层数
    depth_pyramid = gpu.create_texture(depth_hierarchy_creation);

    // ...

    // 3. 为每一层 Mipmap 创建独立的视图和描述符集
    for (u32 i = 0; i < depth_pyramid_levels; ++i) {
        // 创建指向特定 Mip 层的视图
        depth_pyramid_view_creation.sub_resource.mip_base_level = i;
        depth_pyramid_views[i] = gpu.create_texture_view(depth_pyramid_view_creation);

        // 绑定输入和输出纹理
        if (i == 0) { // 第一层：输入是原始深度图
            descriptor_set_creation.reset()
                .texture(depth_texture->handle, 0) // binding 0: src
                .texture(depth_pyramid_views[i], 1) // binding 1: dst
                .set_layout(depth_pyramid_layout);
        } else { // 后续层：输入是上一级 Mip
            descriptor_set_creation.reset()
                .texture(depth_pyramid_views[i - 1], 0) // binding 0: src
                .texture(depth_pyramid_views[i], 1)     // binding 1: dst
                .set_layout(depth_pyramid_layout);
        }
        depth_hierarchy_descriptor_set[i] = gpu.create_descriptor_set(descriptor_set_creation);
    }
}
```

1.  **计算层数**: 代码通过不断将分辨率减半来确定金字塔需要多少个Mipmap层级，直到尺寸过小为止。
2.  **创建纹理**: 创建了一个`R32_SFLOAT`格式的2D纹理，这是存储高精度深度值的标准格式。`Compute_mask`（在Vulkan中对应`VK_IMAGE_USAGE_STORAGE_BIT`）是关键，它允许我们在Compute Shader中通过`imageStore`直接写入纹理的特定像素。
3.  **视图与描述符**: 这是现代图形API（如Vulkan）的核心。我们不能直接将整个带Mipmap的纹理作为写入目标。相反，我们为**每一层Mipmap**创建一个独立的`ImageView`。在每一轮的降采样（downsampling）中，我们将上一层的视图作为输入（`src`），当前层的视图作为输出（`dst`），并将它们绑定到一个描述符集中，以便在Shader中访问。

### 降采样与最大值合并

这是深度金字塔构建的算法核心。一个Compute Shader被派发来执行这个任务，它并行处理所有像素。

```glsl
layout(set = MATERIAL_SET, binding = 0) uniform sampler2D src;
layout(set = MATERIAL_SET, binding = 1) uniform writeonly image2D dst;

layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // 1. 计算当前线程ID对应的输出纹理坐标
    ivec2 out_coords = ivec2(gl_GlobalInvocationID.xy);
    
    // 2. 计算在源纹理（大一倍）中对应的 2x2 像素区域的左上角坐标
    ivec2 texel_position00 = out_coords * 2;

    // 3. 采样 2x2 区域的四个深度值
    float d00 = texelFetch( src, texel_position00, 0 ).r;
    float d01 = texelFetch( src, texel_position00 + ivec2(0, 1), 0 ).r;
    float d10 = texelFetch( src, texel_position00 + ivec2(1, 0), 0 ).r;
    float d11 = texelFetch( src, texel_position00 + ivec2(1, 1), 0 ).r;

    // 4. 找出四个深度值中的最大值
    float result = max(max(d00, d01), max(d10, d11));

    // 5. 将最大值写入目标纹理的对应位置
    imageStore( dst, out_coords, vec4(result, 0, 0, 0) );
}
```

* **`texelFetch` vs. `texture`**: 这里使用`texelFetch`而不是`texture`，因为它允许我们使用精确的整数坐标来获取未经任何过滤（如线性插值）的原始像素值，这对于保留精确的深度信息至关重要。
* 一些现代GPU和API（如Vulkan的`VK_SAMPLER_REDUCTION_MODE_MAX`）提供了硬件级别的最大值/最小值缩减采样器。如果使用这种采样器，`texture()`函数就可以在硬件层面自动完成上述的4次`texelFetch`和`max`操作，从而使Shader更简洁，性能也可能更高。

### 执行与同步

最后，我们需要一个循环来驱动整个金字塔的生成过程，并确保每一步操作的顺序正确，避免数据竞争（Data Hazard）。

```cpp

// 确保原始深度图可以作为Shader资源被读取
util_add_image_barrier(gpu, gpu_commands->vk_command_buffer, depth_texture,
                       RESOURCE_STATE_SHADER_RESOURCE, 0, 1, true);

// 循环生成每一层 Mipmap
for (u32 mip_index = 0; mip_index < depth_pyramid_texture->mip_level_count; ++mip_index) {
    // 1. 内存屏障：转换当前 Mip 层的布局，准备写入
    util_add_image_barrier(gpu, ..., RESOURCE_STATE_UNDEFINED, RESOURCE_STATE_UNORDERED_ACCESS, mip_index, ...);

    // 2. 绑定当前层对应的描述符集 (包含了输入和输出)
    gpu_commands->bind_descriptor_set(&depth_hierarchy_descriptor_set[mip_index], 1, nullptr, 0);

    // 3. 派发 Compute Shader
    u32 group_x = (width + 7) / 8; // (width / 8)向上取整
    u32 group_y = (height + 7) / 8; // (height / 8)向上取整
    gpu_commands->dispatch(group_x, group_y, 1);

    // 4. 内存屏障：转换当前 Mip 层的布局，确保写入完成，并准备好在下一轮作为输入被读取
    util_add_image_barrier(gpu, ..., RESOURCE_STATE_UNORDERED_ACCESS, RESOURCE_STATE_SHADER_RESOURCE, mip_index, ...);

    width /= 2;
    height /= 2;
}
```

# Improved Culling for Tiled and Clustered Rendering

在现代实时渲染中，如何高效地处理成百上千个动态光源，始终是一个核心挑战。无论是华丽的爆炸效果、闪烁的霓虹灯，还是角色身上复杂的环境反射，都离不开大量光源的支撑。然而，传统的光照计算方法在面对“灯海”时，往往会力不从心。

这正是 **Tiled Shading** (分块着色) 和 **Clustered Shading** (集群着色) 等现代渲染技术大显身手的地方。动视（Activision）在 SIGGRAPH 2017 上提出的混合技术——[SIGGRAPH 2017: Improved Culling for Tiled and Clustered Rendering](https://www.activision.com/cdn/research/2017_Sig_Improved_Culling_final.pdf)。它巧妙地结合了两种方法的优点，为海量光源下的实时渲染提供了一套极其高效的解决方案。

要理解这项技术的巧妙之处，我们首先需要回顾一下传统方法的局限性：

  * **Forward Rendering (前向渲染):** 这是最经典的方法。每个物体在绘制时，都需要遍历所有可能影响它的光源。当光源数量 N 和物体数量 M 都很大时，计算成本会以 $O(N \times M)$ 的级别暴增，性能开销难以承受。
  * **Classic Deferred Shading (经典延迟着色):** 该方法将光照计算推迟到所有物体都绘制到 G-Buffer (几何缓冲) 之后。它通过在屏幕空间对每个像素进行光照计算来解决 $O(N \times M)$ 的问题。但当光源数量巨大时，每个像素依然需要遍历所有光源，计算量依然庞大。此外，G-Buffer 本身也需要巨大的显存带宽。

为了突破这些瓶颈，渲染工程师们将目光投向了将计算任务“分而治之”的思路。

## 分块 (Tiled) 与集群 (Clustered)

**分块着色 (Tiled Shading)** 将屏幕划分为一个个 2D 网格（Tiles）。它预先计算出每个 Tile 可能受哪些光源影响，并将这个光源列表存储起来。在最终着色时，一个片元（Fragment）只需要检查其所在 Tile 的光源列表即可，大大减少了需要遍历的光源数量。

**集群着色 (Clustered Shading)** 则在 2D 的基础上增加了一个维度：**深度**。它将摄像机的视锥体（View Frustum）划分为一个 3D 网格（Clusters）。这样，剔除光源时不仅考虑了它们在屏幕上的位置，还考虑了它们的远近。这使得光源剔除更加精准，尤其是在场景深度复杂的情况下。

## Activision 的改进方案

动视提出的这项技术，可以说是对上述两种思想的精炼与融合。它既利用了集群着色的深度信息，又保留了分块着色在屏幕空间的简洁性，形成了一套高效的混合剔除系统。

其核心算法流程如下：

1.  **光源排序 (Light Sorting):** 首先，在**相机空间 (Camera Space)** 中，将所有光源根据深度进行排序。这一步是后续高效索引的基础。

2.  **Z轴分箱 (Z-Binning):** 接下来，算法并不会构建一个完整的 3D 网格，而是巧妙地将视锥体的深度（Z轴）划分为若干个“箱子”（Bins）。这些箱子可以是均匀划分的，也可以是**对数 (Logarithmic)** 划分的，以提高近处场景的精度。然后，根据每个光源的包围体（Bounding Volume）所覆盖的深度范围，将其分配到一个或多个 Z-bin 中。

3.  **箱体索引 (Bin Indexing):** 由于第一步已经对光源进行了排序，我们不需要在每个 Z-bin 中存储一个完整的光源列表。取而代之的是，我们只需为每个 bin 存储一个**最小和最大光源索引 (min/max light indices)**。这两个索引指向已排序的全局光源列表中的一个连续片段。这个设计极为节省内存，通常每个 bin 只需要 16 位（除非光源总数超过 65536 个）。

4.  **屏幕分块 (Tile Division):** 同时，屏幕空间被划分为许多小的 **8×8 像素的瓦片 (Tiles)**。对于每个 Tile，系统会计算出一个**位掩码 (Bitfield)**。这个位掩码的每一位对应一个光源，如果某个光源的包围体在屏幕上与该 Tile 有重叠，则其对应的位被设置为 1。

5.  **最终光照查找 (Final Light Lookup):** 当进入片元着色器（Fragment Shader）准备为某个像素着色时，魔法就发生了：

      * GPU 首先获取当前片元的**深度值**，并以此确定它属于哪个 **Z-bin**。
      * 通过 Z-bin 的索引，GPU 可以立刻得到一个可能影响该片元的光源索引范围 (`min_light_index`, `max_light_index`)。
      * 同时，GPU 根据片元的屏幕坐标确定其所在的 **Tile**，并获取该 Tile 的**光照位掩码**。
      * 最后，着色器只需遍历从 Z-bin 中获取的那个**小范围**内的光源。对于这个范围内的每一个光源，它会通过位运算检查其在 Tile 位掩码中对应的位是否为 1。

只有同时满足**深度范围正确**（来自 Z-bin）和**屏幕范围重叠**（来自 Tile Bitmask）这两个条件的光源，才是最终需要进行光照计算的有效光源。

### CPU端 Light Culling 准备

在上一篇文章中，我们介绍了动视这套混合剔除技术的理论：结合 **Z轴分箱 (Z-Binning)** 和 **屏幕分块 (Tiled)** 来高效确定光源列表。现在，我们将通过分析其 CPU 端的准备代码，来理解这套系统是如何构建其核心数据结构（Data Structures）的。

这个过程主要分为两大步：

1.  **构建Z轴分箱查找表 (Z-Bin LUT):** 为每个深度“切片”生成一个包含潜在光源的索引范围。
2.  **构建屏幕分块位掩码 (Tile Bitmask):** 为每个屏幕“瓦片”生成一个位图，标记哪些光源与其重叠。


#### 构建Z轴分箱查找表 (Z-Bin LUT)

这是整个流程的第一步，旨在将已按深度排序的光源分配到不同的深度区间（Z-Bins）中，并为每个区间生成一个紧凑的光源索引。

##### 为每个光源计算其覆盖的Z-Bin范围

首先，代码遍历所有已经排好序的光源，计算每个光源的包围球（Bounding Sphere）在深度上覆盖了哪些 Z-Bin。

```cpp
// It might be better to use logarithmic slices to have better resolution
// closer to the camera.
const f32 bin_size = 1.0f / k_light_z_bins;

Array<u32> bin_range_per_light;
bin_range_per_light.init(context.scratch_allocator, active_lights, active_lights);

for (u32 i = 0; i < active_lights; ++i) {
    const SortedLight& light = sorted_lights[i];

    // 跳过完全在摄像机背后的光源
    if (light.projected_z_min < 0.0f && light.projected_z_max < 0.0f) {
        bin_range_per_light[i] = u32_max;
        continue;
    }

    // 计算光源覆盖的最小和最大 Z-Bin 索引
    // projected_z_min/max 已经是归一化到 [0, 1] 的深度值
    const u32 min_bin = hydra::max(0, hydra::floori32(light.projected_z_min * k_light_z_bins));
    const u32 max_bin = hydra::max(0, hydra::ceili32(light.projected_z_max * k_light_z_bins));

    // 将 min_bin 和 max_bin 打包到一个 u32 中
    bin_range_per_light[i] = (min_bin & 0xffff) | ((max_bin & 0xffff) << 16);
}
```

  * `projected_z_min` 和 `projected_z_max` 是光源包围球在相机空间下，经过投影变换后归一化到 `[0, 1]` 区间的最小和最大深度值。`0` 代表近平面（Near Plane），`1` 代表远平面（Far Plane）。
  * 通过将归一化深度乘以总的 Bin 数量 `k_light_z_bins`，我们可以得到该深度对应的 Bin 索引。这里使用 `floor` 和 `ceil` 函数是为了确保能覆盖到光源包围球所接触到的所有 Bin。
  * 位打包：`(min_bin & 0xffff) | ((max_bin & 0xffff) << 16)`。它将两个 16 位的索引（`min_bin` 和 `max_bin`）合并存储到一个 32 位的整数中。这是一种常见的内存优化技巧，避免了为每个光源定义一个复杂的结构体。

经过这个循环，我们得到了一个临时数组 `bin_range_per_light`，它记录了每个光源所影响的深度区间。

##### 为每个Bin计算其包含的光源索引范围

接下来，代码反过来遍历每一个 Z-Bin，并根据上一步的结果，找出影响该 Bin 的所有光源，并记录下它们在已排序光源列表中的最小和最大索引。

```cpp
for (u32 bin = 0; bin < k_light_z_bins; ++bin) {
    u32 min_light_id = k_num_lights + 1; // 初始为一个无效的最大值
    u32 max_light_id = 0;               // 初始为一个无效的最小值

    for (u32 i = 0; i < active_lights; ++i) {
        const u32 light_bins = bin_range_per_light[i];
        if (light_bins == u32_max) {
            continue;
        }

        // 从 u32 中解包出 min_bin 和 max_bin
        const u32 min_bin = light_bins & 0xffff;
        const u32 max_bin = light_bins >> 16;

        // 检查当前光源是否覆盖了当前正在处理的 bin
        if (bin >= min_bin && bin <= max_bin) {
            // 如果是，更新这个 bin 所见光源的最小和最大索引
            if (i < min_light_id) {
                min_light_id = i;
            }
            if (i > max_light_id) {
                max_light_id = i;
            }
        }
    }

    // 将这个 bin 的光源索引范围打包并存入最终的 LUT
    lights_lut[bin] = min_light_id | (max_light_id << 16);
}
```

**技术细节解析:**

  * 外层循环遍历所有 Z-Bin。
  * 内层循环遍历所有光源，检查光源的 `[min_bin, max_bin]` 范围是否包含了当前的 `bin`。
  * 如果包含，就用该光源的索引 `i` 来更新 `min_light_id` 和 `max_light_id`。
  * **核心优势**：由于所有光源已经预先按深度排序，因此对于任何一个 Z-Bin，影响它的所有光源在 `sorted_lights` 数组中必然形成一个**连续的块**。因此，我们只需要存储这个连续块的起始和结束索引即可。这正是 `min_light_id` 和 `max_light_id` 的含义。
  * 最后，和之前一样，将 `min_light_id` 和 `max_light_id` 打包进一个 `u32`，存入最终的查找表 `lights_lut`。

至此，Z-Bin LUT 构建完毕。GPU 稍后只需根据片元的深度找到对应的 `bin`，就能从 `lights_lut` 中瞬间读出一个需要检查的光源索引范围。

#### 构建屏幕分块位掩码 (Tile Bitmask)

这一步的目标是为屏幕上的每个 Tile 创建一个位掩码，用于快速判断哪些光源的投影与该 Tile 重叠。

##### 计算光源在屏幕空间的2D包围盒

这是整个 CPU 准备阶段中数学上最复杂的部分。我们需要将三维世界中的光源包围球，精确地投影为屏幕上的一个二维矩形包围盒 (AABB)。简单地投影球心再在屏幕空间加上半径是**不精确**的。正确的方法需要找到从视点到球体的切线，并计算这些切线与投影平面的交点。

这里可以直接复用前面Meshlet Culling的包围盒计算方法。我们将光源的包围球投影到屏幕空间，并计算出它在屏幕上的 AABB（Axis-Aligned Bounding Box）。

```cpp
// 迭代所有激活的光源
for (u32 i = 0; i < active_lights; ++i) {
    // ... 获取光源位置和半径 ...
    vec4s view_space_pos = glms_mat4_mulv(game_camera.camera.view, pos);

    // ... (一系列复杂的数学计算) ...
    // 最终目标是得到一个NDC坐标系下的AABB
    vec4s aabb{ min_ndc_x, min_ndc_y, max_ndc_x, max_ndc_y };

    // ...

    // 将NDC坐标 [-1, 1] 转换为屏幕像素坐标 [0, width] / [0, height]
    vec4s aabb_screen{(aabb.x * 0.5f + 0.5f) * (gpu.swapchain_width - 1),
                      (aabb.y * 0.5f + 0.5f) * (gpu.swapchain_height - 1),
                      (aabb.z * 0.5f + 0.5f) * (gpu.swapchain_width - 1),
                      (aabb.w * 0.5f + 0.5f) * (gpu.swapchain_height - 1)};
    
    // ...
}
```

精确计算球体投影边界通常涉及求解视点、球心和切点构成的直角三角形。通过一系列的向量和矩阵运算，可以找到球体在视锥体近平面上投影的边界点。

最终，无论使用哪种方法，我们都会得到一个在归一化设备坐标（NDC）下的 `aabb`，然后通过简单的线性变换，将其映射到屏幕像素坐标 `aabb_screen`。

##### 将光源信息填充到Tile网格中

有了每个光源在屏幕上的像素包围盒，我们就可以确定它覆盖了哪些 Tile，并在这些 Tile 的位掩码中进行标记。

```cpp
    // 计算 Tile 的数量和尺寸
    static const u32 k_num_lights = 256;
    static const u32 k_light_z_bins = 16;
    static const u32 k_tile_size = 8;
    static const u32 k_num_words = (k_num_lights + 31) / 32;
    const u32 tile_x_count = scene_data.resolution_x / k_tile_size;
    const u32 tile_y_count = scene_data.resolution_y / k_tile_size;
    // Assign light
    Array<u32> light_tiles_bits;
    light_tiles_bits.init(tile_x_count * tile_y_count * k_num_words);

    // ... 计算得到屏幕坐标 aabb_screen ...
    // 裁剪和边界检查，确保 AABB 在屏幕范围内
    min_x = max(min_x, 0.0f);
    min_y = max(min_y, 0.0f);
    max_x = min(max_x, (float)gpu.swapchain_width);
    max_y = min(max_y, (float)gpu.swapchain_height);

    // 根据AABB计算它覆盖的 tile 范围
    u32 first_tile_x = (u32)(min_x * tile_size_inv);
    u32 last_tile_x = min(tile_x_count - 1, (u32)(max_x * tile_size_inv));
    u32 first_tile_y = (u32)(min_y * tile_size_inv);
    u32 last_tile_y = min(tile_y_count - 1, (u32)(max_y * tile_size_inv));

    // 遍历所有被该光源覆盖的 tile
    for (u32 y = first_tile_y; y <= last_tile_y; ++y) {
        for (u32 x = first_tile_x; x <= last_tile_x; ++x) {
            // 计算当前 tile 在一维数组中的索引
            u32 array_index = y * tile_stride + x * k_num_words;

            // 计算当前光源 i 应该在位掩码的哪个 u32 的哪一位
            u32 word_index = i / 32;
            u32 bit_index = i % 32;

            // 将对应的位置1
            light_tiles_bits[array_index + word_index] |= (1 << bit_index);
        }
    }
```

  * `tile_size_inv` 是 `1.0f / k_tile_size`，用于快速将像素坐标转换为 Tile 索引。
  * 双层循环 `for (u32 y ...)` `for (u32 x ...)` 遍历了光源AABB覆盖的所有Tile。
  * `light_tiles_bits` 是一个一维数组，模拟一个二维的 Tile 网格。每个 Tile 自身又由 `k_num_words` 个 `u32` 组成，以容纳所有光源的位信息（例如，如果有 100 个光源，每个 Tile 就需要 4 个 `u32` 来做位掩码）。
  * `word_index = i / 32` 和 `bit_index = i % 32` 是标准的位操作，用于定位到第 `i` 个光源在位掩码数组中对应的比特位。
  * `|= (1 << bit_index)` 使用按位或（OR）操作，将该光源对应的比特位置为 `1`，表示“此光源与该 Tile 重叠”。

至此，CPU 完成了它的使命。GPU 此时拥有了完成高效剔除所需的一切：一个按深度排序的光源列表、一个深度过滤的查找表和一个屏幕空间过滤的位掩码网格。下一阶段，片元着色器将利用这些数据，以极低的成本找出最终影响每个像素的光源列表。

### GPU端 光照剔除与计算

当渲染管线进入像素着色阶段，GPU 面临着为屏幕上数百万个像素独立计算颜色的艰巨任务。我们的目标是，让每个像素都能高效地从成百上千的光源中，只挑选出真正对它有贡献的几个，并完成光照计算。

#### 双重过滤 获取初步光源列表

对于任意一个正在被着色的片元（Fragment/Pixel），我们首先需要确定它在我们的剔除结构中的位置。

```glsl
vec4 final_color = vec4(0);

// 1. 获取片元在相机空间的坐标
vec4 pos_camera_space = world_to_camera * vec4(world_position, 1.0);

// 2. 根据深度计算 Z-Bin 索引
float linear_d = (pos_camera_space.z - z_near) / (z_light_far - z_near);
int bin_index = int(linear_d / BIN_WIDTH);

// 3. 从 Z-Bin LUT 中获取光源索引范围
uint bin_value = bins[bin_index];
uint min_light_id = bin_value & 0xFFFF;
uint max_light_id = (bin_value >> 16) & 0xFFFF;

// 4. 根据屏幕坐标计算 Tile 地址
uvec2 tile = position / uint(TILE_SIZE);
uint stride = uint(NUM_WORDS) * (uint(resolution.x) / uint(TILE_SIZE));
uint address = tile.y * stride + tile.x;
```

1.  **确定深度 (Z-Bin):** 首先，将片元的世界坐标转换到相机空间，获取其深度值 `pos_camera_space.z`。通过线性化处理（映射到 `[0, 1]` 区间），我们能迅速计算出该片元所属的 `bin_index`。
2.  **获取深度过滤结果:** 使用 `bin_index` 从我们之前上传的 `bins` (即 `lights_lut`) 查找表中取出一个 `u32` 值。通过位运算，我们从中解包出 `min_light_id` 和 `max_light_id`。这给了我们一个经过深度过滤的、大大缩小的潜在光源索引范围。
3.  **确定位置 (Tile):** 使用片元的屏幕像素坐标 `position`，除以瓦片大小 `TILE_SIZE`，得到它所属的 `tile` 坐标。
4.  **获取屏幕过滤地址:** 将二维的 `tile` 坐标转换为一维数组 `tiles` (即 `light_tiles_bits`) 中的内存地址 `address`。这个地址指向了该 Tile 对应的位掩码数据的起始位置。

现在，我们手上有了两样利器：一个来自 Z-Bin 的**光源索引范围** (`min_light_id` 到 `max_light_id`)，和一个来自 Tile 的**位掩码**（从 `address` 开始）。接下来就是将它们结合起来，找出最终的光源列表。

#### 朴素实现

预编译宏 `#if ENABLE_OPTIMIZATION` 区分两种实现方式：一种是基础的朴素实现，另一种是利用现代 GPU `subgroup`（或称 `wavefront`）特性的高级优化实现。

朴素实现直接遍历由 Z-Bin 确定的光源范围，并对范围内的每个光源检查其在 Tile 位掩码中对应的位是否为1。

```glsl
#else // 未开启优化
  // 检查 min_light_id 是否有效
  if (min_light_id != NUM_LIGHTS + 1) {
    // 遍历 Z-Bin 给出的光源索引范围
    for (uint light_id = min_light_id; light_id <= max_light_id; ++light_id) {
      // 计算该光源在位掩码中的位置
      uint word_id = light_id / 32;
      uint bit_id = light_id % 32;

      // 检查 Tile 位掩码中对应的位是否为 1
      if ((tiles[address + word_id] & (1 << bit_id)) != 0) {
        // 如果两个条件都满足，该光源有效，进行光照计算
        uint global_light_index = light_indices[light_id];
        final_color.rgb +=
            calculate_point_light_contribution(...);
      }
    }
  }
#endif
```

这种方法的主要问题在于 **线程发散 (Thread Divergence)**。在 GPU 的 SIMD 执行模型（如一个包含 32 或 64 个线程的 `wavefront`）中，如果同一个 `wavefront` 内的线程执行了不同的分支（例如，某些像素的 `if` 条件为真，另一些为假），硬件的执行效率会下降，因为部分线程需要等待。

#### 基于 Subgroup 的协同计算

现代 GPU 提供了 `subgroup` 操作，允许一个 `wavefront` 内的所有线程协同工作，共享数据，并统一执行路径。同时还可以减少矢量寄存器的使用，提升Occupancy。

```glsl
#if ENABLE_OPTIMIZATION
  // 1. 在整个 subgroup 中找到一个统一的、更大的光源索引范围
  uint merged_min = subgroupBroadcastFirst(subgroupMin(min_light_id));
  uint merged_max = subgroupBroadcastFirst(subgroupMax(max_light_id));

  // 计算这个统一范围覆盖了哪些 u32 "words"
  uint word_min = max(merged_min / 32, 0);
  uint word_max = min(merged_max / 32, NUM_WORDS);

  // 2. 以统一的 word 范围进行循环，避免了循环本身的发散
  for (uint word_index = word_min; word_index <= word_max; ++word_index) {
    uint mask = tiles[address + word_index];

    // 3. 为每个线程重新构建其独立的 Z-Bin 掩码
    uint local_min = clamp(int(min_light_id) - int((word_index * 32)), 0, 31);
    uint mask_width = clamp(int(max_light_id) - int(min_light_id) + 1, 0, 32);
    uint zbin_mask = (mask_width == 32) ? uint(0xFFFFFFFF) : bit_field_mask(mask_width, local_min);
    
    // 应用 Z-Bin 掩码
    mask &= zbin_mask;

    // 4. 将 subgroup 中所有线程的有效光源掩码进行“或”操作，得到一个统一的掩码
    uint merged_mask = subgroupBroadcastFirst(subgroupOr(mask));

    // 5. 在统一的掩码上循环，所有线程执行完全相同的路径
    while (merged_mask != 0) {
      uint bit_index = get_lowest_bit(merged_mask); // 找到第一个为1的位
      uint light_index = 32 * word_index + bit_index;

      merged_mask ^= (1 << bit_index); // 清除该位

      uint global_light_index = light_indices[light_index];
      final_color.rgb +=
          calculate_point_light_contribution(...);
    }
  }
#endif
```
在一个Subgroup/Wavefront（例如32或64个线程）中，线程是并行执行的，但它们共享一些资源。

1.  **矢量寄存器 (Vector Registers)**:
    * 这是最常见的寄存器类型。
    * 当每个线程都有一个**不同**的值时，这个变量就存储在矢量寄存器中。
    * 例如，变量 `min_light_id` 在优化前，每个线程都有自己的值，所以它是一个矢量值。硬件上，一个矢量寄存器会为这个subgroup里的所有32/64个线程都保存一个独立的副本。

2.  **标量寄存器 (Scalar Registers)**:
    * 这是一种更高效、更节省空间的寄存器。
    * 当一个值对于subgroup里的**所有**线程都是**完全相同**的时候，编译器就可以把这个值存放到标量寄存器中。
    * 硬件只需要为整个subgroup存一份这个值，然后将它广播给所有线程的计算单元。

这个优化的核心思想就是：**将原本分散在矢量寄存器中的数据，转换成可以存放在标量寄存器中的统一数据。**

**将变化的循环边界 (`min/max_light_id`) 变成标量**

```c
// NOTE(marco): ...these values are stored in scalar registers and we avoid storing them in vector registers
uint merged_min = subgroupBroadcastFirst(subgroupMin(min_light_id));
uint merged_max = subgroupBroadcastFirst(subgroupMax(max_light_id));
```

  * **优化前**: `min_light_id` 和 `max_light_id` 是矢量值，存在矢量寄存器中。
  * **优化后**:
      * `subgroupMin(min_light_id)` 计算出整个subgroup中最小的那个 `min_light_id`。这是一个**归约 (Reduction)** 操作，结果是一个**标量**。
      * `subgroupBroadcastFirst(...)` 将这个单一的标量结果广播给subgroup中的每一个线程。
      * 现在，变量 `merged_min` 和 `merged_max` 的值在所有线程中都是**完全一样**的。
      * **结果**: 编译器可以非常自信地将 `merged_min` 和 `merged_max` 放入**标量寄存器**。外层 `for` 循环的判断 `word_index <= word_max` 就变成了一个高效的标量操作。

**将变化的掩码 (`mask`) 变成标量**

```c
// NOTE(marco): ...The while loop below can then use scalar
// registers as we know the value will be uniform across all threads
uint merged_mask = subgroupBroadcastFirst(subgroupOr(mask));
```

  * **优化前**: 在循环内部，每个线程都有自己的 `mask`，它是一个矢量值。如果直接用 `if (mask & ...)` 来判断，就会产生线程分歧。
  * **优化后**:
      * `subgroupOr(mask)` 将所有线程的 `mask` 按位或（OR）在一起，生成一个代表了整个subgroup工作总集的单一掩码。这同样是一个归约操作，结果是**标量**。
      * `subgroupBroadcastFirst(...)` 将这个统一的 `merged_mask` 广播给所有线程。
      * **结果**: `merged_mask` 现在可以存放在**标量寄存器**中。

由于 `merged_mask` 是一个标量，内部的 `while` 循环就变成了由一个统一的值驱动的**非分歧循环**：

```c
while (merged_mask != 0) { // 在标量寄存器上操作，无分歧
  uint bit_index = get_lowest_bit(merged_mask); // 标量操作
  ...
  merged_mask ^= (1 << bit_index); // 标量操作
  ...
}
```

#### 光照合成与最终着色

在通过上述剔除方法计算完所有动态点光源的贡献后，着色器还会继续完成其他光照成分的计算。

```glsl
  // ... 其他光源，如定向光、带阴影的光源 ...
  final_color.rgb += calculate_directional_light_contribution(...);

  vec3 F = fresnel_schlick_roughness(max(dot(normal, V), 0.0), F0, roughness);
  // ...
  kD *= 1.0 - metallic;
  
  // 间接光照-漫反射
  vec3 indirect_diffuse = indirect_irradiance * gi_intensity * base_colour.rgb;
  final_color.rgb += (kD * indirect_diffuse) * ao;

  // 间接光照-镜面反射
  vec2 envBRDF = textureLod(brdf_lut_texture, vec2(NoV, roughness), 0).rg;
  vec3 indirect_specular = reflection_color * (F * envBRDF.x + envBRDF.y);
  final_color.rgb += (indirect_specular) * ao;

  // ... 添加自发光 ...
  final_color.rgb += emissive;

  // ... sRGB 编码并返回 ...
  return vec4(encode_srgb(final_color.rgb), final_color.a);
```

这部分是标准的 PBR (Physically-Based Rendering) 流程，将直接光照、间接光照（漫反射和镜面反射）、自发光等所有成分叠加起来，构成最终的像素颜色。

## 附录

如何为一个三维的光源包围球计算出其在二维屏幕上的紧凑包围盒 (AABB)。

这是一个比看起来要复杂的问题。由于透视投影的非线性特性，我们不能简单地将球心投影到屏幕上，然后在屏幕空间加上半径——这样做会得到一个不准确、过大的包围盒。我查询到三种不同的实现方法，每种方法都在精度、鲁棒性和性能之间做出了不同的权衡。

### 平面解法

其核心思想是，将 3D 问题分解为两个独立的 2D 问题来求解：一个在视图空间的 XZ 平面上，另一个在 YZ 平面上。

```cpp
// 1. 在 XZ 平面上求解
vec2s cx{view_space_pos.x, view_space_pos.z};
// 计算相机到圆心的距离的平方 与 半径的平方 的差值
const f32 tx_squared = glms_vec2_dot(cx, cx) - (radius * radius);
const bool tx_camera_inside = tx_squared <= 0;
// 计算一个包含切线信息的辅助向量
vec2s vx{sqrtf(tx_squared), radius};
// 构造一个 2D 旋转缩放矩阵
mat2s xtransf_min{vx.x, vx.y, -vx.y, vx.x};
// 计算下边界切点
vec2s minx = glms_mat2_mulv(xtransf_min, cx);
// 构造另一个旋转缩放矩阵
mat2s xtransf_max{vx.x, -vx.y, vx.y, vx.x};
// 计算上边界切点
vec2s maxx = glms_mat2_mulv(xtransf_max, cx);

// 2. 在 YZ 平面上做同样的操作 (注意 Y 轴取反)
vec2s cy{-view_space_pos.y, view_space_pos.z};
// ... 类似的计算 ...
vec2s miny = ...;
vec2s maxy = ...;

// 3. 将 2D 切点坐标转换为 NDC 坐标
vec4s aabb{minx.x / minx.y * game_camera.camera.projection.m00,
           miny.x / miny.y * game_camera.camera.projection.m11,
           maxx.x / maxx.y * game_camera.camera.projection.m00,
           maxy.x / maxy.y * game_camera.camera.projection.m11};
```

这个方法非常巧妙。让我们以 XZ 平面为例来剖析：

1.  **降维打击:** 它将相机（位于原点）和球体在 XZ 平面上的投影视为一个 2D 的圆。我们的目标是找到从原点到这个圆的两条切线。
2.  **寻找切点:**
      * `tx_squared` 计算的是从原点到圆的**切线长度的平方**。如果该值为负，说明原点在圆内。
      * 向量 `vx` 包含了切线长度 `sqrt(tx_squared)` 和半径 `r`。这两个值与圆心向量 `cx` 构成了一个直角三角形。
      * 矩阵 `xtransf_min` 和 `xtransf_max` 是两个未归一化的**旋转矩阵**。它们的作用是将圆心向量 `cx` 旋转一个角度 `θ` (或 `-θ`)，其中 `θ` 是圆心向量与切线向量之间的夹角。旋转后的结果 `minx` 和 `maxx` 就是切点在 XZ 平面上的坐标。这避免了使用 `atan` 等开销较大的三角函数。
3.  **透视投影:**
      * 在视图空间中，一个点 `(x, y, z)` 投影到 NDC 坐标的计算公式与 `x/z` 和 `y/z` 相关。
      * 因此，`minx.x / minx.y` 计算的正是切点的 `x` 坐标除以其 `z` 坐标。
      * 最后乘以投影矩阵中的焦距项 (`projection.m00` 或 `projection.m11`)，就得到了最终的 NDC 坐标。

这个方法速度很快，因为它只涉及 2D 向量和 2x2 矩阵运算。但它没有显式地处理与近裁剪面相交的情况，在某些极端场景下可能不够鲁棒。

### McGuire 方法 (最精确)

该方法基于 Michael Mara 和 Morgan McGuire 的论文《2D Polyhedral Bounds of a Clipped, Perspective-Projected 3D Sphere》，它能正确处理球体与近裁剪面相交的情况。

```cpp
if (context.use_mcguire_method) {
    vec3s left, right, top, bottom;
    // 1. 沿 X 轴 (1,0,0) 找到左右边界点
    get_bounds_for_axis(vec3s{1, 0, 0}, view_space_pos, radius, 
                        game_camera.camera.near_plane, left, right);
    // 2. 沿 Y 轴 (0,1,0) 找到上下边界点
    get_bounds_for_axis(vec3s{0, 1, 0}, view_space_pos, radius, 
                        game_camera.camera.near_plane, top, bottom);

    // 3. 将这些视图空间的边界点投影到 NDC
    left = project(game_camera.camera.projection, left);
    right = project(game_camera.camera.projection, right);
    top = project(game_camera.camera.projection, top);
    bottom = project(game_camera.camera.projection, bottom);

    // 4. 组合成最终的 AABB
    aabb.x = right.x;
    aabb.z = left.x;
    aabb.y = -top.y;     // Y 轴在屏幕和 NDC 空间可能反向
    aabb.w = -bottom.y;
}
```

`get_bounds_for_axis` 函数是此方法的核心：

```cpp
void get_bounds_for_axis(const vec3s& a, /* Bounding axis (e.g. {1,0,0}) */ ...) {
    // 将球心 C 投影到由轴 a 和 z 轴定义的 2D 平面
    const vec2s c{glms_vec3_dot(a, C), C.z};
    // ... 与方法一类似的切点计算 ...

    // 检查球体是否与近裁剪面相交
    const bool clipSphere = (c.y + r >= nearZ);
    // ...

    for (int i = 0; i < 2; ++i) {
        // ... 计算切点 bounds[i] ...

        // 如果切点在近平面内侧，并且球体与近平面相交
        const bool clipBound = cameraInsideSphere || (bounds[i].y > nearZ);
        if (clipSphere && clipBound) {
            // 用球体与近平面相交的交点替换切点
            bounds[i] = vec2s{c.x + k, nearZ};
        }
        // ...
    }
    // ... 将 2D 边界点转换回 3D 摄像机空间 ...
}
```

1.  **解耦坐标轴:** 该方法通过 `get_bounds_for_axis` 函数分别计算水平（X）和垂直（Y）方向的边界，这和方法一的思路相似。
2.  **鲁棒的近平面裁剪:** 这是与方法一最大的不同。`get_bounds_for_axis` 显式地处理了球体与近裁剪面 (`nearZ`) 的关系。
      * 当球体与近平面相交时，其在屏幕上的投影边界可能不再是平滑的切线，而是在近平面上形成的**圆形切面**的边界。
      * 代码中的 `if (clipSphere && clipBound)` 逻辑就是在判断是否需要用这个圆形切面的边界点来代替原始的切点，从而得到一个更紧凑、更正确的包围盒。
3.  **完整投影:** 计算出的 `left`, `right`, `top`, `bottom` 是视图空间中的 3D 点，它们通过标准的 `project` 函数（矩阵乘法后进行透视除法）转换到 NDC，保证了结果的正确性。

此方法是三者中最精确的，因为它严格遵循了经过验证的几何算法，但其计算开销也相对更高。


### 包围盒投影法 (最简单，近似)

一种最简单直观，但也是最不精确的方法。

```cpp
if (context.use_view_aabb) {
    vec3s aabb_min{...}, aabb_max{...};

    // 1. 遍历光源包围球的3D AABB的8个顶点
    for (u32 c = 0; c < 8; ++c) {
        vec3s corner{...}; // 计算第c个角点世界坐标
        // ...
        
        // 2. 将角点转换到视图空间，并裁剪到近平面
        vec4s corner_vs = glms_mat4_mulv(game_camera.camera.view, ...);
        corner_vs.z = glm_max(game_camera.camera.near_plane, corner_vs.z);

        // 3. 将视图空间角点投影到NDC
        vec4s corner_ndc = glms_mat4_mulv(game_camera.camera.projection, corner_vs);
        corner_ndc = glms_vec4_divs(corner_ndc, corner_ndc.w);

        // 4. 在 NDC 空间中更新 AABB 的 min/max
        aabb_min.x = glm_min(aabb_min.x, corner_ndc.x);
        // ... aabb_min.y, aabb_max.x, aabb_max.y ...
    }
    // 5. 用 min/max 组合成最终 AABB
    aabb.x = aabb_min.x;
    aabb.z = aabb_max.x;
    // ...
}
```

1.  **近似思想:** 该方法不再去求解复杂的切线，而是做了一个**保守的近似**。它首先为 3D 球体构建一个轴对齐包围盒 (AABB)，然后将这个 3D 包围盒的 8 个顶点全部投影到屏幕上，最后在屏幕空间找到这 8 个投影点的最小/最大坐标，以此作为最终的 2D AABB。
2.  **结果的保守性:** 关键在于，**投影一个3D包围盒的顶点所形成的2D包围盒，并不等于对原始3D球体投影后的紧凑2D包围盒**。前者通常会比后者大，尤其当球体靠近屏幕边缘时。
3.  **优点与缺点:**
      * **优点:** 算法逻辑非常简单，易于理解和实现，且绝对“安全”，因为它产生的包围盒总是能完全包住球体的投影，不会漏掉任何像素。
      * **缺点:** 包围盒不够紧凑（Overestimation），会导致光源影响不必要的 Tile，从而在 GPU 端产生额外的位掩码检查开销，降低剔除效率。

### 总结

这三种方法为我们展示了在图形学中常见的工程权衡：

| 方法 | 优点 | 缺点 |
| :--- | :--- | :--- |
| **默认方法** | 计算高效，代码紧凑 | 对近平面裁剪处理不鲁棒 |
| **McGuire 方法** | **最精确**，鲁棒性强 | 计算开销相对最高 |
| **AABB投影法** | **最简单**，逻辑清晰 | 近似方法，包围盒**不紧凑** |

选择哪种方法取决于具体的应用场景和性能要求。对于大多数情况，默认方法可能是性能和精度之间的一个很好的平衡点。而对于追求极致剔除精度的场景，McGuire 方法是最佳选择。