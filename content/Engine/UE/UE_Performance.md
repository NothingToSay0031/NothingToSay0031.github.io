---
date: '2025-10-31T12:16:31+08:00'
title: "Maximizing Your Game's Performance in Unreal Engine"
---

# Maximizing Your Game's Performance in Unreal Engine

[Maximizing Your Game's Performance in Unreal Engine | Unreal Fest 2022](https://www.youtube.com/watch?v=GuIav71867E)

[UE游戏性能最大化](https://zhuanlan.zhihu.com/p/1947794933177104041)

[ari.games](https://ari.games/how-to-profile-unreal-engine-games/)

## 通用性能分析理念 (Profiling in general)


*   **核心观点：** 帧预算 (16.66ms @ 60fps, 33.33ms @ 30fps) 就像金钱。你需要评估那些看起来很酷但开销昂贵的特性是否“值得”购买。
    
*   **平台预算策略：**
    
    *   **主机：** 可以利用几乎所有的预算。
        
    *   **PC：** 需要为不同的硬件配置**保留余量**。
        
    *   **移动端：** 需要保留余量来控制**发热和功耗**。
        

## 何时进行优化？

*   **打破陈规：** “过早的优化是万恶之源”这句话过于绝对。
    
*   **理想方式 (中庸之道)：**
    
    1.  **保持优化意识：** 在开发过程中就应有优化意识，但这不应以牺牲代码可读性为代价。这是为了避免问题积重难返。
        
    2.  **数据驱动优化：** **当 Profiler 显示它拖慢了游戏时**，才应该花时间去优化。这是为了避免在不必要的地方浪费时间。
        
*   **反馈循环：** 带着“优化意识”（1）开发，会让“Profiler暴露的问题”（2）更少。而（2）中暴露的问题，会反过来补充和加强你的“优化意识”（1）。
    

## 优化准则


1.  **目标明确：** 只在**未达到目标帧数**的时候进行优化。如果已经60fps了，就直接交付 (ship it)。
    
2.  **抓住重点：** **"Pick the lowest hanging fruit first"**，即优先解决那些付出最小、成效最大的问题。
    
3.  **拒绝盲目：** 严格遵循 **What, Why, How** 三部曲：
    
    *   **What is slow? (什么慢？)** —— Profiler 会告诉你什么消耗了大量时间。
        
    *   **Why is slow? (为什么慢？)** —— 用事实（数据）说话，不要猜测。
        
    *   **How do we fix it? (怎么修？)** —— 在明确知道 What 和 Why 之后才动手修复。
        

## UE Profiling 核心工具

### Unreal Insights

*   **启动方式：** `Tools -> Run Unreal Insights`，或直接运行 `UnrealInsights.exe`。
    
*   **连接：** 启动后会自动连接到本地运行的游戏进程。
    
*   **核心命令行参数：**
    
    *   `-trace=[channels]`：覆写要追踪的频道。
        
    *   **推荐参数 (通用)：** `-trace=default,gpu,memory,file,loadtime` (默认包含 cpu, frame, log, bookmarks)。
        
    *   `-tracehost=[IP]`：连接到另一台电脑进行分析。
        

### Profile GPU

*   **启动方式：**
    
    *   快捷键：`Ctrl + Shift + ,` (逗号)
        
    *   控制台命令：`ProfileGPU`
        
*   **功能：** 对**当前帧**的 GPU 开销进行详细分析。
    
*   **注意事项：**
    
    *   在 **Shipping builds** 中，相关功能会被**编译剔除**。
        
    *   在**编辑器**中：该命令会打开 **GPU Visualizer** 窗口。
        
    *   在**打包后**的包体中：它会将分析结果打印到控制台或日志 (Log) 文件中。
        

## 优化的实际案例 (基于 Lyra)


### 情景1：编辑器帧数低 (GPU Bound)

*   **情景：** 昨天 60 帧，今天 30 帧。
    
*   **分析工具：**
    
    1.  `stat unit`：首先使用此命令判断瓶颈。
        
    2.  `stat unit` 的数据显示 **GPU bound**（GPU 时间远高于 Game 和 Draw）。
        
    3.  `ProfileGPU`：打开 **GPU Visualizer** 深入分析。
        
*   **定位问题 (What)：** 在 GPU Visualizer 中按耗时降序排序，发现 **ShadowDepths** (阴影深度) 和 **DirectLighting** (直接光照) 中有大量点光源 (Point Lights)，每个都耗时 0.5ms 左右。
    
*   **找到原因 (Why)：** 检查这些点光源，发现它们同时满足两个条件：1. 开启了**投射阴影 (Cast Shadows)**；2. 拥有一个**巨大的衰减半径 (5000)**。
    
*   **修复 (How)：** 将这些光源的“投射阴影”关掉，并将“衰减半径”改回 100。帧率立刻恢复到 60。
    
*   **结论：** **光源衰减半径不宜设置得过大**，尤其是投射阴影的光源。
    

### 情景2：小Actor，大卡顿 (CPU Hitch)

*   **情景：** 关卡中有两个 Volume，一个异步加载 Actor，一个同步加载。当玩家从“异步区”快速移动到“同步区”时，游戏出现严重卡顿 (Hitch)。
    
*   **准备工作：**
    
    1.  **打包 Dev 包**进行测量。
        
    2.  使用命令行启动游戏以捕获数据。
        
    
    *   **CPU/加载分析：** `LyraGame.exe -statnamedevents -trace=cpu,gpu,frame,log,bookmark,file,loadtime`
        
        *   `-statnamedevents`：激活更多 CPU 计时事件，分析更详细。
            
    *   **内存分析：** `LyraGame.exe -trace=default,memory`
        
    *   **注意：** 性能分析和内存分析要**分开测量**，因为测量本身有开销，同时进行会互相干扰，导致数据不准。
        
*   **分析工具：** **Unreal Insights**
    
*   **定位问题 (What)：**
    
    1.  在 Insights 中打开 **Timing** 视图，并调出 **GraphTask**（推荐设为 Scrollable）、**Async Loading** 和 **Frame** 轨道。
        
    2.  在 Async Loading 轨道中找到卡顿发生时的巨大峰值，放大。
        
    3.  在 GraphTask 视图中，从顶层函数 (`EngineLoop`) 向下滚动，找到最终调用的耗时函数：`FlushAsyncLoading`。
        
*   **找到原因 (Why)：** `FlushAsyncLoading` 意味着系统正在**强制刷清所有异步加载**。检查代码，发现触发同步加载的蓝图 Volume 使用了 `LoadClassAssetBlocking` 节点。
    
*   **修复 (How)：** 将 `LoadClassAssetBlocking` 替换为 `AsyncLoadClassAsset` (异步加载) 节点。
    
    *   **补充：** 如果确实需要同步等待，可以使用 `StreamableHandle::WaitUntilComplete`。根据注释，这个方法**不会**刷清所有的异步加载。
        
*   **结论：** **永远不要在 Shipping Game 中使用同步加载或可能导致阻塞 (Blocking) 的方法。**
    

### 情景3：恐怖迷雾 (GPU Bound)

*   **情景：** 游戏运行时，当视角转向一个烟雾特效时，帧率从 60 暴跌到 7。
    
*   **分析工具：** `ProfileGPU` (在打包包体中运行，结果输出到 Log 文件)。
    
*   **定位问题 (What)：** 检查 Log 文件 (`Saved/Logs`)，定位到 `ProfileGPU` 的输出。发现是一个**烟雾的透明粒子系统 (Niagara)** 耗时极高。
    
*   **找到原因 (Why)：**
    
    1.  **Niagara 系统：** 粒子发射数量多 (300)，且粒子面片尺寸 (Card Size) 巨大。
        
    2.  **材质：** 粒子使用的材质中，有一个 **Noise (噪声) 节点**，其 **Level 设置为 10**。鼠标悬停提示 "large number cost more performance"。
        
    3.  **材质：** 这个高成本的计算结果，最后还乘以 0.01，使其几乎不可见。
        
*   **修复 (How)：**
    
    *   **简单修复：** 降低 Noise 节点的 Level，或者增大最终的 Alpha 值。
        
    *   **较好修复：** 将这个复杂的计算**烘焙 (Bake) 成一张纹理**，在材质中只使用一个 Texture Sample 节点。
        
    *   **最佳修复：** 针对这个需求（烟雾特效），不如直接使用 UE 自带的**体积雾 (Volumetric Fog)**，效果可能更好，性能也更可控。
        

### 情景4：内存泄漏 (Memory Leak)

*   **情景：** 项目在主机上空跑 3 天后 Crash。只在主机出现，因为主机**没有虚拟内存 (Virtual Memory)**。
    
*   **准备工作：**
    
    1.  启动游戏包体，并附带内存追踪命令：`... -trace=default,memory`
        
    2.  同时，在游戏中开启**每帧 GC**，以便更快地暴露问题：`gc.CollectGarbageEveryFrame 1`
        
    3.  运行 1 分钟后关闭游戏，得到 .utrace 文件。
        
*   **分析工具：** **Unreal Insights (Memory Insights 选项卡)**
    
*   **定位问题 (What)：**
    
    1.  打开 .utrace 文件，进入 Memory Insights。
        
    2.  **过滤干扰：** 在 Tags 视图中，可以关掉 GC 和 LLM (Low Level Memory) 等不关心的标签，只关注项目内存。
        
    3.  **运行查询：** 在 Investigation 窗口，设置一个查询，找出所有**在 A 时刻之后、B 时刻之前分配，但直到 C 时刻（游戏结束）之后才释放的内存**。
        
    4.  **查看结果：** 在弹出的窗口中，Preset 选择 **Callstack**。可以看到 `LaunchWindowsStartUp` 造成了 21.5M 的泄露。
        
    5.  **追溯路径：** 右键点击泄露项，选择 **Expand Critical Path**，展开调用堆栈。
        
    6.  最终定位到 `ACursedActor::Tick` 函数。
        
*   **找到原因 (Why)：**
    
    *   泄露的代码是：`StatsCapures.Add(*new FStatsCapture(GetWorld()->GetTimeSeconds()));`
        
    *   **问题分析：** 这是一个典型的 C# 程序员转 C++ 的错误。`new FStatsCapture(...)` 在**堆 (Heap) 上**分配了内存并返回一个指针。然后 `*` (解引用) 将这个堆上的对象**拷贝**一份（值传递）添加到了 TArray `StatsCapures` 中。
        
    *   **泄露点：** 原本 `new` 出来的那个指针丢失了，它所指向的堆内存**永远不会被释放**，造成了内存泄漏。
        
*   **修复 (How)：**
    
    *   在 C++ (尤其是 UE) 中，创建值类型时不需要 `new`。
        
    *   **正确写法：** `StatsCapures.Add(FStatsCapture(GetWorld()->GetTimeSeconds()));`
        
    *   这会直接在**栈 (Stack) 上**创建 `FStatsCapture` 对象，然后将其**拷贝**到 TArray 中，临时对象在 `Tick` 结束时自动销毁，没有泄露。
