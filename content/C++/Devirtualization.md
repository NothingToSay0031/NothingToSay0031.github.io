---
title: "Devirtualization: How Compilers Optimize Virtual Function Calls"
date: 2026-03-06 15:33:58
---

# 去虚拟化（Devirtualization）：编译器如何优化虚函数调用

## 1. 背景与动机

- 传统 **虚函数多态** 仍然广泛应用于：实现多态行为、为可测试性添加 **接缝（Seam）** 、为未来扩展预留空间
- 业界常说 "虚函数是慢的"，但现代编译器的优化能力已经大幅缩小了虚函数调用与直接调用之间的性能差距
- 参考来源：[Optimizations in C++ Compilers - ACM Queue](https://queue.acm.org/detail.cfm?id=3372264)

---

## 2. 基准参照：非多态版本

```cpp
struct Transform
{
    int operator()(int x) const { return x * x; }
};

int sumTransformed(const vector<int> &v,
                   const Transform &transform)
{
    int res = 0;
    for (auto i : v)
    {
        res += transform(i);
    }
    return res;
}
```

- 没有任何虚函数，编译器可以完全 **内联** `operator()`
- 生成结果：高度 **向量化（Vectorized）** 的汇编代码，性能极佳
- 这是后续对比的性能基线

---

## 3. 添加 `virtual` 后发生了什么

### 3.1 预期 vs 实际

- 给 `operator()` 加上 `virtual` 关键字后，预期应产生大量 **间接调用（Indirect Call）** ，性能严重下降
- 但实际生成的循环核心汇编出人意料：

```asm
; rdx 指向虚函数表 (vtable)
.L8:
  mov rax, QWORD PTR [rdx]  ; 读取虚函数指针
  mov esi, DWORD PTR [rbx]  ; 读取下一个 int 元素
  ; 将函数指针与唯一已知的实现进行比较...
  cmp rax, Transform::operator()(int) const
  jne .L5                   ; 如果不是唯一已知的实现，
                            ; 则跳转到更复杂的处理分支
  imul esi, esi             ; 对数字求平方（直接内联！）
  add rbx, 4                ; 移动到下一个元素
  add r12d, esi             ; 累加平方值
  cmp rbp, rbx              ; 是否结束？
  jne .L8                   ; 如果未结束，继续循环
```

### 3.2 关键观察

- 编译器 **并没有** 通过虚函数表做间接调用
- 而是用一条 `cmp` 指令将虚函数指针与唯一已知实现做比较
- 匹配成功 → 直接执行 **内联后的函数体** （`imul esi, esi`）
- 匹配失败 → 跳转到通用的间接调用分支（ `.L5` ）
- 代价极小：仅多了一次指针比较和一次条件跳转

---

## 4. 推测性去虚拟化（Speculative Devirtualization）

### 4.1 核心思想

- 编译器（以 GCC 为代表）观察到整个编译单元中只有 **一个** `Transform` 类的实现
- 于是 **推测** ：运行时使用的很可能就是这个唯一实现
- 策略：**先比较，再内联** ——用微小的比较开销换取内联带来的巨大收益

### 4.2 本质

> **编译器内联了一个虚函数调用！**

- 这项技术叫 **推测性去虚拟化（Speculative Devirtualization）**
- 是编译器优化领域的持续研究方向
- 还能与 **LTO（Link-Time Optimization，链接时优化）** 结合，在链接阶段进行 **全程序范围** 的函数实现分析，发现更多去虚拟化机会

---

## 5. 尚待改进的优化空间

### 5.1 当前缺陷：循环内重复加载 vtable 指针

- 观察上面的汇编：**每次循环迭代** 都会重新从 vtable 加载虚函数指针（`mov rax, QWORD PTR [rdx]`）
- 理论上，只要被调用的函数不改变 `Transform` 的 **动态类型** ，这个值就是 **循环不变量（Loop Invariant）**
- 如果编译器能将这个检查 **提升到循环外部（Loop-Invariant Code Motion, LICM）** ，那么：
  - 循环内部完全无需动态检查
  - 检查通过后的分支可以替换为 **完全向量化** 的循环，达到与非多态版本相同的性能

### 5.2 为什么编译器不敢做这个优化？

- C++ 标准 **允许** 通过 **placement new** 在对象自身的存储上重新构造对象，这意味着对象的动态类型理论上可以在函数调用过程中改变
- 只要在析构时恢复到原始类型即可
- 这使编译器无法安全地假设 vtable 指针在循环中保持不变

> ⚠️ **实践建议：永远不要用 placement new 在原地改变对象的动态类型**

### 5.3 编译器选项

| 编译器 | 行为 |
|--------|------|
| **GCC** | 默认执行推测性去虚拟化 |
| **Clang** | 提供 `-fstrict-vtable-pointers` 选项，用户向编译器承诺不会有 placement new 改变动态类型的行为，从而启用更激进的优化 |
| **Clang（未来）** | 正在改进类型系统以更好地利用此类优化 |

---

## 6. `final` 关键字的威力

### 6.1 作用机制

- C++11 引入 `final` 说明符，可标记 **类** 或 **虚方法** 为不可被进一步重写
- 这为编译器提供了 **确定性保证** ，而非仅仅是推测

### 6.2 优化效果

- **最好情况：** 编译器可以 **完全避免虚函数调用** ，直接内联，无需任何运行时比较
  - 因为编译器 **确知** 没有子类会重写这个方法
- 相比推测性去虚拟化，`final` 带来的是 **无条件内联** ，连 `cmp + jne` 的开销都省去了

### 6.3 使用方式

```cpp
struct Transform final {  // 整个类标记为 final
    virtual int operator()(int x) const { return x * x; }
};

// 或者仅标记方法
struct Transform {
    virtual int operator()(int x) const final { return x * x; }
};
```

---

## 7. 静态去虚拟化（Static Devirtualization）

- 即使没有 `final` 关键字，编译器在某些场景下也能通过 **静态分析** 证明正在使用的是某个特定的具体类
- 例如：当对象在栈上构造、类型完全可见时，编译器可以直接确定动态类型

```cpp
void foo() {
    Transform t;               // 栈上构造，类型确定
    sumTransformed(v, t);      // 编译器知道 t 的动态类型就是 Transform
}
```

- 此时编译器可以 **完全消除虚调用** ，不需要任何运行时检查
- 这叫做 **静态去虚拟化（Static Devirtualization）** ，能带来 **显著的性能提升**

---

## 8. 四种去虚拟化技术总结

| 优化技术 | 触发条件 | 运行时开销 | 优化效果 |
|---------|---------|-----------|---------|
| **推测性去虚拟化（Speculative）** | 编译器发现只有少量已知实现 | 一次指针比较 + 条件跳转 | 快速路径内联，慢速路径回退到间接调用 |
| **静态去虚拟化（Static）** | 编译器能静态证明对象的具体类型 | **零** | 完全消除虚调用，直接内联 |
| **`final` 关键字去虚拟化** | 类或方法标记为 `final` | **零** | 完全消除虚调用，直接内联 |
| **LTO 去虚拟化** | 链接时全程序分析 | 取决于具体策略 | 跨编译单元发现去虚拟化机会 |

---

## 9. 实践启示

- **不要盲目回避虚函数** ：现代编译器的去虚拟化能力已经相当强大，虚函数并非总是性能瓶颈
- **善用 `final`** ：对于明确不需要被继承/重写的类和方法，标记 `final` 是零成本的性能提升手段
- **开启 LTO** ：链接时优化能让编译器看到更多实现，发现更多去虚拟化机会
- **注意热循环中的虚调用** ：推测性去虚拟化虽好，但每次迭代仍有一次比较开销；如果是极端性能敏感的热循环，考虑用 **CRTP（Curiously Recurring Template Pattern）** 或 `std::variant` + `std::visit` 等编译期多态替代
- **避免 placement new 改变动态类型** ：这会阻碍编译器的 LICM 优化，使虚函数指针检查无法提升到循环外部
- **Clang 用户：** 考虑使用 `-fstrict-vtable-pointers` 编译选项来解锁更多优化