---
date: 2025-11-28 14:48:00
title: 'TSR, Nanite, Lumen, VSM: UE5 Graphics Features Insights from Japan'
---

# TSR, Nanite, Lumen, VSM: UE5 Graphics Features Insights from Japan

[TSR, Nanite, Lumen, VSM: UE5 Graphics Features Insights from Japan | Unreal Fest Gold Coast 2024](https://www.youtube.com/watch?v=szgnZx2b0Zg)

## 演讲背景与日本 Unreal Engine 生态

### 演讲者简介

- **Niama** ，Epic Games Japan **开发者关系负责人** （Developer Relations Lead）
- 在 Epic Games Japan 工作超过 **8 年**
- 此前在 **Sony PlayStation 团队** 担任 **图形研究员（Graphics Researcher）**
- 本次演讲的核心主题：分享日本团队在支持大量开发者使用 UE5 过程中积累的 **图形技术知识与经验**

### UE 在日本的广泛应用

- **写实风格游戏** ：Square Enix 的 Final Fantasy、Kingdom Hearts
- **风格化渲染游戏** ：Persona 3、Hi-Fi Rush
- **2D 动画领域** ：日本热门动画（如「ぼっち・ざ・ろっく！」）的片尾动画使用 UE 制作，包括角色动画
- **漫画 / Comics 领域** ：使用 UE 进行 **布局决定（Layout）** 和 **背景渲染（Background Rendering）** ，之后再进行人工修饰

### 日本市场的特殊性

- 日本游戏市场 **以主机（Console）为主** ，而非 PC 或移动端
- 这意味着需要 **极其严格的性能优化** ，确保游戏在 PS5、Xbox、Nintendo Switch 上流畅运行
- Epic Games Japan 有 **5 名开发者关系工程师** 专职提供 UE 引擎技术支持，拥有大量 **付费支持客户（Custom Licensees）**

---

## UE5 的高期望与现实边界

### Epic 官方 Demo 带来的高期望

演讲者回顾了 Epic 发布的三个标志性 Demo，它们极大地激发了开发者的期望：

| Demo | 核心展示内容 |
|------|-------------|
| **Lumen in the Land of Nanite**（首个 UE5 Demo） | **Nanite** （实时渲染"无限"多边形）+ **Lumen** （实时高质量全局光照，只需放置方向光和天空光即可获得高质量光照，无需烘焙光照贴图） |
| **City Sample**（次年发布） | **World Partition** 系统，可在大型城市中实时漫游 |
| **Electric Dreams**（再后一年） | **程序化生成（Procedural Generation / PCG）** 大型森林场景 |

### 开发者的过度期望

许多开发者看到 Demo 后产生了 **过于乐观的预期** ：

- "不再需要关心 **多边形数量** 了！"
- "不再需要 **烘焙光照贴图（Bake Light Maps）** 了！"
- "可以免费使用大量 **超高质量资产（Mega Scans）** ！"
- "可以用 PCG 和 World Partition **自动放置资产** ！"

### 细心的开发者注意到的"隐藏限制"

演讲者指出，细心的开发者在观察 Demo 时发现了一些 **刻意规避的场景** ，这些暗示了 UE5 当前的技术边界：

1. **首个 Demo（Nanite 展示）** ：
   - **没有草（No Grass）**
   - 只有 **无机材质** ——岩石、金属等（暗示 Nanite 对植被等复杂几何体的支持有限）

2. **City Sample Demo** ：
   - 所有树木 **没有树叶** ——场景季节被设定为 **秋天** ，巧妙地回避了叶片渲染问题
   - 角色的 **反射完全是黑色的** （暗示屏幕空间反射 / Lumen 反射在某些条件下的局限性）
   - **无法进入任何建筑物内部** （暗示室内外场景切换的复杂性与性能挑战）

3. **Electric Dreams Demo** ：
   - 虽然有了草和树叶，但 **所需的 PC 硬件规格极高**

---

## 本次演讲的核心定位

### 演讲目标

> **澄清开发者对 UE5 模糊期望的边界** ——分享从日本大量开发者支持工作中学到的 **当前技术边界（Current Technical Boundaries）**

### 聚焦方向

- 重点关注 **实时渲染（Realtime Rendering）**
- 尤其针对 **受限硬件（如主机平台）** 的场景
- 对 VFX 和虚拟制片（Virtual Production）用户也有参考价值

### 重要声明

- 演讲中会大量提及 **"UE5 当前不支持 XX"** 的内容
- **绝非暗示 UE5 无用** ，而是帮助开发者 **理解限制，扬长避短**
- UE5 正在以 **极快的速度进化** ，大部分当前限制 **可能在不久的将来被消除**

### 三大技术主题（议程预告）

演讲将围绕日本开发者在使用 UE5 时面临的 **三大技术类别** 展开深入讨论（具体内容将在后续部分展开）。



# 多帧处理（Multi Frame Processing）

UE5 中有多种图形技术依赖于 **跨多帧引用** 或 **将计算分摊到多帧** 来维持实时性能。这一设计非常强大，但也带来了 **鬼影（Ghosting）** 和 **延迟（Delay）** 等副作用，理解其原理和边界至关重要。

---

## TSR（Temporal Super Resolution）——时间超分辨率

### 为什么需要 TSR

- GPU 性能虽然在不断提升，但 **目标分辨率也在同步增长** ，因此高分辨率输出始终是性能瓶颈
- 演讲者展示了一个 City Sample 在某 GPU 上以 **4K 原生分辨率（Native 4K）** 渲染的案例：耗时 **57 毫秒** ，帧率 **低于 20 FPS**
- 随着场景物体数量增多、渲染技术（如 **Nanite** ）日益复杂，4K 全分辨率渲染依旧 **非常昂贵**

### TSR 的基本原理

- TSR 是 UE5 内置的 **时间性上采样（Temporal Upscaling）** 方案
- 在渲染管线中的位置：在 **景深（Depth of Field）** 处理之后、内部缓冲被 **上采样到目标分辨率** 之前
- 工作方式：以 **较低的内部分辨率（Internal Resolution）** 渲染，然后通过 **引用多个历史帧** 收集足够的采样点，重建出高分辨率画面

### TSR 的效果与性能收益

| 配置 | 耗时 |
|------|------|
| **4K 原生渲染** | 57 ms |
| **1080p 内部分辨率 + TSR 上采样至 4K** | 26 ms |

- 视觉差异 **肉眼几乎不可察觉** ，但性能提升 **超过 2 倍**
- 由于 **Nanite** 和 **Lumen** 的计算量都与 **内部分辨率** 相关，TSR 同时 **大幅降低了 Nanite 和 Lumen 的 GPU 负载**

### TSR 的收敛机制与副作用

#### 核心概念：采样收敛（Sample Convergence）

TSR 需要从多个历史帧中 **收集足够数量的采样** 才能重建出目标分辨率的画面：

- **内部分辨率 = 目标分辨率** ：无需历史帧，直接输出即可
- **内部分辨率降低** ：需要引用 **更多的过去帧** 来凑齐采样
- **内部分辨率进一步降低** ：需要引用 **更久远的历史帧**

#### 帧率对 TSR 的影响

- 达到相同分辨率所需的 **帧数（采样数）是固定的**
- 如果帧率从 **60 FPS 降到 30 FPS** ，TSR 需要引用的帧在 **时间上相隔两倍**
- 这意味着引用的是 **更旧的画面数据** ，导致 **鬼影（Ghosting）** 风险增大

#### 鬼影问题的表现

- **极端案例** ：以 25% 内部分辨率渲染时，摄像机移动期间 **整个画面严重模糊/鬼影**
- **静止摄像机时** ：TSR 能很好地逐步收敛到高分辨率画面——这是 TSR 的 **强项**
- **关键认知** ：鬼影不仅发生在 GPU 负载过高时，**任何原因导致的帧率下降（包括 CPU 端的动画加载、游戏逻辑等）都会引发 TSR 鬼影**

#### CPU 性能也至关重要

- **动态分辨率（Dynamic Resolution）** 只能缓解 GPU 端的压力
- **CPU 导致的帧率下降无法通过动态分辨率解决**
- 因此，要维持 TSR 的画质， **CPU 和 GPU 的性能都必须保持稳定**

### Velocity（速度缓冲）对 TSR 的关键作用

#### 原理

- TSR 通过 **速度向量（Velocity Vector / Motion Vector）** 来估算帧与帧之间像素的移动
- 如果速度向量 **写入不正确** ，TSR 将无法正确对齐历史帧，导致 **严重的鬼影**

#### 示例

- **错误的 Velocity** ：旋转物体上出现 **强烈鬼影** ——物体在旋转但速度向量没有正确反映旋转运动
- **正确的 Velocity** ：鬼影 **完全消失**
- 可以通过 **调试视图（Debug View）** 可视化速度向量来排查问题

#### 如何正确生成 Velocity Vector

- 不同场景情况下的正确做法各不相同
- 演讲者已在 **Epic Developer Community（EDC）** 发布了多篇相关文章（目前仅日文版，英文版计划中）
- Epic 官方文档页面有关于 **TSR 收敛行为的详细说明** ，包括调试方法和需要引用多少帧——**强烈推荐所有使用 TSR 的开发者阅读**

---

## Lumen 的多帧分布计算

### Lumen 的运行时计算量

- Lumen 是 UE5 的 **实时全局光照（Real-time GI）** 系统
- 其运行时需要计算 **大量内容** （光线追踪、辐照度场更新、屏幕探针等）
- 如果把所有计算都放在 **单帧内完成** ，性能开销仍然过大

### 多帧分摊策略

- Lumen 的核心设计：将算法的 **部分计算分摊（Distribute）到多个帧** 中执行
- 这使得 GI 可以实时计算，但代价是 **光照需要逐步收敛（Incrementally Converge）** 到正确结果

### GI 延迟（GI Delay）的表现

#### 基本延迟

- **示例** ：天花板瞬间关闭以完全遮蔽天光 → 画面理应立即变黑，但实际上 **GI 是逐渐消失的** ，有明显的延迟过渡
- 日本客户经常询问"如何减少 GI 延迟"，但 **目前在实时条件下没有办法完全消除**

#### Emissive Lighting（自发光照明）的延迟尤其严重

- 在使用 **自发光材质（Emissive Materials）** 作为光源的场景中，如果 **切换摄像机** ，Lumen 需要 **从头计算该视角的光照**
- 这会导致 **非常明显的光照延迟** ——切换瞬间画面光照严重不正确，然后逐步收敛
- 这也是 **基于自发光的照明（Emissive-based Lighting）目前仍被标记为实验性功能（Experimental Feature）** 的重要原因之一

> ⚠️ City Sample 中的"Nitro"霓虹灯效果只是一个 **演示样例** ，不代表该技术已经可以在生产中随意使用。

### 实时过场动画的改进

- Epic 已经针对 **实时过场动画（Realtime Cutscenes）** 场景实现了解决方案
- 具体地说，是 **过场动画（Sequencer/Cine Camera）的预热功能（Pre-roll Functions）** 终于支持了 **Lumen 和 Lumen Scene 的计算**
- 已合入 **UE5 主线版本（Mainstream）**
- **限制** ：
  - 需要 **额外的 GPU 开销**
  - **不支持** 像演示中那样的 **随机摄像机切换** 场景

---

## 本节核心总结

| 要点 | 说明 |
|------|------|
| **多帧引用/分摊是 UE5 维持实时性能的核心策略** | TSR 引用历史帧重建高分辨率；Lumen 将 GI 计算分摊到多帧 |
| **TSR 的鬼影** | 内部分辨率越低、帧率越低 → 需要引用越旧的帧 → 鬼影越严重 |
| **帧率稳定性是全局要求** | CPU 导致的帧率下降同样会影响 TSR 质量，动态分辨率无法解决 CPU 瓶颈 |
| **Velocity Buffer 必须正确** | TSR 依赖速度向量对齐历史帧，错误的 Velocity 会导致严重鬼影 |
| **Lumen GI 存在固有延迟** | 光照变化需要多帧收敛，无法瞬间完成 |
| **Emissive Lighting 仍为实验性功能** | 摄像机切换时延迟极其明显，生产使用需谨慎 |
| **必须在理解副作用的前提下使用这些技术** | 鬼影和延迟是 **设计上的权衡（Design Trade-off）** ，不是 Bug |



# 虚拟化与流式加载（Virtualization & Streaming）

## Nanite 的核心概念——虚拟化几何体（Virtualized Geometry）

### Nanite 的能力

- Nanite 能够 **实时渲染极高密度多边形物体** ，即使场景中存在大量此类物体也可以处理
- 渲染精度可以达到 **三角形尺寸 ≈ 像素尺寸（Pixel-sized Triangles）** ，即细节精细到像素级别
- 在高密度场景中，大量三角形小到看起来像噪点——这正是 Nanite 的正常工作状态

### 什么是"虚拟化"

- Nanite 所采用的技术泛称为 **虚拟化几何体（Virtualized Geometry）**
- 通过对几何数据进行虚拟化并按需流式加载，可以 **大幅降低显存占用和 GPU 渲染开销**
- 同样的虚拟化思想也应用于纹理领域，即 **虚拟纹理（Virtual Texture）**

---

## 通过虚拟纹理理解虚拟化原理

演讲者建议先理解 **Virtual Texture** ，因为它比 Nanite 的虚拟化几何体更容易理解。

### 传统纹理 vs 虚拟纹理

| 特性 | 传统纹理 | 虚拟纹理（Virtual Texture） |
|------|---------|--------------------------|
| 内存加载方式 | 必须将 **整张纹理完整读入内存** | 只加载 **当前可见部分** 的纹理数据 |
| 不可见区域 | 仍然占用内存 | 可以 **流式卸载（Stream Out）** ，释放内存 |
| Mip Map 处理 | 全部 Mip 层级加载 | **按距离部分加载** ：近处加载高分辨率 Mip，远处加载低分辨率 Mip |

### 虚拟纹理的核心优势

- **大幅减少纹理内存消耗** ——仅加载实际可见的部分
- 对于 **大型地形（Landscape）** 尤其有效：近处高精度、远处低精度，自动按需调度

---

## Nanite = 多边形版的虚拟纹理

### Nanite 的数据结构

- Nanite **不使用传统的 LOD 切换方式**
- 而是将多边形物体 **预先分簇（Pre-clustered）** ，构建 **层次化数据结构（Hierarchical Data Structure）**
- 演讲者通过故意添加偏移（Offset）展示了 Nanite 的粗糙模型——可以看到：
  - 低精度的 **簇（Clusters）** 只在 **距离摄像机很远时** 才会被加载渲染
  - 正常情况下肉眼 **完全不可察觉**
- **关键观察** ：整栋建筑的形状不会改变，但 **物体表面的簇会随距离动态切换** ——这就是 Nanite 的 LOD 机制本质

### Nanite 与虚拟纹理共有的流式加载限制

Nanite 和 Virtual Texture 都面临同一个根本问题：

> **在开始流式加载之前，必须先判断：**
> 1. **哪些物体** 是需要的？
> 2. 这些物体的 **哪些部分** 是需要的？
> 3. 需要 **多高精度** 的数据？

#### 瞬移/快速切换摄像机的问题

- 如果摄像机发生 **瞬间切换（Teleport / Camera Cut）** ，Nanite 和 Virtual Texture **在切换之后才开始流式加载**
- 结果：部分物体的多边形或纹理 Mip 会 **暂时以低分辨率显示** ，造成明显的 **画质跳变**

### 针对过场动画的解决方案：Cinematic Pre-Streaming

- 对于 **过场动画（Cut Scene）** ，摄像机路径和可见物体是 **预先确定的**
- UE5 提供了 **Cinematic Pre-Streaming** 功能：
  - 使用 **Movie Render Queue Pre-Streaming Recorder** 预录制过场中需要加载的资源信息
  - 在播放过场时， **提前加载** 这些数据，消除流式加载的延迟

#### 游戏运行时的限制

- 该方案 **仅适用于过场动画** ——因为摄像机路径是已知的
- **游戏中随机传送或瞬间切换摄像机** 时，引擎 **无法预知要加载什么资源**
- 此时可能出现 **可感知的流式加载延迟**
- **建议的规避手段** ：在传送/切换时加入 **淡入淡出（Fade In/Out）** 或 **视觉特效遮挡** 来掩盖加载过程

### 虚拟化与流式加载小结

| 要点 | 说明 |
|------|------|
| **核心技术** | Virtual Texture 和 Nanite 都使用 **数据虚拟化** 技术，将海量数据控制在恒定显存内 |
| **加载方式** | 通过 **流式加载（Streaming）** 按需加载 |
| **快速移动时的问题** | 摄像机移动过快时，流式加载可能 **来不及完成** ，导致低分辨率物体短暂可见 |
| **过场动画解决方案** | **Cinematic Pre-Streaming** 可预加载资源 |
| **游戏内瞬移** | **尚未有自动化解决方案** ，需要开发者自行实现遮挡/过渡效果 |

---

# 现有资产的使用问题（Utilization of Existing Assets）

## Quixel Mega Scans 与 Marketplace 资产

### Mega Scans 概述

- **Mega Scans** 是 Epic 提供的 **基于真实物体扫描的 3D 资产库**
- 使用 Unreal Engine 时 **完全免费**
- UE5 内置 **Bridge** 功能，可以 **拖拽式** 将 Mega Scans 资产直接放入场景
- 配合 UE5 的 Nanite 和 Lumen，开发者可以 **实时预览最终效果** ，无需等待离线渲染

### 日本开发者遇到的实际问题

许多日本客户兴奋地使用 Mega Scans 和 Marketplace 资产搭建场景，但很快遇到问题：
- **渲染结果异常**
- **GPU 开销极高**

核心问题可以归结为 **"模块化资产（Modular Assets）与 Lumen Card 的矛盾"** 。

---

## 模块化资产 vs Lumen Card 问题

### 什么是模块化资产（Modular Assets）

- 不是将整栋房子做成一个大 Mesh，而是拆分成 **窗户、墙壁、柱子** 等独立部件
- 通过 **组合这些模块** 来搭建完整建筑
- 这是标准的游戏资产制作流程

### 什么是 Lumen Card

- Lumen 为了 **快速计算全局光照（GI）** ，会用 **简单的平面（Cards）** 包裹每个物体
- 这些 Lumen Card 是 **为每个 Static Mesh 预计算的**
- City Sample 中可以看到：从树木到汽车，各种物体都有对应的 Lumen Card
- 即使是复杂形状（如树木），Lumen Card 也是 **非常简化的包围形状**

### 矛盾的根源

#### 问题一：复杂 Mesh → Lumen Card 无法拟合

- Lumen Card 只能是 **非常简单的形状**
- 如果将 **复杂形状（如房屋内部）做成单个 Mesh** ，Lumen Card **无法正确拟合其形状**
- 结果：Lumen GI 计算出错，出现 **粉红色区域（Pink Areas）** ——表示 Lumen 无法正确计算着色

> **基本规则：使用 Lumen 时，应该用简单的模块化资产来构建复杂形状**

#### 问题二：模块化资产 → Lumen Card 数量爆炸

- 如果一栋建筑由大量模块化资产组成，每个模块都有自己的 Lumen Card
- 结果：**单栋建筑就会产生大量 Lumen Card** ，处理负载和内存消耗 **急剧上升**
- 在实时渲染中 **无法承受**

### UE5 的解决方案：Ray Tracing Group ID 合并

- UE5 提供了 **合并 Lumen Card 的机制** ：拥有 **相同 Ray Tracing Group ID** 的物体，其 Lumen Card 会被 **合并（Merge）**
- 该 ID 位于 **Static Mesh Component** 的设置中
- **City Sample 的做法** ：将 **同一栋建筑的所有模块** 设置为 **相同的 Ray Tracing Group ID** → 整栋建筑只有一组 Lumen Card
- 此机制 **不区分** Lumen 使用的是 **软件光追（Software Ray Tracing）** 还是 **硬件光追（Hardware Ray Tracing）**

### 合并方案的代价

合并后的问题 **又回到了问题一** ：

- 合并后的 Lumen Card 覆盖整栋建筑 → 对于有复杂内部结构的建筑，**Lumen Card 无法正确拟合内部形状**
- **这就是为什么 City Sample 中所有建筑都无法进入内部** ——整栋建筑的 Lumen Card 被合并为简单外壳形状

### 室内外同时存在的困境

> **目前没有已知的算法或机制能让 Lumen Card 同时正确处理建筑的外部和内部**

#### 建议的解决方案

- 将建筑的 **外部和内部分别制作** 为独立的资产集
- 在游戏逻辑中根据玩家位置 **切换可见性（Visibility On/Off）**
- 当玩家在室外时关闭内部渲染，减少 **不必要的 Lumen Card 计算**

---

## 树叶与草地的性能困境

### Nanite Masked Material 的现状

- **UE 5.3 起 Nanite 支持了 Masked 材质** ——这是重大进步
- 但 **Nanite Masked 材质的 GPU 开销极高**
- 在主机平台上，**使用 Masked 的树叶和草地难以达到 60 FPS**

### "混合方案"的陷阱

自然的想法：

> "岩石和树干用 Nanite 渲染，树叶用 Non-Nanite 渲染"

但这样做 **效果并不好** ，原因如下：

#### Lumen 和 VSM 对 Nanite 有专门优化

- **非 Nanite 物体的 Lumen Card 渲染方式** ：
  - 每个 Lumen Card 需要 **单独一次 Draw Call** ，在 GPU 硬件光栅化器上逐个绘制
  - 6 个 Card = 6 次 Draw Call

- **Nanite 物体的 Lumen Card 渲染方式** ：
  - 使用 **Nanite 的软件光栅化器（Software Rasterizer）** ，可以 **一次性渲染所有 Lumen Card**
  - 6 个 Card = 1 次处理

- **VSM（Virtual Shadow Map）也有类似优化** ——Nanite 物体的阴影计算同样更高效

> **核心结论** ：如果项目使用 Lumen + VSM，应尽可能 **将物体设为 Nanite 对象** ，即使是低多边形模型也是如此

### 大量 Masked 非 Nanite 物体的代价

- 如果项目使用 Lumen + VSM，且需要放置 **大量 Masked 物体**（如树木、草地）
- 即使这些物体 **不是 Nanite 对象** ，GPU 开销仍然 **非常高** ——因为失去了 Nanite 的优化
- **日本部分开发者的实际选择** ：放弃 Lumen + VSM，回退到 **UE4 时代的传统光照方案**
- 原因：没有足够时间将树叶转换为 **多边形形状的叶片（Polygon-shaped Leaves）**

### Fortnite 的做法 vs Mega Scans 的现状

| 项目 | 树叶处理方式 |
|------|------------|
| **Fortnite** | 所有树木使用 **多边形建模的叶片** + **不透明材质（Opaque）** ，避免 Masked 开销 |
| **Quixel Mega Scans** | 目前 **不提供** 多边形形状叶片的树木资产 |

这意味着使用 Mega Scans 的开发者 **无法直接复用 Fortnite 的优化策略** 。

---

## 现有资产使用小结

| 要点 | 说明 |
|------|------|
| **资产丰富** | UE 拥有大量免费/付费资产（Mega Scans、Marketplace） |
| **不能直接用** | 这些资产 **并不总是能直接使用** ——可能导致渲染错误或极高 GPU 开销 |
| **必须检查兼容性** | 在使用前，需要确认资产与项目所选的渲染特性（Nanite、Lumen、VSM）之间的 **兼容性** |

---

# 总结与演讲核心观点

演讲者最后总结了日本游戏开发者在使用 UE5 时遇到的 **三大核心问题** ：

1. **多帧处理（Multi Frame Processing）** ：TSR、Lumen、VSM 等依赖历史帧的技术在帧率不稳定时会出现鬼影/延迟
2. **虚拟化与流式加载（Virtualization & Streaming）** ：Nanite 和 Virtual Texture 在摄像机瞬移时会出现低分辨率过渡
3. **现有资产兼容性（Asset Utilization）** ：Mega Scans 等资产不一定能直接配合 Lumen/VSM/Nanite 使用，需要额外适配工作

### 演讲者的核心信息

> **UE5 的所有特性都非常强大** ，Epic 通过精美的 Demo 证明了它们的实用性。
> **但它们不是万能的（Not a Silver Bullet）** ，都有各自的限制条件。
> Epic 在持续改进这些技术，但开发者 **必须理解当前的限制** 。
> **在限制条件内设计场景** ，才能用稳定的帧率实现优秀的画面效果。