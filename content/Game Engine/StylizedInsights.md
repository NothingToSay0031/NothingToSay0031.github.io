---
title: 'Stylized Rendering Insights from Japan'
date: '2025-11-02T14:16:31+08:00'
---

# Stylized Rendering Insights from Japan

> 讲座人：Nori Shinoyama (Epic Games Japan, Developer Relations Lead)
>
> 核心背景：风格化渲染在日本的动漫、游戏甚至漫画制作中（如 *Dragon Ball Z: Kakarot*, *No Guns Life*）应用极为广泛。日本开发者最关心的问题是：**"如何实现独特的图形"** 以及 **"如何进行性能优化"**。


[Stylized Rendering Insights from Japan](https://dev.epicgames.com/community/learning/talks-and-demos/7evy/unreal-engine-stylized-rendering-insights-from-japan)



### 讲座议程与焦点

  * **今天将涵盖：**
    1.  风格化渲染的基础知识及其在真实项目中的应用。
    2.  日本专业开发者在实践中关心的问题（特别是性能）。
    3.  在风格化场景中使用UE5新特性（Nanite, Lumen）的注意事项。
  * **今天不涵盖：**
    1.  特定平台（如Switch, PS）的细节。
    2.  具体项目的美术设计决策。
    3.  离线渲染用例（如视频、漫画，UE仅作为导出工具）。
  * **讲座焦点：** 如何在**引擎内（in-engine）完整地实现实时**风格化渲染。

-----

## 风格化渲染的三大基础元素

讲座将风格化渲染拆分为三个基础构建块：

1.  **轮廓线 (Outline)**
2.  **着色 (Shading)**
3.  **风格化后处理 (Stylized Post-Processing)**

-----

## 元素一：轮廓线 (Outlines)

实现轮廓线主要有两种主流方法：**反向外壳（Inverted Hull）和基于后处理（Post-Process Based）**。

### 方法一：反向外壳 (Inverted Hull / "Inverted Har")

这是一种历史悠久且效果可控的经典技术。

  * **核心原理：**

    1.  准备一个**专用于轮廓线的复制网格（outline mesh）**，并将其叠在原始网格上。
    2.  在材质中，将轮廓网格的顶点沿其**法线方向（normal direction）推出（extrude）。这个推出的距离就是轮廓线的粗细**。
    3.  **剔除（cull）轮廓网格的正面（front face）**，只渲染其**反面（back face）**。
    4.  这样，轮廓网格的反面就会从原始网格背后“透”出来，形成轮廓。

  * **优势与技巧：**

      * **精确控制：** 可以基于每个物体或每个网格进行精确调整。
      * **动态粗细：** 开发者常将轮廓线粗细或遮罩（mask）数据存储在**顶点色（Vertex Color）**中，以便在不同情况下动态调整。
      * **混合使用：** 有时也会在纹理上**直接绘制轮廓线**，作为此技术的补充。

  * **材质实现 (简单版)：**

      * 使用 **World Position Offset (WPO)** 节点，将顶点沿 **Vertex Normal** 推出。
      * 材质需要设为 **Two-Sided**。使用 **Two-Sided Sign** 节点（正面返回+1，反面返回-1）连接到 **Opacity Mask**，以剔除正面。

  * **UE 5.1 的重大改进：Overlay Material**

      * **UE4 的痛点：** 对于骨骼网格体（Skeletal Mesh），你需要**两个Skeletal Mesh Component**（一个原始，一个轮廓线），并且需要创建**动画蓝图（Animation Blueprint）来同步它们的动画**，非常繁琐。
      * **UE5.1+ 的方案：** 引入了 **Overlay Material** 功能。
      * **使用方法：** 你只需要在网格组件的细节面板中，将你的轮廓线材质指定给 **Overlay Material** 插槽即可。
      * **工作原理：** 引擎会自动使用这个材质**再次绘制（re-draw）**该网格。**不再需要**额外的组件或动画蓝图。
      * **注意：**
        1.  虽然该功能在发布时被称为 "Translucent Overlay"，但它同样适用于 **Masked** 和 **Opaque** 材质。
        2.  如果你使用 Opaque 材质，**必须使用 WPO**，否则会与原始网格产生严重的**Z-Fighting（深度冲突）**。

  * **性能考量：**

      * 使用 **Two-Sided Sign** 的简单方法，其剔除正面/反面的计算是**逐像素（per-pixel）**执行的。
      * 这意味着，**即使是最终被剔除的正面像素，也占用了GPU计算资源**。
      * 当屏幕上有大量角色，或面向低性能平台（如Switch）时，这个开销不容忽视。

  * **性能优化方案：**

    1.  **准备反转法线的资产：** 在DCC工具中就准备好一个法线反转的、只有反面的模型。
    2.  **自定义剔除：** 在渲染设置中直接**剔除正面（cull the front face）**，从硬件层面就阻止正面进入光栅化，而不是在像素着色器中处理。

### 方法二：基于后处理 (Post-Process Outline)

这是一种全局效果，通过单个后处理材质实现。

  * **核心原理：边缘检测 (Edge Detection)**

      * 这是一个经典的图像处理算法。
      * **工作流程：** 检查当前像素与**其周围相邻像素**在某些**源图像（Source Images）**中的值。
      * **判定：** 如果**差值（difference）**很大，就判定该像素位于边缘。
      * **常用滤镜：** Sobel, Laplacian, Robert Cross 等。
      * **源图像：** 通常来自 **G-Buffer**，最常用的是 **Scene Depth（场景深度）** 和 **Normals（法线）**。

  * **为什么不用更复杂的算法？**

      * 不是因为实现困难，而是因为**GPU开销**和**美术调整的困难度**。

  * **案例学习：*Valkyrie Elysium* (Square Enix / S Game Studio)**

      * 他们使用后处理来实现角色轮廓线。
      * **使用的源图像：** **Normal**, **Depth**, 以及 **Material ID**。
      * **引擎修改：** 为了能从G-Buffer中读取Material ID，他们**修改了UE引擎**。
      * **分层算法：**
          * **背景：** 只使用 **Depth** 来绘制轮廓，且轮廓线粗细随深度变化。
          * **植被 (Foliage)：** 使用 **Shading Model** 来检测边缘。

  * **性能警告：**

      * 后处理轮廓线虽然看起来简单，但**GPU开销可能非常大 (very heavy)**。
      * **原因：** 为了达到理想的美术效果，你可能需要从**多个G-Buffer纹理**中**读取大量像素**，并执行**大量的条件运算**。

-----

## 元素二：风格化着色 (Stylized Shading)

  * **核心概念：**

      * **自定义材质对光照的反应**，以匹配期望的艺术风格，而不是遵循物理正确的（PBR）光照模型。
      * 最常用的技术是使用**查找表 (Lookup Table, LUT)** 来重载（override）着色。

  * **三种实现路径的权衡：**

    1.  **在材质中实现 (Material-based)：**

          * **方法：** 在材质编辑器中实现所有着色逻辑，然后将其连接到 **Emissive（自发光）** 节点输出。
          * **获取光照：** 需要通过 **Material Parameter Collection (MPC)** 或蓝图将光源信息（如方向、颜色）手动传入材质。
          * **优点：** 艺术家**无需修改引擎**即可创建自定义着色。
          * **缺点：** **完全绕过（ignores）**了UE强大的内置光照系统（如阴影、多光源、不同的Shading Model等）。

    2.  **在后处理中实现 (Post-Process-based)：**

          * **方法：** 使用后处理材质，读取G-Buffer中的信息（如BaseColor, Normal）来重构光照。
          * **优点：** 可以利用G-Buffer信息，轻松更改整个场景的风格。
          * **缺点：** 难以实现**特定物体**或**特定光源**的精细化着色交互。

    3.  **业界方案：自定义渲染路径 (Custom Shading Path)**

          * **结论：** 经过对日本游戏公司的访谈，发现**几乎所有（almost all）大型项目都为了其独特的着色系统而定制了他们自己的着色路径**。
          * 这是一个结合了材质、光照和后处理的**混合（hybrid）**方案。
          * **关键点：** 这不代表*必须*修改引擎才能做风格化渲染。但是，对于追求独特视觉的大型项目，**定制渲染路径（customizing the rendering path）**是常见做法。

  * **案例：*Idolmaster Starlit Season* (Bandai Namco)**

      * **挑战：** 角色（偶像）需要在**各种复杂的光照环境**下（如舞台灯光）跳舞，着色系统必须在所有情况下都表现良好。
      * **解决方案：**
        1.  **修改了 G-Buffer**（以存储自定义数据）。
        2.  **修改了 Shading Model**。
        3.  添加了他们自己的、名为 **"Deferred Tune" (延迟卡通渲染)** 的专属渲染路径。
      * **收益：** 通过这种方式，他们既能**享受到UE强大的光照系统（如阴影、动态光）带来的好处**，又能实现他们自己**独特且稳定的卡通着色**效果。

  * **案例：*Hi-Fi Rush* (Tango Gameworks)**

      * **成就：** 在Xbox Series X上以原生4K/60fps实现了极高水平的风格化表现。
      * **关键点：** 引擎被**重度定制（heavily customized）**。这是一个强大的闭源实现，但（讲座）无法深入探讨其细节。

  * **案例：*真·女神转生V* (Atlus)**

      * **艺术目标：** 创造一种既非动漫、也非写实，而是**“插画感” (illustrations)**的视觉风格。
      * **技巧1：阴影遮罩 (Shadow Mask)**
          * **定义：** 一种基于纹理的功能，用于**阻止阴影投射**到你不想让它出现的特定区域。
          * **应用：** 即使眼皮闭上，阴影也不会落在眼球上，**始终保持眼睛的清晰和高光**。
      * **技巧2：伪各向异性反射 (Pseudo Anisotropic Reflection)**
          * **定义：** 在头发材质中实现的**伪造高光**，在日本动漫和插画中非常常见，俗称**“天使环” (Angel Rings)**。
          * **关键实现：** 这是在**材质内部**实现的，因此高光效果**完全独立于（independent of）**场景中的光源方向。
      * **技巧3：法线转移 (Normal Transfer)**
          * **问题：** 当模型多边形（如鼻子）过于平坦时，无法获得良好的明暗过渡。
          * **方案：** 从DCC工具（如Maya）中导入一个**单独创建的法线信息**，并将其作为**法线贴图（Normal Map）**使用，以“雕刻”出更清晰的面部轮廓。

  * **案例：*蓝色协议 (Blue Protocol)* (Bandai Namco)**

      * **挑战：** 实现高质量动漫风格中，**眉毛需要始终显示在头发前面**。
      * **方案1（项目实践）：** 添加了一个**专用于眉毛的特殊渲染路径（special rendering path）**。
      * **方案2（讲师建议）：** 也可以尝试使用 **Pixel Depth Offset (PDO)**，在材质中将眉毛的像素深度向摄像机拉近。

  * **案例：*英雄不再3 (No More Heroes 3)* (Grasshopper Manufacture)**

      * **挑战：** 实现更自然的边缘光（Rim Lighting）。
      * **常规方案：** 在材质中使用 **Fresnel（菲涅尔）** 节点。
      * **NMH3 改进方案：** 边缘光的**颜色会受到场景光照的影响而改变**。
          * *例如：* 来自主光源（Key Light）一侧的边缘光是白色的，而来自填充光（Fill Light）一侧的边缘光是蓝色的。这使得角色能更自然地融入场景。

-----

## 元素三：风格化后处理 (Stylized Post-Processing)

后处理是风格化渲染的最后一个重要元素，但使用时需格外权衡。

  * **常见的“全局”风格化滤镜：**

      * **Kuwahara Filter (桑原滤镜)：** 一种非线性模糊算法，可以产生**“油画” (painterly)**或色块化的效果。
      * **Hatching Effect (孵化/影线效果)：** 在阴影区域添加手绘线条。

  * **业界的关键结论：谨慎使用全局滤镜**

      * 讲座采访的大多数游戏公司**最终并未使用**这类会**剧烈改变整个屏幕**的滤镜。
      * **核心原因：没有“放之四海而皆准”的方案 (No one fits all solution)**。
      * 游戏场景太复杂了（镜头、光照、物体都在移动，还有VFX和UI），很难让一个滤镜在所有情况下都表现良好。

  * **更优方案：局部/混合使用 (Partial Use)**

      * **案例：*火影忍者博人传：新忍出击***
          * **用法：** **局部使用（partially used）**。仅在**角色阴影内部**添加影线效果，以增加手绘感和“接地感”。
      * **案例：*Hi-Fi Rush***
          * **用法：** 将影线效果添加在 **AO（环境光遮蔽）** 的计算路径中，作为一种风格化的AO表现。
      * **案例：*Valkyrie Elysium* (实现色彩)**
          * **艺术需求：** 世界是毁灭的（低饱和度），但**暗部区域又需要有丰富的色彩**。
          * **方案：** 在后处理中，创建了一个**暗部区域的遮罩（mask）**，然后使用一个 **3D RGB噪点纹理（3D noise RGB texture）** 来为这些暗部上色。

  * **UE内置后处理依然重要**

      * **案例：*鬼灭之刃：火之神血风谭* (CyberConnect2)**
          * 该游戏成功捕捉了日式动画的速度感和运动感。
          * **关键点：** 制作组明确表示他们使用的是 **UE4 的标准景深 (DOF) 和辉光 (Bloom)** 效果。
          * **启示：** 在你决定“造轮子”之前，请先**充分挖掘标准后处理工具的潜力**。

-----

## 讲座核心总结：给开发者的关键启示

这是讲座中最重要的部分，总结了日本开发者在风格化渲染上的宝贵经验。

1.  **偏爱简单方法的组合 (Combination of simple method is preferred)**

      * 业界更倾向于使用**多种简单的、美术驱动的（Artist-driven）**技术（如阴影遮罩、法线转移）进行组合，而不是依赖某一个复杂、高技术的单一算法。

2.  **“2%”的视觉错误更致命 (The 2% visual error is more noticeable)**

      * 相比于98%的稳定画面，那2%的视觉破绽（如边缘光闪烁、阴影错误）会更引人注目。而修复这最后的2%，往往需要付出极大的努力。

3.  **定制引擎是事实 (Customize rendering code)**

      * 讲师坦言：这是一个事实，**大量（A lot of）的开发者为了实现其独特的图形需求而定制了引擎的渲染代码**。

4.  **风格化不等于低消耗 (Stylized rendering... can require a lot of GPU resources)**

      * 风格化渲染虽然**看起来**比PBR“简单”，但它（尤其是各种后处理和多Pass绘制）可能会**消耗大量的GPU资源**。

5.  **在优化前先分析！ (PROFILE BEFORE OPTIMIZATION)**

      * 这是讲师**最想强调**的一点。
      * 不要盲目地套用网络上的优化技巧（如“降低多边形数量”、“降低贴图分辨率”等）。
      * **你必须（MUST）在目标平台上定期进行性能分析（Profiling）**，找出真正的瓶颈所在。
      * 在开发末期才开始做性能分析和优化，是一种**非常糟糕的实践（"is not kawaii"）**。

-----

## UE5 新特性 vs 风格化渲染

在风格化场景中使用 Nanite, Lumen 和 TSR 时需要注意的兼容性问题。

#### 1\. Nanite

  * **可以使用吗？** **可以**。像素着色器（Pixel Shader）的评估不受影响。
  * **严重限制 (Keep in mind)：**
    1.  **不支持 Overlay Material：** 前面提到的用于“反向外壳”轮廓线的 **Overlay Material 功能尚不支持** Nanite。
    2.  **不支持顶点色 (Vertex Colors)：** Nanite **不支持顶点色**。这对风格化渲染是**巨大打击**，因为顶点色常被用于存储各种遮罩（如阴影、轮廓线粗细等）。
  * **"我的美术风格很简约，还需要Nanite吗？"**
      * **需要！前提是你用了 Lumen 或 VSM (虚拟阴影贴图)。**
      * **原因：** Lumen 和 VSM 处理**非Nanite（non-Nanite）物体的开销远高于**处理Nanite物体。为了GPU性能，你应该尽可能多地将物体转为Nanite。

#### 2\. Lumen

  * **适用场景：**
      * 与简单的材质和**基于后处理的风格化**效果配合良好（因为后处理不在乎光是来自Lumen还是直接光照）。
  * **严重限制 (Limitations)：**
    1.  **Lumen Scene 的材质限制：**
          * Lumen 使用一个**高度简化（simplified a lot）**的 "Lumen Scene" 来计算GI。
          * 在这个Lumen Scene中，**材质的评估（material evaluation）非常受限**。
          * **后果：** 你精心制作的复杂风格化材质，在Lumen Scene中**可能无法正确表现**，导致GI和反射的效果与你预期的完全不同。（*建议：必须创建各种测试场景来验证*）
    2.  **Emissive（自发光）照明：**
          * **不要（avoid）**单独使用自发光作为直接光源（Direct Lighting）。
          * **后果：** 在切换镜头时，Lumen的GI更新会产生**强烈的延迟（strong delay / lag）**。
          * *建议：* 使用**伪造的点光源（pseudo point lights）**来代替。

#### 3\. TSR (Temporal Super Resolution)

  * **核心问题：** TSR 会**合成前几帧的信息**来实现抗锯齿和上采样。
  * **风格化渲染的冲突：**
    1.  **模糊/抵消效果：** TSR 可能会**抵消（cancel out）你的风格化效果（如锐利的边缘、像素化的笔触），使其在摄像机移动时看起来很模糊（blur）**。
          * *建议（UE 5.1+）：* 尝试设置 CVar `r.TSR.ShadingRejection.Flickering = 0`，这可能在一定程度上改善鬼影或模糊。
    2.  **不透明材质上的纹理动画 (Texture animation on opaque materials)**
          * 在风格化渲染中，水、烟雾等常被设为 **Opaque 或 Masked** 材质（而非 Translucent）。
          * **后果：** 在 Opaque 材质上做纹理动画（如滚动噪点），会导致 **“可怕的鬼影” (terrible ghosting)**。
          * *简单修复：* 将该材质设为 **Translucent（透明）**，并将**不透明度（Opacity）设为 1.0**。
