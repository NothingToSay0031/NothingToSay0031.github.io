---
title: Coherency Preserving Ray Compaction in Lumen
date: 2025-12-04 10:00:00
---


## 利用 WaveOps 实现 Coherency Preserving Ray Compaction

在研究最近几年的光追渲染管线进展 时，我们经常会在分享中听到一个关键词：**Ray Compaction** 。同样，在[Siggraph 2022](https://advances.realtimerendering.com/s2022/index.html#Lumen)上，Epic分享了如何通过 **Coherency Preserving Ray Compaction** ，使得追踪速度提升了 **21%** 。

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202512031934046.jpg)

在实时光线追踪（Real-Time Ray Tracing）中，最大的性能杀手往往不是光线相交测试本身，而是**GPU 线程的闲置（Idle）和控制流发散（Divergence）** 。

UE5 的 Lumen 反射管线通过三个关键的 Compute Shader 完美解决了这两个问题。它们共同组成了一个高效的 **Producer-Consumer（生产者-消费者）** 模型：

1. **Classification (分类)** ：剔除无效区域，只对有内容的 Tile 派发任务。
2. **Compaction (紧凑化)** ：在光线生成后，剔除无效光线，压缩数据流。
3. **Sorting (排序)** ：按材质聚合光线，最大化 Shading 阶段的并行效率。

## 任务筛选

### Shader: ReflectionTileClassificationBuildListsCS

**核心目标** ：粗粒度剔除（Culling）。不要为屏幕上的“空像素”启动光线追踪。

Lumen 并不会对屏幕上的所有像素全部发射光线。这一步将屏幕划分为 `8x8`的 **Tile** ，并检查每个 Tile 是否包含需要反射的物体（通过 `LumenTileBitmask`）。

### 1. 源码分析：Z-Order 曲线与 Wave Ops

代码使用了 **Wave Intrinsics** 来高效构建两个列表：`RWReflectionTileData`（活跃 Tile）和 `RWReflectionClearTileData`（空 Tile）。

**关键代码逻辑：** 

```text
// 1. 获取 Tile 的空间位置，使用 Z-Order 曲线重排以增加纹理缓存局部性
const uint2 ThreadOffset = ZOrder2D(ThreadIndex, log2(THREADGROUP_SIZE));

// 2. 检查 Bitmask，确定当前 Tile 是否需要反射
bool bTileUsed = LumenTileBitmask[TileCoordFlatten] & LUMEN_TILE_BITMASK_REFLECTIONS;

// 3. Wave 级聚合：统计当前 Wave 中有多少个 Active Tile
uint NumTilesInWave = WaveActiveCountBits(bTileUsed);

// 4. 申请显存空间：仅由 Wave 的第一个线程执行一次原子加
if (WaveIsFirstLane() && NumTilesInWave > 0)
{
    // 向全局 Indirect Args Buffer 申请 NumTilesInWave 个槽位
    InterlockedAdd(RWReflectionTileIndirectArgs[0], NumTilesInWave, GlobalTileOffset);
}

// 5. 广播基地址
GlobalTileOffset = WaveReadLaneFirst(GlobalTileOffset);

// 6. 并行写入：计算当前线程在 Wave 内的排位，直接写入全局 Buffer
if (bTileUsed)
{
    // WavePrefixCountBits(true) 返回“在我之前的活跃线程数”
    RWReflectionTileData[GlobalTileOffset + WavePrefixCountBits(true)] = PackTileData(TileData);
}
```

### 2. 技术亮点

- **原子操作优化** ：原本需要每个线程执行一次 `InterlockedAdd`（高争用），现在变成了每 32⁄64 个线程执行一次。性能提升显著。
- **Indirect Draw/Dispatch** ：生成的 `RWReflectionTileIndirectArgs`将直接用于驱动后续的 Shader（`DispatchIndirect`），这意味着 CPU 不需要知道 GPU 到底要算多少个 Tile，实现了 GPU Driven Pipeline。


---


## 光线过滤

### Shader: ReflectionCompactTracesCS

**核心目标** ：细粒度剔除。剔除那些射出去但没有击中物体、或者被判定为无效的光线。

在 Tile 分类后，我们生成了光线（`ReflectionGenerateRaysCS`，生成了 RayBuffer）。但在进行昂贵的 Shading 计算之前，我们需要把“未命中（Miss）”或“被遮挡”的光线剔除掉，把有效的 Trace 紧凑地排在一起。

### 1. 源码分析：两级紧凑化 (Two-Level Compaction)

这个 Shader 展示了极其精妙的 **Wave -> Group -> Global** 三层数据流压缩技巧。

**关键代码逻辑：** 

```text
// --- 层级 1: Wave 内统计 ---
// 统计当前 Wave 有效光线数量
const uint OffsetInWave = WavePrefixCountBits(bTraceValid); 

// --- 层级 2: Wave 间通信 (Group 内) ---
// 每个 Wave 的最后一个线程，负责把本 Wave 的总数加到 Group 共享内存中
if (LaneIndex == LastLaneIndex)
{
   const uint ThisWaveSum = OffsetInWave + (bTraceValid ? 1 : 0);
   InterlockedAdd(SharedGroupSum, ThisWaveSum, OffsetInGroup);
}
// 广播 Group 内的偏移量给 Wave 内所有线程
OffsetInGroup = WaveReadLaneAt(OffsetInGroup, LastLaneIndex) + OffsetInWave;

GroupMemoryBarrierWithGroupSync();

// --- 层级 3: Global 内存申请 ---
// 每个 Group 选出一个代表（Thread 0），去全局 Buffer 申请空间
if (GroupThreadId == 0)
{
   InterlockedAdd(RWCompactedTraceTexelAllocator[0], SharedGroupSum, SharedGlobalTraceTexelStartOffset);
}
GroupMemoryBarrierWithGroupSync();

// --- 写入 ---
if (bTraceValid)
{
   RWCompactedTraceTexelData[SharedGlobalTraceTexelStartOffset + OffsetInGroup] = TraceTexelForThisThread;
}
```

### 2. 技术亮点

- **层次化原子操作** ： 
- L1 (Wave): 0 原子操作（寄存器指令）。 
- L2 (Group): `Shared Memory`原子操作（次数 = Wave 数量，极少）。 
- L3 (Global): `Global Memory`原子操作（次数 = 1 次/Group）。
- 相比传统的每个线程直接去 Global Buffer `InterlockedAdd`，这种方法的吞吐量是前者的几十倍甚至上百倍。


---


## 一致性优化

### Shader: ReflectionSortTracesByMaterialCS

**核心目标** ：最大化 Shader 执行的一致性（Coherency）。

在光线追踪中，如果相邻的线程处理不同的材质（例如：线程1算皮肤，线程2算水面，线程3算金属），GPU 必须串行执行所有这些材质的分支逻辑，导致严重的**线程发散** 。 此 Shader 使用计数排序（Counting Sort / Bin Sort）将相同材质 ID 的光线聚拢在一起。

### 1. 源码分析：局部桶排序 (Local Bin Sort)

**关键代码逻辑：** 

**Step A: 统计直方图 (Histogram)** 每个线程处理多个元素（`ELEMENTS_PER_THREAD=16`），统计每种材质的数量。

```text
// 算出当前光线属于哪个桶 (MaterialId % NUM_BINS)
uint BinIndex = MaterialId.MaterialId % NUM_BINS;
// 在 Shared Memory 的桶里计数，并获取局部 Hash (在桶内的位置)
InterlockedAdd(Bins[BinIndex], 1, Hash[i / THREADGROUP_SIZE_1D]);
```

**Step B: 并行前缀求和 (Parallel Prefix Sum)** 算出每个桶在最终数组中的起始偏移量（Offsets）。这里再次利用了 Wave Ops。

```text
uint BinOffset = WavePrefixSum(Value); // Wave 内前缀和
// ... (通过 SharedGroupSum 进行 Wave 间同步，代码略) ...
if (BinIndex < NUM_BINS) {
    Offsets[BinIndex] = BinOffset; // 得到该材质的全局起始位置
}
```

**Step C: 散射写入 (Scatter)** 将光线搬运到排序后的位置。

```text
// 最终位置 = 组偏移 + 材质桶偏移 + 桶内局部偏移
uint OutputIndex = GroupOffset + Offsets[BinIndex] + Hash[...];
RWCompactedTraceTexelData[OutputIndex] = TraceDataCache[...];
```

### 2. 技术亮点

- **Thread Coarsening** ：一个线程处理 16 个光线。这增加了指令级并行度（ILP），隐藏了显存访问延迟。
- **解决 Divergence** ：排序后，同一个 Wave 内的线程极大概率都在处理同一种材质。这使得后续的 Shading Pass 可以满效率运行，避免了“线程 1 等线程 2 跑完不同分支”的情况。


---


## 总结

这三个函数展示了现代 GPU 编程（特别是针对 Compute Shader）的高级范式：

1. **ReflectionTileClassification** ：做的是 **Tiles** 级别的**筛选** 。
2. **ReflectionCompactTraces** ：做的是 **Rays** 级别的**压缩** 。
3. **ReflectionSortTracesByMaterial** ：做的是 **Materials** 级别的**重排** 。

贯穿始终的核心技术是 **Wave Intrinsics** ，Wave Ops 来避免全局原子锁和显存带宽浪费。


## ReflectionSortTracesByMaterial 源码分析

它的核心功能是：**局部排序（Local Sort）**。

具体来说，它在一个线程组（Thread Group）内部，将光线追踪的 **Trace（追踪任务）** 按照 **材质 ID（Material ID）** 进行重新排序。

### 为什么要做这个？

在 GPU 渲染中，**Warp/Wave Divergence（执行发散）** 是性能杀手。如果同一个 Warp 里的 32 个线程，有的在算金属反射，有的在算玻璃折射，有的在算皮肤次表面散射，GPU 效率会非常低。
这个 Shader 的目的是将相同材质的光线任务“聚拢”在一起，这样后续的 Shading Pass 就能更连贯地执行，减少分支发散，提高缓存命中率。

-----

### 详细步骤解析

我们将代码分为四个阶段来解读：初始化、计数（Counting）、前缀和（Prefix Sum）、重排（Reorder/Scatter）。

#### 1\. 设置与定义 (Setup)

  * **线程粗化 (Thread Coarsening)**: `ELEMENTS_PER_THREAD 16` 表示每个线程通过循环处理 16 个元素。这是为了隐藏内存延迟并提高指令吞吐量。
  * **分桶 (Binning)**: `NUM_BINS` 定义了桶的数量（这里是线程组大小的一半）。代码通过 `MaterialId % NUM_BINS` 将材质映射到这些桶里。
  * **共享内存 (LDS)**: `Bins` 用于存储每个桶里有多少个元素；`Offsets` 用于存储每个桶在排序后数组中的起始位置。

#### 2\. 阶段一：初始化共享内存

```cpp
if (GroupThreadId < NUM_BINS)
{
   Bins[GroupThreadId] = 0;
   Offsets[GroupThreadId] = 0;
}
GroupMemoryBarrierWithGroupSync();
```

线程协作将共享内存清零，并使用 Barrier 确保所有线程都看清零完成。

#### 3\. 阶段二：读取数据、解码与计数 (Read & Count)

这是 **计数排序 (Counting Sort)** 的第一步。

  * **循环读取**: 线程遍历分配给它的 16 个元素。
  * **边界检查**: `RayIndex < CompactedTraceTexelAllocator[0]` 确保不越界。
  * **解码**:
      * `UnpackTraceMaterialId(...)`: 从压缩数据中提取出材质 ID。
      * `BinIndex = MaterialId % NUM_BINS`: 计算该元素属于哪个桶。
  * **缓存数据**: `TraceDataCache` 和 `TraceBinCache` 是寄存器数组（Register Array）。将读取的全局内存数据暂存在寄存器中，避免后续写回时再次访问慢速的显存。
  * **原子计数 (关键点)**:
    ```cpp
    InterlockedAdd(Bins[BinIndex], 1, Hash[i / THREADGROUP_SIZE_1D]);
    ```
      * 它在共享内存中对应的桶计数 +1。
      * **重要**: `Hash` 数组保存了 `InterlockedAdd` 的**返回值**。这个返回值是加法发生**之前**的值。这意味着 `Hash` 记录了当前这个元素**在这个桶内部是第几个**（桶内偏移量）。这是后续确定最终位置的关键。

#### 4\. 阶段三：计算前缀和 (Prefix Sum / Scan)

这一步是为了计算每个桶在输出数组中的**起始偏移量**。代码分为两个分支：

  * **分支 A: `DIM_WAVE_OPS` (高性能路径)**
    这里使用了 **Wave Intrinsics**（硬件加速的子组操作）来加速前缀和计算。

    1.  `WavePrefixSum(Value)`: 计算当前 Wave 中，当前 lane 之前所有 lane 的值之和。
    2.  `InterlockedAdd(SharedGroupSum, ...)`: 这一步看起来是处理当 Bin 数量超过 Wave 大小（或者多个 Wave 协作）时的跨 Wave 累加。
    3.  最后计算出的值存入 `Offsets[BinIndex]`。

  * **分支 B: 普通循环 (兼容路径)**

    ```cpp
    for (int i = 0; i < GroupThreadId; ++i) Offsets[GroupThreadId] += Bins[i];
    ```

    如果硬件不支持 Wave Ops，就用最笨的 O(N) 循环累加之前所有桶的数量。

此时，`Offsets[k]` 存储了第 `k` 个桶之前所有桶的元素总和。

#### 5\. 阶段四：重排与写回 (Scatter / Write)

这是 **计数排序** 的最后一步，将数据写到正确的位置。

```cpp
uint BinIndex = TraceBinCache[...]; // 取出刚才缓存的桶索引
// 计算最终写入位置：
// GroupOffset (组基地址) + Offsets[...] (桶基地址) + Hash[...] (桶内偏移)
uint OutputIndex = GroupOffset + Offsets[BinIndex] + Hash[...];

// 写入全局内存
RWCompactedTraceTexelData[OutputIndex] = TraceDataCache[...];
```

  * 利用之前在寄存器里缓存的 `TraceDataCache`，直接写入到新的 `OutputIndex`。
  * 这里实现了**In-Place**（虽然是写入 RW 资源，但逻辑上是重排）或者输出到新的 Compacted 数组。


### C++ 代码

```cpp
FComputeShaderUtils::AddPass(
   GraphBuilder,
   RDG_EVENT_NAME("SortTracesByMaterialCS"),
   ComputePassFlags,
   ComputeShader,
   PassParameters,
   PassParameters->IndirectArgs, // 使用之前 Setup 好的 Buffer
   (uint32)ECompactedReflectionTracingIndirectArgs::NumTracesDiv256); // <--- 关键在这里！
```

#### 1\. 关键参数 `NumTracesDiv256`

Shader `SetupCompactedTracesIndirectArgsCS`：

```cpp
// THREADGROUP_SIZE_256 (Index 2)
WriteDispatchIndirectArgs(RWReflectionCompactTracingIndirectArgs, 2, DivideAndRoundUp(CompactedTraceTexelAllocator[0], 256u), 1, 1);
```

C++ 中的 `NumTracesDiv256` 对应的就是这个 `Index 2`。这意味着 Dispatch 的线程组数量是：
$$\text{GroupCount} = \lceil \frac{\text{TotalRays}}{256} \rceil$$

#### 2\. 数学上的“不匹配”与“超额调度”

让我们算一下账：

  * **Sort Shader 的吞吐量**：
    `THREADGROUP_SIZE_1D` 为 **64**。
    `ELEMENTS_PER_THREAD` 为 **16**。
    也就是 **1 个 Group 可以处理 64 \* 16 = 1024 个 Ray**。

  * **Indirect Args 提供的数量**：
    它按照每 256 个 Ray 分配 1 个 Group。

  * **结果**：
    **Dispatch 的 Group 数量是实际需要的 4 倍** ($1024 / 256 = 4$)。

#### 3\. 为什么这样跑没问题？

虽然调度了 4 倍的 Group，但逻辑是完全安全的，因为 Shader 内部有严格的**边界检查**：

```cpp
// Shader 内部
const uint GroupOffset = GroupId * NUM_ELEMENTS; // GroupId * 1024

// ...

// 循环处理 16 次
for (int i = GroupThreadId; i < NUM_ELEMENTS; i += THREADGROUP_SIZE_1D)
{
   uint RayIndex = GroupOffset + i;
   // 【安全卫士】这里是关键
   if (RayIndex < CompactedTraceTexelAllocator[0]) 
   {
      // ... 只有 RayIndex 在有效范围内才执行 ...
   }
}
```

-----

### 总结：这个函数在干嘛？

它的作用可以用一句话概括：
**在一个 GPU 线程组内部，利用共享内存和原子操作，实现了一个并行的计数排序算法，将光线追踪的任务按照材质 ID 进行分组重排。**

**流程图解：**

1.  **输入**: 乱序的光线列表 `[木头, 玻璃, 木头, 水, 玻璃]`
2.  **计数 (Bins)**: `木头:2, 玻璃:2, 水:1`
3.  **前缀和 (Offsets)**: `木头Start:0, 玻璃Start:2, 水Start:4`
4.  **原子返回值 (Hash)**: 第一个木头是0，第二个木头是1；第一个玻璃是0...
5.  **计算地址**:
      * 木头1 -\> offset 0 + hash 0 = Index 0
      * 木头2 -\> offset 0 + hash 1 = Index 1
      * 玻璃1 -\> offset 2 + hash 0 = Index 2
      * ...
6.  **输出**: `[木头, 木头, 玻璃, 玻璃, 水]` (已排序)

### 潜在的性能优势

1.  **减少 Warp Divergence**: 排序后，同一个 Warp 更有可能处理相同的材质，Shader 代码执行路径一致。
2.  **纹理缓存优化**: 相同材质通常意味着采样相同的纹理，排序后能极大提高 Texture Cache Hit Rate。
