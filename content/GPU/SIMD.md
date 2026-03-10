---
title: "SIMD in the GPU world"
date: 2026-03-10 07:55:58
---

# SIMD in the GPU world

[SIMD in the GPU world – RasterGrid | Software Consultancy](https://www.rastergrid.com/blog/gpu-tech/2022/02/simd-in-the-gpu-world/)

## 概述与范围

现代处理器（尤其是 GPU）的高计算吞吐量，很大程度上归功于 **SIMD 范式** 的巧妙应用。GPU 的性能、芯片面积效率和能耗效率，都与 SIMD 指令发射方案密切相关。本文聚焦于 SIMD 范式的各种用法 **对开发者编写高效代码的直接影响**，而非处理器硬件设计的底层细节（如超标量架构、发射端口、寄存器文件、bank冲突等）。

---

## 什么是 SIMD？

- 源自 **Flynn 分类法**（Flynn's Classification）
- **SIMD** = **Single Instruction, Multiple Data**（单指令，多数据）
- 对比 **SISD** = Single Instruction, Single Data（传统冯·诺依曼架构）
- 核心思想：利用 **数据级并行性**（Data-Level Parallelism），用一条指令同时对多个数据元素执行相同操作

**从芯片设计角度看：** SIMD 允许 **复用单个指令调度器**（Instruction Scheduler）驱动多个处理单元。这意味着相同的晶体管数量下，相比传统标量核心（每个调度器对应一个处理单元），可以获得 **更高的计算吞吐量** 和更优的芯片面积利用率。

> SIMD 不是 GPU 专属——CPU 也有悠久的 SIMD 历史：**MMX、SSE、NEON、AVX** 等指令集都是 SIMD 的应用。

---

## 向量 SIMD（Vector SIMD）

### 为什么 GPU 天然适合向量 SIMD

3D 图形工作负载天然充满向量运算：

- **几何变换**：位置、法线、纹理坐标的线性变换，涉及 **向量-矩阵乘法**，本质是多个 **点积（dot product）** 运算，通常在 **4 分量齐次坐标** 上进行
- **光照计算**：颜色（RGB/RGBA）和方向向量（法线、光方向、反射方向等）的 3 分量或 4 分量向量运算

因此 GPU 从早期就使用 SIMD 单元实现向量指令，最早的可编程着色器也使用操作 **4 分量向量** 的汇编风格着色语言。

### 数据模型

- 原子数据单元：**4 分量浮点向量**
- 假设 IEEE 754 单精度（32位），向量寄存器宽度 = **128 位**
- 这种形式也叫 **Packed-SIMD** 或 **SWAR**（SIMD Within A Register，寄存器内 SIMD）

### 两个关键指令

1. **MAD（Multiply-Add）/ MAC（Multiply-Accumulate）**
   - 几乎所有 GPU 都作为单条指令支持
   - 图形和多媒体负载中充满 **缩放加偏移（scale-and-bias）** 操作
   - 在传统 4 分量向量 GPU 上，一条指令完成 **4 次浮点乘法 + 4 次浮点加法**
   - 浮点 MAD/MAC 常被用作衡量 GPU **指令吞吐量** 的单位

2. **点积指令（DP4、DP3 等）**
   - 计算两个向量的 **标量积（点积）**
   - 本质由 MAD/MAC 运算组成，在向量 SIMD 处理器上同样"廉价"
   - 变换和光照计算大量使用点积，因此向量 SIMD 处理器从 **吞吐量和延迟** 两方面都大幅受益
   - DP4 的标量结果通常会 **复制到目标向量寄存器的所有通道**

> 由于运算时间由乘法主导，MAD 和 DP4 两种操作可以在 **相当的延迟** 内完成。

### 两个关键技术

1. **分量重排（Component Swizzling）**
   - 能够将源操作数的各个分量 **重定向** 到各个处理单元
   - 也能将输出分量重定向到目标的不同分量
   - 典型实现还支持 **常量重排**，用 `0.0`、`1.0`、`2.0`、`0.5` 等常用值替换对应分量

2. **分量掩码（Component Masking）**
   - 能够 **丢弃** 个别输出分量（等效于禁用个别处理单元）

> 这两个技术可以 **显著减少指令数量**，因为它们消除了大部分 move 指令的需求。

---

## 从向量到标量（From Vector to Scalar）

### 向量架构的瓶颈

随着 GPU 工作负载演变，着色器中 **标量操作** 越来越多，传统向量 GPU 难以达到理论计算吞吐量。在向量处理器上执行标量操作，意味着执行一条向量指令但 **除一个分量外全部被掩码**——巨大的浪费。

虽然有时可以将多个独立标量操作合并为一条向量指令（如四个独立的标量加法合并为一个向量加法），但通常 **很难找到足够多同类型的独立标量操作**。尽管如此，针对向量 GPU 或 packed-SIMD 指令集时，**手动向量化** 仍然是强烈推荐的，因为开发者通常能比优化编译器做得更好。

### VLIW 架构

**VLIW** = **Very Long Instruction Word**（超长指令字）

- 使用复合指令，一条指令编码 **多个并行执行的操作**
- 一些 GPU 使用 **3+1 结构**：
  - 前 3 个分量执行一种操作（对应 RGB 或 3 分量向量运算）
  - 第 4 个分量执行另一种操作（对应 Alpha 通道或独立标量运算）
- **超越函数**（三角函数、对数等）和特殊运算（除法、平方根）通常只在第 4 个处理单元上实现，该单元称为 **超越函数单元（Transcendental Unit）**

#### VLIW 的优势

- 几乎任何操作组合都可以合并为一条 VLIW 指令，覆盖处理块的整个宽度
- 每个分量（或分量组）的操作可以 **独立变化**，不仅数据不同，操作本身也可以不同

#### VLIW 的限制

- 操作一般必须 **相互独立**（无数据依赖），否则仍会有处理单元闲置
- 除非指令集支持跨操作寻址不同寄存器，否则可能需要额外的 **move 操作**
- 异构指令集导致 **指令解码器和调度器复杂度高**，削弱了单调度器驱动多处理单元的芯片面积优势

### 全标量指令集

- AMD 的 **GCN（Graphics Core Next）** 架构是典型代表，也是开发者社区中最知名的 GPU ISA
- 使用简单的 **标量指令集** 降低调度器复杂度
- 代价：即使是基本的点积也需要 **多条 MAD/MAC 指令**

> **关键编程启示：** 在这一范式演变中，开发者应尽量使用 **标量操作**，只在计算的自然粒度确实是向量时才使用向量运算。

---

## SIMT（Single Instruction, Multiple Threads）

### 核心概念

**SIMT** 是 SIMD 范式的另一种利用方式——**数组处理**（Array Processing），与向量处理（Vector Processing）形成对比。

```c
// SISD：逐元素乘法
void array_mul_sisd(float* C, float* A, float* B, size_t size) {
    for (size_t i = 0; i < size; ++i)
        C[i] = A[i] * B[i];
}

// SIMD 数组处理（x86 SSE，4-wide）
#define FLT4(X) *((__m128*)(&(X)))
void array_mul_simd4(float* C, float* A, float* B, size_t size) {
    for (size_t i = 0; i < size; i += 4)
        FLT4(C[i]) = _mm_mul_ps(FLT4(A[i]), FLT4(B[i]));
}
```

即使每个数组元素的工作本质是标量的，SIMD 指令也能 **并行处理多个数组元素**。

> **注意：** SIMT 中的 "Threads" 并非操作系统中可独立调度的线程，而是 NVIDIA CUDA 中的 "线程" 概念——即 **Wave 中的各个 Lane**。这在命名上有些误导。

### GPU 的大规模并行本质

GPU 工作负载的大规模并行并非来自单个着色器调用内部的并行，而是来自 **同一份着色器代码在大量数据元素（顶点、图元、片段等）上的重复执行**。

- 忽略控制流的情况下，可以通过 **加宽 SIMD 单元** 来并行处理多个着色器调用
- 理论上 SIMD 宽度可以扩展到整个处理器
- 这允许 **单个指令调度器驱动更多处理单元**

### 关键术语

| 术语 | 含义 |
|------|------|
| **Subgroup / Wave / Wavefront / Warp** | 在 SIMD 块上同时调度的一组着色器调用 |
| **Lane / Thread** | Wave 内的单个着色器调用 |

### GCN 架构中的"标量"与"向量"辨析

- 从 **单个着色器调用** 的角度看，GCN 指令是 **标量的**
- 但 AMD 称之为 **向量指令（Vector Instructions）**，因为实际上它们对 **整个 Wave 执行宽向量操作**，每个分量属于一个着色器调用
- GCN 上的 **标量单元（Scalar Unit）** 实际上更像一个 **SISD 执行单元**，在整个 Wave 间共享

---

## SIMD 控制流（SIMD Control Flow）

### 基本问题

在 SIMD 单元并行处理多个着色器调用时，如何实现 **控制流（分支）**？

### 早期方案：无真正分支——谓词/条件指令

- 没有跳转指令，循环由编译器 **展开**
- 条件由 **谓词/条件指令（Predicated/Conditional Instructions）** 实现
- 对于 if-else 块：**两个分支都执行**，然后用条件指令（如 `CMOV`）选择正确结果

```glsl
// GLSL 伪代码
if (!inShadow) {
    light = max(0.0, dot(L, N));
    color *= light;
}
```

```
// 对应的假想指令
DP3 R1.x, L.xyz, N.xyz;
MAX R1.x, R1.x, R0.0;
MUL R1.xyz, COL.xyz, R1.xxx;
CMOV COL.xyz, COL.xyz, R1.xyz, SHD.x;
```

**代价：** 所有分支都必须对所有着色器调用执行——这是"着色器中应避免条件分支"这条古老建议的来源（尽管这条建议已远远超出了它最初适用的 GPU 时代）。

### 改进：指令级谓词（Instruction Predication）

- 通过类似 **AVX-512 掩码寄存器** 的特殊寄存器，对几乎每条指令进行谓词控制
- 虽然不能跳过分支，但至少 **节省了未执行分支的功耗**
- 使用 **栈** 或 **固定数量的备份寄存器** 处理嵌套条件

> 没有分支指令的情况下，即使 Wave 中所有着色器调用都不走某个分支，也 **无法跳过该分支** 的指令。

### 现代方案：真正的分支指令

- 较新 GPU 引入了 **实际的分支指令**（跳转或结构化的）
- 但 GPU 以整个 Wave 为单位调度执行，因此 **只有当 Wave 内所有着色器调用走同一路径时，才能跳过代码**

### 发散（Divergence）问题

当 Wave 内不同着色器调用走不同路径时，称为 **发散 Wave（Divergent Wave）**：

- if-else 块：**两个分支都执行**
- 循环：所有着色器调用都要执行 **最多迭代次数** 的那个调用的循环次数

**三种条件类型：**

| 类型 | 描述 | GPU 行为 |
|------|------|---------|
| **编译期已知均匀表达式** | 编译时即知条件对所有 Lane 相同 | 只需分支指令，无需掩码 |
| **动态均匀表达式** | 运行时恰好所有 Lane 值相同 | 可跳过未走的分支，但编译器仍需生成掩码代码（因编译时不确定） |
| **发散表达式** | Lane 间值不同 | 必须执行两侧分支 + 谓词掩码 |

> **关键编程启示：** 即使现代 GPU 控制流开销不大，**动态均匀控制流**（Dynamically Uniform Control Flow）仍然强烈优于发散控制流。

---

## 跨 Lane 操作（Cross-Lane Operations）

- 类似于 **分量重排（Swizzling）** 从向量 SIMD 扩展到 SIMT 模型
- 数据在 **Wave 内的着色器调用之间** 进行交换
- 这是近年来着色器语言中 **最热门的特性之一**（即 **Subgroup Operations**）

### 优势

- 相比通过 **共享内存（Shared Memory）** 在 Workgroup 范围内交换数据，跨 Lane 操作 **性能显著更高**
- 着色器调用可以 **直接引用同一 Wave 内其他调用的寄存器数据**
- 实现相对简单——同一 SIMD 单元上所有着色器调用的寄存器 **位于同一寄存器文件中**

---

## 时间 SIMT 与时空 SIMT（Temporal & Spatio-Temporal SIMT）

### 时间 SIMT（Temporal SIMT）

- 指令调度器对同一条指令 **发射多次**，但针对不同的着色器调用组
- 不增加 SIMD 块的物理宽度，却 **提高指令级并行性**
- 类似 x86 的 `REP` 前缀操作（但类比不太精确）

**GCN 架构实例：**
- 一个完整的 **64-wide Wave** 的指令被发射到 **16-wide SIMD 块**
- 分 **4 个周期** 完成，每周期处理 16 个 Lane
- 这允许 **隐藏指令解码和/或执行的延迟**

> **注意区分：** 时间 SIMT ≠ **同时多线程（SMT）**。SMT 是在一个 Wave 等待长延迟操作（如内存读取）时调度其他 Wave 的指令。

### 纯时间 SIMT（无宽执行单元）

- 每个着色器调用在 **独立的周期** 中发射
- 潜在优势：可以 **跳过被谓词禁用的着色器调用**，消除发散开销
- 潜在劣势：减少了一个并行维度，**限制了延迟隐藏能力**，Wave 完成总时间增加

### 单调度器驱动多 SIMD 块

- **多个独立的 SIMD 块** 共享 **一个指令调度器**
- 独立 SIMD 块有 **独立的寄存器文件**，因此简单的跨 Lane 操作 **不能跨 SIMD 块使用**
- 有时发射粒度可能 **大于单个 Wave 的大小**

**GCN 架构实例：**
- 每个调度器下有 **4 个 16-wide SIMD 块**
- 一个 64-wide Wave 的指令在 **一个** SIMD 块上分 4 个周期执行
- 调度器 **每个周期可以从不同的 Wave 发射指令**
- 因此 4 个周期内可以向 **全部 4 个 SIMD 块** 分别发送不同 Wave 的指令

---

## 多范式组合（Multi-Paradigm Combinations）

上述各种 SIMD 技术 **并非互斥**，可以自由组合：

### 组合示例

1. **向量/VLIW + SIMT**
   - 向量或 VLIW GPU 同样利用 SIMT 模型
   - 仅靠 4-wide 的向量 SIMD 远远不足以达到 GPU 级别的计算吞吐量

2. **标量指令集 + Packed-SIMD（多精度支持）**
   - 某些 SIMT GPU 支持多种操作数精度（如 16 位和 32 位浮点）
   - 对于低精度操作，即使是标量指令集的 GPU 也可能采用 **packed-SIMD** 方式
   - 因为寄存器宽度固定（如 32 位），一个 32 位寄存器可以容纳 **两个 16 位值**，从而在低精度运算时获得 **双倍吞吐量**

---

## 总结与编程启示

### 核心要点

1. **所有现代 GPU 架构都使用 SIMT 执行模型**——这是跨厂商的共性
2. 具体的指令集选择（向量、VLIW、标量或混合）**因架构而异**
3. 现代 GPU 可能支持 **在不同发射模式间切换**（如向量 vs 标量，或不同 Wave 宽度）
4. 指令集与处理器实际调度执行操作的方式可以是 **相当正交的**
5. 着色器代码到指令集的映射隐藏在 **硬件厂商的编译器基础设施** 之后，仅凭架构的高层信息可能得出错误结论

### 对开发者的关键建议

- **理解 SIMT 模型**：代码在 Wave/Warp 粒度执行
- **避免 Wave 内发散**：尽量使控制流动态均匀
- **利用跨 Lane 操作**（Subgroup Operations）进行高效数据共享
- **标量 vs 向量**：根据目标架构选择合适的计算粒度
- **低精度优化**：利用 packed-SIMD 特性，fp16 可能获得双倍吞吐
- **各架构有共性**，但针对特定硬件总能找到额外的性能优化空间

## Reference
- [ATI Radeon HD 2000 programming guide](https://developer.amd.com/wordpress/media/2012/10/ATI_Radeon_HD_2000_programming_guide1.pdf)
- [AMD Accelerated Parallel Processing – OpenCL Programming Guide](http://developer.amd.com/wordpress/media/2013/07/AMD_Accelerated_Parallel_Processing_OpenCL_Programming_Guide-rev-2.7.pdf)
- [The AMD GCN Architecture – A Crash Course](https://www.slideshare.net/DevCentralAMD/gs4106-the-amd-gcn-architecture-a-crash-course-by-layla-mah)
- [AMD GCN Architecture Whitepaper](https://www.techpowerup.com/gpu-specs/docs/amd-gcn1-architecture.pdf)
- [AMD GCN Gen1 Instruction Set Architecture](https://developer.amd.com/wordpress/media/2012/12/AMD_Southern_Islands_Instruction_Set_Architecture.pdf)
- [AMD GCN Gen2 Instruction Set Architecture](http://developer.amd.com/wordpress/media/2013/07/AMD_Sea_Islands_Instruction_Set_Architecture.pdf)
- [AMD GCN Gen3 Instruction Set Architecture](http://developer.amd.com/wordpress/media/2013/12/AMD_GCN3_Instruction_Set_Architecture_rev1.1.pdf)
- [AMD Vega Instruction Set Architecture](https://developer.amd.com/wp-content/resources/Vega_Shader_ISA_28July2017.pdf)
- [AMD RDNA Architecture Whitepaper](https://www.amd.com/system/files/documents/rdna-whitepaper.pdf)
- [AMD RDNA 1 Instruction Set Architecture](https://developer.amd.com/wp-content/resources/RDNA_Shader_ISA.pdf)
- [AMD RDNA 2 Instruction Set Architecture](https://developer.amd.com/wp-content/resources/RDNA2_Shader_ISA_November2020.pdf)
- [NVIDIA Kepler Architecture Whitepaper](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/NVIDIA-Kepler-GK110-GK210-Architecture-Whitepaper.pdf)
- [NVIDIA Maxwell Architecture Whitepaper](https://www.microway.com/download/whitepaper/NVIDIA_Maxwell_GM204_Architecture_Whitepaper.pdf)
- [NVIDIA Pascal Architecture Whitepaper](https://images.nvidia.com/content/pdf/tesla/whitepaper/pascal-architecture-whitepaper.pdf)
- [NVIDIA Volta Architecture Whitepaper](https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf)
- [NVIDIA Turing Architecture Whitepaper](https://images.nvidia.com/aem-dam/Solutions/design-visualization/technologies/turing-architecture/NVIDIA-Turing-Architecture-Whitepaper.pdf)
- [NVIDIA Ampere Architecture Whitepaper](https://www.nvidia.com/content/PDF/nvidia-ampere-ga-102-gpu-architecture-whitepaper-v2.pdf)