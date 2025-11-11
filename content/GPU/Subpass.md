---
title: Vulkan subpasses: the good, the bad, and the ugly
date: 2025-11-10 12:14:45
description: Understand when Vulkan subpasses improve efficiency, when they do not, and how modern Arm GPUs close the gap.
---


# Vulkan Subpass 深度解析：优势、陷阱与未来

[Vulkan subpasses: the good, the bad, and the ugly](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/vulkan-subpasses-the-good-the-bad-and-the-ugly)



## 核心概要

Vulkan Subpass 是一种为 **Tile-Based GPU (TBDR 架构)** 设计的优化技术。其核心目标是**显著降低内存带宽**，尤其是在移动设备上节省功耗和散热。然而，它并非银弹，其优化效果具有**不确定性**，甚至可能导致**时钟周期性能 (clock-for-clock performance) 下降**。现代 Vulkan (1.4+) 正在用更明确的 **Dynamic Rendering Local Read (DRLR)** 方案取代它。

* * *

## 1\. 💡 The Good (优势): 为什么使用 Subpass？

### 核心机制：利用片上内存 (Tile Memory)

*   **Vulkan 1.0 定义:** 一个 `Render Pass` (渲染通道) 由一个或多个 `Subpass` (子通道) 序列组成。
    
*   **关键特性:** 一个 Subpass 中的着色器，可以读取**前一个 Subpass** 在相同像素坐标的输出结果。
    
*   **工作原理 (Tile-Based GPU):**
    
    1.  GPU 将屏幕划分为一个个**图块 (Tile)**。
        
    2.  Subpass 之间传递的数据（例如 G-Buffer）可以**暂存在高速的片上图块内存 (on-chip tile memory) 中**。
        
    3.  数据在下一个 Subpass 中被直接读取，使用完毕后即被丢弃。
        
    4.  **最终结果:** 避免了将这些中间数据（附件）写入主内存 (DRAM) 再读回的昂贵操作。
        

### 经典案例：延迟光照 (Deferred Lighting)

*   **传统实现 (无 Subpass):**
    
    1.  **Pass 1 (G-buffer Pass):** 渲染场景，将材质、法线、深度等信息写入 **G-Buffer (多个渲染目标)**。
        
    2.  **\[高昂成本\]**: G-Buffer (每像素可能 128-bits+) 被**写入主内存 (DRAM)**。
        
    3.  **Pass 2 (Lighting Pass):** **从主内存 (DRAM) 读回** G-Buffer 数据，计算光照。
        
    4.  **缺点:** 极高的内存带宽消耗，导致高功耗和发热，对移动设备尤其不利。
        
*   **Subpass 实现:**
    
    1.  **单个 Render Pass，两个 Subpass**。
        
    2.  **Subpass 1 (G-buffer Pass):** 将 G-Buffer 数据写入**片上图块内存 (Tile Memory)**。
        
    3.  **Subpass 2 (Lighting Pass):** 直接**从图块内存 (Tile Memory) 中读取** G-Buffer 数据，计算光照。
        
    4.  **优点:** 几乎消除了 G-Buffer 的 DRAM 带宽开销，显著提升能效。
        

* * *

## 2\. ⚠️ The Bad (缺陷): 不可预测性

### 核心问题：API 与硬件的脱节

*   **Subpass 合并是"实现定义" (Implementation-Defined) 的:**
    
    *   你在 Vulkan API 中定义了 Subpass，不代表硬件**一定会**将它们合并 (merge) 为单个硬件渲染通道并使用 Tile Memory。
        
    *   这个优化行为**依赖于硬件、驱动程序和具体的 API 配置**。
        
*   **厂商行为:**
    
    *   Arm GPU (如 Mali) 具备合并能力。
        
    *   但是，一些 OEM 厂商在**旧 GPU (Mali-G710 之前)** 的驱动中**禁用了 Subpass 合并**，因为发现在某些内容上它会导致性能下降。
        
    *   **结果:** Subpass 优化变得**不可预测**，开发者无法稳定依赖它。
        
*   **如何检查:**
    
    *   使用 `VK_EXT_subpass_merge_feedback` 扩展，可以在创建 Render Pass 时查询 Subpass 是否**真的被合并**了。
        

* * *

## 3\. 👹 The Ugly (性能陷阱): 为什么 Subpass 可能更慢？

这是理解 Subpass 最关键的部分。Subpass 的目标是**降带宽**，但它可能会牺牲**执行速度**。

**核心观点：** 最佳情况是**性能不变，带宽显著降低**。但以下几个原因可能导致**性能实际下降**。

### 陷阱 1: GPU 队列调度 (Binning 延迟)

*   **TBDR 流程:** Tile-Based GPU 必须先完成一个硬件 Render Pass 的**所有几何“分箱” (Binning)** 工作（包括顶点着色），然后才能开始该 Pass 的**片段着色 (Fragment Shading)**。
    
*   **Subpass 的影响:**
    
    *   将多个 Pass 合并 (merge) 成一个硬件 Pass，意味着**初始的几何工作负载变大了** (例如 G-pass 的所有几何体 + Lighting-pass 的全屏四边形)。
        
    *   这导致**几何 Binning 阶段耗时更长**，从而**推迟了片段着色开始的时间**，增加了渲染延迟。
        
*   **硬件进展:** 较新的 GPU (如 Immortalis-G920 系列) 正在改进 Binning 性能，以减少这种延迟。
    

### 陷阱 2: GPU Warp 调度 (依赖与等待)

*   **问题:** Subpass 2 的片段着色器必须**等待 (stall)** Subpass 1 将数据写入 Tile Memory 后才能读取。
    
*   **旧 GPU (Mali-G710 之前):**
    
    *   每个像素**只有单个依赖跟踪器 (single dependency tracker)**。
        
    *   导致**悲观调度 (Pessimistic Scheduling)**：一个片段必须等待其位置上 _所有_ 更早的片段 _完全_ 完成 _所有_ Tile Memory 访问后才能开始。
        
    *   在多附件 (MRT) 读写时，这会引发**错误依赖 (False Dependencies)**，导致大量 Warp 阻塞。
        
*   **新 GPU (Mali-G710 及之后):**
    
    *   **1\. 多重帧缓冲依赖跟踪器 (multiple dependency trackers)**：允许依赖被**增量释放** (例如，G-Buffer 的 Attachment 1 写完了，下游就可以读 Attachment 1，不用等 2 和 3 写完)。
        
    *   **2\. 更大的 32x32 图块 (Large Tiles)**：更大的图块意味着 shader core 可以处理更多**空间上不重叠**的像素，减少了对有依赖关系的重叠 Warp 的依赖，从而提高了核心利用率。
        

### 陷阱 3: 着色器核心单元吞吐量 (Throughput)

*   **硬件事实 (Valhall 架构, Mali-G77+):**
    
    *   **纹理采样 (Texture Sampling) 的速度是图块内存访问 (Tile Memory Access) 的 2 倍**。
        
    *   Subpass 优化是将“纹理读取”替换为“图块内存读取”。如果你的着色器非常简单，并且瓶颈在图块内存访问上，那么使用 Subpass 反而可能更慢。 (不过这在真实内容中不常见)
        

### 陷阱 4: 着色器核心缓存 (Cache)

*   **问题:** 合并后的 Subpass 意味着每个 Tile 在处理时需要循环处理**更多的资源** (更多的着色器代码、Buffer、纹理)。
    
*   **后果:** 这增加了**着色器核心缓存 (Shader Core Caches) 的压力**，在资源压力大时可能导致**缓存抖动 (Cache Thrashing)**，降低性能。
    

### 陷阱 5: 着色器核心优化失效

Mali GPU 有两项重要的工作跳过优化：

1.  **空图块剔除 (Empty Tile Elimination):** 如果一个 Tile 没有任何几何体，GPU 会跳过它 (包括 `loadOp=LOAD` 的回读)。
    
2.  **事务剔除 (Transaction Elimination):** 如果 `COLOR0` 附件的内容没有变化，GPU 会跳过 `storeOp=STORE` 的写回操作。
    

*   **Subpass 如何破坏它们:**
    
    *   **破坏"空图块剔除":** 假设 Subpass 0 只渲染了部分屏幕，Subpass 1 是一个全屏四边形 (如延迟光照)。两者合并后，硬件认为**每个 Tile 都有几何体** (来自 Subpass 1)，导致 **"空图块剔除" 失效**。Subpass 0 必须在所有 Tile 上执行（包括执行 `loadOp`）。
        
    *   **破坏"事务剔除":** 该优化**只在 `COLOR0` 附件上生效**。如果你的 Subpass 将中间结果（如 G-Buffer）放在了 `COLOR0`，而将最终的屏幕输出重映射到了 `COLOR1`，那么**最终输出就无法享受 "事务剔除" 优化**。
        

* * *

## 4\. 🚀 The Future (现代替代方案)

Vulkan 正在**抛弃 Subpass 抽象**，转向更现代、更明确的方案。

### 核心方向：动态渲染 (Dynamic Rendering)

*   **Vulkan 1.4** 引入了 `VK_KHR_dynamic_rendering`，它**不再有 Render Pass 和 Subpass 对象**。
    
*   但这不意味着放弃 Tile Memory 优化。
    

### 新机制：显式的着色器访问 (Explicit Shader Access)

*   通过新的扩展，允许着色器**在程序中显式地**读写 Tile Memory (帧缓冲附件)。
    
*   **关键扩展 (现已成为 Vulkan 1.4 核心):**
    
    *   `VK_KHR_dynamic_rendering_local_read` (**DRLR**)
        
*   **其他相关扩展:**
    
    *   `VK_EXT_rasterization_order_attachment_access`: 在 Vulkan 1.0 风格的 Render Pass 中提供显式访问。
        
    *   `VK_EXT_shader_tile_image`: **已被 DRLR 取代**，如果 DRLR 可用，应优先使用。
        

### 新方案的优缺点

*   **优点:**
    
    *   **解决了 "The Bad" (不可预测性)**。这些扩展**保证**会映射到 Tile Memory，行为是明确的，不再是"实现定义"。
        
*   **缺点:**
    
    *   **没有解决 "The Ugly" (性能陷阱)**。它们使用的仍然是**相同的底层硬件**，因此由硬件调度 (陷阱 1、2)、功能单元吞吐量 (陷阱 3)、缓存 (陷阱 4) 和硬件优化 (陷阱 5) 引起的所有性能问题**依然存在**。
        

* * *

## 5\. 📋 总结：行动指南

1.  **核心价值:** Subpass (或 DRLR) 的主要好处是**降低带宽**，从而**提高能效、省电、降温**。不要首先期望它能提高时钟性能。
    
2.  **性能权衡:** 这种带宽节省可能（尤其是在旧设备上）以**时钟性能下降**为代价。
    
3.  **务必 Profile:** **始终使用 `Arm Streamline` 等工具进行性能分析**。
    
    *   检查 `Mali Timeline` 跟踪，看 API Render Pass 是否真的被合并成了更少的硬件 Render Pass。
        
    *   对比 Subpass 版本和非 Subpass 版本的性能和带宽数据。
        
4.  **拥抱未来:** 如果条件允许 (Vulkan 1.4+ 或驱动支持)，**优先使用 `VK_KHR_dynamic_rendering_local_read` (DRLR)**，因为它解决了 Subpass 的**不确定性**问题。但要牢记，底层的性能陷阱依然适用。
    
5.  **检查支持:** 在使用 Subpass 前，使用 `VK_EXT_subpass_merge_feedback` 检查设备是否真的支持合并。

---

