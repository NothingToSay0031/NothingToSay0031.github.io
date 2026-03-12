---
title: "Vulkan subpasses: the good, the bad, and the ugly"
date: 2025-11-10 12:14:45
description: Understand when Vulkan subpasses improve efficiency, when they do not, and how modern Arm GPUs close the gap.
---


# Vulkan Subpass 深度解析：优势、陷阱与未来

[Vulkan subpasses: the good, the bad, and the ugly](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/vulkan-subpasses-the-good-the-bad-and-the-ugly)

---

## Subpass 基本概念

- **Vulkan 渲染通道（Render Pass）** 是光栅化工作负载的容器。在 Vulkan 1.0 的原始定义中，一个 Render Pass 由 **一个或多个 Subpass** 组成的序列构成。
- 每个 Subpass 定义一组 **输入和输出帧缓冲附件（Framebuffer Attachments）** 。
- 后续 Subpass 中的 **Fragment Shader** 可以在 **匹配的采样坐标** 处，直接读取前一个 Subpass 输出的值。
- Subpass 的核心设计意图：为 **基于 Tile 的 GPU（Tile-Based GPU）** 提供 **内存带宽优化** 的抽象层——Subpass 之间交换的附件数据可以 **保留在片上 Tile Memory 中** ，直到不再需要时才丢弃，无需写回主存。

---

## 优势（The Good）：延迟光照中的带宽节省

### 传统延迟光照（Deferred Lighting）的问题

传统延迟光照渲染不透明物体时需要 **两个 Render Pass** ：

1. **第一个 Render Pass（Geometry Pass）** ：通过 **多渲染目标（MRT, Multiple Render Target）** 将每个片元的材质数据收集到 **G-Buffer** 中。
2. **第二个 Render Pass（Lighting Pass）** ：从 G-Buffer 纹理中读取材质数据作为光照方程的输入，遍历所有光源累加光照贡献。

**不使用 Subpass 时的数据流** ：

- 第一个 Pass 结束后，G-Buffer 必须 **写回主存（DRAM）** 。
- 第二个 Pass 开始时，再从主存中 **重新读取** G-Buffer。
- G-Buffer 通常每像素消耗 **128-bit 甚至更多** 的颜色数据，这种 **主存往返（round-trip）** 消耗 **大量内存带宽** 。
- 访问 DRAM 是 **高能耗操作** ，在 **电池驱动的移动设备** 上代价尤为昂贵。

### 使用 Subpass 的优化方案

- 将两个 Render Pass 合并为 **一个 Render Pass 内的两个 Subpass** 。
- **第一个 Subpass** ：G-Buffer 数据存储在 **Tile Memory（片上内存）** 中。
- **第二个 Subpass** ：光照计算直接从 **Tile Memory** 读取 G-Buffer 数据。
- Render Pass 结束后，G-Buffer 附件可以通过 `STORE_OP_DONT_CARE` **直接丢弃** ，无需写回主存。

**核心收益** ：

- **避免了大量 DRAM 带宽消耗** ，这是延迟光照最大的性能瓶颈之一。
- **降低功耗、改善发热** ，对移动游戏场景尤其重要。

---

## 劣势（The Bad）：合并行为的不可预测性

### Subpass 合并不是保证的

- Subpass 是 **标准 Vulkan API 特性** ，始终可用。但 Subpass 是否真正 **合并为单个硬件 Render Pass** 并通过 Tile Memory 交换数据，**取决于具体实现** ：
  - **硬件能力**
  - **驱动实现**
  - **每个 Subpass 的精确 API 配置**

### OEM 可能禁用 Subpass 合并

- 所有 **Arm GPU 的 Vulkan 实现** 都具备合并兼容 Subpass 的能力。
- 但部分 **OEM 厂商** 在旧款 GPU 的驱动中 **主动禁用了 Subpass 合并** ，原因是合并在某些内容上反而导致 **性能下降** 。
- 这使得 Subpass 的行为 **对应用开发者来说不可预测** ，是一个不理想的状况。

> **注意** ：据 Arm 所知，搭载 **Mali-G710 系列及更新 GPU** 的设备上，没有 OEM 禁用 Subpass 合并。

### 合并反馈扩展

- **`VK_EXT_subpass_merge_feedback`** 扩展：提供关于 Subpass 是否合并以及如何合并的反馈信息。
  - 允许开发者 **确认预期的合并是否真正发生** 。
  - 首次引入于 **r38p0 驱动** ，目前已广泛可用。
- **实践建议** ：在目标设备上使用该扩展进行验证，避免盲目假设 Subpass 已合并。

---

## 关键总结与工程启示

| 维度 | 要点 |
|---|---|
| **适用场景** | 延迟渲染等需要在连续 Pass 间传递大量中间数据的管线 |
| **核心优化原理** | 数据留在 **Tile Memory** ，避免 DRAM 往返带宽 |
| **风险** | 合并行为 **依赖硬件/驱动/配置** ，不保证生效；旧设备可能被 OEM 禁用 |
| **验证手段** | 使用 **`VK_EXT_subpass_merge_feedback`** 确认合并状态 |
| **安全基线** | Mali-G710 及以后的设备上，Subpass 合并可靠性较高 |



# Vulkan Subpasses 的"丑陋面"（The Ugly）：时钟周期性能可能反而下降

---

## 核心观点

Subpass 能显著 **降低内存带宽消耗** ，但 **不一定提升逐时钟周期（clock-for-clock）性能** 。对于 Arm GPU，纹理采样的峰值性能 **至少与 Tile Memory 访问一样快** ，因此将纹理读取替换为 Tile 读取本身不会带来直接的性能提升——除非你确实已经 **撞上了系统带宽瓶颈** 或 **纹理缓存频繁抖动（thrashing）** 。

> 使用 Subpass 的理想结果是：**性能持平，但内存带宽大幅减少** 。

更糟糕的情况是：合并后的 Subpass 可能在 clock-for-clock 性能上 **反而变慢** ，因为合并后的 Render Pass 对 GPU 来说是一个 **更难调度的工作负载** 。虽然带宽节省仍然带来 **能效提升** ，但这种性能回退往往 **出乎开发者预料** 。

---

## GPU 队列调度（Queue Scheduling）层面的影响

### 问题根源：几何 Binning 必须全部完成后才能开始 Fragment Shading

- Arm GPU 是 **Tile-Based 架构** ，硬件 Render Pass 必须先完成 **所有几何体的 Binning（分桶）** ，才能开始对该 Pass 进行 **Fragment Shading** 。
- **合并 Subpass** 会 **增大初始几何工作量** ，延迟 Fragment Shading 的启动时间。
- 取决于应用的其他 GPU 工作的调度时序，这段 **额外延迟不一定能被隐藏** 。

### 分离 Render Pass vs. 合并 Subpass 的流水线差异

| 方案 | Binning 与 Fragment 的关系 |
|---|---|
| **分离 Render Pass** | 多个 Render Pass 之间可以 **流水线化（pipeline）** Binning 和 Main Phase | 
| **合并 Subpass** | Binning 和 Fragment 必须 **串行执行** ，无法跨 Subpass 流水线化 |

### 硬件改进趋势

- 从 **Immortalis-G920 系列** 开始，GPU 改善了初始 **顶点着色和 Tile Binning** 的性能。
- 串行 Binning 阶段暴露给应用层的 **可见影响正在逐代减少** ，未来硬件将继续优化。

---

## GPU Warp 调度（Warp Scheduling）层面的影响

### 核心问题：Tile Memory 读取的依赖等待

- 读取 Tile Memory 的 Fragment Shader 必须 **等待前一层（earlier layer）写入完成** ，否则会 **阻塞（stall）** 。

### 旧架构（Mali-G710 之前）：单一依赖追踪器 → 悲观调度

- **Mali-G710 系列之前** ，Shader Core 对每个像素位置只有 **单个依赖追踪器（single dependency tracker）** 。
- 一个 Fragment 访问 Tile Memory 前，必须等待该像素位置上 **所有更早的 Fragment 全部完成** Tile Memory 访问。
- 这导致了 **悲观调度（pessimistic scheduling）** 和 **虚假依赖（false dependencies）** ，尤其在多附件（multi-attachment）使用场景下。
- GPU 可能因为大量 Warp 被阻塞而 **耗尽可运行的 Warp** 。

**示例说明** ：三个 Layer 各自访问 G-Buffer 中的三个位置：

- 每个 Layer 在首次尝试访问 Tile Memory 时 **就会阻塞** ，必须等待自己成为 **最旧的 Layer** 才能继续。
- 后续 Layer 因为 **虚假依赖** 而在访问共享数据时频繁 stall。

### 新架构（Mali-G710 及之后）：多依赖追踪器 → 细粒度释放

- **Mali-G710 系列起** ，Shader Core 对每个像素支持 **多个帧缓冲依赖追踪器（multiple framebuffer dependency trackers）** 。
- 依赖可以随着 Shader 的执行进度 **增量释放（released incrementally）** 。
- 极大改善了 **延迟光照** 等每个 Shader 需访问多个附件的场景。

**同一示例的改进效果** ：

- 三个 Layer 均 **不会产生 stall** 。
- 当某个 Layer 到达某个 Tile Memory 位置的同步点时，前一个 Layer **已经完成并释放了该依赖** 。
- Layer 之间实现了 **干净的流水线化（pipelining cleanly）** 。

### 更大的 Tile 尺寸也有帮助

- **Mali-G710 系列** 同时将 Tile 尺寸升级到 **32×32 像素** 。
- 更大的 Tile 意味着 Shader Core 可以在 **更多独立像素位置** 上运行 Warp，减少对 **空间上重叠且有依赖的 Warp** 的依赖。
- 进一步降低了 **基于 Layer 的 stall** 。

---

## Shader Core 功能单元吞吐量差异

- Tile Memory 读取和 **纹理读取（Texture Read）** 使用的是 Shader Core 中 **不同的功能单元** 。
- 从 **Mali-G77 系列** （ **Valhall 架构** 首代）开始， **纹理采样的速度是 Tile Memory 访问速度的 2 倍** 。
- 如果某个 Render Pass 的 **Tile 访问已经高度负载** ，此时切换为合并 Subpass 反而可能 **比直接纹理读取更慢** 。
- 这种情况在实际内容中 **不常见** ，但当你的 Shader **非常简单** 时需要注意。

---

## Shader Core 缓存压力

- 合并 Subpass 后，每个 Tile 在处理过程中需要 **遍历更多不同的资源** ：Shader 代码、Buffer、纹理等。
- 资源数量增加导致 **Shader Core 缓存压力增大** 。
- 如果在高资源压力下发生 **缓存抖动（cache thrashing）** ，性能将 **下降** 。

---

## Shader Core 优化行为的变化

Mali GPU 内置了两项 **跳过不必要工作** 的优化。合并 Subpass 可能改变这些优化的触发条件：

### 空 Tile 消除（Empty Tile Elimination）

- **功能** ：跳过没有任何几何体的 Tile，包括跳过 `loadOp=LOAD` 的回读行为。
- **触发条件** ：Tile 内无几何体覆盖。

### 事务消除（Transaction Elimination）

- **功能** ：当 Tile 内容未发生变化时，跳过 `COLOR0` 附件的写入（即使 `storeOp=STORE`）。
- **触发条件** ：仅 **COLOR0 硬件附件槽** 支持此优化。

### 合并 Subpass 如何破坏这两项优化

**不使用 Subpass 的场景** ：

- Render Pass 0：仅部分屏幕覆盖，`loadOp=LOAD`，写入 COLOR0。
- Render Pass 1：全屏 Quad，读取 Pass 0 输出作为纹理，写入 COLOR0。
- **Pass 0 触发空 Tile 消除** （部分覆盖），**两个 Pass 都可能触发事务消除** （各自通过 COLOR0 写入）。

**合并为 Subpass 后** ：

| 优化 | 影响 |
|---|---|
| **空 Tile 消除** | **失效** ——Subpass 1 包含全屏 Quad，使得合并后的硬件 Render Pass 中 **每个 Tile 都包含几何体** 。Subpass 0 被迫对每个 Tile 执行 `loadOp=LOAD` |
| **事务消除** | **失效** ——最终输出附件被重映射到 **COLOR1 硬件附件槽** ，而事务消除 **仅支持 COLOR0** |

### 实际影响评估

- 这两项优化在 **3D 游戏实际渲染中通常不会频繁触发** 。
- 但在 **简单测试场景** 中（只渲染少量物体、每帧生成静态不变的图像），非 Subpass 方案会因为这两项优化频繁触发而 **表现出人为偏高的性能** ，导致与 Subpass 方案的对比 **产生误导** 。

---

## 总结对比表

| 影响因素 | 问题 | 受影响的 GPU 代际 |
|---|---|---|
| **GPU 队列调度** | 合并后 Binning 串行化，延迟 Fragment 启动 | 所有 Tile-Based GPU，G920 起改善 |
| **Warp 调度依赖** | 单依赖追踪器导致虚假依赖和 stall | Mali-G710 之前；G710 起大幅改善 |
| **功能单元吞吐量** | Tile 读取速率仅为纹理采样的一半 | Mali-G77（Valhall）起 |
| **缓存压力** | 每 Tile 资源增多，可能引发 cache thrashing | 所有 GPU |
| **空 Tile 消除** | 合并后全屏 Quad 阻止优化触发 | 所有支持该优化的 GPU |
| **事务消除** | 输出被重映射到非 COLOR0 槽位，优化失效 | 所有支持该优化的 GPU |



# 现代替代方案：从 Subpass 到显式 Tile Memory 访问

---

## Vulkan 的演进方向：告别 Subpass 抽象

- Vulkan 正在 **逐步抛弃 Subpass** 作为 Tile Memory 的抽象层。
- **Vulkan 1.4** 引入的新式 **动态渲染通道（Dynamic Render Pass）** 中，**Subpass 已不复存在** 。
- 但利用 Tile Memory 优化算法仍然可行——通过新的扩展提供 **显式的、基于 Shader 的编程式访问** 。

---

## 关键扩展一览

### `VK_EXT_rasterization_order_attachment_access`

- 适用于 **Vulkan 1.0 风格的 Render Pass** 。
- 提供在 Shader 中 **显式访问帧缓冲附件** 的能力。
- 驱动支持：**r36p0**（ARM 扩展版本）/ **r40p0**（EXT 扩展版本）起。

### `VK_KHR_dynamic_rendering_local_read`（DRLR）

- 适用于 **动态渲染通道（Dynamic Render Pass）** 。
- 提供在 Shader 中 **显式访问帧缓冲附件** 的能力。
- **已纳入 Vulkan 1.4 核心规范** ，成为标准功能。
- 驱动支持：**r49p1** 起。

### `VK_EXT_shader_tile_image`（已被取代）

- 功能类似 DRLR，驱动支持更早：**r44p1** 起。
- **已被 DRLR 取代** ，当 DRLR 可用时应优先使用 DRLR，因为 DRLR 是核心功能且 **跨厂商通用** 。
- 唯一使用理由：DRLR 不可用的 **旧设备兼容性** 。

---

## 显式访问 vs. Subpass 的核心区别与共同点

| 维度 | Subpass | 显式 Shader 访问扩展 |
|---|---|---|
| **Tile Memory 映射** | 取决于实现定义的合并行为，**不保证** | 对 Arm GPU **保证映射到 Tile Memory** |
| **行为可预测性** | OEM 可能禁用合并，**不可预测** | **确定性行为** ，消除合并不确定性 |
| **底层硬件调度** | 受 Queue/Warp 调度影响 | **相同硬件，相同调度限制** |
| **clock-for-clock 性能影响** | 可能下降 | **同样可能下降**（本质相同） |

> **关键结论** ：显式扩展消除了"合并是否发生"的不确定性，但 **不能规避底层硬件调度带来的性能损失** ——因为表达的是 **相同的算法意图** ，运行在 **相同的硬件** 上。

---

## 总结与推荐策略

### Subpass 的定位

- **降低内存带宽** 是移动端渲染的核心目标，Subpass 是实现手段之一。
- 合并后的 Subpass **几乎总能节省带宽** ，有利于 **能效提升** 。
- 但 clock-for-clock 性能 **不一定提升，甚至可能略降** ，尤其在 **旧 GPU** 上。
- 带宽减少可以 **间接提升性能** ：更低的能耗允许 GPU 在设备散热限制内 **运行在更高频率** 。
- 近代 Arm GPU（G710 系列起）已在 **缩小性能差距** ，未来硬件将继续改进。

### 现代 Vulkan 的推荐路径

- 使用 **动态渲染通道** + **`VK_KHR_dynamic_rendering_local_read`** （Vulkan 1.4 核心）。
- 旧设备回退到 **`VK_EXT_shader_tile_image`** 。
- **始终进行性能分析（Profile）** ，特别是在旧设备上，确认 Tile Memory 优化对具体用例是否有益。

---

## 常见问题（FAQ）精要

### Q1：Subpass 是否总是有利于性能？

- 合并后 **几乎总能节省带宽** → 提升能效。
- 但除非 **带宽受限** ，合并后的 Subpass **没有理由比不合并更快** 。
- 实际上由于调度开销，性能 **往往略有下降** ，旧 GPU 尤甚。
- **间接收益** ：能效提升 → 可能维持更高时钟频率 → 间接提升帧率。
- **Arm 建议** ：使用 **Streamline Profiler**（Arm Performance Studio，免费）实测验证。

### Q2：显式替代方案能否避免性能问题？

- **不能** 。显式扩展避免了合并不确定性，但 **底层硬件调度差异导致的性能损失完全相同** 。

### Q3：如何判断 Subpass 是否成功合并？

- **API 层面** ：使用 **`VK_EXT_subpass_merge_feedback`** 扩展，在创建 Render Pass 时查询。
- **Profiler 层面（Arm Streamline）** ：
  - **直接观测** ：Mali 时间线调度追踪显示实际的 **硬件 Render Pass 数量** vs. 提交的 API Render Pass 数量（需 CSF GPU + r51p0 或更新驱动，部分 r49p1 设备有技术预览版）。
  - **间接观测** ：Mali 性能计数器可测量硬件 Render Pass 写入的 **像素计数** 。合并成功时，像素计数相比分离 Render Pass 应明显 **减少** 。

### Q4：哪些设备禁用了 Subpass 合并？

- Arm **无法完整列举** ，因为 OEM 的驱动修改对 Arm 不可见。

### Q5：还有理由使用 `VK_EXT_shader_tile_image` 吗？

- 唯一理由：**更早的驱动支持（r44p1）** ，可覆盖更多旧设备。
- 当 DRLR 可用时，**始终优先使用 DRLR** ，因为它是核心规范的一部分且跨厂商可用。