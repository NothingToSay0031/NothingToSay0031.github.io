---
title: "Realtime Ray Tracing with Vulkan"
date: 2025-05-25 15:11:48
description: "DDGI, Raytraced Shadows, Raytraced Reflections, and TAA."
math: true
---

# Dynamic Diffuse Global Illumination (DDGI)

动态漫反射全局光照（[DDGI](https://www.jcgt.org/published/0008/02/01/paper-lowres.pdf)）是一种用于实时渲染中模拟间接光照的强大技术。其核心思想是在场景中布置一个规则的探针网格（Probe Grid），并预计算每个探针接收到的来自周围环境的光照。

## 工作流程

1. **辐射度采集 (Gather Radiance)**: 从每个探针位置向周围发射光线，采集光照信息。
2. **辐照度更新 (Update Irradiance)**: 使用采集到的光照信息更新探针的辐照度数据。
3. **可见性更新 (Update Visibility)**: 更新探针的可见性数据，用于后续的阴影计算。
4. **（可选）探针偏移更新 (Probe Offset Update)**: 根据光线追踪的距离调整每个探针的位置偏移，以更好地适应场景几何体。
5. **间接光照计算 (Indirect Lighting Calculation)**: 使用更新后的辐照度和可见性数据计算场景的间接光照。

## 辐射度采集 (Gather Radiance)

此阶段的目标是为场景中的每个光照探针（Light Probe）计算其从各个方向接收到的入射光（Radiance）和对应的光线传播距离。这本质上是一个大规模的光线追踪过程，我们从每个探针的位置向半球或全球领域发射大量光线，记录它们击中场景后的光照信息。

最终的输出是一张二维纹理 `probe_raytrace_radiance_texture`，其尺寸为 `[num_rays, num_probes]`。纹理中的每一个像素 `(x, y)` 存储了第 `y` 个探针沿第 `x` 个方向发射的光线所采集到的辐射度（RGB）和距离（A）。

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201311937.png)

### 数据流与GPU调度

在CPU端，我们通过一个光线追踪指令来启动整个GPU计算过程。

```cpp
// 准备工作：确保目标纹理处于可写入状态
gpu_commands->issue_texture_barrier(probe_raytrace_radiance_texture,
                                    RESOURCE_STATE_UNORDERED_ACCESS, 0, 1);

// 绑定光线追踪管线和所需的资源
gpu_commands->bind_pipeline(probe_raytrace_pipeline);
gpu_commands->bind_descriptor_set(&probe_raytrace_descriptor_set, 1, nullptr, 0);

// 确定需要更新的探针数量
const u32 probe_count =
    offsets_calculations_count >= 0 ? get_total_probes() : per_frame_probe_updates;

// 发射光线：为每个探针（probe_count）发射指定数量（probe_rays）的光线
gpu_commands->trace_rays(probe_raytrace_pipeline, probe_rays, probe_count, 1);

// 计算完成后，再次设置屏障，以便后续阶段可以读取该纹理
gpu_commands->issue_texture_barrier(probe_raytrace_radiance_texture, RESOURCE_STATE_UNORDERED_ACCESS, 0, 1);
```

`trace_rays` 函数是核心。它在GPU上启动一个 `probe_rays * probe_count` 的二维计算网格。GPU上的每个工作单元（线程）将负责处理一个探针的一条光线。

### Ray Generation Shader (射线生成着色器)

这是光追管线的入口点。每个线程执行一次，负责生成一条光线的起点、方向，并发起追踪。

```glsl
// layout(binding = X) uniform accelerationStructureEXT as;
// layout(binding = Y, set = 0, rgba32f) uniform image2D radiance_output_texture;
layout( location = 0 ) rayPayloadEXT RayPayload payload;

void main() {
    // gl_LaunchIDEXT 是内置变量，代表当前线程在网格中的二维索引
    // .x 是光线索引, .y 是探针索引
    const ivec2 pixel_coord = ivec2(gl_LaunchIDEXT.xy);
    const int probe_index = pixel_coord.y + probe_update_offset;
    const int ray_index = pixel_coord.x;

    // ... 省略探针状态检查 ...

    // 1. 计算光线起点 (Ray Origin)
    //    将一维的探针索引转换为三维网格坐标，再转换到世界空间位置
    ivec3 probe_grid_indices = probe_index_to_grid_indices(probe_index);
    vec3 ray_origin = grid_indices_to_world(probe_grid_indices, probe_index);

    // 2. 计算光线方向 (Ray Direction)
    //    使用球斐波那契晶格（Spherical Fibonacci）生成均匀分布在球面上的方向
    //    再通过一个随机旋转矩阵来抖动采样，避免时间上的条带瑕疵
    vec3 direction = normalize(mat3(random_rotation) * spherical_fibonacci(ray_index, probe_rays));

    // 3. 初始化光线负载 (Payload)
    //    Payload 是用于在着色器之间传递数据的结构体
    payload.radiance = vec3(0);
    payload.distance = 0;

    // 4. 发射光线
    //    调用内置函数，在场景加速结构（as）中追踪光线
    //    如果命中，将调用 Closest Hit Shader；否则调用 Miss Shader
    traceRayEXT(as, gl_RayFlagsOpaqueEXT, 0xff, 0, 0, 0, ray_origin, 0.0, direction, 100.0, 0);

    // 5. 存储结果
    //    光线追踪结束后，Payload 中已写入了命中点的辐射度和距离
    //    将结果写入输出纹理的对应位置
    imageStore(global_images_2d[radiance_output_index], ivec2(ray_index, probe_index), vec4(payload.radiance, payload.distance));
}
```

`spherical_fibonacci` 函数是实现均匀球面采样的关键。为了用蒙特卡洛方法估算一个点接收到的半球积分（渲染方程），我们需要在半球上生成一系列分布均匀的采样方向。相比于简单的随机采样，斐波那契晶格能以更少的样本数达到更好的分布效果，减少噪点。

### Closest Hit Shader (最近命中着色器)

当光线击中场景中的某个几何体时，该着色器被调用。它的核心职责是确定命中点的光照信息。然而，与传统渲染不同，DDGI中的光线是从探针发出的，探针本身可能位于几何体内部或与其表面非常接近。因此，我们必须区分光线是击中了物体的“正面”还是“背面”。

```glsl
layout(buffer_reference, std430, buffer_reference_align = 2) buffer int_array_type {
    uint16_t v;
};

layout(buffer_reference, std430, buffer_reference_align = 4) buffer vec2_array_type {
    vec2 v;
};

layout(buffer_reference, std430, buffer_reference_align = 4) buffer float_array_type {
    float v;
};

layout( location = 0 ) rayPayloadInEXT RayPayload payload;
hitAttributeEXT vec2 barycentric_weights;

void main() {
    // 初始化输出变量
    vec3 radiance = vec3(0.0f);
    float distance = 0.0f;

    // --- 步骤 0: 处理背面命中 ---
    // 这是一个关键的健壮性处理。如果光线击中三角形的背面，
    // 通常意味着探针位于模型内部。我们不计算光照，
    // 而是将距离标记为负数，以在后续阶段识别并处理这种情况，防止漏光。
    if (gl_HitKindEXT == gl_HitKindBackFacingTriangleEXT) {
        distance = (gl_RayTminEXT + gl_HitTEXT) * -0.2f;
    } else {
        // --- 步骤 1: 获取命中几何体的数据 ---
        // 使用光追管线提供的内置变量，定位到具体的模型实例和三角形。
        uint mesh_index = mesh_instance_draws[gl_GeometryIndexEXT].mesh_draw_index;
        MeshDraw mesh = mesh_draws[mesh_index];

        // 从索引缓冲区获取构成该三角形的三个顶点的索引。
        int_array_type index_buffer = int_array_type(mesh.index_buffer);
        int i0 = index_buffer[gl_PrimitiveID * 3 + 0].v;
        int i1 = index_buffer[gl_PrimitiveID * 3 + 1].v;
        int i2 = index_buffer[gl_PrimitiveID * 3 + 2].v;


        // --- 步骤 2: 使用重心坐标插值顶点属性 ---
        // 硬件会提供命中点在三角形内的精确重心坐标。
        float b = barycentric_weights.x;
        float c = barycentric_weights.y;
        float a = 1.0f - b - c;

        // 从顶点缓冲区中获取三个顶点的局部坐标。
        float_array_type vertex_buffer = float_array_type(mesh.position_buffer);
        vec4 p0 = vec4(vertex_buffer[i0*3+0].v, vertex_buffer[i0*3+1].v, vertex_buffer[i0*3+2].v, 1.0);
        vec4 p1 = vec4(vertex_buffer[i1*3+0].v, vertex_buffer[i1*3+1].v, vertex_buffer[i1*3+2].v, 1.0);
        vec4 p2 = vec4(vertex_buffer[i2*3+0].v, vertex_buffer[i2*3+1].v, vertex_buffer[i2*3+2].v, 1.0);
        
        // 将顶点位置变换到世界空间。
        const mat4 transform = mesh_instance_draws[gl_GeometryIndexEXT].model;
        vec4 p0_world = transform * p0;
        vec4 p1_world = transform * p1;
        vec4 p2_world = transform * p2;

        // 插值计算出命中点的精确世界坐标。
        const vec3 world_position = a * p0_world.xyz + b * p1_world.xyz + c * p2_world.xyz;

        // 同理，插值计算出UV坐标。
        vec2_array_type uv_buffer = vec2_array_type(mesh.uv_buffer);
        vec2 uv0 = uv_buffer[i0].v;
        vec2 uv1 = uv_buffer[i1].v;
        vec2 uv2 = uv_buffer[i2].v;
        vec2 uv = (a * uv0 + b * uv1 + c * uv2);

        // 插值计算出平滑的顶点法线。
        float_array_type normals_buffer = float_array_type(mesh.normals_buffer);
        vec3 n0 = vec3(normals_buffer[i0*3+0].v, normals_buffer[i0*3+1].v, normals_buffer[i0*3+2].v);
        vec3 n1 = vec3(normals_buffer[i1*3+0].v, normals_buffer[i1*3+1].v, normals_buffer[i1*3+2].v);
        vec3 n2 = vec3(normals_buffer[i2*3+0].v, normals_buffer[i2*3+1].v, normals_buffer[i2*3+2].v);
        vec3 normal = a * n0 + b * n1 + c * n2;

        // 将法线变换到世界空间。
        const mat3 normal_transform = mat3(mesh_instance_draws[gl_GeometryIndexEXT].model_inverse);
        normal = normalize(normal_transform * normal);


        // --- 步骤 3: 获取表面材质属性 ---
        // 使用插值得到的UV坐标采样反照率（Albedo）贴图。
        // 指定一个较低的LOD层级可以提升性能，因为GI的精度要求不高。
        vec3 albedo = textureLod(global_textures[nonuniformEXT(mesh.textures.x)], uv, 3.0).rgb;


        // --- 步骤 4: 计算直接光照 ---
        // 这里实现了一个简单的 Lambertian 光照模型。
        Light light = lights[0]; // 假设场景中至少有一个光源。
        const vec3 position_to_light = light.world_position - world_position;
        const vec3 l = normalize(position_to_light);
        const float NoL = clamp(dot(normal, l), 0.0, 1.0);

        // 计算光照衰减。
        float attenuation = attenuation_square_falloff(position_to_light, 1.0f / light.radius);
        
        // 组合光照贡献。
        vec3 light_intensity = vec3(0.0f);
        if (attenuation > 0.001f && NoL > 0.001f) {
            light_intensity += (light.intensity * attenuation * NoL) * light.color;
        }

        vec3 diffuse = albedo * light_intensity;


        // --- 步骤 5: (可选) 计算间接光照（多轮反弹） ---
        // 这是DDGI实现无限反弹效果的核心。
        // 通过采样周围的探针数据来近似当前点的间接光照。
        if (use_infinite_bounces()) {
            diffuse += albedo * sample_irradiance(world_position, normal, camera_position.xyz) * infinite_bounces_multiplier;
        }

        // --- 步骤 6: 为正面命中设置最终输出 ---
        radiance = diffuse;
        distance = gl_RayTminEXT + gl_HitTEXT; // 距离是正值。
    }

    // --- 最终步骤: 将结果写回光线负载 (Payload) ---
    // 无论命中正面还是背面，都将计算出的 radiance 和 distance 返回。
    payload.radiance = radiance;
    payload.distance = distance;
}
```
### Miss Shader (未命中着色器)

如果光线没有击中任何场景几何体，则执行此着色器。它通常用于返回一个背景色，例如天空盒的颜色，并将距离设为一个极大值。

```glsl
layout( location = 0 ) rayPayloadInEXT RayPayload payload;

void main() {
    // 返回天空颜色作为辐射度
    payload.radiance = vec3(0.529, 0.807, 0.921);
    // 设置一个非常大的距离值，表示光线射向了无穷远
    payload.distance = 1000.0f;
}
```

## 核心辅助函数 (Core Helper Functions)

这些辅助函数是DDGI（动态漫反射全局光照）系统的基石，负责处理从采样方向生成、矢量编码到坐标系转换等各种关键任务。理解这些函数有助于深入掌握DDGI的内部工作机制。

### 球面斐波那契采样 (Spherical Fibonacci Sampling)

在为每个探针采集光照信息时，我们需要从探针位置向周围发射大量光线。为了用最少的光线数量高效地覆盖所有方向，我们需要一个能在球面上生成均匀分布点的算法。球面斐波那契（或称黄金螺旋）就是一种优秀的解决方案。

```glsl
/**
 * @brief 使用球面斐波那契算法在单位球面上生成一个均匀分布的3D方向向量。
 * @param i 当前样本的索引，范围 [0, n-1]。
 * @param n 总样本数。
 * @return 一个标准化的3D方向向量。
 */
vec3 spherical_fibonacci(float i, float n) {
    // 黄金比例常数，是构造斐波那契晶格的核心。
    const float PHI = 1.61803398875f; // (sqrt(5.0) + 1.0) / 2.0

    // 计算垂直分量（z轴），确保点在z轴上均匀分布。
    // (2.0 * i + 1.0) / n 会生成从 1/n 到 (2n-1)/n 的序列。
    // 1.0 - ... 将其映射到 [-1 + 1/n, 1 - 1/n] 的范围。
    float cos_theta = 1.0f - (2.0f * i + 1.0f) / n;
    float sin_theta = sqrt(clamp(1.0f - cos_theta * cos_theta, 0.0f, 1.0f));

    // 计算水平角度 phi，使用黄金比例的小数部分来确保每个点的旋转角度都有最大程度的无理性和不重复性，
    // 从而避免产生摩尔纹或排列成线的瑕疵。
    float phi = 2.0f * PI * (i * PHI - floor(i * PHI));

    // 从球坐标转换为笛卡尔坐标。
    return vec3(cos(phi) * sin_theta,
                sin(phi) * sin_theta,
                cos_theta);
}
```

该函数是蒙特卡洛积分在渲染中应用的一个实例。与简单的随机采样或经纬度采样（会在两极产生点堆积）相比，球面斐波那契采样是一种**低差异序列**，它能以确定性的方式生成分布极为均匀的样本点，从而在相同的样本数下获得更平滑、噪点更少的积分结果。


### 八面体映射 (Octahedral Mapping)

为了将探针采集到的360度环境光信息存储到一张2D纹理中，我们需要一种高效的映射方法，将3D单位方向向量编码（Encode）为2D坐标，然后再解码（Decode）回来。八面体映射就是一种在性能和精度之间取得优秀平衡的常用技术。

```glsl
// 编码：将3D单位向量投影到一个八面体上，然后展开成一个2D正方形([-1,1])。
vec2 oct_encode(in vec3 v) {
    // 将向量投影到z=0的平面，通过L1范数进行归一化。
    float l1norm = abs(v.x) + abs(v.y) + abs(v.z);
    vec2 result = v.xy / l1norm;

    // 如果向量在下半球 (v.z < 0)，则需要进行一次“翻折”操作，
    // 将下半球的八面体表面映射到2D正方形的外部区域。
    if (v.z < 0.0) {
        result = (1.0 - abs(result.yx)) * sign_not_zero(result.xy);
    }
    return result;
}

// 解码：将2D八面体坐标转换回3D单位向量。
vec3 oct_decode(vec2 o) {
    // 首先重构出上半球的向量。
    vec3 v = vec3(o.x, o.y, 1.0 - abs(o.x) - abs(o.y));
    
    // 如果z分量为负，说明原始向量来自下半球，需要执行与编码相反的翻折操作。
    if (v.z < 0.0) {
        v.xy = (1.0 - abs(v.yx)) * sign_not_zero(v.xy);
    }
    
    // 最后，将向量归一化以确保它是单位长度。
    return normalize(v);
}

// 辅助函数：返回一个数的符号，但0被视为正。
float sign_not_zero(in float k) {
    return (k >= 0.0) ? 1.0 : -1.0;
}
```

八面体映射通过将单位球体投影到一个紧密包围它的八面体上，再将八面体展开成一个2D正方形来实现。相比于立方体贴图（Cubemap），它没有接缝问题，且所有数据都存储在一张连续的2D纹理中，有利于利用硬件的双线性插值和Mipmapping。这种编码方式在存储方向性数据（如法线、光照方向等）时非常高效。

### 探针网格与世界空间变换

DDGI的核心是在3D空间中维护一个规则的探针网格。因此，我们需要一系列函数来在这几种坐标系之间进行转换：

  * **1D 探针索引**: 在缓冲区或循环中使用的线性索引。
  * **3D 网格坐标**: 探针在网格中的整数坐标 `(x, y, z)`。
  * **3D 世界坐标**: 探针在游戏世界中的实际浮点数位置。

```glsl
/**
 * @brief 将一维的探针线性索引转换为三维的网格坐标。
 */
ivec3 probe_index_to_grid_indices(int probe_index) {
    const int probe_x = probe_index % probe_counts.x;
    const int probe_counts_xy = probe_counts.x * probe_counts.y;
    const int probe_y = (probe_index % probe_counts_xy) / probe_counts.x;
    const int probe_z = probe_index / probe_counts_xy;
    return ivec3(probe_x, probe_y, probe_z);
}

/**
 * @brief 将三维的网格坐标转换回一维的线性索引。
 */
int probe_indices_to_index(in ivec3 probe_coords) {
    return int(probe_coords.x + probe_coords.y * probe_counts.x + probe_coords.z * probe_counts.x * probe_counts.y);
}

/**
 * @brief 将三维的网格坐标转换为世界坐标，可选地应用一个偏移量。
 * 这个偏移量是DDGI的一个重要特性，允许探针从其规则的网格位置移动，以更好地贴合场景几何体，减少漏光。
 */
vec3 grid_indices_to_world(ivec3 grid_indices, int probe_index) {
    // 计算基础的世界坐标
    vec3 base_world_pos = grid_indices * probe_spacing + probe_grid_position;
    
    // 从纹理中获取预计算的探针偏移量
    vec3 probe_offset = vec3(0);
    if (use_probe_offsetting()) {
        const int probe_counts_xy = probe_counts.x * probe_counts.y;
        ivec2 offset_coord = ivec2(probe_index % probe_counts_xy, probe_index / probe_counts_xy);
        probe_offset = texelFetch(global_textures[nonuniformEXT(probe_offset_texture_index)], offset_coord, 0).rgb;
    }

    return base_world_pos + probe_offset;
}

/**
 * @brief 将世界坐标转换为其所在的探针网格的三维坐标。
 */
ivec3 world_to_grid_indices(vec3 world_position) {
    vec3 grid_pos = (world_position - probe_grid_position) * reciprocal_probe_spacing;
    return clamp(ivec3(grid_pos), ivec3(0), probe_counts - ivec3(1));
}
```

### 探针图集坐标计算 (Probe Atlas Coordinates)

为了高效渲染，所有探针的环境光数据（通常是经过八面体编码的2D图像）都被存储在一张巨大的 **纹理图集（Texture Atlas）** 中。每个探针占据图集中的一小块正方形区域，周围通常有1像素的边界（Border）以防止在纹理采样时发生数据“渗漏”。

```glsl
/**
 * @brief 根据3D方向和探针索引，计算出在整个探针图集纹理中对应的UV坐标。
 */
vec2 get_probe_uv(vec3 direction, int probe_index, int full_texture_width, int full_texture_height, int probe_side_length) {
    // 1. 将3D方向编码为[-1, 1]范围的2D八面体坐标。
    const vec2 octahedral_coordinates = oct_encode(normalize(direction));
    
    const float probe_with_border_side = float(probe_side_length) + 2.0f;
    const int probes_per_row = full_texture_width / int(probe_with_border_side);
    
    // 2. 计算当前探针在图集中的网格索引 (0,0), (1,0), ...
    ivec2 probe_indices = ivec2(probe_index % probes_per_row, probe_index / probes_per_row);
    
    // 3. 计算该探针区域左上角的像素坐标。
    vec2 atlas_texels = vec2(probe_indices) * probe_with_border_side;
    
    // 4. 加上1像素的边界，进入探针的有效数据区域。
    atlas_texels += vec2(1.0f);
    
    // 5. 移动到探针区域的中心。
    atlas_texels += vec2(probe_side_length * 0.5f);
    
    // 6. 使用八面体坐标在探针区域内部进行偏移。
    atlas_texels += octahedral_coordinates * (probe_side_length * 0.5f);
    
    // 7. 将最终的像素坐标归一化为[0, 1]范围的UV坐标。
    return atlas_texels / vec2(float(full_texture_width), float(full_texture_height));
}
```

## 更新辐照度与可见性 (Update Irradiance and Visibility)

在“辐射度采集”阶段之后，我们得到了每个探针从数百个方向射出的光线的原始数据（颜色和距离）。这个原始数据是离散且充满噪声的。本阶段的目标就是将这些离散的射线数据，通过滤波和积分，转换成两张最终可供场景采样、平滑且稳定的**探针图集（Probe Atlas）**：

1.  **辐照度图集 (Irradiance Atlas)**: 存储每个探针从各个方向接收到的颜色信息。
![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201311676.png)

2.  **可见性图集 (Visibility Atlas)**: 存储每个探针在各个方向上的平均距离和距离的平方，用于后续计算柔和阴影。
![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201312903.png)

### CPU端调度

在CPU侧，我们分别调用两个独立的计算管线，它们使用相同的输入数据但执行不同的计算，最终写入各自的目标图集纹理。

```cpp

i32 irradiance_probe_size = 6;
const i32 octahedral_irradiance_size = irradiance_probe_size + 2;
irradiance_atlas_width = (octahedral_irradiance_size * probe_count_x * probe_count_y);
irradiance_atlas_height = (octahedral_irradiance_size * probe_count_z);

// --- 1. 更新辐照度图集 ---

// ... 绑定计算管线和资源 ...

gpu_commands->dispatch(hydra::ceilu32(irradiance_atlas_width / 8.f),
                       hydra::ceilu32(irradiance_atlas_height / 8.f), 1);


// --- 2. 更新可见性图集 ---

// ... 绑定计算管线和资源 ...

// 启动计算着色器，覆盖整个可见性图集纹理
gpu_commands->dispatch(hydra::ceilu32(visibility_atlas_width / 8.f),
                       hydra::ceilu32(visibility_atlas_height / 8.f), 1);
```

### 计算着色器详解

以下是核心的计算着色器代码。它通过预处理器宏 (`#if defined`) 来区分是计算辐照度还是可见性，但核心逻辑是共享的。代码主要分为两个部分：**核心计算**（针对探针内部像素）和**边界处理**（针对探针边缘像素）。

#### 核心计算（探针内部像素）

这部分代码对探针图集内每个有效的像素进行计算。每个像素代表探针所看到的一个特定方向。

```glsl
// 该着色器在一个 8x8 的线程组中执行
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    ivec3 coords = ivec3(gl_GlobalInvocationID.xyz);
    // ... 省略变量初始化和边界检查 ...

    // 通过像素坐标反算出当前线程正在为哪个探针工作
    int probe_index = get_probe_index_from_pixels(coords.xy, ...);

    // --- 步骤1: 区分内部像素与边界像素 ---
    // 探针在图集中有1像素的边界，边界像素有特殊处理。
    bool border_pixel = ((gl_GlobalInvocationID.x % probe_with_border_side) == 0) || ... ;

    if (!border_pixel) {
        // --- 步骤2: 对所有射线进行加权积分 ---
        vec4 result = vec4(0);
        uint backfaces = 0; // 用于统计击中背面的射线数量
        
        // 循环遍历该探针在上一阶段发射的所有射线
        for (int ray_index = 0; ray_index < probe_rays; ++ray_index) {
            // 获取原始射线数据（辐射度和距离）
            ivec2 sample_position = ivec2(ray_index, probe_index);
            vec4 raw_data = texelFetch(global_textures[nonuniformEXT(radiance_output_index)], sample_position, 0);
            
            // a. 处理背面击中：如果距离为负，说明探针可能在几何体内，跳过此射线。
            //    如果背面射线过多，则认为此探针完全被遮挡，提前退出，结果为黑色。
            if (raw_data.w < 0.0f && use_backfacing_blending()) {
                if (++backfaces >= max_backfaces) return;
                continue;
            }

            // b. 计算权重：这是积分的核心。
            //    - texel_direction: 当前像素所代表的出射方向。
            //    - ray_direction:   当前循环中处理的原始射线的方向。
            //    - weight:          二者点积，即两个方向夹角的余弦值。
            vec3 ray_direction = normalize(mat3(random_rotation) * spherical_fibonacci(ray_index, probe_rays));
            vec3 texel_direction = oct_decode(normalized_oct_coord(coords.xy, probe_side_length));
            float weight = max(0.0, dot(texel_direction, ray_direction));

            if (weight < 0.0001f) continue;

            // c. 根据模式（辐照度/可见性）累加加权值
#if defined(COMPUTE_PROBE_UPDATE_IRRADIANCE)
            // 模式1: 辐照度。累加 (颜色 * 权重)，并将权重本身存入w分量。
            vec3 radiance = raw_data.rgb * 0.95; // 能量守恒
            result += vec4(radiance * weight, weight);
#else
            // 模式2: 可见性。累加 (距离, 距离^2, 0) * 权重。
            weight = pow(weight, 2.5f); // 权重调整
            float distance = min(abs(raw_data.w), probe_max_ray_distance);
            vec3 value = vec3(distance, distance * distance, 0);
            result += vec4(value * weight, weight);
#endif
        }

        // --- 步骤3: 归一化和时间混合 ---
        // a. 归一化：将累加结果除以总权重，得到加权平均值。
        if (result.w > 0.0001f) {
            result.xyz /= result.w;
        }

        // b. 时间滤波：与上一帧的结果进行混合（滞后滤波），以消除闪烁。
        //    hysteresis 是一个 [0, 1] 范围的混合因子，这里取0.95。
#if defined(COMPUTE_PROBE_UPDATE_IRRADIANCE)
        // 是否启用感知编码。
        if (use_perceptual_encoding()) {
            // 对 result.rgb（一个线性的HDR颜色值）执行伽马编码。
            // pow(value, exponent) 是一个幂函数。
            // 这里的指数是 vec3(1.0f / 5.0f)，即对R, G, B三个分量都取0.2次幂。
            // 这等同于应用一个 gamma = 5.0 的伽马校正。
            // 其目的是将线性的光照强度非线性地映射到更符合人类视觉感知的空间，
            // 以便在低精度（如RGBA8）纹理中存储时，能更有效地利用数据位，
            // 减少在暗部区域的色带瑕疵。
            result.rgb = pow(result.rgb, vec3(1.0f / 5.0f));
        }
        vec4 previous_value = imageLoad(irradiance_image, coords.xy);
        result = mix(result, previous_value, hysteresis);
        imageStore(irradiance_image, coords.xy, result);
#else
        vec2 previous_value = imageLoad(visibility_image, coords.xy).rg;
        result.rg = mix(result.rg, previous_value, hysteresis);
        imageStore(visibility_image, coords.xy, vec4(result.rg, 0, 1));
#endif
        return; // 内部像素计算完成
    }

    // ... 边界像素处理 ...
```

  * **余弦加权积分 (Cosine-Weighted Integration)**: 核心计算是在估算渲染方程中的半球积分。对于一个给定的出射方向（`texel_direction`），它接收到的光照是所有入射光线（`ray_direction`）贡献的总和，且每条光线的贡献由其与出射方向夹角的余弦值（`dot(...)`）进行加权。此过程在物理上模拟了 Lambertian 表面的漫反射。
  * **方差阴影贴图 (Variance Shadow Mapping, VSM)**: 在计算可见性时，我们存储了距离 `d` 和距离的平方 `d^2`。通过这两个**矩（Moments）**，可以在后续的光照计算中，快速估算一个像素点是否处于阴影中，并且能以很小的代价实现具有可变半影的柔和阴影效果。

#### 边界处理（探针边缘像素）

这部分代码处理图集中每个探针周围的1像素边界。其目的是为了让硬件在对图集进行双线性插值采样时，能够无缝地“环绕”读取数据。

![环绕规则](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507221634938.png)

```glsl
    // ... 内部像素计算之后 ...

    // --- 步骤4: 同步线程并处理边界像素 ---
    // a. 内存屏障：确保所有内部像素都已计算并写入内存后，
    //    才开始进行边界像素的拷贝操作，避免读取到旧数据或未定义数据。
    groupMemoryBarrier();
    barrier();

    // b. 计算源像素坐标：根据当前边界像素的位置，计算出它应该从探针区域
    //    内部的哪个像素拷贝数据（通常是相对的另一侧）。
    //    例如，顶部边界拷贝底部内容，左侧边界拷贝右侧内容。
    ivec2 source_pixel_coordinate = coords.xy;

    const int k_read_table[6] = {5, 3, 1, -1, -3, -5};
    if (corner_pixel) {
        // 角落像素的拷贝逻辑
        source_pixel_coordinate.x += (probe_pixel_x == 0) ? probe_side_length : -probe_side_length;
        source_pixel_coordinate.y += (probe_pixel_y == 0) ? probe_side_length : -probe_side_length;
    } else if (row_pixel) {
        // 水平边界像素的拷贝逻辑
        source_pixel_coordinate.x += k_read_table[probe_pixel_x - 1];
        source_pixel_coordinate.y += (probe_pixel_y > 0) ? -1 : 1;
    } else {
        // 垂直边界像素的拷贝逻辑
        source_pixel_coordinate.x += (probe_pixel_x > 0) ? -1 : 1;
        source_pixel_coordinate.y += k_read_table[probe_pixel_y - 1];
    }

    // c. 拷贝并写入数据
#if defined(COMPUTE_PROBE_UPDATE_IRRADIANCE)
    vec4 copied_data = imageLoad(irradiance_image, source_pixel_coordinate);
    imageStore(irradiance_image, coords.xy, copied_data);
#else
    vec4 copied_data = imageLoad(visibility_image, source_pixel_coordinate);
    imageStore(visibility_image, coords.xy, copied_data);
#endif
}
```

* **纹理环绕 (Texture Wrapping)**: 这是处理存储在图集中的球面/八面体贴图的标准做法。通过在数据周围填充一圈“环绕”的边界，可以欺骗GPU的纹理采样器，使其在采样数据边缘时，能够正确地插值到“对面”的像素，从而避免在八面体贴图的`[-1, 1]`边界处产生接缝或瑕疵。
* **线程组同步 (Workgroup Synchronization)**: `groupMemoryBarrier()` 和 `barrier()` 是在计算着色器中进行线程同步的关键指令。它确保了在一个线程组（Workgroup）内，写操作和读操作的先后顺序，是实现这种“先计算，后拷贝”逻辑的必要条件。

## 采样 Irradiance Probes

这部分代码负责设置渲染管线状态并启动计算着色器。

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201712787.png)

```cpp
void sampleIrradianceProbes() {
    // 设置资源屏障：告诉GPU，我们将要以“无序访问”（写入）的方式使用 indirect_texture
    gpu_commands->issue_texture_barrier(indirect_texture, RESOURCE_STATE_UNORDERED_ACCESS, 0, 1);

    // 绑定用于采样Irradiance的计算管线
    gpu_commands->bind_pipeline(sample_irradiance_pipeline);

    // 绑定描述符集，其中包含了所有需要的纹理资源（深度图、法线图、探针数据等）
    gpu_commands->bind_descriptor_set(&sample_irradiance_descriptor_set, 1, nullptr, 0);

    // 通过Push Constants向Shader传递一个标记，告诉它是否启用半分辨率模式
    u32 half_resolution = render_scene->gi_use_half_resolution ? 1 : 0;
    gpu_commands->push_constants(sample_irradiance_pipeline, 0, 4, &half_resolution);

    // 计算需要启动的线程组数量
    // 如果启用半分辨率，宽高都减半
    const f32 resolution_divider = render_scene->gi_use_half_resolution ? 0.5f : 1.0f;
    const u32 group_dim_x = hydra::ceilu32(renderer->width * resolution_divider / 8.0f);
    const u32 group_dim_y = hydra::ceilu32(renderer->height * resolution_divider / 8.0f);

    // 派发计算任务！这将启动 group_dim_x * group_dim_y * 1 个线程组
    // 每个线程组包含 8x8x1 = 64 个线程，对应着色器中的 local_size
    gpu_commands->dispatch(group_dim_x, group_dim_y, 1);

    // 再次设置资源屏障：告诉GPU，计算已完成，indirect_texture 现在将作为“像素着色器资源”（读取）使用
    gpu_commands->issue_texture_barrier(indirect_texture, RESOURCE_STATE_PIXEL_SHADER_RESOURCE, 0, 1);
}
```

计算着色器的主要任务是从探针网格中采样间接光照（Irradiance），并将结果存储在一个纹理中。它通过对每个探针周围的多个方向进行采样，来近似计算该点的间接光照。

```glsl
// =========================================================================
//                       
// 为给定的世界坐标点，通过采样周围的光照探针来计算其间接光照。
//
// @param world_position:    当前像素/着色点的世界坐标
// @param normal:            该点的法线向量
// @param camera_position:   摄像机的世界坐标
// @return:                  计算出的间接光 irradiance
// =========================================================================
vec3 sample_irradiance(vec3 world_position, vec3 normal, vec3 camera_position) {

    // Wo 是从着色点指向摄像机的向量
    const vec3 Wo = normalize(camera_position.xyz - world_position);
    
    // 【关键点1: 表面偏置】
    // 为了防止“自阴影”或光照泄漏，将采样点沿着法线和视线方向稍微偏移。
    // 这可以避免在物体表面上直接采样，从而提高稳定性。
    const float minimum_distance_between_probes = 1.0f; // 探针间的最小距离，用于缩放偏移量
    vec3 bias_vector = (normal * 0.2f + Wo * 0.8f) * (0.75f * minimum_distance_between_probes) * self_shadow_bias;
    vec3 biased_world_position = world_position + bias_vector;

    // --- 探针网格定位与插值准备 ---

    // 根据偏移后的世界坐标，找到其所在的探针网格单元的基准索引（单元的最小角）
    ivec3 base_grid_indices = world_to_grid_indices(biased_world_position);
    // 获取该基准探针的世界坐标
    vec3 base_probe_world_position = grid_indices_to_world_no_offsets(base_grid_indices);

    // alpha: 计算采样点在探针网格单元内的相对位置 [0, 1]，用于后续的三线性插值
    vec3 alpha = clamp((biased_world_position - base_probe_world_position), vec3(0.0f), vec3(1.0f));

    vec3  sum_irradiance = vec3(0.0f); // 加权辐照度总和
    float sum_weight = 0.0f;           // 权重总和

    // 遍历环绕采样点的8个探针（形成一个立方体“笼子”）
    for (int i = 0; i < 8; ++i) {
        // 计算当前探针的偏移量 (0或1)，i的二进制位分别代表x,y,z轴的偏移
        ivec3 offset = ivec3(i, i >> 1, i >> 2) & ivec3(1);
        // 计算探针的网格坐标，并确保它在有效范围内
        ivec3 probe_grid_coord = clamp(base_grid_indices + offset, ivec3(0), probe_counts - ivec3(1));
        // 将网格坐标转换为一维索引
        int probe_index = probe_indices_to_index(probe_grid_coord);

        // 获取探针的实际世界坐标
        vec3 probe_pos = grid_indices_to_world(probe_grid_coord, probe_index);

        // --- 计算各项权重 ---
        float weight = 1.0;

        // 【关键点2: 方向系数】
        // 我们只是使用探针进行插值，因此背面的探针也会考虑。
        if (use_smooth_backface()) {
            vec3 direction_to_probe = normalize(probe_pos - world_position);
            // 使用 "wrap shading" 的思想，将 dot(dir, n) 从 [-1, 1] 映射到 [0, 1]
            const float dir_dot_n = (dot(direction_to_probe, normal) + 1.0) * 0.5f;
            // 通过平方和平滑因子，实现一个柔和的权重衰减，避免硬边
            weight *= (dir_dot_n * dir_dot_n) + 0.2;
        }

        // 【关键点3: 可见性权重 (VSM + Chebyshev)】
        // 检查探针和着色点之间是否存在遮挡物。
        vec3 probe_to_biased_point_direction = biased_world_position - probe_pos;
        float distance_to_biased_point = length(probe_to_biased_point_direction);
        probe_to_biased_point_direction /= distance_to_biased_point;

        if (use_visibility()) {
            // 从可见性纹理（一个存储深度的纹理图集）中采样
            vec2 uv = get_probe_uv(probe_to_biased_point_direction, probe_index, visibility_texture_width, visibility_texture_height, visibility_side_length);
            // .rg 通道存储了深度的均值(E[d])和平方均值(E[d^2])
            vec2 visibility = textureLod(global_textures[nonuniformEXT(grid_visibility_texture_index)], uv, 0).rg;
            float mean_distance_to_occluder = visibility.x; // 均值 μ

            float chebyshev_weight = 1.0; // 默认完全可见
            // 如果着色点比平均遮挡物更远，则可能被遮挡
            if (distance_to_biased_point > mean_distance_to_occluder) {
                // 计算方差 σ^2 = E[d^2] - (E[d])^2
                float variance = abs((visibility.x * visibility.x) - visibility.y);
                const float distance_diff = distance_to_biased_point - mean_distance_to_occluder;
                // 应用切比雪夫不等式计算光照透过率（即权重）
                chebyshev_weight = variance / (variance + (distance_diff * distance_diff));
                // 增强对比度，使阴影更明显
                chebyshev_weight = max((chebyshev_weight * chebyshev_weight * chebyshev_weight), 0.0f);
            }
            // 保证权重不完全为0，避免在全黑区域出现问题
            weight *= max(0.05f, chebyshev_weight);
        }
        
        // --- 采样与混合 ---

        // 【关键点4: 三线性插值权重】
        // 根据之前计算的alpha值，计算当前探针的三线性插值权重。
        // mix(1-a, a, offset) 是一个简洁的实现方式。
        vec3 trilinear = mix(1.0 - alpha, alpha, vec3(offset));
        weight *= trilinear.x * trilinear.y * trilinear.z + 0.001f; // +0.001f 避免权重为0

        // 采样预计算好的Irradiance纹理图集
        vec2 uv = get_probe_uv(normal, probe_index, irradiance_texture_width, irradiance_texture_height, irradiance_side_length);
        vec3 probe_irradiance = textureLod(global_textures[nonuniformEXT(grid_irradiance_output_index)], uv, 0).rgb;

        // 如果使用了感知编码，需要解码
        if (use_perceptual_encoding()) {
            probe_irradiance = pow(probe_irradiance, vec3(0.5f * 5.0f));
        }

        // 累加加权后的irradiance和总权重
        sum_irradiance += weight * probe_irradiance;
        sum_weight += weight;
    }

    // --- Finalize ---
    // 通过总权重进行归一化，得到最终混合后的irradiance
    vec3 net_irradiance = sum_irradiance / sum_weight;

    // 如果使用了感知编码，需要重新编码
    if (use_perceptual_encoding()) {
        net_irradiance = net_irradiance * net_irradiance;
    }

    // 最后乘以 PI 和一个缩放因子，这是漫反射BRDF积分的一部分
    vec3 irradiance = 0.5f * PI * net_irradiance * 0.95f;

    return irradiance;
}

layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // 获取当前线程处理的像素坐标
    ivec3 coords = ivec3(gl_GlobalInvocationID.xyz);

    // --- 半分辨率优化处理 ---
    int resolution_divider = output_resolution_half == 1 ? 2 : 1;
    vec2 screen_uv = uv_nearest(coords.xy, resolution / resolution_divider);
    
    float raw_depth = 1.0f;
    int chosen_hiresolution_sample_index = 0;
    // 如果启用半分辨率模式，从高分辨率深度图中采样4个点，选择最靠近摄像机的那个
    // 这是为了在升采样时，保留边缘（深度不连续处）的正确信息
    if (output_resolution_half == 1) {
        ivec2 pixel_offsets[] = ivec2[](ivec2(0,0), ivec2(0,1), ivec2(1,0), ivec2(1,1));
        float closer_depth = 1.f;
        for (int i = 0; i < 4; ++i) {
            float depth = texelFetch(global_textures[nonuniformEXT(depth_fullscreen_texture_index)], (coords.xy * 2) + pixel_offsets[i], 0).r;
            if (closer_depth > depth) {
                closer_depth = depth;
                chosen_hiresolution_sample_index = i;
            }
        }
        raw_depth = closer_depth;
    } else {
        // 全分辨率模式，直接采样
        raw_depth = texelFetch(global_textures[nonuniformEXT(depth_fullscreen_texture_index)], coords.xy, 0).r;
    }

    // 如果深度为1.0，说明是天空盒，直接输出黑色
    if (raw_depth == 1.0f) {
        imageStore(global_images_2d[indirect_output_index], coords.xy, vec4(0, 0, 0, 1));
        return;
    }

    // --- 重建表面属性 ---
    // 根据深度值重建世界坐标
    const vec3 pixel_world_position = world_position_from_depth(screen_uv, raw_depth, inverse_view_projection);
    
    // 获取对应像素的法线
    vec3 normal;
    if (output_resolution_half == 1) {
        // 半分辨率模式下，使用之前选定的高分辨率样本的法线
        vec2 encoded_normal = texelFetch(global_textures[nonuniformEXT(normal_texture_index)], (coords.xy * 2) + pixel_offsets[chosen_hiresolution_sample_index], 0).rg;
        normal = normalize(octahedral_decode(encoded_normal));
    } else {
        vec2 encoded_normal = texelFetch(global_textures[nonuniformEXT(normal_texture_index)], coords.xy, 0).rg;
        normal = octahedral_decode(encoded_normal);
    }
    
    // --- 调用核心函数计算并输出 ---
    vec3 irradiance = sample_irradiance(pixel_world_position, normal, camera_position.xyz);
    imageStore(global_images_2d[indirect_output_index], coords.xy, vec4(irradiance, 1));
}

```

动态漫反射全局光照（DDGI） 的核心思想是在场景中放置一个规则的探针网格（Probe Grid）。每个探针会预先计算并存储两样东西：

1.  环境光照（Irradiance）: 从各个方向到达该点的光照总量，通常存为一个低阶球谐函数或直接存为八面体贴图（Octahedral Map）。
2.  可见性/深度（Visibility/Depth）: 从探针位置向周围发射光线，记录遇到的第一个物体的平均距离和距离的方差。这本质上是为每个探针生成一张360度的深度图。

本代码片段执行的是渲染循环中的采样阶段：屏幕上的每个像素根据自己的位置，智能地混合周围探针预计算好的信息，来得到最终的间接光照。

### 三线性插值 (Trilinear Interpolation)

当一个着色点位于8个探针组成的立方体单元内部时，为了实现平滑的过渡，而不是在跨越探针边界时发生光照跳变，我们使用三线性插值。

  * **原理**: 它是在三维空间中的线性插值。可以看作先在X轴上对4对点进行线性插值，得到4个点；再在Y轴上对这4个点产生的2对点进行线性插值，得到2个点；最后在Z轴上对这2个点进行线性插值，得到最终结果。
  * **代码实现**: 代码中的 `vec3 alpha` 代表着色点在单元格内沿X, Y, Z轴的相对位置（0到1）。通过 `mix(1.0 - alpha, alpha, offset)` 和 `trilinear.x * trilinear.y * trilinear.z` 的组合，巧妙地计算了8个角点（探针）各自的权重。

### 方差阴影贴图 (Variance Shadow Mapping - VSM)

这是用于实现柔和、高质量阴影的经典技术，这里被用于判断探针与像素点的可见性。

  * **原理**: 传统阴影贴图只存储深度值 $d$，比较时会产生硬边和锯齿。VSM 不仅存储深度均值 $E[d] = \mu$ (代码中的 `visibility.x`)，还存储深度的平方均值 $E[d^2]$ (代码中的 `visibility.y`)。
  * **优势**: 有了这两个值（称为“矩”，Moments），就可以计算出深度的**方差** $\sigma^2 = E[d^2] - (E[d])^2$。方差描述了深度值的分布情况。如果方差很大，说明在这个方向上遮挡物的深度变化剧烈，阴影就应该更柔和。

### 切比雪夫不等式 (Chebyshev's Inequality)

这是VSM能够工作的数学基石，它利用均值和方差来估算概率。

  对于随机变量 $X$，其单边切比雪夫不等式为：
    $$P(X \ge t) \le \frac{\sigma^2}{\sigma^2 + (t - \mu)^2}$$
    其中 $\mu$ 是均值, $\sigma^2$ 是方差。这个公式给出了变量 $X$ 的值大于或等于某个值 $t$ 的概率上限。

  * **在代码中的应用**:

      * $t$ 是 **探针到当前着色点的距离** (`distance_to_biased_point`)。
      * $\mu$ 是 **探针在该方向上到平均遮挡物的距离** (`mean_distance_to_occluder`)。
      * 当 $t > \mu$ 时，我们怀疑点可能被遮挡了。
      * 代码 `variance / (variance + (distance_diff * distance_diff))` 正是这个不等式的直接应用。它计算出一个介于 [0, 1] 之间的“遮挡概率”或“光线透过率”，作为可见性权重。

## 计算探针的偏移和状态

```cpp
void updateProbeOffsetsAndStatus() {
    // --- 探针偏移计算 ---
    // 这是一个渐进式更新过程，只在需要时（gi_recalculate_offsets为true）启动，并持续数帧（24帧）以达到稳定。
    static i32 offsets_calculations_count = 24;
    if (render_scene->gi_recalculate_offsets) {
        offsets_calculations_count = 24; // 重新开始24帧的计算周期
    }

    // 如果仍在计算周期内，则执行偏移计算
    if (offsets_calculations_count >= 0) {
        --offsets_calculations_count;

        // 绑定管线和资源，准备写入探针偏移纹理

        // 向Shader传递一个标记，告知是否为本轮计算的第一帧
        u32 first_frame = (offsets_calculations_count == 23) ? 1 : 0;
        gpu_commands->push_constants(calculate_probe_offset_pipeline, 0, 4, &first_frame);

        // 为每个探针启动一个线程
        gpu_commands->dispatch(hydra::ceilu32(probe_count / 32.f), 1, 1);
    }

    // --- 探针状态计算 ---
    // 这个过程通常每帧都运行，以快速响应场景变化。
    
    // 绑定管线和资源，准备更新探针状态

    // 为每个探针启动一个线程
    gpu_commands->dispatch(hydra::ceilu32(probe_count / 32.f), 1, 1);
}
```

### 更新探针偏移

这个Shader的核心目标是：如果探针位置不佳（例如在墙内或离表面太近），就计算一个偏移量将它移动到更好的位置。

Offset纹理的大小为 `probe_count_x * probe_count_y, probe_count_z`。

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201312076.png)

```glsl
// 每个线程负责一个光照探针
layout (local_size_x = 32, local_size_y = 1, local_size_z = 1) in;
void main() {
    int probe_index = int(gl_GlobalInvocationID.x);
    if (probe_index >= total_probes) return; // 越界检查

    // --- 1. 分析光线追踪结果 ---
    // 遍历该探针的所有预追踪光线，分析命中信息
    // 命中信息来自一个前置的光追Pass，其.w分量存储了距离。约定：w > 0 为正面，w < 0 为背面。
    int closest_backface_index = -1;      // 最近的背面光线索引
    float closest_backface_distance = 100000000.f; // 最近的背面距离
    int closest_frontface_index = -1;     // 最近的正面光线索引
    float closest_frontface_distance = 100000000.f; // 最近的正面距离
    int farthest_frontface_index = -1;    // 最远的正面光线索引
    float farthest_frontface_distance = 0; // 最远的正面距离
    int backfaces_count = 0;              // 背面命中总数

    for (int ray_index = 0; ray_index < probe_rays; ++ray_index) {
        ivec2 ray_tex_coord = ivec2(ray_index, probe_index);
        float ray_distance = texelFetch(global_textures[nonuniformEXT(radiance_output_index)], ray_tex_coord, 0).w;

        if (ray_distance <= 0.0f) { // 命中背面
            ++backfaces_count;
            float dist = -ray_distance;
            if (dist < closest_backface_distance) {
                closest_backface_distance = dist;
                closest_backface_index = ray_index;
            }
        } else { // 命中正面
            if (ray_distance < closest_frontface_distance) {
                closest_frontface_distance = ray_distance;
                closest_frontface_index = ray_index;
            }
            if (ray_distance > farthest_frontface_distance) { // 注意这里是 if 不是 else if
                farthest_frontface_distance = ray_distance;
                farthest_frontface_index = ray_index;
            }
        }
    }

    // --- 2. 基于启发式规则计算新偏移 ---
    vec3 full_offset = vec3(10000.f); // 初始设为无效值
    vec3 cell_offset_limit = max_probe_offset * probe_spacing; // 偏移不能超出探针单元格太多

    // 读取上一帧的偏移量，实现渐进式更新
    vec4 current_offset = vec4(0);
    if (first_frame == 0) {
        // ... (从纹理中读取 current_offset.rgb)
    }

    // 【启发式规则 1: 探针在墙内】
    // 如果超过1/4的光线击中背面，我们认为探针在几何体内。
    const bool inside_geometry = (float(backfaces_count) / float(probe_rays)) > 0.25f;
    if (inside_geometry && (closest_backface_index != -1)) {
        // 目标：将探针沿“最近的背面”的反方向推出。
        const vec3 closest_backface_direction = closest_backface_distance * normalize(mat3(random_rotation) * spherical_fibonacci(closest_backface_index, probe_rays));
        // ... (计算推出的距离因子 direction_scale_factor)
        // 新偏移 = 当前偏移 - 推出的向量 (减号代表反方向)
        full_offset = current_offset.xyz - closest_backface_direction * direction_scale_factor;
    }
    // 【启发式规则 2: 探针离墙太近】
    else if (closest_frontface_distance < 0.05f) {
        // 目标：将探针沿“最远的视线方向”移动，即推向更开阔的空间。
        const vec3 farthest_direction = min(0.2f, farthest_frontface_distance) * normalize(mat3(random_rotation) * spherical_fibonacci(farthest_frontface_index, probe_rays));
        const vec3 closest_direction = normalize(mat3(random_rotation) * spherical_fibonacci(closest_frontface_index, probe_rays));
        // 如果最远和最近方向大致相反（点积小），才进行移动，避免在角落里抖动
        if (dot(farthest_direction, closest_direction) < 0.5f) {
            full_offset = current_offset.xyz + farthest_direction;
        }
    } 

    // --- 3. 应用并写回新偏移 ---
    // 只有当计算出的新偏移在合理范围内时，才更新它
    if (all(lessThan(abs(full_offset), cell_offset_limit))) {
        current_offset.xyz = full_offset;
    }
    // 将最终偏移写回纹理
    imageStore(global_images_2d[probe_offset_texture_index], /* ... coords ... */, current_offset);
}
```

### 更新探针状态

这个Shader的目标是判断每个探针应该是激活状态（参与光照计算）还是关闭状态（在空旷区域或墙内，可以跳过）。

```glsl
// 每个线程负责一个光照探针
layout (local_size_x = 32, local_size_y = 1, local_size_z = 1) in;
void main() {
    int probe_index = int(gl_GlobalInvocationID.x);
    // ... (越界检查)

    // --- 1. 分析光线追踪结果 (与上一个Shader类似) ---
    int backfaces_count = 0;
    float closest_frontface_distance = 100000000.f;
    // ... (省略类似的循环和变量来查找背面命中数和最近正面距离)
    for (int ray_index = 0; ray_index < probe_rays; ++ray_index) {
        // ...
    }

    // --- 2. 基于启发式规则判断状态 ---
    // 读取上一帧的状态
    uint flag = probe_status[probe_index]; 
    // 定义一个有效着色范围，如果命中点在此范围内，探针就应该激活
    vec3 outerBounds = normalize(probe_spacing) * (length(probe_spacing) + (2.0f * self_shadow_bias));

    // 重新检查所有正面命中
    for (int ray_index = 0; ray_index < probe_rays; ++ray_index) {
        float d_front = /* ... texelFetch ... */;
        if (d_front > 0.0f) {
            vec3 frontFaceDirection = d_front * normalize(mat3(random_rotation) * spherical_fibonacci(ray_index, probe_rays));
            // 【规则1: 激活】如果任何一个命中点在有效范围内，说明此探针能影响附近表面，激活它。
            if (all(lessThan(abs(frontFaceDirection), outerBounds))) {
                flag = PROBE_STATUS_ACTIVE;
            }
        }
    }

    // 【规则2: 关闭】如果探针在墙内，关闭它。
    if (closest_backface_index != -1 && (float(backfaces_count) / float(probe_rays)) > 0.25f) {
        flag = PROBE_STATUS_OFF;
    }
    // 【规则3: 关闭】如果探针什么正面都没看到（例如在天空或空旷区域），关闭它。
    else if (closest_frontface_index == -1) {
        flag = PROBE_STATUS_OFF;
    }
    // 【规则4: 激活】如果探针离某个表面非常近，激活它。
    else if (closest_frontface_distance < 0.05f) {
        flag = PROBE_STATUS_ACTIVE;
    } 

    // --- 3. 写回新状态 ---
    probe_status[probe_index] = flag;
}
```

整个决策过程并非精确的物理模拟，而是基于一套高效的**启发式规则（经验法则）**。这些规则是通过观察和实验总结出来的，能在保证速度的同时达到很好的效果。

  * `"backfaces_count / probe_rays > 0.25f"` 就是一个典型的启发式规则，它简单快速地判断出“探针大概率在几何体内”。
  * “沿最远视线方向移动”也是一个聪明的做法，它能引导探针自动寻找并移动到局部空间的中心位置。

# Ray Traced Shadows

[Ray Traced Shadows: Maintaining Real-Time Frame Rates](https://www.cg.tuwien.ac.at/research/publications/2019/BOKSANSKY-2019-RTS/).

## 工作流程

1. **Variance History:** 计算并存储过去四帧的可见性方差。
2. **Sample Count Estimation:** 使用最大滤波器和帐篷滤波器估计每个片段和每个光源的采样数量。
3. **Inline Ray Tracing:** 使用采样数量追踪阴影射线到场景中，以获取原始可见性值。
4. **Denoising:** 对原始可见性进行时间和空间滤波，以减少噪声。
5. **Lighting Integration:** 在最终的光照计算中使用滤波后的阴影可见性。

## 计算可见性方差

这个步骤是整个实时光线追踪阴影算法的起点，其核心思想是**识别出画面中哪些区域的阴影正在发生变化或处于不稳定状态**，从而在后续步骤中对这些区域投入更多的计算资源（发射更多的光线），对稳定区域则使用较少的资源，实现性能与效果的平衡。

```glsl
/**
 * @brief  计算阴影可见性的方差（Variance）。
 *
 * @details 该计算着色器通过分析前四帧的阴影可见性历史数据，来计算每个像素的可见性方差。
 * 这个方差值实际上是一个简化的衡量标准（取最大值与最小值的差），用于表示阴影的“不稳定性”。
 * 结果将被存储到一个新的纹理中，供后续的采样数估算步骤使用。
 * 此过程在半分辨率下运行以提高性能。
 */

// 定义计算着色器的本地工作组大小为 8x8x1。
// 意味着每个工作组包含 64 个着色器调用（线程）。
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // --- 1. 计算当前处理的像素坐标 ---

    // 获取目标纹理的分辨率（半分辨率）。
    ivec2 iresolution = ivec2(resolution * 0.5);

    // 检查当前着色器调用（线程）是否在目标纹理的有效范围内。
    // 如果超出范围，则直接返回，不做任何处理。
    // gl_GlobalInvocationID 是当前线程在整个网格中的唯一ID。
    if (gl_GlobalInvocationID.x >= iresolution.x || gl_GlobalInvocationID.y >= iresolution.y) {
        return;
    }

    // 将全局调用ID转换为纹理坐标，用于读取和写入。
    ivec3 tex_coord = ivec3(gl_GlobalInvocationID.xyz);


    // --- 2. 读取历史可见性数据 ---

    // 从3D纹理（实际上用作2D纹理数组）中读取存储的前四帧的可见性数据。
    // texelFetch 用于精确获取指定整数坐标的纹素值，无需归一化。
    // `visibility_cache_texture_index` 是一个全局uniform变量，指向包含历史数据的纹理。
    // 返回的 vec4 中，每个分量（x, y, z, w）分别代表了过去某一帧的可见性值（0.0为完全阴影，1.0为完全照亮）。
    vec4 last_visibility_values = texelFetch(global_textures_3d[visibility_cache_texture_index], tex_coord, 0);


    // --- 3. 计算可见性方差 ---

    // 找到这四帧可见性中的最大值。
    float max_v = max(max(last_visibility_values.x, last_visibility_values.y), max(last_visibility_values.z, last_visibility_values.w));

    // 找到这四帧可见性中的最小值。
    float min_v = min(min(last_visibility_values.x, last_visibility_values.y), min(last_visibility_values.z, last_visibility_values.w));

    // 计算最大值与最小值之差。这个差值（delta）被用作方差的近似衡量。
    // 如果差值大，说明在过去几帧里，该像素的阴影状态变化剧烈（例如，从全亮到全黑）。
    // 如果差值小，说明阴影状态很稳定。
    float delta = max_v - min_v;


    // --- 4. 存储计算结果 ---

    // 将计算出的方差值（delta）写入到输出图像（Image）中。
    // imageStore 用于向指定整数坐标的图像写入数据。
    // `variation_texture_index` 指向用于存储方差结果的纹理。
    // 这里只使用了vec4的第一个分量（r通道）来存储delta。
    imageStore(global_images_3d[variation_texture_index], tex_coord, vec4(delta, 0.0, 0.0, 0.0));
}
```

## 计算阴影可见性

这是整个流程的心脏。它接收前一阶段生成的“方差图”，经过一系列复杂的滤波处理，智能地为每个像素决定需要发射多少条阴影光线，然后调用光线追踪硬件进行计算，最后更新历史数据以供下一帧使用。

```glsl
/**
 * @brief  估算采样数、执行光追并更新历史缓存。
 *
 * @details
 * 该着色器是自适应光追阴影的核心。其主要工作包括：
 * 1. (空间滤波) 对上一阶段的方差图进行最大值滤波和帐篷滤波，以平滑和扩大不稳定的区域。
 * 2. (时间滤波) 将滤波后的方差与历史数据结合，进一步稳定信号。
 * 3. (采样数估算) 根据最终的稳定方差值，动态地增加或减少每个像素的阴影光线采样数。
 * 4. (光线追踪) 根据估算出的采样数，调用光线追踪函数，计算当前像素的原始阴影可见性。
 * 5. (更新缓存) 将本帧计算出的新数据（可见性、方差、采样数）写入历史缓存，供下一帧使用。
 */

// 定义工作组大小为 8x8
#define GROUP_SIZE 8
// 定义共享内存大小，需要比工作组大，以容纳邻域数据 (8 + 6*2 = 20)
#define LOCAL_DATA_SIZE (GROUP_SIZE + 6 * 2)

layout (local_size_x = GROUP_SIZE, local_size_y = GROUP_SIZE, local_size_z = 1) in;

// 声明共享内存，用于在工作组内高效地共享像素数据，避免重复读取全局内存
shared float local_image_data[LOCAL_DATA_SIZE][LOCAL_DATA_SIZE];
shared float local_max_image_data[LOCAL_DATA_SIZE][LOCAL_DATA_SIZE];

// [! 为了篇幅，此处省略 max_filter, read_variation_value, tent_kernel 的定义 !]
// [! 它们的功能将在下面的原理解析中详细说明 !]

void main() {
    // --- 准备工作：坐标计算与边界检查 ---
    ivec2 iresolution = ivec2(resolution * 0.5);
    if (gl_GlobalInvocationID.x >= iresolution.x || gl_GlobalInvocationID.y >= iresolution.y)
        return;

    ivec3 local_index = ivec3(gl_LocalInvocationID.xyz) + ivec3(6, 6, 0);
    ivec3 global_index = ivec3(gl_GlobalInvocationID.xyz);

    // --- 第 1 步：加载方差数据到共享内存 (优化) ---
    // 每个线程负责将自己的方差值读入共享内存。
    // 边界上的线程会额外加载邻域数据，供整个工作组使用。
    // ... 此处省略了复杂的邻域加载代码，其目的是将一个更大的区域(20x20)读入共享内存 ...
    // local_image_data[...][...] = texelFetch(variation_texture_index, ...);
    
    // 同步点：确保所有线程都已将数据写入共享内存，才能继续
    memoryBarrierShared();
    barrier();

    // --- 第 2 步：空间滤波 - 最大值滤波 (Max Filter) + 帐篷滤波 (Tent Filter) ---

    // 2.1 对原始方差图进行 5x5 最大值滤波。
    // 这会“扩张”不稳定的区域，确保阴影边缘得到充分处理。
    float max_filtered_value = max_filter(local_index);
    local_max_image_data[local_index.y][local_index.x] = max_filtered_value;
    
    // 同步点：确保最大值滤波完成
    memoryBarrierShared();
    barrier();

    // 2.2 对最大值滤波的结果再进行 13x13 帐篷滤波（加权平均）。
    // 这会进一步平滑和模糊方差信号，使其变化更平缓。
    // `tent_kernel` 是一个预计算的权重矩阵。
    float spatial_filtered_value = 0.0;
    // ... 此处省略了 tent filter 的循环代码，它将 local_max_image_data 与 tent_kernel 相乘求和 ...
    // spatial_filtered_value = a_sum_of(local_max_image_data * tent_kernel);

    // --- 第 3 步：时间滤波 ---
    // 读取上一帧的滤波后方差历史值
    vec4 last_variation_values = texelFetch(global_textures_3d[variation_cache_texture_index], global_index, 0);
    // 将当前帧的空间滤波结果与历史结果进行混合，得到一个更稳定的最终方差信号。
    float final_filtered_value = 0.5 * (spatial_filtered_value + 0.25 * (last_variation_values.x + last_variation_values.y + last_variation_values.z + last_variation_values.w));
    
    // 从G-Buffer读取运动矢量。-1.0 是一个标记，表示该像素没有有效的历史。
    float motion_vectors_value = texelFetch(global_textures[motion_vectors_texture_index], ...).r;

    // --- 第 4 步：采样数量估算 ---
    uint sample_count;

    // ===================================================================
    // 分支 1: 历史有效 (Temporal Reprojection is Successful)
    // ===================================================================
    if (motion_vectors_value.r != -1.0) {
        // 继承上一帧的采样数作为基础
        uvec4 sample_count_history = texelFetch(..., samples_count_cache_texture_index, ...);
        sample_count = sample_count_history.x;

        // 检查历史是否稳定
        bool stable_sample_count = (sample_count_history.x == sample_count_history.y) && ...;
        
        // 对天空盒等特殊情况做处理
        if (raw_depth == 1.0f) {
            sample_count = 0;
        } 
        // 应用带有“惯性”的调整逻辑 (Hysteresis)
        else {
            // 如果方差大，增加采样数
            if (filtered_value > delta && sample_count < MAX_SHADOW_VISIBILITY_SAMPLE_COUNT) {
                sample_count += 1;
            } 
            // 如果方差小且历史稳定，减少采样数
            else if (stable_sample_count && sample_count >= 1 && (filtered_value < delta)) {
                sample_count -= 1;
            }
            // 保证最少有1个采样
            sample_count = max(sample_count, 1u);
        }
    } 
    // ===================================================================
    // 分支 2: 历史无效 (Disocclusion Detected)
    // ===================================================================
    else {
        // 对于没有历史的“新”像素，我们无法预测其复杂度。
        // 采取保守策略：直接使用最大采样数，以保证第一次出现的质量，避免闪烁。
        sample_count = MAX_SHADOW_VISIBILITY_SAMPLE_COUNT;
    }

    // --- 第 5 步：执行光线追踪 ---
    float visibility = 0.0;
    if (sample_count > 0) {
        // 准备光追所需数据：世界坐标、法线等
        const vec3 pixel_world_position = ...;
        const vec3 normal = ...;
        
        // 根据灯光类型，调用不同的光追函数
        if (is_raytrace_shadow_point_light()) {
            visibility = get_point_light_visibility(..., sample_count, ...);
        } else {
            visibility = get_directional_light_visibility(..., sample_count, ...);
        }
    }

    // --- 第 6 步：更新所有历史缓存 ---
    // 更新可见性历史、方差历史和采样数历史，将当前帧的数据推入队列
    
    vec4 new_visibility_history;

    // ===================================================================
    // 分支 1: 历史有效
    // ===================================================================
    if (motion_vectors_value.r != -1.0) {
        // 读取旧的历史值
        new_visibility_history = texelFetch(..., visibility_cache_texture_index, ...);
        
        // 将历史数据像队列一样前移一位
        new_visibility_history.w = new_visibility_history.z;
        new_visibility_history.z = new_visibility_history.y;
        new_visibility_history.y = new_visibility_history.x;
    } 
    // ===================================================================
    // 分支 2: 历史无效
    // ===================================================================
    else {
        // 历史数据是错误的（属于上一个物体），必须被丢弃。
        // 直接用当前帧计算出的新可见性值，填满整个历史记录。
        // 这相当于重置(reset)了这个像素的时间滤波器，防止产生鬼影(ghosting)。
        new_visibility_history.w = visibility;
        new_visibility_history.z = visibility;
        new_visibility_history.y = visibility;
    }
    // 无论哪个分支，都把当前帧的新可见性值放到历史记录的第一位
    new_visibility_history.x = visibility;
    

    // ... 此处省略了繁琐的历史数据更新和 imageStore 写入代码 ...
    // imageStore(visibility_cache_texture_index, ..., new_visibility_history);
    // imageStore(filtered_variation_texture_index, ..., vec4(spatial_filtered_value, 0, 0, 0));
    // imageStore(variation_cache_texture_index, ..., new_variation_history);
    // imageStore(samples_count_cache_texture_index, ..., new_sample_count_history);
}
```

方差 (Variation)
![variation](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201755949.png)

滤波后方差 (Filtered Variation)
![filtered_variation](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201753791.png)

方差缓存 (Variation History)
![variation_cache](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201801410.png)

可见性缓存 (Visibility History)
![visibility_cache](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201758141.png)

采样数缓存 (Samples Count History)
![samples_count_cache](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201759184.png)

### Motion Vectors

计算**运动矢量 (Motion Vector)** 的计算着色器代码。

这个 Pass 在渲染管线中扮演着至关重要的角色，它是所有**时间性技术 (Temporal Techniques)**，如 TAA（时间性抗锯齿）和 SVGF（时空方差引导滤波）的基石。它的核心任务是为屏幕上的每个像素计算一个2D向量，这个向量描述了该像素上的物体从上一帧到当前帧在屏幕空间中移动的方向和距离。

值得注意的是，这段代码实际上计算并输出了**两种**不同的运动矢量，分别用于不同的目的。

```glsl
/**
 * @brief  计算屏幕空间的运动矢量。
 *
 * @details
 * 该计算着色器通过比较当前帧和上一帧的顶点位置，为每个像素生成运动矢量。
 * 它会输出两种运动矢量：
 * 1. 标准运动矢量：用于 TAA，精确计算了物体运动并移除了相机抖动(Jitter)的影响。
 * 2. 可见性运动矢量：用于阴影等需要历史有效性判断的场景，如果重投影不合法，
 * 则存入一个特殊标记(-1, -1)。
 */

// 输出目标：一个用于TAA的标准运动矢量纹理
layout(rg16f, set = MATERIAL_SET, binding = 51) uniform image2D motion_vectors;
// 输出目标：一个用于可见性/阴影缓冲区的运动矢量纹理
layout(rg16f, set = MATERIAL_SET, binding = 52) uniform image2D visibility_motion_vectors;

layout(set = MATERIAL_SET, binding = 53) uniform sampler2D normals_texture;

layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    ivec3 pos = ivec3(gl_GlobalInvocationID.xyz);

    // --- 第 1 步：重建当前像素的世界坐标 ---
    const float raw_depth = texelFetch(global_textures[nonuniformEXT(depth_texture_index)], pos.xy, 0).r;
    // 如果是天空盒或背景，则没有运动，直接返回。
    if (raw_depth == 1.0) {
        imageStore(motion_vectors, pos.xy, vec4(0));
        imageStore(visibility_motion_vectors, pos.xy, vec4(-1, -1, 0, 0)); // 标记为无效
        return;
    }
    const vec2 screen_uv = uv_nearest(pos.xy, resolution);
    const vec3 pixel_world_position = world_position_from_depth(screen_uv, raw_depth, inverse_view_projection);

    // --- 第 2 步：计算当前和历史的NDC坐标 ---
    // 计算当前像素在当前帧的NDC（归一化设备坐标，范围[-1, 1]）坐标。
    vec4 current_position_ndc = vec4(ndc_from_uv_raw_depth(screen_uv, raw_depth), 1.0f);
    // 将当前世界坐标用【上一帧】的视图投影矩阵进行变换，得到该点在【上一帧】的NDC坐标。
    vec4 previous_position_ndc = previous_view_projection * vec4(pixel_world_position, 1.0f);
    previous_position_ndc.xyz /= previous_position_ndc.w; // 执行透视除法

    // ===================================================================
    // 任务 A: 计算标准运动矢量 (用于 TAA)
    // ===================================================================
    // 2D运动矢量即为两帧NDC坐标的xy差值。
    vec2 velocity = current_position_ndc.xy - previous_position_ndc.xy;

    // 为了实现 TAA，每一帧的投影矩阵都会有一个亚像素级别的抖动(Jitter)。
    // 计算出的速度必须减去这个相机抖动带来的位移，以得到物体纯粹的运动。
    vec2 jitter_difference = (jitter_xy - previous_jitter_xy) * 0.5f;
    velocity -= jitter_difference;

    // 将最终的、经过抖动校正的运动矢量写入纹理。
    imageStore(motion_vectors, pos.xy, vec4(velocity, 0, 0));

    // ===================================================================
    // 任务 B: 计算可见性运动矢量 (用于阴影)
    // ===================================================================
    // 这是一个带有效性检查的运动矢量。
    // 首先，计算两帧之间归一化的深度差异。
    float depth_diff = abs(1.0 - (previous_position_ndc.z / current_position_ndc.z));

    // 然后，计算一个自适应的深度差异阈值 eps。
    // 这个阈值会根据表面法线与视线夹角（view_normal.z）动态变化。
    // 表面越是正对屏幕，eps越大，容差越高。
    vec3 normal = octahedral_decode(texelFetch(normals_texture, pos.xy, 0).rg);
    vec4 view_normal = world_to_camera * vec4(normal, 0.0);
    float c1 = 0.003, c2 = 0.017;
    float eps = c1 + c2 * abs(view_normal.z);

    // 如果深度差异在容差范围内，则认为重投影有效，存储原始的运动矢量。
    // 否则，认为发生了遮挡剔除 (disocclusion)，存入一个特殊标记值 (-1, -1)。
    vec2 visibility_motion = depth_diff < eps ? (current_position_ndc.xy - previous_position_ndc.xy) : vec2(-1, -1);
    
    imageStore(visibility_motion_vectors, pos.xy, vec4(visibility_motion, 0, 0));
}
```

#### 第一部分：计算标准运动矢量 (用于TAA)

1.  **重建世界坐标**: 首先，着色器利用深度图和当前帧的相机逆矩阵，从2D屏幕坐标反推出该像素在3D世界中的坐标 `pixel_world_position`。
2.  **计算今/昔NDC坐标**:
      * **当前NDC**: 将当前像素的UV和深度直接转换为当前帧的NDC坐标。
      * **历史NDC**: 这是最关键的一步。它拿起当前点的3D世界坐标，问一个问题：“在**上一帧**的相机视角下，这个3D点会被投影到屏幕的哪个位置？” 它通过将 `pixel_world_position` 乘以 `previous_view_projection` (上一帧的视图投影矩阵) 来得到答案。
3.  **计算原始速度**: 两个NDC坐标的 `xy` 分量之差，`current_position_ndc.xy - previous_position_ndc.xy`，就是该点在屏幕上从上一帧到当前帧的移动向量。
4.  **移除相机抖动 (Jitter Correction)**: TAA为了达到超采样效果，每帧都会对相机做亚像素级别的微小平移（Jitter）。这个平移也会体现在运动矢量中。为了只保留物体的纯粹运动，必须减去两帧之间相机抖动的差值 `jitter_difference`。
5.  **存储结果**: 最终得到的 `velocity` 被写入 `motion_vectors` 纹理，供 TAA Pass 使用。

#### 第二部分：计算可见性运动矢量 (用于阴影)

1.  **计算深度差异**: 它比较了重投影后的历史NDC深度 `previous_position_ndc.z` 和当前NDC深度 `current_position_ndc.z`。如果两者差异巨大，通常意味着这个像素在上一帧被其他物体遮挡了。
2.  **计算自适应阈值**: 为了让深度比较更鲁棒，它没有使用固定的阈值，而是根据表面的朝向计算了一个动态阈值 `eps`。
3.  **有效性判断**: 如果深度差异小于这个自适应阈值，就认为历史数据是有效的，存储一个**未经抖动校正**的运动矢量。
4.  **存储结果或标记**: 如果深度差异过大，就存入一个特殊的标记值 `vec2(-1, -1)`。后续的 Pass（如我们之前分析过的阴影和SVGF Pass）在读取这个纹理时，一旦看到 `(-1, -1)`，就知道这个像素的历史数据不可信，需要丢弃。

时间性算法最大的敌人就是**遮挡剔除 (Disocclusion)**，即前景物体移开，暴露出新的背景。此时，新的背景像素如果错误地重投影，就会采样到前景物体的历史颜色，产生鬼影。
  * `visibility_motion_vectors` 纹理就是为了解决这个问题而生的。它不仅仅是速度，更是一个**带有“有效/无效”状态的速度**。
  * 通过比较深度，可以非常可靠地检测出 Disocclusion 事件。当后续的着色器需要复用历史时，它会先检查这个运动矢量是否为 `(-1, -1)`，从而做出是“复用”还是“丢弃”历史的正确决策。

### 光线追踪辅助函数


```glsl
/**
 * @brief  为点光源计算阴影可见性（软阴影）。
 * @param light_index       当前处理的点光源索引（未使用，但可能用于多光源场景）。
 * @param sample_count      根据方差估算出的，需要为此像素发射的光线数量。
 * @param world_position    当前像素在世界坐标系中的位置。
 * @param normal            当前像素表面的法线。
 * @param frame_index       当前帧的索引，用于在泊松盘采样中实现时间上的抖动。
 * @return float            最终的可见性（0.0为完全阴影，1.0为完全照亮）。
 */
float get_point_light_visibility(uint light_index, uint sample_count, vec3 world_position, vec3 normal, uint frame_index) {
    // --- 1. 计算基础光照几何信息 ---

    // 计算从像素表面指向光源的向量。
    const vec3 position_to_light = raytraced_shadow_light_position - world_position;
    // 归一化该向量，得到标准的光线方向 'l'。
    const vec3 l = normalize(position_to_light);
    // 计算法线与光线方向的点积 (N dot L)。如果小于0，说明表面背向光源。
    const float NoL = dot(normal, l);
    // 计算像素到光源的实际距离 'd'。
    const float distance_to_light = length(position_to_light);

    // --- 2. 构建采样所需的坐标系 ---

    // 为了在垂直于光线方向的平面上进行随机采样（模拟光源面积），
    // 我们需要构建一个局部坐标系。
    // 首先，通过与一个固定的'up'向量（这里用Y轴）进行叉乘，得到x轴。
    vec3 x_axis = normalize(cross(l, vec3(0.0f, 1.0f, 0.0f)));
    // 再次叉乘，得到与x轴和光线方向都垂直的y轴。
    vec3 y_axis = normalize(cross(x_axis, l));

    // --- 3. 初始化并进行光照剔除/衰减检查 ---

    float visibility = 0.0; // 初始化可见性累加器

    // 获取点光源的半径（影响范围）。
    const float light_radius = raytraced_shadow_light_radius;
    // 计算基于距离平方反比的光照衰减。
    float attenuation = attenuation_square_falloff(position_to_light, 1.0f / light_radius);

    // 为了模拟光源的体积，计算一个缩放因子。
    // 距离光源越近，光源看起来越大，因此软阴影的半影区域也应该越宽。
    // 这个因子用于调整随机采样点的偏移范围。
    const float scaled_distance = light_radius / distance_to_light;

    // *** 核心性能优化与有效性检查 ***
    // 只有同时满足以下所有条件，才进行昂贵的光线追踪计算：
    // 1. NoL > 0.001f:         表面必须朝向光源。
    // 2. distance_to_light <= light_radius: 像素必须在光源的影响半径之内。
    // 3. attenuation > 0.001f:  光照衰减后的强度足够大，值得计算。
    if ((NoL > 0.001f) && (distance_to_light <= light_radius) && (attenuation > 0.001f)) {
        
        // --- 4. 循环执行光线追踪 ---
        for (uint s = 0; s < sample_count; ++s) {

            // 从预计算的泊松盘采样表中获取一个2D随机点。
            // `(s * FRAME_HISTORY_COUNT + frame_index) % SAMPLE_NUM` 确保每一帧、每一次采样的随机点都不同。
            vec2 poisson_sample = POISSON_SAMPLES[(s * FRAME_HISTORY_COUNT + frame_index) % SAMPLE_NUM];
            
            // 将2D随机点映射到我们之前构建的3D坐标系上，并根据距离进行缩放，模拟光源的表观大小。
            // 这会产生一个指向光源虚拟面积上某个随机点的偏移向量。
            vec3 random_x = x_axis * poisson_sample.x * (scaled_distance) * 0.01; // 0.01是人为调整的缩放系数
            vec3 random_y = y_axis * poisson_sample.y * (scaled_distance) * 0.01;
            
            // 将原始光线方向与随机偏移结合，得到一条抖动后的新光线方向。
            vec3 random_dir = normalize(l + random_x + random_y);

            // 初始化光线查询
            rayQueryEXT rayQuery;
            rayQueryInitializeEXT(rayQuery, as, gl_RayFlagsOpaqueEXT | gl_RayFlagsTerminateOnFirstHitEXT,
                                  0xff,                // mask: 追踪所有不透明物体
                                  world_position,      // origin: 光线起点
                                  0.05,                // tMin:   最小距离，防止自相交
                                  random_dir,          // dir:    光线方向
                                  distance_to_light);  // tMax:   最大距离，光线只需追踪到光源位置即可
            
            // 执行光线追踪
            rayQueryProceedEXT(rayQuery);

            // 检查光线是否在到达光源前被遮挡
            if (rayQueryGetIntersectionTypeEXT(rayQuery, true) != gl_RayQueryCommittedIntersectionNoneEXT) {
                // 如果有交点，需要进一步判断交点是否真的在光源前面
                visibility += rayQueryGetIntersectionTEXT(rayQuery, true) < distance_to_light ? 0.0f : 1.0f;
            } else {
                // 如果没有命中任何物体，说明这条光路是通畅的
                visibility += 1.0f;
            }
        }
    }

    // --- 5. 返回最终结果 ---
    // 返回平均可见度。如果循环未执行，visibility为0，结果正确。
    return visibility / float(sample_count);
}
```
### 共享内存优化 (Shared Memory)

  * **目的**：为了进行最大值和帐篷滤波，每个线程都需要读取其周围邻居像素的方差值。如果每个线程都直接从全局纹理内存中读取所有邻居数据，会导致大量的重复读取和高延迟。
  * **技术**：`shared` 内存是 GPU 上一种速度极快的小容量内存，由同一个工作组（Workgroup）内的所有线程共享。该着色器首先让工作组内的线程协作，将计算所需的一大块区域数据从慢速的全局内存一次性读入快速的共享内存。之后，所有的滤波操作都直接在共享内存上进行，速度得到极大提升。`barrier()`同步原语确保了所有线程在读写步骤上保持一致。

### 空间滤波：扩张与平滑

  * **最大值滤波 (Max Filter)**：这是一种**形态学扩张 (Dilation)** 操作。它将一个像素的值替换为其 5x5 邻域内的最大值。
      * **作用**：如果一个像素的方差很高（不稳定），经过最大值滤波后，它周围的像素也会被“感染”成高方差。这会**有效扩大需要高采样率的区域**，形成一个“安全边界”，防止因为物体移动过快而导致阴影边缘出现采样不足的闪烁噪点。
  * **帐篷滤波 (Tent Filter)**：这是一个加权平均的**卷积滤波**，其权重从中心到边缘线性递减，形状像一个帐篷。
      * **作用**：它对最大值滤波后的结果进行**平滑/模糊**处理。这可以防止采样数量在相邻像素间发生剧烈跳变（比如从1突变到16），让采样数的过渡更加平缓自然，避免产生块状的视觉瑕疵。

### 采样数估算的“时间滞后效应” (Hysteresis)

代码中最核心的决策逻辑是动态调整`sample_count`。它并没有简单地设置一个阈值，而是采用了带有“记忆”和“惯性”的策略，这在控制理论中称为**滞后 (Hysteresis)**。

  * **增加采样**：条件很简单，只要`final_filtered_value > delta_threshold`，就增加采样数。系统对“不稳定”信号的反应非常灵敏。
  * **减少采样**：条件非常苛刻，必须同时满足 `filtered_value < delta_threshold` **并且** `stable_sample_count` 为真（即过去四帧的采样数都一样）。
  * **目的**：这种不对称的逻辑可以防止采样数在阈值附近不停地抖动。一旦一个区域被判定为不稳定，它会保持较高的采样数一段时间，直到系统确认该区域**持续稳定**后，才敢慢慢降低采样数。这极大地增强了最终画面的时间稳定性。

## 降噪

这个着色器是一个典型的**时空降噪 (Spatio-temporal Denoising)** 滤波器。它的目标是将在上一个 Pass 中用少量光线计算出的、充满噪点的原始可见性图，处理成一幅干净、稳定且保留了细节的最终阴影图。


```glsl
/**
 * @brief  对光线追踪生成的原始阴影可见性进行时空降噪。
 *
 * @details
 * 该着色器结合了时间和空间两种维度的滤波来消除阴影噪点。
 * 1. (时间滤波) 首先，它对一个像素过去四帧的可见性结果取平均值，获得一个初步稳定的基准值。
 * 2. (空间滤波) 接着，它对时间滤波后的结果进行一个带边缘检测的5x5高斯模糊。
 * 这个“边缘检测”通过比较像素间的法线来实现，防止模糊效果跨越几何边缘，从而保护场景细节。
 * 最终输出一张干净平滑的阴影图，用于最终的光照合成。
 */

// 定义工作组大小 8x8
#define GROUP_SIZE 8
// 共享内存大小，需要比工作组大，以容纳 5x5 滤波核所需的邻域数据 (8 + 2*2 = 12)
#define LOCAL_DATA_SIZE (GROUP_SIZE + 2 * 2)

layout (local_size_x = GROUP_SIZE, local_size_y = GROUP_SIZE, local_size_z = 1) in;

// 预计算的 5x5 高斯核权重
float gaussian_kernel[5][5] = { ... };

// 声明共享内存，用于高效缓存邻域的可见性和法线数据
shared float local_image_data[LOCAL_DATA_SIZE][LOCAL_DATA_SIZE];
shared vec3  local_normal_data[LOCAL_DATA_SIZE][LOCAL_DATA_SIZE];


/**
 * @brief  进行时间滤波。
 * @return float 过去四帧可见性的平均值。
 */
float visibility_temporal_filter(ivec3 index) {
    // 从历史缓存中读取前一帧(x)、前两帧(y)、前三帧(z)、前四帧(w)的可见性值。
    // 注意：这里的x分量是上一Pass刚写入的、充满噪点的当前帧原始可见性。
    vec4 last_visibility_values = texelFetch(global_textures_3d[visibility_cache_texture_index], index, 0);

    // 将这四帧的值简单相加后取平均，得到一个在时间上初步平滑的结果。
    float filtered_visibility = 0.25 * (last_visibility_values.x + last_visibility_values.y + last_visibility_values.z + last_visibility_values.w);

    return filtered_visibility;
}

// [! 此处省略 get_normal 函数，其作用是从G-Buffer中读取法线 !]

void main() {
    // --- 准备工作：坐标计算与边界检查 ---
    ivec2 iresolution = ivec2(resolution * 0.5);
    if (gl_GlobalInvocationID.x >= iresolution.x || gl_GlobalInvocationID.y >= iresolution.y)
        return;
    
    ivec3 local_index = ivec3(gl_LocalInvocationID.xyz) + ivec3(2, 2, 0);
    ivec3 global_index = ivec3(gl_GlobalInvocationID.xyz);

    // --- 第 1 步：加载数据到共享内存 ---
    // 每个线程负责将自己经过“时间滤波”后的可见性值，以及对应的法线值读入共享内存。
    local_image_data[local_index.y][local_index.x] = visibility_temporal_filter(global_index);
    local_normal_data[local_index.y][local_index.x] = get_normal(global_index);
    
    // 边界上的线程额外加载邻域数据，供整个工作组进行5x5滤波使用。
    // ... 此处省略了复杂的邻域加载代码 ...

    // 同步点：确保所有数据都已加载到共享内存
    memoryBarrierShared();
    barrier();

    // --- 第 2 步：执行带边缘检测的空间滤波 ---
    
    float spatial_filtered_value = 0.0;
    // 获取当前中心像素的法线
    vec3 p_normal = local_normal_data[local_index.y][local_index.x];
    
    // 遍历 5x5 邻域
    for (int y = -2; y <= 2; ++y) {
        for (int x = -2; x <= 2; ++x) {
            
            // 获取邻域像素的法线
            vec3 q_normal = local_normal_data[local_index.y + y][local_index.x + x];

            // *** 核心：边缘检测 (Edge Detection) ***
            // 比较中心像素法线 p_normal 和邻域像素法线 q_normal 的点积。
            // 如果点积小于一个阈值（如0.9），意味着两个法线差异很大，
            // 表明它们可能位于不同的几何平面上（例如，墙角或物体边缘）。
            // 在这种情况下，我们不应该将邻域像素的颜色混合进来，以避免模糊掉边缘。
            if (dot(p_normal, q_normal) <= 0.9) {
                continue; // 跳过这个邻居，不参与计算
            }

            // 如果法线相似，则这是一个有效的邻居
            float v = local_image_data[local_index.y + y][local_index.x + x]; // 读取其可见性
            float k = gaussian_kernel[y + 2][x + 2];                           // 读取对应的高斯权重
            
            // 累加加权后的可见性值
            spatial_filtered_value += v * k;
        }
    }

    // --- 第 3 步：存储最终降噪结果 ---
    // 将最终计算出的平滑可见性值写入到输出纹理中。
    // 这张纹理将在最后的光照合成阶段被使用。
    imageStore(global_images_3d[filtered_visibility_texture], global_index, vec4(spatial_filtered_value, 0, 0, 0));
}
```

1.  **数据加载与时间滤波**：

      * `main`函数启动后，每个线程首先调用 `visibility_temporal_filter`。这个函数从历史缓存中读取**最近四帧**的原始可见性数据（包括刚刚由上一个Pass生成、充满噪点的当前帧数据）。
      * 它将这四帧的数据简单地**取平均值**。这是一个基础的**时间滤波**，能有效利用帧间的连贯性，快速地将闪烁的噪点大部分抚平。
      * 同时，线程也从G-Buffer中获取当前像素的**法线**向量。
      * 这两个结果（时间滤波后的可见性 和 法线）被一同加载到**共享内存**中，为接下来的空间滤波做准备。

2.  **边缘感知的空间滤波**：

      * 这是整个降噪过程的精华所在。在所有数据加载完毕后，每个线程开始对自己负责的像素进行**空间滤波**。
      * 它遍历其周围 5x5 的邻域像素（数据已在共享内存中）。
      * 对于每一个邻居，它并不直接进行模糊，而是先执行一个**检查**：计算中心像素的法线 `p_normal` 和邻居像素的法线 `q_normal` 之间的**点积**。
      * **如果点积 > 0.9** (即两个法线方向非常接近)，说明这两个像素很可能在同一个平面上。此时，就将邻居像素的可见性值，乘以其对应的高斯权重，累加到最终结果中。
      * **如果点积 <= 0.9** (即两个法线方向差异较大)，说明这两个像素位于几何边缘或不同的物体上。此时，`continue` 语句会**跳过这个邻居**，防止它的颜色“污染”中心像素，从而完美地**保留了场景的几何轮廓**。

3.  **输出结果**：

      * 循环结束后，`spatial_filtered_value` 就包含了所有“有效”邻居的加权平均值。
      * 最后，通过 `imageStore` 将这个干净、平滑且保留了边缘细节的最终可见性值写入到输出纹理 `filtered_visibility_texture` 中。这张纹理就是最终可以用于光照计算的、高质量的阴影图。
      ![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507201753199.png)

### 关键技术与原理

  * **时空降噪 (Spatio-temporal Denoising)**:
    这是现代实时渲染中降噪的标准范式。单纯的空间滤波（模糊）会损失细节，而单纯的时间滤波会产生鬼影（ghosting）。将两者结合，先用时间滤波稳定信号，再用空间滤波清理剩余的噪点，可以在效果和性能之间取得极佳的平衡。
  * **高斯模糊 (Gaussian Blur)**:
    这是一种经典的低通滤波器，它使用一个高斯函数作为权重核。中心像素的权重最高，越往外的像素权重越低。其效果是平滑图像，有效去除高频噪声。代码中的 `gaussian_kernel` 就是一个预计算好的权重矩阵。

  * **边缘感知滤波 (Edge-Aware Filtering) / 交叉双边滤波 (Cross-Bilateral Filter)**:

      * **原理**：通过引入一个额外的指导信息（这里是**法线**），来决定是否应该混合邻居像素的颜色。只有当邻居像素的指导信息（法线）与中心像素相似时，才允许进行混合。
      * **效果**：这使得滤波器可以在平坦的表面上（法线都一样）大力进行模糊降噪，但在遇到几何边缘时（法线突变）则“收手”，不进行模糊。最终实现了**既要降噪，又要保边**的理想效果。这种使用一个图像（法线图）来指导另一个图像（可见性图）滤波的方法，通常被称为**交叉双边滤波 (Cross-Bilateral Filter)**。

# Ray Traced Reflections

## 工作流程
1. **G-buffer Check:** 检查每个片段的表面粗糙度是否低于指定阈值，以决定是否计算反射。
2. **Ray Casting:** 每个片段发射一条反射光线，方向使用 GGX 分布采样。
3. **Secondary Lighting:** 如果反射光线命中几何体，则向一个重要采样的光源发射次级光线。如果光源可见，则使用照明模型计算颜色。
4. **Denoising:** 由于每个片段只使用一个样本（导致输出噪点），使用 **时空方差引导滤波** ([SVGF](https://research.nvidia.com/publication/2017-07_spatiotemporal-variance-guided-filtering-real-time-reconstruction-path-traced)) 处理原始反射数据，以显著减少噪点，利用空间和时间信息。
5. **Lighting Integration:** 将去噪后的反射数据集成到场景的镜面光照计算中。

## Reflections Shaders

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202007124.png)

### 光线生成着色器

这是整个流程的起点和核心，负责为屏幕上的每个像素生成并追踪反射光线，并在光线命中物体后计算最终的颜色。

```glsl
// 定义光线负载（Payload），用于在着色器之间传递光线追踪的结果。
layout(location = 0) rayPayloadEXT RayPayload payload;

// ... [此处省略各种随机数生成函数和 sampleGGXVNDF 函数] ...
// sampleGGXVNDF: 根据GGX微表面模型和观察方向，生成一个重要的法线方向，用于模拟粗糙表面的反射。

void main() {
    // --- 1. 初始化与G-Buffer读取 ---
    ivec2 xy = ivec2(gl_LaunchIDEXT.xy);
    ivec2 scaled_xy = ivec2(xy * resolution_scale);

    // 从G-Buffer中读取当前像素的粗糙度。
    float roughness = forced_roughness > 0.0 ? forced_roughness : texelFetch(global_textures[gbuffer_texures.x], scaled_xy, 0).y;
    
    vec3 reflection_color = vec3(0);

    // 只为粗糙度较低（镜面反射较强）的表面计算反射。
    if (roughness <= 0.3) {
        
        // --- 2. 生成主反射光线 (Primary Reflection Ray) ---
        // 从G-Buffer读取深度、法线等信息，重建像素的世界坐标。
        float depth = texelFetch(global_textures[depth_texture_index], scaled_xy, 0).r;
        vec2 screen_uv = uv_nearest(xy, resolution / resolution_scale);
        vec3 world_pos = world_position_from_depth(screen_uv, depth, inverse_view_projection);
        vec3 normal = octahedral_decode(texelFetch(global_textures[gbuffer_texures.y], scaled_xy, 0).rg);
        vec3 incoming = normalize(world_pos - camera_position.xyz); // 观察方向

        // 生成两个[0,1]的随机数，用于重要性采样。
        vec2 U = interleaved_gradient_noise2(xy, current_frame);

        // 使用GGX-VNDF采样，根据粗糙度生成一个微表面法线。
        // 这比简单的reflect(incoming, normal)更物理正确，能表现粗糙表面的模糊反射。
        vec3 vndf_normal = sampleGGXVNDF(incoming, roughness, roughness, U.x, U.y);
        
        // 基于采样的微表面法线，计算出最终的反射光线方向。
        vec3 reflected_ray = normalize(reflect(incoming, vndf_normal));

        // --- 3. 追踪主反射光线 ---
        traceRayEXT(as, gl_RayFlagsOpaqueEXT, 0xff, sbt_offset, sbt_stride, miss_index,
                    world_pos, 0.05, reflected_ray, 100.0, 0);

        // --- 4. 处理光线命中结果 ---
        // 如果 payload.geometry_id 不是-1，说明光线命中了场景中的某个物体。
        if (payload.geometry_id != -1) {
            
            // --- 4a. 手动获取命中点的几何与材质信息 ---
            // 根据payload中的信息，反向查找顶点、索引、UV等数据。
            MeshInstanceDraw instance = mesh_instance_draws[payload.geometry_id];
            MeshDraw mesh = mesh_draws[instance.mesh_draw_index];
            // ... [省略了繁琐的从全局Buffer中读取顶点和UV的代码] ...
            
            // 使用重心坐标插值，计算出命中点的精确UV坐标。
            float b = payload.barycentric_weights.x;
            float c = payload.barycentric_weights.y;
            float a = 1 - b - c;
            vec2 uv = (a * uv0 + b * uv1 + c * uv2);

            // 计算命中点的世界坐标。
            vec3 p_world = world_pos + reflected_ray * payload.t;
            
            // 手动计算命中三角形的法线。
            vec3 triangle_normal = normalize(cross(p1_world.xyz - p0_world.xyz, p2_world.xyz - p0_world.xyz));

            // --- 4b. 在命中点进行直接光照计算 (Many-Light Sampling) ---
            // 这是一个高级优化：当场景中有很多光源时，为每个点计算所有光源的光照开销巨大。
            // 这里采用重要性采样，根据每个光源对当前点的“重要性”（亮度、距离、角度），
            // 随机选择一个光源进行计算。

            // 第一轮循环：计算每个光源的“重要性” (importance)。
            float lights_importance[NUM_LIGHTS];
            float total_importance = 0.0;
            for (uint l = 0; l < active_lights; ++l) {
                // importance 综合了光源强度、距离衰减和方向衰减。
                lights_importance[l] = calculate_light_importance(...);
                total_importance += lights_importance[l];
            }

            // 第二轮循环：根据随机数和重要性分布，选中一个光源。
            uint light_index = select_light_based_on_importance(...);

            // --- 4c. 追踪阴影光线 (Shadow Ray) ---
            if (light_index < active_lights) {
                Light light = lights[light_index];
                vec3 l = normalize(light.world_position - p_world.xyz);
                float light_distance = length(light.world_position - p_world.xyz);

                // 从命中点向选中的光源发射一条光线，检查是否有遮挡。
                traceRayEXT(as, gl_RayFlagsOpaqueEXT, 0xff, sbt_offset, sbt_stride, miss_index,
                            p_world.xyz, 0.05, l, light_distance, 0);
                
                // 如果 payload.geometry_id 为-1，说明阴影光线未被遮挡。
                float shadow_term = (payload.geometry_id == -1) ? 1.0 : 0.0;

                // --- 4d. 计算最终PBR光照颜色 ---
                // 计算衰减和 Lambertian 项 (NoL)。
                float attenuation = attenuation_square_falloff(...) * shadow_term;
                float NoL = clamp(dot(triangle_normal, l), 0.0, 1.0);

                if (attenuation > 0.0001f && NoL > 0.0001f) {
                    // 获取命中点的PBR材质参数（金属度、粗糙度等）。
                    // ...
                    // 计算最终的光照贡献。
                    vec4 albedo = textureLod(...);
                    reflection_color = albedo.rgb * light.intensity * attenuation * NoL * light.color;
                }
            }

            // --- 4e. 添加间接光照贡献 ---
            // 从光照探针或类似结构中采样间接光照。
            vec3 indirect_color = sample_irradiance(p_world, triangle_normal, camera_position.xyz);
            reflection_color += indirect_color * albedo.rgb;
        }
    }

    // --- 5. 写入最终结果 ---
    // 将计算出的反射颜色写入到输出图像中。
    imageStore(global_images_2d[out_image_index], xy, vec4(reflection_color, 1.0));
}
```

### 最近命中与未命中着色器

这两个着色器的作用非常简单：它们在 `traceRayEXT` 函数执行过程中被调用，其唯一目的就是填充 `RayPayload` 结构体，将结果返回给调用者（Ray Generation Shader）。

```glsl
// 当光线命中物体时，此着色器被调用。

layout(location = 0) rayPayloadInEXT RayPayload payload;
hitAttributeEXT vec2 barycentric_weights; // 由硬件提供的重心坐标插值

void main() {
    // 将命中的几何体ID、图元ID、重心坐标、变换矩阵、距离等信息
    // 全部打包到 payload 结构体中，以供光线生成着色器后续使用。
    payload.geometry_id       = gl_GeometryIndexEXT;
    payload.primitive_id      = gl_PrimitiveID;
    payload.barycentric_weights = barycentric_weights;
    payload.object_to_world   = gl_ObjectToWorldEXT;
    payload.t                 = gl_HitTEXT;
    payload.triangle_facing   = gl_HitKindEXT;
}

// 当光线未命中任何物体时，此着色器被调用。

layout(location = 0) rayPayloadInEXT RayPayload payload;

void main() {
    // 将 geometry_id 设置为一个特殊值（-1），
    // 作为一个标记，告诉光线生成着色器“此次追踪未命中”。
    payload.geometry_id = -1;
}
```

### 核心原理与关键技术

#### 基于物理的反射与 GGX-VNDF 采样

为了渲染出逼真的粗糙表面（如拉丝金属、磨砂塑料），简单的镜面反射 `reflect()` 函数是不够的。现代 PBR（Physically Based Rendering）理论将表面建模为由大量微小的镜面组成的**微表面 (Microfacet)**。

**GGX-VNDF 采样**: 不是采样一个随机的微观法线，而是智能地采样一个**既符合GGX分布，又对观察者可见**的法线。这能极大地减少噪点，用更少的光线样本收敛到更准确的模糊反射效果。最终的 `reflected_ray` 因此具有了基于物理的、与粗糙度匹配的模糊方向。

`sampleGGXVNDF`函数是实现基于物理的粗糙反射 (Physically Based Rough Reflections) 的关键。它的目标不是简单地进行镜面反射，而是根据 GGX 微表面模型的分布，智能地采样一个对最终结果贡献最大的微表面法线 (`vndf_normal`)。

一个“粗糙”的表面在微观上是由无数个朝向各异的微小镜面组成的。当光线射到这样的表面上时，会向多个方向散射，形成模糊的反射效果。`sampleGGXVNDF` 的作用就是重要性采样 (Importance Sampling)：它根据物理模型，优先采样那些最有可能将光线反射到观察者眼中的微表面法线，从而用极少数的光线样本，高效地模拟出逼真的模糊反射，并大幅减少噪点。

该函数的实现遵循了论文 [Sampling the GGX Distribution of Visible Normals (VNDF)](https://jcgt.org/published/0007/04/01/paper.pdf) 中的步骤。

```glsl
// Input Ve:  观察方向（View Direction）
// Input alpha_x, alpha_y: 对应x和y轴的粗糙度
// Input U1, U2: 两个 [0,1] 范围内的均匀随机数
// Output Ne: 采样出的、符合物理模型的微表面法线
vec3 sampleGGXVNDF(vec3 Ve, float alpha_x, float alpha_y, float U1, float U2)
{
    // --- 步骤 1: 将观察方向变换到“半球空间” ---
    // 为了简化采样数学模型，我们将各向异性的椭球体GGX分布，通过缩放“拉伸”成一个完美的半球形分布。
    // Ve 是观察方向，这里将其变换到这个虚拟的“拉伸空间”中。
    vec3 Vh = normalize(vec3(alpha_x * Ve.x, alpha_y * Ve.y, Ve.z));

    // --- 步骤 2: 构建局部坐标系 ---
    // 以变换后的观察方向 Vh 为 Z 轴，构建一个局部坐标系（T1, T2, Vh）。
    // 所有的采样将在这个方便的局部坐标系中进行。
    float lensq = Vh.x * Vh.y + Vh.y * Vh.y;
    vec3 T1 = lensq > 0 ? vec3(-Vh.y, Vh.x, 0) * inversesqrt(lensq) : vec3(1,0,0);
    vec3 T2 = cross(Vh, T1);

    // --- 步骤 3: 在2D投影面上采样 ---
    // 这是算法的精髓。它将两个均匀的随机数 U1, U2 映射到 Vh 向量所“看”到的
    // 微表面法线投影圆盘上的一个点 (t1, t2)。
    // 这个映射不是简单的均匀映射，而是经过精心设计的，以匹配可见法线分布的形状。
    float r = sqrt(U1);
    float phi = 2.0 * PI * U2;
    float t1 = r * cos(phi);
    float t2 = r * sin(phi);
    float s = 0.5 * (1.0 + Vh.z);
    t2 = (1.0 - s)*sqrt(1.0 - t1*t1) + s*t2;

    // --- 步骤 4: 从2D投影点反算回3D法线 ---
    // 将2D采样点 (t1, t2) 从投影圆盘上“提拉”回半球表面，得到在局部坐标系中的采样法线 Nh。
    vec3 Nh = t1*T1 + t2*T2 + sqrt(max(0.0, 1.0 - t1*t1 - t2*t2))*Vh;

    // --- 步骤 5: 将法线变换回“椭球空间” ---
    // 将在“拉伸空间”中采样到的法线 Nh，通过逆向的缩放操作，变换回原始的、
    // 符合各向异性GGX分布的椭球空间，得到最终的微表面法线 Ne。
    vec3 Ne = normalize(vec3(alpha_x * Nh.x, alpha_y * Nh.y, max(0.0, Nh.z)));
    
    return Ne;
}
```

最终，这个 `Ne` (vndf_normal) 会被用于 `reflect()` 函数，生成一条高度符合物理规律的反射光线。

#### 光源重要性采样 (Many-Light Importance Sampling)

在有成百上千个光源的复杂场景中，如果每个反射点都计算所有光源的直接光照，性能开销将是灾难性的。

  * **技术原理**: 该着色器采用了一种类似 "[Importance Sampling of Many Lights on the GPU](https://research.nvidia.com/labs/rtr/publication/moreau2019manylight_rtg/)" 的技术。
    1.  **计算重要性**: 遍历所有光源，根据光源的**强度 (Intensity)**、**距离 (Distance)** 和**方向 (Orientation)**，为每个光源计算一个“重要性”权重。一个离得近、亮度高且正对着命中点表面的光源，其重要性就高。
    2.  **随机选择**: 将所有重要性归一化，形成一个概率分布函数 (PDF)。然后生成一个随机数，根据这个PDF随机选择**一个**光源。
    3.  **计算光照**: 只为这一个被选中的光源计算阴影和光照贡献。虽然单次计算有偏差，但在多个像素、多帧上进行蒙特卡洛积分，最终结果会收敛到正确的全局光照效果，同时性能开销极低。

#### 手动属性获取与LOD计算

与一些简单的光追教程不同，这里的最近命中着色器（Closest-Hit）非常“轻量”，只负责传递ID和坐标。所有复杂的材质和几何属性获取（如UV、顶点位置）都在光线生成着色器中**手动完成**。

  * **设计选择**: 这是一种设计模式。它将复杂的着色逻辑（PBR计算、多光源采样等）集中在Ray Generation Shader中，简化了Shader Binding Table (SBT) 的管理，但代价是需要在RayGen中编写大量手动获取和插值数据的代码。
  * **手动LOD**: `float lod = 0.5 * log2( texel_area / triangle_area )` 是一个经典的**纹理细节层次 (LOD)** 计算方法。它通过比较纹理在纹理空间中的面积与它在屏幕空间中的投影面积的比率，来估算应该采样哪个 Mipmap 级别，有效防止了纹理在远处产生摩尔纹（Moiré pattern）并提升了纹理缓存的效率。

如果不计算LOD，直接用最高精度的 Mipmap 0 级去采样，当一个布满精细纹理的表面被投影到远处很小的几个像素上时，就会发生**纹理混叠 (Texture Aliasing)**，产生闪烁和摩尔纹。正确的LOD可以根据物体在屏幕上的大小，选择合适的 Mipmap 等级进行采样，既能抗锯齿，又能提升纹理缓存的命中率。

该方法通过计算 **“纹素(texel)到像素(pixel)的面积比”** 来估算LOD。

```glsl
// --- 步骤 1: 计算命中三角形在“纹理空间”中的面积 ---
// abs(...)这部分是利用顶点叉乘的几何意义计算三角形面积的2D版本。
// (uv1 - uv0) 和 (uv2 - uv0) 是三角形在UV空间的两条边向量。
// 这里的计算结果是三角形在 [0,1] UV空间中所占面积的两倍。
float uv_area = abs((uv1.x - uv0.x) * (uv2.y - uv0.y) - (uv2.x - uv0.x) * (uv1.y - uv0.y));

// 将UV空间面积乘以纹理的实际尺寸，得到三角形覆盖的总“纹素(texel)”数量。
float texel_area = texture_size.x * texture_size.y * uv_area;

// --- 步骤 2: 计算命中三角形在“屏幕空间”中的面积 ---
// 使用完全相同的公式，但输入的是三角形顶点在屏幕上的投影坐标。
// (p1_screen, p0_screen, p2_screen)
// 计算出三角形在屏幕上覆盖的“像素(pixel)”数量。
float triangle_area = abs((p1_screen.x - p0_screen.x) * (p2_screen.y - p0_screen.y) - (p2_screen.x - p0_screen.x) * (p1_screen.y - p0_screen.y));

// --- 步骤 3: 根据面积比计算LOD ---
// texel_area / triangle_area 就是“每个像素对应多少个纹素”的比率，即纹素密度。
// - 如果比值 >> 1: 说明纹理被急剧缩小（minification），需要使用更高（更模糊）的Mipmap等级。
// - 如果比值 << 1: 说明纹理被放大（magnification），应该使用更低（更清晰）的Mipmap等级。
//
// log2: Mipmap的等级是按2的对数关系组织的，所以用log2来转换。
// 0.5 *: 面积是长度的平方，而LOD与长度成正比。log2(Area) = log2(Length^2) = 2*log2(Length)。
//         所以需要乘以0.5来抵消这个平方关系。
float lod = floor(0.5 * log2(texel_area / triangle_area));
```

这个 `lod` 值最终会被传递给 `textureLod` 函数，以精确的 Mipmap 等级进行纹理采样，从而获得高质量、无锯齿的纹理外观。

## SVGF 降噪

### Accumulation Pass

这个着色器是 **SVGF (Spatiotemporal Variance-Guided Filtering)** 降噪算法中的**时间累积 (Temporal Accumulation)** 阶段。它的核心任务是将当前帧带有噪点的反射颜色，与前几帧积累的、相对干净的颜色历史进行混合，从而在时间维度上平滑噪点。

为了防止混合出错（例如，将墙壁的颜色历史混合到移动的角色上），这个阶段花费了大量精力去进行**时间一致性检查 (Temporal Consistency Check)**，只有在确认当前像素和它在上一帧的对应像素属于同一个物体表面时，才会进行混合。

混合后的颜色
![integrated_reflection_color](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202050802.png)

混合后的矩
![integrated_reflection_moments](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202050674.png)

```glsl
// ... [此处省略 check_temporal_consistency 函数的定义] ...

// 定义工作组大小 8x8
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // --- 1. 读取输入并计算矩 (Moments) ---
    uvec2 frag_coord = gl_GlobalInvocationID.xy;

    // 读取当前帧由光追计算出的、带有噪点的原始反射颜色。
    vec3 reflections_color = texelFetch(global_textures[reflections_texture_index], ivec2(frag_coord), 0).rgb;

    // 计算颜色亮度的“一阶矩”和“二阶矩”。
    // 这是为后续空间滤波阶段计算“方差”做准备。
    float u_1 = luminance(reflections_color); // 一阶矩 (均值)
    float u_2 = u_1 * u_1;                    // 二阶矩的一部分
    vec2 moments = vec2(u_1, u_2);

    // --- 2. 执行时间一致性检查 ---
    // 调用辅助函数，判断当前像素是否有有效的、可供复用的历史数据。
    bool is_consistent = check_temporal_consistency(frag_coord);

    // --- 3. 条件性时间累积 ---
    vec3 integrated_color_out;
    vec2 integrated_moments_out;

    // 分支 A：如果历史数据一致、有效
    if (is_consistent) {
        // 读取上一帧累积的颜色和矩
        vec3 history_reflections_color = texelFetch(global_textures[history_reflections_texture_index], ivec2(frag_coord), 0).rgb;
        vec2 history_moments = texelFetch(global_textures[history_moments_texture_index], ivec2(frag_coord), 0).rg;

        // 使用一个混合因子 alpha，将当前帧的数据与历史数据进行指数移动平均 (Exponential Moving Average)。
        // alpha 较小，意味着更信任历史数据，画面更稳定但可能产生拖影；alpha 较大则相反。
        float alpha = 0.2;
        integrated_color_out = mix(history_reflections_color, reflections_color, alpha);
        integrated_moments_out = mix(history_moments, moments, alpha);
    
    // 分支 B：如果历史数据不一致（例如发生遮挡）
    } else {
        // 丢弃无效的历史数据，直接使用当前帧的原始颜色和矩。
        // 这相当于重置(reset)了该像素的时间累积。
        integrated_color_out = reflections_color;
        integrated_moments_out = moments;
    }

    // --- 4. 写入输出 ---
    // 将本轮累积后的颜色和矩写入到新的纹理中，供下一阶段（空间滤波）使用。
    imageStore(global_images_2d[integrated_color_texture_index], ivec2(frag_coord), vec4(integrated_color_out, 0));
    imageStore(global_images_2d[integrated_moments_texture_index], ivec2(frag_coord), vec4(integrated_moments_out, 0, 0));
}
```

```glsl
/**
 * @brief  检查当前像素在时间上是否与前一帧连续。
 * @param  frag_coord 当前像素的屏幕坐标。
 * @return bool 如果历史数据有效且可复用，返回true。
 */
bool check_temporal_consistency(uvec2 frag_coord) {
    // --- 1. 时间重投影 (Temporal Reprojection) ---
    // 读取当前像素的运动矢量。
    vec2 motion_vector = texelFetch(global_textures[motion_vectors_texture_index], ivec2(frag_coord), 0).rg;
    // 根据运动矢量，计算出当前像素在上一帧的屏幕坐标 (prev_frag_coord)。
    vec2 prev_frag_coord = vec2(frag_coord) + 0.5 + motion_vector * resolution_scale;

    // --- 2. 边界与物体ID检查 ---
    // 检查历史坐标是否超出屏幕范围。
    if (any(lessThan(prev_frag_coord, vec2(0))) || any(greaterThanEqual(prev_frag_coord, resolution * resolution_scale))) {
        return false;
    }
    // 检查当前像素与历史像素是否属于同一个物体。
    // 这是最强的剔除标准之一，可以有效防止前景物体移开时，背景错误地复用前景的颜色历史（鬼影）。
    uint mesh_id = texelFetch(global_utextures[mesh_id_texture_index], ..., 0).r;
    uint prev_mesh_id = texelFetch(global_utextures[history_mesh_id_texture_index], ivec2(prev_frag_coord), 0).r;
    if (mesh_id != prev_mesh_id) {
        return false;
    }

    // --- 3. 深度与法线检查 ---
    // 为了处理物体内部的形变或视角变化，还需要比较几何属性。
    float z = texelFetch(global_textures[linear_z_dd_texture_index], ..., 0).r;
    float prev_z = texelFetch(global_textures[history_linear_depth_texture], ivec2(prev_frag_coord), 0).r;
    // 计算深度差异。如果差异过大，认为历史无效。
    float depth_diff = abs(prev_z - z) / (depth_normal_fwidth.x + 1e-2);
    if (depth_diff > temporal_depth_difference) {
        return false;
    }
    
    vec3 normal = ...;
    vec3 prev_normal = ...;
    // 计算法线差异。如果法线夹角过大，认为历史无效。
    float normal_diff = distance(normal, prev_normal) / (depth_normal_fwidth.y + 1e-2);
    if (normal_diff > temporal_normal_difference) {
        return false;
    }

    // 所有检查都通过，返回true。
    return true;
}
```

#### 核心原理与关键技术

##### 时间累积与历史拒绝 (Temporal Accumulation & History Rejection)

  * **指数移动平均 (Exponential Moving Average)**: `integrated_color_out = mix(history, current, alpha)` 这行代码是时间累积的核心。它不是简单地取平均，而是给予当前帧一个固定的权重 `alpha`，历史一个 `1 - alpha` 的权重。这种方式可以在平滑噪声的同时，让画面能逐渐响应光照变化。
  * **鲁棒的历史拒绝**: `check_temporal_consistency` 函数是该算法鲁棒性的关键。一个糟糕的时间降噪器会在物体移动时产生大量**鬼影 (Ghosting)**。通过依次检查**物体ID**、**深度**和**法线**，SVGF 能非常精确地判断历史数据是否可用，一旦判断为不可用（例如，角色跑开露出了后面的墙），就果断丢弃历史（`else` 分支），从而极大地抑制了鬼影。

Mesh ID
![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202009435.png)

##### 基于矩的方差估计 (Moment-based Variance Estimation)

SVGF 的一个精妙之处在于它指导空间滤波的方式。它需要知道一个像素邻域内的颜色**方差 (Variance)**，方差越大说明噪声越多。

  * **矩 (Moments)**: 直接在邻域内计算方差开销很大。SVGF 采用了一种更高效的方法：在时间累积阶段，顺便累积颜色亮度的一阶矩（就是亮度本身 $E[X]$）和二阶矩（亮度的平方 $E[X^2]$）。
  * **方差公式**: 根据统计学公式，方差可以由这两个矩计算得出：
    $$\sigma^2 = E[X^2] - (E[X])^2
    $$
    在本 Pass 中，`integrated_moments_out` 的 `.x` 分量存储了累积后的 $E[X]$，`.y` 分量存储了累积后的 $E[X^2]$。在后续的空间滤波 Pass 中，可以直接利用这些预计算好的值，快速估算出像素邻域的方差，从而决定模糊的强度。

##### 使用`fwidth`自适应设置阈值 

`depth_normal_fwidth = vec2(length(fwidth(world_position)), length(fwidth(normal)));`

`depth_normal_fwidth` 是一个预先计算好的 `vec2` 数据，它存储了每个像素的**几何复杂度**信息。

这个值通常是在一个单独的 Pass 中，通过对线性深度图和法线图应用 GLSL 的 `fwidth()` 函数来计算并存入一张纹理中的。`fwidth(p)` 函数会计算变量 `p` 在屏幕空间中相邻像素间的变化量总和，是衡量一个值变化有多“剧烈”的有效指标。

`depth_normal_fwidth` 的核心作用是**让时间一致性检查的阈值变得自适应 (Adaptive)，从而更“智能”地判断历史数据是否有效**。

```glsl
float depth_diff = abs(prev_z - z) / (depth_normal_fwidth.x + 1e-2);
if (depth_diff > temporal_depth_difference) {
    return false;
}
```

  * **当表面平坦、正对相机时**: `depth_normal_fwidth.x` 的值非常小。这时分母很小，即使一个微小的 `abs(prev_z - z)` 也会导致 `depth_diff` 变得很大。这使得检查在这种区域**非常敏感和严格**，能捕捉到最细微的不连续。
  * **当表面是斜坡或曲面时**: `depth_normal_fwidth.x` 的值很大。这时分母很大，即使 `abs(prev_z - z)` 较大，也会被这个大的分母“稀释”，使得最终的 `depth_diff` 保持在一个较小的范围内。这使得检查在这种区域**非常宽松和容忍**，允许因透视和曲率产生的正常深度变化，而不会错误地丢弃历史。

对法线的检查 `normal_diff` 也是完全相同的道理。

综上所述，`depth_normal_fwidth` 通过提供一个对局部几何复杂度的衡量，将一个“一刀切”的固定阈值，升级为了一个能适应不同表面特性的、高度鲁棒的动态阈值。

### Variance Pass

它的唯一职责就是接收前一阶段累积的颜色“矩”，并用一个简单的统计学公式计算出每个像素的亮度方差。

这张最终生成的“方差图”就像一张“噪点地图”，它会精确地告诉最后一个 Pass（空间滤波）：“图中越亮的地方，噪点越多，你需要更用力地去模糊！”

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202112239.png)

```glsl
/**
 * @brief  根据累积的颜色矩，计算亮度方差。
 *
 * @details
 * 该计算着色器是 SVGF 流程中的一步。它接收由时间累积 Pass
 * (COMPUTE_SVGF_ACCUMULATION) 生成的“矩”纹理，并应用统计学公式
 * Variance = E[X^2] - (E[X])^2 来计算每个像素亮度的方差。
 * 输出的方差图将作为下一阶段空间滤波强度的指导图。
 */

// 定义工作组大小 8x8
layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // --- 1. 获取像素坐标并读取累积的矩 ---
    uvec2 frag_coord = gl_GlobalInvocationID.xy;

    // 从上一 Pass 输出的纹理中，读取时间累积后的“颜色矩”。
    // moments.x 存储的是亮度的一阶矩 (均值, E[X])。
    // moments.y 存储的是亮度的二阶矩 (平方的均值, E[X^2])。
    vec2 moments = texelFetch(global_textures[integrated_moments_texture_index], ivec2(frag_coord), 0).rg;

    // 如果历史无效，则可以通过对邻域进行双边滤波来重新估算一个临时的方差。

    // --- 2. 计算方差 ---
    // 应用核心统计学公式：方差 = 平方的期望 - 期望的平方。
    float variance = moments.y - pow(moments.x, 2);

    // --- 3. 存储方差结果 ---
    // 将计算出的方差值写入到一张新的“方差图”纹理中。
    // 这张图将在后续的空间滤波 Pass 中被用作指导。
    imageStore(global_images_2d[variance_texture_index], ivec2(frag_coord), vec4(variance, 0, 0, 0));
}
```

1.  **读取输入**：对于屏幕上的每一个像素，它首先从 `integrated_moments_texture_index` 纹理中读取一个 `vec2` 数据。这个数据是前一个 Accumulation Pass 的输出，包含了经过时间累积（与历史数据混合）后的颜色亮度的“一阶矩”和“二阶矩”。
2.  **计算方差**：它应用 `variance = moments.y - pow(moments.x, 2);` 这个公式。这行代码是整个着色器的核心，它将两个矩值转换为了一个统计学上有效的方差值。
3.  **写入输出**：最后，它将计算出的 `variance` 值存入一张新的单通道纹理中。这张纹理就是“方差指导图”，供下一个也是最后一个 SVGF Pass 使用。

这个 Pass 的精髓在于它计算方差的方法。方差 ($\sigma^2$) 在统计学上的基本定义是“一组数据与其均值差异的平方的平均值”，即 $\sigma^2 = E[(X - \mu)^2]$，其中 $\mu$ 是均值 $E[X]$。

直接计算这个公式比较低效，因为它需要先计算出均值，然后再遍历一次数据。一个在计算上更高效的等价公式是： **方差 = 平方的期望 - 期望的平方**
$$\sigma^2 = E[X^2] - (E[X])^2$$

#### 如何映射到代码

  * **$E[X]$ (期望/均值)**: 在前一个 Pass 中，我们累积了颜色的亮度，存放在 `moments.x` 中。它就是我们对亮度均值的最佳估计。
  * **$E[X^2]$ (平方的期望/二阶矩)**: 同样，我们累积了亮度值的平方，存放在 `moments.y` 中。它就是对亮度平方的均值的最佳估计。

因此，GLSL 代码 `variance = moments.y - pow(moments.x, 2);` 就是对 $\sigma^2 = E[X^2] - (E[X])^2$ 这个公式**最直接、最高效的实现**。

### Wavelet Pass

最后一步，也是最核心的一步：**基于小波变换的方差引导空间滤波 (Wavelet-based, Variance-Guided Spatial Filtering)**。

这个着色器通常会执行多轮（一般是3到5轮），每一轮都会增大采样步长 (`step_size`)。这种特殊的、带孔的滤波方式也称为 **À-trous Filter**（法语，意为 "with holes"），它能在保持极高效率的同时，实现大范围的模糊效果。

它的最终目标是将时间累积阶段生成的、依然有些许噪点和条纹的图像，彻底平滑成一幅干净、自然且保留了关键细节的最终图像。

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202507202117202.png)

```glsl
/**
 * @brief  计算中心像素p和邻居像素q之间的交叉双边权重。
 * @param n_p             中心像素p的法线。
 * @param linear_z_dd     中心像素p的线性深度及其梯度 {z, fwidth(z)}。
 * @param l_p             中心像素p的亮度。
 * @param l_q             邻居像素q的亮度。
 * @param p, q            中心和邻居像素的坐标。
 * @param phi_depth       一个根据p的深度梯度和atrous步长计算出的自适应深度阈值。
 * @return float          最终的相似度权重，介于[0, 1]之间。
 */
float compute_w(vec3 n_p, vec2 linear_z_dd, float l_p, float l_q, ivec2 p, ivec2 q, float phi_depth) {

    // --- 准备工作: 获取邻居像素 q 的属性 ---
    ivec2 scaled_q = ivec2(q * resolution_scale_rcp);
    const vec2 encoded_normal_q = texelFetch(global_textures[normals_texture_index], scaled_q, 0).rg;
    vec3 n_q = octahedral_decode(encoded_normal_q);
    float z_q = texelFetch(global_textures[linear_z_dd_texture_index], scaled_q, 0).r;

    // ===================================================================
    // 权重 1: 法线权重 w_n (几何边缘保护)
    // ===================================================================
    // 计算两个法线的点积。如果法线相同，点积为1；如果垂直，点积为0。
    // 使用 pow() 函数可以使权重的衰减变得更陡峭，sigma_n 控制陡峭程度。
    // 这意味着只有法线方向非常接近的像素，才能获得较高的权重。
    float w_n = pow(max(0, dot(n_p, n_q)), sigma_n);

    // ===================================================================
    // 权重 2: 深度权重 w_z (深度不连续保护)
    // ===================================================================
    // 来自 https://github.com/NVIDIAGameWorks/Falcor/blob/master/Source/RenderPasses/SVGFPass/SVGFAtrous.ps.slang
    // 它用原始的深度差，除以一个自适应的阈值 phi_depth。
    // phi_depth = max(linear_z_dd.y, 1e-8) * step_size，它会随着
    // 中心像素的深度梯度（几何陡峭程度）和 atrous 步长的增大而增大。
    // 这使得深度检查在平坦区域更严格，在陡峭区域和大的采样步长下更宽松。
    float w_z = (phi_depth == 0) ? 0.0f : abs(linear_z_dd.x - z_q) / phi_depth;

    // ===================================================================
    // 权重 3: 亮度权重 w_l (方差引导的材质/光照边缘保护)
    // ===================================================================
    // --- 3a. 计算中心像素p的局部平均方差 g ---
    // 在计算亮度权重前，先对“方差图”进行一次的高斯模糊。
    // 得到的 g 代表了中心像素p附近区域的平均“噪点程度”。
    const float kernel[2][2] = {{1.0 / 4.0, 1.0 / 8.0}, {1.0 / 8.0, 1.0 / 16.0}};
    float g = 0.0;
    const int radius = 1;
    for (int yy = -radius; yy <= radius; yy++) {
        for (int xx = -radius; xx <= radius; xx++) {
            ivec2 s = p + ivec2(xx, yy);
            // ... [边界检查] ...
            float k = kernel[abs(xx)][abs(yy)];
            float v = texelFetch(global_textures[variance_texture_index], s, 0).r;
            g += v * k;
        }
    }
    
    // --- 3b. 计算方差引导的亮度权重 ---
    // 这是 SVGF 的灵魂。分母中的 sqrt(g) 是关键。
    // 如果局部方差 g 很高（噪点区），分母会很大，w_l 会趋近于1，从而允许混合不同亮度的颜色来降噪。
    // 如果局部方差 g 很低（干净区），分母会很小，w_l 对亮度差异会非常敏感，从而避免模糊，保护细节。
    float w_l = exp(-(abs(l_p - l_q) / (sigma_l * sqrt(max(0, g)) + 1e-5)));
    
    // ===================================================================
    // 最终权重组合
    // ===================================================================
    // 将三个权重组合成最终的混合权重。
    // 这里的组合方式 exp(-a -b) * c 是双边滤波中的一种常见形式。
    float final_weight = exp(0.0 - max(w_z, 0.0) - max(w_l, 0.0)) * w_n;

    return final_weight;
}

float h[3] = {
    3.0 / 8.0,
    1.0 / 4.0,
    1.0 / 16.0
};

layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // --- 1. 初始化 ---
    ivec2 frag_coord = ivec2(gl_GlobalInvocationID.xy);
    
    // 从上一 Pass 读取中心像素p的各种属性
    ivec2 scaled_xy = ivec2(frag_coord * resolution_scale_rcp);
    vec3 normal_p = octahedral_decode(texelFetch(global_textures[normals_texture_index], scaled_xy, 0).rg);
    vec2 linear_z_dd = texelFetch(global_textures[linear_z_dd_texture_index], scaled_xy, 0).rg; // .x是深度, .y是深度梯度
    vec3 color_p = texelFetch(global_textures[integrated_color_texture_index], frag_coord, 0).rgb;
    float luminance_p = luminance(color_p);

    // 初始化累加器
    vec3 new_filtered_color = color_p; // 中心像素首先计入
    float color_weight = 1.0;
    float new_variance = texelFetch(global_textures[variance_texture_index], frag_coord, 0).r;

    // --- 2. À-trous 滤波循环 ---
    // 这是一个 3x3 的滤波核，但采样点是“带孔”的，由 step_size 控制间隔。
    const int radius = 1; 
    for (int y = -radius; y <= radius; ++y) {
        for (int x = -radius; x <= radius; ++x) {
            if (x == 0 && y == 0) continue; // 跳过中心点

            // 计算邻居像素q的坐标，间隔为 step_size
            ivec2 q = frag_coord + ivec2(x, y) * step_size;

            // ... [边界检查] ...
            
            // --- 3. 计算权重并累加 ---
            // 读取邻居像素q的颜色和亮度
            vec3 c_q = texelFetch(global_textures[integrated_color_texture_index], q, 0).rgb;
            float l_q = luminance(c_q);

            // h_q 是空间距离权重（高斯权重）
            float h_q = h[abs(x)] * h[abs(y)];

            // w_pq 是基于几何和亮度相似度的“双边权重”
            float w_pq = compute_w(normal_p, linear_z_dd, luminance_p, l_q, frag_coord, q, ...);

            // 最终样本权重是两者的乘积
            float sample_weight = h_q * w_pq;
            
            // 累加带权的颜色和总权重
            new_filtered_color += sample_weight * c_q;
            color_weight += sample_weight;

            // 同时，根据权重传播和更新方差
            float prev_variance = texelFetch(global_textures[variance_texture_index], q, 0).r;
            new_variance += pow(h_q, 2) * pow(w_pq, 2) * prev_variance;
        }
    }

    // --- 4. 归一化并输出 ---
    new_filtered_color /= color_weight;
    new_variance /= pow(color_weight, 2);

    // 将本轮滤波后的结果写回，供下一轮（或最终显示）使用
    imageStore(global_images_2d[filtered_color_texture_index], frag_coord, vec4(new_filtered_color, 0));
    imageStore(global_images_2d[updated_variance_texture_index], frag_coord, vec4(new_variance, 0, 0, 0));
}
```

#### À-trous (带孔) 小波滤波

常规的大范围模糊需要一个巨大的滤波核，这会导致每个像素需要进行数千次纹理采样，性能极低。À-trous 滤波解决了这个问题。

  * **原理**: 它使用一个很小的核（这里是3x3），但在采样邻居时，会跳过一些像素，这个跳过的距离由 `step_size` 控制。
  * **流程**:
      * **Pass 1**: `step_size = 1`。进行一次标准的 3x3 滤波。
      * **Pass 2**: `step_size = 2`。采样点间隔变为1个像素，等效于一个 5x5 的滤波范围。
      * **Pass 3**: `step_size = 4`。采样点间隔变为3个像素，等效于一个 9x9 的滤波范围。
      * **Pass 4**: `step_size = 8`。等效于一个 17x17 的滤波范围。
      * **Pass 5**: `step_size = 16`。等效于一个 33x33 的滤波范围。
  * **优势**: 仅用 5 个 Pass，每个 Pass 只需采样 9 个点，就实现了过去需要一个巨大卷积核才能达到的模糊范围，效率极高。

#### 交叉双边滤波 (Cross-Bilateral Filter)

这是 `compute_w` 函数的核心思想。一个普通的模糊滤波会无差别地混合所有邻居的颜色，导致边缘也被模糊掉。双边滤波则会根据“相似度”来决定混合权重。

  * **交叉 (Cross)**: 它的“智能”之处在于，判断相似度所依据的数据（指导图），和最终被模糊处理的图像（输入图）不是同一个。
      * **输入图**: `integrated_color_texture` (需要被模糊的颜色图)
      * **指导图**: `normals_texture`, `linear_z_dd_texture`, `variance_texture`
  * 该实现综合了三种指导信息：
    1.  **法线相似度 (`w_n`)**: 防止模糊跨越物体的几何棱角。
    2.  **深度相似度 (`w_z`)**: 防止模糊跨越物体的边缘轮廓。
    3.  **亮度相似度 (`w_l`)**: 防止模糊跨越材质或光照的明暗变化。

`compute_w` 本质上是一个**交叉双边权重 (Cross-Bilateral Weight)** 的计算器，它同时考量了三个方面的相似性：**几何法线、几何深度、以及由方差引导的颜色亮度**。

权重 1: 法线权重 $w_n$ - 保护几何棱角

  * **目的**: 防止模糊效果“泄露”到不相关的几何表面上。例如，墙壁的颜色不应该模糊到地板上。
  * **方法**: `dot(n_p, n_q)` 计算两个法线向量的余弦相似度。
  * **`pow(..., sigma_n)`**: `sigma_n` 参数像一个“锐度”调节器。当 `sigma_n > 1` 时，它会惩罚那些不是几乎完全平行的法线，使得只有在非常平坦的表面上，权重才接近1，从而让边缘保护更严格。

权重 2: 深度权重 $w_z$ - 保护物体轮廓

  * **目的**: 防止模糊跨越有深度差异的边缘，例如一个物体与其后方背景的交界处。
  * **方法**: `abs(linear_z_dd.x - z_q) / phi_depth`
      * **分子**: `abs(linear_z_dd.x - z_q)` 是中心点 `p` 和邻居 `q` 之间最直接的深度差。
      * **分母**: `phi_depth` 是一个**自适应的容差**。它由 `linear_z_dd.y` (中心点的深度梯度) 和 `step_size` (atrous滤波步长) 决定。
          * 在**平坦表面** (`linear_z_dd.y` 小)，`phi_depth` 小，容差低，检查严格。
          * 在**陡峭表面** (`linear_z_dd.y` 大)，`phi_depth` 大，容差高，检查宽松。
          * 随着 `step_size` 增大，采样点距离变远，`phi_depth` 也随之增大，允许更大的深度差异。
      * 这个归一化后的 `w_z` 可以被认为是一个标准化的深度差异值。

权重 3: 亮度权重 $w_l$ - 保护材质与光照细节

  * **目的**: 这是 SVGF 最智能的部分。它既要能在噪点区域强力模糊，又要能在干净区域保护材质和阴影的精细边缘。
  * **方法**: `exp(-(abs(l_p - l_q) / (sigma_l * sqrt(g) + 1e-5)))`
      * **分子**: `abs(l_p - l_q)` 是中心点 `p` 和邻居 `q` 之间的亮度差异。
      * **分母**: `sigma_l * sqrt(g)` 是一个**由方差引导的自适应亮度容差**。`g` 是我们刚刚在3x3邻域内计算出的局部平均方差。
          * **高方差区域 (噪点多)**: `g` 很大，导致分母很大。此时，即使 `abs(l_p - l_q)` 也很大，整个分数也会很小，`w_l` 趋近于1。这意味着**亮度差异被忽略**，滤波器会强力混合颜色以消除噪点。
          * **低方差区域 (已干净)**: `g` 很小，导致分母很小。此时，即使一个微小的亮度差异 `abs(l_p - l_q)` 都会导致分数很大，`w_l` 快速趋近于0。这意味着**亮度差异被严格尊重**，滤波器拒绝混合不同亮度的颜色，从而保护了细节。

最终权重组合 `final_weight = exp(-max(w_z, 0.0) - max(w_l, 0.0)) * w_n`

这个公式将三个权重因子非线性地组合在一起。深度和亮度权重在指数部分相加，这意味着它们中任何一个的惩罚效果都会被放大。法线权重则作为一个最终的乘数，如果法线不匹配，它可以一票否决掉整个权重。这种组合方式能产生平滑且自然的权重衰减，是实现高质量滤波效果的关键。

#### 方差引导滤波 (Variance-Guided Filtering)

这是 SVGF 的灵魂，体现在 `w_l` 的计算上。

`w_l = exp(-(abs(l_p - l_q) / (sigma_l * sqrt(g) + 1e-5)))`

这里的 `g` 是通过模糊方差图得到的**局部平均方差**。这个分母是整个算法的“自动调节旋钮”：

  * **当局部方差 `g` 很高时 (噪点区域)**:

      * 分母 `sigma_l * sqrt(g)` 变得很大。
      * 整个分数项 `abs(l_p - l_q) / ...` 趋近于 0。
      * `w_l` 趋近于 `exp(0)`，也就是 1。
      * **结果**: 亮度权重失效了！滤波器会大胆地将差异巨大的颜色混合在一起，从而强力地抹除噪点。

  * **当局部方差 `g` 很低时 (干净区域)**:

      * 分母很小。
      * 整个分数项对 `abs(l_p - l_q)` 的变化非常敏感。
      * `w_l` 会因为微小的亮度差异而快速衰减到 0。
      * **结果**: 亮度权重变得极其严格！滤波器会拒绝混合任何有细微明暗变化的颜色，从而完美地保护了图像细节。

通过这种方式，SVGF 算法实现了终极目标：**在噪点多的地方大力模糊，在细节多的地方精细保护**，而这一切都是根据前几步计算出的数据自动完成的。

### Downsample Pass
```glsl
/**
 * @brief  对全分辨率的G-Buffer进行智能降采样，为下一帧生成历史纹理。
 *
 * @details
 * 该计算着色器为每个低分辨率（半分辨率）像素，检查其对应的 2x2 高分辨率像素块。
 * 它根据深度值选择这个 2x2 块中最“有代表性”的一个像素——即最靠近摄像机的那个像素。
 * 然后，它将这个被选中像素的 G-Buffer 数据（法线、物体ID、线性深度等）
 * 拷贝到低分辨率的历史纹理中。
 * 这种方法能有效保留物体边缘轮廓，防止前景的精细物体在降采样中被背景“侵蚀”。
 */

// 定义一个 2x2 像素块的相对偏移
ivec2 pixel_offsets[] = ivec2[](ivec2(0, 0), ivec2(0, 1), ivec2(1, 0), ivec2(1, 1));

layout (local_size_x = 8, local_size_y = 8, local_size_z = 1) in;

void main() {
    // frag_coord 是当前正在处理的低分辨率（目标分辨率）像素坐标。
    ivec2 frag_coord = ivec2(gl_GlobalInvocationID.xy);

    // --- 1. 在 2x2 邻域内选择“最佳”像素 ---
    int chosen_hiresolution_sample_index = 0;
    float closer_depth = 1.f;

    // 遍历当前低分辨率像素对应的 2x2 高分辨率像素块。
    for (int i = 0; i < 4; ++i) {
        // 计算高分辨率像素的坐标。
        ivec2 hires_coord = frag_coord * 2 + pixel_offsets[i];
        // 读取该高分辨率像素的深度值。
        float depth = texelFetch(global_textures[nonuniformEXT(depth_texture_index)], hires_coord, 0).r;

        // 寻找 2x2 块中深度值最小的像素。
        if (closer_depth > depth) {
            closer_depth = depth;
            chosen_hiresolution_sample_index = i; // 记录下这个“获胜”像素的索引
        }
    }

    // --- 2. 拷贝“最佳”像素的数据到历史纹理 ---
    // 计算出获胜像素的最终高分辨率坐标。
    ivec2 chosen_coord = frag_coord * 2 + pixel_offsets[chosen_hiresolution_sample_index];
    
    // 从全分辨率 G-Buffer 的“获胜”坐标处读取法线、物体ID、线性深度等信息...
    vec4 normals = texelFetch(global_textures[nonuniformEXT(normals_texture_index)], chosen_coord, 0);
    vec4 mesh_id = texelFetch(global_textures[nonuniformEXT(mesh_id_texture_index)], chosen_coord, 0);
    vec4 linear_z_dd = texelFetch(global_textures[nonuniformEXT(linear_z_dd_texture_index)], chosen_coord, 0);

    // ...然后将这些信息写入到半分辨率的历史纹理中，供下一帧的时间性算法使用。
    imageStore(global_images_2d[history_normals_texture_index], frag_coord, normals);
    imageStore(global_images_2d[history_mesh_id_texture_index], frag_coord, mesh_id);
    imageStore(global_images_2d[history_linear_depth_texture], frag_coord, linear_z_dd);

    // --- 3. 更新其他历史纹理 ---
    // 对于某些已经是低分辨率的纹理（如上一Pass的输出），直接拷贝即可。
    vec4 moments = texelFetch(global_textures[nonuniformEXT(integrated_moments_texture_index)], frag_coord, 0);
    imageStore(global_images_2d[history_moments_texture_index], frag_coord, moments);
}
```

# Temporal Anti-Aliasing (TAA)

## 工作流程

1. **速度采样 (Velocity Sampling)**:
    - 首先，在3x3邻域内寻找**深度最近**的像素，并使用它的运动矢量。这对于处理细小物体或物体边缘的运动非常重要。
2. **历史重投影与采样 (History Reprojection & Sampling)**:
    - 使用获取到的 `velocity` 计算出重投影的UV坐标 `reprojected_uv`。
    - 根据 `history_sampling_filter` 模式，使用单点采样或高质量的 Catmull-Rom 滤波来获取 `history_color`。
3. **当前邻域分析 (Current Neighborhood Analysis)**:
    - 遍历当前像素的3x3邻域。
    - 使用 `subsample_filter`（如 Mitchell-Netravali 或 Blackman-Harris）对邻域进行加权平均，得到一个高质量的当前帧颜色 `current_sample`。
    - 同时，计算出该邻域的颜色AABB (`neighborhood_min/max`) 和颜色矩 (`m1`, `m2`)，为历史裁剪做准备。
4. **历史约束 (History Constraint)**:
    - 这是抑制鬼影的关键。根据 `history_constraint_mode` 的不同，对 `history_color` 执行不同的裁剪策略，包括简单的钳位（Clamp）、AABB裁剪（Clip），以及更高级的方差裁剪（VarianceClip）。
5. **最终颜色混合 (Resolve)**:
    - 这是最后一步，将**经过约束的历史颜色**和**经过滤波的当前颜色**进行混合。
    - 混合的权重 `current_weight` 和 `history_weight` 不是固定的 `0.1/0.9`，而是可以通过 `options` 进一步动态调整，例如：
        - `use_temporal_filtering()`: 根据邻域颜色的变化幅度来调整权重。
        - `use_inverse_luminance_filtering()`: 根据颜色的亮度来调整权重，有助于抑制高光区域的闪烁。

## Temporal Anti-Aliasing

TAA 是一种强大且在现代游戏中应用极其广泛的技术。它的核心思想是**复用前几帧的历史信息**，将时间上的分辨率转化为空间上的分辨率。通过每一帧对场景进行微小的抖动（Jitter），然后将当前帧与经过校正的历史图像进行混合，TAA 能以极低的性能开销实现媲美超采样 (Supersampling) 的高质量抗锯齿效果。

然而，TAA 的最大挑战是处理动态场景，如果历史信息校正不当，就会产生**鬼影 (Ghosting)** 和**模糊 (Blur)** 等副作用。因此，这段代码的大部分内容都是在用各种先进的技术来智能地约束历史数据，以抑制这些副作用。


```glsl
vec3 taa(ivec2 pos) {
    // ===================================================================
    // 第 1 步：速度矢量与时间重投影
    // ===================================================================
    // 为了更稳定地拾取运动矢量（尤其是在物体边缘），可以在 3x3 邻域内搜索最靠近的像素。
    // 这里我们假设已找到最近像素的坐标 `closest_position`。
    ivec2 closest_position = find_closest_fragment_3x3(pos);
    
    // 采样该位置的运动矢量。
    const vec2 velocity = sample_motion_vector_point(closest_position);
    // 计算当前像素的 UV 坐标。
    const vec2 screen_uv = uv_nearest(pos, resolution);
    // 根据运动矢量，反向计算出当前像素在上一帧的 UV 坐标 (reprojected_uv)。
    const vec2 reprojected_uv = screen_uv - velocity;
    
    // ===================================================================
    // 第 2 步：历史颜色采样
    // ===================================================================
    // 使用高质量的 Catmull-Rom 样条插值，从历史纹理中采样颜色。
    // 这比简单的双线性插值更能保留细节，有效减缓 TAA 累积多帧后带来的模糊。
    vec3 history_color = sample_texture_catmull_rom(reprojected_uv, history_color_texture_index);

    // ===================================================================
    // 第 3 步：当前帧邻域分析
    // ===================================================================
    // 遍历当前像素的 3x3 邻域，以收集用于验证和约束历史颜色的统计信息。
    vec3 current_sample_total = vec3(0);  // 邻域加权颜色累加器
    float current_sample_weight = 0.0f; // 邻域权重累加器
    vec3 neighborhood_min = vec3(10000);  // 邻域颜色AABB的最小值
    vec3 neighborhood_max = vec3(-10000); // 邻域颜色AABB的最大值
    vec3 m1 = vec3(0); // 邻域颜色的一阶矩（用于计算均值）
    vec3 m2 = vec3(0); // 邻域颜色的二阶矩（用于计算方差）

    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 pixel_position = pos + ivec2(x, y);
            pixel_position = clamp(pixel_position, ivec2(0), ivec2(resolution - 1));

            vec3 current_sample_neighbor = sample_current_color_point(pixel_position).rgb;
            
            // 根据邻域像素与中心点的距离，计算一个空间权重。
            // 这通常是一个中心点权重最高的滤波核，如 Tent 或 Gaussian 核。
            float subsample_distance = length(vec2(x, y));
            float subsample_weight = subsample_filter(subsample_distance);

            // 累加加权后的颜色和权重。
            current_sample_total += current_sample_neighbor * subsample_weight;
            current_sample_weight += subsample_weight;

            // 更新邻域颜色的AABB包围盒。
            neighborhood_min = min(neighborhood_min, current_sample_neighbor);
            neighborhood_max = max(neighborhood_max, current_sample_neighbor);
            
            // 累加矩，用于后续的方差计算。
            m1 += current_sample_neighbor;
            m2 += current_sample_neighbor * current_sample_neighbor;
        }
    }
    
    // 计算经过空间滤波后的当前帧颜色。
    vec3 current_sample = current_sample_total / current_sample_weight;

    // 如果重投影坐标超出了屏幕范围，则无法复用历史，直接返回经过邻域滤波的当前颜色。
    if (any(lessThan(reprojected_uv, vec2(0.0f))) || any(greaterThan(reprojected_uv, vec2(1.0f)))) {
        return current_sample;
    }
    
    // ===================================================================
    // 第 4 步：历史约束与鬼影抑制
    // ===================================================================
    // 这是 TAA 算法的灵魂，用于判断采样到的 history_color 是否“合理”。
    switch (history_constraint_mode) {
        case HistoryConstraintModeNone:
            // 不做任何处理，完全相信历史颜色。容易产生鬼影。
            break;

        case HistoryConstraintModeClamp:
            // 硬性裁剪：将历史颜色强制限制在当前邻域颜色的AABB包围盒内。
            history_color.rgb = clamp(history_color.rgb, neighborhood_min, neighborhood_max);
            break;

        case HistoryConstraintModeClip:
            // AABB 裁剪：将从 current_sample 指向 history_color 的线段，
            // 与邻域 AABB 包围盒求交。这比 Clamp 更柔和，能保留颜色的变化方向。
            history_color.rgb = clip_aabb(neighborhood_min, neighborhood_max, vec4(history_color, 1.0f), 1.0f).rgb;
            break;

        case HistoryConstraintModeVarianceClip:
        {
            // 方差裁剪：计算邻域颜色的均值(mu)和标准差(sigma)。
            vec3 mu = m1 / 9.0f;
            vec3 sigma = sqrt(abs((m2 / 9.0f) - (mu * mu)));
            // 构建一个基于统计的“智能”包围盒 [mu - gamma*sigma, mu + gamma*sigma]。
            vec3 minc = mu - gamma * sigma;
            vec3 maxc = mu + gamma * sigma;
            // 将历史颜色裁剪到这个统计包围盒内。
            history_color.rgb = clip_aabb(minc, maxc, vec4(history_color, 1), 1.0f).rgb;
            break;
        }
        
        case HistoryConstraintModeVarianceClipClamp:
        default:
        {
            // 混合模式：先进行一次硬性的 AABB Clamp，再进行一次方差裁剪。
            // 这是最鲁棒的模式，Clamp 移除了极端异常值，VarianceClip 进行更精细的统计约束。
            float rcp_sample_count = 1.0f / 9.0f;
            float gamma = 1.0f;
            vec3 mu = m1 * rcp_sample_count;
            vec3 sigma = sqrt(abs((m2 * rcp_sample_count) - (mu * mu)));
            vec3 minc = mu - gamma * sigma;
            vec3 maxc = mu + gamma * sigma;

            vec3 clamped_history_color = clamp(history_color.rgb, neighborhood_min, neighborhood_max);
            history_color.rgb = clip_aabb(minc, maxc, vec4(clamped_history_color, 1), 1.0f).rgb;
            break;
        }
    }

    // ===================================================================
    // 第 5 步：最终混合与解析
    // ===================================================================
    // 动态计算混合权重，以在稳定性和响应性之间取得平衡。
    vec3 current_weight;
    vec3 history_weight;

    // ... [此处省略了多个复杂的动态权重计算逻辑] ...
    // 这些逻辑会根据亮度、对比度等因素，动态调整 current_weight 和 history_weight。
    // 为了简化，我们假设一个基础的混合因子。
    float blend_factor = 0.1; // 10% 当前帧, 90% 历史
    current_weight = vec3(blend_factor);
    history_weight = vec3(1.0 - blend_factor);

    // 最终颜色是当前颜色和（经过约束的）历史颜色的加权平均。
    vec3 result = (current_sample * current_weight + history_color * history_weight) / max(current_weight + history_weight, 1e-5);
    return result;
}
```

### 核心原理与关键技术详解

#### 邻域加权采样

在分析当前帧时，TAA 并不仅仅看中心像素 `pos` 的颜色，而是对其 3x3 邻域进行一次**空间滤波**。`subsample_filter` 函数定义了一个空间权重核（例如中心点权重最高，角落权重最低），这样做有两个目的：

  * **预滤波**: 得到的 `current_sample` 本身就是一个轻微模糊、抗锯齿的颜色，这有助于减少高频闪烁。
  * **收集统计数据**: 更重要的是，这个 3x3 邻域提供了丰富的统计信息（min/max AABB, 均值，方差），它们是后续**历史约束**步骤做出智能判断的依据。

#### 历史约束的所有模式

这是 TAA 算法质量的分水岭，用于解决**鬼影 (Ghosting)** 问题。

  * **`None`**: 不做任何操作，用于调试或对比。
  * **`Clamp`**: “硬”限制。非常暴力地将历史颜色拉回邻域AABB内，能有效防止极端鬼影，但可能在某些情况下丢失颜色变化的方向性，显得生硬。
  * **`Clip`**: “软”限制。它将 `current_sample` 和 `history_color` 看作一条线段的两个端点。如果 `history_color` 在AABB之外，它会找到这条线段与AABB的交点作为新的 `history_color`。这比 `Clamp` 更优，因为它保留了颜色从当前帧到历史帧的变化趋势。
  * **`VarianceClip`**: 统计限制。这是最智能的方法。它认为一个“合理”的历史颜色，应该落在当前邻域颜色分布的几个标准差之内。它创建了一个统计学上的置信区间，任何落在这个区间外的历史颜色都被视为“异常值”（即鬼影）并被修正。
  * **`VarianceClipClamp`**: 终极鲁棒模式。它结合了 `Clamp` 和 `VarianceClip` 的优点。先用 `Clamp` 粗暴地干掉那些最离谱的鬼影颜色，防止它们污染后续的统计计算。然后，在被“预处理”过的颜色上，再用更精细的 `VarianceClip` 进行约束。这在快速运动和高对比度场景中表现得最为稳定。

#### 动态混合权重

一个高质量的 TAA 不会使用固定的混合系数（如 `blend_factor = 0.1`）。**动态权重**可以基于如下因素进行调整：

  * **对比度/亮度检测**: 在图像对比度高（细节丰富）的区域，可能会增加历史权重，以便用更多的时间样本来更好地解析这些细节。
  * **亮度差异检测**: 如果当前帧和历史帧的亮度差异很大，可能说明场景发生了剧烈变化（如爆炸），此时会降低历史权重（增加当前帧权重），让画面更快地更新到新状态，减少拖影。
  * **逆亮度权重**: `current_weight *= 1.0 / (1.0 + luminance_source)` 是一种特殊技巧，用于抑制**高光噪点 (Fireflies)**。它降低了非常亮的像素在混合中的权重，防止这些偶然出现的闪烁噪点被 TAA “锁定”并保留在画面上。

##### 基于对比度的自适应滤波 (Contrast-Adaptive Filtering)

这个 `if (use_temporal_filtering())` 分支的目的是根据**图像的局部对比度**来调整混合权重。

```glsl
// --- 1. 基于对比度的自适应滤波 ---
if (use_temporal_filtering()) {
    // 1a. 计算局部对比度
    // abs(neighborhood_max - neighborhood_min) 计算了3x3邻域颜色AABB的大小，
    // 是一个衡量局部颜色变化范围（即对比度）的指标。
    // 再除以邻域的平均颜色 current_sample 进行归一化。
    // 结果 temporal_weight 是一个 [0, 1] 的值，代表了局部对比度的高低。
    vec3 temporal_weight = clamp(abs(neighborhood_max - neighborhood_min) / current_sample, vec3(0), vec3(1));
    
    // 1b. 将对比度映射到历史权重
    // 使用 mix 函数进行线性映射：
    // - 如果对比度低 (temporal_weight 接近 0)，history_weight 接近 0.25。
    // - 如果对比度高 (temporal_weight 接近 1)，history_weight 接近 0.85。
    history_weight = clamp(mix(vec3(0.25), vec3(0.85), temporal_weight), vec3(0), vec3(1));
    // 当前帧的权重与历史权重互补。
    current_weight = 1.0f - history_weight;
}
```

  * **目的解析**:
      * **在低对比度区域 (如平坦的墙面)**: `history_weight` 会较低（\~0.25），意味着当前帧的权重较高（\~0.75）。图像会**更快地收敛**到当前帧。这样做的好处是，在这些平滑区域，鬼影会特别明显，所以快速混合有助于**抑制鬼影**。
      * **在高对比度区域 (如物体边缘、精细纹理)**: `history_weight` 会较高（\~0.85），意味着当前帧的权重较低（\~0.15）。图像会**更慢地收敛**，更多地依赖历史信息。这样做的好处是，这些区域是**锯齿最明显**的地方，通过累积更多的历史样本，可以更好地**平滑锯齿**，提升抗锯齿质量。


##### 基于亮度的权重调整 (Luminance-Based Weight Adjustment)

这个 `if (use_inverse_luminance_filtering() || ...)` 分支包含两种基于亮度信息的、用于抑制特定类型瑕疵的启发式算法。

```glsl
// --- 2. 基于亮度的权重调整 ---
if (use_inverse_luminance_filtering() || use_luminance_difference_filtering()) {
    // 2a. 准备工作：计算压缩后的颜色和亮度
    // 为了让亮度比较不受HDR高动态范围的极端值影响，先将颜色压缩到[0,1]范围。
    vec3 compressed_source = current_sample / (max(max(current_sample.r, current_sample.g), current_sample.b) + 1.0f);
    vec3 compressed_history = history_color / (max(max(history_color.r, history_color.g), history_color.b) + 1.0f);
    float luminance_source = luminance(compressed_source);
    float luminance_history = luminance(compressed_history);
    
    // 2b. 启发式算法一：亮度差异滤波
    if (use_luminance_difference_filtering()) {
        // 计算当前帧和历史帧之间归一化的亮度差异。
        float unbiased_diff = abs(luminance_source - luminance_history) / max(luminance_source, max(luminance_history, 0.2));
        // 将差异（0-1）转化为相似度（1-0）。
        float unbiased_weight = 1.0 - unbiased_diff;
        // 对相似度进行平方，使得权重对差异更敏感。
        float unbiased_weight_sqr = unbiased_weight * unbiased_weight;
        // k_feedback 是最终的混合因子，unbiased_weight_sqr 越高，k_feedback 越接近1。
        float k_feedback = mix(0.0f, 1.0f, unbiased_weight_sqr);

        // 用 k_feedback 来设置权重。
        // 如果亮度相似 (k_feedback高)，则更多地混合当前帧，以快速响应细微的光照变化。
        // 如果亮度差异大 (k_feedback低)，则更多地信任历史，以防止突变。
        history_weight = vec3(1.0 - k_feedback);
        current_weight = vec3(k_feedback);
    }
    
    // 2c. 启发式算法二：反向亮度滤波 (抑制高光噪点)
    // 这是在之前计算出的权重基础上，再乘上一个衰减因子。
    current_weight *= 1.0 / (1.0 + luminance_source);
    history_weight *= 1.0 / (1.0 + luminance_history);
}
```

  * **目的解析**:
      * **亮度差异滤波**: 这是一个额外的动态权重调节器。它根据当前帧和历史帧的亮度相似度来微调混合速度，其具体策略（相似时混合快还是慢）取决于引擎的整体调优目标。
      * **反向亮度滤波 (核心)**: 这是抑制**高光噪点 (Fireflies)** 或**镜面高光闪烁**的关键技巧。
          * 在光线追踪或某些PBR着色中，偶尔会因为采样不足而产生一些随机的、亮度极高的“野像素”（即“萤火虫”）。
          * `1.0 / (1.0 + luminance)` 这个公式的特性是，当 `luminance` 非常大时，结果会非常接近 0。
          * 通过将权重乘以这个因子，TAA 会**极大地降低这些“萤火虫”像素的权重**，无论它们出现在当前帧还是历史帧。这可以有效防止这些偶然出现的亮斑被 TAA 的反馈循环“锁定”，从而避免它们在屏幕上停留多帧，形成恼人的闪烁。

#### Catmull-Rom 滤波优化

```glsl
// 使用 Catmull-Rom 滤波对纹理进行采样，但只用 9 次纹理拾取（而非 16 次）。
// 这种优化利用了硬件的双线性过滤能力。
// 更多细节请参阅：http://vec3.ca/bicubic-filtering-in-fewer-taps/
vec3 sample_texture_catmull_rom(vec2 uv, uint texture_index) {
    // 1. 计算基础纹素坐标和分数偏移量。
    // 我们首先确定输入 UV 坐标周围的 4x4 纹素网格。
    vec2 sample_position = uv * resolution;
    // 'tex_pos_1' 是中心 2x2 块左上角纹素的坐标。
    vec2 tex_pos_1 = floor(sample_position - 0.5) + 0.5;
    // 'f' 是相对 'tex_pos_1' 的分数偏移量，用于插值计算。
    vec2 f = sample_position - tex_pos_1;

    // 2. 计算 Catmull-Rom 样条权重。
    // 这是四个标准的 1D Catmull-Rom 核函数权重，根据分数偏移量 'f' 分别为 x 和 y 轴计算。
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);

    // 3. 合并中间样本的权重并计算新的偏移量。
    // 这是优化的核心。我们合并中间两个样本 (w1, w2) 的权重，并计算一个新的偏移量，
    // 从而利用硬件的双线性插值器在一次拾取中完成采样。
    vec2 w12 = w1 + w2;
    vec2 offset_12 = w2 / w12;

    // 4. 计算最终用于采样的 3x3 UV 坐标网格。
    // 现在我们不再需要 4x4 的网格，只需在 3x3 的位置上采样。
    vec2 tex_pos_0 = tex_pos_1 - 1.0;
    vec2 tex_pos_3 = tex_pos_1 + 2.0;
    vec2 tex_pos_12 = tex_pos_1 + offset_12;

    // 将坐标归一化到 [0, 1] 范围以便进行纹理拾取。
    tex_pos_0 /= resolution;
    tex_pos_3 /= resolution;
    tex_pos_12 /= resolution;

    // 5. 执行 9 次纹理拾取并应用权重。
    // 我们在计算出的 9 个 UV 坐标上对纹理进行采样，并乘以相应的组合权重，以计算出最终颜色。
    vec3 result = vec3(0.0);
    // 第 0 行
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_0.x, tex_pos_0.y), 0).rgb   * w0.x  * w0.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_12.x, tex_pos_0.y), 0).rgb * w12.x * w0.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_3.x, tex_pos_0.y), 0).rgb  * w3.x  * w0.y;
    // 第 1 行
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_0.x, tex_pos_12.y), 0).rgb   * w0.x  * w12.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_12.x, tex_pos_12.y), 0).rgb * w12.x * w12.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_3.x, tex_pos_12.y), 0).rgb  * w3.x  * w12.y;
    // 第 2 行
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_0.x, tex_pos_3.y), 0).rgb   * w0.x  * w3.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_12.x, tex_pos_3.y), 0).rgb * w12.x * w3.y;
    result += textureLod(global_textures[nonuniformEXT(texture_index)], vec2(tex_pos_3.x, tex_pos_3.y), 0).rgb  * w3.x  * w3.y;

    // 6. 可选步骤：转换颜色空间。
    if (use_ycocg()) {
        result = rgb_to_ycocg(result.rgb);
    }

    return result;
}
```

这个着色器（shader）使用 **Catmull-Rom 样条**来进行高质量的纹理过滤，这是一种三次插值（cubic interpolation）。该方法在视觉上比标准的双线性过滤更平滑，并避免了其他一些技术可能导致的过度模糊。这里的关键创新是一个极大地减少了所需纹理采样次数的优化。

##### 数学原理：Catmull-Rom 样条

双三次滤波（Bicubic filtering）的原理是，通过一个 4x4 的纹素（texel）网格拟合出一条平滑曲线，从而找到特定 UV 坐标上的颜色。这通常需要先沿着一个轴（如水平方向）进行四次插值，然后用得到的结果在另一个轴（垂直方向）上进行最终的一次插值。

Catmull-Rom 插值公式根据一个分数距离 $f$ 和四个控制点 ($P_0, P_1, P_2, P_3$) 来计算一个点 $P$。最终值是一个加权和：

$P(f) = w_0 P_0 + w_1 P_1 + w_2 P_2 + w_3 P_3$

权重 ($w_0, w_1, w_2, w_3$) 是从 $f$ 推导出的三次多项式。代码为 x 和 y 轴预先计算了这些权重：

  * $w_0(f) = -0.5f + f^2 - 0.5f^3$
  * $w_1(f) = 1 - 2.5f^2 + 1.5f^3$
  * $w_2(f) = 0.5f + 2f^2 - 1.5f^3$
  * $w_3(f) = -0.5f^2 + 0.5f^3$

代码中的 `vec2 w0`, `w1`, `w2`, 和 `w3` 存储了这四个权重，其 `.x` 分量用于水平轴，`.y` 分量用于垂直轴。


这段代码中最精彩的优化是将所需的纹理拾取（texture fetch）次数从 16 次（对应 4x4 网格）大幅减少到 9 次。它通过巧妙地利用 GPU 内置的**双线性过滤（bilinear filtering）硬件**来实现这一点。

标准的 1D Catmull-Rom 插值需要四个纹素值：$T_0, T_1, T_2, T_3$。插值结果为：
$C = w_0 T_0 + w_1 T_1 + w_2 T_2 + w_3 T_3$

优化的重点在于中间的两个纹素 $T_1$ 和 $T_2$。它们贡献的部分是 $w_1 T_1 + w_2 T_2$。这个表达式可以改写为：

$w_1 T_1 + w_2 T_2 = (w_1 + w_2) \left( \frac{w_1}{w_1 + w_2} T_1 + \frac{w_2}{w_1 + w_2} T_2 \right)$

请注意括号中的部分：这是 $T_1$ 和 $T_2$ 之间的**线性插值**。这恰好是 GPU 的纹理采样器在两个纹素之间拾取纹理（即双线性过滤）时所做的工作！

1.  **组合权重**：代码计算一个新的组合权重 `w12 = w1 + w2`。
2.  **新偏移量**：代码计算一个新的采样偏移 `offset_12 = w2 / w12`。这个偏移量精确地告诉 GPU 应该在纹素 $T_1$ 和 $T_2$ 之间的哪个位置进行采样，以获得我们想要的线性插值结果。
3.  **单次拾取**：通过在 `tex_pos_1 + offset_12` 位置采样，我们用**一次纹理拾取**就得到了括号中表达式的结果。

这个技巧将每行/每列的四次采样减少到三次。当在二维（x 和 y 轴）上都应用这个技巧时，总的拾取次数就从 $4 \times 4 = 16$ 次减少到 $3 \times 3 = 9$ 次，从而在保持高质量视觉效果的同时，显著提升了性能。

#### Clip AABB 函数

```glsl
// "Inside" 游戏中使用的优化版 AABB 裁剪函数。
// 该函数将一个点裁剪到一个轴对齐包围盒（AABB）的边界内。
vec4 clip_aabb(vec3 aabb_min, vec3 aabb_max, vec4 previous_sample, float average_alpha) {
    // 注意：此方法总是将点朝向 AABB 的中心进行裁剪，但速度非常快！

    // 1. 计算 AABB 的中心点 (p_clip) 和半尺寸向量（范围, extents）。
    // 这是表示 AABB 的一种常用且高效的方式。
    vec3 p_clip = 0.5 * (aabb_max + aabb_min);
    vec3 e_clip = 0.5 * (aabb_max - aabb_min) + 0.0000001; // 加上一个极小值以防止除以零

    // 2. 计算点相对于 AABB 中心的向量。
    // 我们在四维空间中进行计算，以同时处理位置（xyz）和 alpha 值（w）。
    vec4 v_clip = previous_sample - vec4(p_clip, average_alpha);

    // 3. 将向量归一化到 AABB 的单位空间内，并计算其 L-∞ 范数。
    // 'v_unit' 是点在 AABB 的局部坐标系中的位置，其中 AABB 本身变成了一个从 [-1, -1, -1] 到 [1, 1, 1] 的单位立方体。
    vec3 v_unit = v_clip.xyz / e_clip;
    vec3 a_unit = abs(v_unit);
    // 'ma_unit' 是点在单位化空间中的切比雪夫距离（Chebyshev distance），也称为 L-∞ 范数。
    // 它表示所有坐标轴分量中的最大值。
    float ma_unit = max(a_unit.x, max(a_unit.y, a_unit.z));

    // 4. 判断点是否在 AABB 外部，如果是，则将其拉回边界。
    if (ma_unit > 1.0) {
        // 如果 ma_unit > 1.0，说明点在单位立方体之外，即在 AABB 之外。
        // 我们通过除以 ma_unit 来缩放从中心出发的向量 v_clip，
        // 从而将点精确地投射回 AABB 的边界上。
        return vec4(p_clip, average_alpha) + v_clip / ma_unit;
    }
    else {
        // 如果 ma_unit <= 1.0，说明点在 AABB 内部，无需裁剪。
        return previous_sample;
    }
}
```

这个函数实现了一种非常快速的算法，用于将一个点“拉回”到一个轴对齐包围盒（AABB）的边界内。它因其在著名游戏《Inside》中的使用而为人所知。其核心思想是**空间变换**和利用**切比雪夫距离**进行判断，从而避免了传统方法中复杂的、逐个平面的裁剪测试。

##### 关键技术与数学原理

该算法的巧妙之处在于，它将针对任意 AABB 的裁剪问题，转化为一个针对单位立方体的、非常简单的裁剪问题。

**1. AABB 的中心-范围表示法 (Center-Extents Representation)**

代码首先没有直接使用 `aabb_min` 和 `aabb_max`，而是计算出了 AABB 的**中心点 `p_clip`** 和**半尺寸向量（或称范围）`e_clip`**。

  * **中心 `p_clip`**: $(aabb_{max} + aabb_{min}) / 2$
  * **范围 `e_clip`**: $(aabb_{max} - aabb_{min}) / 2$

这种表示法在后续计算中更为方便。

**2. 空间归一化 (Space Normalization)**

接下来是最关键的一步。代码计算了从 AABB 中心 `p_clip` 指向采样点 `previous_sample` 的向量 `v_clip`，然后用 AABB 的范围 `e_clip` 去除它：

`vec3 v_unit = v_clip.xyz / e_clip;`

这个除法操作在几何上等同于进行一次**非均匀缩放**。它将整个坐标系进行变换，使得原来的 AABB 在这个新的“单位空间”里，变成了一个**中心在原点、大小为 2x2x2 的单位立方体**（即从 `[-1,-1,-1]` 到 `[1,1,1]`）。而 `v_unit` 就是原始点在这个新空间中的坐标。

**3. 切比雪夫距离 (Chebyshev Distance)**

在单位立方体空间中，判断一个点是否在立方体内变得异常简单。一个点在立方体内，当且仅当它的 x, y, z 坐标的绝对值都小于等于 1。

代码计算的 `ma_unit` 正是这个判断依据：

`float ma_unit = max(abs(v_unit.x), max(abs(v_unit.y), abs(v_unit.z)));`

这个值在数学上被称为**切比雪夫距离**或 **$L_∞$ 范数**。

  * 如果 `ma_unit <= 1.0`，说明点的所有分量都在 `[-1, 1]` 区间内，点位于 AABB **内部**。
  * 如果 `ma_unit > 1.0`，说明点至少有一个分量超出了 `[-1, 1]` 区间，点位于 AABB **外部**。

**4. 投影裁剪 (Projection Clipping)**

当点在外部时 (`ma_unit > 1.0`)，代码执行以下操作：

`return vec4(p_clip, average_alpha) + v_clip / ma_unit;`

这里的 `v_clip / ma_unit` 是一个非常精妙的计算。由于 `ma_unit` 是 `v_clip` 在单位空间中“超出”边界的比例，将原始的 `v_clip` 向量除以 `ma_unit`，会将其**等比例缩短**，使得其缩短后的终点**恰好落在 AABB 的边界上**。这个投影的方向始终是**从 AABB 的中心指向原始点**。

**总结**：该算法通过一次向量减法、一次向量除法和一次最大值比较，就完成了裁剪判断和操作，完全避免了分支和复杂的几何测试，因此执行效率极高。其唯一的“限制”是裁剪方向固定为朝向包围盒中心，但这在许多图形学应用（如体积雾、TAA等）中是完全可以接受的。