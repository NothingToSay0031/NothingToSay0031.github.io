---
title: 五种禁用Early-ZS与HSR的常见模式
date: 2025-07-29 12:14:45
description: 识别并规避性能陷阱.
---

# 五种禁用GPU早期优化（Early-ZS & HSR）的常见模式

对于游戏开发者和图形程序员而言，充分压榨GPU的每一分性能是永恒的追求。在现代GPU渲染管线中，**Early-Z**（早期深度测试）和 **HSR**（Hidden Surface Removal，隐藏面消除）是两大“免费”的性能提升利器。它们能够在片元着色器（Fragment Shader）执行前，就剔除掉那些最终不可见的像素，从而节省大量的计算和带宽资源。

然而，一些看似无害的着色器操作，却可能在不经意间“关闭”这些强大的优化，导致GPU做了大量无用功，帧率大跌。本文将剖析五种常见的、可能禁用Early-ZS和HSR的操作，帮助你识别并规避这些性能陷阱。

## 什么是Early-ZS和HSR？为何如此重要？

在深入探讨问题之前，我们先快速回顾一下这两个核心概念：

*   **Early-ZS (Early Z/Stencil Test)**：传统的深度和模板测试（Late-ZS）发生在片元着色器之后。而Early-ZS则是一种优化，它将深度/模板测试提前到片元着色器之前。如果一个片元（像素）在深度测试中被遮挡（例如，它在一面墙的后面），GPU就会直接抛弃它，不再为其执行昂贵的着色器代码。
    
*   **HSR (Hidden Surface Removal)**：这是现代移动GPU（尤其是基于Tile-Based Deferred Rendering, TBDR架构的，如Arm Mali系列）的一项关键技术。HSR能够在光栅化阶段，高效地分析一个渲染区块（Tile）内的所有图元，只保留最顶层的、最终可见的片元送入渲染管线，从源头上就避免了大量被遮挡像素的产生。这比Early-Z更为高效，因为它在更早的阶段就完成了隐藏面消除。

简而言之，Early-ZS和HSR的目标都是同一个：让片元着色器只为最终显示在屏幕上的像素工作。一旦它们被禁用，GPU就不得不回到“先计算，再判断”的低效模式，造成严重的性能浪费，即所谓的“Overdraw”（过度绘制）。

## Early-ZS和HSR的“杀手”

现在，让我们来看看是哪些操作会成为这些优化的“杀手”。

### 在着色器中使用`discard`语句

`discard`（在HLSL中是`clip()`) 允许着色器动态地抛弃当前片元。这在实现一些特殊效果，如镂空材质时非常有用。但它的代价是巨大的。

影响：

*   **强制Late-ZS Update，可能禁用Early-ZS Test**
    
*   **通常会禁用HSR**
    

原因剖析： GPU的Early-ZS单元需要在一个片元进入着色器之前，就“确定”它是否会被写入深度缓冲。但当着色器中存在`discard`时，这个决定变得不确定——只有执行完着色器代码，GPU才知道这个片元是否被抛弃。

为了保证渲染结果的正确性，GPU必须采取保守策略：先执行片元着色器，然后再根据其结果（是否被discard）来决定是否更新深度/模板缓冲。这就强制了Late-ZS Update（晚期深度更新）。

虽然在某些架构上，如果深度写入被关闭，Early-ZS _Test_ 可能仍然可以剔除一部分片元。但更重要的是，对于依赖确定性来消除隐藏面的HSR来说，`discard`带来的不确定性是致命的，通常会导致HSR被完全禁用。

> **注意**：一些操作只禁用Early-ZS _Update_，但仍然可以从Early-ZS _Test_ 中受益。这意味着GPU可以先进行一次早期深度测试来剔除部分片元，但对于通过测试的片元，其深度值的最终写入仍需等待着色器执行完毕。

### 在着色器中写入`gl_FragDepth`

手动修改片元的深度值（在GLSL中是`gl_FragDepth`，HLSL中是`SV_Depth`）是实现某些高级渲染技巧（如深度偏移、自定义深度剔除）的手段。然而，这也是一个经典的性能陷阱。

影响：

*   **强制Late-ZS Test and Update**
    
*   **禁用HSR**
    

原因剖析： 这个原因非常直观。Early-ZS测试依赖的是光栅化后、进入着色器前的那个原始深度值。如果你在着色器内部修改了它，那么早期的测试结果就是无效的、错误的。

因此，一旦GPU检测到着色器会写入深度值，它就必须完全禁用Early-ZS，等待着色器执行完毕，拿到最终的`gl_FragDepth`值后，才能进行深度测试和更新（Late-ZS）。HSR同样因为无法在着色器执行前确定最终深度而被禁用。

### 在着色器中读取深度/模板缓冲

在某些后处理或高级效果中，我们可能需要读取当前像素位置已经存在的深度或模板值。

影响：

*   **强制Late-ZS Update**
    
*   **禁用HSR**
    

原因剖析： 现代GPU为了追求高并行度，片元着色器的执行顺序是不确定的。假设片元A和片元B覆盖同一个像素，A在前，B在后。如果B的着色器需要读取深度缓冲，它必须确保A（以及所有在A之前的、覆盖同一像素的片元）已经完成了深度写入。

这种依赖关系破坏了乱序执行的优化，迫使GPU在处理B之前，必须等待A的管线走完（至少是深度写入阶段）。这会产生严重的流水线“气泡”（stall），并强制深度更新必须在着色器之后进行，从而禁用了Early-ZS Update和HSR。

### 从帧缓冲或PLS中读取颜色

与读取深度类似，在片元着色器中读取当前像素的颜色值（Framebuffer Fetch）或像素本地存储（Pixel Local Storage, PLS），也会对HSR造成影响。

影响：

*   **禁用HSR**
    

原因剖析： Framebuffer Fetch 和 PLS 通常用于实现可编程混合、延迟渲染的特定阶段等高级技术。这些操作的共同点是，当前片元的计算依赖于“先前”在同一像素位置上写入的数据。

HSR的核心思想是在所有着色器运行前，就确定谁是最终的胜利者。但如果一个着色器需要读取之前片元留下的颜色，HSR就无法预知这个读取操作会如何影响最终的输出。它无法安全地“优化掉”任何可能被读取的片元，因此不得不禁用自身，让所有重叠的片元都依次执行，以保证结果的正确性。

### 帧缓冲并非唯一输出目标

当片元着色器的写入目标不仅仅是颜色缓冲（Render Target）时，例如，向SSBO（Shader Storage Buffer Object）或UAV（Unordered Access View）写入数据时，情况会变得复杂。

影响：

*   **默认使用Late-ZS Test and Update，从而禁用Early-ZS**
    
*   **禁用HSR**
    

原因剖析： 根据图形API（如OpenGL/DirectX）的规范，深度测试应该在片元着色器之后。这意味着，即使一个片元最终因为深度测试失败而被丢弃，它的着色器也“应该”已经执行了。

当着色器只写颜色缓冲时，深度测试失败后不写入颜色即可，对外部没有其他影响，因此GPU可以安全地进行Early-ZS优化。但如果着色器还向SSBO/UAV写入数据，情况就变了。如果因为Early-ZS而提前抛弃了片元，那么本应发生的SSBO/UAV写入操作就没有发生，这改变了程序的可观测行为，是不可接受的。

为了保证即使深度测试失败的片元也能执行其内存写操作，GPU默认会禁用Early-ZS。

**如何自救？** 幸运的是，现代图形API为此提供了“后悔药”。开发者可以通过在着色器中显式声明来“承诺”GPU，即使因为Early-ZS导致某些片元的写操作被跳过，自己也能接受这个结果。

*   GLSL/Vulkan: 使用 `layout(early_fragment_tests) in;`
    
*   HLSL/DirectX: 使用 `[earlydepthstencil]` 属性
    

加上这些声明后，GPU就可以在有SSBO/UAV写入的情况下，重新启用Early-ZS Test。但这需要开发者自己来保证逻辑的正确性。

## 总结与建议

| 操作 | 影响 | 核心原因 |
| --- | --- | --- |
| 使用discard | 强制Late-ZS Update，禁用HSR | 破坏了深度写入的确定性。 |
| 写入gl_FragDepth | 强制Late-ZS Test & Update，禁用HSR | 早期深度值无效，必须等待新值。 |
| 读取深度/模板缓冲 | 强制Late-ZS Update，禁用HSR | 引入对前序片元的依赖，破坏并行性。 |
| 读取颜色/PLS | 禁用HSR | HSR无法预知读取操作，不能安全剔除。 |
| 写SSBO/UAV | 禁用Early-ZS & HSR | 为保证失败片元的副作用能被执行。 |


优化建议：

1.  **谨慎使用`discard`**：尽可能用Alpha Blending或其他方式替代。如果必须使用，确保使用了该材质的物体在场景中占比尽可能小。
    
2.  **避免修改`gl_FragDepth`**：绝大多数情况下，应让GPU自动处理深度。
    
3.  **重新思考数据流**：如果需要读取深度/颜色，考虑是否能将渲染过程拆分为多个Pass，将读取操作放在一个独立的、不依赖Early-ZS的后处理Pass中。
    
4.  **善用`early_fragment_tests`**：当你向SSBO/UAV写入，且不关心被遮挡片元的写入是否执行时，请明确告诉GPU，让它放心地去优化。
    
5.  **利用性能分析工具**：使用如Arm Mobile Studio、RenderDoc、PIX等工具，检查你的应用的Overdraw率和Late-ZS率，定位是哪个绘制调用（Draw Call）或着色器导致了性能问题。
    
理解并遵循这些最佳实践，将帮助你充分利用现代GPU的硬件优化能力，打造出更加流畅、高效的图形应用。

## Reference

- [Arm Mali GPU Training Series Ep 2.6 : Shaders best practices](https://youtu.be/KCL9xiN_UbM?si=ibPs-qXg6YWfjnsI&t=509)

- [Early Z-test / depth-test in DirectX 11](https://stackoverflow.com/questions/17898738/early-z-test-depth-test-in-directx-11)