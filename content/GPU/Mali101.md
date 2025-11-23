---
title: Mali 101
date: 2024-10-17 19:28:47
description: Mali 101 by Arm.
math: true
---

# Mali 101

[Arm Mali GPU Training Series Ep 2.1 : The Mali GPU family](https://www.youtube.com/watch?v=DO_68Hjs2UI&list=PLKjl7IFAwc4QUTejaX2vpIwXstbgf8Ik7&index=5)

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172028441.png)

# Mali GPU Essentials

## 1. **Introduction to Mali GPU Family**

- **Overview:**
    - The Mali GPU family has been around since 2006.
    - By volume, it is the most popular GPU in the market.
    - Over a billion GPUs were shipped last year.
    - Dominates in the mass market, especially in mid-range handsets.
    - Present in various consumer goods, including smart TVs and embedded systems.
    - High-end handsets feature a mix of GPUs, including Mali, iPhone, and Adreno.

## 2. **Best Practices for Game Developers**

- **Optimization Goals:**
    - Focus on broad optimization targets for those new to the field.
    - Importance of frame construction in a tile-based renderer:
        - Building the main skeleton of a frame (render passes, compute dispatches).
        - Understanding how data flows through memory, which significantly impacts power consumption.
- **Key Areas to Optimize:**
    - **API Usage:**
        - How to effectively drive Mali GPUs.
    - **Game Engine Considerations:**
        - Importance of good mesh and texture creation.
        - Proper configuration of texture usage.
    - **Shader Optimization:**
        - Strategies for writing efficient shaders tailored to Mali GPUs.

## 3. **Frame Construction in Tile-Based Renderers**

- **Core Concept:**
    - Tile-based rendering relies on strict render pass flow through tile memory.
    - Optimizing the use of tile memory can lead to significant performance gains.
- **Focus Areas:**
    - Efficient management of render passes.
    - Minimizing memory bandwidth usage to reduce power consumption.

## 4. **Low-Level API Best Practices**

- **Vulkan API:**
    - Vulkan is a low-level API with an extensive list of recommendations.
    - This session will not cover Vulkan in detail due to its complexity.
    - Refer to the "Mali Best Practices Guide" on the website for in-depth Vulkan optimization tips (approximately 70 pages).

# Mali Best Practices

## Principles

A designer knows he has achieved perfection not when there is nothing left to add, but when there is nothing left to take away

### Best Practices Overview

We then move on to best practices. Some of this we touched on yesterday, so I won't spend too long.

The big message here is it's not necessarily about making things faster. Graphics optimization is about being efficient, right? Having good shader implementations, good meshes, and so on. But quite often, you're looking at removing redundancy—draw calls that are outside the camera but still being sent to the GPU, like those behind walls where they can't be seen. Opaque objects being drawn with blending turned on, for example. It’s not necessarily about doing clever optimizations; it's just about finding where the time is going and figuring out what we can remove.

Quite often, the removals are the quickest and easiest ways to get optimizations.

### Approximations vs. Bit Exactness in Graphics

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172028706.png)

Certainly, for the graphics world, we're not looking for bit-exact replacements. We’re quite happy with fast approximations. Quite often in graphics, you’re looking for something that looks nice. It might not look exactly the same, but if it's 5% faster and good enough, we’ll usually take the performance gain.

Optimizing graphics isn't like optimizing CPU software where there's a bit-exact answer that you have to have.

## Performance Budget Planning

It's worth planning your performance budgets a bit. The range of performance between a low-end handset and a high-end handset is about 6X. It can be more than that if you've got very math-heavy content, but 6X isn't too far off. If you've got tablets, the difference can be even bigger—up to 10X—because tablets have a much higher thermal budget. They’re physically larger devices, often with a heat spreader.

So if you're wanting to have one game title that ships across a whole range of devices with different quality levels, you have to plan in advance a bit to make sure you’re not going to blow the budget for the low-end device.

### Importance of Frame Rate and Resolution

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172028090.png)

The most important initial decision is frame rate and resolution. If you get these wrong, it's very hard to recover later. For example, comparing 720P30 to 1440P90: 720P30 is around 30 megapixels per second, while 1440P90, which is targeted by some high-end game titles, is almost 340 megapixels per second. That's a huge difference in terms of both bandwidth and the amount of pixels that need shading.

For mobile displays, where we're generally dealing with 1440P or even higher resolutions, and wide color gamut, if you want to render to HDR P3, the new displays can do 90 FPS or 120 FPS. It’s very possible to blow your budget.

It's worth doing the initial thinking about frame rate and resolution. You should probably default to 1080P60, then maybe look at increasing it for very high-end devices or decreasing it for very low-end devices. But be conservative because if you double the frame rate, you halve your budget per frame. If you double the resolution, you also halve your budget per frame, and these things multiply together.

### Impact of Color Format on Performance

The final factor is color format, which is also multiplicative. You use that pixel format for every frame at that resolution, at that frame rate.

We're seeing a bit of a rush towards HDR; it's the new sexy technology in mobile, but it's big. Your frame buffers are twice the size, and you lose frame buffer compression, both on the memory side and the display controller side as well. So your bandwidth will more than double, and again, it’s very power hungry. For example, with RGBA FP16 at 90 FPS and 1440P, you’re spending over 2.5 gigabytes per second on a single surface.

Double that for the display controller, and you’re looking at 5 gigabytes per second, so just doing display updates consumes half of your memory power before the GPU does anything—that's just memory traffic. So you have to be very, very careful with FPS, resolution, and format, as they all multiply together, and the numbers get very big very quickly.

RGBAF16（RGBA FP16）和RGBA8是两种不同的图像像素格式，主要区别在于它们的存储精度和用途：

**RGBAF16 (RGBA FP16)**

- **精度**: 使用 16 位浮点数来表示每个颜色通道（红、绿、蓝）和 Alpha 通道。
- **范围**: 因为是浮点格式，它可以表示更广泛的颜色值范围，包括非常小和非常大的值。这使得它特别适合高动态范围（HDR）图像，其中需要表示非常亮的光源或非常暗的阴影。
- **内存占用**: 每个像素占用 64 位（8 字节），因为每个颜色通道使用 16 位浮点数。
- **用途**: 通常用于需要高精度颜色表示的应用，如游戏中的光照计算、后期处理效果以及其他需要高动态范围的场景。

**RGBA8**

- **精度**: 使用 8 位整数来表示每个颜色通道和 Alpha 通道。
- **范围**: 每个通道可以表示 0 到 255 的整数值（即 2^8 个不同的值）。这种格式的动态范围有限，但对于大多数图像和显示应用已经足够。
- **内存占用**: 每个像素占用 32 位（4 字节），因为每个颜色通道使用 8 位整数。
- **用途**: RGBA8 是一种常见的格式，广泛用于大多数图像和显示应用，如 2D 纹理、UI 元素和普通的 3D 渲染场景。由于其较低的内存和带宽要求，它更适合移动设备和其他资源受限的环境。

总结

- **RGBAF16** 提供更高的颜色精度和更广泛的动态范围，适用于对图像质量要求较高的场景，如 HDR 渲染。
- **RGBA8** 是一种标准的颜色格式，适用于大多数普通应用，具有较低的内存和带宽消耗。

### Planning Asset Budgets

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029289.png)

Once you've looked at that, you're looking at planning asset budgets. Draw call count is an important consideration for mobile, especially for OpenGL, where draw calls are more expensive. For some entry-level handsets aimed at the mass market, you might not have a high-speed CPU cluster. For example, you might have 8 smaller cores, with maybe four running at a slightly higher frequency.

### Draw Calls and CPU Power

Draw calls are a very easy way to spend CPU cycles. They are the most expensive operation that the driver performs. Although the cost is decreasing as hardware improves and drivers are optimized, you should still target around 500 draw calls per frame as a good starting budget. You can exceed this number on high-end devices, but if you're spending CPU power on draw calls, that's power you can't spend on rendering.

### Geometry and Primitive Management

We talked yesterday about geometry being the weak point of tile-based rendering. We have to write that output back to memory, so you need to be very careful around primitive count and vertex complexity. This is not just about GPU performance for low-end devices; it can also be an issue with memory footprint. Some entry-level devices may only have 512 megabytes of RAM, which doesn't go very far.

### Texturing Considerations

On the texturing side, you need to consider the number of materials, material layers, resolution targets, color, texture compression, and so on. Generally, there is a cost in terms of memory access and memory bandwidth for the GPU, but there isn't a hard limit on the number of textures you can use. If your device has the performance, then texture handling is part of fragment shading, and it tends to be more of a memory footprint issue rather than a processing limit.

### Shader Core Budgeting

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029337.png)

For developers targeting low-end devices, it's important to set up a shader core budget. Look at the number of cores in your design and the frequency you want to run them at. For high-end devices, you might not want to run at maximum frequency to avoid overheating. Then, divide the available power by your frame rate and target pixel count.

For example, with a 2-core Mali G72 running at 700 MHz, targeting 1080P60, you only have a best-case budget of 11.25 cycles per pixel. This isn't much, and those cycles must be allocated across all tasks, including vertex shading and fragment shading. In practice, you might only get nine and a half cycles per pixel due to imperfect utilization, so you need to target your graphics carefully to avoid wasting cycles.

### Balancing Performance and Visual Quality

Good graphics can be achieved within nine and a half cycles per pixel, but you have to make careful choices. For instance, effects like blur or screen-space ambient occlusion filters are likely impossible at 1080P60 on low-end devices. To address these limitations, you might have to make compromises like dropping certain effects, reducing frame rates, or lowering resolution. Alternatively, you could perform post-processing at a lower resolution, such as 720P30, and then overlay it on a 1080P60 final pass. The key is that the solution doesn't have to be a global choice; it can be tailored to the specific needs and capabilities of the device.

This approach means performing resource-intensive post-processing effects at a lower resolution (e.g., 720P) to save processing power, and then applying these effects to a higher resolution final image (e.g., 1080P).

Here’s how it works:

1. **Render the Scene at 1080P**: Start by rendering your scene at the desired high resolution.
2. **Post-Process at 720P**: Apply heavy post-processing effects (like blur or ambient occlusion) on a lower resolution version of the scene (720P). This is less demanding on the GPU.
3. **Overlay or Composite**: Combine the processed lower-resolution effects with the high-resolution render. This can be done by scaling the effects up to fit the 1080P image or by overlaying the effects on top of the high-resolution render.

### High-End Performance Management

In high-end systems, budgets are less of a concern because there's generally an abundance of performance. The real challenge is managing power. Unlike lower-end systems, there isn't a specific shader number to target; instead, the focus is on the aggregate CPU load, memory load, and shader load. You can afford to spend many cycles as long as you're not consuming excessive memory, for example.

# Frame Construction

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029453.png)

Now, let's start looking at some best practices, particularly regarding frame construction. This is especially important for tile-based renderers. The goal is to ensure that the framework of the frame is in good shape before you start fine-tuning optimizations.

This is largely about managing render passes, which are critical in driving tile-based architecture compute—essentially a pseudo-render pass. It's also about managing the data flow between render passes and compute because that flow determines your memory traffic through DRAM. The aim is to achieve efficient pipelining and parallel processing, making good use of tile memory. Additionally, when writing out to the display, we want to ensure that we are utilizing the display effectively without overloading the GPU, allowing the Display Processing Unit (DPU) to handle scanout natively.

## Tile Memory Utilization

Tile memory is the superpower of tile-based GPUs. However, there is a cost associated with it, specifically the additional triangle bandwidth. To offset this cost, it's crucial to make good use of tile memory. If you misuse a tile-based GPU, you still incur the cost but miss out on the benefits, leading to inefficiency.

Tile memory is initialized at the start of a render pass during fragment shading. If you don't start from a clear color, the contents from memory are read into the tile as your starting color or depth. The data is then written back to memory at the end of the pass when the tile is completed. The intermediate state remains within the tile memory during shading. Since loads and stores go to DRAM, which is energy-intensive, minimizing the number of loads and stores is essential.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029151.png)

## Efficient Use of Vulkan for Tile-Based Rendering

Vulkan makes this process easier because render passes are explicit constructs within the API. You have a load operation at the start of a pass, a store operation, or a resolve operation at the end of the pass, and you explicitly instruct the API on what you want to happen.

- **Load Operations**: Vulkan provides options such as load from memory, **clear or don't care**, which initialize the tile memory in fixed-function hardware to a clear color, making it a nearly free operation.
- **Store Operations**: Store operations will store data back to memory, or you can choose "don't care" to discard the data when it's no longer needed.

Vulkan also offers two ways of clearing: using a load operation to clear at the start of the render pass or using a separate `VK Command Clear`, which acts as a draw call. For optimal performance, always use the load clear at the start of the pass, as it leverages fixed-function hardware without generating a full-screen shader command.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029770.png)

## Resolving and Multisampling Considerations

Similarly, when resolving, avoid using `VK Command Resolve Image`. Instead, use the resolve operation on the render pass, which resolves inline as part of tile write-back to memory. This allows you to discard high-resolution multisample data, preventing it from being written back.

If you use `VK Command Resolve Image`, the multisample data gets written back to memory, read back in, and then resolved down to a single value, which is highly expensive. Multisample data is bulky and does not compress well, so it's important to keep it within the GPU to maintain efficiency.

## Introduction to OpenGL ES Rendering

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029112.png)

OpenGL ES does not have a defined render pass architecture in its API. This is different from other APIs where render passes are a fundamental concept. In OpenGL ES, render passes are constructed on the fly by the driver, typically corresponding to when `GL` binds a framebuffer at the start. The original swap occurs when the window surface is flushed to the display. However, various actions can cause a pass to split unexpectedly.

## Handling Render Passes

Calling a `flush` and `finish`, or modifying the attachments in the middle of a render pass without calling `GL` to bind a framebuffer, can effectively create a new pass on the same framebuffer object. When building framebuffer objects in OpenGL ES, it is crucial to avoid altering them once they are constructed. A common mistake is to use one framebuffer object and change it per frame, which invalidates optimization states that the driver allocates. Instead, it's recommended to build one framebuffer object for each combination of states needed, setting the attachments once without further changes.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029633.png)

## Framebuffer Optimization Techniques

If you are using packed D24S8 surfaces, always attach both D and S to your framebuffer object. This practice works well with framebuffer compression schemes. Since OpenGL ES does not inherently support a load operation due to the lack of a render pass architecture, it is important to note that if the first action after starting a pass with `GL` bind framebuffer is `GL clear`, `GL clear buffer`, or `GL invalidate buffer`, this will trigger the fast initialization of tile memory. Performing any other draw calls before a clear action will cause the clear operation to be turned into a shader program, which is significantly more expensive.

## Managing Attachment Storage

OpenGL ES also lacks a store operation, meaning that all attachments are written back to memory by default unless a `GL invalidate framebuffer` command is issued before changing the binding away from a render pass. This command informs the hardware that the data is no longer needed. Therefore, it's advisable to perform `GL clear` at the beginning of a pass, followed by draw calls, and then use `GL invalidate` at the end for any attachments that are not required for the subsequent passes.

## Resolving Multisampling Data

While OpenGL ES does not include a resolve operation, `GL blit framebuffer` can be used to perform a resolve, though this method is costly. It involves writing multisampling data back to memory, reading it into the queue, and then resolving it. A more efficient alternative is to use the `GLX_multisample_rendered_texture` extension, which provides the preferred method of multisampling on mobile devices. This extension allows for the resolve operation to be part of the tile write-back, avoiding the need to write the data back to main memory.

## Drawing the Frame Graph

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029849.png)

One thing we heavily recommend is drawing the frame graph. In this diagram, every node represents a framebuffer object that corresponds to a render pass. The small white boxes within the nodes are attachments, which can be stencil, color, or depth. The arrows between nodes indicate data flow: solid lines show attachment usage, while dotted lines show texture usage.

You can observe how the frame graph builds up as passes exchange data. Essentially, it's like a wiring diagram where each render pass has inputs and outputs that need to be wired together. This allows you to see where data is read from, where it is written to, and how it is consumed in later passes.

## Importance of Clearing and Invalidating Attachments

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029688.png)

If you don't clear or invalidate the input attachments, they will be retained, leading to redundant reads from memory. Similarly, if you don't invalidate the output attachments at the end, they will also be retained, causing redundant writes to memory. Every line that appears on the frame graph represents bandwidth usage, including full frame buffers. 

This is not limited to actual render passes; blits, copies, and compute operations all consume bandwidth. Therefore, it’s crucial to include these in the frame graph where possible.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029086.png)

## Example: Simple Frame Graph

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029055.png)

Here’s a simple example of a frame graph with six render passes:

- **Velocity Map:** Used for shading with motion blur applied later.
- **Depth Shadow Map:** Used for shadow calculations.
- **Lighting Passes:** Two lighting passes are performed, one for opaque objects and one for transparent objects.
- **Motion Blur:** Takes the blurred velocity map and the lit output, applying the motion blur algorithm.
- **Final Output:** The color is finally output to the display.

Most of the data exchanges in this example are textures, represented by dotted lines. However, there are some uses of attachments, represented by solid lines. Algorithmically, some attachments have no data source and can be cleared at the start of the pass. If they are not cleared, redundant reads from memory occur. Similarly, attachments with no data consumer can be invalidated to avoid redundant writes to memory.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029033.png)

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029649.png)

## Optimization Opportunities

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029136.png)

In some cases, you may have a direct feedthrough where attachments are consumed directly by a later render pass without being used as textures elsewhere. In such cases, merging the two render passes into a single pass can prevent unnecessary traffic back to memory. This is one of the most common optimizations found in games, especially when handling data exchanges between subsystems, such as a 3D render pass followed by a UI overlay pass. Instead of writing the 3D data back to main memory to be read again for the UI overlay, you can append the UI overlay to the same render pass, saving bandwidth.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030814.png)

## Special Case: Deferred Lighting Pipeline

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030258.png)

A special case arises when there is a feedthrough, but there is also a texture read at a matching pixel coordinate. This is common in deferred lighting pipelines where material data is written out from the first pipeline, and then lighting is resolved in the second pass. Algorithmically, the application can ensure that only data from the G-buffer at the same pixel coordinate is accessed, avoiding out-of-tile memory access. This allows you to collapse the process into a single shading pipeline, storing the buffer in tile memory, reading it back into a later fragment, and accumulating lit color values before discarding the buffer at the end of the pass.

While this optimization always saves bandwidth, it may come at the cost of performance due to data dependencies that the shader core instruction scheduling must manage. However, for high-end content where thermal limits are a concern, the energy savings in terms of memory bandwidth can be significant.

## Real Example: Memory Bandwidth Optimization

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030860.png)

Consider an example where a 1080P G-buffer is used for deferred shading at 60 FPS. The memory traffic for the buffer alone consumes about 200 milliwatts of the power budget, even with compression. If you aim to fit the process within a 1.5-watt GPU budget while also spending power on the CPU and memory, this G-buffer bandwidth could account for 15-20% of your total power budget.

## Practical Application: Frame Graph Analysis

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030574.png)

Here’s an extract from a real frame graph example with multiple render passes, feedthroughs, and texture uses. Even though it represents only part of the frame, it shows eight or nine render passes exchanging data. By examining this diagram, you can identify several optimization opportunities:

- **Unnecessary Render Pass:** A render pass that produces data not used by any other pass can be optimized away by not submitting it to the frame.
- **Wasted Bandwidth:** Depth attachments that are written but not invalidated lead to wasted bandwidth.
- **Feedthroughs:** If a render pass is the sole consumer of data from a previous pass, you can merge them to reduce bandwidth usage.

In a practical example, merging multiple render passes reduced memory traffic by 60 megabytes per frame without any difference in rendering output. This optimization shows how powerful drawing a frame graph can be for applying peephole optimization to reduce memory bandwidth while maintaining rendering quality.

## Introduction to FBC (Frame Buffer Compression)

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030108.png)

In modern graphics processing, Frame Buffer Compression (FBC) is a key technology used to achieve lossless compression. With FBC, you automatically benefit from bandwidth savings of around 30% to 50%, depending on the input image. Importantly, this technology requires no opt-in from the application side, making it seamless for developers.

## Constraints and Limitations

However, there are some constraints associated with FBC. On current hardware, there are color format limitations. Even on Valhall, the latest architecture, FBC is only supported for 32-bit per pixel formats or narrower, meaning that hardware RGB or RGBA FP16 formats cannot be compressed. For earlier hardware, such as the Midgard and Bifrost families, FBC only supports compression of uncompressed formats. This means it won't compress floating-point (float), integer (int), or signed integer formats.

Another limitation is that if you write multisample data back to memory, it will not be compressed, resulting in full bandwidth costs for multisample anti-aliasing (MSAA) data. However, it is recommended to resolve multisampling in tile memory to avoid these costs.

## Runtime Usage Limitations

In terms of runtime usage, FBC is limited to the framebuffer and texturing paths. Framebuffer writes and texture reads are supported, but read-write images, such as those used in compute shaders, will not benefit from FBC. When these images are used for the first time, a decompression pass occurs, incurring a performance cost. To prevent repeated decompression, the driver marks the texture as used in images, disabling further compression.

For the Bifrost architecture, specific usage flags apply to compressed images. The image must be in an optimal tiling format, and it cannot be used as a storage, transient, or in scenarios involving memory aliasing. The compression must match the format, which generally works fine under typical conditions.

## Tile Memory and Allocation

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030277.png)

Tile memory is a finite resource, and its management is crucial for optimal performance. On older hardware, it is designed to support 128 bits per pixel for color, depth, and stencil separately, while on Gen 2 hardware, it supports 256 bits per pixel. If more memory is required, the tile size reduces progressively (e.g., 16x16, 8x8, 4x4).

Whether you need to reduce the tile size depends on a combination of factors such as color format, multisampling, the number of attachments, and whether you are using mipmaps. The hardware is equipped with a flexible allocator capable of efficiently managing this memory, but it is generally recommended to maintain full tile sizes. For newer hardware, keeping the color data within 256 bits per pixel or less is important to maintain efficiency.

## Considerations for HDR and G-Buffer Rendering

Though 256 bits per pixel might seem like ample capacity, high dynamic range (HDR) rendering, G-buffering, and multisampling can quickly consume this memory. Therefore, managing tile memory effectively becomes critical, especially in advanced rendering scenarios like HDR with multisampling.

瓦片内存是有限的资源，在图形处理器中用于存储像素数据。瓦片内存的管理对图形渲染的性能至关重要。不同的硬件架构对瓦片内存的支持能力不同：

- **旧硬件**：旧的硬件设计支持每像素128位的颜色、深度和模板（stencil）数据。
- **新一代硬件（Gen 2）**：在较新的硬件上，瓦片内存可以支持每像素256位的数据。

如果图形处理需要超过上述位数的存储空间，瓦片的尺寸将会**减少**。例如，瓦片的尺寸可能从16x16像素缩小到8x8像素，甚至4x4像素。

决定是否需要缩减瓦片尺寸的因素包括：

- **颜色格式**：使用的颜色格式会影响每个像素的数据量。
- **多重采样抗锯齿（MSAA）**：多重采样会增加每个像素的数据量，因为它需要存储多个样本。
- **附件数量**：在渲染过程中使用的附件（比如颜色附件、深度附件）的数量也会影响瓦片的内存需求。
- **是否使用了mipmap**：mipmap是用于纹理贴图的一种技术，可能会影响内存的使用。

硬件中通常有一个灵活的分配器（allocator），可以聪明地管理这些内存分配，但通常建议保持完整的瓦片尺寸以获得更高的效率。对于新硬件，保持每像素256位或更少的颜色数据是非常重要的，这样可以确保渲染的效率。

虽然256位每像素的数据量听起来很大，但在处理**HDR渲染或使用G-Buffer**的渲染时，加上多重采样，这些内存资源可能会很快被消耗掉。因此，在这些复杂的渲染场景中，如何有效管理瓦片内存显得尤为重要。

## Increasing Use of Compute Shaders

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030508.png)

Compute shaders are becoming increasingly popular in modern graphics applications. Their appeal lies in their ability to break out of the fixed-function pipeline, offering more flexibility compared to traditional shaders.

## Integration in Frame Graphs

It is important to include compute shaders in your frame graph. They essentially act as a type of render pass and should be treated as such in your rendering pipeline.

## Avoiding Naive Replacements

While compute shaders offer flexibility, they are not always the best choice for simple tasks that could be handled by fragment shaders. One of the downsides is that compute shaders do not support framebuffer compression, which can lead to slower performance. The image load/store path is generally slower than texturing and frame buffers, and you also lose access to certain fixed-function hardware, such as interpolators for varying data.

## Algorithmic Use of Compute Shaders

Compute shaders should be used where there is a clear algorithmic advantage. They excel in situations where you can perform clever computations, share computation across tasks, or exploit parallelism more effectively by combining multiple fragments into a single compute work item. However, it’s important to remember that compute shaders are not inherently faster than traditional shaders; their effectiveness depends on the specific use case and implementation.

## Conclusion

In summary, compute shaders are powerful tools, but they are not a magic solution for performance improvement. Use them strategically where they offer clear benefits, rather than as a one-to-one replacement for fragment shaders.

## Importance of Overlap and Synchronization

In rendering pipelines, managing overlap and synchronization effectively is crucial for performance. Avoid unnecessary synchronization barriers, such as finishing a barrier prematurely or mapping a buffer without using unsynchronized operations. The latency of these pipelines is often quite long, sometimes spanning one frame or more. Therefore, if you incur a query or fence, it’s important not to wait on it too soon. Waiting prematurely can block the pipeline, causing it to drain and reduce efficiency.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030025.png)

## Pipelining Fences and Queries

To maintain performance, it’s recommended to queue fences and queries one or two frames ahead of when you actually need them. This way, you can pipeline these operations aggressively, minimizing delays and ensuring a smoother rendering process.

## Driver Optimization and API Control

In most cases, driver optimization effectively manages these processes for you. The drivers are designed to handle synchronization and dependencies well, so problems related to synchronization are rare. However, Vulkan gives developers the control to manually set source and destination stages to describe dependencies between different layers of the rendering process.

## Managing Dependencies

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030462.png)

When managing dependencies, being too conservative can serialize your pipeline, which significantly hampers performance. For example, if you set a dependency that requires waiting for the bottom of the pipe in a previous pass before starting the top of the pipe in the current pass, you force the pipeline to run serially. To avoid this, set the source stage as early as possible. If a vertex shader computes data, you should only wait for the vertex shader rather than the entire render pass. Overly conservative dependency management is one of the most common performance issues observed in Vulkan applications today.

## Compute Workloads on Mali GPUs

For Mali GPUs, compute workloads generally run in the non-fragment slot, which can lead to some peculiarities in scheduling. Typically, the dependency flow moves from non-fragment stages to fragment stages, such as from geometry to fragment shading. However, in the case of fragments or compute shaders, the data flow can be reversed, moving up and from left to right instead of down and from left to right. This reversal can cause slight hitching in the scheduling algorithm.

## Handling Compute Shader Scheduling

While there isn't much that can be done to completely avoid these scheduling issues, it's advisable to place non-dependent work around compute shaders. This allows for some bubble capacity, giving the hardware more flexibility in scheduling around these tasks.

## Data Transfer in Vulkan

In desktop APIs, data transfer between system RAM and dedicated graphics RAM over PCI Express is a common task. Vulkan includes the concept of transfer operations specifically designed to manage this data transfer. However, in mobile environments, where unified memory is used (i.e., CPU and GPU share the same memory pool), transfer operations are usually unnecessary. In most cases, data can be uploaded directly to memory, and the GPU will have immediate access to it, avoiding the need for transfer operations.

## Swapchain Buffering

The Swapchain in graphics applications can support both double buffering and triple buffering. Double buffering is the default for most applications and provides a balance between performance and latency. Triple buffering, on the other hand, is beneficial for throughput but has drawbacks in terms of increased latency.

## Understanding Buffering at 30 FPS

In scenarios where the GPU is maxed out at 30 FPS and the display controller is scanning out at 60 Hz, each buffer is scanned out twice. This means the application is effectively running at half the display rate. If the game is optimized to increase performance to around 50 FPS, it still might not meet the VSYNC deadline with double buffering. In this situation, buffer one may be scanned out twice because buffer two wasn't ready in time. Even though the content could theoretically hit 50 FPS, the GPU may go idle if it has finished rendering the current buffer but cannot start on the next one because it’s still being scanned out.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030739.png)

## The Limitations of Double Buffering

The primary limitation of double buffering in this context is that there’s no third buffer for the GPU to render into while the other is being scanned out. This causes inefficiencies where the GPU could be idle, waiting for a buffer to become available. This is a downside of double buffering, especially in cases where the GPU finishes rendering before the next buffer is ready.

## Triple Buffering: A Solution with Trade-offs

Inserting a third buffer, known as triple buffering, provides the GPU with a "scratch buffer" to render into while the other buffers are still in use. This allows the effective frame rate to increase to the desired 50 FPS or higher. However, this improvement comes at the cost of increased user input latency, which can make touch interactions feel less smooth.

## Recommendations for Developers

For most content, especially first-person games where input latency is critical, developers typically recommend using double buffering for the final shipping version. This reduces input latency and provides a smoother user experience. However, during development, it's advisable to use triple buffering or disable VSYNC to measure the real performance of the application accurately. It’s crucial to remember to switch back to double buffering or enable VSYNC for the final release to ensure optimal performance and user experience.

## Device Rotation on Mobile

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030829.png)

On mobile devices, a common challenge is handling device rotation, where the game or application must adapt from landscape to portrait mode or vice versa. When this happens, the application typically re-renders in the new orientation as indicated by the OS, which sends a rotation event. The OS informs the application whether the device is now in landscape or portrait mode. However, the physical display panel itself does not rotate.

## Display Scanning and Orientation

Most mobile displays have a portrait scanner, meaning the scanlines run along the short edge of the screen. Regardless of the device orientation, the scanning direction remains the same due to hardware constraints. A key issue arises when the application's memory layout is misaligned by 90 degrees to the scanner's orientation, which can be highly inefficient. In such cases, the display controller may rely on the GPU to handle the necessary adjustments, which is not optimal.

## Maintaining Alignment Between Panel and Swapchain

To avoid inefficiencies, it is essential to ensure that the panel's orientation aligns with the swapchain's memory layout. This alignment prevents the need for the GPU to perform additional transformations, thus maintaining performance.

## Handling Orientation in OpenGL and Vulkan

For OpenGL ES, the driver automatically negotiates with the OS to ensure that the application's transform matches the display's orientation. This process is managed behind the scenes, simplifying development. However, in Vulkan, which provides more explicit control, this responsibility falls on the application.

Whenever the OS updates the device orientation, the application must respond by recreating the swapchain with the correct pre-transform hint. This adjustment ensures that the display controller doesn't need to perform extra work, allowing the application to maintain optimal performance by inserting the necessary geometry transforms to rotate or flip the rendering as required.

# Engine and API

## Game Engines and Macro Behavior

When discussing game engines, it's essential to focus on macro behavior and overall performance optimization. [Detailed API best practices](https://community.arm.com/arm-community-blogs/b/graphics-gaming-and-vr-blog/posts/new-developer-guide-arm-mali-application-developer-best-practices) can be found on our website, but here’s a brief overview of key points.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030183.png)

## Reducing Draw Calls

One of the most expensive operations for the GPU is processing draw calls. It’s crucial for game engines to minimize the number of draw calls to improve performance. Some strategies to achieve this include:

- **Batching Objects Statically**: Combine multiple objects into a single batch offline to reduce the number of draw calls.
- **Batching Dynamically**: Similar to static batching, but done in real-time during gameplay to optimize the draw count dynamically.
- **Using Instancing**: Leverage instanced rendering to draw multiple objects with a single draw call.
- **Culling Invisible Objects**: Ensure that objects not visible in the scene are culled at the CPU level before they reach the GPU. The CPU can perform high-level optimizations, like determining if an entire object or room is out of view, which the GPU cannot do as efficiently.

## Managing State Changes

State changes in the graphics pipeline can be costly, particularly in OpenGL ES, where you aren’t building things upfront. To minimize the impact of state changes:

- **Sort Draw Calls by State**: Arrange draw calls to minimize state changes, such as texture binding and render state modifications. This can help reduce the overhead associated with these operations.

## Multithreading and Energy Efficiency

Modern CPUs come with multiple cores, making multithreading crucial for efficient software performance. Running multiple threads at lower frequencies (e.g., four threads at 200 MHz) is more energy-efficient than a single thread running at higher frequencies (e.g., 1 GHz).

- **Vulkan and Multithreading**: Vulkan is designed to support multithreading more effectively than older APIs. The GPU hardware remains the same, but Vulkan’s explicit nature and asynchronous design make draw calls cheaper and reduce CPU load. This leads to more efficient use of CPU resources without significantly altering the GPU load.

## Vulkan's Impact on CPU and GPU

While Vulkan doesn't change the GPU load dramatically since the hardware remains the same, it significantly improves CPU performance. Vulkan is a better fit for modern hardware because it allows more explicit control, reducing the driver's need to track states and making it easier to implement multithreaded rendering.

Reducing CPU load is one of the main design objectives of the Vulkan API. Its use of explicit state construction reduces the cost of draw calls, and the explicit context model makes it easier to multithread rendering code. 

In summary, optimizing game engines involves reducing draw calls, managing state changes, and leveraging multithreading, all of which are supported effectively by Vulkan.

## Competing Optimization Objectives

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030159.png)

When optimizing graphics performance, developers often face competing objectives, with no single right answer. One of the most effective techniques for reducing the number of draw calls is batching, where multiple objects are combined into a single draw call. However, this approach has trade-offs.

## Trade-offs in Batching Draws

Larger batches can reduce the effectiveness of other optimization techniques, such as CPU-side frustum culling, occlusion culling, and depth sorting. These techniques rely on breaking down the scene into smaller parts to determine which objects need to be rendered. When batches are too large, these optimizations become less effective, potentially leading to performance degradation.

## Finding the Sweet Spot

There is no universal answer to how large batches should be. The key is to experiment and find the sweet spot for your specific content. This balance involves trading off between the size of the draw call batches and the efficiency of frustum culling and depth sorting.

## Dynamic Content Challenges

Finding the right balance can be particularly challenging in dynamic environments, where the world is constantly changing. In such cases, achieving an optimal balance between batching and other optimizations requires careful consideration and experimentation tailored to the specific characteristics of the content.

There are often competing optimization objectives, and unfortunately this is one of those areas where there is no single right answer. Batching draws is one of the most effective techniques for reducing draw call count, but larger batches mean that CPU-side frustum culling, occlusion culling, and depth sorting all become less effective. Experiment to find the sweet-spot for your content. 

## Random Frame Drops

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032563.png)

Random frame drops are a common issue where a game generally runs smoothly but occasionally experiences a sudden drop in frame rate to 30 FPS or 20 FPS before returning to normal. These hitches are often caused by one-off heavy operations during gameplay.

## Causes and Prevention of Frame Drops

To minimize these disruptions, it's advisable to handle heavy operations, such as data uploads, during level load time rather than during gameplay. 

On Mali GPUs, frame drops often result from data uploads, like uploading textures or large buffers, or modifying resources that are still being referenced by the pipeline.

If a texture or resource is still queued for a draw call and you attempt to modify it before the reference is dropped, you may encounter issues like copy-on-write or resource ghosting. This can lead to the driver needing to stall the pipeline until the reference is dropped or create a new copy of the texture with the modification applied. Both options are resource-intensive and can cause significant slowdowns.

## Avoiding Expensive Operations

To avoid these performance hits, it's essential to avoid modifying resources that are still being referenced by the pipeline. Additionally, another major cause of slowdowns is invoking the shader compiler, which can be expensive and time-consuming.

## Shader Compilation and Linking

Shader compilation and linking are both expensive operations. Shader compilation generates an intermediate representation (IR) and applies some optimizations. However, full pipeline generation doesn't occur until link time, where additional optimization passes and code generation are performed. Contrary to some assumptions, both shader compilation and linking are slow processes.

## Optimizing Load Times

To improve load times, it is common practice to cache compiled and linked programs across runs, so the shaders do not need to be recompiled every time the user starts the game. This can significantly reduce the overhead associated with shader compilation and linking, leading to a smoother gameplay experience.

## Optimizing Draw Dispatch

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031489.png)

Effective draw dispatch is crucial for rendering performance. To make the best use of early ZS-tests, follow these strategies:

- **Render Opaque Objects Front to Back**: Rendering opaque objects front to back allows the hardware to maximize depth testing efficiency, discarding hidden surfaces early on.
- **Render Transparent Objects Back to Front**: Transparent objects should be rendered back to front for proper blending.

While it's not absolutely critical to render opaque objects in a front-to-back order (since hidden surface removal can still handle back-to-front opaques), hidden surface removal can't always remove everything. early ZS-tests ensure more reliable performance.

## Sorting Efficiency

Front-to-back sorting is beneficial for opaque objects, but don't over-optimize this process. Avoid spending excessive CPU cycles trying to achieve a perfect sort. A reasonable balance should be struck between the complexity of sorting and the performance gains.

## Clean Draw Settings

When rendering, always ensure that your draw settings are as clean as possible to avoid unnecessary performance hits. Consider the following tips:

- **Enable Facing Tests**: Always enable facing tests to cull back-facing triangles for 3D draws.
- **Disable Unnecessary Features**: Turn off features like blending, Alpha-to-Coverage, or other effects if they are not required for a particular draw. While these settings might not visibly change the output, they can still prevent the hardware from activating certain optimizations.

## UI Rendering and Mid-Pass Clears

For UI rendering, where depth and stencil layering are common, it's often necessary to clear these values between UI elements. However, you can optimize this process by using scissors to minimize the scope of mid-pass clears. Mid-pass clears are not free, so limiting their scope can save valuable performance resources.

## Depth Pre-Pass Considerations

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172033070.png)

One common optimization technique is using a **depth pre-pass**, where you render your geometry without any shading to populate the depth buffer. While this can have benefits, there are several considerations to keep in mind, especially for tile-based renderers:

- **Increased Geometry Submission**: On tile-based renderers, you're effectively sending your geometry twice — once for the depth pre-pass and once for the final pass. This increases the bandwidth used, as more data needs to be written back to main memory.
- **Duplication of Hidden Surface Removal**: If the depth pre-pass is only being used as an optimization, it may overlap with what the hidden surface removal system is already doing. In some cases, this duplication can be unnecessary.

## Potential Downsides of Depth Pre-Pass

While depth pre-passes can sometimes improve performance, they don’t always provide the expected benefits:

- **Performance Impact**: In certain situations, games that implement a depth pre-pass might actually run faster without it. This happens because the additional geometry submission and memory bandwidth usage can outweigh the performance gains from optimized depth testing.
- **Evaluate Carefully**: It's essential to test the effectiveness of the depth pre-pass in your specific game or application. Be open to turning it off if you find that it doesn't improve — or even hinders — performance.

## Adoption of Vulkan vs OpenGL ES in Game Development

## Current Landscape of Game Development

At the moment, most game titles in development are still relying on **OpenGL ES** rather than Vulkan. Even for new games, **OpenGL ES** remains the dominant choice. The key reasons for this are related to compatibility and market reach:

- **Device Compatibility**: Game developers aim to target a wide range of devices, including older handsets. Vulkan, while a newer API, isn’t universally supported on older devices. For instance, handsets that are 2–3 years old may only support OpenGL ES.
- **Driver Stability and Performance**: Although Vulkan has been around for a few years, early device drivers lacked the stability and performance that developers require. As a result, OpenGL ES continues to be the safer choice for mass-market devices.

## Vulkan Development Challenges

For developers, the decision to implement a Vulkan version of their game involves a few key considerations:

- **Targeting Older Devices**: Since many older handsets don’t support Vulkan, developers often find themselves having to create an **OpenGL ES version** anyway. This leads to questioning whether the additional investment in developing a Vulkan version is worthwhile.
- **Game Engine Support**: The **Vulkan support** in popular game engines like **Unity** and **Unreal Engine** has taken time to mature. While Vulkan is more fully supported in recent engine versions, it took a few years for this parity in **performance and efficiency** to be reached.

## Future of Vulkan Adoption

While Vulkan adoption is growing, it will likely take some time before it becomes the dominant API in mobile game development:

- **Engine Versions Lagging**: Game studios are typically conservative when it comes to upgrading to the latest versions of game engines. Many games currently in development are using **older versions of Unity** and other engines, which may not yet fully utilize Vulkan’s capabilities.
- **12 to 18 Month Horizon**: As game engine support for Vulkan has improved significantly, the transition will happen, but it may take another **12 to 18 months** for new titles to fully adopt Vulkan. In the meantime, OpenGL ES remains the default choice for many developers.

# Content

## Data and Geometry Complexity

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031234.png)

While the **API** is important for GPU performance, it is only a small part of the overall puzzle. The **artwork, textures, and models** play a significant role in performance optimization, particularly in relation to **geometry complexity**.

Every visible **vertex** gets written back to memory and then read again during **fragment shading**, which can lead to high **memory bandwidth** consumption. As a result, reducing the number of **vertices** and optimizing their **reuse** between triangles is crucial. This includes:

- Fewer triangles and vertices.
- Using **half floats** or **RGB8 attributes** instead of full floating-point data to reduce memory size.

## Optimizing Vertex Data

A common optimization strategy involves reducing the amount of data that needs to be uploaded for each vertex. For example:

- If you already know **normal** and **binormal** vectors, you can **recompute the tangent** vector in the shader, which eliminates the need to pass it in as separate data. This **reconstruction** is often cheaper than loading the additional data.

By making such optimizations, a vertex that was originally **56 bytes** can be **packed into 32 bytes**. Reducing precision and swapping in computations where possible is a key technique.

## Handling Frustum Culling and Visibility

Many performance improvements can be achieved by culling geometry that is not visible:

- **Frustum culling** and **portal testing** can help determine whether objects are visible based on the game's perspective. For instance, if you can't see through a doorway, then everything behind it can be culled from rendering.

These optimizations must be applied at the **application level**, as the GPU does not have knowledge of the game world.

## Triangle Visibility and Tessellation

When you issue a **draw call**, the GPU must process every triangle to determine whether it is visible. This negates the possibility of hierarchical optimization.

Moreover, **tessellation shaders** and **geometry shaders** are often a poor fit for **tile-based rendering**. They are designed to expand the number of triangles, which works well in **immediate mode architectures** but not for tile-based systems that end up back in main memory. For this reason, it's often better to **use higher-detail models** from the start if you want finer detail.

## Mesh Level of Detail (LOD)

## The Concept of LOD

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031351.png)

One of the most important aspects of rendering optimization is **mesh level of detail (LOD)**. For instance, if you have a rabbit model, it can come in various levels of simplification. The idea is that the application should select a **simpler model** as the object moves further away from the camera.

If the rabbit is far from the viewer, you can use a **simplified model** with fewer vertices, as any loss in detail won’t be noticeable due to its small size on the screen.

## Avoid Sparse Indexing

When generating different LODs, it's essential to avoid **sparse indexing** into your mesh data. For example, if you simplify by taking every 4th or 16th vertex, like in the case of the **green** and **yellow rabbit models**, this approach may seem efficient. However, on **Mali hardware**, vertices are shaded in **blocks of four**.

As a result, even the **simplified green rabbit** will shade the same amount of geometry as the more detailed **blue rabbit**, offering no actual performance benefit.

## Optimal LOD Strategy

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031658.png)

To make LOD effective, you should **duplicate the data** for each level of detail. While this increases **memory footprint**, it ensures that the GPU only loads and shades the relevant parts of the mesh. For example, when rendering the **yellow rabbit**, the data for the **blue rabbit** won't be loaded at all.

This approach optimizes **bandwidth usage** and minimizes **shading costs**, providing the best balance between memory and performance.

## Trade-off

While duplicating the mesh data for different LODs incurs some memory cost, it allows you to minimize the amount of shading required, making the trade-off well worth it in many scenarios.

## Avoid Overusing Triangles

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031438.png)

In general, gaming gets this right, but you don't have to build everything with triangles, especially for a tile-based renderer. This is quite important, so here we have a test scene. In reality, it's very, very simple, and we're just using normal maps to make it look more 3D than it really is.

Normal mapping is really good. It looks better because you can texture filter it. It's compressible, and it doesn't take very much bandwidth.

So don't try and model everything with triangles, and this is something that we've seen less in games. Gaming tends to get this very well, but in things like Saturn applications, car dashboards in car infotainment, the kind of more embedded use cases where they've not come from a 3D high-performance background that is a little bit too heavy on triangles where everything is being modeled with geometry and not texturing.

## Index-Driven Vertex Shading Pipeline

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031367.png)

We discussed the index-driven vertex shading pipeline, where the shader is split into two stages: position and varying. The varying shading is only applied to vertices that contribute to triangles surviving culling and tiling. Any triangles that are culled are discarded in the position shading stage.

## Data Fetching and Cache Lines

Data is always fetched in whole cache lines from memory. For Mali on the current system, the cache line size is 64 bytes. If position data and non-position data are interleaved within the same cache line, fetching position data for position shading will also fetch the non-position data that isn't needed.

## Optimizing Memory Packing

To maximize efficiency, applications can reorganize memory by separating position data from non-position data. This minimizes redundant data fetching and maximizes bandwidth savings.

## Example: Vertex Attribute Data

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031956.png)

Consider a vertex attribute example. Only the position data is required for the position shader, while the remaining attributes, such as texture coordinates and lighting calculations, are only needed by the fragment shader if the vertex is visible.

If we pack this data as a traditional array of structures, each cache line will contain both position and non-position data. For position shading, this results in 24 bytes of useful data and 40 bytes of unnecessary data.

## Splitting Data into Buffers

Instead, by separating the data into two buffer regions—one containing only positions and the other containing everything else—we load only the necessary data for position shading. This approach maximizes bandwidth savings and reduces latency by fetching fewer cache lines, enabling faster position computations and slightly better shading performance.

## Introduction to Geometry in UI

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031067.png)

Now onto a slightly different topic: how to handle geometry in UI, which is typically a 2D problem. This issue doesn’t arise often in 3D applications, but it's essential when working with user interfaces.

## Full-Screen Quads and Over-Shading

Consider filling a 1080p screen. Many might do this with a full-screen quad composed of two triangles. However, due to shading being processed in 2x2 pixel quads, anything along the diagonal will get shaded twice—once for the top triangle and once for the bottom triangle—leading to the shading resource being used twice.

For a 1080p screen, this results in about 0.5% overhead due to re-shading.

## Optimizing Geometry for Over-Shading

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031899.png)

There are better ways to handle this issue. For example, a larger triangle, such as one that is 4K by 4K in size, can be used. By utilizing the scissor rectangle, we can cut out only the parts we need, avoiding any seams and eliminating the over-shading penalty. This saves approximately 0.5%.

Although a 0.5% savings is generally not significant enough to optimize for, there are specific use cases where this problem can be amplified dramatically.

## Complex Shapes and Over-Shading Problems

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031512.png)

Consider a zoomed-in view of a dialog box with a rounded corner. One common approach is to render a triangle fan from the center of the panel to the edge of the screen. This method results in many edges along the curved radius, and the rasterizer will issue many partial fragment shading quads.

This approach forces the rasterizer to work extremely hard, loading many thin triangles into tiles and causing 4x over-shading in certain areas. This is a costly method due to the long, thin diagonal triangles, which are a poor fit for rasterizing on GPUs.

## A Better Triangulation Algorithm

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031248.png)

A more efficient algorithm produces the same visual result but changes the triangulation pattern. A recursive algorithm can be used, starting with a large triangle in the corner and subdividing recursively to improve the rounded radius. This reduces the number of edges and provides significantly better performance.

## Practical Applications

We've used this technique in practical applications such as car dashboards, where circular dials are rendered. Using this "max area" algorithm can yield 3 to 5 times better performance for achieving pixel-accurate edges.

## Conclusion: Avoid Long Thin Diagonal Edges

In summary, it's crucial to avoid long, thin diagonal edges in rasterization whenever possible. By using better algorithms, performance can be dramatically improved without compromising visual quality.

## Introduction to Texturing

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031559.png)

Next, we move on to texturing, covering the basics: resolution, color format, and compression techniques. On mobile devices, there's now a wide range of compression formats available, including ETC1, ETC2, and ASTC.

## Mipmapping for 3D Content

For 3D content, always use mipmapping. Mipmapping improves texture cache efficiency and generally enhances visual quality, so there are very few reasons not to implement mipmaps in your textures.

## Legacy Compression Techniques

Be cautious with older techniques, such as storing RGB in ETC1. ETC1 is a compression format that only supports RGB and doesn't include Alpha. A common workaround used in the past was to double the width of the image—storing RGB on one half and Alpha on the other as a grayscale image. To retrieve the RGB value, two samples were required.

## Modern Compression Formats

However, with newer hardware, we now have ETC2 and ASTC formats, which offer native RGBA compression. These formats provide the same or sometimes better bandwidth than ETC1, but only require a single sample. This reduces the workload on the texture filtering unit.

## Conclusion: Avoid Legacy Techniques

While legacy techniques like the ETC1 workaround were useful in the past, better alternatives are now available. ETC2 and ASTC compression formats offer more efficient solutions and should be preferred whenever possible.

## ASTC Format Overview

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031908.png)

For **ASTC (Adaptive Scalable Texture Compression)**, it's the only ARM-invented format, and we're very proud of it. It's almost universally adopted on Android now, with the 2D LDR profile being mandatory in **OpenGL ES 3.2**. This means that ASTC is available nearly everywhere, even for **Vulkan**. On mobile, the **2D HDR profile** is widely supported, though not universally so. While we support it and **Adreno** supports it, some other vendors do not.

## Flexibility and Compression

The most useful aspect of ASTC is that it offers a wide range of bitrates and color formats, allowing it to compress almost anything at a reasonably low bitrate. It typically outperforms **ETC 2** by about half a decibel (or a quarter of a decibel) even when operating at around a 10% bitrate deficit. This makes ASTC a high-quality, low-bitrate format.

## ASTC Texture Compressor

We've developed our own texture compressor, called **ASTC Encoder**, which is available on GitHub. It stands out as one of the better compressors in terms of performance. Additionally, it includes dedicated error modes for compressing **normal maps** and **mask maps**, resulting in higher-quality normal maps compared to other formats.

## Decode Mode and Performance

There are some extensions available that utilize **decode mode**, allowing decompression to reduce immediate precision. This helps with the texture cache inside the GPU, which is crucial for achieving faster texture compression paths on the **Mali G77** and **Valhall GPUs**. Whenever possible, we recommend using the **decode mode extensions**, as they provide better performance on newer hardware.

## Texture Filtering Overview

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031951.png)

The second part of texturing involves **texture filtering**, which is set via the API. **Mali hardware** is optimized for **bilinear filtering**, which means it's most efficient when using linear mapping nearest. This setup takes samples from a single mipmap level and chooses the mipmap level based on screen space coverage in the hardware. This configuration offers the optimal case, delivering a single cycle per sample with a reference bandwidth cost of **1X your byte cost**.

## Trilinear Filtering

**Trilinear filtering** is an interpolation between two bilinear samples, allowing for smoother transitions between mipmap levels. You'll notice the blending on cube faces, but this comes at a cost—it is twice as expensive as bilinear filtering. In some cases, trilinear filtering can consume up to five times the bandwidth because it fetches data from the next-most detailed mipmap level, which means four pixels worth of data versus one in the current map. Although this technique eliminates the step change between mip levels, it can become more expensive.

## Anisotropic Filtering

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031661.png)

**Anisotropic filtering** is the more advanced technique, increasingly used in the latest titles for its superior visual quality. It essentially performs a patch-based integral for each pixel by making multiple samples from high-detail mipmap levels. For instance, in the most detailed Level 0 map, anisotropic filtering fetches every single sample. This process requires much more bandwidth, pulling in more data to the GPU and taking additional samples.

In the filtering process, the blue areas represent one trilinear sample, the purple areas make two samples, and the orange areas make three. For the orange parts of the cube, six cycles of filter sampling are performed. While anisotropic filtering provides a very high-quality visual output, it's also expensive. A **4X max anisotropy** with trilinear filter samples can be up to **8 times the cost** and require **64 times the bandwidth**. Although these extreme numbers aren't applicable everywhere, anisotropic filtering can become expensive quickly, depending on the triangle orientation.

## Recommendations for Filtering Techniques

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032943.png)

- **Bilinear filtering** is the most efficient, requiring just one cycle per sample and should be your default choice.
- **Trilinear filtering** uses two cycles and is a middle-of-the-pack option.
- **Anisotropic filtering** with a max anisotropy of 2 (using bilinear samples) can require either one or two cycles, making it potentially cheaper than trilinear filtering. It's worth trying as it can offer a visual quality boost at a relatively low cost.

## Anisotropic Filtering Usage

Anisotropic filtering isn't something to avoid but rather a technique to use with care. **Anisotropic filtering with 2X trilinear samples** ranges between **one and four cycles**, so it’s worth experimenting with. Depending on the scene and triangle orientation, it may not be much more expensive than trilinear filtering, while still offering a noticeable visual improvement.

The **4X modes** and higher (6X, 8X, etc.) are more expensive, so use them carefully. Keep in mind that **max anisotropy** doesn’t need to be an even number like 2. You can use values like **3, 4, or 5** and still achieve a performance boost.

## Max Anisotropy: What It Does and How It Works

**Max anisotropy** is a setting used to control the level of **anisotropic filtering** applied to textures in a 3D application. Anisotropic filtering improves the visual quality of textures, especially when viewed at sharp angles, by enhancing the clarity of textures that appear stretched or distorted.

When **anisotropyEnable** is set to `VK_TRUE` in Vulkan, the value of **maxAnisotropy** controls the number of samples taken during the anisotropic filtering process. The range of **maxAnisotropy** must be between **1.0** and the value of `VkPhysicalDeviceLimits::maxSamplerAnisotropy`, which defines the upper limit of anisotropy that the GPU can handle.

## What Max Anisotropy Does

- **Max anisotropy** determines how many texture samples are taken to compute the final color for a pixel.
- A higher **maxAnisotropy** value results in better texture quality, especially at oblique viewing angles, but it also increases computational cost (increased GPU bandwidth usage and processing cycles).
- Lower values (closer to 1.0) use fewer samples and result in less detailed textures but are computationally cheaper.

## How to Calculate Max Anisotropy

The value of **maxAnisotropy** is typically set based on a balance between performance and visual quality. You can calculate or determine the **maxAnisotropy** value depending on the following:

1. **GPU Limits**: The maximum value of anisotropy is hardware-dependent, as defined by `VkPhysicalDeviceLimits::maxSamplerAnisotropy`. This value varies across different GPUs and typically ranges from 2.0 to 16.0.
2. **Performance Trade-off**: Increasing the anisotropy level can significantly increase the number of samples taken for each texture fetch. As a rule of thumb:
    - **Anisotropy 1.0** (bilinear): No additional samples, and the cheapest in terms of performance.
    - **Anisotropy 2.0**: Doubles the samples compared to bilinear filtering.
    - **Anisotropy 4.0, 8.0, 16.0**: Increasing progressively requires more bandwidth and cycles, making it progressively more expensive in terms of performance but also sharper in terms of texture clarity.

## Recommended Usage

- **MaxAnisotropy = 1.0**: Uses no anisotropic filtering (bilinear or trilinear filtering). This is the least expensive in terms of performance.
- **MaxAnisotropy = 2.0**: Typically a good trade-off for performance and quality.
- **MaxAnisotropy = 4.0 or 8.0**: Used for higher-quality visual outputs in high-performance systems or games where visual fidelity is a priority.
- **MaxAnisotropy = 16.0**: The highest quality setting, giving the best visual clarity but also consuming significant GPU resources.

In conclusion, **maxAnisotropy** is crucial for improving texture quality, but the value should be carefully chosen based on hardware capabilities (`VkPhysicalDeviceLimits::maxSamplerAnisotropy`) and the desired performance/quality balance.

## 计算各向异性过滤后的值

[Texture Filter Anisotropic](https://registry.khronos.org/OpenGL/extensions/EXT/EXT_texture_filter_anisotropic.txt)

在 **各向异性纹理过滤（anisotropic texture filtering）** 中，目的是通过对纹理进行多个方向的采样来减少视角倾斜时的模糊现象。它根据纹理映射到屏幕的形状调整采样过程，尤其是当纹理在锐角上被观察时。这与传统的各向同性过滤（如双线性或三线性过滤）不同，后者假设纹理在各方向上的分辨率相同。

在 OpenGL 扩展 `GL_EXT_texture_filter_anisotropic` 中，计算各向异性过滤的核心步骤如下：

## 1. 计算纹理在屏幕空间的缩放系数 Px 和 Py

- **Px** 和 **Py** 表示像素在屏幕空间中的投影，分别沿着 u 和 v 方向（纹理的两个轴）计算：
    
    $Px = \sqrt{ \left( \frac{\partial u}{\partial x} \right)^2 + \left( \frac{\partial v}{\partial x} \right)^2 } \\ Py = \sqrt{ \left( \frac{\partial u}{\partial y} \right)^2 + \left( \frac{\partial v}{\partial y} \right)^2 }$
    
- **Px** 和 **Py** 是分别沿着 u 和 v 方向的纹理坐标变化率。如果纹理在某个方向上被拉伸，缩放系数会较大。

## 2. 计算最大和最小缩放系数

- 计算 **Pmax** 和 **Pmin**，分别为最大和最小缩放系数：
    
    $Pmax = \max(Px, Py) \\ Pmin = \min(Px, Py)$
    

## 3. 计算采样数 N

- 采样数 **N** 是根据 **Pmax/Pmin** 和最大各向异性度（`maxAnisotropy`）来确定的：
    
    $N = \min\left(\left\lceil \frac{Pmax}{Pmin} \right\rceil, \text{maxAniso}\right)$
    
    其中，`maxAniso` 是由 `TEXTURE_MAX_ANISOTROPY_EXT` 指定的值或 GPU 硬件的限制值 `MAX_TEXTURE_MAX_ANISOTROPY_EXT`。这个值定义了在各向异性过滤时最多允许的采样数。
    

## 4. 计算细节层次 (LOD)

- **λ' (Lambda Prime)** 是用来计算所需的细节层次（LOD）的值，它表示在纹理空间中每个像素的采样分辨率。公式如下：
    
    $\lambda' = \log_2 \left(\frac{Pmax}{N}\right)$
    
- **λ'** 的值表示应该从哪一个细节层次（mipmap 级别）获取采样。

## 5. 使用 N 个采样进行加权平均

- 最后，根据确定的采样数 **N**，在纹理的特定细节层次 **λ'** 上进行多个位置的采样，然后对这些采样结果进行加权平均以生成最终的纹理颜色值。

例如，如果 **Px > Py**，那么在 **u** 轴方向上采样 **N** 次：

$\text{TauAniso} = \frac{1}{N} \sum_{i=1}^{N} \text{Tau}\left(u(x - 1/2 + \frac{i}{N+1}), v(x - 1/2 + \frac{i}{N+1})\right)$

这个过程可以通过多个采样点来更好地捕捉到纹理在不同方向上的细节，减少由于视角变化引起的模糊。

**Tau** 是表示单个纹理采样结果的符号。它代表从纹理中取样后的颜色值或纹理数据。

当使用各向异性过滤时，**Tau** 通常指的是在某个特定细节层次（mipmap 级别）上，基于像素的坐标 `(u, v)`，从纹理中取样得到的结果。

具体而言：

- **Tau(u, v, λ)** 表示在给定的纹理坐标 `(u, v)` 和细节层次 **λ**（LOD 层级）下，对纹理进行采样后得到的值。
- 在各向异性过滤中，多个 **Tau** 采样结果会基于不同的采样位置进行加权平均，以得到更加精细的纹理过滤效果。这些采样位置通常是沿着纹理的主方向（Px 或 Py）分布的。

例如，使用 **N** 个采样时，多个不同位置的 **Tau** 值会被平均起来，生成一个经过各向异性过滤的最终值，这就是你在屏幕上看到的纹理颜色。

简单来说，**Tau** 就是各个纹理采样点上的颜色数据或纹理值，在各向异性过滤中会取多个 **Tau** 值并做加权平均以获得最终的结果。

## 总结

各向异性过滤通过计算像素在纹理空间中的投影（即缩放系数 Px 和 Py），并根据这些缩放系数计算出最大和最小的比例，从而确定需要进行的采样次数 **N**。然后，通过加权多个采样结果，得到更高质量的纹理渲染结果。这种方法能有效提高在锐角视图中的纹理清晰度，但同时也会增加 GPU 计算和带宽的消耗。

This text describes an extension in OpenGL for implementing anisotropic texture filtering, which improves image quality by accounting for the anisotropic nature of texture footprints in certain projections. 

Key points:
1. **Isotropic Filtering**: In traditional mipmap texture filtering, it assumes that the projection of the pixel filter footprint in texture space is square (isotropic), leading to blurring when surfaces are viewed at oblique angles.
   
2. **Anisotropic Filtering**: This extension allows for the specification of anisotropic texture filtering, which improves image clarity by considering the non-square (anisotropic) nature of the pixel filter footprint.

3. **Degree of Anisotropy**: Applications can set the maximum degree of anisotropy per texture object, which can improve texture filtering but may reduce performance depending on the hardware's capabilities. The degree is capped by the maximum supported value in the implementation.

4. **Separation from Filtering Mode**: Anisotropic filtering is independent of the minification and magnification filters, but implementations may choose to optimize filtering based on these settings. For the highest quality anisotropic filtering, `LINEAR_MIPMAP_LINEAR` for minification and `LINEAR` for magnification, with a large anisotropy degree, are recommended.

5. **Scale Factors**: The algorithm introduces two scale factors, \( $P_x$ \) and \( $P_y$ \), which represent the footprint in texture space:
   - \( $P_x = \sqrt{du/dx^2 + dv/dx^2}$ \)
   - \( $P_y = \sqrt{du/dy^2 + dv/dy^2}$ \)
   - From these, the maximum (\( $P_{\text{max}}$ \)) and minimum (\( $P_{\text{min}}$ \)) values are calculated, which help determine the level of anisotropic filtering.

6. **LOD Calculation**: The level of detail (LOD) used for anisotropic filtering is adjusted based on the scale factors and the anisotropy level. The formula for the adjusted LOD (\( \lambda' \)) is \( \lambda' = \log_2\left(\frac{P_{\text{max}}}{N}\right) \), where \( N \) is the degree of anisotropy.

7. **Sampling**: Instead of a single texture sample, multiple samples (up to \( N \)) are taken along the dominant axis (either \( x \) or \( y \)), and the results are averaged to determine the final texture value. This averaging process improves texture quality on surfaces viewed at sharp angles.

This extension allows OpenGL to handle anisotropic texture filtering flexibly, improving rendering quality for angled surfaces without requiring specific implementations.

`TauAniso` 是在各向异性过滤过程中计算纹理颜色值时使用的平均采样结果。它通过在像素投影到纹理空间的足迹中，沿着占主导方向的轴（x 或 y 方向）进行多次采样，然后对这些采样结果求平均来得到。

具体来说，`TauAniso` 的计算方式如下：

1. **定义变量**：
   - \( N \): 各向异性过滤的采样次数，取决于 \( $P_{\text{max}}/P_{\text{min}}$ \) 和纹理的最大各向异性值（由 `TEXTURE_MAX_ANISOTROPY_EXT` 或实现限制决定）。
   - \( $\tau(u, v, \lambda)$ \): 对应于标准的纹理采样函数，基于纹理坐标 \( $u, v$ \) 和 LOD 值 \( $\lambda$ \)。
   
2. **计算 TauAniso**：
   - 当 x 方向的投影比例较大（即 \( $P_x > P_y$ \)），在 x 方向上采样 \( $N$ \) 次：

     $\text{TauAniso} = \frac{1}{N} \sum_{i=1}^{N} \tau \left( u(x - \frac{1}{2} + \frac{i}{N+1}, y), v(x - \frac{1}{2} + \frac{i}{N+1}, y) \right)$
     在这种情况下，沿 x 轴方向以均匀间隔对像素在纹理空间的足迹进行 \( N \) 次采样，并将这些采样结果进行平均。

   - 当 y 方向的投影比例较大（即 \( $P_y \geq P_x$ \)），在 y 方向上采样 \( $N$ \) 次：

     $\text{TauAniso} = \frac{1}{N} \sum_{i=1}^{N} \tau \left( u(x, y - \frac{1}{2} + \frac{i}{N+1}), v(x, y - \frac{1}{2} + \frac{i}{N+1}) \right)$
       同理，此时沿 y 轴方向进行采样，并计算采样结果的平均值。

3. **简化**：
   - 一种简化的方式是将纹理坐标函数 \( u(x, y) \) 和 \( v(x, y) \) 与偏导数 \( dudx \) 和 \( dvdx \) 相结合进行采样。在 x 方向上，简化形式为：
 $\text{TauAniso} = \frac{1}{N} \sum_{i=1}^{N} \tau \left( u(x, y) + dudx \left( \frac{i}{N+1} - \frac{1}{2} \right), v(x, y) + dvdx \left( \frac{i}{N+1} - \frac{1}{2} \right) \right)$
     同理，y 方向上简化为：
$\text{TauAniso} = \frac{1}{N} \sum_{i=1}^{N} \tau \left( u(x, y) + dudy \left( \frac{i}{N+1} - \frac{1}{2} \right), v(x, y) + dvdy \left( \frac{i}{N+1} - \frac{1}{2} \right) \right)$
    

通过以上计算，`TauAniso` 将使用不同的采样点对纹理值进行求平均，以此改善在倾斜角度观看时纹理的模糊问题。这种方法通过各向异性过滤提高了纹理的清晰度。

## YUV Camera Sources

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032435.png)

If you're talking to the camera, use the extensions to give you direct access to the yuv data. Don't map it yourself and do color conversion in software. We automatically handle multiplane surfaces. We automatically handle color space conversion in the hardware. so doing it in software also will be less efficient.

**Side-scroller parallax background** 是一种用于横向卷轴游戏中的视觉效果，通过背景中多个层次（**layers**）的移动速度不同，创造出景深感。这种效果通过让每一层的背景以不同的速度移动，模拟出一种“3D”的视觉效果，尽管游戏是2D的。通常，越靠近前景的物体移动得越快，越远的背景移动得越慢。

想象一个简单的横版游戏，比如《超级马里奥》（Super Mario Bros.）。当马里奥向右跑的时候，前景中的草地和树木可能以较快的速度向左移动，而远处的山和云移动得非常慢。这种差异就让人感觉游戏世界有深度。

## **Side-scroller Parallax Background - Detailed Explanation:**

In a **side-scroller** game (where characters move from one side of the screen to the other), the **parallax effect** is a visual trick used to create the illusion of depth in a 2D world. Here’s how it works:

- **Foreground:** This layer is closest to the player and moves the fastest. It might include elements like ground, trees, or rocks that are nearby.
- **Midground:** This layer moves slower than the foreground and represents objects that are further away, like hills or distant buildings.
- **Background:** This layer moves the slowest, showing far-away elements like mountains, the sky, or clouds.

## **How the Parallax Effect Works:**

As the player moves across the screen, the layers shift at different speeds:

- **Closer objects (foreground)** move faster.
- **Distant objects (background)** move slower.

This difference in movement speed simulates depth, making the 2D environment feel more immersive and 3D-like.

## Blended Overdraw

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032209.png)

One key consideration in fragment shading is overdraw, particularly in 2D rendering. This can affect particle systems, smoke grenades, fog, and similar effects. The problem boils down to the accumulated cost per pixel.

## Example: Parallax Sidescroller

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032557.png)

Take a typical parallax sidescroller with multiple layers of background, each panning at different rates. A high-end background might have seven layers, which looks visually appealing but can be expensive in terms of performance. Artists often cut out pieces of layers to minimize triangle usage, and when edges are blended with transparency, they render the whole layer with blending turned on.

## Impact of Overdraw

If all layers use blending, overdraw can build up significantly. For example, with five or six layers, you might end up with 6x overdraw in certain parts of the screen. Even with simple textured blits, targeting low-end devices at 1080p60, a 6x overdraw can easily exceed the available cycles, affecting performance — especially when additional gameplay elements like monsters or spell effects are added on top.

## Reducing Overdraw

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032712.png)

A more efficient technique involves cutting out opaque sections of layers using as few extra vertices as possible. Draw opaque areas first, then render the transparent parts separately. Ideally, you would render opaques front-to-back and transparents back-to-front for proper blending.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032528.png)

## Practical Application

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032722.png)

In practice, retrofitting this technique into existing 2D engines can be challenging. You can often get away with rendering opaques and transparents layer-by-layer from back to front. While this doesn’t guarantee the full benefit of early Z culling, it’s an easier approach to implement in 2D libraries.

## Results

By applying these optimizations, you can reduce overdraw from a peak of 5x to an average of less than 2x, significantly improving performance while maintaining visual quality.

# Shader

## Shader Programs and Precision

In this section, we will explore the importance of precision in shader programs and how to optimize your usage of floating point (FP) operations for energy efficiency and performance.

## Using Medium Precision (FP16)

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032793.png)

One of the most critical recommendations is to use **medium precision (FP16)** wherever possible. FP16 has several advantages:

- It uses **half the energy** compared to high precision (FP32) by toggling fewer transistors.
- FP16 allows packing **twice as many operations** into a register file.
- It runs **twice as fast** due to the ability to perform FP16 vector SIMD operations for 16 operations at once.

However, there are cases where you need **high precision (FP32)**:

- **Position and depth calculations** often require high precision.
- **Texture coordinate calculations** may also need it depending on the scenario.

## Beware of Casting Between Precision Types

Casting between medium precision (FP16) and high precision (FP32) is **not free**. This conversion requires additional instructions, so only use it when necessary. For instance, if you have to perform format conversions just to save one high-precision operation, it’s probably more efficient to perform the entire calculation in high precision.

## Compiler Optimization and Floating Point Math

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032269.png)

Be mindful that the **compiler won’t always optimize** shader code for you, especially when it comes to **floating point math**. For example:

- Consider a scenario where two textures are scaled by the same factor and then added together. In mathematics, you could factorize the scale to perform the multiplication once. However, in floating point math, this isn’t always safe.

## Example of Non-equivalence in Floating Point Math

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032644.png)

Imagine we have two values, `A` and `B`, both set to the maximum FP16 value:

- If you scale them by 0.5 before adding them together, the result will be correct.
- But, if you add `A` and `B` first, the sum exceeds the maximum FP16 range, resulting in **infinity**. Scaling infinity by 0.5 still results in infinity, and thus the information is lost.

Due to such edge cases, compilers tend to be conservative with floating point math and won’t reorganize or optimize code as aggressively as they do for integer math.

## Manual Optimization in Shader Code

In shader programs, you should be aware that the compiler may not always optimize code for you. It’s up to the developer to **manually apply optimizations** in the source code to ensure consistent results. For complex shader math, such as floating point operations, relying solely on the compiler could lead to unexpected behavior or performance issues.

## Built-in Functions

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172033936.png)

There's a large library of built-in functions available in shaders, and it's highly recommended to **use them**. These functions are:

- Generally more **readable**.
- Often backed by **hardware support** or handwritten assembly, optimized for the target GPU by the compiler team.

For example, a color key operation might take **5 instructions** on a typical GPU like the Mali-8860, but by using vector built-in comparisons, it can be reduced to **3 instructions**.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032663.png)

However, **be cautious with some built-ins** as they can be expensive:

- Trigonometric functions like `sin()`, `cos()`, and `tan()` are **not extortionately expensive**, but they aren't free either.
- **Atomics** are typically slower on most GPUs.
- The `textureGrad()` function and manually rolling texture lookups can also be **costly** on current hardware.

## Uniform Computations

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032466.png)

Be mindful of **uniform computations**—those operations that depend only on uniforms or literals. Since every thread in a draw call produces the same output, there is no variation. Though drivers can optimize it out, this process isn't free and consumes **some cycles**.

If possible, perform uniform computation on the **CPU** and upload modified uniforms to the shader. This approach can save GPU processing time.

## Specialization and Branches

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032546.png)

Avoid writing **overly generic shaders** that rely on many conditionals (e.g., `if (this) do A; else do B`). Modern hardware handles **branches** better than older generations, but they are still **not free**:

- Where possible, **specialize** shaders to avoid runtime control flow.
- Branches can erode performance if there's significant **control flow divergence**—where different threads in a warp follow different branches.

For older GPUs, like **Midgard** architecture, **branches** had a more substantial impact due to packing inefficiencies across branch boundaries. On newer GPUs like **Bifrost**, branches are mostly free, and you don't need to go out of your way to avoid them.

## Vector and Scalar Types

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032533.png)

For older GPUs, like **Utgard** and **Midgard**, using **vector types** (such as matrices and vectors) can help the compiler optimize for **SIMD** operations. However, on modern **scalar** hardware, this doesn’t make as much difference.

## Branching and Divergence

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032503.png)

Branches on modern hardware are typically **cheap** unless they cause **thread divergence**:

- If some threads in a warp execute an `if` statement and others execute the `else`, the warp must process both branches at **half occupancy**, reducing efficiency.

In older Midgard hardware, avoiding control flow by simplifying logic could lead to better performance. For instance, consider a shader that computes lighting for three light sources. If control flow (`if` statements) is used to avoid unnecessary light calculations, the performance may degrade due to branch-related overheads. Simplifying the shader to **always compute the lighting** (even for far-away lights) can sometimes yield better results, as the compiler can repack instructions more efficiently.

## Example from Midgard Architecture

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172034286.png)


![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172032596.png)

In slightly older architectures like **Midgard**, shader programs often attempt optimizations to reduce computation. For instance, a shader might compute lighting for three light sources. Inside the **specular light calculation**, an `if` statement checks if the light distance is less than a certain threshold (a "cut length")—if the light is close enough to the pixel, the calculation is performed; otherwise, it's skipped.

- When **no lights** are visible, this calculation takes **5 cycles**.
- When **all three lights** are visible, it takes **13 cycles**.

## Eliminating Conditional Logic for Better Performance

If we simply **remove the `if` statement** and always compute the lighting for all three sources, regardless of distance:

- The shortest path increases slightly, from **5 to 7 cycles**.
- The longest path, however, **drops from 13 to 7 cycles**.

Without the conditional logic, the compiler can optimize the code by repacking the instructions into **better bundles**, leading to a significant performance boost.

## Computation vs. Branching

In Midgard GPUs, often it's **cheaper to do the computation** than to attempt avoiding it through branching. Allowing the compiler to process the entire program without unnecessary control flow lets it make better use of the GPU’s **SIMD pipelines** and **complex instruction bundles**.

## Modern Hardware: Bifrost and Beyond

For newer architectures, like **Bifrost**, the cost of branches is **minimal**. Therefore, you don’t need to worry too much about avoiding them. In many cases, **branches are nearly free** on modern hardware.

## Avoiding Over-Optimization

Avoid trying to write overly complex code just to avoid a simple `if` statement. The **compiler** is quite effective at handling such cases and will often optimize by inserting **conditional selects** or **other mechanisms** to avoid performance degradation. You don’t need to manually optimize these by using complicated math techniques.

## Compiler Optimizations

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172031261.png)

Modern compilers are very good at handling **simple branches** and will often replace them with conditional selects or other optimizations. So, don't over-complicate your shader code by trying to manually avoid simple `if` statements—the compiler is likely to optimize them effectively.

## Optimizing Data Packing

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030635.png)

When working with shaders, it's important to pack data efficiently. **Vector instructions** for loading and interpolating data are available, and using them correctly can save time and resources. For instance:

- **Loading a `vector4`** is more efficient than two `vector2`s.
- Loading **32-bit chunks** as vectors is more efficient than using a `vector3` plus a float.

This helps make the best use of **vector instructions**, allowing you to minimize padding and optimize attribute usage.

## Beware of Late-Z Updates

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030769.png)

There are certain operations in shaders that force the program down a **less efficient path**:

- Using a **`discard`** statement results in a **late-Z update**.
- Modifying the **fragment depth** also causes late-Z updates, preventing hidden surface removal.
- **Reading from the framebuffer** marks your shader as **transparent**, also causing late-Z updates.

You typically use these features for **algorithmic purposes**, such as **alpha testing** for foliage or bushes. These functions are necessary, but they should be used **sparingly**. Don't use them more than you have to, disable them when you're not using them.

If you’re sure that something is safe, you can enforce **early-Z testing** using the `layout(early_fragment_tests)` qualifier. This tells the GPU that no complex depth modification is happening and enables early depth testing.

## Using Compute Shaders Efficiently

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030513.png)

Compute shaders are quite similar to other shaders, but certain factors can impact performance:

- **Workgroup sizes** are crucial for efficiency. As a general rule, avoid **very large** or **very small workgroups**.
    - **Large workgroups** slow down due to **barrier instructions**.
    - **Small workgroups** may not fully utilize the GPU’s resources or might struggle algorithmically.
    - A good starting point is **64 work items** per workgroup, keeping it a **multiple of the warp size** to avoid partial warps.

The optimal workgroup size can differ from **GPU to GPU** and **vendor to vendor**, so it’s important to experiment to find the best size for a given device.

## Local Memory on Mali GPUs

Unlike some desktop GPUs, **Mali** hardware does not have **hardware-backed local memory**. Instead, local memory is backed by the **load/store cache**:

- Use local memory if necessary for **algorithmic data sharing** within a workgroup.
- Do not treat local memory as an **accelerator pool**, which is common in some desktop GPUs where data is copied from global to local memory for faster access. On Mali, this will only **pollute the cache** and result in slower performance. There’s no performance advantage in this case.

## Local Memory on Mali GPUs

One important consideration when using compute shaders on **Mali GPUs** is the lack of **hardware-backed local memory**. Unlike some desktop GPUs, where **local memory** is a dedicated RAM for threads within a workgroup to share data, on Mali, this concept is different:

- On Mali, local memory is **backed by the load/store cache**, not by dedicated RAM.
- This means local memory can be used for **algorithmic data sharing** within a workgroup, and it will function correctly in those cases.

However, do not treat local memory as an **accelerator pool**, a practice that is common on desktop GPUs:

- On desktop GPUs, copying data from **global memory** to **local memory** can speed up access.
- On Mali, this approach is **inefficient**. Instead of accelerating performance, it will **pollute the cache** and actually make your program run **slower**. There's no performance advantage in doing this on Mali hardware.

## Summary of Optimization Priorities

When optimizing, the focus should be on two key aspects: **doing less work** and **doing it faster**. In general, reducing workload (doing less) has a greater impact than simply trying to make processes faster. Key areas to target include:

1. **Resolution**: Lowering the resolution can provide immediate performance gains.
2. **Frame Rate**: Reducing the frame rate is another quick way to improve performance.
3. **Smaller Models**: Use less complex models, especially in scenes where they are less visible.
4. **Lower Precision**: For most use cases, medium precision (FP16) is sufficient, which leads to faster performance compared to high precision (FP32).

It’s important to budgeting upfront, especially when targeting mass-market devices that have **lower CPU and GPU performance**. Prioritizing optimization areas is essential, and here are six main points to focus on:

## Key Optimization Priorities

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172030306.png)

## Frame Graph Optimization

Getting the **data flow** between render passes clean is critical. The **frame graph** is where you can gain or lose the advantage of using a tiled architecture. Efficient data flow ensures optimal performance in tile-based rendering systems.

## Mesh Level of Detail (LOD)

Consider your **mesh level of detail**. Are you using simpler meshes when objects are far away? Also, pay attention to triangle packing and attribute precision. Make sure to pack attributes in a way that works well with **index-driven vertex shading** so that you're not loading redundant data into your vertex shaders.

## Shader Program Optimization: Precision

The most significant factor in shader program optimization is **precision**. While specialization is helpful, using **medium precision (FP16)** as much as possible can save power, registers, and bandwidth. Try to minimize precision where it makes sense to do so, especially for tasks that don't require high precision calculations.

## Overdraw Considerations

**Overdraw** is less of a concern for 3D games but can be a problem for UI overlay menus. Simple UI content can quickly add up to multiple layers, which becomes expensive in terms of performance. Minimizing overdraw by carefully designing UI elements can help reduce this impact.

## Focus on the Big Picture

Although there are many small details to optimize, in my experience working with Mali for over 10 years, the top six factors usually cover the majority of performance issues. Rarely do we need to dive into extremely complex optimizations for most common cases.

## Developer Guides

Finally, we offer **developer guides** tailored to different roles:

- **Artists**: Texturing, modeling, and other content creation best practices.
- **Engine developers**: API best practices for improving performance and optimization techniques.

These guides can provide valuable insights into how to approach performance tuning for specific tasks.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202510172029239.png)