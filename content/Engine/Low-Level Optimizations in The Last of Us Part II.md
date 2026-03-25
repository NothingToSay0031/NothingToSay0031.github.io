---
title: "Low-Level Optimizations in The Last of Us Part II"
date: 2026-03-25 15:33:58
---

# 《最后生还者2》低层级渲染优化（SIGGRAPH 2020, Naughty Dog）

[Low-Level Optimizations in The Last of Us Part II by Parikshit Saraswat || SIGGRAPH 2020](https://www.youtube.com/watch?v=CvS6rX-67wA&list=PLdbCjIV0Pl9Ab3rfs15E3b7PiQyBNZmRU)

---

## 总览与目标

- 演讲者来自 **Naughty Dog** 工作室，分享《最后生还者2》中若干 **低层级 GPU 优化** 的案例研究
- 涉及的优化对象包括：**次表面散射（Subsurface Scattering）**、 **后处理（Post-processing）**、 **全局光照（Global Lighting）**、 **水体渲染（Water）** 等昂贵的渲染 Pass
- 所有优化总计节省约 **2.1 ms**，在 30fps（ **帧预算 33 ms** ）的目标下相当显著
- 关键原则：所有优化都是 **不引入任何视觉瑕疵（artifacts）** 的纯底层调优
- 所有性能数据来自 **基础款 PS4（Base PS4）**，使用 Razor GPU Profiler 采集

---

## 次表面散射（Subsurface Scattering）Shader 优化

### 问题诊断

- 次表面散射 Shader 的 **L2 Cache 命中率尚可**，但属于 **显存带宽瓶颈（Memory Bandwidth Bound）** 的 Shader
- 由于寄存器压力大，**Occupancy（占用率）低**，无法充分隐藏显存访问延迟

### 第一步优化：降低 VGPR 压力，提升 Occupancy

- **核心思路**：减少 **VGPR（Vector General Purpose Register）** 的使用量
  - 方法一：将部分 VGPR **溢出（Spill）到 LDS（Local Data Share）**
  - 方法二：缩短寄存器变量的 **生命周期（Lifetime）**，让编译器更积极地复用寄存器
- 这样可以在同一个 **CU（Compute Unit）** 上放入更多 **Wavefront**，从而提升 Occupancy
- 更高的 Occupancy → 当一个 Wavefront 等待显存时，硬件调度器可以切换到其他 Wavefront 执行指令 → **隐藏显存读取延迟**
- **效果**：仅通过提升 Occupancy，性能就提升了约 **31%**
- **适用条件**：前提是你 **没有在大量 Thrash L2 Cache**，否则更多 Wavefront 会让 Cache 情况更糟

### 第二步优化：从 Compute Shader 切换到 Pixel Shader

#### 动机：异步调度问题

- 即使优化了 VGPR，该 Shader 仍然是 **低 Occupancy** 的 Shader
- 低 Occupancy Shader 的问题：**与其他异步（Async Compute）任务的调度效果很差**
- 目标是让这个 **显存密集型（Memory-Intensive）** Shader 与一个 **ALU 密集型** Shader 异步并行运行，互相隐藏各自的 Stall
- 但在 Compute Shader 形态下，GPU 调度器 **根本不会将它们有效地交错调度**

#### 切换到 Pixel Shader 的好处

| 优势 | 说明 |
|------|------|
| **更好的 Wavefront 分发（Distribution）** | Pixel Shader 的硬件 Wavefront 调度机制与 Compute Shader 不同，分发更均匀，更容易与 Async Compute 任务共存 |
| **Color Cache 写入替代 L2 写入** | Pixel Shader 的输出通过 **Color Cache（ROP/CB）** 写出，而非直接走 L2。这意味着 **L2 更多地被释放给读取操作**，对这种读取密集的 Shader 非常有利 |
| **与 Async 工作协同调度** | 由于 Wavefront 分布更好，Pixel Shader 形态可以成功地与异步 ALU 任务一起被调度执行 |

#### Pixel Shader 的代价：Ordered Export Stall

- **Pixel Shader 的导出（Export）必须按序完成（Ordered Export）**
- 这意味着：即使某个像素不是皮肤、不需要真正写任何数据（只想输出 0），它仍然要 **等待在同一个 CU 上先于它被 Dispatch 的所有 Pixel Shader Wavefront 完成导出** 后才能导出
- 大量分支跳过（Branch/Early-out）的 Shader 在 Pixel Shader 形态下，如果 **单独运行**，反而可能 **更慢**
  - 实测数据：单独运行时 **IPC（Instructions Per Cycle）几乎减半**，性能也几乎减半
  - **Export Stall 大幅攀升**
  - 内存读取效率反而降低

- **关键洞察**：这些 Export Stall 时间可以被 **异步并行的 ALU 工作填充**！
  - 在 Export Stall 等待期间，Async Compute 的 ALU 工作可以执行
  - 因此 Export Stall **在实际运行中几乎被完全隐藏**
  - 同时，较小的显存延迟也可以被 Async 任务的 ALU 计算隐藏

#### 叠加优化：硬件 Stencil 测试剔除

- 切换到 Pixel Shader 后，可以利用 **硬件 Stencil 测试** 进一步减少无用 Wavefront
- 游戏中几何体被分为 **前景（Foreground）** 和 **背景（Background）**
- **绝大多数情况下，只有前景几何体包含皮肤像素**
- 通过 Stencil 测试，**直接在硬件层面剔除所有背景几何体的 Wavefront**，不让它们进入 Shader 执行
- 减少了被 Dispatch 的 Wavefront 总数 → 减少了 Export Stall → 进一步提升性能

#### 最终效果

- 综合所有优化（VGPR 压力优化 + Pixel Shader 切换 + Async 协同 + Stencil 剔除），最终 Shader 比原始版本 **快约 5 倍**
- 在大多数场景中，该 Pass 的开销变得 **几乎为零（almost free）**

### 需要注意的问题：Pixel Shader 的 Wavefront 像素排布

- **Compute Shader** 中的 Wavefront 覆盖的像素区域是程序员定义的 **规则 Tile** 形状
- **Pixel Shader** 中的 Wavefront 像素排布 **不是规则 Tile**，而是由硬件光栅化器决定，可能跨越多个 Tile
- 在次表面散射 Shader 中，每个 Tile 有自己的 **Light List（灯光列表）**
- 如果一个 Wavefront 跨越多个 Tile，其中的像素可能属于 **不同的灯光列表**，导致 **微妙的渲染错误**

#### 解决方案

- 在启用该优化前，对场景做一次检查：
  - 遍历所有 **局部光源（Local Lights）** 的 **视锥体（Light Frustums）**
  - 检查它们与皮肤角色 **包围体（Bounding Volumes）** 的 **相交性**
  - 如果 **没有相交**（即皮肤角色要么完全在光源范围外，要么完全在范围内），则 **不存在跨 Tile 灯光列表不一致的问题**，可以安全启用优化
- 实际游戏中 **绝大多数场景满足此条件**，因此该优化在大部分时间都被启用

---

## 核心知识点总结

| 概念 | 要点 |
|------|------|
| **VGPR 压力与 Occupancy** | VGPR 用量越多 → 每个 Wavefront 占用寄存器越多 → CU 上能并发的 Wavefront 越少 → Occupancy 越低 → 隐藏延迟能力越差 |
| **Spill to LDS** | 将部分寄存器数据暂存到 LDS 中，以减少 VGPR 占用量；LDS 访问虽比寄存器慢，但远快于显存 |
| **Compute vs. Pixel Shader 取舍** | Compute Shader 对分支友好但与 Async 调度差；Pixel Shader 有 Export Stall 但 Wavefront 分发更好、可利用 Color Cache |
| **Ordered Export** | PS4（GCN 架构）Pixel Shader 的输出必须严格按 Dispatch 顺序导出，这会导致分支密集 Shader 产生大量等待 |
| **Async Compute 协同** | 将显存密集型 Shader 与 ALU 密集型 Shader 异步并行，互相填充对方的 Stall 时间 |
| **Hardware Stencil 剔除** | 利用 GPU 固定功能管线的 Stencil 测试，在 Shader 执行前就丢弃不需要处理的像素，减少无用 Wavefront |



# Probe Lighting Pass 优化

---

## 问题背景

- **Probe Lighting（探针光照）** 是在已经计算好精美光照数据后，将其应用到场景的 Pass
- 探针可能在内存中 **随机分布访问**，导致这个 Pass 是 **极度显存密集型（Memory Intensive）** 的
- 大量随机读取导致 **L2 Cache 被严重 Thrash（反复驱逐）**
- **不能简单提升 Occupancy**：因为更多的 Wavefront = 更多的并发显存读取 = L2 Thrash 更严重

> 这与前面 SSS 优化的情况相反——SSS 是 L2 命中率尚可所以可以提 Occupancy，而 Probe Lighting 是 Cache 已经在 Thrash，提 Occupancy 只会雪上加霜。

---

## 第一步：从 Compute Shader 切换到 Pixel Shader

### 切换带来的好处

| 好处 | 详细说明 |
|------|----------|
| **释放更多 L2 Cache 给读取** | 写入走 **Color Cache（ROP）** 通道，不再占用 L2 带宽，L2 命中率略有提升，Cache Thrash 略微减少 |
| **更好的 Wavefront 分发** | Pixel Shader 的硬件调度机制使 Wavefront 在 CU 间分布更均匀，更容易与 **Async Compute** 任务协同运行 |
| **与异步 ALU 任务互相隐藏延迟** | 虽然 L2 仍然在 Thrash、显存 Stall 仍然很大，但可以通过 Async Compute 上的 **ALU 密集型任务** 来隐藏部分 Memory Stall |

### 代价

- 由于分支（非所有像素都需要 Probe Lighting），**Ordered Export Stall** 不可避免地出现
- Shader **自身单独跑反而更慢**（Export Stall 从 0 增加到 **0.89 个 Wavefront/cycle 在等待导出**）

### 综合效果

- 尽管 Shader 本身变慢了，但由于 **更好的 Wavefront 分发** 能隐藏 Export Stall，加上与 Async 任务协同隐藏了部分 Memory Stall
- 最终获得约 **5% 的整体性能提升**——仅仅通过从 Compute Shader 切换到 Pixel Shader

---

## 第二步：降低 Occupancy + 利用 ALU 隐藏延迟（反直觉优化）

### 核心思路

> **既然 L2 Cache 正在被 Thrash，那就不应该让更多 Wavefront 同时发起显存请求。反而应该 *主动降低* Occupancy。**

### 具体做法：聚簇内存读取（Clustering Memory Reads）

1. **将所有内存读取尽可能提前、聚集在一起**
2. 这样做会 **延长 VGPR 的生命周期（Lifetime）**——因为早早读取的数据要一直存活到很久以后才被使用
3. VGPR 使用量增大 → 编译器分配更多寄存器 → **Occupancy 自然下降**
4. 较少的并发 Wavefront → **较少的并发显存请求** → **L2 Thrash 减轻**

### 用 Shader 内部的 ALU 来隐藏延迟

- 传统做法：靠更多 Wavefront（高 Occupancy）来隐藏显存延迟
- **这里的替代做法**：不靠并发 Wavefront，而是靠 **Shader 自身内部的 ALU 指令** 来填充显存等待时间
  - 当显存读取在飞行中（in-flight）时，GPU 可以执行该 Wavefront 中不依赖这些读取结果的 ALU 指令
  - 这样既隐藏了延迟，又不会增加对 L2 Cache 的压力

### 同样的策略应用于 SSR（屏幕空间反射）Ray Marching

- SSR 的 Ray Marching 过程中需要 **到处采样 Depth Buffer**，同样导致 L2 严重 Thrash
- 采用相同的 **降低 Occupancy** 策略，效果同样显著

### 最终效果

| 指标 | 变化 |
|------|------|
| **每周期等待显存的 Wavefront 数** | 降低到原来的 **约一半** |
| **每周期执行的指令数（IPC）** | **提升** |
| **相对 Pixel Shader 版本的性能提升** | **+13%** |

---

## 关键总结：何时提升 Occupancy vs 何时降低 Occupancy

```
┌─────────────────────────────────────────────────────────────┐
│  L2 Cache 命中率好 → 提升 Occupancy → 用更多 Wavefront     │
│                       隐藏显存延迟（如 SSS 的情况）          │
├─────────────────────────────────────────────────────────────┤
│  L2 Cache 正在 Thrash → 降低 Occupancy → 减少并发显存请求   │
│                          用 ALU 指令来隐藏延迟               │
│                         （如 Probe Lighting、SSR 的情况）    │
└─────────────────────────────────────────────────────────────┘
```

这是一个 **非常重要的判断准则**：优化方向取决于 Cache 的实际行为，而非一味追求高 Occupancy。



# Skinning（蒙皮）Pass 优化

---

## 背景

- 《最后生还者2》中大部分 **蒙皮变换（Skinning Transformations）** 在 **GPU** 上完成
- 蒙皮的核心操作：每个线程需要读取 **骨骼矩阵（Bone）** 数据，对顶点进行变换

---

## 原始方案：用 LDS 缓存骨骼数据

### 做法

1. 由于同一 Thread Group 内多个线程可能读取 **同一根骨骼**
2. 先让线程协作将所有骨骼数据 **预加载到 LDS（Local Data Share）**
3. 执行 **Group Sync（组同步屏障）**
4. 之后所有线程从 LDS 读取骨骼数据，避免重复的显存读取

### 这个方案的问题：Instruction Cache Miss 灾难

- Naughty Dog 的蒙皮使用了 **多种不同的 Shader（不同的 Microcode）**
- 每种 Shader 对应不同的 GPU 微码（Microcode）
- 当一个 **新 Shader 首次被 Dispatch 到某个 CU** 时，该 CU 上的 **第一个 Wavefront** 会遭遇严重的 **Instruction Cache Miss**：
  - 典型表现：执行 7-8 条指令 → 等待 **~300 个 Cycle** → 再执行 7-8 条指令 → 又等 300 Cycle……
- 如果每种 Shader 的工作量都不大（只有 14-15 个 Dispatch），这些 Dispatch 会被 **分散到两个 Shader Engine 的各个 CU 上**
- 结果：**几乎每个 Wavefront 都是"该 CU 上该 Shader 的第一个 Wavefront"**，全部遭遇 Instruction Cache Miss

### 关键决策：放弃 LDS，允许重复读取

- **使用 LDS + Thread Group Sync** 意味着需要 **较大的 Thread Group Size**，这就需要每种 Shader 变体都要在 CU 上发起完整的 Thread Group
- 改为：**每个线程独立读取自己需要的骨骼数据**，即使相邻线程读的是同一根骨骼
- 好处：**不再需要 Thread Group Sync**，可以用更小的 Thread Group 甚至完全消除对 LDS 的依赖
- 更小的 Wavefront 调度单元 → 同一 Shader 的 Wavefront 更集中 → **Instruction Cache 命中率提升 22%**
- **最终性能提升约 4%**

> **经验教训**：如果你只有一种 Shader 且工作量很大（大量 Wavefront 跑同一个 Microcode），LDS 缓存骨骼 + 大 Thread Group 可能仍然是好策略。但如果你有 **大量不同 Shader 变体** 且每种工作量不大，LDS + Group Sync 的代价（Instruction Cache Miss）可能远超收益。

---

## 蒙皮后法线重计算的优化：精确控制 Occupancy

### 问题

- 蒙皮完成后需要 **重新计算法线（Recomputation of Normals）**
- 法线重计算需要 **从 Buffer 中随机采样数据**，导致 **L2 Cache 严重 Thrash**
- L2 Cache 命中率低至约 **5%**

### 尝试一：聚簇内存读取 + ALU 隐藏延迟（效果有限）

- 使用与 Probe Lighting 相同的策略：**聚簇内存读取（Cluster Memory Reads）**，用 Shader 内部 ALU 隐藏显存延迟
- **问题**：这个 Shader 的 **ALU 计算量很少**，没有足够的 ALU 指令来隐藏长延迟
- 结果：仅获得约 **6% 的提升**，不够理想

### 尝试二：精确控制 Occupancy = 3（最终方案）

#### 目标

- 经验测试发现 **Occupancy = 3** 时 L2 命中率和指令执行效率最佳
- 需要 **精确地** 将 Occupancy 限制在 3，不多不少

#### 为什么不用常规方法

| 方法 | 问题 |
|------|------|
| **增加 VGPR 生命周期来降低 Occupancy** | 从 Occupancy 10 降到 3 需要大量 VGPR，但实际 Shader 用不了那么多寄存器，人为膨胀 VGPR 不现实 |
| **通过 Scheduler 限制每个 Shader Engine 的 Wave 数** | 会同时限制 **Async Compute 任务** 的 Wave 数，可能导致 Async 工作出现间隙（Gap），且难以精确控制到特定 Occupancy 值 |

#### 最终方案：Dummy LDS 占用

1. **尽量降低 VGPR/SGPR 的生命周期**（压低寄存器使用量），让寄存器文件尽可能空闲留给 **Async 任务**
2. **分配 Dummy LDS**——声明一块 LDS 空间但 **实际不做任何读写**
3. 这样 GPU 调度器会认为该 Shader 需要大量 LDS → 每个 CU 上最多只能放 **3 个 Wavefront** → **Occupancy 精确 = 3**
4. 由于寄存器压力被刻意降低，**剩余的寄存器文件空间留给了 Async Compute 任务**，不影响异步工作的调度

> **核心思想**：用 LDS 占用来控制 Occupancy 上限，用低 GPR 压力来不抢占 Async 工作的寄存器资源。两者解耦，各自独立控制。

#### 效果

| 指标 | 变化 |
|------|------|
| **L2 Cache 命中率** | 提升约 **10 倍** |
| **整体性能** | 相比原始版本提升 **超过 3 倍** |

---

## 本节优化总结

| Pass | 核心瓶颈 | 关键优化手段 | 性能收益 |
|------|----------|-------------|---------|
| **Skinning（蒙皮变换）** | Instruction Cache Miss（多 Shader 变体分散调度） | 去掉 LDS + Group Sync，允许重复读取，提升 I-Cache 命中率 | **+4%** |
| **Normal Recomputation（法线重计算）** | L2 Cache Thrash（随机内存访问）+ ALU 不足 | **Dummy LDS 精确控制 Occupancy = 3** + 低 GPR 压力保留寄存器给 Async | **+3x（超过 3 倍）** |

---

## 关键设计启示

1. **LDS 不是万能的**：当 Shader 变体多、单变体工作量小时，LDS + Sync 的 Instruction Cache Miss 代价可能远超内存读取重复的代价
2. **Occupancy 控制需要因地制宜**：
   - Cache 命中率好 → **提升 Occupancy** 来隐藏延迟
   - Cache 在 Thrash → **降低 Occupancy** 来减少并发内存压力
3. **Dummy LDS 是精确控制 Occupancy 的实用技巧**：比调节 VGPR 或 Scheduler 限制更精确、副作用更小
4. **寄存器文件与 LDS 解耦控制**：降低 GPR 压力把寄存器留给 Async，用 LDS 占用限制本 Shader 的 Occupancy——两者互不干扰



# G-Buffer Pass 优化：利用闲置寄存器做"免费"工作

---

## 问题分析

### G-Buffer 的特点

- G-Buffer 是一个 **非常大的 Pass**（约 **10 ms**）
- 虽然有 Async Compute 工作与之并行，但由于很多异步任务 **依赖 G-Buffer 的输出结果**，无法填满整个 G-Buffer 时间段
- 结果：**近一半的 G-Buffer 时间内没有异步工作并行**，GPU 资源未被充分利用

### 寄存器文件（Register File）永远填不满

G-Buffer Shader 有 **大量 Interpolant（插值变量）**，这导致两种典型瓶颈场景：

| 场景 | 描述 | 瓶颈 |
|------|------|------|
| **大量小几何体** | 顶点数巨大，但每个三角形在屏幕上只覆盖很少像素 | **Parameter Cache Bound（参数缓存瓶颈）** ——大量 Vertex Shader 想要导出插值数据，但 Parameter Cache 装不下 |
| **少量大几何体**（如站在大墙面前） | 顶点少但像素多，产生大量 Pixel Shader Wavefront | **LDS Bound** ——即使寄存器文件（Register File）可以支持 Occupancy = 8，实际同时运行的 Wavefront 只有约 5 个 |

**核心矛盾**：
- 寄存器文件有大量空闲容量
- Pixel Shader 有 **Ordered Export Stall**（像素在等待导出）
- 没有足够的 Async 工作来填满空闲的 CU 资源

---

## 优化策略：生成"额外"顶点来免费利用空闲寄存器

### 核心思路

> **既然寄存器文件（GPR）闲着、Pixel Shader 在等 Export，那不如让 GPU 多 Spawn 一些 Vertex Shader Wavefront——即使这些顶点 *无法导出*（被 Clip 掉或无实际输出），它们仍然可以利用空闲的寄存器来执行少量的 ALU 和 Memory 操作，这些操作相当于"免费的"。**

### 为什么这是"免费"的

1. **寄存器文件有空余** → 额外的 Vertex Shader Wavefront 不会挤占 Pixel Shader 的寄存器
2. **Pixel Shader 正在 Ordered Export Stall** → ALU 和 Memory 单元本来就闲着
3. 额外 Vertex Shader 的少量 ALU/Memory 操作可以在这些空闲的执行单元上运行

### 配套优化：最大化 Vertex Shader 的 Occupancy

- 目标：让每个 Vertex Shader Wavefront 占用 **尽可能少的寄存器**，从而在有限的寄存器文件中塞进更多 Wavefront
- 具体方法取决于场景：

| 场景 | 方法 |
|------|------|
| **Parameter Cache Bound（Naughty Dog 的主要情况）** | 将 VGPR **溢出到 LDS（Spill to LDS）** 来降低单个 Wavefront 的寄存器占用 |
| **LDS Bound** | 缩短 VGPR 生命周期，让编译器更激进地复用寄存器 |

### 进一步可能的优化（未实施）

- 如果可以接受一定精度损失，可以将部分 **Pixel Shading 的计算提前到 Vertex Shader** 中完成
- 这样 Vertex Shader 变得更"重"，在空闲寄存器中执行的"免费 ALU/Memory"工作量更大
- Naughty Dog **没有尝试**这个方向，但理论上收益会更高

### 效果

- **Active VGPR** 数量增加（寄存器利用率提升）
- **等待 Export 的 Wavefront 数量大幅增加**（预期之中）
- 整体执行速度 **提升约 2%**
- 如果 Vertex Shader 本身更贵（更多 ALU 工作），收益会更大

---

# 水体渲染（Water Rendering）优化：Early-Z 与 Late-Z 的取舍

---

## 问题诊断

- 水体使用 **前向渲染（Forward Rendering）**，同时启用了 **Early-Z** 和 **Late-Z** 深度测试
- 预期每个 CU 应该有约 **4 个 Pixel Shader Wavefront** 在运行
- 实际只有 **2-3 个**
- 原因：**Early-Z 的深度测试速度** 成为瓶颈，限制了 Pixel Shader Wavefront 的吞吐量（Pixel Wave Throughput）
- 由于 Wavefront 吞吐不足，**无法达到满 Occupancy**

## 优化方案

### 对于水体和 Alpha 渲染几何体：只使用 Late-Z

- **去掉 Early-Z，只保留 Late-Z**
- 结果：**Pixel Wave Throughput 提升**，更多 Wavefront 可以同时在 CU 上运行
- GPU 利用率上升

### 适用条件判断

| 条件 | 推荐策略 |
|------|----------|
| **Shader 较轻量**（如水体） | **只用 Late-Z** ——Pixel Wave Throughput 的提升带来的收益 > Early-Z 剔除掉被遮挡像素节省的计算 |
| **Shader 非常昂贵**（如雪地渲染） | **保留 Early-Z + Late-Z** ——Early-Z 剔除掉的像素节省了大量昂贵的着色计算，值得承受吞吐量的损失 |

### 效果

- 水体渲染和 Alpha 几何体切换为只用 Late-Z 后
- 性能提升约 **15%**

---

# 总结与各 Pass 节省汇总

---

## 总体结论

- 在 **33 ms 帧预算（30 fps）** 下，仅通过 **更好地利用硬件特性** 的底层调优，共节省超过 **2 ms**
- **所有优化都不引入任何视觉瑕疵（No Artifacts）**
- 这些是 **全局性的代码优化**，而非场景特定的 Trick，可广泛应用

## 各 Pass 节省一览

| 优化 Pass | 主要优化手段 | 节省效果 |
|-----------|-------------|---------|
| **Skinning（蒙皮）** | 提升 L2 Cache 比率（去掉 LDS + Group Sync） | **节省最多** |
| **SSS（次表面散射）** | 提升 Occupancy + 切换到 Pixel Shader + Async 协同 | 显著节省 |
| **Probe Lighting** | 切换到 Pixel Shader + 降低 Occupancy + 聚簇读取 | 显著节省 |
| **法线重计算** | 精确控制 Occupancy = 3 | 显著节省 |
| **SSR Ray Marching** | 降低 Occupancy 减少 L2 Thrash | 显著节省 |
| **Water（水体）** | 去掉 Early-Z，只用 Late-Z 提升 Wave Throughput | **15%** |
| **G-Buffer** | 利用空闲寄存器文件做免费 Vertex Shader 工作 | **~2%**（虽少但全局有效） |

---

## 核心设计原则回顾

1. **先诊断瓶颈类型**：是 Memory Bound？ALU Bound？Parameter Cache Bound？LDS Bound？Instruction Cache Miss？
2. **Occupancy 不是越高越好**：如果 L2 正在 Thrash，提高 Occupancy 反而有害
3. **Compute Shader vs Pixel Shader 不是固定选择**：Pixel Shader 有 Color Cache 优势和更好的 Wavefront 分发，但有 Ordered Export Stall 代价
4. **利用 Async Compute 隐藏延迟**：需要好的 Wavefront 分发才能真正生效
5. **所有空闲的硬件资源都是优化机会**：空闲寄存器、空闲 ALU 单元、空闲 Cache 带宽——都可以被"借用"