---
title: "Using asynchronous compute on Arm Mali GPUs"
date: 2025-11-25 15:33:58
---

# Using asynchronous compute on Arm Mali GPUs: A practical sample

[Using asynchronous compute on Arm Mali GPUs: A practical sample](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/using-asynchronous-compute-on-arm-mali-gpus)

## 异步计算概述

### 什么是异步计算

- **异步计算（Async Compute）** 并非一种独立的渲染技术，而是一种 **硬件资源利用策略** ——通过同时向 GPU 提交 **多个命令流** ，让不同硬件单元并行工作，最大化利用 GPU 资源。
- 该技术最早起源于 **上一代主机硬件** ，后来被 **Vulkan** 和 **D3D12** 等现代图形 API 正式支持，已成为图形程序员的标准工具之一。
- 本文基于 Khronos Vulkan Sample 仓库中的一个新示例，演示如何在 Arm Mali 上实践异步计算。

### 核心动机

- 现代 GPU 拥有 **多个硬件队列** ，能够同时喂给着色器核心不同类型的工作。
- 如果不使用异步计算，某些硬件队列可能处于 **空闲/饥饿** 状态，造成性能浪费。

---

## 桌面 GPU 与 Arm Mali GPU 的队列拓扑差异

### 桌面 GPU 队列拓扑

- 通常有一个 **GRAPHICS 队列** （可执行所有操作：顶点、片元、计算）。
- 另外有 **多个 COMPUTE 队列** （只能运行计算工作负载）。
- 异步计算的思路：将计算工作放到独立的 COMPUTE 队列，与 GRAPHICS 队列并行执行。

### Arm Mali GPU 队列拓扑（重点）

Arm Mali 是 **Tile-Based GPU（基于分块的 GPU）** ，其渲染管线被分为两个阶段，对应两个硬件队列：

| 硬件队列 | 职责 |
|---|---|
| **Vertex/Tiling 队列** | 顶点着色 + 分块（Tiling） |
| **Fragment 队列** | 片元着色 |

- **计算工作负载** 与顶点/分块工作共享同一硬件队列——因为从硬件视角看， **顶点着色本质上就是计算着色器** 。
- **关键区别** ：在 Arm Mali 上，一个 `VkQueue` 并不仅映射到一个硬件队列，而是 **同时映射到 Vertex/Tiling 和 Fragment 两个硬件队列** 。多个 `VkQueue` 并不代表不同类型的硬件，只是代表 **独立的命令流** 。
- 在 Vulkan 术语中，Arm Mali 只有 **一个队列族（Queue Family）** 需要关心。

---

## 保持硬件队列满载的关键重要性

### Tile-Based Rendering 是一个两级流水线

- **Tile-Based 渲染** 本质上是一个 **两阶段流水线** （Vertex/Tiling → Fragment）。
- 流水线最忌讳的就是 **流水线停顿（Pipeline Stall）** 。
- **最理想的 GPU 状态** ：Fragment 队列 **100% 时间都在忙碌** 。

### 为什么 Fragment 队列是瓶颈焦点

- **顶点着色和 Tiling** 是效率最低的着色类型之一，因为 **每线程的带宽消耗极高** 。
- 因此，在进行几何处理的同时，让 Fragment 队列持续工作是非常重要的。
- 如果着色器核心全被几何工作占满，大概率只会 **卡在外部带宽** 上。

### 依赖方向决定是否产生停顿

- ✅ **安全的依赖方向** ：`VERTEX / COMPUTE → FRAGMENT`
  - 这是自然的流水线方向，不会导致停顿。
- ❌ **有问题的依赖方向** ：`FRAGMENT → VERTEX / COMPUTE`
  - 这会打断流水线，导致 Fragment 队列饥饿，是本示例重点要探讨和解决的问题。

---

## 案例研究：用计算着色器做后处理

### 背景趋势

- **计算着色器做后处理（Post-Effects）** 正变得越来越流行。
- 现代游戏引擎中，主渲染通道（Main Pass Rasterization）在整体渲染预算中的占比 **越来越小** ，后处理的比重不断增加。
- **后处理** 的定义：任何依赖当前帧片元着色结果的计算通道，例如：
  - **HDR Bloom** （高动态范围泛光）
  - **Depth-of-Field** （景深）
  - **各类模糊（Blur）** 效果

### 为什么要用计算着色器而不是渲染通道

- 传统上后处理用一系列 **Render Pass** 实现（这也是合理的做法）。
- 但某些操作用片元着色器实现很 **别扭** ，比如 **归约通道（Reduction Pass）** ——典型场景是 HDR 中的亮度计算，需要一长串渲染通道最终缩减到 1×1 的结果，这非常不优雅。

---

## 核心问题：流水线气泡（Pipeline Bubble）

### 问题描述

当使用计算后处理时，很容易出现以下执行序列：

```
VERTEX → FRAGMENT（场景渲染）→ COMPUTE（后处理）→ ???（如何送上屏幕）
```

- 要最终上屏，我们 **必须** 再次进入 FRAGMENT 阶段。
- 这就产生了可怕的依赖链：

$$
\text{FRAGMENT} \rightarrow \text{COMPUTE} \rightarrow \text{FRAGMENT}
$$

- 这个 `FRAGMENT → COMPUTE` 的依赖 **打断了流水线** ，在等待计算完成期间，Fragment 队列处于 **饥饿/空闲状态** ，形成了所谓的 **"气泡"（Bubble）** 。

### 为什么不把整个帧都用计算完成然后直接呈现？

- **理论上可行** ：Vulkan 允许这样做，一些桌面游戏确实如此实现。
- **移动端的重大障碍** ：**UI 渲染** 问题。
  - UI 通常在一个 Render Pass 中渲染（光栅化绘制）。
  - 如果先把 UI 渲染结果写回内存，再在计算通道中进行合成，从 **带宽角度** 看非常浪费。
  - 在移动端，**带宽 = 功耗 = 发热 = 性能降频** ，所以必须尽可能避免这种方案。

---

## 关键要点总结

| 要点 | 说明 |
|---|---|
| **Async Compute 本质** | 多命令流并行提交，最大化硬件利用率 |
| **Arm Mali 队列模型** | Vertex/Tiling + Fragment 双硬件队列；Compute 与 Vertex 共享队列 |
| **VkQueue ≠ 单硬件队列** | 一个 VkQueue 映射到两个硬件队列，多 VkQueue 只是多命令流 |
| **流水线健康标准** | Fragment 队列始终保持忙碌 |
| **危险依赖** | `FRAGMENT → COMPUTE` 导致流水线气泡 |
| **后处理的困境** | 计算后处理必然引入 `FRAG → COMPUTE → FRAG` 依赖链 |
| **移动端不能全 Compute 呈现** | UI 渲染的带宽成本使纯计算方案不可行 |


# 异步计算实践：示例起点与优化技术

---

## 示例起点：场景构成与性能基线

### 场景组成

示例场景故意设计得较为简单，作为 **计算后处理密集型应用** 的代理模型。分辨率被刻意拉高，以便更容易观察性能差异：

| 渲染通道 | 分辨率 | 队列类型 |
|---|---|---|
| **Shadow Map（阴影贴图）** | 8K | VERTEX / FRAGMENT |
| **Main Pass（主渲染通道，前向着色）** | 4K | VERTEX / FRAGMENT |
| **Threshold + Bloom Blur（阈值 + 泛光模糊）** | — | COMPUTE |
| **Tonemap + UI（色调映射 + UI）** | — | VERTEX / FRAGMENT |

- 最后一步 Tonemap + UI 代表的是帧结束时 **必须回到 Fragment 队列** 的典型场景。

### 性能基线分析

从硬件性能计数器（Performance Counters）可以观察到明显问题：

- **GPU 活跃周期** ：787M cycles/s
- **Fragment 着色活跃周期** ：仅 600M cycles/s

**关键诊断逻辑** ：

1. 如果既 **没有 CPU 瓶颈** ，也 **没有命中垂直同步（V-Sync）** ，但 Fragment 活跃周期明显低于 GPU 总活跃周期——说明存在 **流水线气泡（Pipeline Bubble）** 。
2. 从计数器图表中可以直观看到：当 **Vertex/Compute 周期飙升** 时， **Fragment 周期下降** ——这个下降正是 **Threshold + Bloom Blur 计算通道** 造成的。
3. 这就是典型的 `FRAGMENT → COMPUTE` **反向依赖** ：Bloom 依赖主通道的 Fragment 输出，而 Bloom 本身是计算工作负载，占用了 Vertex/Compute 硬件队列，导致 Fragment 队列在此期间 **饥饿** 。

### 如何获取这些硬件统计数据

- Arm Mali 提供了一个开源的 **硬件计数器读取库** （GitHub 上可获取）。
- **Vulkan Samples 框架** 集成了该库，可以 **实时读取硬件计数器** ——非常实用。
- 这些计数器与 **Arm Mobile Studio** 提供的计数器完全相同。

---

## 启用异步计算：消除流水线气泡

### 异步化后的效果

启用异步计算后，成功 **消除了流水线气泡** ，Fragment 队列达到了 **完全饱和（Fully Saturated）** 的理想状态。

### 并行执行的核心：Shadow Map + Bloom

性能提升的 **主要原因** 是现在可以 **并行执行** 两项工作：

| 并行工作 A | 并行工作 B |
|---|---|
| **下一帧的 Shadow Map**（FRAGMENT） | **Bloom 模糊**（COMPUTE） |

**为什么这对组合特别适合并行？**

- **Shadow Map 渲染** 是极度 **光栅化绑定（Rasterization Bound）** 的工作——大量使用 **固定功能硬件** ，着色器核心大部分时间处于 **空闲状态** 。
- 这恰恰是注入计算工作负载的 **最佳时机** ——着色器核心的空闲线程可以被计算着色器利用。
- 理论上顶点工作也能在此并行，但通常 **没有足够的顶点着色工作量** 来填满 GPU，因此将部分 Fragment 工作 **转移到 Compute** 更合理。

### 性能收益与注意事项

- 在 **Mali-G77** GPU 上，此示例获得了约 **~5% 的 FPS 提升** 。
- ⚠️ **结果高度依赖具体内容** ——不同场景、不同工作负载比例，收益差异巨大。

**为什么性能不会线性缩放？**

- 即使 Fragment 活跃周期上升了，性能 **不会线性提升** ，因为 **Vertex/Compute 和 Fragment 仍然共享同一个着色器核心（Shader Core）** 。
- **"活跃周期"的真正含义** ：GPU 随时准备好在着色器核心有空闲线程时 **立即调度工作** 。任何活跃度的下降间隙，都可以被 **着色器核心调度器（Shader Core Schedulers）** 填充。
- 换句话说，异步计算的收益来自于 **减少调度空隙** ，而非获得额外的计算资源。

---

## 核心技术思路：用多队列"创造"流水线

### 关键洞察

> 如果当前渲染流程中 **不存在自然的流水线** ，我们可以通过 **多个 VkQueue** 的力量 **凭空创造一个流水线** 。

- 这不仅仅是 **异步计算（Async Compute）** ——同时也是 **异步图形（Async Graphics）** 。
- 传统理解中，异步计算只是"在图形工作旁边跑计算"，但在 Arm Mali 的架构下，因为只有一个队列族，我们实际上是在用 **多个 VkQueue 构建跨帧的流水线结构** ，让 Vertex/Compute 队列和 Fragment 队列始终保持忙碌。

### 与桌面 GPU 异步计算的本质区别

| 维度 | 桌面 GPU | Arm Mali |
|---|---|---|
| 队列族数量 | 多个（Graphics + Compute） | 一个 |
| 异步计算含义 | Graphics 队列与 Compute 队列并行 | 同一队列族的多个 VkQueue 构建流水线 |
| 并行维度 | 不同硬件队列类型 | Vertex/Tiling 硬件队列 vs Fragment 硬件队列 |
| 核心目标 | 利用独立 Compute 单元 | **保持 Fragment 队列饱和** ，避免气泡 |



# 异步计算实现细节、注意事项与最佳实践

---

## 实现细节：如何在 Vulkan 中实现异步计算

### 两个核心利用点

1. **队列优先级（Queue Priorities）** ：Arm Mali 支持队列优先级，高优先级队列可以 **抢占（Pre-empt）** 低优先级队列。这个特性最初是为 **VR 应用** 开发的（VR 对延迟极其敏感）。
2. **多队列打破依赖链** ：在 Vulkan API 中，不同的 `VkQueue` 之间 **不共享屏障（Barrier）依赖关系** ，这是消除流水线气泡的关键。

### 理解 Vulkan 中屏障如何建立依赖

- **Pipeline Barrier（管线屏障）** 将同一队列中的所有命令分为 **"之前"** 和 **"之后"** 两部分，然后根据 **阶段掩码（Stage Masks）** 对两半进行排序。
- **Semaphore（信号量）** 的工作方式类似：
  - **Signal** ：表示"之前的所有工作已完成"。
  - **Wait** ：表示"之后的所有工作被阻塞，直到信号量被触发"，同样受阶段掩码约束。

**问题所在** ：如果在 **同一个 `VkQueue`** 中出现 `FRAGMENT → COMPUTE → FRAGMENT` 的屏障链，就 **不可能避免流水线气泡** ——因为屏障只影响 **单个 `VkQueue` 内部** 的排序。

### 双队列分帧策略（核心方案）

将一帧的工作拆分为两段，分配到两个队列，形成 **流水线化（Pipelining）** ：

| 队列 | 优先级 | 职责 |
|---|---|---|
| **VkQueue #1** | 较低（0.5） | 渲染主通道所需的全部工作（Shadow Map + Main Pass） |
| **VkQueue #0** | 较高（1.0） | 主通道之后的全部工作（Bloom + Tonemap + UI + Present） |

**同步机制** ：

1. `VkQueue #1` 完成主通道后 **Signal Semaphore** 。
2. `VkQueue #0` **Wait** 该 Semaphore，然后执行后处理 + 呈现。

**为什么能消除气泡？**

- 在 `VkQueue #1` 中， **永远不会出现** `FRAGMENT → COMPUTE` 的屏障——因为计算后处理被移到了 `VkQueue #0`。
- 当 `VkQueue #0` 忙于完成当前帧的后处理和呈现时， `VkQueue #1` 可以 **无阻碍地开始渲染下一帧** 。
- 这就实现了真正的 **跨帧流水线** 。

### 为什么队列优先级至关重要

- `VkQueue #0` **必须** 拥有比 `#1` 更高的优先级。
- **原因** ：`VkQueue #0` 的工作总是更接近"完成一帧"——如果 `#1` 的工作阻塞了 `#0`，就有 **错过 V-Blank（垂直消隐）** 的风险，导致掉帧。
- 高优先级队列可以抢占低优先级队列的着色器核心资源，确保帧能及时完成呈现。

### Vulkan 代码实现

队列优先级 **必须在设备创建时（Device Creation）预先声明** ：

```cpp
VkDeviceCreateInfo device_info = { VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO };
VkDeviceQueueCreateInfo queue_info = { VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO };

device_info.queueCreateInfoCount = 1;
device_info.pQueueCreateInfos = &queue_info;

queue_info.queueFamilyIndex = 0; // 通过 vkGetPhysicalDeviceQueueFamilyProperties 查询
static const float prios[] = { 1.0f, 0.5f }; // 队列0高优先级，队列1普通优先级
queue_info.pQueuePriorities = prios;
queue_info.queueCount = 2; // 同样通过查询确认支持的队列数

vkCreateDevice(gpu, &device_info, nullptr, &device);
vkGetDeviceQueue(device, 0, 0, &high_prio_queue);  // VkQueue #0：高优先级
vkGetDeviceQueue(device, 0, 1, &normal_prio_queue); // VkQueue #1：普通优先级
```

**关键细节** ：两个队列来自 **同一个队列族（Queue Family Index = 0）** ——这与 Arm Mali 只有一个相关队列族的硬件特性一致。

### 常见替代方案：跨帧重排提交顺序

**问题** ：能否不用双队列，而是通过 **跨帧重新排列提交顺序** 来避免气泡？

**回答** ：技术上可行，但有 **严重缺点** ——需要 **延迟帧的提交** 以进行重排，这通常会增加 **一帧的输入延迟（Input Latency）** 。对于 **交互式应用（如游戏）** ，这是 **不可接受的** 。

---

## 计算着色器做后处理的代价与权衡

### 计算着色器并非万能

虽然异步计算能带来收益，但 **不应盲目将所有工作转为计算着色器** 。在同等工作量下， **Fragment 线程比 Compute 线程略微高效** ，原因如下：

#### 8.1.1 丧失帧缓冲压缩（Loss of Framebuffer Compression）

- 使用 **Storage Image（存储图像）** 时， **AFBC（Arm Frame Buffer Compression）** 会失效。
- 这意味着 **带宽消耗** 会比使用 Fragment 着色输出到 Render Target 时 **更高** 。
- AFBC 是 Mali GPU 的重要带宽优化手段，丧失它代价不小。

#### 8.1.2 丧失事务消除（Loss of Transactional Elimination）

- **事务消除（Transactional Elimination）** 是另一种 **带宽节省特性** ——能消除 **冗余的 Tile 回写（Redundant Tile Write-backs）** 。
- 当使用 Storage Image 时，此优化 **无法生效** 。

#### 8.1.3 间接饿死 Fragment 着色器（Indirect Starvation）

- 如前所述， **VERTEX 和 COMPUTE 共享同一硬件队列** 。
- 如果帧中有 **大量计算工作负载** ，会导致 **顶点着色被饿死** 。
- 顶点着色被饿死 → 没有新的分块数据喂给 Fragment 队列 → **Fragment 也被间接饿死** 。
- 这是一个 **级联饥饿效应** ，需要特别注意计算工作量的占比。

---

## 最佳实践总结

### 官方文档的通用建议（仍然有效）

> **不要用计算着色器处理由 Fragment 着色生成的图像** 。这样做会创建 **反向依赖** ，可能导致 **流水线气泡** 。如果 Fragment 着色器的输出被后续 Render Pass 的 Fragment 着色器消费，那么 Render Pass 会 **更顺畅地通过流水线** 。

### 本文的补充观点

- 本研究证明了：如果 **非常精确地使用 Vulkan API** （双队列 + 优先级 + 信号量同步），可以 **规避上述反向依赖问题** 。
- ⚠️ 这种优化在 **OpenGL ES 中无法实现** ——该 API 没有多队列的概念。

---

## 结论与要点回顾

### 核心结论

- 在 Arm Mali GPU 上 **可以** 有效利用计算着色器 + 异步计算获得性能提升。
- 但需要 **大量的思考和设计** ，且 **测量结果至关重要** ——不能凭直觉判断。

### 异步计算的本质定位

- 异步计算始终是一种 **"锦上添花"型优化** ——用于在已经优化良好的渲染管线中 **榨取最后几个百分点的性能** 。
- 它是 **气质敏感的（Temperamental）** ：做对了能带来收益，做错了可能反而降低性能。

### 关键技术要点速查

| 要点 | 说明 |
|---|---|
| **双队列 + 信号量** | 将帧拆分为主通道和后处理两段，分别提交到不同队列 |
| **队列优先级** | 高优先级给接近完成帧的队列，防止错过 V-Blank |
| **避免反向依赖** | `FRAGMENT → COMPUTE` 是性能杀手，用多队列规避 |
| **计算着色器的代价** | 丧失 AFBC、事务消除，可能间接饿死 Fragment |
| **必须实测** | 结果高度依赖具体内容，不能泛化假设 |
| **Vulkan 独有** | OpenGL ES 无法实现此优化 |