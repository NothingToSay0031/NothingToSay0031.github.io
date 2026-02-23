---
title: "CPU Performance Optimization Guide"
date: 2026-01-23 15:33:58
---

# CPU 性能优化指南

[CPU Performance Optimization Guide](https://gpuopen.com/learn/cpu-performance-guide/cpu-performance-guide-preface/)

## 一、性能的本质定义

### 1.1 性能 ≠ 速度

- "更快" 是相对概念，两个程序都快但可能都性能差
- **效率（Efficiency）** 与速度不同：效率强调 **资源的最优利用**，不产生浪费
- 性能与具体 **指标（Metrics）** 绑定，常见指标：
  - **速度**：程序执行有多快
  - **IPC（Instructions Per Cycle）**：每周期执行的指令数
  - **CPI（Cycles Per Instruction）**：每条指令消耗的周期数

---

## 二、四大核心性能指标

### 2.1 延迟（Latency）

- **定义**：CPU 执行单位指令数所需的时间
- **衡量标准**：**CPI**（越低越好）
- 低延迟 = 程序响应时间短

### 2.2 吞吐量（Throughput）

- **定义**：CPU 单位时间内执行的指令数量
- **衡量标准**：**IPC**（越高越好）
- 高吞吐量 = 相同时间内完成更多操作

### 2.3 功耗（Power Consumption）

- 在移动设备（笔记本、手机）上尤为重要
- 低功耗 = 更节能高效

### 2.4 稳定性（Stability）

- 程序运行时间可能波动
- **衡量标准**：性能数据的 **方差** 以及 **最高延迟值**
- 稳定程序 = 无卡顿、无偶发高延迟

> **小结**：好程序在各场景表现均衡，不同指标间取得良好平衡。

---

## 三、性能测试方法论

### 3.1 微基准测试（Microbenchmarking）

**为什么不测整个程序？**

1. **帕累托法则**：仅少量代码导致性能问题，但其余代码也会干扰结果
2. **构建耗时**：大型项目编译动辄数小时，依赖管理更是噩梦

**正确做法**：
- 控制测试范围
- 最小化干扰源
- 缩短构建时间
- 仅针对关注的代码创建独立 benchmark 程序

### 3.2 高精度计时器

- 使用 C++ `<chrono>` 库
- **推荐**：`std::chrono::steady_clock`（最适合计时测量）

```cpp
auto start = std::chrono::steady_clock::now();
// 待测代码
auto end = std::chrono::steady_clock::now();
auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
```

### 3.3 性能分析工具

- 计时统计仅提供概览，精确定位需要 **性能分析器（Profiler）**
- 现代分析器可追踪 **PMC（Performance Monitor Counters，硬件性能计数器）**
- PMC 用于追踪硬件事件，识别特定代码段的 CPU 时钟周期和硬件级性能问题

**AMD 工具链**：
- 分析器：**AMD μProf**
- 文档：《Processor Programming Reference (PPR) for AMD》
- PMC 详细说明位于文档的 "Performance Monitor Counters" 章节

---

## 四、实现高性能的关键技能

### 4.1 评估性能的原则

| ❌ 错误做法 | ✅ 正确做法 |
|-------------|-------------|
| 凭直觉猜测性能 | 基于测试和分析获取指标 |
| 相信模糊陈述（如"模板比宏快"） | 在具体场景中实测验证 |
| 完全信任编译器和 CPU | 分析汇编代码和 PMC |

> **核心观点**：相同逻辑代码可能生成完全不同的汇编；相同汇编在不同 CPU 上性能也可能不同。

### 4.2 高性能六大要素

1. **正确的算法**
2. **有效利用 CPU 资源**
3. **良好的内存访问模式**
4. **避免额外计算**
5. **高效使用编程语言特性**
6. **测试与分析数据**

---

## 五、持续优化的思维

- CPU 硬件和编程语言在不断演进
- 理解计算机和程序的底层工作原理
- 掌握硬件利用方法
- 建立 **标准化分析流程**

> 优化编译器和编程语言的道路永无止境，适应动态变化是关键能力。


# CPU 性能优化实战：三元最大值问题分析

## 一、问题描述

### 1.1 任务背景

图形和科学计算中的常见需求：**如何更快地获取三个变量的最大值？**

C++ 中有三种实现方式：

```cpp
// 方案 1：宏定义
#define max(a,b) (((a) > (b)) ? (a) : (b))

// 方案 2：std::max 两参数版本
const T& std::max( const T& a, const T& b )

// 方案 3：std::max 初始化列表版本
T std::max( std::initializer_list<T> ilist )
```

> **关键认知**：哪种更快取决于 **数据类型** 和 **CPU 架构**，必须在约束条件下测试。

### 1.2 测试环境约束

| 约束项 | 具体配置 |
|--------|----------|
| **数据类型** | 32 位浮点数（float） |
| **编译器** | Visual Studio 2022 (19.38.33135)，x64 RelWithDebInfo |
| **CPU** | AMD 7900X3D |
| **性能分析器** | AMD μProf 4.1.396 |

---

## 二、基准测试设计

### 2.1 微基准测试原则

- 代码量最小化，减少干扰
- 数据量足够大（1000 万个浮点数）
- 数据随机但可复现（固定随机种子）

### 2.2 数据准备

```cpp
using T = float;

std::default_random_engine eng(200);  // 固定种子
std::uniform_real_distribution<T> distr;

std::vector<T> buf(10000000);
for (auto& i : buf) {
    i = distr(eng);
}
```

### 2.3 测试函数

```cpp
template <typename T, int P>
__declspec(noinline) T test(const std::vector<T>& vec) {
    T result = 0;
    auto start = std::chrono::steady_clock::now();
    
    for (auto i = std::cbegin(vec) + 2, end = vec.cend(); i != end; i = std::next(i)) {
        if (P == 1) {
            result = max(*(i - 2), max(*(i - 1), *i));        // 宏
        } else if (P == 2) {
            result = (std::max)(*(i - 2), (std::max)(*(i - 1), *i));  // std::max(a,b)
        } else {
            result = (std::max)({ *(i - 2), *(i - 1), *i });  // std::max(ilist)
        }
    }
    // 计时输出...
    return result;
}
```

> **技巧**：使用 `__declspec(noinline)` 防止编译器内联，便于调试和分析。

### 2.4 测试结果

| 方法 | 性能排名 |
|------|----------|
| `std::max(a, b)` | 🥇 最快 |
| `std::max(ilist)` | 🥈 中等 |
| `max 宏` | 🥉 最慢 |

---

## 三、性能剖析

### 3.1 汇编分析

#### ✅ std::max(a, b) —— 最优

- 使用 **cmov 系列指令**（条件移动）
- **无条件跳转**，避免分支预测失败

#### ❌ max 宏 —— 最差

- 编译器生成 **条件跳转指令**（jmp/jcc）
- 随机输入导致 **分支预测失败**

#### 📊 std::max(ilist) —— 中等

- 存在额外的 **数据拷贝** 和 **内部循环**
- 操作更多但逻辑正确

### 3.2 PMC 分析

使用 AMD μProf 的 **Assess Performance (Extended)** 模式，查看 Branch 视图：

| PMC 计数器 | 含义 |
|------------|------|
| **RETIRED_BR_INST** | 分支指令数 |
| **RETIRED_BR_INST_MISP** | 分支预测失败数 |
| **PTI 后缀** | 每千条指令的统计值 |

#### 测试函数的分支预测数据

- 每千条指令分支数：**321.26**
- 每千条指令预测失败数：**34.48**
- **整体预测失败率**：约 **10.73%**

#### 宏的具体分析

- 宏相关代码的预测失败率：**11.2%**
- 单条指令最高失败率：**33%**
- 即便如此，整体命中率仍达 **~90%**（现代 CPU 分支预测的强大能力）

---

## 四、核心结论

### 4.1 问题根源

| 表象 | 本质 |
|------|------|
| max 宏慢 | **三元运算符** 的编译问题 |
| Visual Studio 2022 | 对多级三元运算符生成 **条件跳转** 而非 cmov |

### 4.2 分支预测失败的代价

由于 CPU 的 **多级流水线设计**：

$$
\text{分支预测失败} \Rightarrow \text{流水线冲刷} + \text{重新加载} \Rightarrow \text{损失数百个时钟周期}
$$

### 4.3 优化建议

- **避免分支预测失败**：使用能生成 cmov 的写法
- **使用 `std::max(a, b)`**：编译器优化更好
- **不同 CPU 架构需实测**：流水线长度、分支预测模块各异

---

## 五、扩展思考（练习题）

测试以下变化组合的性能差异：

- 数据类型改为 **int 整数**
- 只取 **两个数** 的最大值（而非三个）
- 使用 **有序输入数据**（非随机）
- 使用 **if-else** 替代三元运算符

> **作者测试结论**：在随机输入、取两个整数最大值的情况下，三元运算符与 `std::max(a, b)` 速度相近。

---

## 六、关键要点总结

1. **相同逻辑的代码** 可能生成 **完全不同的汇编指令**
2. **不同汇编指令** 的性能可能 **差异巨大**
3. 性能优化的核心任务：**找到最优解**
4. 工具链掌握：汇编分析 + PMC 分析 = 完整优化流程


# CPU 性能优化实战：缓存失效问题分析

## 一、问题描述

### 1.1 核心问题

**如何发现并解决缓存失效（Cache Invalidation）问题？**

- 内存操作广泛分布于程序中
- **缓存与内存的读写速度差距**：数十到数百倍
- 优化目标：确保程序尽可能从缓存而非内存获取数据

### 1.2 数据结构对比

| 结构类型 | 描述 |
|----------|------|
| **结构体数组（Array of Structs）** | 连续存储结构体实例 |
| **指针数组（Array of Pointers）** | 存储指向结构体的指针 |

### 1.3 测试环境

| 配置项 | 具体内容 |
|--------|----------|
| 编译器 | Visual Studio 2022 (19.38.33135)，x64 RelWithDebInfo |
| CPU | AMD 7900X3D |
| 分析器 | AMD μProf 4.2.845 |
| 数据规模 | 5000 万个数据点 |

---

## 二、基准测试设计

### 2.1 测试函数

#### 结构体数组测试

```cpp
__declspec(noinline) float test_array(unsigned long long size) {
    float result = 0;
    std::vector<Point> points(size);

    auto start = std::chrono::steady_clock::now();
    for (const auto& i : points) {
        result = i.x + i.y + i.z + i.w;
    }
    // 计时输出...
    return result;
}
```

#### 指针数组测试（带可选软件预取）

```cpp
template <int prefetch>
__declspec(noinline) float test_pointer(unsigned long long size) {
    float result = 0;
    std::vector<std::unique_ptr<Point>> points;
    
    for (decltype(size) i = 0; i < size; ++i) {
        points.emplace_back(std::make_unique<Point>());
    }

    auto start = std::chrono::steady_clock::now();
    for (auto i = points.cbegin(); i < points.cend(); ++i) {
        if (prefetch) {
            _mm_prefetch((char*)((*std::next(i, 32)).get()), _MM_HINT_NTA);
            _mm_prefetch((char*)((*std::next(i, 48)).get()), _MM_HINT_NTA);
            _mm_prefetch((char*)((*std::next(i, 64)).get()), _MM_HINT_NTA);
        }
        result = (*i)->x + (*i)->y + (*i)->z + (*i)->w;
    }
    // 计时输出...
    return result;
}
```

### 2.2 测试结果

| 方法 | 性能排名 |
|------|----------|
| 结构体数组 | 🥇 最快 |
| 指针数组 + 软件预取 | 🥈 中等 |
| 指针数组（无预取） | 🥉 最慢 |

---

## 三、性能分析

### 3.1 PMC 分析方法

使用 AMD μProf 的 **"Assess Performance (Extended)"** 模式：

1. 运行程序收集数据
2. 切换到 **"ANALYZE"** 页面
3. 选择 **"Data Cache"** 视图

**关键 PMC 指标**（每千条指令归一化，PTI 后缀）：

| 指标名 | 含义 |
|--------|------|
| `L1_DEMAND_DC_REFILLS_LOCAL_DRAM` | L1 缓存未命中导致的内存读取 |
| `L1_DEMAND_DC_REFILLS_LOCAL_L2` | L1 缓存未命中导致的下级缓存读取 |
| `L1_DEMAND_DC_REFILLS_LOCAL_CACHE` | L1 缓存未命中导致的 L3 缓存读取 |

```
┌─────────────────────────────────────────────┐
│                   Core 0                     │
│  ┌─────────┐                                │
│  │ L1 (32K)│ ← Miss!                        │
│  └────┬────┘                                │
│       ↓                                     │
│  ┌─────────┐                                │
│  │ L2 (1M) │ ← LOCAL_L2 (命中这里)           │
│  └────┬────┘                                │
└───────┼─────────────────────────────────────┘
        ↓
┌───────┴─────────────────────────────────────┐
│         CCX (Core Complex)                   │
│  ┌──────────────────────────────────────┐   │
│  │           L3 (32M 共享)               │   │
│  │       ← LOCAL_CACHE (命中这里)        │   │
│  └──────────────────────────────────────┘   │
└───────┬─────────────────────────────────────┘
        ↓
┌───────┴─────────────────────────────────────┐
│         Memory Controller                    │
│  ┌──────────────────────────────────────┐   │
│  │           DDR4/DDR5 内存              │   │
│  │       ← LOCAL_DRAM (从这里取)         │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3.2 指针数组分析（无预取）

`test_pointer<0>` 函数的 PMC 数据：

- **11.60** 次内存读取（L1 缓存未命中）/ 千指令
- **0.1** 次下级缓存读取 / 千指令
- **0.1** 次 L3 缓存读取 / 千指令

> **问题根源**：指针指向的内存地址随机分布，无法触发硬件预取

### 3.3 硬件缓存预取（Hardware Cache Prefetch）

`test_array` 函数的优势：

- **缓存未命中次数显著减少**
- **连续数据访问** 触发 CPU 硬件缓存预取
- **高缓存命中率** 保证低延迟

> **硬件预取触发条件**：取决于具体 CPU 型号，通常对 **小范围连续数据** 表现良好

**参考资料**：《AMD Ryzen™ Processor software optimization GDC 2023》第 23-26 页

### 3.4 软件缓存预取（Software Cache Prefetch）

`test_pointer<1>` 函数使用 `_mm_prefetch` 指令：

```cpp
_mm_prefetch((char*)((*std::next(i, 32)).get()), _MM_HINT_NTA);
_mm_prefetch((char*)((*std::next(i, 48)).get()), _MM_HINT_NTA);
_mm_prefetch((char*)((*std::next(i, 64)).get()), _MM_HINT_NTA);
```

#### 软件预取的局限性

| 问题 | 说明 |
|------|------|
| **CPU 时钟消耗** | `_mm_prefetch` 本身消耗 CPU 周期，不能过度调用 |
| **地址难以确定** | 需要预取的地址难以预测，硬编码不灵活 |
| **无效预取** | 预取已存在于缓存中的数据会导致性能下降 |

#### 无效预取指标

- **INEFFECTIVE_SW_PF**：无效软件预取次数
- 示例中：**128.67** 次无效预取 / 千指令

> **结论**：软件预取是硬件预取不可行时的 **折中方案**，可降低部分延迟但难以达到最优

**参考资料**：《AMD Ryzen™ Processor software optimization GDC 2023》第 22 页

---

## 四、核心要点总结

### 4.1 数据结构选择

| 结构 | 缓存友好度 | 适用场景 |
|------|------------|----------|
| **结构体数组（AoS）** | ✅ 高 | 连续访问所有字段 |
| **指针数组** | ❌ 低 | 需要多态或动态分配 |

### 4.2 预取策略对比

| 预取类型 | 优点 | 缺点 |
|----------|------|------|
| **硬件预取** | 自动、高效、零开销 | 仅对连续访问模式有效 |
| **软件预取** | 可处理非连续访问 | 有开销、难调优、可能无效 |

### 4.3 优化建议

1. **优先使用连续内存布局**，触发硬件预取
2. **避免指针追逐（Pointer Chasing）** 模式
3. 软件预取需谨慎使用，注意监控 **INEFFECTIVE_SW_PF** 指标
4. 不同 CPU 的缓存策略差异大，需针对目标平台测试


# CPU 性能优化实战：指令数量与算法优化

## 一、问题描述

### 1.1 核心问题

**如何用有限的指令完成特定功能？**

典型场景：
- 单片机等硬件受限环境，需用整数指令模拟浮点运算
- 减少指令数量以降低执行时间，获得更高 **吞吐量**

### 1.2 指令选择

- 不同指令的 **延迟（Latency）** 不同
- 本次目标：**仅用整数指令计算整数的最近平方根**

### 1.3 测试环境

| 配置项 | 具体内容 |
|--------|----------|
| 编译器 | Visual Studio 2022 (19.39.33521)，x64 RelWithDebInfo |
| CPU | AMD 7900X3D |
| 分析器 | AMD μProf 4.2.845 |
| 数据规模 | uint32_t 全范围（约 43 亿个值） |

---

## 二、基准测试设计

### 2.1 测试原则

- **微基准测试**：代码精简
- **数据量足够**：覆盖 uint32_t 全范围
- **验证正确性**：与 `std::sqrt` 结果对比

### 2.2 原始 TB040 算法

来源：Microchip TB040，利用整数位操作实现线性复杂度的平方根计算。

```cpp
uint32_t TB040(uint32_t x) {
    uint64_t x_ = x;
    uint32_t res = 0;
    uint32_t add = 0x80000000;  // 固定初始值

    while (add) {
        uint32_t g = res | add;
        if (x_ >= (static_cast<uint64_t>(g) * g)) {
            res = g;
        }
        add >>= 1;
    }
    return res;
}
```

**特点**：
- 循环固定 32 次（每次右移 1 位）
- 适合硬件受限的单片机

### 2.3 优化版 TB040：位移优化

**核心思路**：根据输入 x 的 **最高有效位（MSB）** 位置动态设置 `add` 初始值。

由于平方根的性质，`add` 的初始位置可设为 x 最高有效位索引的 **一半**，从而减少循环次数。

```cpp
// 获取最高有效位位置
inline unsigned long clzll(uint32_t v) {
    unsigned long lz = 0;
    _BitScanReverse(&lz, v);  // bsr 指令
    return lz;
}

// 动态计算初始 add
uint32_t add = 1 << (clzll(x) >> 1);
```

**相关指令**：
- `bsr`：位扫描反向
- `lzcnt`：前导零计数
- C++20 `std::bit_width()`

### 2.4 测试结果

| 方法 | 性能表现 |
|------|----------|
| 原始 TB040 | 基准 |
| 位移优化 TB040 | 🚀 **更快** |

> 位移优化至少减少一半计算量，显著提升吞吐量。

---

## 三、PMC 性能分析

### 3.1 关键 PMC 指标

| 指标名 | 含义 |
|--------|------|
| **CYCLES_NOT_IN_HALT** | CPU 时钟周期数 |
| **RETIRED_INST** | 退休（完成）的指令数 |
| **IPC** | $\frac{\text{RETIRED\_INST}}{\text{CYCLES\_NOT\_IN\_HALT}}$，越高越好 |
| **CPI** | $\frac{\text{CYCLES\_NOT\_IN\_HALT}}{\text{RETIRED\_INST}}$，越低越好 |

### 3.2 原始 TB040 分析

- IPC 表现良好
- 记录 CPU 时钟和指令数作为基准

### 3.3 优化版 TB040 分析

| 对比项 | 优化效果 |
|--------|----------|
| CPU 时钟 | **减少超过一半** |
| 指令数量 | **减少约一半** |
| IPC | 表现更优 |

---

## 四、核心结论

### 4.1 优化已优算法的思路

当算法本身已足够优秀时，优化方向：

1. **减少指令数量**
2. **减少 CPU 时钟周期**
3. **降低计算工作量**

### 4.2 关键认知

$$
\text{性能} \propto \frac{1}{\text{指令数} \times \text{CPI}}
$$

- 相同功能，更少指令 = 更高吞吐量
- 指令数量优化是软件优化的重要组成部分

### 4.3 延伸学习

- 尝试将 TB040 扩展至 `uint64_t`
- 参考 GeeksforGeeks 或 JensGrabner 的实现进行对比分析
- 探索不同平台上 `lzcnt`、`bsr`、`std::bit_width()` 的性能差异


# CPU 性能优化实战：汇编级代码优化

## 一、问题描述

### 1.1 核心问题

**高级语言编译器是否已生成最优指令？如果没有，如何生成更好的指令？**

### 1.2 指令集选择

- 现代 CPU 包含多种指令集：x86、x64、SSE、AVX 等
- 本次选择最常见的 **x64 指令集**
- 目标：手写汇编代码，验证是否能比编译器生成的指令更快

### 1.3 测试环境

| 配置项 | 具体内容 |
|--------|----------|
| 编译器 | Visual Studio 2022 (19.39.33521)，x64 RelWithDebInfo |
| 汇编器 | Visual Studio MASM |
| CPU | AMD Ryzen 9 7900X3D |

---

## 二、分析与优化

### 2.1 编译器生成的汇编分析

对于 **位移优化 TB040**，编译器表现良好：
- 几乎所有代码都在寄存器上运行
- 确保最低指令延迟和最高吞吐量

**存在的问题**：
- while 循环内计算 `g` 时，存在 **冗余的寄存器赋值操作**

### 2.2 手写汇编的前提条件

| 知识领域 | 具体要求 |
|----------|----------|
| 寄存器与内存操作 | 熟悉 x64 架构的寄存器及其用途 |
| 函数调用规范 | 理解参数传递、栈平衡规则 |
| 指令性能 | 了解不同 CPU 上指令的延迟表现 |

**x64 调用约定要点**：
- **可安全修改的寄存器**：`rax`, `rcx`, `rdx`, `r8` - `r11`
- **参数传递**：`rcx`, `rdx`, `r8`, `r9`（整数参数）
- **返回值**：`rax`（整数返回值）

**参考文档**：
- Microsoft x64 架构文档
- AMD Software Optimization Guide for Zen4 Microarchitecture

### 2.3 汇编 TB040 实现

**优化目标**：
1. 精简 while 循环内的汇编指令
2. 使用更少的寄存器完成相同任务
3. 函数和跳转入口地址 **16 字节对齐**，确保快速访问

```asm
_TEXT$21 segment para 'CODE'

align   16
public  TB040_shl_asm
TB040_shl_asm    proc    frame

; r9d: add, r8d: res, r10d: x

    mov         r10d,ecx
    mov         r9d,1
    bsr         ecx,ecx
    xor         r8d,r8d
    shr         ecx,1
    shl         r9d,cl
    test        r9d,r9d
    je          TB040_shl_end

    align   16
    TB040_shl_loop:
    mov         ecx,r9d
    or          ecx,r8d
    mov         eax,ecx
    imul        rax,rcx
    cmp         r10,rax
    cmovae      r8d,ecx
    shr         r9d,1
    mov         eax,r8d
    jne         TB040_shl_loop

    align   16
    TB040_shl_end:
    ret

.endprolog

TB040_shl_asm endp

_TEXT$21 ends

end
```

---

## 三、基准测试

### 3.1 测试结果

| 方法 | 性能表现 |
|------|----------|
| 位移优化 TB040（编译器生成） | 基准 |
| 汇编 TB040（手写） | 🚀 **快约 5%** |

> 对于纯寄存器操作的简单代码，5% 的提升已相当可观。

### 3.2 注意事项

- while 循环开头判断 `add == 0` 的跳转实际不会触发
- 更准确的逻辑应使用 **do-while**
- 此类细节在汇编层面更容易发现
- **权衡**：汇编代码的难度和低兼容性 vs 实际性能收益

---

## 四、汇编优化的两个方向

### 4.1 方向选择

| 方向 | 描述 |
|------|------|
| **修改高级语言逻辑** | 引导编译器生成更好的汇编 |
| **直接编写汇编** | 完全控制指令生成 |

### 4.2 直接使用汇编的两种方式

| 方式 | 特点 |
|------|------|
| **静态汇编** | 使用汇编编译器编写，编译时确定 |
| **JIT（即时编译）** | 运行时根据环境动态生成汇编代码 |

**JIT 的应用场景**：
- 虚拟机、模拟器
- 深度学习框架的算子实现
- 追求在所有硬件上达到最佳性能

**JIT 的权衡**：
- 代码生成需要时间
- 需平衡生成时间与实际运行时间

---

## 五、总结

### 5.1 性能优化的层次

```
算法优化 → 指令数量优化 → 汇编指令优化 → JIT 动态优化
```

### 5.2 实际案例

底层库（如 glibc、Visual C++）中的 `memcpy`、`memset` 等函数：
- 针对不同 CPU 指令集分别实现
- 使用汇编指令确保最优性能

### 5.3 核心原则

> 理解各框架和系统为性能所做的努力，根据实际需求选择合适的优化方案，在 **性能收益** 与 **开发成本** 之间找到平衡。