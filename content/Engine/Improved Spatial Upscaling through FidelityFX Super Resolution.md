---
title: "Improved Spatial Upscaling through FidelityFX Super Resolution for Real-Time Game Engines"
date: 2026-03-26 19:33:58
---


# FidelityFX Super Resolution 1.0：空间升采样算法与引擎集成

[Improved Spatial Upscaling through FidelityFX Super Resolution for Real-Time Game Engines - YouTube](https://www.youtube.com/watch?v=aKyjQPq5aUU)


## FSR 1.0 设计目标

- 提供一个适配 **动态分辨率缩放（DRS, Dynamic Resolution Scaling）** 的升采样框架，意味着缩放比例可以 **逐帧变化**
- 通过降低渲染分辨率来 **减少每帧渲染开销**
- 关键设计约束：
  - **易于集成** ，可移植到几乎所有平台
  - **不引入任何时域伪影（Temporal Artifacts）** ——如果前端抗锯齿本身不产生时域伪影，FSR 也绝不能引入新的
- 算法聚焦于 **纯空间升采样（Spatial Upscaling）** 和 **空间锐化（Spatial Sharpening）**
- 核心目标：消除传统重采样在边缘上产生的 **重采样伪影（Resampling Artifacts）** ，让边缘看起来接近原生分辨率，但 **不引入源图像中不存在的新边缘**
- 源码发布在 **GPUOpen** ，包含两个头文件：
  - **可移植性头文件（Portability Header）**
  - **算法头文件（Algorithm Header）** ，内含约 5 种算法

---

## EASU：边缘自适应空间升采样

### EASU 概述

**EASU（Edge Adaptive Spatial Upsampling）** 是 FSR 1.0 中的核心升采样算法。

- 此前方案是使用 **CAS（Contrast Adaptive Sharpening）** + GPU 硬件内置缩放（视觉上类似于水平和垂直方向的 **Lanczos** 滤波器）
- **Lanczos** 滤波器本质是一个 **sinc 函数**（理论上最优的重建滤波器），被另一个 sinc 函数做窗口截断，使其在计算上可行
- 为了超越硬件缩放，EASU 做了更具 **自适应性** 的设计：
  - **方向自适应（Directionally Adaptive）**
  - **长度自适应（Length Adaptive）**
  - **窗口自适应（Window Adaptive）**
- 最佳描述：**局部自适应的椭圆 Lanczos 类滤波器（Locally Adaptive Elliptical Lanczos-like Filter）**
- ⚠️ EASU **不是** 抗锯齿方案本身，它 **要求输入已经具有良好的抗锯齿质量**

### 固定 12-Tap 核窗口

- 使用最近的 **12 个采样点** ，排列成 **圆形模式（非规则网格，更像十字/加号模式）**
- 为什么是 12 而不是 16？
  - 12 个采样点的 32 位版本只需 **36 个寄存器**
  - EASU 需要在滤波前对 12 个采样点做分析，为了避免 **二次读取** ，所有采样值必须 **常驻寄存器**
  - 如果增加到 16 个，逻辑所需的临时寄存器会超出预算
  - 目标是保持在 **64 个寄存器以内** ——这是 AMD 硬件上能够有效 **隐藏延迟（Hide Latency）** 的良好上限
- 采样模式不是标准 4×4 网格，而是 **十字/加号模式** ，这样 XY/ZW 对可以高效打包，避免浪费角落采样点

### 分析阶段（Analysis）

#### 亮度近似

- 分析在 **亮度（Luma）** 空间中进行，使用简化近似：

$$\text{Luma} \approx R + G + B$$

- 不是精确的亮度计算，只是将所有通道合并以"不遗漏任何东西"

#### 方向估计（Edge Direction）

- 对中心 **2×2 四像素块** 周围的 **十字模式** 邻居进行分析
- 边缘方向使用 **中心差分（Central Difference）** 估计
- 中心差分 **会遗漏单像素特征** ，但这没关系——因为当特征长度非常小时，滤波核会退化为 **对称非方向性** 的，方向性无关紧要
- **不使用对角差分** ，原因：
  - 更昂贵
  - 需要处理半纹素偏移，逻辑更复杂

#### 特征长度估计（Feature Length）

- 使用水平方向和垂直方向上各 **3 个纹素** 的亮度梯度来估计
- **梯度反转（Reversal）** ：如"黑→白→黑"表示 **细小特征** ，需要小核
- **无反转** ：如"黑→白→白"表示 **大特征** ，可以使用更大的滤波核

#### Pass 合并优化

- 这个分析本质上是一种 **Pass 合并（Pass Merging）** ——分析也可以在前一个 Pass 中单独完成，但那样需要 **两次完整的显存读写** ，所以选择在 Shader 中 **重复少量计算** 来避免额外的显存访问

#### 分析结果插值

- 分析完成后，对 2×2 四个点的方向和长度结果做 **双线性插值** ，插值到实际要滤波的位置，用于塑造最终的滤波核

### 颜色空间考虑

- 大多数 AAA 游戏的边缘具有 **感知均匀的梯度（Perceptually Even Gradients）**
- 因此方向分析应在 **感知颜色空间（Perceptual Color Space）** 中进行（如 sRGB、Gamma 2.0、Gamma 2.2 等）
- 如果输入是线性空间，需要做 12 次线性→感知转换，开销太大
- **最佳实践** ：在 EASU 的 **前一个 Pass** 中完成线性→感知的转换
- 也可以在线性空间运行 EASU，但在某些内容上效果会 **打折扣**
- 折中：在感知空间中运行所有滤波操作，实践中这通常是可接受的

### 采样优化（硬件层面）

- 支持 **Packed 16-bit 操作** 的硬件（如 Vega、Navi、PS4 Pro、PS5）可以获得优势：
  - **两个 16-bit 操作等于一个 32-bit 操作的成本**
  - 节省寄存器空间
- AMD 硬件还支持：
  - **A16 修饰符** ：向量内存操作的打包参数，X 和 Y 坐标存放在同一个寄存器中
  - **D16 打包返回** ：纹理读取结果自动打包，无需后续打包操作
- 使用 **GatherFour** ：可以一次拉取所有红色（或其他单通道）值到两个 32-bit 寄存器中，便于 **SOA（Structure of Array）** 形式的高效打包计算

### 滤波核塑形（Kernel Shaping）

分析完成后，用方向和长度信息来塑造最终的滤波核：

- **旋转** ：用方向（direction）旋转滤波核
- **缩放** ：用长度（length）控制旋转后的核在 X、Y 轴上的缩放
- **窗口调整** ：用长度调整核的窗口大小

#### X 轴缩放

- 从 **无缩放** 到 $\sqrt{2}$
- 轴对齐时不缩放；对角线方向时缩放到 $\sqrt{2}$ ——因为对角线方向可以容忍更大的核而不产生条带伪影（由负瓣引起的 **banding** ）

#### Y 轴缩放

- 从 **无缩放** 到 **2 倍**
- 小特征：不缩放 → 小的对称核，不会采样到特征之外
- 大特征：更长的核 → 更好地恢复边缘

### 核函数本身：Lanczos(2) 的多项式近似

- **Lanczos 计算成本高** ：需要 sine、reciprocal、square root 等超越函数（transcendentals），在某些硬件上以 **1/4 甚至 1/8 速率** 运行
- EASU 使用 **多项式近似** 来替代，分解为 **基函数 + 窗口函数** ，类似 Lanczos 的"sinc 窗口化 sinc"结构
- 窗口自适应：
  - **小窗口** ：核范围 $\pm\sqrt{2}$ ，窗口截断了负瓣 → 减少锐化、减少振铃
  - **Y 轴核** ：范围 $\pm 2$ ，具有 **强负瓣** ，有助于恢复边缘

### 去振铃（De-ringing）

- EASU 滤波完成后进行 **去振铃步骤（De-ringing）**
- 取局部 **2×2 纹素块** 的 RGB **最小值和最大值**
- 用该范围 **钳制（Clamp）** EASU 输出
- 作用：
  - 消除所有 **振铃（Ringing）** 伪影
  - 消除 12-Tap 有限窗口在大缩放比例下产生的 **窗口截断伪影**
  - 缩放比例越大越建议启用此步骤

---

## Unity HDRP 中的引擎集成

### HDRP 简介

- **HDRP（High Definition Render Pipeline）** 是 Unity 的 AAA 级渲染管线
- 具备完整的后处理链、**物理基渲染（PBR）** 、光追等高级 GPU 算法
- 典型管线流程：
  - **前半段（光栅化）** ：输出 Motion Vectors、Normals、Depth、Color 等表面/纹理
  - **后半段（后处理）** ：消费这些表面，输出最终图像到 FrameBuffer

### 动态分辨率缩放（DRS）注入点

HDRP 中有 **两个 DRS 注入位置** ：

#### ① 后处理之前（Before Post-Processing）

- 在光栅化输出 Color/Depth/Motion Vectors/Normals 后立即升采样
- 升采样后再进入后处理链
- **缺点** ：后处理链以 **全分辨率** 运行，开销大（如高质量景深 DOF 常成为瓶颈）
- 典型例子：TAA 上采样、棋盘渲染

#### ② 后处理之后（After Post-Processing）—— FSR 的集成位置

- 后处理链以 **低分辨率** 运行
- 在最终输出前才做升采样
- **FSR 1.0 就集成在这个位置**
- 优势：后处理链也享受低分辨率的性能红利

### DRS 内存别名技术

#### 软件方式（Software-based）

- 适用于 DX11、Vulkan、Metal、GNM 等所有 HDRP 支持的平台
- **采样时** ：对 UV 在 X/Y 轴上应用缩放因子
- **光栅化时** ：设置一个小于完整目标的 **Viewport**
- Unity 在 Render Graph 中维护一个 **最大分辨率的 RenderTarget** ，在其中创建虚拟/软件视图
- ⚠️ UV 必须 **仔细钳制（Clamp）** ，双线性采样时不能触及角落像素

#### 硬件方式（Hardware-based）

- 仅限支持高级特性的 API 子集（如 DX12）
- 在 GPU 上分配一个 **大 Heap** ，根据当前所需分辨率按需放置 **Placed Resources** （DX12 术语）
- **优势** ：不需要乘法器或 Viewport，直接以原生分辨率处理，更快
- **劣势** ：每个分辨率都需要创建 **描述符（Descriptors）** ，CPU 端必须仔细回收描述符以避免内存膨胀和 CPU 性能开销

### FSR 处理链（在 HDRP 中）

完整流程：

1. **Uber Post Process** ：Bloom、Tone Mapping 之后的输出
2. **对输出取平方根** → 转换到 **感知空间（Perceptual Space）** （满足 EASU 对感知空间输入的需求）
3. **EASU** ：执行升采样
4. **回到线性空间**
5. **RCAS（Robust Contrast Adaptive Sharpening）** ：进一步提升边缘和细节

### Mip Bias 补分辨率光栅化时，屏幕空间导数（derivatives）变化导致纹理采样选择了 **更高的 Mip 级别** ，丢失细节
- 解决方案：对所有 **材质纹理** 施加 **负 Mip Bias**

$$\text{MipBias} = \log_2\left(\frac{\text{InputResolution}}{\text{OutputResolution}}\right)$$

- 因为输入分辨率 < 输出分辨率，所以得到一个 **负值** ，使纹理采样选择更精细的 Mip 级别
- 使用 `SampleLodBias` 函数（DX11 和 Vulkan 均支持）
- Unity 中 **材质纹理** 和 **系统纹理** 有清晰的区分，可以 **仅对材质纹理** 应用偏移

### 粒子与低分辨率透明物体

- Unity 有一个 **低分辨率透明渲染 Pass** ：以 **半分辨率** 配合 **下采样深度缓冲** 光栅化透明物体
- 若叠加 DRS，半分辨率会进一步缩小 → **质量严重下降**
- 解决方案：对低分辨率透明 Pass 的最小分辨率做 **下限钳制（Clamp）** ，并将控制权交给美术
- 低分辨率透明渲染本身的好处：为高开销、低占用率的着色（如折射等）释放更多 GPU 资源

### 性能数据

在 **PS4 Pro** 上运行 Spaceship Demo 场景，目标分辨率 **4K（2160p）** ：

| 算法 | 耗时 | 占用率（Wave Occupancy） | 备注 |
|---|---|---|---|
| **EASU** | **0.43 ms** | 4 waves | 非优化 FP32 路径 |
| **RCAS** | **0.16 ms** | 10 waves | 非优化 FP32 路径 |

- 总开销不到 0.6ms，且这还是未优化的 32 位浮点路径
- 集成过程中大部分工作 **并不困难** ，很多步骤相当 **直截了当**

---

## 核心要点总结

| 要点 | 说明 |
|---|---|
| **FSR 1.0 本质** | 纯空间升采样，无时域组件，不引入时域伪影 |
| **EASU 核心思想** | 局部自适应椭圆 Lanczos 类滤波器，根据边缘方向和特征长度动态调整核形状 |
| **12-Tap 限制** | 受寄存器预算（≤64 GPR）约束，避免二次显存访问 |
| **感知空间** | 分析和滤波在感知空间进行效果最好，线性→感知转换应在前置 Pass 完成 |
| **多项式近似** | 避免 Lanczos 中昂贵的超越函数，用多项式 + 自适应窗口替代 |
| **引擎集成关键** | 后处理之后注入、感知空间转换、Mip Bias 补偿、低分辨率透明钳制 |
