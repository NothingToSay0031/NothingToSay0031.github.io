---
title: Is unique_ptr Really Zero-Cost?
date: 2025-04-27 12:29:00
description: "The Hidden Overhead of unique_ptr: Why It's Not Always Zero-Cost."
---

# The Hidden Cost of `std::unique_ptr`: Why It's Not Always "Zero-Cost"

[CppCon 2019: Chandler Carruth “There Are No Zero-cost Abstractions”](https://youtu.be/rHIkrotSwcc?si=ZZCm9hVf2a0UmMie)

One of the most beloved tools in the modern C++ developer's toolbox is `std::unique_ptr`. It dramatically simplifies resource management, especially memory, using the RAII (Resource Acquisition Is Initialization) paradigm, effectively preventing memory leaks. Many C++ developers operate under the assumption that `std::unique_ptr` is a "zero-cost abstraction"—meaning its use incurs no additional runtime performance overhead compared to manually managing raw pointers.

But is that really true? Deeper analysis and compiler output, as highlighted in insightful talks, reveal a more nuanced reality: **`std::unique_ptr` isn't always zero-cost, especially when crossing function API boundaries.**

## When `std::unique_ptr` Is (Close to) Zero-Cost

First, let's be clear: in certain scenarios, `std::unique_ptr` does come very close to being zero-cost. When you use a `unique_ptr` **solely within a single function scope** to manage the lifetime of a local resource, modern compilers are typically brilliant at optimization.

```c++
#include <memory>

void process_data() {
    auto data = std::make_unique<int>(10);
    // ... use data ...
    if (*data > 5) {
        // ... more operations ...
    }
    // Memory pointed to by data is automatically released at function end.
}
// In this case, compared to manual new/delete,
// the overhead of unique_ptr is often optimized away.
```

In this scenario, `unique_ptr` provides immense safety and convenience with virtually no runtime performance penalty. The compiler can effectively "see through" the abstraction and generate machine code very similar (or identical) to manual raw pointer management.

## Crossing API Boundaries: Where the Overhead Appears

One of the true powers of `std::unique_ptr` lies in its ability to clearly express ownership transfer at the API level. This is far safer and more explicit than the old style of relying on comments to indicate who is responsible for deleting memory.

Consider the contrast between these two styles:

**Old Style (Error-prone):**

```c++
#include <memory>

void bar(int* ptr); // Does something with ptr within the function

// Takes ownership. <--- Relies on comments for critical information!
void baz(int* ptr);

void foo(int* ptr) { // foo receives a pointer, doesn't own it
    if (*ptr > 42) {
        bar(ptr);      // Pass pointer, no ownership transfer
        *ptr = 42;
    }
    baz(ptr);          // Call baz; according to the comment, ownership transfers here!
                       // foo must not use ptr after this call
}
```

**Modern C++ Style (Safer):**

```c++
#include <memory>

void bar(int* ptr); // Can still take raw pointers for non-owning access

// Takes ownership. Explicitly stated via the type system.
void baz(std::unique_ptr<int> ptr);

void foo(std::unique_ptr<int> ptr) { // foo receives ownership
    if (*ptr > 42) {
        bar(ptr.get()); // Use get() for non-owning raw pointer access
        *ptr = 42;
    }
    baz(std::move(ptr)); // Explicitly transfer ownership to baz using std::move
                         // ptr becomes null after this
}
```

The code on the right is undoubtedly clearer and safer. However, it's precisely when we pass `unique_ptr` between functions like this (especially via pass-by-value with `std::move` into `baz`) that the hidden costs can start to manifest.

## Analyzing the Sources of Overhead

The speaker analyzed scenarios similar to `foo` calling `baz` using Compiler Explorer and found the generated assembly code was surprisingly longer than expected. There are several reasons:

1.  **Exception Safety Overhead (Implicit)**:
    * The `std::unique_ptr` version is inherently exception-safe. If `bar` or `baz` throws an exception within `foo`, the `unique_ptr`'s destructor ensures the memory is correctly freed.
    * The raw pointer version lacks this guarantee. If `bar` throws (assuming in the raw pointer version, `bar` could throw before `baz` is called), or if `baz` itself throws before taking ownership, the memory leaks.
    * To implement this safety guarantee, the compiler generates extra exception handling code (e.g., involving `unwind resume` instructions), which is itself a form of overhead.
    * *Optimization*: If you can guarantee that the relevant functions (like `bar` and `baz`) will not throw exceptions, you can mark them `noexcept`. This can eliminate the exception handling overhead, shortening the assembly. But even then, the problem isn't fully solved.

2.  **Pass-by-Value Overhead for `unique_ptr` (ABI Constraints & Temporaries)**:
    * Even with `noexcept`, passing a `unique_ptr` **by value** (even via `std::move`) is often **not zero-cost**.
    * According to the C++ ABI (Application Binary Interface) on many platforms, "non-trivial" types like `unique_ptr` (because it has custom destructor and move constructor/assignment operators) are **often passed indirectly via memory (the stack)**, even when passed "by value", rather than directly in registers.
    * This results in a sequence of operations:
        * The pointer value inside the `unique_ptr` is **stored onto the caller's (`foo`) stack**.
        * The **address** of this stack location is calculated.
        * This **address** is passed to the callee (`baz`).
        * Inside `baz`, the function needs to **load** the `unique_ptr`'s contents (the actual pointer value) **through this address**. **This is a double indirection**.
        * After `baz` returns, the caller (`foo`) needs to **load** the value of that (now potentially null) `unique_ptr` **back from the stack** and check if it needs to call the destructor (because C++ lacks destructive moves, it must assume `baz` *might not* have moved from it, even though we used `std::move`).
    * These extra memory loads and stores, particularly the double indirection, add instructions and potential memory latency, creating performance overhead.

3.  **Overhead when Trying R-value References (`&&`)**:
    * One might think: could using an r-value reference parameter `void baz(std::unique_ptr<int>&& ptr)` solve this?
    * It does avoid some of the temporary object copy/move and stack-based destructor checks associated with pass-by-value. The generated assembly looks closer to the raw pointer version.
    * **However**, it introduces an **explicit double indirection**: you're passing a reference *to* a `unique_ptr`, which itself contains a pointer. This still results in two memory load operations (`load from memory` instructions) in the critical path, which are subject to memory subsystem latency and can be slower than the raw pointer version (which often involves only one load).

## Why Can't the Compiler Do Better?

Eliminating these overheads is extremely difficult because it touches fundamental C++ mechanisms:

* **ABI Stability Constraints**: Changing function calling conventions (e.g., allowing small objects like `unique_ptr` to be passed in registers) is a massive ABI break, shattering compatibility with existing compiled code. It's practically very difficult to implement widely.
* **Lack of Destructive Move Semantics**: C++ move semantics are non-destructive. After a move, the source object still exists in a valid (usually empty) state, and its destructor will still be called. If C++ had destructive moves, the compiler would know the source object needs no further checks or destruction after being moved, potentially eliminating some overhead. But this would be a fundamental change to the language semantics. (Rust wins! XD)

## Conclusion: Understanding the Trade-offs

`std::unique_ptr` is an incredibly valuable tool. The memory safety, clear ownership semantics, and exception safety it provides usually far outweigh its potential performance overhead.

* **When used locally within a function, it's typically zero-cost.**
* **When transferring ownership across function API boundaries, due to ABI limitations and the nature of C++ move semantics, it can introduce runtime overhead** (memory loads/stores, double indirection, potential destructor checks).

The key is to **understand this trade-off**. For the vast majority of applications, the benefits of `unique_ptr` in safety and code clarity are paramount, and the slight performance difference is often negligible. However, in extremely performance-sensitive code paths (e.g., low-level libraries, high-frequency functions), developers should be aware that `unique_ptr` might not be strictly "zero-cost" in these specific scenarios. Knowing these details can help you make informed decisions during performance tuning, but it absolutely does not mean we should revert wholesale to error-prone manual pointer management.

**`std::unique_ptr` remains the preferred way to manage dynamic memory in modern C++. Just remember that powerful abstractions sometimes come with subtle costs.**

