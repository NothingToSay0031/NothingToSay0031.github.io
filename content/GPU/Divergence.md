---
title: "GPU中的分支：性能、分化与独立线程调度"
date: 2025-11-11 15:33:58
math: true
---

# GPU中的`if/else`：性能、分化与独立线程调度

## 1. 基础：静态分支（编译期确定）

在深入探讨动态分支前，最简单的一种情况是**静态分支**。

- **核心观点:** 如果`if`的条件是**编译器常量**，那么根本不会产生任何分支指令。
    
- **具体场景:**
    
    - `#define` 宏
        
    - `const` 常量
        
    - `layout(constant_id=...)`
        
- **结果:** 编译器会直接在生成着色器代码时，只保留`if`或`else`中“获胜”的那一支代码，另一支则被完全丢弃。这是**最高性能**的情况。
  

## 2. `movc` (条件移动)

这是GPU处理简单`if/else`赋值时最常用、最高效的指令之一。

- **核心观点:** 对于简单的赋值`if/else`，GPU会将其转换成一条`movc` (Conditional Move) 指令，**并不会产生分支跳转**。
    
- **示例:**
    
    
    
    ```C++
    int a;
    if (b > 0)
        a = 4;
    else
        a = 5;
    ```
    
- **执行机制 (伪代码):**
    
    1. `a = 5;` (先执行`else`的赋值)
        
    2. `if (b > 0) a = 4;` (根据条件，**有条件地**用`true`分支的值覆盖`a`)
        
- **性能结论:**
    
    - 这本质上只是一条指令，开销极低。
        
    - 在这种情况下，使用 `step()` 之类的函数试图“优化”掉`if`，反而会引入更多ALU操作，是一种**负优化 (Pessimization)**。
      

## 3. `flatten` (分支扁平化)

当`if/else`中的逻辑比`movc`能处理的更复杂时，GPU可能会采用“扁平化”策略。

- **核心观点:** `flatten` 会**让所有线程完整地执行`if`和`else`两侧的所有代码**，最后再通过`movc`根据条件选择正确的结果。
    
- **执行机制:**
    
    1. **所有 Lanes:** 执行`true`分支的全部代码。
        
    2. **所有 Lanes:** 执行`false`分支的全部代码。
        
    3. **`movc`:** 根据原始条件，从两个结果中挑选一个。
        
- **性能结论:**
    
    - **优点:** 并行性好，所有lane都在工作，没有线程等待。
        
    - **缺点:** **总开销 = `true`分支开销 + `false`分支开销**。如果两侧分支都很重，开销会翻倍。
        
    - 此时使用 `step()` 优化通常也无效。
      

## 4. `branch` (动态分支与线程束分化)

这是传统意义上“真正的”分支，它会产生跳转，也是**线程束分化 (Wave Divergence)** 的根源。

- **核心概念: 程序计数器 (Program Counter, PC)**
    
    - 在**Volta架构之前** (Pascal及更早)，一个SM上的**整个Wave (NVIDIA称为Warp，32个lane) 共享1个PC**。
        
    - 这意味着一个Wave中的所有lane在同一时刻**必须**取相同的指令。
        
- **`branch` 执行机制 (当Wave内条件不同时):**
    
    1. **产生 `active mask` (活跃掩码):** GPU根据条件`b>0`生成一个掩码，标记哪些lane为`true`，哪些为`false`。
        
    2. **执行 `true` 分支:**
        
        - PC跳转到`true`分支代码。
            
        - `active mask` 为 `true` 的lane **执行**。
            
        - `active mask` 为 `false` 的lane **等待 (Idle)**。
            
    3. **执行 `false` 分支:**
        
        - PC跳转到`false`分支代码。
            
        - `active mask` 为 `false` 的lane **执行**。
            
        - `active mask` 为 `true` 的lane **等待 (Idle)**。
            
    4. **分支收敛 (Reconvergence):** PC跳转到`endif`之后，所有lane恢复执行。
        
- **`branch` vs `flatten` 的核心区别:**
    
    - **`flatten`:** 所有lane执行**两遍**代码，无等待。
        
    - **`branch`:** lane**只执行自己对应的分支**，但在另一分支执行时**必须等待**，导致GPU执行单元浪费。
        

### `[branch]` 属性使用指南

`[branch]` (HLSL) 或 `if (...)` (GLSL，无`flatten`标记) 是在暗示编译器优先使用动态分支。

- **适用场景 1: Uniform 变量**
    
    - 如果`if`的条件是**uniform**的 (即整个Wave都相同)，那么所有lane会一起跳转到`true`或`false`分支，**不会有任何分化**，开销极低。
        
- **适用场景 2: 非对称开销**
    
    - **最关键的场景:** 一侧分支开销极大 (如纹理采样)，另一侧开销极小。
        
    - **示例:** `if (b>0) { color = tex2D(...) } else { color = 0 }`
        
    - 如果用`flatten`，所有lane (即使是`b<=0`的) 都必须执行`tex2D`，造成巨大浪费。
        
    - 用`branch`，只有`b>0`的lane会执行`tex2D`，`b<=0`的lane只是等待，总开销远小于`flatten`。
        

### 关键陷阱：`tex2D` 与 梯度

- **问题:** 在`[branch]`中使用`tex2D` (或`Sample`) 会报错，如果`uv`在`if`内部计算。
    
- **原因:** `tex2D`需要从一个`quad` (2x2 像素组) 中获取相邻像素的`uv`来**计算梯度 (Derivatives)**，进而选择正确的**MIP Level**。
    
- **`branch`如何导致失败:**
    
    1. `[branch]` 导致线程束分化，`quad`中的4个像素可能跑到了不同的分支 (例如2个 `true`，2个 `false`)。
        
    2. 当`true`分支的lane执行`tex2D`时，`false`分支的lane正在等待，无法提供它们的`uv`信息。
        
    3. 梯度计算失败，`tex2D`无法确定MIP，因此报错。
        
- **解决方案:**
    
    1. **方案一 (推荐):** 把 `uv` 的计算提到 `[branch]` **之前**。这样编译器能确保梯度信息在分支前准备好。
        
    2. **方案二:** 使用 `tex2DLod` (`SampleLevel`) **手动指定MIP Level**，彻底绕过梯度计算。
        
## 5. 革命：NVIDIA Volta 架构与独立线程调度

Volta 及其后续架构 (Turing, Ampere等) 彻底改变了`branch`的底层逻辑。

- **核心变革:** 每个 SM 不再是 Wave 共享1个PC，而是**每个Lane (线程) 拥有各自独立的PC** 和调用栈。
    
- **新机制: 独立线程调度 (Independent Thread Scheduling)**
    
    - 当`if/else`分化时，`true`分支的lane和`false`分支的lane**不再是串行等待**。
        
    - 它们可以**并行执行 (interleaved execution)**。调度器 (Schedule Optimizer) 会智能地将`true`分支的指令和`false`分支的指令**交错发射**到ALU上，实现**互相掩盖延迟**。
        
    - 硬件会尝试自动将执行相同指令的lane重新组合 (reconverge) 以最大化 SIMT 效率。
        
- **关键澄清:**
    
    - **执行仍然是 SIMT (单指令多线程) 的**：在任何给定的时钟周期，CUDA 核心仍然像以前一样，对一个 Warp 中所有**活跃**的线程执行相同的指令，从而保留了以往架构的执行效率。
     
    - **独立调度的优势**：Volta 在 Warp 内独立调度线程的能力，使得以更自然的方式实现复杂的、细粒度的算法和数据结构成为可能。
    
    - **调度器优化:** 尽管调度器支持线程的独立执行，但它会**优化非同步代码**，以**尽可能地保持收敛**，从而实现最大的 SIMT 效率。
    
- **新的编程模型:**
    
    - **收敛不再是自动的:** 由于线程是独立调度的，在`if/else`块结束时，它们**不会自动同步**。
        
    - **`__syncwarp()` (Subgroup Barrier):** 如果你需要确保一个Wave中的所有线程都执行完`if/else`（或任何分化代码）后再继续，**必须显式插入 `__syncwarp()`** 来强制同步和收敛。

## Reference

[Volta Tuning Guide 13.0 documentation](https://docs.nvidia.com/cuda/volta-tuning-guide/index.html)

[Volta Architecture Whitepaper](https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf) 