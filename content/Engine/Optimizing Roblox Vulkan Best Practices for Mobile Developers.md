# Optimizing Roblox: Vulkan Best Practices for Mobile Developers

[Optimizing Roblox: Vulkan Best Practices for Mobile Developers](https://www.youtube.com/watch?v=BXlo09Kbp2k)

---

## Vulkan 最佳实践示例框架

- ARM 与 Roblox 合作，围绕 **GPU 优化** 和 **CPU 优化** 两方面展示 Vulkan 移动端最佳实践
- ARM 在 GDC 2019 发布了一套 **Vulkan Best Practice Samples** ，后捐赠给 **Khronos Group** ，并整合了 Sascha Willems 的热门示例
- 框架核心特性：
  - **跨平台** ：同时支持桌面端和移动端运行
  - **封装 API** ：对 Vulkan 对象进行包装，简化使用
  - **Shader 反射（Shader Reflection）** ：根据着色器自动生成所需的 Vulkan 对象（如 DescriptorSetLayout 等）
  - **glTF 导入器** ：支持加载标准 glTF 场景
- 每个示例均配有详细文章，包含 **代码片段、图解和示例** ，解释背后的理论原理
- 示例运行时可 **实时切换不同渲染路径** ，并通过屏幕上的 **硬件计数器（Hardware Counters）** 监控性能影响（如 FPS、Vertex/Fragment Cycles）

---

## 即时模式渲染 vs 分块渲染（Immediate Mode vs Tiled-Based Rendering）

### 即时模式渲染器（Immediate Mode GPU）

- 常见于 **桌面端和主机** 架构
- 工作流程：
  1. 所有几何体先经过顶点处理，放入队列
  2. 然后 **逐 Draw Call** 进行片段处理
  3. 每个像素执行 **深度测试** 和 **颜色着色** ，需要频繁地从 **主内存（Main Memory）** 读写数据
- 问题： **带宽消耗极高、能耗巨大** （图示中用双向箭头表示频繁的内存读写）

### 分块渲染器（Tile-Based Renderer）

- 常见于 **移动端 GPU** （如 ARM Mali）
- 核心思想：将屏幕划分为 **小块像素区域（Tiles）** ，将大量内存操作移至 GPU 内部
- 工作流程分为 **两个阶段** ：
  1. **Binning 阶段** ：处理所有几何体，将三角形分配到对应的 Tile
  2. **Rendering 阶段** ：逐 Tile 处理片段，使用 **Tile Local Memory（片上局部内存）** 完成计算，仅在最后将 **最终结果** 写回主内存
- 优势： **大幅节省带宽** ，因为中间数据（如深度值）可以完全驻留在 Tile Local Memory 中，无需与主内存交互
- **Tile Local Memory** 是分块渲染的核心概念，Vulkan API 提供了相应机制来充分利用这一特性

---

## 加载/存储操作（Load/Store Operations）

### 基本概念

- 在 Vulkan 中，渲染使用的图像缓冲被称为 **附件（Attachments）** ，例如颜色附件和深度附件
- 这些附件的集合及其使用方式构成一个 **渲染通道（Render Pass）**
- 每个 Render Pass 由一个或多个 **子通道（Subpass）** 组成
- 定义 Render Pass 时，必须为每个附件指定 **Load Operation** 和 **Store Operation** ，即渲染 **前** 和 **后** 如何处理附件数据

### Load Operation（加载操作）

定义渲染开始 **前** 对附件做什么：

| 选项 | 含义 | 移动端性能影响 |
|---|---|---|
| **`LOAD_OP_LOAD`** | 加载之前的内容 | ❌ **非常昂贵** ，需要从主内存读取整个附件到 Tile Memory |
| **`LOAD_OP_CLEAR`** | 用指定值清除 | ✅ 高效，无需从主内存加载 |
| **`LOAD_OP_DONT_CARE`** | 不关心初始内容 | ✅ 最优，驱动自行选择最高效方式 |

- **关键注意** ：`LOAD_OP_CLEAR` 与 `vkCmdClearAttachments` **完全不同** ！
  - `LOAD_OP_CLEAR` ：在 Tile 处理开始前直接清零，几乎零成本
  - `vkCmdClearAttachments` ：显式命令 GPU **写一个清除值到主内存** ，如果之后还要覆盖写入，这是完全 **浪费的操作**
- **最佳实践** ：
  - ❌ 除非确实需要前一帧内容，否则 **不要使用 `LOAD_OP_LOAD`**
  - ❌ **不要使用 `vkCmdClearAttachments`** ，如果可以用 `LOAD_OP_CLEAR` 或 `LOAD_OP_DONT_CARE` 代替

### Store Operation（存储操作）

定义渲染结束 **后** 对附件做什么：

| 选项 | 含义 | 适用场景 |
|---|---|---|
| **`STORE_OP_STORE`** | 将结果写回主内存 | 颜色附件（需要呈现到屏幕） |
| **`STORE_OP_DONT_CARE`** | 不关心内容，不写回 | 深度附件（渲染完成后通常不再需要） |

- **关键优化** ：深度附件大多数情况下在 Render Pass 结束后 **不再需要** ，应使用 **`STORE_OP_DONT_CARE`** ，避免将深度值写回主内存

### Transient Attachment（瞬态附件）优化

当一个附件同时满足以下条件时，可以实现 **完全不分配主内存** 的终极优化：

1. Load Operation 为 `CLEAR` 或 `DONT_CARE` （不需要从主内存加载）
2. Store Operation 为 `DONT_CARE` （不需要写回主内存）

此时附件 **完全驻留在 Tile Local Memory** 中。Vulkan 提供了声明方式：

- 在附件的 `VkImageUsageFlags` 中设置 **`VK_IMAGE_USAGE_TRANSIENT_ATTACHMENT_BIT`**
- 在内存分配的 `VkMemoryPropertyFlags` 中设置 **`VK_MEMORY_PROPERTY_LAZILY_ALLOCATED_BIT`**

这样分块渲染器 **可以完全跳过主内存分配** ，深度缓冲等附件仅存在于 Tile Local Memory 中。

### 示例效果演示

在示例中通过硬件计数器可以直观观察到：

- 将颜色 Load Operation 从 `LOAD` 切换为 `CLEAR` → **外部读取计数器显著下降**
- 将深度 Store Operation 从 `STORE` 切换为 `DONT_CARE` → **外部写入计数器大幅降低**
- 取消冗余的 `vkCmdClearAttachments` 调用 → **片段周期（Fragment Cycles）节省**
- 整体效果：**带宽大幅降低 → 功耗显著改善**

---

## 子通道（Subpasses）与子通道融合（Subpass Merging / Fusion）

### 延迟渲染中的多子通道场景

以 **延迟渲染（Deferred Rendering）** 为例，通常需要两个子通道：

- **Subpass 1（G-Buffer 生成）** ：输出 Normal、Depth、Color 三个附件（即 **G-Buffer** ）
- **Subpass 2（光照计算）** ：读取 G-Buffer 数据，计算最终光照结果

### 子通道融合（Subpass Merging）

- **核心条件** ：两个子通道之间存在 **逐像素依赖（Per-Pixel Dependency）** ，即 Subpass 2 的每个像素仅依赖 Subpass 1 中 **同一像素位置** 的数据
- 当满足此条件时，分块 GPU **可以将多个子通道合并** ，在 **同一个 Tile 内连续执行所有子通道** ，而非分别执行
- 合并后的工作流：
  1. 对某个 Tile 执行 Subpass 1 → 结果留在 Tile Local Memory
  2. 立即在同一 Tile 上执行 Subpass 2 → 直接从 Tile Local Memory 读取 G-Buffer
  3. 仅将 **最终光照结果** 写回主内存
- **巨大优势** ：G-Buffer 中的 Normal、Depth 等中间附件 **无需写回主内存** ，全部可以标记为 **Transient Attachment** ，完全驻留于 Tile Local Memory
- 这与之前单个 Subpass 中深度附件的 Transient 优化原理一致，但效果更加显著，因为 **多个大尺寸附件** 都避免了主内存分配和读写

### 实现要点

- 需要在 Vulkan Render Pass 中正确设置 **Subpass 依赖关系（Subpass Dependencies）** 和 **Input Attachments**
- G-Buffer 附件的 Load/Store 设置：
  - Load: `CLEAR` 或 `DONT_CARE`
  - Store: `DONT_CARE` （子通道融合后不再需要写出）
  - Usage: `TRANSIENT_ATTACHMENT_BIT`
  - Memory: `LAZILY_ALLOCATED_BIT`
- 子通道融合是否实际发生取决于 **GPU 驱动实现** ，并非所有硬件都保证支持，但正确设置 Vulkan 结构可以 **让驱动有机会执行此优化**



## Subpass 带宽收益示例

- 示例通过 **外部读写字节数（External Read/Write Bytes）** 直观展示带宽节省效果
- 关键对比：
  - 使用 **两个独立 Render Pass** ：G-Buffer 必须写出到主内存，再被读回，带宽开销巨大
  - 使用 **两个 Subpass（可被驱动合并）** ：G-Buffer 数据始终留在 **Tile Local Memory** 中，避免主内存读写
- 切换时底部两张图表会出现 **显著的带宽下降** ，直观验证了 Subpass 合并的优势

---

## 管线屏障（Pipeline Barriers）

### 依赖关系与同步

- 在延迟渲染中，第二个 Subpass（光照计算）**依赖** 第一个 Subpass（G-Buffer 生成）的输出
- 这种依赖引出了 Vulkan 中复杂的 **同步（Synchronization）** 话题
- 对于 Subpass 内部依赖，使用 **Subpass Dependency** ；更通用的场景使用 **Pipeline Barrier**

### 管线阶段（Pipeline Stages）

- Vulkan 定义了一个枚举，列出图形管线的所有可能阶段
- 关键阶段（按执行顺序）：

```
TOP_OF_PIPE → 顶点/几何阶段 → 光栅化 → 片段阶段 → BOTTOM_OF_PIPE
```

| 阶段 | 含义 |
|---|---|
| **`TOP_OF_PIPE`** | 辅助阶段，表示命令 **已被解析** |
| **顶点/几何阶段** | 顶点着色器、几何着色器等处理 |
| **片段阶段** | 片段着色器处理 |
| **`BOTTOM_OF_PIPE`** | 辅助阶段，表示命令 **已完成退役** |

### Barrier 的核心机制

- **Barrier 将命令流分为两半** ：
  - Barrier **之前** 的所有命令必须通过 **源阶段（Source Stage）**
  - Barrier **之后** 的所有命令在 **目标阶段（Destination Stage）** 等待，直到上述条件满足
- 本质是在说："后面的工作到了某个阶段时先停下，直到前面的工作完成了某个阶段"

### 实例分析：Mali 双处理槽（Vertex Slot + Fragment Slot）

Mali 等移动端 GPU 拥有 **顶点处理槽** 和 **片段处理槽** ，可以并行执行不同阶段的工作。

#### ❌ 错误做法：`BOTTOM_OF_PIPE → TOP_OF_PIPE` Barrier

- 含义：Barrier 后的命令在 **最早阶段（TOP）** 就开始等待，直到 Barrier 前的命令 **完全结束（BOTTOM）**
- 结果：**完全串行化** ——下一个 Render Pass 的顶点工作无法与上一个 Render Pass 的片段工作重叠
- 在时间线上会出现明显的 **气泡（Bubbles）** ，GPU 利用率极低

#### ✅ 正确做法：`FRAGMENT → FRAGMENT` Barrier

- 含义：Barrier 后的命令在 **片段阶段** 等待，直到 Barrier 前的命令也完成了 **片段阶段**
- 结果：下一个 Render Pass 的 **顶点工作可以与上一个 Render Pass 的片段工作并行执行**
- 消除了气泡， **最大化吞吐量**
- 原理：顶点阶段并不依赖前一个 Render Pass 的片段输出，因此无需在顶点阶段就阻塞

#### 核心原则

> **避免 `BOTTOM_OF_PIPE → TOP_OF_PIPE` 式的过度同步！**
> 应根据实际数据依赖关系，选择 **最小正确屏障（Minimal Correct Barrier）** ，即恰好覆盖依赖关系、不多不少的同步点。

---

## Pipeline Barrier 示例

- 示例中加入了 **高频采样** 来观测顶点和片段处理周期
- 使用 `FRAGMENT → FRAGMENT` Barrier 时：
  - 顶点处理的 **峰值与片段处理的平台期重叠** ，说明两者 **并行执行**
- 在真实游戏中，仅仅修改 Barrier 策略就曾带来 **高达 56% 的 FPS 提升** ——一个简单但影响巨大的优化

---

## 多重采样抗锯齿（MSAA, Multisample Anti-Aliasing）

### 锯齿产生的原因

- 无 MSAA 时，光栅化判断像素是否着色只看 **像素中心** 是否在三角形内
- 这导致边缘出现 **阶梯效应（Staircase Effect）** ，即常说的 **锯齿（Jagged Edges）**

### MSAA 的工作原理

1. **多点采样** ：每个像素不再只看中心点，而是检查 **多个采样点** （例如 4x MSAA = 4 个采样点）
2. **覆盖判定** ：只要 **任一采样点** 落在三角形内，该像素就会被着色
3. **着色器仍只执行一次** ：使用像素中心坐标进行片段着色（不是每个采样点各执行一次）
4. **结果写入覆盖的采样点** ：片段着色器的结果被存储到所有落在三角形内的采样点中
5. **颜色求平均（Color Resolve）** ：将所有采样点的颜色值取平均，得到最终像素颜色

例如：4 个采样点中有 2 个在三角形内 → 最终颜色 = 50% 三角形颜色 + 50% 背景色 → **平滑的边缘过渡**

### Tile-Based 渲染器上的 MSAA 优势

- **Color Resolve 操作可以完全在 Tile Local Memory 中完成**
- 无需将所有采样点数据写出到主内存，只写出 **最终 Resolve 后的单个颜色值**
- 多重采样附件可标记为 **Transient（瞬态）** ，与之前 G-Buffer 和深度附件同理，节省大量内存和带宽

### Vulkan 中的正确实现

#### ✅ 正确做法：在 Render Pass 创建时指定 Resolve Attachment

- 在 `VkAttachmentDescription` 和 Subpass 描述中 **预先声明 Resolve Attachment**
- 流程：在 Tile 内完成 4x MSAA 渲染 → 在 Tile 内 Resolve → **仅将 Resolve 后的单像素颜色写回主内存**
- 带宽开销极小

#### ❌ 错误做法：使用 `vkCmdResolveImage` 命令

- 流程：
  1. GPU 被迫将 **所有采样点数据（4x 数据量）写出到主内存**
  2. 再从主内存 **读回所有采样点**
  3. 执行一个 **独立的 Resolve Pass**
- 结果： **带宽开销极其巨大且完全可避免**

### MSAA 示例

- 启用 4x MSAA 并使用 Render Pass 内 Resolve 时：带宽 **几乎无增长**
- 切换到 `vkCmdResolveImage` 后：带宽 **急剧飙升** ，图表上出现明显的差值
- 示例还额外展示了 **深度 Resolve（Depth Resolve）** ：
  - 这是 **Vulkan 1.2** 引入的新特性
  - 与颜色 Resolve 原理类似，但设置步骤略多
  - 允许在 Tile 内直接 Resolve 深度附件，避免多采样深度数据写出到主内存

---

## 关键要点总结表

| 优化项 | 核心做法 | 潜在收益 |
|---|---|---|
| **Subpass 合并** | 将 G-Buffer 和光照放入同一 Render Pass 的不同 Subpass | 大幅减少中间缓冲区的主内存读写 |
| **Pipeline Barrier** | 避免 `BOTTOM→TOP` ，使用 `FRAGMENT→FRAGMENT` 等最小正确屏障 | 最高 **56% FPS 提升** |
| **MSAA Resolve** | 在 Render Pass 创建时指定 Resolve Attachment，避免 `vkCmdResolveImage` | MSAA 几乎零带宽额外开销 |
| **Transient Attachment** | 多采样附件标记为 `LAZILY_ALLOCATED` | 节省内存分配和带宽 |



# Roblox 渲染优化：CPU 侧 Vulkan 优化

---

## Roblox 平台特性与优化动机

### 平台定位

- Roblox 是一个 **在线多人游戏创作平台** ，关键词是 **"平台"**
- Roblox **不构建游戏内容** ，所有内容由 **社区创作者** 制作
- 支持大量不同的 **软硬件平台** 和多种 **图形 API** ，本次聚焦 **Android 上的 Vulkan**

### 为什么 CPU 优化至关重要

- 由于内容由社区创建，Roblox **无法控制内容复杂度**
- 提升性能的主要手段是 **优化引擎本身** ，让渲染更快
- 社区创建的游戏/展示场景往往 **几何体和 Draw Call 密集** ——例如场景中的树木实际上是由 **大量微小图元（Primitives）** 拼出来的，而非整体 Mesh
- 因此 **Draw Call 越廉价，帧渲染越快** （前提是游戏处于 **CPU Bound** 状态）

---

## 渲染接口设计与优化目标

### 统一抽象层

- Roblox **没有独立的 Vulkan 渲染器** ，而是维护一套 **通用渲染接口抽象层（Common Rendering Interface）** ，然后为每个图形 API（包括 Vulkan）提供 **具体实现**
- 优化目标：确保 Vulkan 实现尽可能高效

### 设计权衡

需要同时满足两个有时矛盾的目标：

| 目标 | 说明 |
|---|---|
| **易用性** | 接口对渲染工程师友好、简洁直观 |
| **性能** | 单线程执行效率高 |
| **多线程友好** | 支持从多线程录制命令，最小化 **锁竞争（Contention）** |

### 接口示例流程

```
1. 创建 Command Buffer
2. Begin Pass（开始渲染通道）
3. Bind Program（绑定着色器集合）
4. 设置其他渲染状态
5. 绑定资源（Buffer、Texture 等）
6. 提交 Draw Call
```

接下来逐步讲解每个环节如何映射到 Vulkan，以及如何在 CPU 侧做优化。

---

## Command Buffer 管理

### 基本操作看似简单

- 最朴素的做法：`vkAllocateCommandBuffers` 分配 → 录制 → `vkQueueSubmit` 提交执行
- 但在 **多线程** 和 **实际生产环境** 中远比这复杂

### 核心挑战

1. **线程安全限制** ：同一个 **Command Pool** 分配出的 Command Buffer **不能被多线程并发录制** ，因此需要为不同线程准备 **不同的 Command Pool**
2. **生命周期管理** ：提交执行后的 Command Buffer **不能被复用** ，直到 GPU 真正执行完毕
3. **API 调用开销** ：
   - `vkAllocateCommandBuffers` 在某些驱动实现上有 **明显开销**
   - `vkFreeCommandBuffers` 在某些驱动实现上 **并不会真正释放命令内存** ，因此不能简单依赖 allocate/free 来管理内存

### Roblox 的解决方案：Command Pool 池（Pool of Pools）

采用 **Command Pool 池** 策略，而非仅使用一两个 Command Pool：

#### 完整生命周期

```
┌─── 录制阶段 ───┐     ┌─── 提交阶段 ───┐     ┌─── 回收阶段 ───┐
│                │     │                │     │                │
│ 1. 从池中获取   │     │ 3. 帧结束时     │     │ 5. GPU 执行完毕 │
│    空闲 Pool   │ ──▶ │    批量提交所有  │ ──▶ │   （数帧之后）   │
│ 2. 分配并录制   │     │    Command Buffer│    │ 6. 重置 Pool    │
│    Command Buffer│   │    （单次 submit）│    │    回收复用     │
│                │     │ 4. 其他线程可    │     │                │
│                │     │    立即复用 Pool │     │                │
└────────────────┘     └────────────────┘     └────────────────┘
```

#### 关键设计细节

1. **获取空闲 Pool** ：创建 Command Buffer 时，从池中取出一个 **当前未被使用的 Command Pool**
2. **延迟提交** ：录制完成后 **不立即提交到设备** ，仅标记为"待执行"；此时该 Pool 即可被其他线程复用
3. **批量提交（Batched Submit）** ：帧结束时，将该帧所有 Command Buffer 通过 **一次 `vkQueueSubmit` 调用** 统一提交
   - ✅ **最小化提交开销**
   - ⚠️ 不一定是 CPU-GPU 延迟最优解，但对 Roblox 的场景够用
4. **帧级回收** ：GPU 完成该帧渲染后（通常延迟数帧），调用 **`vkResetCommandPool`** 重置整个 Pool
   - 重置 Pool 会自动让其中所有 Command Buffer 恢复可用状态
   - **无需逐个 `vkFreeCommandBuffers`** ，省去单独释放的开销
   - 之前分配过的 Command Buffer 可以 **直接重新录制** ，无需重新分配

#### 方案优势

| 方面 | 收益 |
|---|---|
| **性能开销** | 避免频繁 allocate/free，减少驱动层开销 |
| **内存效率** | 通过 Pool Reset 统一管理，内存利用率高 |
| **易用性** | 对上层渲染工程师透明，接口简洁 |
| **多线程安全** | 每个线程使用独立 Pool，无锁竞争 |



## Render Pass 管理

### 核心挑战：缺乏全局帧视图

- Render Pass 涉及大量状态管理，最大的难题是 **没有全局帧视图（No Global View of the Frame）**
- 当一个 Render Pass 将结果渲染到某张纹理时，**不知道这张纹理将来会如何被使用**
- 因此 **无法总是做出最优的 Barrier 配置**
- Roblox **不使用 Render Graph** ，而是采用 **"部分指定 + 自动推断"** 的平衡策略

### 接口设计：指定什么，推断什么

| 由渲染工程师显式指定 | 由引擎自动推断 |
|---|---|
| 渲染目标纹理（Render Targets） | Render Pass 对象的创建与缓存 |
| **Load/Store Actions** （加载、存储、清除） | Image Layout Transitions |
| | Pipeline Barriers |

### 延迟创建与缓存（Lazy Creation & Caching）

- **不预创建 Render Pass 对象** ，不强制渲染工程师提前声明
- 而是在首次使用时 **延迟创建并缓存（Lazy Create & Cache）**
- 代价：第一帧可能略慢
- 但由于帧结构 **高度规律** ，后续帧全部命中缓存，因此 **不构成实际问题**

### Image Layout Transition 策略

#### 传统做法的问题

- 一些引擎为每个资源维护 **当前资源状态（Current Resource State）**
- 但这与 **多线程录制不兼容** ——多个线程同时修改同一资源的状态会产生竞争

#### Roblox 的做法：默认资源状态（Default Resource State）

- 为每个资源定义一个 **默认状态（Default State）** ，即 **Render Pass 之间** 资源应处于的状态
  - 例如：可被着色器读取的纹理，默认状态为 **`SHADER_READ_ONLY_OPTIMAL`**
- 每个 Render Pass：
  - **开始时** ：从默认状态 → 转换到 Pass 内所需状态
  - **结束时** ：从 Pass 内状态 → 转换回默认状态

#### 利用 Load/Store Actions 优化 Transition

这看起来似乎不够高效（每个 Pass 前后都要做 Transition），但通过 Load/Store Actions 可以 **将部分 Transition 替换为更廉价的版本** ：

| 场景 | 朴素 Transition | 优化 Transition | 原理 |
|---|---|---|---|
| **Load = DONT_CARE** | `SHADER_READ_ONLY → COLOR_ATTACHMENT` | **`UNDEFINED → COLOR_ATTACHMENT`** | 不需要保留旧内容，驱动可跳过数据保留 |
| **Store = DONT_CARE** | `COLOR_ATTACHMENT → SHADER_READ_ONLY` | **`COLOR_ATTACHMENT → UNDEFINED`** | 不需要写出内容，驱动可跳过同步 |

- 在某些驱动和 GPU 上，从 **`UNDEFINED`** 转换可以 **节省可观的 GPU 时间**

#### Pipeline Barrier 的简化假设

- 如果 **不存储纹理** ：完全跳过同步，无需 Barrier
- 如果 **存储纹理** ：默认假设结果仅用于 **片段着色阶段（Fragment Stage）**
- 若结果纹理需要用于 **其他阶段** （如 Compute），渲染工程师需 **显式指定**

> **为什么默认假设 Fragment Stage？**
> 这确保了 **顶点阶段和片段阶段可以默认并行执行** ，这对 **Tile-Based GPU** 至关重要（正如前面 Pipeline Barrier 章节所述，`FRAGMENT → FRAGMENT` 是最优的默认同步策略）。

---

## Pipeline State 管理

### 延迟创建 + 多级缓存

- Pipeline State Object（PSO）同样采用 **延迟创建 + 缓存** 策略
- **两级缓存架构** ：

| 缓存层级 | 存储位置 | 作用 |
|---|---|---|
| **内存缓存（In-Memory Cache）** | RAM | 运行时快速查找已创建的 PSO |
| **磁盘缓存（On-Disk Cache）** | 存储设备 | 游戏启动时加载到 **`VkPipelineCache`** 对象，避免驱动重复编译着色器 |

- 首次遇到唯一的 **着色器 + 状态组合** 时会有额外编译开销
- 但 Roblox 的着色器排列数量 **仅在数百量级（Low Hundreds）** ，因此前几帧就能快速填满缓存
- 序列化到磁盘后，后续启动也同样快速

### 多线程无锁查找：双哈希表（Dual Hash Table）

为了在多线程录制时 **减少锁竞争（Contention）** ，PSO 缓存使用了一种精巧的 **双哈希表** 设计：

```
帧内执行流程：
┌──────────────────────────────────┐
│  只读哈希表（Read-Only Hash Map） │ ◄── 多线程并发查找，无需任何 Mutex
│  （包含上一帧末尾迁移来的所有条目）│
└──────────┬───────────────────────┘
           │ 未命中？
           ▼
┌──────────────────────────────────┐
│  读写哈希表（Read-Write Hash Map）│ ◄── 需要 Mutex 保护，可能触发 PSO 创建
│  （本帧新创建的条目暂存于此）     │
└──────────┬───────────────────────┘
           │ 帧结束时
           ▼
    所有条目迁移到只读哈希表
    → 下一帧访问重新变为无竞争
```

#### 工作原理

1. **帧内查找** ：首先查询 **只读哈希表** ，该表 **任意数量的线程可并发读取** ，零锁开销
2. **未命中时** ：查询 **读写哈希表** ，此时需要 **加锁（Mutex）** ，可能触发新 PSO 的创建（昂贵操作）
3. **帧结束时** ：将读写哈希表中所有 **新条目迁移到只读哈希表**
4. **下一帧** ：所有条目都在只读表中，访问再次 **完全无竞争**

#### 核心优势

- **稳态（Steady State）下完全无锁** ：前几帧填充完毕后，所有查找都命中只读表
- 即使偶尔需要创建新 PSO，也只影响单个线程单次操作
- 这是一个通用的 **多线程缓存优化技巧** ，适用于任何"写少读多"的缓存场景



## 描述符管理（Descriptor Management）

### 基于槽位的绑定模型

- Roblox 采用 **基于槽位（Slot-Based）** 的资源绑定方案
- 只有两个命名空间：**Buffer** 和 **Texture**
- 绑定方式类似 **Metal / D3D11 / OpenGL 的混合体**
- 关键简化：**不区分管线阶段** ，使用 **全局统一的槽位命名空间**
  - 例如：Buffer 槽位 1 在顶点、片段、计算着色器中都是同一个槽位 1
  - 编程上非常方便，且 **与 Vulkan 映射良好**

### Descriptor Set Layout 的自动配置

- 创建 **Pipeline State Object** 时，通过 **Shader 反射元数据（Reflection Metadata）** 查询所需资源槽位
- 例如：着色器声明"顶点阶段需要槽位 1 的常量缓冲区"，引擎自动配置对应的 **Descriptor Set Layout**
- **无需用户额外输入**

### Descriptor Pool 策略

#### ❌ 朴素方案：每个 Pipeline 一个 Pool

- 为每种 Shader/Pipeline 配置创建专属 Descriptor Pool（如"3 个纹理描述符 + 2 个缓冲描述符"）
- **问题一：内存浪费** ——很少使用的 Pipeline 也会预分配大量 Descriptor Set
- **问题二：多线程困难** ——每个 Pool 只能被单线程分配和更新，Pool 数量爆炸导致管理复杂

#### ✅ Roblox 方案：统一类型的 Pool + 按平均值配置

- 整个帧只使用 **单一类型的 Descriptor Pool**
- 不按最坏情况配置，而是按 **跨大量游戏场景统计出的平均值** 配置：
  - 平均每个 Descriptor Set 约 **1.5 个 Buffer 槽位**
  - 平均每个 Descriptor Set 约 **3.5 个 Texture 槽位**
- 更复杂的 Descriptor Set 仍然可以从这种 Pool 中分配，只是可能略有内存浪费
- 只要平均值计算准确，浪费 **可以忽略不计**

### 多线程安全：Pool of Pools

与 Command Buffer 管理相同的 **"池中池"** 策略：

```
每个录制线程：
  ├── 持有一个当前 Descriptor Pool
  ├── 从中分配 Descriptor Set
  ├── 如果 Pool 空间耗尽 → 从全局 Pool 池获取新 Pool
  └── 帧结束（GPU 执行完毕后）→ 重置整个 Pool 回收复用
```

- **不释放单个 Descriptor Set** ，而是 **整体重置 Pool**（`vkResetDescriptorPool`）
- 分配后 **立即更新** ，不从已有 Set 复制描述符（在某些驱动上更高效）

### Descriptor 更新优化

#### Descriptor Update Templates（Vulkan 1.1）

- 使用 **`VkDescriptorUpdateTemplate`** 批量更新描述符
- 在部分驱动上 **节省 CPU 时间**

#### 动态偏移（Dynamic Offsets）—— 核心优化

- **纹理描述符** ：每次都必须分配新 Set 并更新
- **Buffer 描述符** ：可以利用 **动态偏移** 避免重复更新

具体做法：

| 传统方式 | 优化方式 |
|---|---|
| 每个 Uniform Buffer 是独立对象 | 使用 **大缓冲区 + 子分配（Sub-Allocation）** |
| 每次变更都更新 Descriptor Set 中的 Buffer 描述符 | 仅更改 **动态偏移（Dynamic Offset）** ，重新绑定同一个 Set |
| 需要大量 Buffer Descriptor | **大幅减少** 所需的 Buffer Descriptor 数量 |

> **动态偏移** 是 Roblox 降低 Uniform 数据更新 CPU 开销的 **关键技术** ，同时节省描述符内存。

---

## 通用优化经验

### Vulkan 驱动更快 = 暴露自身低效

- Vulkan 驱动比 GLES 驱动 **快得多、高效得多**
- 但这也意味着：原本被 GLES 驱动高开销 **掩盖的自身代码低效** 会被暴露出来
- 例如：Roblox 必须 **优化渲染抽象层中的缓存命中率（Cache Misses）** ——在 GLES 上这被驱动开销淹没，Vulkan 上则成为瓶颈
- Vulkan 是一个很好的 **"强制优化函数"** ，推动整体代码质量提升

### 减少 Vulkan API 调用

核心原则：

> **如果可以不调用 Vulkan 函数，那就不调用。**

- 在自己的代码中做 **状态过滤/冗余检测** ，跳过不必要的 API 调用
  - 自己代码中的比较操作 **几乎零成本**
  - 而每次 Vulkan API 调用都有一定开销

### 绕过 Loader 层

- 标准 Vulkan 调用需经过 **Loader 层** ，有额外开销
- 使用专用加载器（如 **Volk** ）通过 **`vkGetDeviceProcAddr`** 获取 **设备级函数指针**
- 调用这些函数指针 **直接进入驱动** ，跳过 Loader 分发
- 在某些实现上可获得 **几个百分点的吞吐量提升**

---

## 优化成果

### CPU 侧渲染时间提升 2-3 倍

| 指标 | 说明 |
|---|---|
| **测量方式** | 不是单个 Draw Call 耗时，而是 **整帧渲染的端到端 CPU 时间** （包含非 API 相关的通用帧逻辑） |
| **对比基准** | 同一设备上 GLES vs Vulkan |
| **典型数据** | ARM GPU 上 GLES 约 **39ms** → Vulkan 约 **13ms** ，约 **3 倍提速** |
| **线程模式** | 以上结果仅为 **单线程录制** |

### 多线程扩展性

- 多线程命令录制 **尚未在生产环境部署**
- 内部测试显示扩展性良好，但需注意：
  - 移动设备普遍采用 **big.LITTLE 架构** ，大小核性能差异大
  - 在八核设备上用 8 个线程 **不能期望 8 倍加速**
  - 需要根据核心类型合理分配工作

---

## 延伸阅读与资源

### 推荐资料

- **Arseny Kapoulkine** 的文章 《Writing an Efficient Vulkan Renderer》 ——本次演讲多个示例的理论基础
- **Vulkan Best Practice Samples** 仓库（Khronos Group 维护）
  - 包含本次演讲中展示的所有示例
  - **接受社区贡献** ：可以提交反馈、提出新示例想法，或直接开发提交 PR

### 示例仓库涵盖的主题

覆盖了本次演讲涉及的全部最佳实践：

- Load/Store 操作优化
- Subpass 合并与带宽节省
- Pipeline Barrier 最小化同步
- MSAA 与分块渲染的结合
- 描述符管理策略
- Command Buffer 与 Pool 管理