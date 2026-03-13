---
title: "《Avowed》中的GPU技术回顾"
date: 2025-11-14 00:14:45
---

Avowed: A GPU Technical Retrospective | Unreal Fest Orlando 2025
===========================================

[Avowed: A GPU Technical Retrospective | Unreal Fest Orlando 2025](https://www.youtube.com/watch?v=BKaAzhMHJZ0)


## 项目简介与背景

*   **演讲者:** Matt Campbell (黑曜石娱乐，高级图形工程师 / 《Avowed》首席图形工程师)
    
*   **游戏类型:** 单人动作 RPG (设定于“Pillars of Eternity”宇宙)，支持第一/三人称。
    
*   **游戏特性:** 混合了近战、远程和法术战斗；5个大型开放区域；约25个独立加载的地图。
    
*   **团队规模:** 峰值时约100名内部开发 + 40名外部协力。
    
    *   **技术团队 (15人):**
        
        *   **图形工程师:** 2名内部 (含演讲者) + 2名外部协力。
            
    *   **关键启示:** 图形团队规模非常精简，这意味着必须“精确”地进行更改，高度依赖引擎原生功能并进行重点优化。
        
*   **项目历程与目标:**
    
    *   **起点:** UE 4.22 / 4.23
        
    *   **发售版本:** **UE 5.3.2**
        
    *   **核心目标:**
        
        *   开放或近乎开放的世界，拥有**广阔的远景 (Vistas)**。
            
        *   **完全动态的日夜循环 (Time of Day)**。
            
        *   大量使用**全局光照 (GI)** 的自然光照。
            
        *   充满**植被**、洞穴的有机世界。
            
*   **核心技术栈 (UE5):**
    
    *   **Nanite**
        
    *   **Lumen**
        
    *   **Virtual Shadow Maps (VSMs, 虚拟阴影贴图)**
        
    *   Virtual Textures (虚拟纹理)
        
    *   Niagara
        
    *   _(本次分享重点关注前三项)_
        

## 主机性能目标 (已发售状态)

讲座详细列出了 Xbox Series S 和 X 的不同模式配置，这对于理解性能权衡至关重要。

### Xbox Series S (XSS)

*   **质量模式 (Quality @ 30Hz):**
    
    *   **分辨率:** 900p 内部
        
    *   **Lumen:** **硬件光追 (Hardware Ray Tracing)**
        
    *   **阴影:** VSM (用于方向光) + **硬件光追** (用于本地光)
        
    *   **反射:** **硬件光追** (用于 Lumen 和水面)
        
*   **平衡模式 (Balance @ 40Hz):**
    
    *   **分辨率:** 720p 内部
        
    *   _(光照/反射配置与质量模式相同)_
        

### Xbox Series X (XSX)

*   **质量模式 (Quality @ 30Hz):**
    
    *   **分辨率:** 1440p 内部
        
    *   **Lumen:** **硬件光追**
        
    *   **阴影:** VSM (方向光) + **硬件光追** (本地光)
        
    *   **反射:** **完全硬件光追**
        
*   **平衡模式 (Balance @ 40Hz):**
    
    *   **分辨率:** 1280p 内部
        
    *   _(光照/反射配置与质量模式相同)_
        
*   **性能模式 (Performance @ 60Hz):**
    
    *   **分辨率:** 1080p (动态)
        
    *   **Lumen:** **软件光追 (Software Lumen)**
        
    *   **阴影:** **完全 VSM** (用于方向光和本地光)
        
    *   **反射:** **软件 Lumen 反射**
        
    *   **关键备注:** 切换到软件光追和 VSM **并非因为 GPU 限制**，而是因为 60Hz 模式下遇到了 **CPU 瓶颈**。
        

## 深入探讨：Nanite

Nanite 被认为是《Avowed》项目成功的最大贡献者之一。

### 核心贡献

1.  **实现广阔远景:** 提供了极少的 LOD (Level of Detail) 突变。
    
2.  **内存控制:** 对主机内存管理“至关重要”，所有网格物体都进入了 Nanite 池。
    

### 从 UE4 迁移的挑战

*   需要 **Art (美术)** 和 **TechArt (技术美术)** 团队付出巨大努力。
    
*   **Masked Materials (遮罩材质):** UE4 时期遗留了大量使用遮罩材质（例如带Alpha测试的植被）的资产。为了性能，这些都必须**转换为不透明 (Opaque) 几何体**。
    
*   **Splines (样条线):** 当时的 Nanite 不支持样条线，团队必须将其**烘焙 (Bake)** 为静态几何体。
    

### Nanite 性能瓶颈

当几何体问题解决后，瓶颈转移到了材质上。

1.  **复杂材质:**
    
    *   **问题:** 最大的瓶颈。这是 UE4 时代的遗留问题——当时几何面数受限，因此大量逻辑被塞进材质中。
        
    *   **影响:** 导致过高的 **VGPR** (向量通用寄存器) 和 **ALU** (算术逻辑单元) 使用率。
        
    *   **结果:** GPU **Occupancy (占用率)** 过低。
        
2.  **虚拟纹理 (VT):** 大量使用 VT 导致频繁受限于 **Texture Address Bound (纹理寻址)**。
    
3.  **UE 5.3 的局限:**
    
    *   没有 **Nanite Compute Shading** (计算着色)。
        
    *   没有 **VRS (Variable Rate Shading, 可变速率着色)**。
        
    *   **结果:** 必须支付“Pixel-per-Pixel (逐像素)”的全部渲染成本。
        
4.  **Draw Call (绘制调用) 问题:**
    
    *   **问题:** 团队主要通过 **Material Instances (材质实例)** 来实现资产变体，而非 **Custom Primitive Data (自定义图元数据)**。
        
    *   **影响:** Nanite 必须为**每一个**加载的实例发出 Draw Call，**即使该实例后续被剔除**。这导致了大量“空的 Base Pass 绘制调用”，耗时约 **100-200 纳秒**。
        
    *   **未来方案:** **Work Graphs** (工作图) (当时他们没有)。
        
5.  **剔除与流式传输 (Culling & Streaming):**
    
    *   **问题:** Nanite 的剔除通道 (Culling Pass) 负载过高（流式加载了过多数据）。
        
    *   **优化 1:** 在开发后期，强制执行 **HLoDs** (Hierarchical LODs) 的烘焙。
        
    *   **优化 2:** 调整流式传输大小。放弃了“一个 World Partition 区块 = 一个流式单元”的理想化设定，改为使用更细粒度的单元，以便更早地剔除“膝盖高度及以下”的小型杂物。
        

## 深入探讨：Nanite 植被 (Foliage)

植被是另一个需要美术团队投入巨大精力的领域。

### 初始问题 (UE4 状态)

*   资产是**非 Nanite 的遮罩卡片 (Masked Cards)**。
    
*   使用了昂贵的风力模拟 (Wind Sims)。
    
*   存在严重的视觉 LOD 问题。
    
*   在 VSM 下的**性能极差**。
    

### 失败的尝试：直接转换

*   **尝试:** 简单地将 Alpha Masked 卡片直接转为 Nanite 资产。
    
*   **结果:**
    
    *   **\[赢\]** 修复了 LOD 突变问题。
        
    *   **\[输\]** **完全没有**解决渲染时间问题。
        
    *   **结论:** “只是把糟糕的‘非 Nanite VSM 耗时’变成了糟糕的‘Nanite 栅格化耗时’。”
        

### 关键优化：转向 Opaque

*   **核心方案:** 将**几乎所有**植被从 **Masked (遮罩)** 材质改为 **Opaque (不透明)** 材质。
    
*   **原因:** 这是“至关重要的”，它极大地减少了**逐像素操作 (Per-Pixel Operations)**，使 Nanite 栅格化尽可能快。
    

### 风力效果 (Wind Effects)

*   **树木:** 仍然使用了风效，但改用 **VATS (Vertex Animation Textures, 顶点动画纹理)** 和 **WPO (World Position Offset, 世界位置偏移)**。
    
    *   **限制:** VATS / WPO **内存开销昂贵**，限制了顶点数量。
        
*   **关键优化:**
    
    1.  **在远处积极地禁用 WPO:** “我们把禁用距离拉得非常近”，这对保持栅格化速度至关重要。
        
    2.  **移除 WPO:** 最终，许多地面杂物（如三叶草、小花）**完全移除**了 WPO。
        

### 特殊情况：遮蔽草 (Cover Grass)

*   **问题:** 某些资产**无法**设为 Opaque（例如，角色进入时需要 Dithering 抖动效果的草）。
    
*   **缓解措施:**
    
    1.  **像 Opaque 一样建模:** 尽量减少 Alpha Overdraw（过绘制），使用更贴合形状的几何体，而不是简单的透明卡片。
        
    2.  **限制顶点数:** 约 3000 顶点。
        
    3.  **保持稀疏 (Sparse):** 几何体保持稀疏似乎有助于 Nanite 更好地进行栅格化。
        

## 性能对比：优化前后 (XSS @ 30Hz)

以下数据清晰地展示了上述 Nanite 和植被优化的惊人效果。

### 场景 1: Paradise

*   **Alpha (优化前):**
    
    *   **总帧时:** 46.5 ms
        
    *   Nanite Vis Buffer: 4.0 ms
        
    *   Base Pass: 5.0 ms
        
    *   **Shadow Depth Pass (阴影深度): 13.0 ms**
        
    *   _(其中一个遮罩材质的叶子就占了 1.5 ms)_
        
*   **Shipped (优化后):**
    
    *   **总帧时:** 30.0 ms
        
    *   Nanite Vis Buffer: 2.5 ms (时序被调整，与光追场景更新重叠)
        
    *   Base Pass: 3.5 ms
        
    *   **VSM Cost: 8.0 ms** (部分降低也是因为本地光转为了 HWRT)
        

### 场景 2: Emerald Stair

*   **Alpha (优化前):**
    
    *   **总帧时:** 53.0 ms
        
    *   **Shadow Depth Pass: 20.0 ms** (!!!)
        
    *   _(其中红色植被的阴影耗时 6.0 ms)_
        
*   **Shipped (优化后):**
    
    *   **总帧时:** < 28.0 ms
        
    *   Vis Buffer: 2.0 ms
        
    *   Base Pass: 3.5 ms
        
    *   **Shadow Depth Pass: 3.0 ms**
        
    *   _(优化后的新问题：出现了 2ms 的 Graphics Q Stall，等待 Async Pass)_


## 深入探讨：Lumen

Lumen 是团队决定从 UE4 迁移到 UE5 的**首要驱动力 (primary driver)**。虽然 Nanite 很棒，但 Lumen 提供的动态全局光照 (GI) 是实现项目艺术目标不可或缺的。

### 为什么选择 Lumen？

*   在 UE5 之前，团队评估了多种 GI 解决方案，但它们都存在严重缺陷：
    
    *   **质量 (Quality)** 不足。
        
    *   需要**漫长的烘焙 (Baking)** 时间。
        
    *   **引擎集成成本 (Integration Costs)** 巨大。
        
*   Lumen 的出现解决了所有这些问题，是项目转向 UE5 的决定性因素。
    

### Lumen 的巨大成功：小团队实现大目标

*   Lumen 完美达成了所有光照目标。
    
*   **WYSYWYG (所见即所得):** **无需烘焙**的特性，极大地提升了美术的**迭代速度 (Iteration times)**。
    
*   这使得**仅有 2 名光照师 (Lighters)** 的精简团队得以完成整个游戏的庞大光照工作。
    

### 核心决策：硬件光追 (HWRT)

团队从项目早期就决定**专注于硬件光追 (HWRT)**，而不是软件 Lumen。

*   **主要原因:** **来自地貌的间接光反弹 (Light bounce from landscapes)**。
    
    *   HWRT 在这方面提供了远超软件 Lumen 的自然感和准确性。
        
*   **其他优势:**
    
    *   更少的 **漏光 (Light bleeding)**。
        
    *   **意外的胜利:** 为项目后期转向使用光追阴影（用于本地光）奠定了基础。
        

### 平台实现差异 (HWRT)

*   **Xbox (Series S/X):**
    
    *   Lumen HWRT 完全运行在 **Async Compute (异步计算)** 队列上，在测试场景中节省了 **2-4 毫秒** (XSS)。
        
    *   在 XSS 上大量使用了 **Inline Raytracing (内联光追)**，这极大地节省了性能和**内存**（因为它不需要单独的光追着色器）。
        
*   **PC:**
    
    *   Lumen HWRT 运行在 **Graphics Queue (图形队列)** 上。
        
    *   **原因:** Unreal 5.3 中 D3D12 的 Inline Raytracing 支持**不完整**。
        
    *   _(但 PC 上的软件 Lumen 确实会切回 Async Compute)_
        

### 关键技术：Lumen Emissives (自发光)

这是 Lumen 的一个巨大胜利，被光照师戏称为 **"Emissive Mushies" (自发光蘑菇)**。

*   **广泛应用:** 团队在地图上放置了大量自发光网格体，在很多情况下将其作为**光源的完全替代品**。
    
*   **核心技巧 (Trick):**
    
    *   使用了 **Raytracing Material Node (光追材质节点)**。
        
    *   这允许为资产的**栅格化视图 (Diffuse)** 和 **Lumen 场景 (GI)** 指定**不同的自发光值**。
        
    *   **示例:** 栅格化场景中 `Emissive = 1` (视觉上不刺眼)，但在光追（Lumen）场景中 `Emissive = 5` 或 `10`。
        
    *   **结果:** 极大地增强了 GI 亮度，而**不会导致资产本身过度曝光 (Blowout)**。
        
*   **隐藏的自发光体 (Hidden Emissive Mesh Cards):**
    
    *   团队也使用了大量隐藏的自发光片来补光。
        
    *   **性能影响:** 极小，只会占用 **Surface Cache (表面缓存)** 空间。
        
    *   **引擎修改:** 必须修改引擎以将这些隐藏卡片从**反射通道 (Reflection passes)** 中移除。
        
        *   **HWRT:** 很容易，只需添加一个新标记并调整**光追掩码 (Raytracing Masks)**。
            
        *   **Software Lumen:** 更复杂，需要为 Mesh Distance Fields 添加**额外的剔除通道**。
            
*   **后备方案 (Fallback):**
    
    *   当 Lumen 场景**噪点过多**或**丢失高光**时，团队会回退使用**无阴影的填充光 (Non-shadow casting fill lights)** 来补充。
        

### Lumen 的挑战 (1): 复杂性与调试

Lumen 是一个“极其复杂的猛兽”。

1.  **海量的通道 (Passes):**
    
    *   Lumen 自身有非常多的渲染通道。
        
    *   当需要**同时维护硬件 (HWRT) 和软件 (Software)** 两条管线时，通道数量会**翻倍**，虽然有重叠，但差异也很大。
        
2.  **极难调试 (Difficult to debug):**
    
    *   **间接性 (Indirection):** Lumen 严重依赖“一个通道生成工作列表 (Worklists)，另一个通道来消费”的模式。
        
    *   **核心问题:** 这种模式**打破了 GPU 线程和屏幕像素之间的直接关联**。
        
    *   **结果:** 当出现噪点或颜色错误时，极难反向追踪到是哪一个 GPU 线程导致了问题。
        

### Lumen 的挑战 (2): 内存与性能

*   **内存集约 (Memory Intensive):** Lumen 使用了海量的 Render Targets (渲染目标) 和 Workgroups，导致内存占用激增，这在 **Series S** 上是永恒的痛点。
    
*   **关键权衡 (XSS):**
    
    *   团队**无法同时负担** HWRT 的 **BLAS (Bottom-Level Acceleration Structure)** 和软件 Lumen 的 **Mesh Distance Fields (MDFs)**。
        
    *   **决策:** **完全丢弃了 Mesh Distance Fields**，全力押注 HWRT。
        
    *   **连锁反应:** 这一决策导致很多 VFX（视觉特效）**无法使用**基于距离场（MDF）的节点，影响了特效表现。
        
*   **时间稳定性 (Temporal Stability) 噩梦:**
    
    *   Lumen 是一个**时间累积 (Temporally accumulated)** 效果，但《Avowed》的机制频繁破坏这种稳定性。
        
    *   **日夜循环跳跃:** 当玩家从白天瞬间切换到夜晚营地时，团队的解决方案是“字面上”丢弃整个 Lumen 场景 (throw away the entire lumen scene)，然后在淡入淡出效果后重新构建。
        
    *   **闪烁的灯光:** 本身就不是时间稳定的，会引入噪点。
        
    *   **明亮的 VFX:** 经常会干扰 Lumen 的屏幕空间效果。
        

### Lumen 的挑战 (3): 表面缓存 (Surface Cache)

*   **极易浪费空间:**
    
    *   **大型网格体:** 游戏使用了很多巨型网格体（如山脉）。只要这些网格体“稍微触及”**可玩空间，它就可能被载入 Surface Cache，导致一个**不影响间接光照的山脉“浪费掉 1/5 的缓存”。这会导致缓存内容被频繁换出，增加噪点。
        
    *   **水密网格体 (Watertight Meshes):** 包含**背面 (Back faces)**，这些背面也会生成 Mesh Cards 并挤占缓存空间。
        
    *   **解决方案:** 只能“手动”进入场景，标记这些网格体不进入缓存。
        
*   **Mesh Card 优化:**
    
    *   默认情况下，Lumen 为每个物体生成约 12 个 Mesh Cards。
        
    *   对于一面墙，可能 1-2 个就够了。团队尝试调低这个值。
        
    *   **新问题:** 有时，Lumen 会“智能”地选择了**背面**的卡片（因为背面在室内）。
        
    *   **引擎修改:** 增加了一个**偏移 (Bias)**，以**强制优先选择正面 (front faces)**。
        

### Lumen 的挑战 (4): 繁杂的设置与 CVar 陷阱

*   Lumen 有**海量的“旋钮” (Knobs)**：CVars (控制台变量) 和 Post-Process (后处理) 设置。
    
*   **危险:** 团队发现某些设置调整后会导致严重问题：
    
    *   **浪费内存:**（本应节省内存的设置反而导致了浪费）。
        
    *   **传播 NaNs:** 在渲染管线中传播“非数值 (Not a Number)”，导致画面撕裂。
        
    *   **GPU 内存践踏 (Stomps):** 导致 **LDS (Local Data Share)** 越界写入。
        
*   **具体 Bug 示例:** `RadianceCacheScreenProbes`
    
    *   Xbox 默认值为 96。
        
    *   引擎会分配一个 96x96 的方块纹理。
        
    *   但**索引逻辑 (Indexing logic) 却是对数的 (logarithmic)**，它会将 96 **向下钳制 (Clamps)** 到最近的 2 的幂（即 64）。
        
    *   **结果:** **浪费了 1/3 的纹理内存**。
        
    *   **修复:** 团队修改了引擎中的纹理创建逻辑。
        

### 深入探讨：Lumen 反射

*   **优化:** 默认在图形队列，但团队“非常简单”地将其移动到了 **Async Queue (异步队列)**。
    
*   **Hit Lighting:** 为 PC 添加了此功能（用于动态物体），但未能在 Xbox 上实现。影响不大，因为大多数光追命中的是已在 Surface Cache 中的静态物体。
    
*   **美术工作流问题:**
    
    *   光照师很难理解“什么东西会触发 Lumen 反射”。
        
    *   美术习惯于处理纹理和渐变，而 Lumen 的反射是基于一个**硬编码的粗糙度阈值**（例如 0.4），这让美术非常困惑。
        
*   **双重反射成本:**
    
    *   Lumen 反射“无视”单层水体 (Single Layer Water)。
        
    *   **问题场景:** 在 Bingham's Domain 地图中，**水下有反射性的冰块**。
        
    *   **结果:** 系统会为水面支付一次反射成本，然后**再次**为水下的冰块支付一次反射成本。
        
    *   **引擎修改:** 团队将**水体的深度缓冲区**传递给 Lumen 反射通道，并进行**深度测试**来剔除水下的无效反射。
        

### 深入探讨：单层水体 (Single Layer Water) 反射

*   **UE 5.3 默认状态:** 一个全屏通道，首先做**全屏屏幕空间反射 (SSR)**，未命中的像素再做**全屏 HWRT**。
    
    *   **问题:** 效果好，但**性能开销巨大**。
        
*   **备选方案:**
    
    1.  **软件 Lumen 反射:** 更便宜，但团队**已经丢弃了 MDFs**，所以此路不通。
        
    2.  **直接降采样:** SSR 和 HWRT 绑定在一起降采样，导致 SSR 部分的质量急剧下降。
        
    3.  **仅 SSR:** 用于低配，但有漏光、曝光问题，且物体移出屏幕时反射消失。
        
*   **最终方案：混合反射 (Hybrid Approach) (引擎修改)**
    
    *   **第 1 步:** 保持**全分辨率**的 **Screen-Space Reflections (SSR)**。
        
    *   **第 2 步:** 运行一个**降采样 (Coarse)** 的 **Lumen HWRT** 通道，并输出一个掩码。
        
    *   **第 3 步:** 仅在 SSR **未命中**的像素上，才使用降采样后的（更粗糙的）Lumen 反射结果来填充。
        
    *   **结果:** 效果非常好。在平静水面上几乎看不出差异；在粗糙水面上也难以察觉。
        
    *   **性能提升:** 在 XSS 上的特定场景中节省了 **0.8 毫秒**。
        
*   **水体反射的最后陷阱:**
    
    *   **问题:** 默认情况下，单层水体**始终是完美镜面 (perfect mirror)**，无论其表面材质如何。
        
    *   **美术困惑:** 美术师会在水面上绘制“淤泥”或“苔藓”**（高粗糙度）来试图**“遮挡”**反射，但他们不知道系统**仍在为下方的“完美镜面”执行完整的 Lumen 反射追踪。
        
    *   **引擎修改:** 增加了一个**基于粗糙度的最大追踪开关 (Max Roughness Trace)**，并将其绑定到可伸缩性设置 (Scalability) 中。

---

## 深入探讨：阴影 (Shadows)

**阴影**是《Avowed》团队在性能上**最大的痛点和挣扎点 (bulk of our performance struggles)**。它们包含了团队最多的引擎修改和优化。

*   **技术组合:**
    
    *   **方向光 (Directional Map):** **Virtual Shadow Maps (VSMs, 虚拟阴影贴图)**。
        
    *   **本地光 (Local Lights):** **硬件光追 (Ray Tracing)** (在开启 HWRT 的模式下)。
        
    *   **小型/地面物体:** **Contact Shadows (接触阴影)**。
        

### Virtual Shadow Maps (VSMs)

*   **基础:** VSM 毫无疑问优于传统的 Cascade Shadow Maps (CSM)，尤其是配合 Nanite 时（两者几乎是强制绑定）。
    
*   **优势:** 完美实现了广阔远景中的**远距离阴影**。
    
*   **性能陷阱:**
    
    1.  **非 Nanite 物体:** 任何**非 Nanite** 的物体（如当时的**蒙皮网格体 Skinned Meshes**）都会造成巨大性能冲击。
        
    2.  **逐像素操作 (Per-Pixel):** VSM 对 Nanite 资产的逐像素操作极其敏感。
        
        *   **Masked Materials (遮罩材质)**
            
        *   **WPO (世界位置偏移)**
            
        *   **Pixel Depth Offset (像素深度偏移)**
            
    
    *   **关键启示:** 这就是为什么团队要“拼命”移除遮罩材质和尽早关闭 WPO 的核心原因之一。
        
    
    3.  **半影 (Penumbra):** VSM 的软阴影是通过多次采样实现的，这会带来额外成本，需要注意。
        
*   **VSM 引擎修改 (关键优化):**
    
    1.  **减少远距离阴影光线 (Easy Mod #1):**
        
        *   **实现:** “大概就一行代码”，基于 `SceneDepth` (场景深度) 取对数，然后相应地减少远处的阴影光线数量。
            
        *   **收益:** 在 XSS 上节省了约 **0.5 毫秒**。
            
    2.  **基于像素阈值剔除阴影 (Easy Mod #2):**
        
        *   **实现:** 在 Nanite 实例剔除 (Instance Culling) 阶段，**剔除掉小于特定像素阈值 (Pixel Threshold)** 的物体的**阴影**。
            
        *   **效果:** 演讲者展示了“剔除半径为 24 像素”与“不过滤”的对比，视觉差异“极难分辨”。
            
        *   **收益:** “一到两行代码”带来了“巨大的节省”——在 XSS 的特定场景中节省了**超过 3 毫秒**。
            
    3.  **复用光追数据 (HWRT Mod):**
        
        *   **背景:** 团队发现 HWRT 的负载 (Loads) 远低于栅格化 (Rasterization) 负载。
            
        *   **实现:** 在 VSM 通道中，**使用光追的蒙皮网格体 (Ray-traced skinned meshes)** 来投射方向光阴影，而不是使用栅格化的版本。
            
        *   **收益:** 在特定场景中节省了近 **1 毫秒**，且视觉差异极小。
            
    4.  **调整光源半径 (Light Source Radius):**
        
        *   在项目后期添加的小型设置，允许调整 VSM 的光源半径来降低半影计算成本。
            
        *   **应用:** 用于 XSS / XSX 60Hz 模式和低配 PC。
            

### 硬件光追阴影 (Ray Traced Shadows)

*   **采用背景 (为什么？):**
    
    *   **VSM 的核心问题:** **本地光 (Local Light) 的 VSM 失效 (Invalidation) 开销极其昂贵**。
        
    *   当一个**动态物体**（如角色）穿过一个本地光时，会导致该灯光的 VSM 全部失效并需要**重绘**。
        
    *   UE 的 `StaticSeparate`（动静分离）选项可以缓解此问题，但它会“加倍你的内存 (doubles your memory)”，这在主机上是不可接受的。
        
*   **HWRT 的理论优势:**
    
    1.  **按需追踪:** 只追踪**屏幕上可见的像素**，不关心被遮挡的或背后的物体。
        
    2.  **免费的半影 (Free Shadow Penumbras):** 光追阴影天然带软边，无需额外采样成本。
        
    3.  **复用 HWRT Lumen:** 团队已经为 Lumen 支付了 HWRT 的场景建立 (Scene) 和 BLAS/TLAS 成本，因此阴影的额外开销很小。
        
    4.  **选择性阴影:** 可以通过光追掩码实现“部分阴影”，例如让树木在 VSM（方向光）中投射阴影，但在 HWRT（本地光）中不投射阴影（以节省性能）。
        
*   **HWRT 阴影实现 (引擎修改):**
    
    *   **时机:** 项目后期 (UE 5.3 升级后)，距离发售仅约 1 年。
        
    *   **应用:** 在 HWRT 开启时，用于**所有本地光**。
        
    *   **核心:** 团队编写了**自定义的渲染通道 (Custom Pass) 和降噪器 (Denoiser)**。
        
    *   **原因:** UE 5.3 **原生的光追阴影 (Stock Unreal RTS)** 性能极差。
        
        *   原版实现是 **“每个灯光一个全屏 Dispatch + 一个全屏 Render Target”**。
            
        *   “如果你有 8 个灯光，那就是 8 个全屏通道和 8 个 RT”，团队无法负担。
            
    *   **体积雾 (Volumetric Fog):**
        
        *   原生体积雾阴影依赖被团队删除的 `Raytracing Shader`。
            
        *   团队不得不为其创建了一个**内联 (Inline) 版本**。
            
        *   **意外的胜利:** 团队重构了体积雾函数，使其可以**提早 (early)** 启动阴影计算，然后将这部分成本**完全隐藏 (hide their cost)** 在 **Async Lumen** 通道的后面。
            
        *   **结果:** 在许多没有方向光（只有本地光）的室内场景（例如洞穴），Async Lumen 的执行时间很长，这导致**光追体积雾阴影的成本接近于“免费”**。
            
*   **自定义光追阴影通道 (Custom Pass) 详解:**
    
    *   **理论:** 类似于 **VSM 的“单通道投影 (One Pass Projection)”**。
        
    *   **实现:** 使用剔除后的灯光网格 (Culled Light Grid)，追踪阴影，然后将结果**打包 (Packed)** 写回一个**阴影遮罩 (Shadow Mask)**。
        
    *   _(该方案在 UE 的 Megalights 出现前提出了)_
        
    *   **限制:** 每个像素**支持 8 个本地光**（为了约束美术师，效果很好）。
        
    *   **双模式 (Two Modes):**
        
        1.  **全屏 (Full Screen):** 每像素每灯光 >= 1 个采样 (SPP)。用于高端 PC。
            
        2.  **棋盘格 (Checkerboard):** **(用于主机)** 渲染棋盘格，然后**升采样 (Upscale)** + **重建 (Reconstruct)**，最后对“不自信”的像素进行**重新追踪 (Retrace)**。
            
            *   实现了远**低于 1 SPP** 的平均成本。
                
            *   在 Xbox 上平均节省了 **1 到 1.5 毫秒**。
                

### 性能对比：VSM vs HWRT (XSS @ 30Hz)

*   **场景 1: Fior (室外，多动态物体)**
    
    *   **Alpha (全 VSM):** 40.0 ms
        
        *   (VSM Depth: 11.0 ms)
            
    *   **Shipped (HWRT 本地光):** 25.0 ms (!!!)
        
        *   (VSM Depth: 3.0 ms; RTS: 3.0 ms)
            
    *   **对比 (HWRT vs VSM):** 团队发现，如果强制切回 VSM，HWRT 方案比纯 VSM 方案**快 4 毫秒**。
        
    *   **对比 (HWRT vs UE 原生 RTS):** 如果使用 UE 5.3 原生光追阴影，帧时高达 34.0 ms (光追+降噪占 18ms)。
        
    *   **结论:** **自定义 HWRT 方案取得了巨大成功**。
        
*   **场景 2: Nakukubell (室内，无方向光)**
    
    *   **Alpha (全 VSM):** 37.5 ms
        
        *   (VSM Depth: 13.0 ms)
            
    *   **Shipped (全 HWRT 本地光):** 23.0 ms
        
        *   (RTS: 3.5 ms)
            
        *   (Volumetric Shadows: 2.0 ms，**但成本被 Async Lumen 隐藏，算作“免费”**)
            
    *   **对比 (HWRT vs VSM):** 切换回 VSM 会使帧时上升到 25.5 ms (VSM Depth 占 9.3 ms)。
        
    *   **最终结论:** **场景中的角色和动态物体越多，HWRT 阴影方案的性能优势就越大。**
        

### 光追的最后优化

*   **问题:** UE 5.3 中并非所有的光追通道都在 Async 队列上，有些仍在 Graphics 队列。
    
*   **修复:** 团队“非常容易地”将**所有**光追相关的通道都**移动到了 Async Compute**，效果很好。

---

## 光追 (Ray Tracing) 的最终优化与成本

*   **时序调整:**
    
    *   **默认:** 光追场景更新 (Ray Tracing Scene Update) 默认在 Base Pass 期间运行。
        
    *   **修改:** 团队将其**提早 (earlier)** 到 Pre-pass 和 V-Buffer 期间运行，以重叠更多的计算，节省了时间。
        
*   **禁用 Landscape 重建:**
    
    *   **默认:** UE 默认**每帧 (every frame)** 重建 Landscape 的光追数据，以保持与流式加载同步。
        
    *   **修改:** 团队**禁用**了此行为。
        
    *   **结果:** 在极端的流式性能问题下，光追数据（BLAS）确实会与地貌“不同步”，但“似乎**没人关心**或报告这个问题”，所以被认为是一个可接受的妥协。
        

### 成本权衡：HWRT vs. Mesh Distance Fields (MDFs)

*   **内存 (Memory): \[HWRT 巨大胜利\]**
    
    *   HWRT **节省了大量内存**。
        
    *   在 XSS 上，团队的 HWRT 峰值内存占用约 **300 MB**。
        
    *   如果使用 MDFs，预估总内存占用会达到 **500-600 MB**。
        
    *   **结论:** HWRT 方案节省了 **~200-300 MB** 内存。
        
    *   **附带收益:** HWRT 避免了在加载新的 World Partition 流式单元时，因 MDF 更新而导致的**巨大 GPU 尖峰 (Spikes)**。
        
*   **CPU: \[HWRT 的主要瓶颈\]**
    
    *   HWRT (至少在 UE 5.3 中) 具有**高昂的 CPU 成本**。
        
    *   **收集光追场景 (Collecting the Ray Tracing Scene)** 的 CPU 耗时过高。
        
    *   **最终结论:** 这就是团队**无法**在 Xbox 60Hz 性能模式下负担 HWRT 的**根本原因**。CPU 成本将其推高到了预算之上，迫使其在 60Hz 模式下回退到 Software Lumen 和 VSM。
        

## 虚拟纹理 (Virtual Textures - VTs)

*   **应用范围:** 游戏中的**几乎所有纹理**都使用了 VT 系统。
    
*   **例外:** VFX (视觉特效) 和 RVT (运行时虚拟纹理) 相关的纹理，因为它们需要立即反馈，不能等待 VT 流式加载。
    
*   **优势:**
    
    1.  允许使用**更多、更高分辨率**的纹理。
        
    2.  **降低并固定 (Lowered and fixed)** 了内存使用量。
        
*   **劣势与挑战:**
    
    1.  **性能瓶颈:** 导致团队“几乎在所有地方”都受限于 **Texture Address Bound (纹理寻址)**。
        
    2.  **Shader Pre-caching:** 无法从顶点/像素着色器预缓存中受益。
        
    3.  **纹理池 (Pools) 平衡:**
        
        *   **问题:** 团队发现，即使在内存充足时，**环境 (Environment)** 纹理（DXT1, 2K）也经常会**踢出 (kicking out)** **角色 (Character)** 纹理（BC7, 1K）。
            
        *   **影响:** 这导致了从游戏切换到对话特写时，角色身上出现**纹理流式加载 (streaming)** 的瑕疵。
            
        *   **妥协:** 团队不得不将环境和角色纹理**分离 (Segregating)** 到不同的池中，尽管他们更希望未来能有“同池但可分离”的管理方式。
            
    4.  **纹理池创建陷阱:**
        
        *   **限制:** 默认最多 15 个池，否则**硬崩溃 (hard crash)**。（可增加到 31 个，但会使管理开销加倍）。
            
        *   **问题:** 非常容易意外创建出不想要的池。
            
        *   **示例:** 美术师连接了引擎默认的 1x1 法线贴图，这是一个 `RGBA 8` 格式的纹理，导致系统**创建了一个团队不想要的 RGBA 池**。
            
        *   **修复:** 团队创建了一个 2x2 并可进行块压缩 (Block Compress) 的纹理来代替它，以确保其能放入正确的池中。
            
    5.  **材质分层 (Material Layering) Bug:**
        
        *   **问题:** 当在材质函数 (Material Function) 中使用 VT，并将其用于材质分层系统时，该纹理**不会**被正确添加到材质加载前所需的“预缓存纹理数组”中。
            
        *   **结果:** 导致**纹理加载**和**材质加载**之间的**竞态条件 (Race Condition)**。
            
        *   **影响:** 如果材质先加载，会导致**无效的 VT 绑定 (Invalid virtual texture binding)**，直到材质被重新加载（例如角色法线贴图丢失）。
            

## 最终总结与核心建议

### 💡 Nanite

1.  **宁要更多几何体，不要复杂材质 (More Geo, Simpler Materials):** Nanite 在这种组合下表现最好。
    
2.  **不惜一切代价避免逐像素操作:** 尽你所能摆脱 Masked Materials、PDO (Pixel Depth Offset)，并尽早在远处关闭 WPO。
    
3.  **减少材质差异 (Material Variances):** Nanite 按材质批次 (Material-wide) 进行绘制。材质实例越少 = Draw Call 越少。
    
4.  **使用 CPD:** 尽可能通过 **Custom Primitive Data (CPD)** 来实现变体，而不是材质实例。
    
5.  **控制加载内容:** Nanite 很快，但如果你同时加载太多“不需要被渲染的小东西”，它依然会被拖垮。
    

### 💡 Lumen

1.  **盯紧你的 Surface Cache:** “极易浪费空间”，必须手动清理那些不该进入缓存的大型网格体。
    
2.  **谨慎调整 CVar:** Lumen 的设置项非常多。调整时要小心，**一次只改一个**，并充分理解其后果，否则“会让你陷入大麻烦”。
    
3.  **从硬件光追 (HWRT) 开始:** 团队的建议是，**从 HWRT 降级到 Software 远比从 Software 升级到 HWRT 要容易**。新项目应优先考虑 HWRT。
    

### 💡 阴影 (Shadows)

1.  **不要迷信单一方案:** VSM **非常适合方向光**，但在**本地光**上表现挣扎。
    
2.  **HWRT 阴影是本地光的绝佳搭档:** HWRT 阴影（点光源、聚光灯）效果很好，如果你的项目已经启用了 HWRT (例如为了 Lumen)，强烈建议研究它。
    
3.  **别小看接触阴影 (Contact Shadows):** 团队发现它们“被误解为昂贵”，但实际上它们**比其他方案（VSM/HWRT）便宜得多**。
    

### 💡 虚拟纹理 (VTs)

*   “它们解放了你 (Liberating)，但它们**不是免费的 (Not Free)**。”
    
*   时刻监控你的纹理池。
    

## 跨领域的开发建议 (Agnostic Advice)

*   **尽早确定基准硬件 (Benchmark Hardware):**
    
    *   **主机 (Consoles) 是最理想的**，因为它们配置固定，没有驱动或后台进程的干扰。
        
    *   《Avowed》团队选择了 **Xbox Series S (XSS)** 作为他们的性能基准，并发现这个选择“非常非常好”。
        
    *   在多平台发布时，在 XSX 上找到与 XSS 相匹配的性能设置，有助于保持开发步调一致。
        
*   **开发期间必须关闭动态分辨率 (Disable Dynamic Resolution):**
    
    *   动态分辨率“应该用于覆盖游戏中的性能尖峰，而不是掩盖持续的性能不足 (cover up non-performance)”。
        
    *   在开发时开启它，无异于“把头埋在沙子里”，你根本不知道 GPU 的真实状态。
        
*   **优化时关闭异步计算 (Turn off Async):**
    
    *   在分析特定通道（Pass）的性能时，必须关闭 Async Compute。
        
    *   否则，工作负载的重叠 (Overlap) 会“扭曲 (skew)” 你的计时，让你误以为自己取得了进展。
        
*   **永远在分析 (Always Be Profiling):**
    
    *   **每周性能会议:** 团队每周开会，让 QA 玩游戏，工程师实时观看、评论并抓取性能快照 (Captures)。这能让你时刻了解游戏的真实状态。
        
    *   **自动化播放器 (Autoplayer System):** 强烈推荐。它能持续追踪性能进展。
        
    *   **保留并重访旧的快照 (Old Captures):**
        
        *   **关键用途:** 在进行大的引擎升级或内容合入后，检查是否有**性能退步 (Regression)**。
            
        *   **真实案例 (FSR):** 团队在从 **FSR 2** 升级到 **FSR 3** 时，发生了 **1 毫秒的性能退步**，但几个月都未察觉。直到团队回头翻看旧的 FSR 2 快照，才发现了这个问题。
            
        *   **结果:** 团队对比后发现 FSR 3 并未带来明显优势，于是**回退到了 FSR 2**，白白拿回了 1 毫秒的性能。
