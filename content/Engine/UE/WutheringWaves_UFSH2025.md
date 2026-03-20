---
date: '2025-10-31T14:16:31+08:00'
title: '《鸣潮》中的光线追踪'
---

# 《鸣潮》中的光线追踪

[《鸣潮》中的光线追踪|UFSH2025](https://www.bilibili.com/video/BV1hSW4zTEgQ)

讲座前半部分重点关注**技术选型思路**以及**方案对比**。后半部分重点是**实现细节、管线集成和性能优化**。

演讲人：王鑫 (库洛游戏《鸣潮》图形渲染组长)

## 核心目标与渲染管线回顾

演讲首先快速回顾了两种渲染管线，并明确了现代游戏（如《鸣潮》）的实现基础。

*   **光栅化管线 (Rasterization)**
    
    *   **核心思路:** 以**三角形**为中心，遍历所有三角形，将它们投影到屏幕，找出覆盖的像素，然后对这些像素进行着色 (PS/FS)。
        
    *   **流程:** `应用 -> VS -> 光栅化 -> PS -> 输出`
        
*   **光线追踪管线 (Ray Tracing)**
    
    *   **核心思路:** 以**像素**为中心，从屏幕像素（或摄像机）出发，发射光线，通过**加速结构 (Acceleration Structure, AS)** 遍历场景，查询光线命中的三角形，然后对着色点进行着色。
        
    *   **流程:** `RayGen Shader -> 遍历 AS -> Intersection/AnyHit Shader -> ClosestHit Shader (命中) / Miss Shader (未命中)`
        
*   **混合渲染管线 (Hybrid Rendering Pipeline)**
    
    *   **关键点:** 这是当今游戏业界的**主流方案**。
        
    *   **流程:**
        
        1.  **Geometry Pass (Base Pass):** 首先使用**光栅化**渲染场景，输出 **G-Buffer** 和**深度信息 (Depth)**。
            
        2.  **Ray Tracing Pass:** 利用 G-Buffer 和深度信息，在物体表面发射光线，计算**光追反射、间接光、阴影**等光栅化难以实现的效果。
            
        3.  **Lighting Pass:** 结合光栅化信息和光追计算结果，进行最终的光照合成。
            

* * *

## 《鸣潮》实现的光追效果

《鸣潮》利用光线追踪主要实现了三大效果，以提升动漫风格开放世界的画面品质。

*   **光追反射 (RT Reflections)**
    
    *   **效果:** 解决水面等反射的质量问题。
        
    *   **优势:** 反射更清晰，并且能反射**屏幕空间之外 (Off-Screen)** 的物体。
        
*   **全局光照 (RT Global Illumination)**
    
    *   **效果:** 补充场景的**间接光 (Indirect Light)** 和**遮蔽效果 (Occlusion)**。
        
    *   **优势:** 画面立体感和氛围感显著增强。
        
*   **光追阴影 (RT Shadows)**
    
    *   **效果:** 解决传统 **CSM (Cascaded Shadow Maps)** 精度不足的问题。
        
    *   **优势:** 能清晰展现建筑等**精细结构 (Fine-detailed Structures)** 的阴影。
        

* * *

## 技术选型与快速验证

这是本次分享的核心，详细对比了《鸣潮》在实现上述效果时评估过的两种主流方案。

### 项目背景与技术目标

在选择方案前，必须明确项目的约束和需求：

*   **项目情况 (Context):**
    
    *   **大世界:** `32km x 32km` 的超大开放世界。
        
    *   **动态光照:** 拥有完整的 **TOD (Time of Day)** 动态光照系统。
        
    *   **玩法:** **ACT (动作游戏)**，角色和相机会快速移动。
        
    *   **风格:** **二次元渲染风格**。
        
    *   **工程:** 基于 **UE 4.26** (!!)，意味着不能直接用 UE5 的成品功能，且**稳定性 (Stability)** 至关重要。
        
*   **技术目标 (Goals):**
    
    *   在上述约束下实现三大光追效果 (反射, GI, 阴影)。
        
    *   **性能目标:** **4060 显卡，2K 分辨率，稳定 60 帧**。
        

### 方案一：基于 ReSTIR 的路径追踪

*   **核心技术: ReSTIR (Reservoir-based Spatiotemporal Importance Resampling)**
    
    *   **原理:** 一种基于**蓄水池 (Reservoir)** 的时域和空域**重要性重采样 (Importance Resampling)** 技术。
        
    *   **流程:** `发射光线 -> 获初始样本 -> 时域/空域重采样 (复用光线) -> 计算光照`
        
    *   **定位:** 它像一个高级的**降噪算法**，但它**嵌入在采样过程 (Sampling Process)** 中，而非纯后处理，因此可以**加速收敛**并做到**无偏 (Unbiased)**。
        
*   **配套方案:**
    
    *   **SHARC (Sparse Hash-based Radiance Cache):** NVIDIA 提供的库，用于解决**多次反弹 (Multi-Bounce)** 的问题 (因为性能限制，每像素通常只负担得起 1-2 RPP)。这是一个基于**世界空间稀疏哈希**的 Radiance Cache 系统。
        
    *   **NRD (NVIDIA Real-Time Denoisers):** 开箱即用的后处理降噪器，但**性能消耗高** (官方数据 4080 2K 需 2-3ms)。
        
*   **结论 (放弃原因):**
    
    *   **优点:** 实现简单（库多）、光照结果**准确**、**漏光 (Light Leaking)** 少。
        
    *   **缺点:**
        
        1.  **高频噪点:** 在远处、边缘或运动像素上**噪点严重**。
            
        2.  **高带宽压力:** ReSTIR 算法天生需要**多次读写蓄水池**，带宽压力大。
            
        3.  **性能差:** ReSTIR 本身和 NRD 降噪都非常昂贵，不达标。
            

### 方案二：基于硬件光追的 Lumen (最终方案)

*   **核心思路:**
    
    *   Lumen 是 UE5 中基于 Probe 的成熟 GI 方案。
        
    *   《鸣潮》的思路是：我们已有硬件光追能力，是否可以用**硬件光追 (Hardware RT)** 替换掉 Lumen 的前半部分 (如 **SDF Trace**、**Mesh Cards**、**Surface Cache**)，只**移植 Lumen 的后半部分 (GI 和 Relfection 算法)** 到 UE 4.26？
        
*   **需要移植的核心模块 (从 UE5 -> UE4.26):**
    
    1.  **Screen Probe GI**
        
    2.  **Radiance Cache**
        
    3.  **Reflections**
        
*   **模块详解:**
    
    *   **Screen Probe GI**
        
        *   **功能:** 计算 **Diffuse 间接光**。
            
        *   **结构:** 在屏幕空间摆放 Screen Probe，通过**八面体映射 (Octahedral Mapping)** 存储在 Atlas 中。
            
        *   **关键特性:**
            
            *   根据物体复杂度**自适应细分 (Adaptive Subdivision)**。
                
            *   根据 BRDF 和上一帧 Lighting 生成 **PDF (Probability Density Function)**，用于重要性采样。
                
            *   时域和相邻 Probe **复用 (Re-use)**。
                
    *   **Radiance Cache**
        
        *   **功能:** 缓解**远处不稳定噪点**，降低远距离 Trace 开销。
            
        *   **结构:** 存储在**世界空间 (World-space)**，分为**四级 Clip Map**。
            
        *   **机制:** 当 Screen Probe 进行 Trace 时，可以沿途**重连接 (Re-connect)** 到世界空间的 Radiance Cache Probe，获取更稳定的 Radiance。
            
    *   **Reflections (Lumen 的反射方案)**
        
        *   **流程:**
            
            1.  **Screen Trace (SSR):** 首先进行屏幕空间追踪。
                
            2.  **Fallback to RT:** 失败的像素回落到**硬件光追**。
                
            3.  **Mini SortRay:** 先 Trace 一条**负载 (Payload) 很小**的光线，主要获取命中的几何与材质信息，比如：Material ID、TwoSided、Translucency等。
                
            4.  **排序 (Sorting):** **根据材质对光线进行排序**，将相似的计算放在一起，以减少 GPU 的 **Divergence** (执行分歧)。
                
            5.  **Trace Lighting:** 计算反射。

            6. 重用Diffuse Rays (Radiance Cache)。

            7. 时空Reuse 和 双边滤波。
                
*   **《鸣潮》的定制化修改 (关键):**
    
    *   **问题:** 舍弃了 Lumen 的 **Surface Cache**，导致**多次反弹 (Multi-Bounce)** 的间接光丢失。
        
    *   **解决方案:** 自研了一套**基于世界空间 Clip Map 的 Irradiance Cache 系统**。
        
    *   **技术:** 这套系统也运用了类似 **Temporal RIS** 的理论。
        
    *   **优势:** **分辨率无关**、性能消耗低、**支持无限反弹**。
        
*   **最终结论 (采纳原因):**
    
    *   **优点:**
        
        1.  **扩展性强** (Lumen 框架灵活)。
            
        2.  **高频噪点少** (基于 Probe，天生优于 Per-Pixel Trace)。
            
        3.  自带多种 Denoise 方案。
            
        4.  **性能相对较好** (符合 4060 @ 2K 60FPS 的目标)。
            
    *   **缺点:**
        
        1.  **实现复杂** (需要移植和魔改大量 UE5 代码)。
            
        2.  有**部分漏光**现象 (但可接受)。
      

### 总结

《鸣潮》最终选择了一条更复杂但效果和性能更可控的路径：**魔改 UE5 的 Lumen 方案并移植到 UE 4.26**，用**硬件光追**替代了 Lumen 原本的软件光追，并**自研了 Irradiance Cache** 来补足缺失的多次反弹。


## 实现问题与解决方案 (管线集成)

这一部分探讨了在 UE 4.26 中集成光追并适配《鸣潮》的卡通渲染管线时遇到的具体问题。

### 核心引擎问题：灯光数量限制

*   **问题:** UE4 原版光追对参与计算的灯光有**全局 256 盏**的限制。这是因为它在做 **NEE (Next Event Estimation)** 时，会遍历全场景灯光来重建 **CDF (Cumulative Distribution Function)**，灯光一多性能就爆炸。
    
*   **解决方案:**
    
    1.  **空间划分:** 在世界空间使用 **Clip Map** 分格子，提前过滤灯光。
        
    2.  **时域重采样:** 参考 **REGIR** (Reservoir-based Global Illumination) 论文的思路，对格子内的灯光做时域重采样。
        
    3.  **最终效果:** 每帧每个格子**只有 1 盏灯光**参与计算，彻底解除了 256 的限制 (600+ 盏灯光性能从 10+ ms 降到极低)。
        

### 卡通渲染适配：角色

*   **案例一：角色自阴影**
    
    *   **目标:** 卡通渲染**不想要自阴影** (会显“脏”)。
        
    *   **光栅化方案:** 场景阴影 (CSM) 和角色阴影 (Projected Shadow) 分离。
        
    *   **光追适配:** 增加了一个 **Instance Mask**。这个 Mask **包含所有场景物体，但不包含角色**。当从角色表面发射阴影光线时，使用这个 Mask 进行 Trace，角色自然就无法投影自阴影。
        
*   **案例二：角色接收 GI**
    
    *   **目标:** 角色需要接收场景 GI，以融入环境，同时保持卡通风格。
        
    *   **风格化处理:**
        
        1.  对头发和面部使用**球形法线 (Spherical Normal)**。
            
        2.  将角色**整体法线向相机偏移 (Bias)**。
            
        
        *   **效果:** 获得平滑、低成本的间接光，避免高频 GI 细节破坏卡通质感。
            
    *   **混合处理:**
        
        1.  将接收到的间接光转为 **HSV** 色彩空间。
            
        2.  **限制 (Clamp) 饱和度 (S) 和明度 (V)**，防止在卡通的暗部（非全黑）中“爆掉”。
            
        3.  最后乘上 **AO**，增加层次感。
            
*   **案例三：角色反射 (金属/MatCap)**
    
    *   **目标:** 在不破坏原有 **MatCap** 效果的前提下，让角色的金属部件（如盔甲）能反射环境。
        
    *   **风格化处理:**
        
        1.  **Clamp 粗糙度 (Roughness)**。
            
        2.  **金属度 (Metalness) 当作反射强度**。当 `Metalness > 0.9` 时，视为镜面反射。
            
    *   **混合处理:** 将计算出的光追反射**直接加在 (Add)** 原本的 MatCap 效果之上。
        

### 卡通渲染适配：场景

*   **问题：Billboard / Imposter 物体投射阴影**
    
    *   **背景:** 在光栅化中，可以通过不同的 Shader Pass (Base Pass vs Shadow Pass) 控制朝向。但在光追中，**BVH 只有一份**，无法这么做。
        
    *   **解决方案 (混合阴影):**
        
        1.  **保留**这些特定物体 (Billboard/Imposter) 的**阴影贴图 (Shadow Map) 计算**。
            
        2.  其他物体走光追阴影 (RT Shadow)。
            
        3.  **优化:** 先投影 Shadow Map，然后进行一次 **Tile Classify**，**过滤掉完全在阴影中的 Tile**。
            
        4.  **只对剩余的 Tile** 执行光追阴影计算，最后降噪输出。
            
*   **问题：美术工作流 (单向 Plane 遮挡)**
    
    *   **背景:** 美术习惯用单面 Plane 遮挡光照。Shadow Map (从光源渲染) 和 Shadow Ray (从物体表面发射) 的剔除逻辑（背面 vs 正面）不一致，导致漏光。
        
    *   **解决方案:** 项目中所有 **Shadow Ray** 全部改为**前向剔除 (Front-Face Culling)**，以适配美术原有的工作流。
        
*   **问题：UE4 体积雾 (Volumetrics)**
    
    *   **背景:** UE4 的体积雾依赖 CSM。开启光追阴影后，CSM 不完整，导致体积雾“爆掉”。
        
    *   **解决方案 (参考 UE5):**
        
        1.  使用 ShadowRay 去预生成一个 **3D Shadow Volume** (三维阴影体)。
            
        2.  在 `Inject Lighting` 阶段，体积雾采样这个 3D Volume 来判断光照可见性。
            

### 反射中的复杂物体

*   **问题：单层水面 (Single Layer Water) 和半透明**
    
    *   **目标:** 在反射中需要看到水底和半透明效果。
        
    *   **解决方案 (SLW):** 当反射光线击中水面时，**额外 Trace 一条光线**去计算水底的颜色和深度，模拟散射。
        
    *   **解决方案 (半透明):** 类似地，**逐层发射光线**并进行**手动混合 (Manual Blend)**。
        
    *   **警告:** 性能消耗巨大，必须严格控制层数。
        
*   **问题：复杂的多层天空盒**
    
    *   **目标:** 《鸣潮》好看的多层天空盒也必须在反射中完整呈现。
        
    *   **原始方案:** 当光线 Miss (未命中) 或 Hit 足够远时，判断为击中天空。此时再进行 **3-4 次的光线遍历**来手动采样和混合多层天空。
        
    *   **结果:** **“性能已经爆炸了”** —— 这直接引出了下一章节的优化。
        

* * *

## 性能优化 (GPU & CPU)

这是讲座的第二大核心，在实现了效果后，如何将性能压榨到目标 (4060 2K 60FPS)。

### GPU 优化

*   **优化一：天空盒反射 (承上)**
    
    *   **问题:** 每次 Miss 就 Trace 3-4 条光线采样天空，性能爆炸。
        
    *   **解决方案:** **缓存天空盒 (Cache Sky)**。
        
    
    1.  用**光栅化**将天空（非常远，全局一个 Capture 就够）**Capture 到一张 Cube Map** 上。
        
    2.  可以**分帧更新 (Incremental Update)** 这张 Cube Map (例如每帧更新一个面)。
        
    3.  当光线 Miss 时，**直接根据光线方向采样这张 Cube Map** 即可。
        
    
    *   **结果:** **反射性能直接提升 25%**。
        
*   **优化二：压缩 Payload**
    
    *   **概念:** **Payload** 是光线在 Trace 过程中携带的数据（类似寄存器），在各个 Shader (RayGen, AnyHit, ClosestHit) 间传递信息。Payload 越小，Trace 代价越低。
        
    *   **方案:** UE 原生 Payload 为 **64 字节**。团队分析后发现光照计算所需数据可压缩到 **32 字节**而无画面损失。
        
    *   **结果:** **GPU 整体 Trace 性能提升 15%**。
        
*   **优化三：材质简化**
    
    *   **概念:** GI 和反射计算**不需要完整的 PBR 材质**。
        
    *   **方案:** UE 允许分离光栅化和光追节点。团队在此基础上，进一步将 **GI 和 Reflection 的计算也分离**。GI 的分支可以被极度简化（例如，甚至不需要走完整 PBR）。
        
*   **优化四：利用外部“科技” (NVIDIA)**
    
    *   **OMM (Opacity Micromaps):** 将三角形的**可见性 (Alpha Test) 编码到 BLAS** (底层加速结构) 中。这使得光线可以跳过树叶等的透明区域，**大幅减少 AnyHit Shader 的调用**。
        
    *   **SER (Shader Execution Reordering):** 在底层硬件上对 Shader 执行进行重排序，**解决 GPU 的 Divergence (执行分歧)** 问题。这对 GI 这种发散光线的计算尤其有效。
        
    *   **备注:** 这两项技术现已进入 **DXR 1.2** 标准。
        

### CPU 优化

*   **背景:** GPU 优化后，项目**反向卡在了 CPU**。使用 Unreal Insight 分析发现：
    
    *   **重灾区:** `Gather Instances` (收集实例), `Build Acceleration Structure` (构建加速结构), `Bind SBT` (Shader Binding Table)。
        
    *   **瓶颈:** RHI 任务过重，**阻塞渲染线程 (Render Thread) 4.4ms**。
        
    *   **当时帧时:** 20ms 左右 (离 60FPS 的 16.6ms 差距很大)。
        
*   **第一阶段优化 (减少开销)**
    
    1.  **CPU Culling:** 在 CPU 端先做一轮剔除 (按半径和立体角)，**减少需要进入光追管线的物体数量**。
        
    2.  **Global Root Signature:** 将 View UB 等公用数据放到一个**全局根签名**中，**降低每个材质的绑定开销**。
        
    
    *   **结果:** 帧时降至 16.6ms (达成 60 FPS)。
        
*   **第二阶段优化 (并行化)**
    
    1.  **GATHER 任务:** 将 `Gather Ray Tracing Instances` 任务提前到 `InitView`，并**分发到 Task 线程**，使其**不阻塞渲染线程**。
        
    2.  **拆分 AS 构建:**
        
        *   `Build AS` 任务原本包含：(A) 填充 DX12 数据结构 + (B) 构建动态 BLAS + (C) 构建 TLAS。
            
        *   **拆分:** 新建一个 `Pre-Build AS` 任务，紧跟在 GATHER 后，**提前填充静态物体的数据 (A 部分)**。
            
        *   原 `Build AS` 任务只剩下 (B) 和 (C)。
            
    
    *   **结果:** 帧时降至 14.5ms。
        
*   **第三阶段优化 (进一步并行化)**
    
    1.  **拆分 SBT 绑定:** `Bind SBT` 任务包含：(A) 绑定 Shader + (B) 绑定 Shader Resource + (C) 绑定 Geometry Resource。
        
    2.  **拆分:** 新建一个 `Pre-Bind SBT` 任务，**提前绑定静态物体的所有数据 (A 和 B 部分)**。
        
    3.  原 `Bind SBT` 任务只剩下绑定动态物体的 Geometry Resource (C 部分)，因为它依赖动态 BLAS 构建完成。
        
    
    *   **结果:** 帧时降至 **10.5ms**。
        
    *   **验证:** 关闭 Trace，Test Build 下帧时为 7.35ms。**瓶颈成功交还给 GPU**。
        

* * *

## 总结与未来工作

*   **总结:**
    
    1.  快速验证 ReSTIR 和 Lumen，选择了**魔改 Lumen**的方案。
        
    2.  实现了三大光追效果 (GI, 反射, 阴影)。
        
    3.  解决了 UE4.26 的集成和卡通渲染适配问题。
        
    4.  通过一系列 GPU 和 CPU 优化，**达成了 4060 2K @ 60FPS 的目标**。
        
*   **未来工作 (技术储备):**
    
    *   **平台:** 扩展到主机、Mac、移动端。
        
    *   **优化:** **Inline Ray Tracing** (更现代的光追方式), **Bindless** (无绑定)。
        
    *   **功能:**
        
        *   **光追直接光 (RT Direct Lighting):** 实现无限远的阴影。
            
        *   **GPU Driven Pipeline:** 适配光追。
            
        *   **Mega Geometry:** 尝试 (类似 Nanite)。
            
        *   **更多效果:** 粒子、焦散 (Caustics) 等。
            
