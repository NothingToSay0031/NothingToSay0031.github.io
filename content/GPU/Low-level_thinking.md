# Low-level thinking in high-level shading languages

[Low-level thinking in high-level shading languages 2023](https://interplayoflight.wordpress.com/2023/12/29/low-level-thinking-in-high-level-shading-languages-2023/)

# 高级着色语言中的底层思维（2023 更新版）

## 背景与动机

- 本文是对 **Emil Persson** 2013 年经典演讲 **"Low-level thinking in high-level shading languages"** 的十年回顾与更新
- 核心理念：即使使用 HLSL 等高级语言编写 Shader，也应当 **关注编译器输出的底层汇编**，理解 GPU 实际执行的指令
- 作者的三条黄金法则：**检查编译器输出（check compiler output）、永不假设（never assume）、始终 Profile（always profile）**
- 测试环境：**RDNA 2** GPU 架构、**HLSL Shader Model 6.7**、**DXC 编译器**（通过 Compiler Explorer / godbolt.org）

---

## 编译器不会重排浮点运算顺序

### 核心问题：Multiply-Add（MAD）指令合并失败

编译器出于 **浮点精度一致性** 的考虑，**不会自行重新排列浮点运算的顺序**，即使重排后可以减少指令数。

#### 示例 1：简单的加法 + 乘法

```hlsl
result = (x + a) * b;
```

数学上可以展开为 `x*b + a*b`，从而使用一条 **FMA（Fused Multiply-Add）** 指令完成。但编译器产出的是 **两条独立指令**：

```asm
v_add_f32     v0, s0, v0        ; 先加
v_mul_f32     v1, s1, v0        ; 再乘
```

即使换成 **字面常量**（literal constants），结果也一样：

```hlsl
result = (x + 1.2) * 3.2;
```

```asm
v_add_f32     v0, lit(0x3f99999a), v0
v_mul_f32     v1, lit(0x404ccccd), v0
```

#### 为什么编译器不优化？

- 浮点运算 **不满足结合律**（non-associative）：`(a + b) * c ≠ a*c + b*c` 在浮点精度下可能有微小差异
- 编译器无法判断这种精度差异对最终结果是否可接受，因此 **保守地保持原始运算顺序**
- **Shader 作者** 比编译器更了解问题的数值特性，因此 **手动重排是作者的责任**

---

### 实战案例：光照公式的操作数重排

#### 未优化的漫反射光照公式

```hlsl
float3 diffuse = lightIntensity * lightColour.rgb * shadowFactor * (albedo.rgb / PI) * NdotL;
```

- 这里 **混合了 `float` 和 `float3` 类型的操作数**
- 编译器按书写顺序逐步计算，`float` 与 `float3` 交替运算会导致不必要的 **标量-向量转换**
- 编译结果：**10 条指令**

#### 手动优化：将同类型操作数分组

```hlsl
float3 diffuse = lightIntensity * shadowFactor * NdotL / PI * lightColour.rgb * albedo.rgb;
```

- **先把所有 `float`（标量）操作集中运算**：`lightIntensity * shadowFactor * NdotL / PI` → 标量结果
- **再与 `float3`（向量）操作数相乘**：`* lightColour.rgb * albedo.rgb`
- 编译结果：**仅 6 条指令**，减少了约 40%

#### 关键原则

> **编译器不会帮你完成数学推导和化简**，Shader 开发者应自行 **用最少的运算量实现功能**。将 `float` 和 `float3` 操作数 **分组排列** 是一种简单有效的优化手段。

---

## 指令修饰符（Instruction Modifiers）：免费的额外操作

### 什么是指令修饰符？

现代 GPU 指令支持在 **不增加额外指令开销** 的情况下，对操作数或运算结果施加修饰。这些修饰符是 **"免费"的**（free），因为它们嵌入在指令编码中，不占用额外的执行周期。

### 两类修饰符

| 类型 | 修饰符 | 作用位置 |
|------|--------|----------|
| **输出修饰符** | `saturate()`、`×2`、`×4`、`/2`、`/4` | 作用于整条指令的 **最终结果** |
| **输入修饰符** | `abs()`、`negate（取反 -）` | 作用于指令的 **每个操作数（输入）** |

### 组合使用的威力

一个看似复杂的表达式：

```hlsl
saturate(4 * (-x * abs(z) - abs(y)))
```

编译后仅需 **一条指令**：

```asm
v_fma_f32     v1, -v2, abs(v0), -abs(v1) mul:4 clamp
```

- `-v2`：输入取反修饰符（negate）
- `abs(v0)`、`-abs(v1)`：输入绝对值 + 取反修饰符
- `mul:4`：输出乘以 4 修饰符
- `clamp`：输出 saturate 修饰符（即 `saturate()`，将结果钳制到 [0, 1]）

### 重要注意："输出"与"输入"的区别

修饰符是 **免费的前提** 是它必须被用在正确的位置上：

- **`saturate` 作用于整条指令的输出** → 免费 ✅
- **`saturate` 作用于某个输入操作数** → 需要额外指令 ❌

#### 反例：saturate 用在输入上

```hlsl
float x = saturate(a) + b;
```

此时 `saturate(a)` 是加法指令的 **输入**，编译器不得不先用一条独立指令计算 `saturate(a)` 的结果，再做加法：

```asm
v_max_f32     v1, s0, s0 clamp       ; 额外指令：计算 saturate(a)，结果存入 v1
v_add_f32     v1, v0, v1             ; 再执行加法
```

- `v_max_f32 v1, s0, s0 clamp` 本质是 `clamp(max(a, a), 0, 1)` = `saturate(a)`
- 这比理想情况 **多出一条指令和一个寄存器占用**

### 实用建议

- 编写 Shader 时，尽量将 `saturate()`、`abs()`、取反等操作安排在 **可以被指令修饰符吸收的位置**
- `saturate()` 放在 **整个表达式的最外层**（作为输出修饰符）而不是放在某个子表达式上
- `abs()` 和取反 `-` 直接作用于 **参与运算的操作数** 上，而非作为中间步骤



## 常见数学函数的底层实现

### `exp()` 和 `log()` 的实现方式

GPU 原生只支持 **以 2 为底** 的指数和对数指令（`v_exp_f32` / `v_log_f32`），因此 `exp()` 和 `log()` 需要通过 **换底公式** 转换：

- $\exp(x) = 2^{x \cdot \log_2(e)}$，其中 $\log_2(e) \approx 1.4427$
- $\ln(x) = \log_2(x) \cdot \ln(2)$，其中 $\ln(2) \approx 0.693147$

```asm
// exp(x) 的实现
v_mul_legacy_f32  v0, lit(0x3fb8aa3b), v0  // 预乘 1.4427 (log2(e))
v_exp_f32     v1, v0

// log(x) 的实现
v_log_f32     v0, v0
v_mul_f32     v1, lit(0x3f317218), v0  // 后乘 0.693147 (ln(2))
```

> **实践建议：** 如果你的算法允许，**直接使用 `exp2()` 和 `log2()`** 可以省去换底乘法，各节省一条指令。

---

### `pow(x, y)` 的实现

`pow(x, y)` 在 GPU 上通过 **经典的 exp-log 恒等式** 实现：

$$x^y = 2^{y \cdot \log_2(x)}$$

```asm
v_log_f32     v1, v2          // log2(x)
v_mul_legacy_f32  v0, v0, v1  // y * log2(x)
v_exp_f32     v1, v0          // 2^(y * log2(x))
```

#### 编译器对整数幂次的特殊处理

| 幂次 | 编译器行为 |
|------|-----------|
| **1 ~ 4 的正整数次幂** | 编译器用 **连续乘法** 展开（如 `pow(x,3)` → `x*x*x`） |
| **> 4 的正整数次幂** | 退回 `exp(log())` 方式 |
| **负数幂次** | 始终使用 `exp(log())` |
| **`pow(x, 1)`** | ⚠️ **意外地** 也使用 `exp(log())`，并不会优化为直接赋值 |

```asm
// pow(x, 1) —— 编译器未优化！
v_log_f32     v0, v0
v_exp_f32     v1, v0
```

> **关键提醒：** 避免在 Shader 中写 `pow(x, 1)`，这会白白浪费两条 **四分之一速率（quarter rate）** 指令。对于小整数幂次，手动展开乘法更可靠。

---

### `1/sqrt(x)`：反平方根指令

GPU 有 **原生的反平方根指令** `v_rsq_f32`，因此 `1.0 / sqrt(x)` 会被编译为单条指令：

```asm
// 1/sqrt(x)
v_rsq_f32     v1, v0
```

> 这比先 `sqrt()` 再 `rcp()`（取倒数）高效得多，只需一条指令。

---

### `sign()` 与内联条件的对比

#### `sign(x)` 的实现（完整处理 x==0 的情况）

```asm
// sign(x)
v_cmp_gt_f32  vcc, 0, v0                  // x < 0?
v_cndmask_b32  v1, 1.0, -1.0, vcc         // 是则 -1，否则 1
v_cmp_neq_f32  vcc, 0, v0                 // x != 0?
v_cndmask_b32  v0, 0, v1, vcc             // 否则置 0
v_trunc_f32   v1, v0
```

共 **5 条指令**，因为需要额外处理 `x == 0` 返回 `0` 的情况。

#### 内联条件 `x >= 0 ? 1 : -1`

```asm
// x >= 0 ? 1 : -1
v_cmp_le_f32  vcc, 0, v0
v_cndmask_b32  v1, -1.0, 1.0, vcc
```

仅 **2 条指令**（后续的 `v_mov_b32` 和 `v_cndmask_b32` 是半精度相关代码），因为不需要处理 `x == 0` 的特殊情况。

#### 在乘法中的应用对比

当需要计算 `sign(x) * y` 时，差异更加显著：

```asm
// sign(x) * y —— 6 条指令
v_cmp_gt_f32  vcc, 0, v1
v_cndmask_b32  v2, 1.0, -1.0, vcc
v_cmp_neq_f32  vcc, 0, v1
v_cndmask_b32  v1, 0, v2, vcc
v_trunc_f32   v1, v1
v_mul_f32     v1, v0, v1
```

```asm
// x >= 0 ? y : -y —— 3 条指令（利用符号位异或）
v_cmp_le_f32  vcc, 0, v1
v_cndmask_b32  v1, lit(0x80000000), 0, vcc
v_xor_b32     v1, v0, v1              // 通过 XOR 翻转符号位
```

> **优化技巧：** 当你 **不关心 x==0 的情况** 时，使用三元条件 `x >= 0 ? y : -y` 远优于 `sign(x) * y`。编译器会利用 **符号位 XOR** 的技巧（`v_xor_b32`），将符号位直接翻转，仅需 **3 条指令**（vs. 6 条）。

---

## 反三角函数：尽量避免使用

### `acos()` 的底层实现

反三角函数（`acos()`、`asin()`、`atan()` 等）在 GPU 上 **没有原生硬件指令**，编译器使用 **多项式近似（polynomial approximation）** 来实现，代价极高：

```asm
// acos(x) —— 多达 16 条指令！
v_mov_b32     v1, lit(0x3be3b0b4)
s_waitcnt     vmcnt(0)
v_fma_legacy_f32  v1, lit(0xbaac860d), abs(v0), v1
v_fma_legacy_f32  v1, v1, abs(v0), lit(0xbc90489a)
v_fma_legacy_f32  v1, v1, abs(v0), lit(0x3d0070e2)
s_denorm_mode  0x000f
v_add_f32     v2, -abs(v0), 1.0
v_fma_legacy_f32  v1, v1, abs(v0), lit(0xbd4e589e)
v_sqrt_f32    v3, v2
v_fma_legacy_f32  v1, v1, abs(v0), lit(0x3db64f94)
v_cmp_neq_f32  vcc, 0, v2
v_fma_legacy_f32  v1, v1, abs(v0), lit(0xbe5bc07d)
v_fma_legacy_f32  v1, v1, abs(v0), lit(0x3fc90fdb)
v_cndmask_b32  v2, 0, v3, vcc
v_mul_legacy_f32  v1, v1, v2
v_sub_f32     v2, lit(0x40490fdb), v1
v_cmp_gt_f32  vcc, 0, v0
v_cndmask_b32  v1, v1, v2, vcc
```

这是一长串的 **FMA 链**（Horner 法则多项式求值），外加 `v_sqrt_f32`、分支处理负输入等，指令开销非常大。

### 实践建议

- **尽量避免** 在 Shader 中使用反三角函数
- 如果确实需要，考虑使用 **精度更低但更快的近似公式**（如 fast acos 近似）
- **始终 Profile**，确认替代方案确实带来了性能提升

---

## 四分之一速率指令（Quarter Rate Instructions）

### 概念解释

在 **RDNA 架构** 上，某些看似"原生"的指令实际上是 **四分之一速率（quarter rate）** 的，即 GPU **每 4 个时钟周期才能发射一条** 这类指令，而非普通指令的每周期一条。

### 受影响的指令

| HLSL 函数 | GPU 指令 | 速率 |
|-----------|---------|------|
| `sin()` | `v_sin_f32` | **1/4 rate** |
| `cos()` | `v_cos_f32` | **1/4 rate** |
| `log2()` | `v_log_f32` | **1/4 rate** |
| `exp2()` | `v_exp_f32` | **1/4 rate** |
| `sqrt()` | `v_sqrt_f32` | **1/4 rate** |
| `rcp()` (取倒数) | `v_rcp_f32` | **1/4 rate** |
| `rsqrt()` | `v_rsq_f32` | **1/4 rate** |

### 性能影响

- 如果 Shader 中 **集中使用大量超越函数**（transcendental functions），会导致 **指令延迟显著增加**
- 虽然单条 `sin()` 看起来很"便宜"（一条指令），但它的 **吞吐量仅为普通 ALU 指令的 1/4**
- 在 ALU-bound 的 Shader 中，这些指令的累积效应不可忽视

> **关键认知：** 不要被"一条指令"的表象迷惑。**指令数 ≠ 执行成本**，还需考虑 **指令的发射速率和延迟**。在性能敏感的 Shader 中，应尽量减少四分之一速率指令的使用，或用查找表（LUT）/ 近似公式替代。



## 自定义矩阵-向量乘法仍可节省指令

### 问题：编译器不会特殊处理 `.w = 1.0`

当你使用 `mul(float4(a, 1.0), m)` 做仿射变换时，编译器 **不知道 w 分量恒为 1.0** 这一语义信息，仍然会对 w 做完整的乘法运算。手动展开可以省去这些多余乘法。

#### 标准写法：`mul(float4(a, 1.0), m)` — **12 条指令**

```asm
v_mul_f32     v3, s4, v0
v_mul_f32     v4, s8, v0
v_mul_f32     v0, s0, v0
v_fmac_f32    v3, s5, v1
v_fmac_f32    v4, s9, v1
v_fmac_f32    v0, s1, v1
v_fmac_f32    v3, s6, v2
v_fmac_f32    v4, s10, v2
v_fmac_f32    v0, s2, v2
v_fma_mixlo_f16  v1, s7, 1.0, v3
v_fma_mixlo_f16  v0, s3, 1.0, v0
v_fma_mixhi_f16  v1, s11, 1.0, v4
```

编译器仍然对最后一行（w=1.0 的部分）执行了 `1.0 * m[3]` 的乘法，而不是直接加 `m[3]`。

#### 手动展开：嵌套 FMA 形式 — **9 条指令**

```hlsl
result = a.x * m[0] + (a.y * m[1] + (a.z * m[2] + m[3]));
```

```asm
v_fma_f32     v3, v2, s6, s7       // a.z * m[2].x + m[3].x（直接加m[3]，无需乘1.0）
v_fma_f32     v4, v2, s10, s11     // a.z * m[2].y + m[3].y
v_fma_f32     v2, v2, s2, s3       // a.z * m[2].z + m[3].z
v_fmac_f32    v3, s5, v1           // += a.y * m[1].x
v_fmac_f32    v4, s9, v1           // += a.y * m[1].y
v_fmac_f32    v2, s1, v1           // += a.y * m[1].z
v_fma_mixlo_f16  v1, v0, s4, v3    // += a.x * m[0].x
v_fma_mixhi_f16  v1, v0, s8, v4    // += a.x * m[0].y
v_fma_mixlo_f16  v0, v0, s0, v2    // += a.x * m[0].z
```

> **核心技巧：** 通过从最内层开始——先算 `a.z * m[2] + m[3]`——利用 **FMA 指令直接把 `m[3]` 作为加数**，完全避免了 `1.0 * m[3]` 的冗余乘法，**节省 3 条指令**。

---

## 子表达式共享：编译器的能力与局限

### `length()` 与 `distance()` 可以共享计算

当你在同一段代码中同时调用 `length(x-y)` 和 `distance(x, y)` 时，编译器 **能够识别出它们在做相同的计算**，并复用中间结果：

```asm
// a = length(x-y); b = distance(x,y);
v_subrev_f32  v1, v2, v5               // 计算 x-y 的各分量（共享）
v_subrev_f32  v2, v3, v6
v_mul_legacy_f32  v0, v1, v1           // 点积累加（共享）
v_subrev_f32  v1, v4, v7
v_fmac_legacy_f32  v0, v2, v2
v_fmac_legacy_f32  v0, v1, v1
v_sqrt_f32    v1, v0                   // 只做一次 sqrt
```

两个函数 **共用同一套减法和点积运算**，最终只执行一次 `v_sqrt_f32`。

#### ⚠️ 操作数顺序必须一致

如果你写的是 `distance(y, x)` 而非 `distance(x, y)`，编译器 **无法识别** 这两个表达式的等价性，子表达式共享 **会失败**。

> **实践建议：** 确保相关函数中向量操作数的 **书写顺序保持一致**，以便编译器进行公共子表达式消除（CSE）。

---

### `normalize()` 与 `length()` **不能共享计算**

按理说，`normalize(x) = x / length(x) = x * rsqrt(dot(x,x))`，而 `length(x) = sqrt(dot(x,x))`，两者应当能共享 `dot(x,x)` 的计算。但实际编译结果显示 **它们各自独立计算了点积**：

```asm
// a = length(x); b = normalize(x);
v_mul_legacy_f32  v3, v0, v0           // ← length 的 dot 计算
v_fma_f32     v4, v1, v1, v3           // ← normalize 的 dot 计算（独立的！）
v_fmac_legacy_f32  v3, v1, v1         // ← length 继续
v_fmac_f32    v4, v2, v2               // ← normalize 继续
v_fmac_legacy_f32  v3, v2, v2         // ← length 继续
v_rsq_f32     v4, v4                   // normalize 用 rsqrt
v_sqrt_f32    v3, v3                   // length 用 sqrt
v_mul_legacy_f32  v0, v0, v4           // normalize 结果
v_mul_legacy_f32  v1, v1, v4
v_mul_legacy_f32  v2, v2, v4
```

#### 为什么不共享？

- **浮点精度差异**：`length()` 通过 `sqrt(dot)` 计算，`normalize()` 通过 `rsqrt(dot)` 计算
- 虽然数学上 `1/sqrt(x)` 和 `rsqrt(x)` 等价，但编译器使用了不同的指令变体（注意汇编中 `v_fma_f32` vs `v_fmac_legacy_f32`），可能在精度行为上有细微差异
- 编译器为了 **保证浮点精度的严格一致性**，选择不合并这两组计算

> **实践建议：** 如果你同时需要 `length` 和 `normalize` 的结果，手动计算共享的中间值更高效：
> ```hlsl
> float len_sq = dot(x, x);
> float len = sqrt(len_sq);
> float3 norm = x * rsqrt(len_sq); // 或 x / len
> ```
> 这样可以避免重复的点积计算，将 **10 条指令减少到约 7 条**。



## 循环展开：`[loop]` 指令的实际行为

### 编译器对 `[loop]` 的处理

在 HLSL 中，**`[loop]` 指令现在更像是一个"建议"而非强制命令**，编译器在循环次数编译期已知时 **大多会忽略它**。

```hlsl
[loop]
for(int i = 0; i < N; i++)
{
    float3 v = tex.SampleLevel(state, input.uv + i, 0).rgb;
    result.xyz += mul(float4(v.rgb, 1), m).xyz;
}
```

#### 编译器的展开策略

| 循环次数 N | 编译器行为 |
|-----------|-----------|
| **N ≤ ~50** | **完全展开（fully unroll）**，即使标注了 `[loop]` |
| **N > ~50** | **部分展开（partially unroll）** |
| **N 编译期未知** | **保留循环结构**，无论是否标注 `[loop]` |

> **注意：** 完全展开的阈值（约 50）可能随 Shader 的 **VGPR 寄存器压力** 变化——如果 Shader 已占用大量 VGPR，编译器可能更早停止展开。

---

## `[branch]` 与纹理采样的特殊处理

### 问题背景：分支内的 UV 导数计算

过去，在 `[branch]` 内使用 **非 `SampleLevel` 的纹理采样**（即需要自动计算 mip level 的 `Sample()`）且 UV 坐标是在分支内计算的，编译器会 **报错**。现在编译器不再报错，而是采用了一种 **巧妙但昂贵** 的处理方式。

```hlsl
[branch]
if (data.x > 0)
{
    float2 uv = input.uv * data.x;
    result.xyz = tex.Sample(state, uv).rgb;  // 需要 UV 导数来计算 mip level
}
```

### 编译器生成的汇编与执行流程

```asm
v_cmpx_ngt_f32  exec, v1, 0              // 判断条件，设置执行掩码
v_mov_b32     v3, 0                       // 初始化默认值 = 0
v_mov_b32     v4, 0
v_mov_b32     v5, 0
s_cbranch_execz  label_006C               // 没有线程通过则跳过

label_006C:
s_andn2_b64   exec, s[2:3], exec          // 标记通过测试的活跃线程
s_cbranch_execz  label_00A8               // 无活跃线程则跳到末尾

s_mov_b64     vcc, exec
s_wqm_b64     exec, vcc                   // ★ 关键：强制 Quad 中所有像素开启

v_mul_f32     v2, v2, v1                   // Quad 内所有像素都计算 UV
v_mul_f32     v0, v0, v1

s_mov_b64     exec, vcc                   // 恢复为只有通过测试的像素

s_load_dwordx8  s[4:11], s[0:1], null
s_load_dwordx4  s[12:15], s[0:1], 0x000040
s_waitcnt     lgkmcnt(0)

// 仅对通过测试的像素采样，但 mip level 已正确计算
image_sample  v[3:5], [v2,v0], s[4:11], s[12:15] dmask:0x7 dim:SQ_RSRC_IMG_2D

label_00A8:
s_mov_b64     exec, s[2:3]                // 恢复完整执行掩码
```

### 执行流程详解

编译器通过 **Quad（2×2 像素块）操作** 解决了导数计算问题：

1. **条件判断**：设置 `exec` 掩码，标记哪些像素满足 `data.x > 0`
2. **`s_wqm_b64`（Whole Quad Mode）**：**强制开启** Quad 中包含至少一个通过测试像素的 **所有像素**
3. **UV 计算**：Quad 中 **所有** 像素都执行 UV 坐标计算（即使某些像素不满足分支条件），这样 GPU 就能正确计算相邻像素间的 **UV 导数（ddx/ddy）**
4. **恢复掩码**：只保留真正通过测试的像素
5. **纹理采样**：使用正确的 mip level 进行采样

> **核心问题：** 未进入分支的线程/像素的 UV 坐标是 **未定义的**，Shader 无法从中计算导数来确定 mip level。编译器的解决方案是 **让整个 Quad 都参与 UV 计算**，虽然正确，但增加了额外的计算开销。

#### 关键结论

> **`[loop]` 和 `[branch]` 的实际效果可能与预期不符**，强烈建议 **检查最终生成的汇编代码** 来确认编译器的实际行为。

---

## 整数除法：仍然非常昂贵

### 整数除法的指令开销

GPU **没有原生的整数除法指令**，编译器需要用大量指令来模拟：

| 操作 | 指令数量 |
|------|---------|
| **有符号整数除法** `A / B`（`int`） | **~34 条指令** |
| **无符号整数除法** `A / B`（`uint`） | **~24 条指令**（稍好但仍然昂贵） |

### 关于 `mul24()` 和替代方案

- 旧版 GPU 上的 **`mul24()`**（24 位快速整数乘法）在新架构上 **已不再支持**
- **替代方案：** 使用 **16 位数据类型** 来加速整数运算：
  - 启用编译选项 **`-enable-16bit-types`**
  - 使用新的类型 **`uint16_t`** / **`int16_t`**
  - 这对乘法等操作有效，但 **除法依然很慢**

> **实践建议：** 在 Shader 中应 **尽力避免整数除法**。常见优化策略包括：用 **位移（bit shift）** 替代 2 的幂次除法、用 **乘以倒数的整数近似** 替代通用除法、或将计算移到 CPU 端预处理。



## Cubemap 采样的 ALU 开销

### Cubemap 纹理坐标计算

Cubemap 采样并非简单地将 3D 方向向量传给硬件，GPU 需要通过 **一系列 ALU 指令** 将方向向量转换为面索引 + 2D 纹理坐标：

```asm
// cubeTex.Sample(state, coords.xyz).xyz;
v_cubema_f32  v3, v0, v1, v2          // 计算主轴（绝对值最大的分量）
v_rcp_f32     v3, abs(v3)             // 取倒数用于归一化
v_cubetc_f32  v4, v0, v1, v2          // 计算面内 t 坐标
v_cubesc_f32  v5, v0, v1, v2          // 计算面内 s 坐标
v_cubeid_f32  v0, v0, v1, v2          // 确定是哪个面（0~5）
v_fmaak_f32   v1, v4, v3, lit(0x3fc00000)  // tc * rcp + 0.5（归一化到 [0,1]）
v_fmaak_f32   v2, v5, v3, lit(0x3fc00000)  // sc * rcp + 0.5
s_and_b64     exec, exec, s[20:21]
image_sample  v[0:2], [v2,v1,v0], s[12:19], s[0:3] dmask:0x7 dim:SQ_RSRC_IMG_CUBE
```

#### 完整的计算流程

1. **`v_cubema_f32`**：求三个分量中绝对值最大的（主轴 major axis），取其倒数用于后续归一化
2. **`v_cubetc_f32` / `v_cubesc_f32`**：根据主轴确定面内的 s/t 坐标
3. **`v_cubeid_f32`**：确定 Cubemap 面 ID
4. **`v_fmaak_f32`**：将坐标从 [-1, 1] 映射到 [0, 1]（乘以 `rcp` 后加 `0.5`）

> **总计 7 条 ALU 指令 + 1 条采样指令**。如果采样 Cubemap 的频率很高，这个额外的 ALU 开销值得关注。

---

## 寄存器索引（Register Indexing）

### 向量分量的动态索引：陷阱！

当你用 **编译期未知的索引**（如来自 Constant Buffer 的值）去索引一个 `float4` 的分量时，编译器 **无法使用真正的寄存器索引指令**，只能通过 **逐一比较每个可能的索引值** 来实现：

```hlsl
float4 result = tex.Sample(state, input.uv);
return result[index]; // index 来自 constant buffer
```

```asm
s_cmp_eq_i32  s0, 2                      // index == 2?
s_cselect_b64  s[2:3], s[16:17], 0
s_cmp_eq_i32  s0, 1                      // index == 1?
s_cselect_b64  s[4:5], s[16:17], 0
s_cmp_eq_i32  s0, 0                      // index == 0?
s_cselect_b64  vcc, s[16:17], 0
v_cndmask_b32  v2, v3, v2, s[2:3]        // 级联条件选择
v_cndmask_b32  v1, v2, v1, s[4:5]
v_cndmask_b32  v1, v1, v0, vcc
```

这是 **N 路分支模拟**，对于 `float4` 需要 3 次比较 + 3 次条件选择，效率低下。

### 正确做法：使用 float 数组

将数据放入 **float 数组** 而非 `float4`，编译器就可以使用 **真正的寄存器相对索引指令** `v_movrels_b32`：

```hlsl
float result[4];
return result[index]; // index 来自 constant buffer
```

```asm
s_cmp_lt_u32  s0, 4                     // 边界检查
s_cbranch_scc0  label_0084               // 越界则跳过
s_mov_b32     m0, s0                     // 将索引存入 m0 寄存器
v_movrels_b32  v4, v0                    // ★ 真正的寄存器相对索引！
```

> **`v_movrels_b32`**：以 `m0` 为偏移量，从 `v0` 开始的寄存器文件中读取对应寄存器。这是一条单指令，远优于逐一比较。

### 索引类型的注意事项

> **避免使用浮点数作为索引！** 每次用 `float` 作为数组或 Buffer 的索引，编译器都会插入一条 **`v_cvt_u32_f32`（浮点转整数）** 指令，还可能引发额外的寄存器分配。**应从源头保证索引以整数格式传入**。

---

## 标量单元 vs 向量单元：SGPR 与 VGPR

### 基本概念

GPU 指令在底层 **全部是标量操作**——每条指令处理一个 `float` 或 `int`。HLSL 中的 `float4` 运算会被拆解为多条标量指令：

```hlsl
result.xyz = mul(float4(vec.xyz, 1), m).xyz;
```

```asm
v_fma_f32     v3, v0, s4, s7     // 每个寄存器 vN 只持有一个 float
v_fma_f32     v4, v0, s8, s11
v_fma_f32     v0, v0, s12, s15
v_fmac_f32    v3, s5, v1
v_fmac_f32    v4, s9, v1
v_fmac_f32    v0, s13, v1
v_fmac_f32    v3, s6, v2
v_fmac_f32    v4, s10, v2
v_fmac_f32    v0, s14, v2
v_add_f32     v1, 1.0, v3
```

### 两种寄存器类型

| 寄存器类型 | 前缀 | 含义 | 存储方式 |
|-----------|------|------|---------|
| **VGPR**（Vector General Purpose Register） | `v` | 每线程独立数据 | 一个 VGPR 为 Wave 中 **每个线程** 各持有一个 float |
| **SGPR**（Scalar General Purpose Register） | `s` | 全 Wave 共享数据 | 一个 SGPR 持有 **一个 float**，Wave 中所有线程共享 |

#### 关键特性

- **VGPR 线程隔离**：线程 0 **无法访问** VGPR 中属于线程 1 的值（后文会提到例外情况）
- **SGPR 典型来源**：Constant Buffer 中的数据（如上例中的矩阵 `m`）
- **RDNA/GCN 架构** 中，标量指令（`s_` 前缀）拥有 **独立的执行单元、寄存器文件和缓存**，可以有效 **分担向量管线（`v_` 前缀）的压力**

---

### Constant Buffer 读取：标量加载 vs 向量加载

编译器会根据 **索引是否对 Wave 内所有线程一致** 来决定使用哪种加载方式：

```hlsl
cbuffer Data
{
    float4 values[30];
};
```

#### 情况 1：索引对所有线程相同（可证明）

```hlsl
result = values[i]; // i 来自字面量或 constant buffer
```

```asm
s_buffer_load_dwordx4  s[0:3], s[0:3], s4   // ★ 标量加载 → 结果存入 SGPR
```

#### 情况 2：索引逐线程变化（或编译器无法推断）

```hlsl
result = values[i]; // i 来自线程相关的计算
```

```asm
tbuffer_load_format_xyzw  v[0:3], v0, s[0:3], 0 offen format:[BUF_FMT_32_32_32_32_FLOAT]
// ★ 向量加载 → 结果存入 VGPR
```

#### 不同 Buffer 类型的行为差异

| Buffer 类型 | 索引统一时 | 索引变化时 |
|-------------|-----------|-----------|
| **Constant Buffer** | ✅ 标量加载（SGPR） | ❌ 向量加载（VGPR） |
| **Structured Buffer** | ✅ 标量加载 | ❌ 向量加载 |
| **Typed Buffer** | ❌ **始终向量加载** | ❌ 向量加载 |

> **关于 Constant Buffer 数组的访问模式：** Constant Buffer 对 **顺序访问** 性能友好，**随机访问** 在某些平台上可能有性能惩罚。如果你的用例是随机访问，应考虑使用其他类型的 Buffer（如 Structured Buffer 或 ByteAddressBuffer）。

---

### 标量单元的数学运算限制

**标量单元不支持所有数学操作**，尤其是浮点运算：

#### 整数乘法 → ✅ 可在标量单元完成

```hlsl
int result = a * b; // a, b 为整数
```

```asm
s_mul_i32     s0, s0, s1   // 完全在标量单元执行，加法同理
```

#### 浮点乘法 → ❌ 必须使用向量指令

```hlsl
float result = a * b; // a, b 为浮点数
```

```asm
v_mul_f32     v0, s0, s1   // 即使源操作数对所有线程相同，也必须用向量指令
```

> 标量单元的浮点数学支持有限——**浮点乘法、除法等基本运算不被支持**，必须路由到向量管线。

#### ⚠️ 整数除法：最差情况

**整数除法在标量单元上的实现极其昂贵**——约 **46 条指令**，且涉及 **标量与向量操作的混合** 以及类型转换。

> **实践建议：** 尽一切可能 **避免在 Shader 中使用整数除法**。可以用位移（`>> n` 代替除以 $2^n$）、乘以倒数的近似值，或预计算等方式替代。



## GPU 架构演进：ALU 增长远超带宽与固定功能单元

### 核心趋势：ALU 与带宽的"剪刀差"

过去十多年，GPU 的 **ALU 算力（GFlops/sec）** 增长速度远远超过 **显存带宽（GB/sec）** 和 **固定功能单元（如纹理单元 GTex/sec）** 的增长。用简单的数据对比可以清楚看到这一趋势：

| 指标 | AMD Radeon HD 4870（2008） | AMD Radeon RX 7600（2023） | 增长倍数 |
|------|--------------------------|--------------------------|---------|
| **ALU / 显存带宽比** | 10 | **76** | ~7.6× |
| **ALU / 纹理速率比** | 40 | **65** | ~1.6× |

#### 这意味着什么？

- GPU 变得越来越 **"宽"**（ALU 核心数量极大增加），但 **内存延迟/带宽** 和 **纹理采样等固定功能单元** 的扩展速度没有跟上
- **大量依赖固定功能单元的渲染 Pass**（如大量纹理采样、顶点处理）会越来越难以 **填满 GPU**，导致 ALU 空转
- 这也意味着 **ALU 优化的相对收益在下降**——如果你的 Shader 瓶颈在带宽或纹理采样，优化 ALU 指令数改善有限
- 反之，**在 ALU 受限的 Shader 中**（如复杂的数学计算），前述的所有底层优化技巧仍然非常有价值

> **关键认知：** 现代 GPU 的性能瓶颈已从"ALU 不够用"转变为"喂不饱 ALU"。优化策略需要从纯粹的指令优化扩展到 **数据供给效率** 的优化。

---

## DirectX 12 带来的新性能考量

### 从隐式到显式：更多控制 = 更多责任

DirectX 12 给予图形程序员 **更细粒度的 GPU 资源控制权**，但这也意味着 **Shader 之外的因素** 对性能的影响更大了。

### Root Signature 与数据传递效率

DX12 中向 Shader 传递数据的方式有多种，**效率从高到低** 排列：

| 传递方式 | 存储位置 | 性能 | 说明 |
|---------|---------|------|------|
| **Root Constants** | 直接在 **SGPR（标量寄存器）** 中 | ⚡ **最快** | 数据直接编码在 Root Signature 中，无需任何间接寻址 |
| **Root Descriptor（CBV/SRV/UAV）** | SGPR 中存放地址，**一次间接寻址** | 🔶 较快 | 需要一次内存读取获取实际数据 |
| **Descriptor Table** | SGPR 中存放表地址，**两次间接寻址** | 🔴 最慢 | 先读 Descriptor Table，再读实际资源 |

#### ⚠️ Root Signature 溢出问题

如果 **Root Parameter 数量过多**，超出了可用的 SGPR 寄存器数量，部分 Root Signature 数据将被 **溢出到显存（spill to memory）**，产生额外的内存读取开销。

> **实践建议：**
> - 高频访问的小数据（如变换矩阵、时间参数）优先用 **Root Constants**
> - 合理规划 Root Signature 的大小，避免 SGPR 溢出
> - 花时间研究各种参数传递方式的 **优缺点及性能影响**

### Barrier 与资源状态转换

DX12 中 **资源状态转换（Resource Transitions）** 和 **Barrier** 是显式的，处理不当会：

- **阻塞 GPU 流水线**，导致气泡（bubble）
- **阻碍不同 Drawcall/Dispatch 之间的并行执行**
- 需要额外的工程考量来 **最小化 Barrier 的频率和范围**

---

## Async Compute：异步计算的正确使用

### 基本原理

GPU 天然会 **重叠来自不同 Drawcall/Dispatch 的 Shader 工作**（前提是无依赖关系）。DX12 的 **Async Compute** 让这种重叠变得 **更加显式和可控**。

### 理想的 Async Compute 场景：互补工作负载

当两个 Pass 的 **瓶颈资源不同** 时，异步重叠可以让闲置的硬件单元被利用起来：

| Pass 示例 | 主要瓶颈 | 闲置资源 |
|-----------|---------|---------|
| **Shadow Map 渲染** | **顶点处理速率（Vertex Rate）** | ALU、纹理单元大量空闲 |
| **SSAO 计算** | **ALU**（可能还有纹理读取） | 顶点处理单元空闲 |

将这两个 Pass 放在不同队列（Graphics Queue + Compute Queue）上 **并行执行**，可以充分利用各自空闲的硬件资源。

### ⚠️ Async Compute 使用注意事项

1. **Dispatch 规模要足够大**：避免在 Compute Queue 上发出 **小的 Dispatch**，否则调度开销（scheduling overhead）会抵消并行收益
2. **Compute Queue 上同一任务会更慢**：相同的 Compute Shader 在 Compute Queue 上执行时，由于需要与 Graphics Queue **共享 GPU 资源**，单独运行时间 **会比在 Graphics Queue 上更长**
3. **收益因工作负载和平台而异**：不同 GPU 架构对 Async Compute 的支持程度不同，**必须通过 Profiling 验证实际收益**
4. **不是所有组合都有收益**：如果两个 Pass 的瓶颈相同（如都是带宽受限），异步执行反而可能因 **资源竞争** 导致性能下降

> **核心原则：** Async Compute 的本质是 **让互补的工作负载填满 GPU 的不同硬件单元**。选择搭配的工作负载时，要分析它们分别受限于哪种资源（ALU、带宽、纹理单元、顶点处理等），确保互补而非竞争。

---

## 总结：十年后依然成立的核心法则

原始演讲和后续 DX11 演讲中提到的大部分底层优化技巧 **在今天仍然有效**，但需要在更广泛的上下文中理解：

| 层面 | 关键变化 |
|------|---------|
| **Shader 指令优化** | 大部分技巧仍然适用，但 ALU 的相对权重降低 |
| **数据供给** | DX12 的 Root Signature 设计对性能影响显著 |
| **流水线管理** | Barrier 和资源转换需要显式且精心管理 |
| **并行化** | Async Compute 提供新的优化维度，但需谨慎使用 |
| **瓶颈分析** | GPU "宽度"增加使得 **带宽/固定功能** 瓶颈更加突出 |

> **作者反复强调的三条法则始终适用：检查编译器输出（Check Compiler Output）、永不假设（Never Assume）、始终 Profile（Always Profile）。**



## 现代 Shader 的复杂性与发散性挑战

### 趋势：更复杂的材质 + 更多的发散

现代渲染中，**材质复杂度** 和 **光照模型复杂度** 大幅增加，带来了双重压力：

- **ALU 工作量** 显著增加
- **纹理读取次数** 显著增加

同时，**Shader 中的执行发散（divergence）** 也大幅增加。以下技术加剧了这一问题：

| 技术 | 发散来源 |
|------|---------|
| **屏幕空间环境光遮蔽（SSAO）** | 不同像素采样不同方向 |
| **屏幕空间反射（SSR）** | 反射方向因表面法线而异 |
| **Raymarched Shadows** | 步进次数因遮挡关系而异 |
| **光线追踪（Raytracing）** | 光线方向高度不一致，命中不同几何体 |

这些技术导致同一 Wave 中的线程 **执行路径不一致**、**数据访问模式不连贯**，严重降低了执行效率和缓存命中率。

---

### 应对策略

#### 1. Tile 分类（Tile Classification）

**问题：** 一个包含所有功能的复杂 Shader，通过动态分支处理不同情况，导致：
- 高 VGPR 分配（即使分支未执行，寄存器也已预留）
- 低 Occupancy
- 大量 divergent 分支

**解决方案：** 根据屏幕上每个 Tile（如 8×8 像素块）实际需要的功能进行 **分类**，然后使用 **多个更简单的专用 Shader** 分别处理：

- ✅ 降低单个 Shader 的复杂度
- ✅ 减少 VGPR 分配 → 提高 Occupancy
- ✅ 减少不必要的分支发散
- ✅ 更好地隐藏内存延迟

#### 2. Binning（线程重排序）

**起源于光追场景，但具有更广泛的适用性。**

核心思想：**重新排列 Wave 中的线程索引**，将具有相似输入数据的线程（如朝向相同大致方向的光线）聚集在一起：

- ✅ 减少执行发散（更多线程走同一分支）
- ✅ 提高缓存一致性（相似方向的光线更可能命中相邻内存）

#### 3. 可变速率着色（Variable Rate Shading, VRS）

VRS 不改变 Shader 的功能，而是根据 **输出相似度** 调整 Shader 的 **执行频率**：

| 速率 | 含义 |
|------|------|
| 1×1 | 每个像素执行一次（默认） |
| 1×2 / 2×1 | 每 2 个像素执行一次，结果共享 |
| 2×2 | 每 4 个像素执行一次，结果共享 |

实现方式：
- **硬件 VRS**：针对 Pixel Shader，GPU 硬件直接支持
- **软件 VRS**：针对 Compute Shader，通过代码逻辑实现

---

## 内存延迟与 Occupancy：深入理解

### Occupancy 的本质

**Occupancy（占用率）** 是指 SIMD 单元能够同时 **保持就绪（warmed up and ready to run）** 的 Wave 数量。它是衡量 GPU **隐藏内存延迟能力** 的重要指标（但非唯一指标）。

#### 工作原理

当一个 Wave 的指令被内存读取 **阻塞（stall）** 时，GPU 可以切换到另一个就绪的 Wave 继续执行。Occupancy 越高，可切换的 Wave 越多，内存延迟被隐藏得越好。

#### 主要影响因素

**VGPR（向量通用寄存器）分配量** 是影响 Occupancy 的首要因素。每个 SIMD 的 VGPR 总量是固定的，单个 Shader 使用的 VGPR 越多，能并发的 Wave 就越少。

> **这正是前述所有 ALU 优化建议的附加价值：** 简化 ALU 工作不仅减少指令数，还可能降低 VGPR 分配，从而提高 Occupancy。

---

### 编译器的延迟隐藏策略：指令调度

Occupancy 不是隐藏延迟的唯一手段。编译器还会尝试在 **内存读取发起** 和 **数据实际使用** 之间插入尽可能多的指令：

#### ✅ 良好的代码顺序：先发起读取，后面做其他计算

```hlsl
float3 vec = tex.Sample(state, input.uv).rgb; // 发起纹理读取
result.xyz += mul(float4(data.xyz, 1), m).xyz; // 先处理不依赖纹理的计算
result.xyz += mul(float4(vec.xyz, 1), m).xyz;  // 最后使用纹理结果
```

```asm
image_sample  v[0:2], [v2,v0], s[4:11], s[12:15] dmask:0x7 dim:SQ_RSRC_IMG_2D  // 发起内存读取
s_buffer_load_dwordx8  s[4:11], s[0:3], 0x000010
s_buffer_load_dwordx8  s[12:19], s[0:3], 0x000030
s_waitcnt     lgkmcnt(0)
v_mov_b32     v3, s11
v_mov_b32     v4, s15
v_mov_b32     v5, s19
v_fma_f32     v3, s4, s8, v3        // ← 这些指令都在等待纹理数据期间执行
v_fma_f32     v4, s4, s12, v4
v_fma_f32     v5, s4, s16, v5
v_fma_f32     v3, s9, s5, v3
v_fma_f32     v4, s13, s5, v4
v_fma_f32     v5, s17, s5, v5
v_fma_f32     v3, s10, s6, v3
v_fma_f32     v4, s14, s6, v4
v_fma_f32     v5, s18, s6, v5
s_waitcnt     vmcnt(0)              // ← 大量指令后才阻塞等待数据
v_fma_f32     v6, v0, s8, s11       // 使用纹理结果
// 后续指令...
```

**编译器在 `image_sample` 和 `s_waitcnt vmcnt(0)` 之间插入了 ~15 条指令**，有效隐藏了内存延迟。

#### ❌ 不良的代码顺序：立即使用读取结果

```hlsl
float3 vec = tex.Sample(state, input.uv).rgb; // 发起纹理读取
result.xyz += mul(float4(vec.xyz, 1), m).xyz;  // 立即使用！
result.xyz += mul(float4(data.xyz, 1), m).xyz;
```

```asm
image_sample  v[0:2], [v2,v0], s[4:11], s[12:15] dmask:0x7 dim:SQ_RSRC_IMG_2D  // 发起读取
s_buffer_load_dwordx8  s[4:11], s[0:3], 0x000030
s_buffer_load_dwordx8  s[12:19], s[0:3], 0x000010
s_waitcnt     lgkmcnt(0)
v_mov_b32     v4, s11
v_fma_f32     v4, s8, s12, v4
v_fma_f32     v4, s9, s13, v4
v_fma_f32     v4, s10, s14, v4
s_waitcnt     vmcnt(0)              // ← 仅 ~4 条指令后就必须阻塞！
v_fma_f32     v5, v0, s16, s19     // 立即使用纹理数据
v_fma_f32     v3, v0, s8, s11
v_fma_f32     v0, v0, s4, s7
v_fmac_f32    v5, s17, v1
v_fmac_f32    v3, s9, v1
v_fmac_f32    v0, s5, v1
v_mov_b32     v1, s7
v_fmac_f32    v3, s10, v2
v_fmac_f32    v5, s18, v2
v_fma_f32     v1, s4, s12, v1
v_add_f32     v3, 1.0, v3
v_fmac_f32    v0, s6, v2
v_fma_f32     v1, s5, s13, v1
v_add_f32     v3, v3, v4
```

**编译器只能插入 ~4 条指令** 就被迫等待数据——因为编译器 **不会改变操作顺序**（可能影响浮点精度结果），这个决定必须由 **Shader 作者** 来做。

> **实践建议：**
> - **尽早发起纹理读取**，将不依赖读取结果的计算插入中间
> - **部分展开循环**，给编译器更多可调度的指令
> - 必要时 **手动重排指令顺序** 以增大读取-使用间距

---

### ⚠️ Occupancy 的"反直觉"陷阱

优化 Occupancy **并不总是带来性能提升**，存在两个重要的反例：

#### 陷阱 1：缓存颠簸（Cache Thrashing）

过高的 Occupancy 意味着大量 Wave 同时竞争有限的缓存空间，导致：
- 缓存命中率下降
- 实际内存访问延迟反而 **增加**

#### 陷阱 2：VGPR 过少导致内存读取串行化

> **真实案例：** 开发者移除了一个长期不活跃的分支来减少 VGPR 分配、提高 Occupancy，结果 **Shader 开销反而上升了**。
>
> **原因：** 编译器可用的 VGPR 减少后，没有足够的寄存器来 **缓存多个并发内存读取的结果**。编译器被迫：
> 1. 发起一次内存读取
> 2. 等待结果
> 3. 使用结果并释放 VGPR
> 4. 才能发起下一次读取
>
> 这实际上将原本 **并行的内存读取串行化了**。

---

### 核心原则：必须 Profile

> **无论做什么优化改动，都必须实际测量性能。** 结果很可能与预期相反。Occupancy 提升不等于性能提升，指令减少不等于更快执行。GPU 性能分析工具（如 AMD RGP、NVIDIA Nsight）是验证优化效果的唯一可靠途径。



## Wave Intrinsics：线程间通信与数据共享

### 核心价值

Wave Intrinsics 允许 **Wave 内的线程直接互相通信和交换数据**，其核心优势在于：

- 使用 **VGPR（最快的存储形式）** 来存储和共享中间数据，**替代 groupshared memory 或全局内存**
- 能够查询 Wave 内线程的状态，**基于集体信息做决策**
- 典型应用：Stream Compaction（用每 Wave 一次原子操作替代每线程一次）

---

### 标量化（Scalarisation）：动态判断数据一致性

前面讨论过编译器可以在 **编译期推断索引是否 Wave 一致** 时使用标量流水线加载。但对于编译期无法确定一致性的数据源，**Wave Intrinsics 提供了运行时判断的能力**：

```hlsl
int i = ...; // 某个索引值，可能每线程不同，也可能相同

int i0 = WaveReadLaneFirst(i); // 获取 Wave 中第一个线程的索引值

if (WaveActiveAllTrue(i == i0)) // 如果所有线程的索引都相同 → 标量加载
{
    result = structured_buffer[i0];
}
else // 否则 → 向量加载
{
    result = structured_buffer[i];
}
```

#### 编译器生成的汇编

```asm
v_readfirstlane_b32  s0, v0             // 从第一个线程读取索引到标量寄存器
v_cmp_eq_i32  vcc, s0, v0               // 所有线程与第一个线程的索引比较
s_mov_b32     s2, s3
s_mov_b32     s3, s1
s_load_dwordx4  s[12:15], s[2:3], 0x00
s_cmp_eq_u64  exec, vcc                  // exec == vcc？即所有活跃线程都相等？
s_cbranch_scc1  label_000F               // 如果全部相等 → 跳到标量加载路径

// ——— 向量加载路径（索引不一致）———
s_waitcnt     lgkmcnt(0)
tbuffer_load_format_x  v2, v0, s[12:15], 0 idxen format:[BUF_DATA_FORMAT_32,BUF_NUM_FORMAT_FLOAT]
s_branch      label_0015

// ——— 标量加载路径（索引全部一致）———
label_000F:
s_lshl_b32    s0, s0, 2                  // 索引 × 4（字节偏移）
s_waitcnt     lgkmcnt(0)
s_buffer_load_dword  s0, s[12:15], s0    // 标量加载！只需一次内存读取
s_waitcnt     lgkmcnt(0)
```

#### 执行流程详解

```
┌─────────────────────────────────────────────┐
│  v_readfirstlane_b32: 取第一个线程的索引 i0  │
│  v_cmp_eq_i32: 每个线程检查自己的 i == i0?  │
│  s_cmp_eq_u64 exec, vcc: 所有线程都相等？    │
├──────────────┬──────────────────────────────┤
│   全部相等    │        存在不同              │
│   (uniform)  │      (divergent)             │
├──────────────┼──────────────────────────────┤
│ s_buffer_load│  tbuffer_load_format_x       │
│ (标量加载)    │  (向量加载，每线程独立)        │
│ 1次内存访问   │  可能多次内存访问              │
│ 结果在SGPR   │  结果在VGPR                   │
└──────────────┴──────────────────────────────┘
```

> **这就是"标量化（Scalarisation）"的核心思想：** 在运行时通过 Wave Intrinsics 检测数据的一致性，**动态选择更便宜的标量路径或更昂贵的向量路径**。这个模式可以扩展到更复杂的场景。

---

## FP16：半精度浮点的机遇与挑战

### 理论优势

FP16（16 位浮点数）在 GPU 上有两大纸面优势：

| 优势 | 机制 | 效果 |
|------|------|------|
| **寄存器打包** | 将两个 FP16 值打包进一个 32 位 VGPR | 降低 VGPR 分配 → **提高 Occupancy** |
| **打包运算** | 一条指令同时操作打包在 32 位寄存器中的两个 FP16 值 | **减少 ALU 指令数**（接近 2 倍吞吐） |

### 实际挑战

> ⚠️ **"Your mileage will vary a lot with fp16"**

FP16 的收益 **高度依赖整个管线的配合**，需要相当多的规划：

1. **资源（Resources）**：纹理、Buffer 的数据格式需要是 FP16
2. **Shader 代码**：所有中间运算需要保持在 FP16
3. **管线各阶段**：从输入到输出全链路 FP16

#### 最大的陷阱：FP16 ↔ FP32 转换

如果 FP16 和 FP32 数据在 Shader 中 **混合使用**，编译器将不得不插入大量的 **格式转换指令**（`v_cvt_f32_f16` / `v_cvt_f16_f32`），这些转换开销可能 **完全抵消** FP16 带来的收益。

> **实践建议：** FP16 优化需要 **端到端（end-to-end）** 的规划，而非局部替换。只在能够确保整条数据路径都维持 FP16 的场景下使用。

---

## 全文总结：核心要点

原始演讲和本文的核心观点，归纳为以下几个关键原则：

### 1. 理解你的工具和平台

> **重点不在于节省个别 ALU 指令，而在于理解你所使用的工具/平台，并与编译器协作而非盲目依赖它。**

### 2. 编译器很强但不全知

编译器技术已经有了巨大进步，但 **编译器无法知道作者的意图**。我们需要与编译器 **协作** 来达到最佳代码和性能。

### 3. 不要假设，要验证

**不要假设编译器会做什么**，在有机会的时候学会 **阅读和理解编译器的输出（ISA）**。

### 4. 培养好习惯

你不必总是为额外的指令担心。更重要的是养成好的编码习惯：

- ✅ 按类型批量组织操作
- ❌ 避免整数除法
- ❌ 避免过多的反三角函数
- ✅ 优先使用内置函数
- ✅ 注意操作数顺序的一致性

### 5. 理解瓶颈所在

**更重要的是理解每种情况下的瓶颈**，确保 GPU 资源不被浪费：

```
性能瓶颈分析：
├── ALU 受限？    → 优化指令数、利用标量流水线
├── 带宽受限？    → 减少内存访问、提高缓存命中
├── 纹理受限？    → 减少采样次数、使用更低精度格式
├── Occupancy 低？→ 降低 VGPR、Tile 分类简化 Shader
└── 发散严重？    → Binning、标量化、Tile 分类
```

### 6. 始终 Profile

> **始终通过性能分析工具验证任何 Shader 修改/性能改进的实际影响，结果可能出乎你的意料。**

### 7. 看全局，不只看 Shader

**在上下文中审视 Shader 的执行**——可能有 Shader 之外的因素影响其性能：

- Root Signature 配置
- Barrier 和资源状态转换
- Descriptor 绑定方式
- 异步计算的重叠
- 前后 Pass 的依赖关系

---

> **一句话总结：** 编写高效的 GPU Shader，需要的不仅是编码技巧，更是对 GPU 架构、编译器行为和性能分析工具的深入理解——**与编译器协作，理解平台，验证结果。**