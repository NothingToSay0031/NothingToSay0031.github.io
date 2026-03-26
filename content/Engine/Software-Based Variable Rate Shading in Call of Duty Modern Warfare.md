---
title: "Software-Based Variable Rate Shading in Call of Duty: Modern Warfare"
date: 2026-03-26 15:33:58
---

# 《使命召唤：现代战争》中的软件可变速率着色（Software-Based VRS）


[Software-Based Variable Rate Shading in Call of Duty: Modern Warfare](https://www.youtube.com/watch?v=RGUYygFeogo&list=PLabw4gCouThnQzSDfBLgiPEcGzDq9GmSF&index=3)

---

## 项目背景与挑战

### 游戏概况

- **《使命召唤：现代战争》** 是一款 **60Hz、第三人称以上渲染精度的第一人称射击游戏**
- 游戏场景覆盖面极广：从 **近距离室内战斗** 到 **大规模开放战场**
- 光照环境涵盖 **全天候时段**，还包括需要额外性能预算的 **红外夜视模式**
- **《使命召唤：战区》（Warzone）** 基于同一引擎，支持多达 **200 名玩家** 在广阔开放世界中以 **60Hz** 运行，将引擎推至极限

### 优化动机

- Warzone 的极端性能需求促使团队探索 **新的渲染性能优化方式**
- 这就是开发 **软件可变速率着色（Software-based Variable Rate Shading）** 的起因

---

## 硬件可变速率着色（Hardware VRS）简介

### 什么是硬件 VRS

- **硬件 VRS** 是 **DirectX 12 Ultimate** 引入的新特性
- 核心思想非常直观：允许硬件根据 **图像频率（image frequency）** 选择合适的 **着色率（shading rate）**
  - 如果画面某区域 **没有太多细节**，就可以用 **更低的着色率** 来加速渲染

### 硬件支持情况

| GPU 厂商 | 支持起始架构 |
|---|---|
| AMD | **RDNA 2** 架构及以上 |
| Intel | **Gen 11 APU** 及以上 |
| NVIDIA | **Turing** 架构及以上 |

### 两个层级（Tier）

- **Tier 1**：允许 **每个 Draw Call** 设置着色率
- **Tier 2**：允许 **每个屏幕 Tile** 或其他频率设置着色率，最小 Tile 尺寸为 **8×8 像素**

---

## COD 系列中 VRS 的历史演进

### 早期实践：《无限战争》与《二战》

- 在前作中已使用 **软件实现的 VRS Tier 1 等效方案**
- 工作方式：允许美术人员将材质标记为 **全分辨率** 或 **半分辨率** 渲染（**逐 Draw Call 控制**）
- **主要用例**：
  - **多分辨率 VFX 渲染**（特效）
  - 某些 **透明几何体**（如玻璃、面罩）的多分辨率渲染
- 完全由 **美术手动控制**

### 《无限战争》中的效果实证

| 渲染模式 | 耗时 | 说明 |
|---|---|---|
| 全分辨率 VFX | **5.0 ms** | 基线 |
| 全部降为半分辨率 | **2.4 ms** | 性能大幅提升，但 **火花等高频特效画质严重下降**，被 VFX 团队判定为不可接受 |
| **多分辨率混合渲染** | **2.8 ms** | 高频特效（火花）保持全分辨率，低频特效（烟雾、火焰）用半分辨率，与参考图几乎无差异 |

- 关键结论：**需要针对不同特效选择性地调整分辨率**，而非一刀切

---

## 旧版多分辨率渲染管线（Old Multi-Resolution Pipeline）

### 管线流程详解

```
1. Depth-Stencil Pre-Pass
   → 生成标准深度缓冲（Depth Buffer）

2. Opaque Pass
   → 使用标准深度缓冲，生成标准颜色缓冲（Color Buffer）

3. Compute Pass（深度下采样）
   → 读取标准深度缓冲
   → 解压 → 下采样 → Swizzle
   → 生成 4x MSAA Swizzled 深度缓冲
   → 同时生成 Hi-Z Tile 信息（加速硬件剔除）

4. VFX / Transparency Pass
   → 使用 4x MSAA Swizzled 深度缓冲
   → 生成 4x MSAA Swizzled 颜色缓冲

5. Merge / Interleave Pass
   → 读取两个颜色缓冲（标准 + Swizzled）
   → 合并生成最终混合图像

6. Post Effects → Temporal Anti-Aliasing（TAA）
```

### 核心技术点

- **Swizzle 4x MSAA 缓冲**：将半分辨率的内容编码为一个 4 倍 MSAA 格式的缓冲区，利用 MSAA 的子采样机制来表示多分辨率内容
- **Hi-Z Tile 信息**：为硬件提供层次化深度信息，加速深度测试

### 性能数据

| 指标 | 数值 |
|---|---|
| 低分辨率材质的性能缩放 | **3x ~ 3.8x** |
| 上采样/解析/重建 Pass 的开销 | **0.3 ~ 0.4 ms**（合计） |

- 性能波动来源：
  - **Render Target 微 Tile（Microtile）** 的命中率
  - 全分辨率与低分辨率粒子在屏幕上的 **重叠程度**
  - GPU 的 **MSAA 效率** 差异
- 存在的 **隐患**：某些 **高三角形数量的透明 Draw Call** 上出现了 **Wave 占用率（Wave Occupancy）** 方面的担忧

---

## 全局 4x MSAA Swizzle 实验

### 实验设计

- 在前作管线成功的基础上，团队提出了一个 **大胆实验**：
  - 既然已有类似 VRS Tier 1 的逐 Draw Call 控制能力
  - **如果将整个游戏都用 4x MSAA Swizzle 缓冲来渲染会怎样？**
- 具体做法：设置 4x MSAA 的深度和颜色缓冲，允许每个 Draw Call 选择使用 **1 个、2 个或 4 个子采样**

### 优势

- **Alpha Test Pass（尤其是植被 Foliage）性能大幅提升**
  - 原因：**最小化了 Wavefront 数量**
  - 结合 **SV_Coverage 输出**，Alpha Cutout 效率显著提高
- 灵活性上 **匹配 DirectX 12 VRS Tier 1**

### 实际性能对比（关键数据）

| 配置 | 耗时 | 画质 | 评价 |
|---|---|---|---|
| **无 MSAA（标准渲染）** | **18.0 ms** | 基线 | — |
| **美术手动标记** 对象降级 | **17.26 ms** | 远距离画质不稳定 | 需要大量手工，收益有限 |
| **全部 4 子采样**（匹配无 MSAA 画质） | **> 18.0 ms** | 与无 MSAA 相同 | ❌ 反而更慢 |
| **全部 2 子采样** | **~17.0 ms** | 可见画质损失 | ❌ 仅快 1 ms，画质损失不值得 |
| **全部 1 子采样** | **15.3 ms** | 不可接受 | ❌ 性能不错但画质太差 |

### 实验结论

- 全局 4x MSAA Swizzle 方案 **在整体性能上并没有带来期望的收益**：
  - 保持画质 → 比标准渲染更慢
  - 激进降级 → 画质无法接受
  - 折中方案 → 性价比不足
- 这一实验的失败促使团队 **继续寻找更优的软件 VRS 方案**（即后续演讲的核心内容）

---

## 关键术语总结

| 术语 | 含义 |
|---|---|
| **Variable Rate Shading (VRS)** | 可变速率着色，根据区域复杂度调整着色密度 |
| **Shading Rate** | 着色率，每像素执行 Pixel Shader 的频率 |
| **Image Frequency** | 图像频率，指画面某区域的细节丰富程度 |
| **Swizzle** | 一种内存重排方式，此处指将低分辨率数据打包到 MSAA 子采样中 |
| **MSAA (Multi-Sample Anti-Aliasing)** | 多重采样抗锯齿，此处被"借用"来实现多分辨率渲染 |
| **Hi-Z (Hierarchical Z)** | 层次化深度缓冲，用于加速早期深度剔除 |
| **SV_Coverage** | HLSL 系统值语义，标识 MSAA 中哪些子采样被覆盖 |
| **Wave Occupancy** | GPU 上同时活跃的 Wave/Wavefront 数量，影响并行效率 |
| **Microtile** | 渲染目标在显存中的最小存储单元 |



# 实验失败原因分析：光栅化与 Quad 占用率

---

## 问题实证：森林场景的性能瓶颈

### 问题场景概况

- 一个典型的高压力 Draw Call：**完整森林渲染**
- 场景数据：
  - **132,000 个存活三角形**
  - **886,000 个存活像素**
  - **像素/三角形比值 ≈ 6.7**
- 这个比值说明 **每个三角形平均只覆盖约 6~7 个像素**，即使不用 MSAA，这也是一种 **非常低效的渲染负载**（三角形过小、边缘占比过高）

### 各模式下的性能对比

| 渲染模式 | 耗时 | 归一化时间（每百万像素） | Compute Wave 数量 | 输出像素数 |
|---|---|---|---|---|
| **无 MSAA** | 0.9 ms | ~1.0 ms/MP | ~42,000 | ~900,000 |
| **4x MSAA（4 子采样）** | 1.3 ms | **1.46 ms/MP** | 远多于 42,000 | ~900,000（几乎不变） |
| **2 子采样 + 1 子采样** | 介于两者之间 | — | — | — |

### 关键发现

- 开启 MSAA 后，**输出像素数几乎不变**，但 **像素着色器 Wave 数量急剧增加**
- GPU 在做 **更多的工作** 却产出 **相同数量的像素** → **渲染效率严重下降**
- 不同 MSAA 模式之间存在 **近似线性的性能缩放**，但 **从无 MSAA 到有 MSAA 之间存在巨大的性能跳变**
- 这说明问题不仅仅是采样数量的增加，而是 **光栅化和 Quad 打包效率的根本性变化**

---

## 光栅化与 Quad 基础概念回顾

### 光栅化生成 Pixel Quad 的过程

1. **光栅化器（Rasterizer）** 检查每个像素的采样点是否与三角形相交
2. 如果某个采样点被三角形覆盖，该像素被标记为 **需要着色**
3. 所有采样点标记完成后，硬件中的 **Tile Walker & Wave Packer** 开始工作：
   - 从一个 **32×32 的超级 Tile（Super Tile）** 中搜集所有存活的三角形 Quad
   - 将它们打包成 **像素着色器 Wave**

### Helper Lane（辅助线程）的概念

- GPU 的像素着色器以 **2×2 像素的 Quad** 为最小执行单位
- 原因：GPU 需要 Quad 来计算 **偏导数（Derivatives）**，用于纹理 MIP 选择等操作
- **如果一个 Quad 中只有 1 个像素被三角形覆盖**，GPU 仍然需要生成 **3 个额外的 Helper Lane**
  - 这些 Helper Lane **唯一的作用** 就是辅助计算偏导数
  - 它们 **不产出有效像素**，但 **消耗计算资源**
- 反之，如果一个 Quad 中 **4 个像素全部被三角形覆盖**，则效率最高（无浪费）

### Quad 占用率（Quad Occupancy）

- **Quad 占用率** 是衡量像素着色器效率的关键指标

$$\text{Quad Occupancy} = \frac{\text{实际渲染的像素数}}{4 \times \text{生成的 Quad 数量}}$$

- **注意**：Compute Shader **不支持** 这种 Quad 打包机制，这也是为什么在某些场景下 Compute 和 Pixel Shader 的效率特性不同

---

## 分辨率与 Quad 占用率的关系

### 标准分辨率下的示例

- 渲染一个三角形，覆盖 **25 个有效像素**
- 这 25 个像素被打包成 **9 个 Quad**，分布在 **3 个 Wave** 中
- Quad 占用率：

$$\frac{25}{9 \times 4} = \frac{25}{36} \approx 69\%$$

### 降低一半分辨率后

- 有效像素数大幅减少（比如降到 **6 个像素**）
- 但由于更多的采样点落在 **三角形边缘附近**，许多 Quad 中会有 **缺失的采样点**
- 6 个像素仍需生成 **3 个 Quad**（即使只在 1 个 Wave 中）
- Quad 占用率：

$$\frac{6}{3 \times 4} = \frac{6}{12} = 50\%$$

- **核心结论**：**降低分辨率后，即使渲染的像素更少，渲染效率反而更低**，因为边缘三角形占比增大，Quad 浪费更严重

---

## MSAA 对 Quad 占用率的影响

### MSAA 的颜色平面（Color Planes）机制

- **MSAA** 在所谓的 **颜色平面（Color Planes）** 中运作
- 每个 Quad 需要为 **每个平面单独生成**，以保证 **偏导数计算的正确性**
- 这意味着 **启用 MSAA 实质上降低了虚拟分辨率**，从而 **降低了 Quad 占用率**

### AMD GPU 上的 MSAA 平面 Swizzle

- 在 AMD GPU 上（至少是这样），4x MSAA 的颜色平面会被 **Swizzle（交错排列）**
- 原始图像被分成 **4 个象限**，每个象限对应 **1 个子采样**
- 各子采样分别形成独立的 Quad，但来自不同的平面

### MSAA 下的 Quad 占用率示例

- 同样的三角形，使用 **4x MSAA** 渲染：
  - **25 个有效像素**
  - 被打包成 **13 个 Quad**
  - 分布在 **4 个 Wave** 中
  - Quad 占用率：

$$\frac{25}{13 \times 4} = \frac{25}{52} \approx 48\%$$

- **关键对比**：
  - 原始全分辨率无 MSAA：**69%**
  - 半分辨率无 MSAA：**50%**
  - 全分辨率 4x MSAA：**48%**
- **MSAA 的 Quad 占用率几乎等同于半分辨率渲染的效率**，这解释了为什么 MSAA 对小三角形场景的性能冲击如此巨大

---

## Stencil 与采样点剔除的交互

### Stencil 剔除的基本原理

- **模板测试（Stencil Test）** 是硬件特性，可以 **逐采样点（per-sample）** 地剔除像素
- 但是：**剔除单个采样点并不会带来性能提升**
  - 原因：被剔除的采样点所在的 Quad 仍需生成 **Helper Lane**
- **只有当一个 Quad 中所有采样点都被剔除时**，该 Quad 才能被完全跳过

### 非 MSAA 下的棋盘格 Stencil 实验

- 对上述三角形应用 **棋盘格（Checkerboard）** 模板
- 原始 25 个像素 → 棋盘格后只渲染 **12 个像素**
- 但由于需要为每个存活的采样点生成 Helper Lane：
  - 仍然生成 **8 个 Quad**，分布在 **2 个 Wave** 中
  - Quad 占用率：

$$\frac{12}{8 \times 4} = \frac{12}{32} \approx 37\%$$

- **效率灾难**：像素减半，但 Quad 数几乎没有减少 → **占用率从 69% 暴跌到 37%**
- 在非 MSAA 模式下，棋盘格 Stencil 意味着每隔一个像素就是一个"空洞"，导致几乎每个 Quad 都有缺失采样，Helper Lane 大量产生

### MSAA 下的棋盘格 Stencil：关键优势

- 在 MSAA 模式下，由于颜色平面的 **Swizzle 交错排列**，棋盘格模板的效果完全不同
- 棋盘格在 MSAA 中对应的实际图案是 **4×4 像素块** 级别的剔除
  - 因为颜色平面是交错的，所以 Stencil 剔除的是 **整个平面（Plane）** 在某些 4×4 块中的所有采样
  - 这意味着被剔除的区域形成了 **连续的 Quad 级别的空洞**，而非散布的单像素空洞

- MSAA + 棋盘格 Stencil 的结果：
  - 仍然 **12 个有效像素**
  - 但只需 **6 个 Quad**
  - Quad 占用率：

$$\frac{12}{6 \times 4} = \frac{12}{24} = 50\%$$

### 核心结论对比

| 方案 | 有效像素 | Quad 数 | Quad 占用率 |
|---|---|---|---|
| 无 MSAA，无 Stencil | 25 | 9 | **69%** |
| 无 MSAA，棋盘格 Stencil | 12 | 8 | **37%** ⚠️ 效率暴跌 |
| 4x MSAA，无 Stencil | 25 | 13 | **48%** |
| **4x MSAA，棋盘格 Stencil** | **12** | **6** | **50%** ✅ 几乎无损 |

- **关键洞察**：
  - 在非 MSAA 下使用 Stencil 做棋盘格剔除 → **Quad 占用率大幅下降**，得不偿失
  - 在 MSAA 下使用 Stencil 做棋盘格剔除 → **Quad 占用率基本保持不变**，成功实现了"用一半的像素获得几乎相同的打包效率"
  - 只要三角形内部区域被 **4×4 像素块** 完整包含，就能以 **完全的 Quad 占用率** 渲染

---

## 总结：为什么 Swizzle MSAA 方案对 VRS 至关重要

1. **小三角形场景**（如森林）天然 Quad 占用率低，MSAA 会进一步恶化
2. 使用 **MSAA 颜色平面的 Swizzle 特性**，可以让 Stencil 剔除操作作用于 **整个 Quad** 而非单个像素
3. 这使得 **通过 Stencil 选择性地跳过某些子采样** 成为一种高效的可变速率着色实现方式
4. 这是软件 VRS 能够实际工作的硬件基础——**MSAA + Swizzle + Stencil 的组合** 让降低着色率不会显著损害 Quad 打包效率



# MSAA Swizzle 交错渲染与软件 VRS 管线架构

---

## MSAA Swizzle 交错渲染（Interleave Rendering）

### 交错采样的基本思想

- 概念源自 **2014 年提出的交错采样（Interleaved Sampling）**，核心目标是 **提升缓存效率**
- 基本流程：
  1. 将一张 **全分辨率纹理** 进行 **反交错（De-interleave）**，拆分为一组 **低分辨率纹理数组**
  2. 在这些低分辨率图像上执行计算任务
  3. 将结果 **重新 Swizzle 回全分辨率图像**
- **性能收益来源**：在低分辨率目标上运行任务时，数据更紧凑，**大幅减少缓存抖动（Cache Thrashing）**

### MSAA 天然的交错特性

- **MSAA 天然就会产生 Swizzle 后的交错数据**，无需额外的反交错步骤
- 在 **AMD GPU** 上，这一特性可以被利用来 **显著加速特定任务**
- AMD 的额外优势：
  - **颜色平面在内存中分别存储**（Color Planes Separate in Memory），提升缓存一致性
  - 通过 **FMask 压缩** 实现 **降功耗采样/渲染**（Power-efficient Sampling）
  - 建议查阅 AMD 官方文档了解 FMask 细节

### Compute 与后处理中的交错采样应用

- 许多 **Compute Job** 和 **Post FX Job** 都可以利用交错采样：
  - 可以只采样 **Plane 0**（假定始终可用）
  - 也可以采样 **任意数量的 Plane**
  - 还可以利用 **FMask 避免冗余采样**（当多个子采样指向相同数据时跳过重复读取）

---

## 从失败实验到新方案的设计思路

### 问题回顾与工具积累

- 经过对失败实验的深入分析后，团队理解了 **MSAA 导致性能下降的根本原因**（Quad 占用率骤降、Wave 数量暴增）
- 同时积累了几个 **新的优化工具**：
  - **Stencil 遮罩** 用于模拟可变速率着色
  - **交错渲染** 提升缓存效率
  - **优化的 Compute/Post FX 任务**，利用 VRS 遮罩减少无效工作

### 新方案的核心计划

- 仍然以 **4x MSAA** 渲染所有内容（保持与旧管线一致）
- 使用 **Stencil** 实现 **VRS 风格的遮罩**（控制哪些子采样需要着色）
- 通过以下三种方式 **最小化 MSAA 带来的性能损失**：
  1. **激进的采样率变化**（Aggressive Sample Rate Changes）
  2. **交错渲染**（Interleave Rendering）
  3. **优化的 Compute/Post FX 任务**，充分利用 VRS 遮罩

### 相比硬件 VRS 的优势

| 优势维度 | 说明 |
|---|---|
| **全平台可用** | 包括 **当前世代主机**（PS5/Xbox Series），不依赖硬件 VRS 支持 |
| **更小的 Tile 粒度** | 软件方案工作在 **2×2 像素 Quad** 级别，而硬件 VRS 最小为 **8×8 像素**（无 MSAA 时为 16×16） |
| **更高的画质潜力** | 更小的 Tile 意味着更精细的着色率控制，配合隐含的 **重建方法** 可获得更好的图像质量 |

---

## 软件 VRS 在实际场景中的效果

### 场景分析示例

- 以一张多人对战小地图的开场画面为例：
  - **高频区域**：树叶、树冠、地面纹理 → 需要高着色率
  - **低频区域**：体积雾后方区域、天空穹顶、阴影部分 → 可用低着色率

### 着色率可视化

| 颜色 | 含义 | 适用区域 |
|---|---|---|
| **绿色** | **1 个采样/像素 Quad** | 雾后方、阴影区、天空 |
| **黄色** | **2 个采样/像素 Quad** | 中等细节区域 |
| **品红色** | **3 个采样/像素 Quad** | 较高细节区域 |
| **红色** | **4 个采样/像素 Quad**（全采样） | 树叶、地面纹理等高频细节区域 |

- 着色率分布与图像频率信息 **高度匹配**

---

## 软件 VRS 管线详解

### 管线总览流程

```
Pre-Pass（预渲染）
  ├── Primitive ID + Depth + Stencil（4x MSAA）
  ├── FMask（颜色缓冲元数据）
  ├── Velocity Buffer（按需）
  └── VRS Image Mask History（上一帧重投影）
          ↓
Compute：VRS Mask 生成与历史更新
  ├── 输出：VRS Compute Mask（带 Wave Packing）
  ├── 输出：VRS Render Mask
  └── 输出：4x MSAA Stippled Stencil
          ↓
渲染阶段
  ├── Compute Jobs → 使用 VRS Compute Mask（Wave Packing）
  └── Forward+ Draws → 使用 VRS Stippled Stencil
          ↓
VRS Resolve & Debug
  ├── 使用 VRS Render Mask 进行正确的反交错
  ├── 调试可视化
  └── 输入样本插值/重建
          ↓
Standard Post FX
          ↓
Gradient Detection
  ├── 供 TAA 使用
  └── 使用 VRS Image Mask 生成新的 Mask History 更新
          ↓
Temporal Anti-Aliasing（TAA）
```

### 关键设计决策

#### 4.2.1 全面的 4x MSAA Swizzle 感知

- **不仅是 Draw Call，Compute Job 也必须完全理解 4x MSAA Swizzle 格式**
- 所有输入缓冲区都以 MSAA Swizzle 布局存储，整个管线统一处理

#### 4.2.2 像素 Quad 粒度的 VRS 操作

- VRS 在 **2×2 像素 Quad** 粒度上操作
- 对比硬件 VRS：
  - 硬件 VRS 无 MSAA 时 Tile 大小为 **16×16**
  - 硬件 VRS 有 MSAA 时 Tile 大小为 **8×8**
  - 软件方案的 **2×2** 粒度远小于硬件方案

#### 4.2.3 跨帧旋转 Swizzle 模式

- 标准像素只有 **1 个子采样**，而 4x MSAA 像素有 **4 个子采样**
- **每帧旋转子采样的排列模式**，4 帧一个周期
- 目的：
  - 提升 **时域稳定性**（Temporal Stability）
  - 每帧从不同子采样位置获取细节，**逐帧累积更多信息**

#### 4.2.4 Provoking Pixel（主导像素）

- 在每个 2×2 Quad 中，**左上角像素** 始终被指定为 **Provoking Pixel**
- **所有着色率模式下都必须保留 Provoking Pixel 的渲染结果**
- 这对 **重建 Pass 的性能至关重要**——始终有一个保证存在的基准采样

---

## VRS Image Mask 的四种着色模式

### Mask 格式

- 每个 Quad 一个 **2-bit 遮罩**
- 完全基于 **图像数据** 生成（无需美术手动标注）
- 用途：
  - **着色率估算**（Image Shading Rate Estimation）
  - **生成 VRS Render Mask**（用于 Stencil 遮罩模式选择）
  - **指导重建过程**

### 四种模式详解

| 模式 | 2-bit 值 | 采样模式 | 触发条件 |
|---|---|---|---|
| **单采样（Single Sample）** | 00 | 仅渲染 **Provoking Pixel** | 图像梯度在水平和垂直方向都很低 |
| **水平梯度（Horizontal Gradient）** | 01 | 在 **水平轴** 方向渲染更多子采样 | 检测到图像在 **水平方向** 存在更大差异 |
| **垂直梯度（Vertical Gradient）** | 10 | 在 **垂直轴** 方向渲染更多子采样 | 检测到图像在 **垂直方向** 存在更大差异 |
| **全采样（Full Sample）** | 11 | 渲染 **所有 4 个子采样** | 水平和垂直方向梯度都显著 |

### Swizzle 模式假设

- 演示中假设使用 **第一种 Swizzle 模式**：

```
┌───────┬───────┐
│ 0(TL) │ 1(TR) │    TL = Top Left（Provoking Pixel）
├───────┼───────┤    TR = Top Right
│ 2(BL) │ 3(BR) │    BL = Bottom Left
└───────┴───────┘    BR = Bottom Right
```

- **Provoking Pixel（索引 0，左上角）在所有模式下始终被渲染**，确保重建时始终有可用数据

### Stencil Mask 生成

- 从 VRS Shading Rate Map **手动创建 Stencil Mask**
- 该 Stencil Mask 驱动前向渲染阶段的 **着色率选择**
- 实现方式：通过 Stencil Test 决定哪些子采样需要执行像素着色器，哪些可以跳过

---

## 关键设计总结

| 设计要素 | 具体实现 |
|---|---|
| **基础渲染格式** | 4x MSAA Swizzle |
| **VRS 粒度** | 2×2 像素 Quad（远小于硬件 8×8） |
| **着色率控制方式** | Stencil Stippling + Image Mask |
| **时域策略** | 每帧旋转 Swizzle 模式（4 帧周期） |
| **缓存优化** | 利用 MSAA 天然交错特性 + AMD Color Plane 分离 |
| **Mask 数据源** | 完全基于图像梯度检测，自动生成 |
| **Provoking Pixel 保证** | 所有模式下左上角像素始终被渲染 |
| **平台兼容性** | 全平台可用，不依赖硬件 VRS 特性 |



# 梯度检测与图像遮罩生成

---

## 基于图像的局部梯度检测

### 梯度编码方案

- 使用 **基于图像的局部梯度（Image-based Local Gradients）** 来检测画面中的差异
- 采用一系列 **图像梯度编码（Image Gradient Codes）**，每个编码仅需 **2 bit**：

| 2-bit 值 | 含义 |
|---|---|
| 00 | **无梯度**（平坦区域） |
| 01 | **水平方向梯度** |
| 10 | **垂直方向梯度** |
| 11 | **所有方向均有梯度** |

- **关键性质**：这些编码值可以进行 **OR 运算合并**，结果总是 **保守地向上提升到更高采样率**（即合并后只会增加采样需求，不会减少）

### 韦伯-费希纳定律（Weber-Fechner Law）用于阈值判定

- 在检测 Quad 内部的局部梯度时，需要确定 **"差异多大才值得关注"** 的阈值
- 使用的是 **韦伯定律（Weber's Law）** ——一种 **感知心理学定律**：
  - 核心含义：人对刺激变化的感知，取决于 **变化量与背景刺激的比值**
  - 即：在明亮区域需要更大的亮度变化才会被人眼察觉，在暗区则较小变化即可被感知

#### 1.2.1 感知阈值因子 $k$ 的计算

$$k = \max(\min(\text{local block luma}),\ \text{device black}) \times q$$

- **local block luma**：局部像素块的 **最小亮度值**
- **device black**：输出设备的 **黑电平**（最暗能显示的亮度值）
- $q$：**观者质量阈值（Viewer Quality Threshold）**，一个略带经验性的参数
  - 含义：允许多大比例的刺激变化 **恰好可被察觉（Just Noticeable）** 或 **不被察觉**
  - 该阈值越高 → VRS 越激进（更多区域降采样）
  - 该阈值越低 → VRS 越保守（更多区域保持高采样率）

### 梯度检测的具体实现

#### 水平梯度检测

1. **一阶导数**：计算相邻像素之间颜色的 **最大绝对差值**（1 像素间距）
2. **二阶导数**：计算两像素宽度跨度内的 **最大绝对差值**（2 像素间距）
3. 取两者的 **最大值** 作为最终水平梯度

#### 垂直梯度检测

- 完全相同的过程，只是方向改为 **垂直方向**

#### 阈值化与编码

1. 将水平和垂直梯度分别与阈值 $k$ 比较
2. 超过阈值则标记对应方向位
3. 进行 **OR 合并** 得到最终的 2-bit 梯度编码

### Quad 级别的数据聚合

- 梯度是 **逐像素计算** 的，但需要聚合到 **像素 Quad（2×2）** 级别
- 聚合方式：将 Quad 内 4 个像素的梯度编码进行 **OR 运算**
- 获取相邻像素数据的方式：
  - **Pixel Shader** 中：使用 `ddx` / `ddy` 指令
  - **Compute Shader** 中：手动从相邻像素读取

### 梯度可视化效果

- 将 2-bit 梯度编码可视化为灰度图（黑 → 白 = 0 → 3 个子采样）
- 观察结果：
  - **高频细节区域**（草地、树叶纹理）→ 分配 **大量子采样**（白色）
  - **平坦区域**（天空、阴影面） → 分配 **很少子采样**（黑色）
  - 与图像的频率内容 **高度一致**

---

## 时间域累积与预测（Temporal Accumulation and Prediction）

### 运动导致的信号丢失来源

当场景中存在任何运动时，存在 **多种信号退化来源**：

| 信号丢失来源 | 说明 |
|---|---|
| **时间相干性失效** | 相机平移/旋转导致物体在帧间移动 |
| **运动遮挡解除（Motion Disocclusion）** | 新像素出现（前一帧不可见） |
| **抖动（Jitter）** | 来自 **TAA** 或其他时间域算法的采样点偏移 |

- VRS 着色率预测 **高度依赖梯度的时间相干性**，因此这些信号丢失 **必须被妥善处理**

### 为什么单帧历史不够

- 观察连续数帧的梯度图像：
  - **帧 N**：基础梯度信息
  - **帧 N+1**：由于相机运动和 TAA 抖动，**出现更多高频细节**
  - **帧 N+2、N+3**：继续有新细节涌现
- TAA 使用 **2 或 4 帧长度的抖动采样旋转模式**
- 因此 **4 帧** 应足以捕获大部分 **非运动引起的高频数据波动**
- **关键结论**：仅用单帧历史 **无法可靠预测** 未来的着色率，每一帧都在增加新的高频信息

### 替代方案的缺陷

- 有人提出使用 **空间平滑（Spatial Smoothing）** 和 **运动补偿函数（Motion Compensation）** 来稳定数据
- 缺点：
  - 这些是 **高度定向的方法**，需要 **大量调参**
  - 容易导致 **过高估计（Overestimation）**，即不必要地分配过多采样

### 保守时间累积方案

#### 核心策略

- **显式保留最近 4 帧的梯度数据** 在内存中
- 每帧通过 **重投影（Reprojection）** 将历史数据对齐到当前视角

#### 高效存储方案：8-bit FIFO 缓冲

- 每帧的梯度编码为 **2 bit**，4 帧 = **8 bit**
- 使用 **单个 8-bit 缓冲区**，通过 **2-bit 位移（Bit Shifting）** 实现 **滚动更新**：

```
帧更新时：
buffer = (buffer << 2) | new_gradient_code
```

- 这相当于一个 **FIFO 队列**：
  - 每次更新时，最旧的帧自动被移出
  - 最新的帧写入低位
- 缓冲区 **持续进行重投影**，以保持空间对齐

---

## 生成 VRS 渲染遮罩（VRS Render Mask）

### VRS 渲染遮罩的作用

- 这是驱动整个软件 VRS 管线的 **核心缓冲区**
- 用途包括：
  - 驱动 **4x MSAA Stencil Stippling**（点画模式）
  - 指导所有后续 **重建（Reconstruction）** 和 **重采样（Resampling）** 操作
  - 在整帧的多个 Compute Job 中使用

### 输入数据

| 输入缓冲 | 用途 |
|---|---|
| **速度缓冲区（Velocity Buffer）** | 用于 **运动重投影** |
| **图像遮罩历史缓冲区（Image Mask History Buffer）** | 包含最近 **4 帧** 的 VRS 梯度遮罩 |
| **FMask** | 从 Pre-Pass 缓冲区读取，用于生成 **VRS 几何遮罩** |

- **重投影** 和 **遮挡颜色检测（Disocclusion Color）** 可以在 **一次 Pass** 中完成

### FMask 与 VRS 几何遮罩

- **FMask**（Fragment Mask）是 AMD 硬件提供的 MSAA 压缩元数据
- 用于生成可选的 **VRS 几何遮罩（VRS Geometry Mask）**
  - 作用：在几何体边缘处 **引导更高频率的采样**

### 输出缓冲区

该 Compute Job 产出 **4 个输出缓冲**：

#### 输出 1：重投影后的 VRS 图像历史遮罩

- 将 4 帧历史梯度数据重投影到当前帧视角

#### 输出 2：VRS 渲染遮罩（VRS Render Mask）

- **粒度**：每像素 Quad（2×2）
- **格式**：8 bit
- **内容**：经过重排的 FMask **或** 最近 4 帧保守合并的 2-bit 图像遮罩
- **智能选择逻辑**：
  - 当一个 Quad 同时包含 **大量图像采样需求** 和 **大量几何边缘** 时：
    - 优先使用 **FMask**（如果它能提供 **更低的采样率**）
  - **核心假设**：如果一小块屏幕区域内有 **多条几何边缘**，只需 **重建边缘** 即可，不必重建三角形内部
  - 这对 **植被和 Alpha Test 植被** 尤其有效，是一个 **非常重要的优化**

#### 输出 3：4x MSAA Stencil 更新

- 根据 VRS 渲染遮罩生成 **Stencil Stipple Pattern**
- **实现细节**：
  - 由于需要写入 Stencil 目标，必须 **手动别名（Alias）** 缓冲为 **unsigned 32-bit image**
  - 写入时需要遵循 **纹理的 Macro Tiling 布局**
  - 具体 Tiling 格式 **因 GPU 厂商而异**，需查阅对应的硬件文档

#### 输出 4：VRS Wave Packing 缓冲

- **粒度**：逐像素（Per-Pixel）
- 作为 **辅助缓冲（Auxiliary Buffer）**
- 供后续多个 Compute Job 使用（用于优化 Wave 打包和调度）

### FMask 重排序优化

- FMask 数据被 **按采样顺序重排（Reordered in Sample Order）**
- 目的：在管线后续阶段采样时 **避免间接寻址（Indirection）**，减少内存访问开销

---

## 关键设计总结

```
输入:
  Velocity Buffer ──┐
  Image Mask History ──┤──→ [VRS Mask Generation Compute Job]
  FMask (Pre-Pass) ──┘          │
                                ├──→ 重投影后的图像历史遮罩
                                ├──→ VRS 渲染遮罩（Quad 粒度，8-bit）
                                ├──→ 4x MSAA Stencil 更新
                                └──→ VRS Wave Packing 缓冲（像素粒度）
```

- **整体设计哲学**：一次 Compute Dispatch 产出所有后续管线阶段需要的 VRS 数据，最小化 Pass 数量和内存带宽开销
- **FMask vs 图像梯度的智能切换** 是针对密集几何（如植被）的关键优化手段
- 所有数据保持 **时间域 4 帧保守累积**，确保着色率预测的稳定性



# 软件 VRS 绘制设置与预通道优化

---

## 预通道（Pre-Pass）的基本配置

### 最低需求与推荐配置

- **最低需求**：**深度（Depth）** + **模板（Stencil）**
- **强烈推荐**：启用 **FMask**（如果管线中已有其他渲染目标）
- 《使命召唤：现代战争》使用 **可见性缓冲（Visibility Buffer）兼容** 的预通道，包含：

| 缓冲区 | 位宽 | 内容 |
|---|---|---|
| **深度缓冲** | 32 bit | 深度值 |
| **模板缓冲** | 8 bit | VRS 遮罩等 |
| **辅助缓冲** | 64 bit | Primitive ID、速度、法线及其他数据 |

### 最优设置参数

- 使用 **4x MSAA Swizzle** 模式，并 **启用颜色压缩（Color Compression）**
- **像素着色器迭代计数（Pixel Shader Iteration Count）设为 1**
  - 即每个 Quad 只运行一次 PS，而非每个子采样运行一次
- **插值器（Interpolators）设置为逐采样插值（Per-Sample Interpolation）模式**
  - 目的：确保 Swizzle 布局下的采样位置 **精确匹配原始非 Swizzle 目标** 的采样位置

### 性能收益

- 预通道性能会 **显著提升**，对 **可见性缓冲风格的渲染** 尤为有利
  - 因为可见性缓冲只需要 **顶点数据**
  - 后续的逐顶点数据可以从 MSAA 子采样中 **简单插值得到**

---

## Alpha Test 的特殊处理

### 问题本质

- 所有包含 **Alpha Test** 的 Draw Call 需要 **特别注意**
- 必须 **手动输出 `SV_Coverage` 遮罩**
- 覆盖遮罩必须 **精确对应各子采样位置**
- 因此需要 **手动计算每个子采样的 Alpha Test 结果**，拼接后输出到 `SV_Coverage`

### 具体实现步骤

```hlsl
// 1. 获取 UV 坐标的偏导数
float2 ddx_uv = ddx(uv);
float2 ddy_uv = ddy(uv);

// 2. 关键：MSAA Swizzle 下梯度是非 Swizzle 的两倍大，需要校正
ddx_uv *= 0.5;
ddy_uv *= 0.5;

// 3. 定义"导数偏移遮罩（DD Offset Mask）"
//    相对于触发采样（Provoking Sample，通常为左上角）的偏移
//    第一个子采样 → 右上，第二个 → 左下，第三个 → 右下

// 4. 对每个子采样：
for each sample:
    // 计算该子采样的 UV
    sample_uv = uv + offset.x * ddx_uv + offset.y * ddy_uv;
    
    // 采样不透明度贴图
    alpha = tex.Sample(sampler, sample_uv);
    
    // 阈值化
    if (alpha >= threshold)
        coverage_mask |= (1 << sampleIndex);

// 5. 输出最终覆盖遮罩
output.coverage = coverage_mask; // → SV_Coverage
```

### 关键注意事项

- **梯度缩放**：在 4x MSAA Swizzle 设置下，UV 梯度（`ddx` / `ddy`）是正常值的 **2 倍**，必须乘以 **0.5** 进行校正
- **DD Offset Mask**：定义了如何从触发像素（Provoking Pixel）的 UV 偏移到各子采样位置
  - 最通用情况（触发像素在左上角）：偏移方向为 **右上 → 左下 → 右下**

### 性能对比效果

- 对比 **非 MSAA 预通道** vs **MSAA + 手动 SV_Coverage 预通道**：

| 指标 | 非 MSAA 预通道 | MSAA + 手动 SV_Coverage |
|---|---|---|
| **Wave 数量** | 更多 | **显著减少** |
| **渲染目标写入（Export Allocation）** | 大量 Wave 阻塞在写出阶段 | 写出阶段更高效、时间更短 |
| **整体性能** | 基线 | **显著提升** |

- 原因分析：
  - 非 MSAA 下，Alpha Test 产生大量 **碎片化 Wave**，频繁写出到渲染目标
  - MSAA + 手动覆盖遮罩将多个子采样的写出 **合并到一次操作中**，减少了 Wave 数量和写出瓶颈

### 不同场景下的预通道性能增益

| 场景类型 | 分辨率 | 性能增益 |
|---|---|---|
| **重度 Alpha Test 过绘制场景** | 2 MP | **~29%** |
| 重度 Alpha Test 过绘制场景 | 1 MP | **~20%** |
| **典型均衡场景**（混合几何类型） | 2 MP | **~11%** |
| 典型均衡场景 | 1 MP | **~5%** |

---

## 预通道的带宽与后续 Pass 优化

### 带宽优化来源

- 预通道改进不仅体现在直接性能上，还为 **后续 Compute Job** 带来巨大的 **带宽节省**：
  - **深度/模板解压缩** 显著加速
  - **速度、法线、Primitive ID** 等数据如果使用 FMask 方向也可节省
  - 通过 **稀疏采样紧凑化（Sparse Sample Compaction）** 实现多种算法优化
  - 低分辨率 Pass 只需 **读取 Plane 0**（隐式可用），带宽直接 **削减 75%**，某些情况下甚至可以 **绕过 FMask 查询**

### PS4 1080p 下的实测数据

| Pass 名称 | 优化前 | 优化后 | 增益 |
|---|---|---|---|
| **深度解压 + 深度金字塔** | 0.45 ms | 0.25 ms | **44%** |
| **Primitive ID 处理** | 0.21 ms | 0.072 ms | **~66%**（得益于算法优化） |
| **速度结果（带宽受限）** | 0.11 ms | 0.10 ms | **~15%** |

---

## Compute Shader 的稀疏采样优化

### 核心思路：LDS 工作队列

- 目标：在 Compute Shader 中高效处理 **稀疏的 MSAA 子采样**
- 核心方法：**在 LDS（本地数据存储）中生成活跃采样的工作队列**

### 详细实现流程

#### 步骤 1：从 FMask 构建二进制采样遮罩

```hlsl
uint sampleMask = 0;
for (int plane = 0; plane < numPlanes; plane++) {
    uint msaaSampleIndex = FMask.Load(coord, plane);
    sampleMask |= (1 << msaaSampleIndex);
}
```

- 遍历所有 Plane，从 FMask 读取 MSAA 采样索引
- 拼接成一个 **二进制采样遮罩**，标记哪些子采样是 **真正不同的**

#### 步骤 2：紧凑化并上传到 LDS 工作队列

```hlsl
for (int plane = 0; plane < numPlanes; plane++) {
    bool isActive = (sampleMask >> plane) & 1;
    
    // 在 Wave 内进行 Ballot：获取当前 Plane 上所有活跃线程的掩码
    uint64_t producerMask = WaveBallot(isActive);
    
    if (isActive) {
        // 使用 BitCount 紧凑化计算本地队列偏移
        uint localOffset = WavePrefixCountBits(producerMask);
        
        // 将数据上传到 LDS 工作队列
        workQueue[queueOffset + localOffset] = LoadMSAAData(coord, plane);
    }
}
```

- **Ballot 操作**：获取当前 Wave 中所有线程在该 Plane 上的活跃状态
- **Producer Mask**：标记哪些线程为当前 Plane 贡献了有效数据
- **紧凑化偏移**：通过 `BitCount`（前缀 popcount）计算无间隙的队列偏移

#### 步骤 3：以 Wave 宽度批次消费队列

```hlsl
uint totalItems = queueSize;
uint offset = 0;

while (offset < totalItems) {
    // 每个线程加载自己的紧凑化数据
    uint myIndex = offset + WaveLaneIndex;
    if (myIndex < totalItems) {
        DataPayload data = workQueue[myIndex];
        ProcessData(data); // 处理任意数据负载
    }
    offset += WaveSize;
}
```

- LDS 队列刷新后，用一个 **while 循环** 以 **Wave 宽度为批次** 滚动消费队列中的数据
- 每个线程加载自己对应的紧凑化数据项进行处理

### 优势总结

- 将 **稀疏分布的活跃采样** 紧凑化为 **连续的工作队列**
- 避免了大量线程在非活跃采样上 **空转浪费**
- 适用于所有需要处理 MSAA 数据的 Compute Job

---

## 不透明绘制（Opaque Draws）的设置

### 颜色缓冲配置

- **必须禁用 FMask 压缩**
- 原因：不透明绘制中 **无法预知每个像素会渲染多少个子采样**
  - 最坏情况下会渲染 **所有子采样**
  - FMask 在这种场景下 **无法提供压缩收益**
  - 反而会 **增加不必要的带宽和内存开销**
  - 还会 **显著复杂化后续的图像 Resolve 处理**

### 模板（Stencil）配置

- 设置为 **VRS Pass 生成的点阵化模板值（Stippled Stencil Value）**
- 通过模板测试控制哪些子采样需要着色

### 深度测试配置

- **无 Alpha Test**
- 使用 **Depth Equal** 测试（因为预通道已写入精确深度）

### 插值与纹理采样校正

#### 插值模式

- 必须使用 **逐采样插值（Per-Sample Interpolation）**

#### 纹理 LOD 偏移

- Swizzle 渲染下的纹理 LOD 与非 Swizzle 不匹配
- 解决方案：使用 **`SampleBias`** 并设置偏移值为 **非 Swizzle 与 Swizzle 目标之间的差值**
- 在 4x MSAA Swizzle 的典型情况下，偏移值为 **-1**（因为 X 和 Y 各差一级 MIP）

#### 导数校正

- 如果像素着色器中 **任何地方用到了 `ddx` / `ddy` 的结果**，必须手动乘以 **0.5**
- 与预通道中的梯度校正规则一致

### 各 Plane 的着色可视化

通过逐 Plane 观察 Stencil 裁切模式下的着色结果：

| Plane | 对应内容 | 特征 |
|---|---|---|
| **Plane 0**（Color 0） | **触发像素（Provoking Pixel）** | **始终着色**，提供完整的基础图像 |
| **Plane 1**（Color 1） | 第一个子采样 | **非常稀疏**，仅沿水平梯度方向的少数线条有着色 |
| **Plane 2**（Color 2） | 第二个子采样 | **极其稀疏**，精确匹配所有几何体的边缘 |
| **Plane 3**（Color 3） | 第三个子采样 | 与 Plane 2 类似，每个 Plane 捕获 **与该采样位置相关的高频特征** |

- **核心观察**：VRS 遮罩确保了 **只有真正需要额外子采样的区域** 才会在高编号 Plane 上产生像素着色器调用，其余区域保持稀疏



# 图像重建与 VRS 解析（Resolve）

---

## 硬件 VRS 与软件 VRS 的画质对比

### 视觉质量差异

- 通过测试渲染对比 **硬件 VRS** 和 **软件 VRS** 在非调试区域的图像质量：

| 方案 | 低着色率区域的视觉表现 |
|---|---|
| **硬件 VRS** | 看起来像 **最近邻上采样（Nearest Neighbor Upsampling）**，画质较差，有明显的块状伪影 |
| **软件 VRS** | 看起来像 **双线性采样（Bilinear Sampling）**，能正确保留所有 **低频梯度信息**，过渡平滑 |

### 伪影在运动中的严重性

- 硬件 VRS 的块状伪影在 **运动场景中极为分散注意力**
- 原因：VRS 的最小 Tile 尺寸至少为 **2×2 像素**
- 这种尺度的伪影 **大多数 TAA 实现无法有效处理**（TAA 通常针对亚像素级别的抖动设计，2×2 的块状变化超出其有效范围）

---

## VRS Resolve 的基本流程

### 核心步骤

当进行 VRS 解析和重建时，需要：

1. **读取 VRS 渲染遮罩**（Per-Quad）
2. **解压** 遮罩数据
3. **根据不同的插值模式进行 Resolve**

### 遮罩类型决定 Resolve 方式

| 遮罩类型 | 数据来源 | 特点 |
|---|---|---|
| **FMask** | 几何信息 | 更适合基于几何的解析结果 |
| **Image Mask** | 图像梯度信息 | 需要选择 **正确的插值模式** 以避免块状伪影 |

### 邻域有效性检查——关键注意事项

- **核心问题**：当插值需要读取 **当前 Quad 外部的子采样** 时，那些子采样 **可能并不存在**（因为相邻 Quad 可能使用了更低的着色率）
- **解决方案**：在读取前 **检查邻居 Quad 的 VRS 渲染遮罩**，确认目标子采样是否可用
  - 如果不可用 → **回退（Fallback）到该 Quad 中其他可用的子采样**

---

## 子采样回退机制的具体实现

### 代码逻辑概述

```hlsl
// 1. 加载第一个子采样（Provoking Pixel）—— 始终可用
float4 sample0 = msaaTexture.Load(coord, 0);

// 2. 遍历额外的 3 个子采样
for (int i = 1; i < 4; i++)
{
    // 加载该子采样对应位置的 VRS 遮罩
    uint neighborVRSMask = LoadVRSMask(sampleCoord[i]);
    
    // 调用辅助函数：获取实际应采样的 Sample ID
    int actualSampleID = GetFallbackSampleID(neighborVRSMask, i);
    
    // 从 MSAA 纹理中加载实际可用的子采样
    float4 sampleN = msaaTexture.Load(sampleCoord[i], actualSampleID);
}
```

### `GetFallbackSampleID` 内部逻辑

1. 将 VRS 遮罩 **转换为位图表示（Bitmap）**，标记哪些子采样实际存在
2. 检查目标 Sample ID 对应的位是否为 **活跃（Active）**
3. 如果 **活跃** → 直接返回该 Sample ID
4. 如果 **不活跃** → 使用 **`firstbitlow`**（找到最低有效位）回退到 **第一个可用的子采样**

---

## 不同采样率下的重建路径

### 一采样/Quad（1 Sample Per Quad）

- 只有 **Provoking Pixel** 有有效数据
- 重建三个缺失的子采样：

| 缺失子采样位置 | 重建方式 |
|---|---|
| **右侧（水平邻居）** | 从 **2 个最近的 Provoking Pixel** 插值（水平方向） |
| **下方（垂直邻居）** | 从 **2 个最近的 Provoking Pixel** 插值（垂直方向） |
| **对角线位置** | 从 **4 个最近的 Provoking Pixel** 插值（完整 2×2 邻域） |

### 两采样/Quad（2 Samples Per Quad）

- 根据梯度方向分为 **水平解析** 和 **垂直解析**：

| 解析方向 | 已有采样 | 缺失采样的重建方式 |
|---|---|---|
| **水平 Resolve** | 左右两个子采样 | 对每个缺失的垂直子采样，从 **2 个最近的水平子采样** 混合 |
| **垂直 Resolve** | 上下两个子采样 | 对每个缺失的水平子采样，从 **2 个最近的垂直子采样** 混合 |

### 四采样/Quad（4 Samples Per Quad）

- 所有子采样均已着色，**无需任何重建**，直接使用

---

## 高级重建：基于机器学习的查找表方法

### 基本思路

- 更复杂的重建可以 **预计算最优重建模式权重**，类似于 **覆盖率重建抗锯齿（Coverage Reconstruction Anti-Aliasing, CRAA）** 的方法
- 流程：
  1. 收集邻域中所有 Quad 的采样模式
  2. 将模式编码为一个 **哈希值**
  3. 用哈希值查找 **预计算的查找表（LUT）**，获取重建编码
  4. 采样与加权循环使用重建编码，选择 **正确的采样点** 并以 **最优权重** 混合

### 搜索空间分析

| 参数 | 值 |
|---|---|
| **每个邻居的遮罩** | 2 bit |
| **3×3 邻域** | 9 个邻居 × 2 bit = **18 bit 哈希** |
| **查找表大小** | $2^{18} = 262,144$ 条目 |
| **每条目最小负载** | 8 bit（每个邻域采样 1 bit 控制） |
| **权重控制** | 可选，以更多数据为代价 |

- 18 bit 的查找表大小 **仍在可接受范围内**

### 搜索空间优化：象限子空间（Quadrant Subspace）

- 利用 **象限子空间** 概念缩小搜索范围：
  - 对于每个需要重建的子采样，只考虑 **最近的象限（Quadrant）** 内的 Quad
  - 每个子采样有自己独立的象限子空间进行重建
- 搜索空间从 **3×3 邻域** 缩小到 **2×2 邻域**：

$$\text{哈希长度}: 18 \text{ bit} \rightarrow 8 \text{ bit}$$

$$\text{查找表大小}: 262,144 \rightarrow 256 \text{ 条目}$$

### 实际应用情况

- 在 **60Hz 的《使命召唤》** 中，这种高级重建方法 **开销相对过大**
- 与前述的朴素双线性模式相比，**性价比不足**
- 团队 **没有花太多时间优化**，未来可能会 **重新审视** 这一方案



# 优化 Compute Shader 任务与 Wave 压缩

---

## 问题背景：Compute Shader 缺乏硬件打包支持

### Pixel Shader vs Compute Shader 的打包差异

| 特性 | Pixel Shader | Compute Shader |
|---|---|---|
| **Wave 打包机制** | 硬件自动完成（Tile Walker + Wave Packer） | **无硬件支持** |
| **VRS 效率获取** | 自动受益于 Stencil 遮罩剔除 | 需要 **软件方案** |
| **空闲线程处理** | 硬件跳过无效 Quad | 仍会执行无效线程 |

- 全屏 Compute Pass 生成的数据会被 **Forward+ 等渲染路径** 消费
- 如果 Wave 没有正确压缩（Compact），将包含大量 **无效像素**，严重浪费算力

### 需要解决的核心问题

> 如何让 Compute Shader 也能像 Pixel Shader 一样，**跳过 VRS 标记为低采样率的子采样**，只处理真正活跃的工作？

---

## 方案一：逐平面迭代（Plane Iteration）

### 基本思想

- 不暴力评估所有子采样，而是 **只迭代活跃的子采样平面（Active Subsample Planes）**

### Dispatch Indirect 路径

对每个 **16×16 屏幕 Tile**：

1. **OR 合并** 该 Tile 内所有 Quad 的活跃子采样平面
2. 发射 **与活跃位数量相同的 Wave**
3. 在 **Per-Wave 缓冲** 中存储 **2-bit ID**，让每个 Wave 知道自己在 16×16 Tile 中的位置

### Shader 内循环（Wave Rolling）方案

```hlsl
// 1. 每个线程加载自己的 VRS 遮罩
uint vrsMask = LoadSoftwareVRSMask(threadCoord);

// 2. 获取当前线程的有效采样遮罩
uint validSampleMask = GetValidSampleMask(vrsMask);

// 3. 使用跨 Lane 操作（Cross-Lane Op）将所有线程的遮罩 OR 合并
//    得到整个 Wave 的统一采样迭代遮罩
uint waveSampleIterMask = WaveActiveBitOr(validSampleMask);

// 4. 迭代直到所有平面的采样都处理完毕
while (waveSampleIterMask != 0)
{
    uint currentPlane = firstbitlow(waveSampleIterMask);
    waveSampleIterMask &= ~(1u << currentPlane);
    
    // 检查当前线程是否在此平面有活跃采样
    if (validSampleMask & (1u << currentPlane))
    {
        // 执行实际计算（如光照、阴影等）
        DoCompute(threadCoord, currentPlane);
    }
}
```

### 方案一的局限性

- **长 Wave Rolling 可能导致流水线停顿**：当 Wave 内各线程的迭代次数差异很大（高分歧）时，快速完成的线程需要等待慢线程
- **平面级调度效率低**：即使一个 16×16 Tile 中 **只有一个 Quad 需要某个平面**，仍需为整个 Tile 调度一个完整 Wave

### 效率可视化

| 软件 VRS 遮罩（Per-Quad 采样数） | 逐平面迭代后的 Wave 采样数 |
|---|---|
| 白色 = 4 采样，灰色 = 2~3 采样，黑色 = 1 采样 | 大量 Wave 仍需处理不必要的平面，效率较低 |

- 在 **噪声较多的图像** 中（采样模式频繁变化），效率特别差

---

## 方案二：Wave 压缩（Wave Compaction）—— 推荐方案

### 核心思想

- 不按平面分组，而是 **将所有活跃工作项紧密打包到尽可能少的 Wave 中**
- 目标：将调度的总 Wave 数最小化为：

$$\text{Wave 数} = \left\lceil \frac{\sum \text{所有活跃工作项}}{64} \right\rceil$$

（假设 Wave 大小为 64）

### 预处理阶段详解

以一个假设的 **Wave 大小为 2×2 = 4 线程** 的简化 GPU 为例：

#### 步骤 1：计算每个 Tile 的总工作量

- 对 16×16 Tile 内每个 Quad，统计活跃子采样数
- 汇总得到该 Tile 的 **总活跃线程数**
- 计算所需的 **Wave Roll 次数**

| Tile 编号 | 活跃线程总数 | 所需 Wave Roll 次数 |
|---|---|---|
| Tile 0 | 8 | 2 |
| Tile 1 | 12 | 3 |
| Tile 2 | 7 | 2 |
| Tile 3 | 15 | 4 |

#### 步骤 2：按子采样 ID 排序并紧密打包

1. 遍历所有 Quad，将工作项按 **子采样 ID 排序**
2. 将排序后的工作项 **逐一打包进 Wave 槽位**
3. 结果：同一平面的采样被 **聚集在连续的 Wave 中**

#### 步骤 3：编码线程偏移映射

- 每个线程的偏移信息编码为：

| 字段 | 位宽 | 含义 |
|---|---|---|
| **X 坐标** | 4 bit | 在 16×16 Tile 内的 X 位置 |
| **Y 坐标** | 4 bit | 在 16×16 Tile 内的 Y 位置 |
| **Wave 迭代计数** | 2 bit | 该线程属于第几次 Wave Roll |

- 存储为 **每 64 线程一组的偏移块**

### 关键优化

1. **Sample 0 始终存在**：由于采样模式保证 Sample 0 一定被渲染，**第一个 Wave 的偏移映射无需存储**（直接使用原始位置）
2. **全 4 Wave Roll 无需重打包**：如果一个 Tile 需要全部 4 次 Roll，说明几乎所有采样都是活跃的，重打包没有收益，直接按原始布局执行

### 完整代码流程概述

```hlsl
// ========== 预处理 Shader ==========

// 1. 每个线程加载其子采样计数
uint sampleCount = LoadSubsampleCount(threadID);

// 2. Wave 内求和：总共需要多少活跃采样
uint totalSamples = WaveActiveSum(sampleCount);

// 3. 计算 Wave Roll 次数
uint waveRolls = (totalSamples + WAVE_SIZE - 1) / WAVE_SIZE;

// 4. 如果 1 < waveRolls < 4，需要生成扩展偏移映射
if (waveRolls > 1 && waveRolls < 4)
{
    // 将工作项位置加载到 LDS 队列
    // 每个工作项 = 线程在 16×16 Tile 内的偏移
    LoadItemsToLDSQueue(threadID, sampleCount);
    
    // 同步 LDS
    GroupMemoryBarrierWithGroupSync();
    
    // 紧密打包并输出 2 个额外平面的偏移数据
    for (int plane = 1; plane < waveRolls; plane++)
    {
        OutputCompactedPlane(plane, ldsQueue);
    }
}

// 5. 输出 Per-Tile 的 Wave 计数
OutputTileWaveCount(tileID, waveRolls);

// ========== Indirect Dispatch Shader ==========

// 1. 读取 VRS 遮罩
uint vrsMask = LoadVRSMask(threadID);

// 2. 计算本 Tile 的 Indirect Dispatch 线程偏移
//    使用 Tiled Exclusive Prefix Sum
uint localOffset = TiledExclusivePrefixSum(vrsMask);

// 3. 计算需要发射的 Wave 数量
uint unrolledWaves = CalculateUnrolledWaveCount();

// 4. 更新 Indirect Argument Buffer
if (unrolledWaves > 0)
    InterlockedAdd(indirectArgs.waveCount, unrolledWaves);

// 5. 为每个需要打包的 Wave 写入辅助数据
PerWaveAuxData aux;
aux.packingEnabled = (waveRolls > 1 && waveRolls < 4);
aux.waveID = computedWaveID;
aux.threadOffsets = computedOffsets;
StorePerWaveData(waveID, aux);

// ========== 实际执行 Shader ==========

// 每个 Wave 处理 8×8 执行 Tile，读取 16×16 Tile 数据

// 1. 读取本 Wave 的身份信息
WaveData myData = LoadWaveData(waveID);

// 2. 确定像素坐标
float2 pixelPos;
if (myData.packingEnabled)
{
    // 从 VRS Tile Packing Buffer 读取打包后的偏移
    uint packedOffset = LoadPackedOffset(myData.waveID, laneID);
    pixelPos = DecodeTilePosition(packedOffset); // 从 4+4 bit 解码
}
else
{
    // 无打包：直接使用 Wave 内部位置映射到 16×16 Tile
    pixelPos = MapToGlobalTile(laneID, tileOrigin);
}

// 3. 获取最终屏幕坐标
float2 screenCoord = tileOrigin + pixelPos;

// 4. 执行实际计算
DoSomethingForSample(screenCoord, sampleID);
```

---

## Wave 压缩可视化与分析

### 三种方案的可视化对比

| 可视化内容 | 描述 |
|---|---|
| **Per-Quad 采样数遮罩** | 白 = 4 采样，灰 = 2~3，黑 = 1 |
| **逐平面迭代后的 Per-Wave 采样数** | 大量 Wave 仍有空闲线程，效率低 |
| **Wave 压缩后的 Per-Wave 采样数** | Wave 被紧密填充，**显著优于逐平面迭代** |

### Wave 压缩偏移映射的可视化

- 每个可见块展示 **编码后的线程偏移**
- **视觉上接近均匀渐变的块** → Wave 几乎被完全填满
- **倾斜或混杂的块** → Wave 由 **多个 Tile 的残余工作** 打包而成
- **颜色越深** → Wave 中执行的线程越少（效率越低）

---

## 性能实测

### 太阳可见性计算（Sun Visibility Job）——最昂贵的 Compute 任务之一

以 **1080p** 分辨率为例：

| 方法 | Wave 数量 | 耗时 | 相对节省 |
|---|---|---|---|
| **暴力全采样（Baseline）** | 32,000 | 0.77 ms | — |
| **逐平面迭代** | ~30,000 | 0.70 ms | ~9% |
| **Wave 压缩** | **~26,000** | **~0.58 ms** | **~25%** |

### 适用性总结

| 场景 | 是否推荐 Wave 压缩 | 原因 |
|---|---|---|
| **昂贵的 Compute 任务**（光照、阴影、SSAO 等） | ✅ **强烈推荐** | 25% 的 Wave 减少带来显著时间节省 |
| **极轻量的 Compute 任务** | ⚠️ **视情况而定** | 解包（Unpacking）的开销可能 **超过** 暴力计算所有子



# 性能数据与分析

---

## 4K 高端平台场景分析

### 测试场景特征

- **分辨率**：4K
- **平台**：高端主机
- 场景整体偏暗色调，但包含：
  - **大量镜面反射**（所有表面）
  - **多处高频细节**
  - 针对 **HDR 电视** 调校，暗部理应可见（演示为 SDR，暗部被压黑）

### 画质对比

| 对比方式 | 观察结果 |
|---|---|
| **直接观察** | 开启 VRS 与关闭 **几乎无法区分** |
| **1 EV 曝光差异图** | 仅在 **部分高光边缘** 可见极微小差异 |
| **6 EV 曝光差异图** | 开始看到更多差异，但仍 **主要集中在高光边缘和微小斑点** |
| **其他区域** | 差异均在 **场景噪声限度内** |

### 着色率分布可视化

| 颜色 | 采样率 | 典型区域 |
|---|---|---|
| **绿色** | 1 采样/Quad | 雾气区域 |
| **黄色** | 2 采样/Quad | 中等细节过渡区 |
| **品红色** | 3 采样/Quad | 较丰富细节区 |
| **红色** | 4 采样/Quad（全采样） | 砖墙、地面镜面反射、远处建筑 |

- 分布与图像频率信息 **高度匹配**

---

## 动态分辨率缩放（DRS）对 VRS 效率的影响

### 核心发现：分辨率越低，VRS 效率越低

| 分辨率 | VRS 效率趋势 | 原因 |
|---|---|---|
| **4K（100%）** | **最高效** | Quad 分布最优，大量区域可降采样 |
| **半分辨率 4K** | 效率下降 | Quad 需更频繁提升到更高采样率以维持画质 |
| **900p** | 显著下降 | 差异 **相当惊人**，红色区域大幅增加 |
| **最低 DRS 步骤** | 效率急剧下降 | 几乎所有区域都需要高采样率 |

**原因分析**：低分辨率下，每个像素 Quad 覆盖更大的屏幕区域，包含更多高频变化的概率更高，因此更多 Quad 被判定需要高采样率。

### 高端平台（4K）性能数据表

| DRS 步骤 | 分辨率（相对 4K） | VRS 增益百分比 |
|---|---|---|
| **Step 0** | 100%（原生 4K） | **~20%** |
| **Step 15** | 50%（2K） | **~3%** |

- **绝对时间节省**：4K 原生分辨率下 **超过 5 毫秒**
- **递减规律**：随分辨率降低，增益从 20% **逐步递减至约 3%**

### 视图模型（武器）的特殊表现

- 视图模型（View Model）区域 **三角形密度极高**
- VRS 在该区域的 **初始增益就不大**
- 随分辨率降低，增益下降也 **不如场景其他部分明显**（因为本身就没有多少优化空间）

---

## 低端平台（900p 基准）性能分析

### 递减趋势更加显著

| DRS 步骤 | 分辨率（相对 900p） | VRS 增益百分比 |
|---|---|---|
| **Step 0** | 100%（原生 900p） | **~9%** |
| **最低步骤** | 50%（450p） | **~4%** |

- 对比 4K：起始增益从 **20% 降到 9%**
- 递减速度也 **更快**

### 关键结论

> 即使在最低分辨率的最差情况下，VRS **仍然提供正向增益**，从未出现性能损失。

---

## 不同场景类型的性能表现

### 最差场景：高密度植被

| 指标 | 数值 |
|---|---|
| **平台** | PS4（1080p） |
| **VRS 关闭** | 16.5 ms |
| **VRS 开启** | **15.5 ms**（节省 ~1 ms） |

- 这是 VRS 的 **最差场景**：
  - 大量植被 → **Quad 占用率极高**
  - 画面非常嘈杂 → **到处都是高频细节**
- 即使最差情况仍有 **约 1 ms 的增益**

### 典型混合场景

| 指标 | 数值 |
|---|---|
| **平台** | PS4（1080p） |
| **VRS 关闭** | 15.65 ms |
| **VRS 开启** | **~13.65 ms**（节省 ~2 ms） |

- 混合光照条件，大量模型，部分室外
- 作为 **默认性能基准场景** 具有代表性
- VRS 遮罩可视化：
  - 招牌、墙壁 → 高着色率
  - 明暗过渡区域 → **完美保留**

---

## Tile 尺寸对性能的影响（软件 VRS vs 硬件 VRS 模拟）

### 实验设计

- 将软件 VRS 的 Tile 尺寸从 **2×2** 扩大到 **4×4** 和 **8×8**
- 模拟 **硬件 VRS 在相同设置下的表现**

### 性能对比

| Tile 尺寸 | 视图模型性能变化 | 场景整体性能变化 |
|---|---|---|
| **2×2（软件 VRS）** | 基准 | 基准 |
| **4×4** | 性能下降 | 损失 **~8%** |
| **8×8（模拟硬件 VRS）** | 损失 **~0.25 ms** | 损失 **~20%** |

### 视觉质量同步退化

- 从 2×2 → 4×4 → 8×8，**效率退化在视觉上非常明显**
- 更大的 Tile 意味着更粗糙的着色率控制，高频区域更容易被错误地降采样

### 关键结论

> 这些数据 **明确证明了软件 VRS 相对硬件 VRS 的显著优势**——更小的 Tile 尺寸（2×2 vs 8×8）带来的性能增益和画质保持是 **质的差别**。

---

## 综合结论

### 性能增益总结

```
┌────────────────────────────────────────────────────┐
│           软件 VRS 性能增益范围                       │
│                                                      │
│  4K 高端平台（最佳情况）:    ~20% 增益（>5 ms）       │
│  4K 高端平台（DRS 最低）:    ~3% 增益                │
│  900p 低端平台（最佳情况）:  ~9% 增益                 │
│  900p 低端平台（DRS 最低）:  ~4% 增益                 │
│  最差场景（植被密集 1080p）:  ~1 ms 增益              │
│  典型场景（混合 1080p）:      ~2 ms 增益              │
│                                                      │
│  ✅ 所有情况下 VRS 均为正增益，从未出现性能损失        │
└────────────────────────────────────────────────────┘
```

### 核心洞察

| 维度 | 洞察 |
|---|---|
| **分辨率影响** | VRS 增益与分辨率 **正相关**——分辨率越高，增益越大（因为更多 Quad 可降采样） |
| **场景复杂度** | 高频细节密集（植被等）的场景增益较低，但 **永远不为负** |
| **Tile 尺寸** | 2×2 Tile 在性能和画质上 **全面优于** 4×4 和 8×8；这是软件方案的核心竞争力 |
| **与 DRS 的协同** | VRS 和 DRS 可 **叠加使用**，但效果有递减；高分辨率时 VRS 更有价值，低分辨率时 DRS 更有效 |
| **实用性** | 在 **所有平台**（包括无硬件 VRS 的当代主机）上均可部署，且始终带来正向收益 |

### 软件 VRS vs 硬件 VRS 最终对比

| 维度 | 软件 VRS（2×2 Tile） | 硬件 VRS（8×8 Tile） |
|---|---|---|
| **最小 Tile 粒度** | 2×2 像素 | 8×8 像素（无 MSAA 时 16×16） |
| **着色率控制精度** | 极高 | 较粗 |
| **高频区域画质** | 优秀 | 明显块状伪影 |
| **TAA 兼容性** | 良好（2×2 伪影可被 TAA 处理） | 差（8×8 伪影超出 TAA 处理范围） |
| **平台兼容性** | 全平台 | 仅支持 VRS 的 GPU |
| **性能增益** | 更高（小 Tile 更精准） | 较低（大 Tile 导致过度着色或欠着色） |
| **实现复杂度** | 高（需手动管理 MSAA Swizzle、遮罩、Resolve 等） | 低（GPU 原生支持） |



# 未来发展方向与总结

---

## VFX 与不透明物体的 VRS 交互问题

### 当前行为

- VFX（视觉特效，如烟雾、粒子）经常 **大面积遮挡不透明物体**
- VRS 遮罩是从 **VFX 渲染之后的梯度** 推导的，因此：

| 场景情况 | VRS 行为 | 效果 |
|---|---|---|
| VFX 大面积遮挡不透明物体 | 被遮挡区域梯度降低 → 自动降低着色率 | ✅ **很好**——被遮挡区域无需高着色率 |
| VFX 几乎不可见（如薄雾） | VFX **复用不透明物体的 VRS 遮罩** | ❌ **浪费**——VFX 被迫以高着色率渲染 |

### 问题详解

- 当 VFX 视觉上 **几乎不可察觉**（如森林中的薄雾）时：
  - 不透明物体渲染后的图像与透明物体渲染后的图像 **差异极小**
  - 但不透明物体的遮罩包含 **大量高频细节**（如树叶纹理）
  - VFX 复用该遮罩 → 被迫以 **非常高的着色率** 渲染
  - 实际上这些 VFX **在感知上完全不可见**，完全是浪费

### 提议的解决方案：历史透明遮罩（History Trans Mask）

- 使用 **不透明渲染结果与透明渲染结果之间的亮度差异（Luma Difference）** 作为遮罩
- 该技术已在 **Jorge Jimenez 的 TAA 演讲** 中介绍过
- 利用该历史遮罩为透明物体推导 **独立的、感知驱动的 VRS 着色率**

**限制**：

| VRS 类型 | 实现难度 |
|---|---|
| **软件 VRS** | 需要 **额外的离屏渲染目标**，因为 Stencil 剔除造成的空洞无法填补 |
| **硬件 VRS** | 可以直接使用不同的遮罩并 **复制子采样**（硬件自动处理） |

---

## 其他未来发展方向

### 动态 VRS：优先着色率缩放而非分辨率缩放

- **核心理念**：用 **降低着色率** 替代 **降低分辨率**
- **优势**：在远距离保持更好的 **轮廓保真度（Silhouette Preservation）**
  - 分辨率缩放会损失几何细节，VRS 着色率缩放保留几何但降低着色复杂度

### 更多后处理步骤启用 VRS

- 后处理效果具有 **比动态分辨率缩放更好的扩展潜力**
- 实现要求：将 **Deblock 和最终 Resolve 移至后处理之后**

### TAA 感知 VRS（TAA-Aware VRS）

- 让时间抗锯齿 **直接感知 VRS 的子采样数据**
- TAA 可以 **直接使用 VRS 的子采样**，跳过整个 Resolve 路径
- **潜力极高**：
  - 画质 **优于当前方案**
  - 性能 **更快**（省去单独的 Resolve Pass）

### 低 Quad 占用率绘制转延迟渲染

- **问题**：某些绘制调用的 Quad 占用率极低（大量浪费）
- **方案**：分析 Tile，使用 **Stencil + Indirect Dispatch** 按效率分流：

| 效率分类 | 渲染路径 |
|---|---|
| **高 Quad 占用率** | 常规前向渲染 |
| **低 Quad 占用率** | **可见性缓冲 + 延迟渲染** |

- 延迟方法天然避免 Quad 占用率问题

### 均匀动态分辨率缩放

- 当前：**仅水平方向** 缩放
- 未来：切换为 **均匀缩放（水平 + 垂直）**
- 预期：**更高的 Quad 占用率**

---

## 不同渲染架构的适用性总结

### 综合对比表

| 渲染架构 | MSAA 预通道 | Wave 压缩 | VRS 绘制 | VRS 后处理 | 总体评价 |
|---|---|---|---|---|---|
| **Forward+** | ✅ **大幅受益** | ✅ 高效 | ⚠️ **混合结果**：低分辨率时因 Quad 占用率上升而收益递减 | ✅ 推荐 | 良好 |
| **Forward+ 透明** | ✅ 高度受益 | ✅ 高效 | ✅ **一如既往地高度受益** | ✅ 推荐 | 优秀 |
| **Deferred** | ⚠️ **视内容而定**，可能因 Quad 占用率上升受损；且 **无法利用 MSAA 插值的顶点属性打包优势**，可能迫使 G-Buffer 路径变得比非 MSAA 更慢 | ✅ 高效 | ⚠️ 类似问题 | ✅ 推荐 | 中等偏下 |
| **Deferred 透明** | ✅ 高度受益 | ✅ 高效 | ✅ **一如既往地高度受益** | ✅ 推荐 | 优秀 |
| **可见性缓冲（Visibility Buffer）** | ✅ **最大化预通道效率**（纯顶点插值） | ✅ 高效 | ✅ **不受三角形占用率问题影响** | ✅ 推荐 | **🏆 最佳候选** |
| **光线追踪** | — | ✅ 用于高效 Ray Bundle 提交 | ✅ 变化每像素/每 Tile 的采样数量 | — | 高度依赖具体实现，但 **必然受益** |

### 关键洞察

- **可见性缓冲是最理想的架构**：最大化预通道效率，不受 Quad 占用率问题影响
- **Wave 压缩和 VRS 后处理几乎没有缺点**，唯一例外是 **非常快速的短 Compute Pass**——此时 VRS 遮罩和 Swizzle 的设置开销可能超过实际执行节省
- **光线追踪**：《使命召唤：现代战争》中用于 **光追阴影**，通过 VRS 改变每像素/每 Tile 的采样数，再用 Wave 压缩进行高效的 Ray Bundle 提交

---

## 最终总结

### 本演讲呈现的完整系统

| 模块 | 内容 |
|---|---|
| **梯度检测** | 基于韦伯定律的感知驱动局部梯度检测 |
| **MSAA 预通道** | 4x MSAA Swizzle 设置、Alpha Test 处理 |
| **Wave 压缩** | 前缀和（Prefix Sum）打包算法 |
| **VRS 绘制设置** | 前向/延迟/可见性缓冲的适配 |
| **图像重建** | 邻域感知的双线性 Resolve |
| **VRS 后处理管线** | 提议的未来方向 |

### 核心价值主张

> **软件可变速率着色管线** 允许你：
> - 在动态分辨率缩放中 **维持更高的分辨率步进**
> - 或 **瞄准更高的目标分辨率**
> - 对 **高 PPI（每英寸像素）设备** 特别有效
> - 系统是 **模块化的**——可根据用例 **挑选组合** 不同组件