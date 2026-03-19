---
title: "Optimizing UE5: Advanced Rendering, Graphics Performance, and Memory Management"
date: 2026-03-19 13:15:58
---


# Optimizing UE5: Advanced Rendering, Graphics Performance, and Memory Management

[Optimizing UE5: Advanced Rendering, Graphics Performance, and Memory Management | Unreal Fest 2024](https://www.youtube.com/watch?v=dj4kNnj4FAQ)

## 推荐项目设置（Project Settings）

以下设置假设项目使用 **全功能 UE5 渲染管线** （Nanite + Lumen + Virtual Shadow Maps）。

### 编辑器启动优化

- 将 **Startup Map** 设置为一个 **空关卡** ：避免每次启动编辑器都加载完整场景，显著缩短启动时间。

### 关闭不需要的功能

- **Allow Static Lighting → 关闭** ：既然使用 Lumen 做全局光照，就不需要烘焙光照。关闭后还有一个额外好处——可以在 Lumen 中使用 **Material Ambient Occlusion** 。

- **Reverse Index Buffer → 关闭** ：该选项会为静态网格生成一份 **逆序排列的索引缓冲** ，用于处理负缩放（negative scale）的物体。如果你不使用负缩放（也不应该使用），可以安全关闭以节省内存。

- **Depth Only Buffer → 关闭** ：该选项会额外创建一份仅用于深度渲染的顶点数组。由于 **Nanite 自行处理深度渲染** ，这个缓冲变得多余。关闭后对 **静态网格内存** 节省尤为显著——当使用 Nanite 级别的高精度几何体（数百万三角面）时，这些冗余缓冲会占用大量内存。

### Lumen 追踪模式设置

| 追踪模式 | 推荐设置 |
|---|---|
| **硬件光线追踪（Hardware Ray Tracing）** | 使用 **Surface Cache Sampling** |
| **软件光线追踪（Software Ray Tracing）** | 使用 **Global Traces** |

### 启用 Virtual Textures

- 在项目设置中将 **Virtual Textures → Enabled** 。

---



# 虚拟纹理（Virtual Textures）实践指南

## 理解"虚拟化"（Virtualization）的核心概念

### 什么是虚拟化？

> **虚拟化 = 创建某种数据的稀疏版本（Sparse Version），只将当前需要的部分加载到工作内存中，忽略其余部分。**

### 书本比喻

- 想象你在做一个 **电子书阅读器** ：
  - 你知道这本书的所有页面内容，但 **不需要把整本书加载到内存** 。
  - 当前正在阅读的页面 → **高分辨率加载** 。
  - 前后几页（用户可能快速翻阅到的）→ **中等分辨率加载** （预缓存）。
  - 书尾远处的页面 → **极低分辨率或不加载** 。
- 这就形成了一个 **更高效的数据结构** ，只存储和展示与用户相关的内容。

### 为什么需要虚拟化？

- **历史回顾** ：早期实时渲染只需关心三大类资源—— **纹理、网格、其他** 。
- **问题** ：随着图形技术进步，资产规模急剧膨胀，但 **显存（VRAM）容量的增长速度远远跟不上需求增长** 。
- **新增的显存消耗者** ：
  - **Distance Fields**
  - **Lumen** 数据结构
  - **Virtual Shadow Maps**
  - **Runtime Virtual Textures**
  - 等等……
- **结论** ：必须通过虚拟化技术，更高效地利用有限的显存资源。

---

## 虚拟纹理（Virtual Textures）深度解析

### 基本原理

- 虚拟纹理自 **UE 4.22** 左右引入，但 **不是默认功能** ，需要手动启用。
- 核心机制：
  1. 将纹理划分为 **页表（Page Table）** 。
  2. 通过一个 **反馈 Pass（Feedback Pass）** 判断当前帧每个纹理区域需要的 **Mip 级别** 。
  3. 只 **流式加载（Stream In）** 当前可见且需要的纹理页块及其对应 Mip 层级。
- 可以使用 `r.VT.Borders 1` 来可视化不同纹理页块在不同分辨率下的加载状态。

### 实际案例：Hillside 示例项目

这是一个 **建筑可视化与线性内容** 项目（非游戏/非实时渲染），默认使用虚拟纹理。

| 统计项 | 数值 | 说明 |
|---|---|---|
| **Streaming Pool（流式池）** | 2000 MB | 默认值 |
| **Required Pool（非虚拟流式纹理）** | **95 MB** | 非常少 |
| **Virtual Texture 实际物理内存** | **~500 MB** | 含所有压缩类型 + 页表 |
| **全部虚拟纹理 Mip 0 磁盘大小** | **22 GB** | 如果不做流式处理会直接 OOM |

> **关键结论** ：通过虚拟纹理，22 GB 的纹理数据被压缩到仅需 ~500 MB 的运行时内存即可渲染整个高分辨率场景。

### 两种虚拟纹理模式

| 类型 | 核心优势 | 代价 |
|---|---|---|
| **Streaming Virtual Textures（SVT）** | **节省内存** | 轻微的性能开销 |
| **Runtime Virtual Textures（RVT）** | **节省性能（减少绘制调用）** | 额外的内存消耗 |

- **Runtime Virtual Textures** 通常用于 **Landscape** 等场景（已有大量教程）。
- 本次讲座重点聚焦 **Streaming Virtual Textures** ，因为它 **被严重低估和低利用** 。

### 如何启用 Streaming Virtual Textures

#### 步骤一：纹理资产设置

- 在纹理资产中找到 **Virtual** 分类，勾选 **Virtual Texture Streaming** 。

#### 步骤二：材质修改（关键！）

- 仅在纹理上勾选虚拟流式还不够，还必须 **修改材质中的采样器类型（Sampler Type）** 。
- 需要将采样器类型改为 **Virtual 系列** ：
  - **Virtual Color**
  - **Virtual Grayscale**
  - **Virtual Alpha**
  - 等等
- 一旦使用虚拟采样器类型，该材质参数 **只能接受虚拟纹理** ，不能再使用普通纹理。

### 关于分辨率的误解

> **常见误解** ："虚拟纹理只适合 4K 以上的高分辨率纹理。"

**事实** ：
- 就像 Nanite 不仅仅适用于高精度几何体一样—— **"如果能用 Nanite，就应该用 Nanite，不管三角面数多少"** 。
- 同理， **虚拟纹理对低于 4K 的纹理同样有效** 。
- 高分辨率纹理受益最大，但 **2K 甚至更小的纹理也能从中获益** 。

### 工作流的额外成本

使用 SVT 需要注意的工作量：
1. **每个纹理资产** 都需要勾选虚拟流式。
2. **每个材质** 都需要将采样器类型改为虚拟类型。
3. 这在项目初期规划时设定好会比较容易；如果是中途迁移，则需要批量处理（讲者暗示后续会介绍自动化方案）。

---

## 核心要点总结

1. **虚拟化是 UE5 内存管理的核心哲学** ：Nanite（虚拟几何体）、Lumen、Virtual Shadow Maps、Virtual Textures 全部基于"只加载需要的部分"这一理念。
2. **项目初始设置至关重要** ：关闭不需要的缓冲和功能可以节省大量静态网格内存。
3. **Streaming Virtual Textures 是被低估的利器** ：能将数十 GB 的纹理压缩到数百 MB 的运行时开销，适用于各种分辨率的纹理。
4. **使用 SVT 有材质层面的改造成本** ：需要同时修改纹理资产和材质采样器类型，建议在项目早期就做好规划。

## 纹理转换为虚拟纹理的工作流

### 批量转换工具

- 在编辑器中可以直接对纹理执行 **Convert to Virtual Texture** 操作。
- 该工具会 **自动完成以下步骤** ：
  1. 找到所有引用该纹理的 **材质参数（Parameter）** 。
  2. 将对应的 **采样器类型（Sampler Type）** 改为虚拟纹理采样器。
  3. 查找该参数在所有 **材质实例（Material Instance）** 中引用的 **其他纹理** ，一并转换。
- **尺寸阈值过滤** ：可以设置最小纹理尺寸，例如跳过 512 以下的纹理。**128 及以下的纹理绝对不应该转为虚拟纹理** （开销不值得）。

### 最佳实践：从项目初期就规划

- **最理想的方式** 是在项目第一天就决定使用虚拟纹理，而不是后期再做批量转换。
- 后期转换可能会 **遗漏某些资产** ，导致不一致。

### 默认纹理的设置

- 必须为每种 **虚拟采样器类型** 准备单独的 **默认纹理（Default Texture）** ：
  - **Default Virtual Color**
  - **Default Virtual Grayscale**
  - **Default Virtual Normal**
  - 等等……
- 这样做的目的是：在 **父材质（Parent Material）** 中避免对具体纹理资产的 **硬引用（Hard Reference）** ，保持材质系统的灵活性。

---

## 虚拟纹理堆栈（Virtual Texture Stacks）

### 什么是 Virtual Texture Stack？

> **Virtual Texture Stack = 材质中唯一的 UV 组合数量。**

- 每一种不同的 UV 变换方式都会产生一个独立的 Stack。
- 为了获取反馈信息（Feedback），引擎需要 **对每个 Stack 分别评估** ，因此 Stack 数量直接影响性能。

### 示例解析

| 纹理采样 | UV 方式 | 是否产生新 Stack |
|---|---|---|
| 颜色贴图 | UV0 | ✅ Stack #1 |
| 另一张贴图 | UV0 × 2（Double Tiling） | ✅ Stack #2 |
| 法线贴图 | UV0 | ❌ 与 Stack #1 复用 |
| 混合贴图 | UV0 × 3（Triple Tiling） | ✅ Stack #3 |

- **关键规则** ：
  - **相同 UV 变换** 的多个采样 → **不会** 增加 Stack 数量。
  - **不同 UV 变换** （即使只是 Tiling 倍率不同）→ **会** 增加 Stack 数量。
- 例如：把法线贴图从 UV0 改为 UV0 × 4 → Stack 数量从 3 增加到 4。

### 构建材质时的注意事项

- **尽量统一 UV 变换方式** ，减少 Stack 数量。
- 在材质编辑器中可以直接查看当前材质的 **Virtual Texture Stacks 数量** 。

---

## 虚拟纹理的性能开销分析

### 核心权衡

> **虚拟纹理 = 用性能换内存。** 节省了显存，但增加了 CPU 和 GPU 的额外开销。

### CPU 端开销

- **工作内容** ：计算当前帧需要上传哪些 Mip 和 Tile 到 GPU。
- **好消息** ：这部分开销 **不在游戏主线程（Game Thread）上** ，而是在其他线程处理，影响较小。
- **上传控制** ：

| 控制台变量 | 作用 |
|---|---|
| `r.VT.MaxUploadsPerFrame` | 控制每帧最大上传数（同时影响 Runtime 和 Streaming 虚拟纹理） |
| `r.VT.UploadsPerFrame` | **单独控制 Streaming 虚拟纹理** 的每帧上传数 |

- **Runtime Virtual Texture 的特殊考虑** ：上传次数过多意味着 **地形材质被反复重新渲染** ，会抵消性能收益，因此需要将 Runtime VT 的上传量保持较低。

### GPU 端开销

- **核心开销** ：每次纹理采样前需要先 **采样页表（Page Table）** 来确定目标 Tile 在显存中的实际位置。
- 这是一层额外的 **间接寻址（Indirection）** ，相当于多一次纹理采样。
- **一般情况下影响不大** ：普通材质中几个虚拟纹理采样不会造成明显瓶颈。
- **危险场景** ：虚拟纹理的 **链式查找** ——用虚拟纹理 Flow Map 去查另一个虚拟纹理，再查另一个……这种级联采样会迅速累积开销。

### 黄金法则

> **不要假设，要 Profile！** 不要因为"用了虚拟纹理"就预设性能会差。让你的项目数据告诉你真正的瓶颈在哪。

---

## 虚拟纹理的内存管理策略

### 流式池（Streaming Pool）的重新分配

- 回顾之前的数据：默认 **Non-Virtual Streaming Pool = 2000 MB** ，但启用虚拟纹理后可能只用了 **~100 MB** 。
- **比喻** ：用一辆大卡车运一块小石头 → 浪费资源。
- **做法** ：逐步降低 `r.Streaming.PoolSize`，引擎会在左上角弹出 **"Streaming Pool Over Budget X GB"** 警告，帮你找到 **高水位线（High Water Mark）** 。

### 虚拟纹理池的精细控制（UE 5.4 新功能）

#### 关键概念：每种压缩格式有独立的池

- 虚拟纹理 **不是一个统一的内存池** ，而是按 **压缩类型** 分开的：
  - **DXT5** → 通常是 Base Color 纹理
  - **BC4** → 单通道纹理
  - 其他格式各自独立

#### UE 5.4 的新工具：Virtual Texture Pool Settings

| 概念 | 说明 |
|---|---|
| **Transient Pool（临时池）** | 仅当前编辑器会话有效，自动记录各压缩格式的 **高水位线** |
| **Fixed Pool（固定池）** | 写入 `DefaultEngine.ini`，是项目实际使用的池大小配置 |

- **工作流** ：
  1. 在编辑器中飞行浏览场景，观察右下角的 **"Resizing Virtual Texture Streaming Pool"** Toast 提示。
  2. 进入 **Project Settings → Virtual Texture Pool Settings** 。
  3. 查看 **Transient Pool List** 中记录的各格式高水位线（例如 DXT5 = 105 MB，BC4 = 39 MB）。
  4. 将这些值 **复制到 Fixed Pool** 中作为正式配置。
  5. 可以关闭 **Pool Auto Grow in Editor** 以避免动态扩容时的 **卡顿（Hitch）** 。

#### 池大小过小的后果

- **传统纹理流式** ：强制降低 Mip 级别 → 出现经典的 **模糊纹理（Dropped Mip）** 。
- **虚拟纹理** ：可能 **直接将纹理从池中丢弃** → 出现 **纹理闪烁/弹出（Popping）** ，体验更差。
- **比喻** ：用小轿车搬巨石 → 装不下就出问题。

### UE 5.4 新工具：Render Resource Viewer

- 这是一个 **统一的渲染资源查看器** ，展示 **所有** 占用显存的资源：
  - **Virtual Texture Page Pool**（虚拟纹理页面池）
  - **Virtual Physical Textures**（各压缩格式的物理纹理）
  - **Virtual Page Table**（页表本身也占内存）
  - **Nanite Streaming Pool**
  - **TSR History Color Buffer**
  - 以及更多……
- **意义** ：现在的渲染管线不再只是"纹理 + 网格"，还有大量中间数据结构占用显存，这个工具让你 **一览全局** 。

---

## 虚拟纹理反馈机制的细节与调优

### 反馈采样（Feedback Sampling）

- 引擎大约 **每 16 个像素采样一次** 来判断需要哪些 Tile 和 Mip。
- 控制变量： `r.VT.FeedbackFactor`
- 采样位置会在帧间 **抖动（Jitter）** ，逐步覆盖整个画面。

### 页面驻留时间（Page Retention）

- 已加载的页面在 **不再可见后** 不会立即释放，而是保留一段时间。
- **原因** ：用户快速转头回看时，纹理仍在内存中，避免重新加载的延迟。
- 控制变量： `r.VT.PageRetentionThreshold`（可视化时表现为逐渐变暗的梯度）。

### 潜在问题：Unmap Requests 异常

- **现象** ：在 `stat VirtualTexturing` 中，**Unmap Requests** 值在 **静态场景** （相机不动）下持续偏高。
- **原因** ：当场景中纹理数量多、Stack 数量多、而反馈采样率有限时，可能出现 **采样覆盖不全** 的情况——某些可见纹理被误判为不需要，被从池中移除，下一帧又被请求回来，形成 **抖动循环** 。
- **理论预期** ：静态场景中，所有纹理请求应该 **收敛稳定（Settle）** ，Unmap Requests 趋近于零。
- **排查方法** ：监控 `stat VirtualTexturing` 中的 Unmap Requests，若异常高则需调整反馈因子或池大小。



# Nanite：虚拟化微多边形几何系统

---

## Nanite 核心原理回顾

### 什么是 Nanite？

- Nanite 是 UE5 的 **虚拟化微多边形几何系统（Virtualized Micro-Polygon Geometry）** ，本质上与虚拟纹理同属"虚拟化"思路。
- 核心目标：实现 **近像素级完美的几何 LOD（Near Pixel-Perfect LOD）** 。

### 工作机制

- 即使原始静态网格有 **1000 万三角面** ，实际在 GPU 上光栅化的 **远远不到这个数量** ——引擎会智能地只渲染当前视角真正需要的部分。
- 具体流程：
  1. **预简化（Pre-Simplification）** ：将几何体在磁盘上预先切分为 **约 128 个三角面一组的簇（Cluster）** 。
  2. **层级简化** ：多个相邻簇可以被进一步合并、简化为一个簇。
  3. 简化的判断依据是 **Max Pixels Per Edge** ——即每条边在屏幕上占多少像素。
  4. 这些簇本质上类似 **虚拟纹理的 Tile** ，是可以按需 **流入/流出（Stream In/Out）** 的离散几何单元。

### 配合 Virtual Shadow Maps

- 如果使用 Nanite，**强烈建议同时使用 Virtual Shadow Maps（VSM）** 。
- 两个系统 **专门设计为协同工作** ，能够以较高效率产出 **高分辨率阴影** 。

---

## UE 5.4 Nanite 新特性

### Nanite 样条网格（Spline Meshes）— 已进入生产就绪

- **Nanite Spline Mesh** 在 5.4 中正式可用于生产环境。
- 使用场景示例：用建模工具的 **Draw Spline Tool** 将人行道网格沿样条线贴合地形，生成的样条网格 **直接支持 Nanite** 。

### Nanite 曲面细分（Tessellation）— 实验阶段

- 状态：**仍为实验性功能** ，通过 `r.Nanite.Tessellation 1` 开启。
- **核心思路** ：用一个低面数网格 + 一张位移贴图（Displacement Map），替代高面数原始网格。

#### 内存收益分析

| 方案 | 磁盘占用 |
|---|---|
| **高精度原始网格** ：200 万三角面 + Nanite 数据 | 较大 |
| **中精度网格 + 位移贴图** ：5 万三角面 + 1~4 MB 位移纹理 | **显著更小** |

- **权衡** ：光栅化时需要额外计算曲面细分和位移，**有 GPU 开销** 。
- **适用场景** ：当你关心 **磁盘空间/硬盘占用** 时（例如分发包体大小敏感的项目），可以评估是否值得用曲面细分方案替代高精度几何。
- 讲者形容为 **"sometimes food"** ——不是所有情况都该用，需要权衡。

### Nanite 顶点属性保留选项（Preserve Explicit UVs）

#### 问题背景

- Nanite 在简化簇时，默认对顶点属性（包括 UV）进行 **线性插值（Linear Interpolation）** 。
- 这对大多数情况是合理的，但 **会破坏 Vertex Animation Texture（VAT）技术** ——因为 VAT 需要 **精确的 UV 坐标** 来查找纹理中的动画数据。

#### 解决方案

- 5.4 新增了一个 **复选框** ：告诉 Nanite 在合并顶点时 **不插值 UV，而是直接选取一个确定的 UV 值** 。
- **效果** ：现在可以用 Nanite 渲染 **顶点动画纹理驱动的网格** 。

#### 实际应用：Nanite 人群渲染

- 讲者使用 **Twinmotion 资产 + 顶点动画纹理插件** 生成了 Nanite 人群。
- **注意事项** ：
  - 这些网格都会被 **可编程光栅化（Programmable Rasterization）** ，类似树木的处理方式。
  - 需要设置 **WPO 禁用距离（WPO Disable Distance）** 。
  - 角色网格分辨率 **不要太高** （不要用 300 万面的角色），保持合理的当代标准即可。

---

## UE 5.4 免费获得的 Nanite 优化

以下改进 **无需任何手动设置** ，升级到 5.4 即自动生效。

### GPU 驱动材质 — 计算着色器着色（Compute Shader Shading）

- **变化** ：Nanite 的像素着色现在改为在 **Compute Shader** 中执行。
- **解决的问题** ：
  - 之前，场景中被引用但 **实际不可见的材质** 会产生 **空着色桶（Empty Shading Bins）** 。
  - 每个空桶之间的状态切换有一定开销。
- **新方案** ：使用 Compute Shader 后，可以将所有着色桶 **紧凑合并（Compact）** ，只处理 **屏幕上实际可见的像素和材质** 。
- **结果** ：大幅减少渲染开销，且 **完全免费** 。

### 可变速率着色（Variable Rate Shading, VRS）

- Nanite 现在支持 **VRS** ，这是一个显著的性能提升。
- **原理改进** ：
  - 旧方式：为了获取导数（Derivatives），每个像素都需要执行一个完整的 **2×2 Quad** 着色。
  - 新方式：一个 2×2 Quad **真正只着色一次** ，所有像素都被有效利用。

#### ⚠️ 注意：DDX / DDY 的兼容性问题

- 如果材质中使用了 **DDX** 或 **DDY** 节点（显式导数操作），**会破坏 VRS** ，导致该材质无法享受可变速率着色的优化。
- **诊断方法** ：
  ```
  r.Nanite.ShowMeshDrawEvents 1
  ```
  然后使用高级可视化模式：
  ```
  r.Nanite.Visualize Advanced 1
  ```
  - 开启后会多出一个 **No Derivative Ops** 可视化模式：
    - 🔵 **蓝色** ：不使用 DDX/DDY → ✅ 可以享受 VRS
    - 🔴 **红色** ：使用了 DDX/DDY → ❌ 阻止 VRS
  - 据此可以逐一排查红色材质，评估是否真的需要显式导数。

### 像素可编程可视化（Pixel Programmable View Mode）

- 新增的可视化模式，显示所有需要 **可编程光栅化** 的材质：
  - **Masked Materials（遮罩材质）**
  - **Pixel Depth Offset（像素深度偏移）**
  - **Dynamic Displacement（动态位移）**
- 这些材质 **始终需要完整评估** ，是潜在的性能瓶颈。

---

## Nanite 性能调试哲学

### 核心原则：不要过度优化

> **常见错误** ：直觉性地认为"Nanite 有性能问题"然后盲目优化，实际上问题可能根本不在 Nanite。

### Step 1：确认问题是否真的来自 Nanite

- **关键问题** ：
  1. 你的 **Nanite 预算** 是多少毫秒？（在 16ms 帧预算中）
  2. Nanite 当前是否 **超出** 了这个预算？
- 如果没超，就不需要优化 Nanite。

### Step 2：定位瓶颈位置

使用 **GPU Visualizer** （快捷键 `Ctrl + Shift + ,`）：

- 首先查看 **Nanite Vis Buffer** 的整体耗时。
- 开启详细绘制事件：
  ```
  r.Nanite.ShowMeshDrawEvents 1
  ```
- 再次打开 GPU Visualizer，展开 **Nanite Vis Buffer → Draw Geometry Main Pass** ：

| 分类 | 内容 |
|---|---|
| **Hardware Rasterize** | 硬件光栅化 |
| **Software Rasterize** | 软件光栅化 |
| **Fixed Function** | 不透明 + 非变形物体（标准管线） |
| **Programmable Rasterize** | WPO、Masked 等需要可编程处理的材质 |

- 通过对比两者的开销，判断瓶颈在 **固定功能** 还是 **可编程光栅化** 。

### Step 3：深入诊断可编程光栅化

#### 检查 WPO（World Position Offset）

- 使用 **Nanite Visualization → Evaluate WPO** 视图：
  - 显示所有需要可编程光栅化的物体（因为顶点着色器需要 **每像素评估 3 次** ）。
  - 如果画面 **大面积红色** 且可编程光栅化开销高 → WPO 是主要原因。

#### 检查 Masked Materials

- 使用 **Pixel Programmable View Mode** ：
  - 如果像素可编程的区域远多于 WPO 的区域 → **遮罩材质（Masked Materials）** 才是主要瓶颈。
  - 此时优先优化遮罩材质（考虑是否能改为 Opaque、减少遮罩材质数量等）。

### 调试决策树总结

```
Nanite 是否超预算？
├── 否 → 不需要优化 Nanite
└── 是 → 瓶颈在哪？
    ├── Fixed Function 开销高 → 几何量/场景复杂度问题
    └── Programmable Rasterize 开销高
        ├── Evaluate WPO 大面积红色 → WPO 是瓶颈
        └── Pixel Programmable 面积 >> WPO 面积 → Masked 材质是瓶颈
```



# Nanite 固定功能光栅化：Overdraw 诊断与优化

---

## 正确理解 Nanite Overdraw 可视化模式

### 常见误区

- 很多人的第一反应是：打开 **Nanite Visualization → Overdraw** ，看到白色像素就认为"Nanite 有性能问题"。
- **这是错误的使用方式。**

### 正确的使用流程

> **Overdraw 可视化不是用来"发现问题"的，而是用来"定位已知问题的根源"的。**

- 正确流程：
  1. 你通过性能分析工具（Profiler）**已经确认** Nanite 光栅化存在性能瓶颈。
  2. **然后** 打开 Overdraw 可视化，定位具体是 **哪些区域** 造成了过度绘制。
  3. 针对性地优化这些区域。
- **不要** 一看到白色像素就立刻开始优化——这会导致 **过度优化（Over-Optimizing）** 。

---

## Nanite Overdraw 的成因与优化

### 长条三角面 → 大簇 → 无法局部剔除

#### 问题分析（以集装箱为例）

- 集装箱侧面由 **又长又窄的三角面** 组成。
- 这导致 Nanite 生成的 **簇（Cluster）** 覆盖了整个侧面的很大一片区域。
- **Nanite 的一个核心优化是簇级剔除（Cluster Culling）** ——完全不可见的簇可以被跳过，不参与光栅化。
- 但如果簇很大，即使只有 **一小条边缘可见** ，整个簇都必须被光栅化。
- 结果：前方集装箱几乎完全遮挡后方集装箱，但后方的大簇因"部分可见"而 **全部被光栅化** ，产生严重 overdraw。

#### 解决方案：均匀重新网格化（Uniform Remesh）

- 使用 UE5 的 **Geometry Scripting Tools** 对网格进行 **均匀重新网格化** 。
- 效果：
  - 簇变小、均匀分布在网格表面。
  - 被遮挡的簇可以 **更精细地被剔除** 。
  - 即使同一个网格的 **自遮挡（Self-Occlusion）** 也更高效——前面的簇遮挡后面的簇，后面的可以被跳过。

> **核心原则：构建内容时就考虑簇级剔除（Cluster Culling），让三角面分布均匀，簇尺寸合理。**

### 网格互相穿插（Interpenetration）

- 簇的剔除基于 **包围盒（Bounds）** 。
- 如果大量静态网格 **紧密堆叠、互相穿插** ，包围盒重叠严重，簇 **无法被有效剔除** 。
- 结果：overdraw 更加严重。

> **预防措施：搭建场景时避免大量静态网格紧密堆叠、互相穿插。**

### 表面装饰物（Greeble）的特殊情况

- 常见需求：在大型表面（如科幻飞船）上 **散布大量小装饰物（Greeble）** 。
- 直觉上会觉得这会造成大量 overdraw，但 **实际情况往往还好** ：
  - 装饰物位于一个 **大的平面表面** 上。
  - 这个大平面会 **遮挡其下方的一切** 。
  - 因此不会形成大量 overdraw 堆叠。
- **例外情况** ：当摄像机处于 **接近平行的掠射角（Glancing Angle）** 时，可能出现热点（Hot Spots），但这些热点是局部且有限的。

---

## Nanite Base Pass 性能瓶颈诊断

### 什么是 Nanite Base Pass？

- 这是 Nanite **将材质绘制到所有已光栅化像素上** 的阶段。
- 在考虑 **可变速率着色（Variable Rate Shading）** 和 **计算着色（Compute Shading）** 之前，诊断思路相对直接。

### 如果 Base Pass 超预算，只有两个可能原因

| 原因 | 诊断方式 | 说明 |
|---|---|---|
| **着色 Bin 数量过多（Shading Bins）** | 使用 `nanite stats` 命令查看 | 着色 Bin 类似于传统的 **Draw Call** 概念 |
| **材质本身太贵（Expensive Materials）** | 分析单个材质的指令数和复杂度 | 材质的着色成本过高 |

### 使用 `nanite stats` 诊断 Shading Bins

- 开启命令后，可以查看：
  - **Total Shading Bins** ：总着色 Bin 数量
  - **Empty Shading Bins** ：空的着色 Bin 数量
  - **有效 Bin 数 = Total - Empty** ：相当于 Nanite 实际执行的"绘制调用"数量
- 如果有效 Bin 数达到 **数千级别** ，说明场景中的 **材质种类/变体过多** ，需要合并或简化。

### 材质性能问题

- 如果 Shading Bin 数量合理，但 Base Pass 仍然超预算 → **材质指令太复杂** 。
- 此时需要进入 **材质性能优化** 阶段（后续内容）。

---

## 总结：Nanite 性能优化的思维层次

```
Nanite 性能问题排查顺序：
│
├─ 1. 可编程光栅化（Pixel/Vertex Programmable）
│     → 检查 WPO、Masked 材质等
│
├─ 2. 固定功能光栅化（Fixed Function）
│     ├─ Overdraw 问题
│     │   ├─ 三角面分布是否均匀？（避免长条三角面）
│     │   ├─ 网格是否互相穿插？
│     │   └─ 使用 Overdraw 可视化定位热点
│     │
│     └─ Base Pass 问题
│         ├─ Shading Bins 数量是否过多？
│         └─ 材质本身是否过于昂贵？
│
└─ 3. 材质性能优化（接下来的内容）
```



# Lumen：性能预算、反射优化与调试方法

---

## Lumen 核心概念快速回顾

- Lumen 是 UE5 的 **高性能实时光线追踪全局光照与反射系统** 。
- 关键区别：Lumen 追踪的是 **每像素的光线（Pixels per Ray）** ，而非传统光追的"每光线的像素（Rays per Pixel）"，因此更高效。
- Lumen 由 **多个子系统/Pass** 组成：**Lumen Scene、Lighting、Diffuse Indirect、AO、Reflections、Lights** 等。

---

## Lumen 性能预算

### 预算参考值

| 目标帧率 | Lumen 预算 |
|---|---|
| **60 FPS** | 约 **4 毫秒** |
| **30 FPS** | 约 **8 毫秒** |

### "预算"的真正含义

- **不是** 说 Lumen 的某个 Pass 应该耗时 4ms 或 8ms。
- **真正含义** ：当你通过以下命令 **完全关闭 Lumen** 时：
  - `r.DynamicGlobalIlluminationMethod 0`
  - `r.ReflectionMethod 0`
- 你应该观察到整帧时间 **快了约 4ms 或 8ms** 。
- 这就是 Lumen 整体（包含所有子系统）的开销总和。

### 异步执行的复杂性

- 在 **主机平台（Console）** 上，Lumen 是 **异步运行** 的，因此很难精确拆分每个子系统的开销，上述预算是一个 **整体衡量指标** 。

---

## Lumen 性能优化手段

### 减少 Lumen Scene 中的内容

- 将不需要参与光照追踪的物体设置为：
  - **Visible in Ray Tracing → False**
  - **Affect Dynamic Indirect Lighting → False**
- 减少 Lumen Scene 需要维护和追踪的几何体数量。

### 反射优化（Reflections）— 重点内容

#### 核心控制台变量

| 变量 | 作用 |
|---|---|
| `r.Lumen.Reflections.MaxRoughnessToTrace` | 控制 **粗糙度低于多少** 的表面才追踪专用反射光线 |
| `r.Lumen.Reflections.MaxRoughnessToTraceForFoliage` | **单独控制植被/次表面着色模型** 的反射追踪粗糙度阈值 |

#### UE 5.4 新增：Performance Overview 视图模式

- 新增了一个 **性能总览视图（Performance Overview Mode）** ，可以可视化 **哪些像素正在追踪专用反射光线** 。
- 颜色编码：
  - **绿色** ：使用 **次表面/双面植被着色模型（Subsurface / Two-Sided Foliage Shading Model）** 的物体。
  - 其他颜色：普通材质的反射追踪区域。

#### 实际调试案例

1. **问题发现** ：在 Performance Overview 中看到 **所有树木** 都在追踪专用反射光线。
2. **原因分析** ：天气系统的 Shader 让树叶变成 **低粗糙度（因为下过雨，表面湿润）** 。
3. **判断** ：树叶的反射中不会看到任何有意义的内容，这些反射光线是 **浪费** 。
4. **解决** ：`r.Lumen.Reflections.MaxRoughnessToTraceForFoliage 0` → 树木不再追踪反射光线。
5. **进一步优化** ：降低 `r.Lumen.Reflections.MaxRoughnessToTrace`（例如设为 0.2）：
   - **水坑（Puddles）** 面积可能略微缩小（边缘高粗糙度区域不再追踪）。
   - 可以在 **材质中手动 Clamp 粗糙度** ，使水坑保持较大面积但粗糙度过渡更锐利。
   - **建筑侧面** 等高粗糙度表面不再浪费 GPU 追踪无意义的反射。

---

## Lumen 问题调试方法论

### 调试的核心思路：二分法（Binary Search）

> **先确定问题属于哪个子系统，再逐层深入。**

### 第一步：确认是否是 Lumen 的问题

- 关闭 Lumen 全局光照：`r.DynamicGlobalIlluminationMethod 0`
- 关闭 Lumen 反射：`r.ReflectionMethod 0`
- 如果问题消失 → **确认是 Lumen 引起的** 。

### 第二步：区分 Screen Traces vs. World Traces

Lumen 有两种光线追踪/信息采集方式：

| 追踪方式 | 数据来源 | 说明 |
|---|---|---|
| **Screen Traces（屏幕追踪）** | 从屏幕上已有的像素值中采样 | 类似屏幕空间光线步进 |
| **World Traces（世界追踪）** | 从 **Lumen Scene** 的数据结构中采样 | 使用 Surface Cache 等离屏数据 |

#### 调试流程

1. **关闭 Screen Traces** （通过 Show → Lumen → 取消 Screen Traces）：
   - 如果问题 **消失** → 问题出在 **Screen Traces** 。
   - 接下来排查 `r.Lumen.ScreenProbeGather` 等相关控制台变量（数量众多，需逐一排查）。

2. **重新打开 Screen Traces** ，转而排查 **World Traces / Lumen Scene** ：
   - 使用 **Lumen Scene 视图模式** 查看场景数据。
   - 如果发现某些区域 **过于黑暗** （应该有亮度但没有），说明 Lumen Scene 数据有问题。

### 第三步：使用 Surface Cache 视图模式诊断

Surface Cache 视图中的颜色编码：

| 颜色 | 含义 |
|---|---|
| **黄色** | Lumen 判定 **不需要关心这个区域** ，已从 Lumen Scene 中排除 |
| **紫色** | 该区域 **被绘制进了 Lumen Scene** ，但 **像素未被正确渲染** |

#### 紫色区域的常见原因

- **Surface Cards 设置不正确** ：Lumen 用 Surface Cards 从 6 个方向捕获网格表面信息，如果 Cards 配置不当，某些角度的信息缺失。
- **网格过于复杂、多变（Multi-variant and Complex）** ：Lumen 无法有效地将这些像素写入 Surface Cache。
- **实际表现** ：例如高架走道（Catwalk）的侧面在 Lumen Scene 中显示不正确，导致该区域的全局光照计算出错，产生闪烁或黑斑。

---

## 关键要点总结

1. **Lumen 性能预算** 是一个整体概念——关闭 Lumen 后整帧应快 4~8ms。
2. **反射优化** 是最直接的性能调优手段——通过 `MaxRoughnessToTrace` 系列变量减少不必要的反射光线追踪。
3. **5.4 的 Performance Overview 视图** 是诊断反射开销的利器。
4. **调试 Lumen 问题的核心方法** ：先确认是 Lumen 的问题 → 区分 Screen Traces 还是 World Traces → 用 Surface Cache 视图定位具体原因。
5. Epic 提供了一份 **Lumen Performance Guide**（在讲座末尾链接中），包含比本讲座更详细的优化指南。



# Virtual Shadow Maps：缓存机制、5.4 改进与性能调试

---

## Virtual Shadow Maps 核心原理回顾

### 基本概念

- 传统阴影：每帧写出一组 **Shadow Depth Cascades** ，开销固定且昂贵。
- **Virtual Shadow Maps（VSM）** ：将阴影贴图 **虚拟化** ，划分为 **页（Pages）** ——类似虚拟纹理的 **Tile** 。
- 核心优势：
  - **缓存（Cache）** 未发生变化的阴影页。
  - **只更新** 实际需要更新的部分，大幅减少每帧阴影渲染开销。

---

## UE 5.4 VSM 缓存机制改进

### 静态 vs 动态缓存的智能切换

#### 之前的问题

- VSM 默认将物体分为两类：
  - **静态物体** ：不使阴影缓存页失效 → 绘入 **静态缓存页（Static Pages）** 。
  - **动态物体** ：会使缓存页失效 → 绘入 **动态缓存页（Dynamic Pages）** 。
- **问题** ：一旦某个物体 **曾经** 使缓存页失效（例如靠近一棵有 WPO 动画的树），该物体就会被 **永久标记为动态** 。
- 即使你走远后，树的 WPO 已被禁用、不再使缓存失效，它仍然被当作动态物体处理——**浪费性能** 。

#### 的解决方案

- 新增控制台变量：

```
r.Shadow.Virtual.Cache.StaticSeparate.FrameStaticThreshold
```

- 含义：物体在 **连续多少帧不使缓存失效** 后，将其 **重新切换回静态** 。
- 类似 `r.VT.PageThreshold` 的设计思路。
- **权衡** ：从动态切换到静态、再切换回动态都有 **少量开销** ，因此阈值不宜设得太低。

### WPO Disable Distance 对阴影失效范围的改进

#### 之前的问题

- 场景示例：一个用 WPO 驱动动画的摩天轮，在 **黎明/黄昏** 投射出 **很长的阴影** 。
- 当玩家靠近摩天轮时，WPO 动画激活，会使缓存页失效。
- **问题** ：失效范围会沿着阴影方向 **一路延伸到阴影末端** ，即使阴影远处的部分根本看不出动画差异。
- 这是 **反直觉** 的行为——WPO Disable Distance 应该限制失效范围。

#### 的解决方案

- 新机制：将 **WPO Disable Distance** 向上取整到最近的 **Clip Map Level** 。
- 工作原理：
  1. 假设 WPO Disable Distance 对应到 Clip Map 的绿色层级。
  2. 绿色层级之外是红色层级。
  3. 如果阴影投射到红色层级区域 → **不使那些红色区域的缓存页失效** 。
- 还有一个 **LOD Bias** 参数，使失效范围略微向外扩展，防止视觉瑕疵：

```
r.Shadow.Virtual.ClipMap.WPODisableDistance.LODBias
```

- **默认值为 3** ，即在 WPO Disable Distance 基础上再向外扩展 3 个 Clip Map 层级。

#### 可能出现的视觉瑕疵

- 如果将 LOD Bias 设为 **0** ，可能看到 **阴影一半在动、一半静止** 的现象。
- 如果在项目中遇到此现象，就是 **WPO Disable Distance + LOD Bias 配置不当** 造成的。
- 解决方法：适当增大 LOD Bias 或调整 WPO Disable Distance。

---

## Virtual Shadow Maps 性能调试

### 首先优化 Nanite Visibility Buffer

> **在开始优化 VSM 缓存失效之前，先优化 Nanite Visibility Buffer。**

- 原因：在 GPU Visualizer 中查看 `Shadow Depths → Render Virtual Shadow Maps → Nanite Draw Geometry`，可以看到 **VSM 的阴影渲染本质上也是一个 Nanite Visibility Buffer Pass** 。
- 因此，**优化 Nanite Viz Buffer 的所有手段**（均匀网格化、减少 overdraw 等）**同样会改善 VSM 性能** 。

### VSM 专用 Overdraw 可视化

- 存在一个 **Virtual Shadow Map Nanite Overdraw** 视图模式。
- 特点：从 **方向光的视角** 显示 overdraw。
- 注意：并非所有物体都会在此视图中渲染——**只有正在被失效的缓存页** 才会被显示。

### 统计数据工具

- 开启方式：

```
r.ShaderPrint 1
r.Shadow.Virtual.ShowStats 1
```

- 显示的关键数据：

| 统计项 | 含义 |
|---|---|
| **Physical Pages** | 物理页总数 |
| **Non-Nanite Geometry** | 正在绘制的 **非 Nanite 几何体** 数量（在 VSM 中 **特别昂贵** ） |
| **Static Pages Invalidated** | 静态页失效数量 |
| **Dynamic Pages Cached** | 动态页缓存数量 |
| **Dynamic Pages Invalidated** | 动态页失效数量 |

- 这些数据帮助你判断 **应该优先关注动态失效还是静态失效** 。

---

## 全讲座知识点总结

### 项目设置

- 空启动关卡、关闭 Static Lighting、关闭 Reverse Index Buffer 和 Depth Only Buffer。
- 启用 Virtual Textures。

### 虚拟纹理

- 理解虚拟化的核心理念（稀疏加载）。
- 关注 **Virtual Texture Stacks** 数量、CPU/GPU 开销权衡。
- 从项目初期规划，设置好默认虚拟纹理。

### Nanite

- 均匀三角面分布 → 更好的 **簇级剔除（Cluster Culling）** 。
- 新特性：**Spline Meshes（生产就绪）** 、 **Tessellation（实验性）** 、 **UV 属性保留** 。
- Overdraw 可视化是 **诊断工具** ，不是"问题发现工具"。

### Lumen

- 预算：60 FPS → 4ms，30 FPS → 8ms（关闭 Lumen 后的帧时间差）。
- 利用 **Screen Traces / World Traces** 控制台变量进行调试。
- 利用 **Performance Overview** 视图和 `MaxRoughnessToTrace` 优化反射开销。

### Virtual Shadow Maps

- 优先优化 Nanite Viz Buffer（共享 Pass）。
- 利用 **ShowStats** 判断失效类型。
- 善用 5.4 的 **静态/动态自动切换** 和 **WPO Disable Distance 限制失效范围** 两大改进。

---

## 推荐的关联讲座

| 讲座 | 主题 |
|---|---|
| **Adding a Rendering Fast Path Without Breaking Unreal Engine** | 自定义渲染路径 |
| **Optimizing Survival Games for Mobile** | 移动端优化 |
| **Artist's Guide to Using Nanite Tessellation** | Nanite 曲面细分的美术实践 |
| **First Steps to Advanced PCG Development** | PCG 程序化内容生成 |
| **Optimizing the Game Thread** | 游戏线程优化（来自 Tanglewood Games） |
| **Performance Budgeting in a Post Poly Count World** | 后多边形时代的性能预算（"Nanite 能用多少三角面"是 **错误的问题** ） |