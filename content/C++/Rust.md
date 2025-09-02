---
title: Rust Essentials
date: 2024-09-15 20:35:50
description: A language empowering everyone to build reliable and efficient software.
---

# Memory Management in Rust - Stack vs. Heap

## Introduction

- Rust emphasizes **memory safety** without garbage collection.
- This session revisits fundamental concepts like memory, functions, and how data is stored.
- Many experienced engineers must revisit these basics to solve real-world issues like **concurrent safety**.

## Key Concepts

1. **Memory in Programming**
    - Every program interacts with memory, whether **stack**, **heap**, or **readonly data segments** (e.g., `.RODATA` for string literals).
    - Example in Rust:
      
        ```rust
        let s = "hello world".to_string();
        ```
        
        - `"hello world"` is stored in `.RODATA`.
        - `.to_string()` allocates new memory on the **heap**, copying `"hello world"` to the heap.
        - `s` is a variable on the **stack**, holding the pointer, length (11), and capacity (11) to this heap data.
2. **Stack vs. Heap**:
    - **Stack**:
        - Functions allocate **frames** (memory) on the stack when invoked.
        - Frames contain **registers** (for context) and **local variables**.
        - Stack memory is managed efficiently, with memory allocation and deallocation happening as a function call starts and ends.
        - **Limitation**: Stack size is predetermined; cannot dynamically resize. Storing large or dynamically sized data (e.g., strings) leads to stack overflow.
    - **Heap**:
        - Heap memory is used for data of **unknown or dynamic size**.
        - Allocations in the heap require explicit or automated memory management (e.g., using `malloc()` or Rust's ownership system).
        - **Flexible lifespan**: Unlike the stack, heap-allocated memory can outlive the function call that created it, and data can be shared across threads.
        - **Drawbacks**: Complex management, leading to issues like **memory leaks** or **use after free**.

## When to Use Stack vs. Heap

- **Stack**:
    - Data size must be known at **compile time**.
    - **Efficient** allocation (minimal system overhead).
    - **Short-lived**: Stack memory is freed after function returns.
- **Heap**:
    - Data is **dynamic** or its size isn’t known until runtime.
    - Data needs to be **shared** across multiple functions or threads.
    - Requires **manual or automatic memory management** to prevent leaks or invalid references.

## Problems with Heap Allocation

1. **Memory Leaks**: Forgetting to release heap memory.
2. **Thread Safety**: Sharing heap memory between threads requires **synchronization** (e.g., locking) to avoid issues like **use after free** or **heap out-of-bounds**.
3. **Performance**: Frequent heap allocations cause overhead, so strategies like **pre-allocating memory** are used to mitigate performance costs.

## Garbage Collection (GC) vs. Automatic Reference Counting (ARC)

- **GC**:
    - Traces and frees unused memory.
    - Efficient in memory throughput but introduces **latency** issues (e.g., "Stop The World" events), affecting responsiveness.
    - Example: **Java** uses GC but is unsuitable for real-time systems due to unpredictability in memory management.
- **ARC**:
    - Manages memory through **reference counting**, freeing memory when the count reaches zero.
    - Common in languages like **Swift** and **Objective-C**.
    - **Lower throughput** than GC but avoids unpredictable pauses, making ARC ideal for **real-time applications**.

## Summary

- Stack memory: **static size**, efficient, local to function calls.
- Heap memory: **dynamic size**, flexible lifespan, more complex to manage.
- Managing memory carefully in Rust helps achieve **memory safety** and **efficient performance**. Rust provides tools to handle heap and stack memory management with less room for mistakes (e.g., **ownership and borrowing**).

## Discussion

1. **Can you put data shared across multiple threads on the stack?**
    - No, because stack memory is local to the current function. Use the heap for sharing data across threads.
2. **Can you use a pointer to refer to stack memory?**
    - Yes, but only within the function’s scope. Once the function ends, the stack frame is deallocated, making the pointer invalid. Use heap memory for pointers that need to outlive a function.

# Essential Programming Concepts

In the last lecture, we discussed the fundamentals of memory operations, focusing on stack and heap memory. Today, we’ll continue exploring essential programming concepts, divided into four main categories:

1. **Data (Values & Types, Pointers & References)**
2. **Code (Functions, Methods, Closures, Interfaces & Virtual Tables)**
3. **Execution Models (Concurrency vs. Parallelism, Sync vs. Async, Promises/async/await)**
4. **Programming Paradigms (Generic Programming)**

These concepts are foundational, especially in understanding more advanced Rust features like ownership, dynamic dispatch, and concurrency.


## Data: Values, Types, Pointers, and References

**Values and Types:**

- A **type** defines characteristics like memory size, alignment, and valid operations for a value.
- A **value** is an instance of a specific type. For example, `64u8` is a value of type `u8` (an 8-bit integer), which in memory is represented as `0x40` (64 in hexadecimal).
- Values cannot exist without types. For example, the byte `0x40` could represent different data depending on the type—`64` if interpreted as an integer or `@` if interpreted as an ASCII character.

**Types: Primitive and Composite:**

- **Primitive types** include basic data like integers, floats, booleans, arrays, tuples, and pointers. These have fixed sizes and are often allocated on the stack.
- **Composite types** combine multiple primitive types:
    - **Structures (Product Types):** Group related fields, like a `Person` structure with `name`, `age`, and `email`.
    - **Tagged Unions (Sum Types):** Store one of several possible types, with an internal tag indicating which type is stored (e.g., `Optional` in Swift or `Maybe` in Haskell).
    - **Enumerations:** Similar to tagged unions but less powerful; they represent distinct variants of a type.

**Pointers and References:**

- A **pointer** holds the memory address of a value and can be dereferenced to access the value.
- A **reference** is a type-safe pointer that enforces access constraints. Unlike pointers, references can only be dereferenced to their original type, enhancing safety.
- **Fat Pointers:** Some references, such as to dynamically sized data (e.g., strings), include extra metadata like length and capacity in addition to the memory address.


## Code: Functions, Methods, Closures, Interfaces, and Virtual Tables

**Functions, Methods, and Closures:**

- A **function** is a reusable block of code designed to perform a specific task. Modern languages often treat functions as first-class citizens, meaning they can be passed as arguments, returned from other functions, and stored in variables.
- A **method** is a function associated with an object or class. It often operates on the object's internal state, using references like `self` in Python or `this` in Java.
- A **closure** is a function combined with its surrounding context. Closures capture and store the values of variables from their lexical scope.

**Interfaces and Virtual Tables:**

- An **interface** is an abstraction layer that separates the user from the implementation. It defines a contract that can be fulfilled by various concrete types.
- **Dynamic Dispatch and Virtual Tables:** In languages that support dynamic dispatch (e.g., Rust’s `trait`), interfaces are linked to implementations at runtime using a **virtual table (vtable)**. The vtable holds pointers to methods corresponding to the interface, enabling runtime polymorphism.


## Execution Models: Concurrency, Parallelism, Sync, and Async

**Concurrency vs. Parallelism:**

- **Concurrency** is the ability to manage multiple tasks simultaneously, but not necessarily at the same time. Tasks are interleaved, saving state and switching context.
- **Parallelism** is the simultaneous execution of multiple tasks using multiple cores. Concurrency provides the ability to handle many tasks; parallelism uses multiple resources to execute them.

**Sync vs. Async:**

- **Synchronous** operations block execution until they are completed, ensuring that tasks happen in a specific order. Most CPU instructions and function calls are synchronous.
- **Asynchronous** operations allow the program to perform other tasks while waiting for an I/O operation to complete, maximizing CPU utilization. For example, in **async/await**, `async` initiates an asynchronous task, and `await` pauses execution until the task is completed.

**Promises and Async/Await:**

- **Promise** is an object that represents the future result of an asynchronous operation. It has three states: pending, resolved (success), or rejected (failure).
- **Async/await** is syntactic sugar over promises. It simplifies writing asynchronous code by making it look and behave like synchronous code.


## Programming Paradigms: Generic Programming

**Data Structure Generics:**

- **Generic Data Structures** (parameterized types) allow you to define structures that operate on different types. For example:Here, `S` is a generic type, and the actual type for `S` is specified at runtime (e.g., `TcpStream`).
  
    ```rust
    struct Connection<S> {
      io: S,
      state: State,
    }
    ```
    

**Generic Algorithms:**

- In generic programming, functions and data structures are defined with type parameters, which can be substituted with any valid type. This increases code reusability and reduces redundancy.
- A good example is a binary search algorithm. In non-generic code, different implementations would be needed for different types (e.g., integers, floats), but with generics, the same code can handle multiple types.


## Summary

We covered essential concepts across four categories:

1. **Data** is represented by values and types, with differences between primitive and composite types. Pointers and references are essential for memory management.
2. **Code** is structured using functions, methods, and closures. Interfaces and virtual tables enable abstraction and runtime polymorphism.
3. **Execution models** explore how tasks are handled, focusing on concurrency, parallelism, and asynchronous programming.
4. **Generic programming** allows for flexible, reusable code across different types.

# Rust Basics

## Introduction

Welcome to the world of Rust! Today, we'll dive into Rust by creating and running your first Rust program. The approach is hands-on; you’ll set up your Rust environment, write code, and understand the basic features and syntax of Rust.

**Creating a Project**: Generate a new Rust project with `cargo new`

**Writing Your First Rust Program**

- Add dependencies in `Cargo.toml`:
- Write the code in `src/main.rs`:

## Rust Features

1. **Cargo**:
   
    - Rust’s build system and package manager. Manages dependencies and project tasks.
2. **Syntax**:
   
    - Similar to C/C++, with functions enclosed in `{}`, semicolons `;` separating expressions, and `::` for namespace access.
3. **Type Inference**:
   
    - Rust supports type inference but requires explicit types for constants and static variables.
4. **Immutability**:
   
    - Variables are immutable by default. Use `mut` to declare mutable variables.
5. **Error Handling**:
    - Rust uses `Result<T, E>` for error handling. The `?` operator propagates errors. Example:
      
        ```rust
        let body = reqwest::blocking::get(url)?.text()?;
        ```
    
6. **Control Flow**:
   
    - Supports `if`, `loop`, `while`, and `for` loops. `for` loops can iterate over any `IntoIterator` implementation.
7. **Pattern Matching**:
    - Powerful feature using `match` to destructure and process enums and structs:
      
        ```rust
        match event {
            Event::Join((uid, _)) => println!("User {:?} joined", uid),
            Event::Leave((uid, tid)) => println!("User {:?} left {:?}", uid, tid),
            Event::Message((_, _, msg)) => println!("Broadcast: {}", msg),
        }
        ```
    
8. **Data Structures**:
   
    - `struct`, `enum`, and tuple types are used for defining complex data structures. Use `#[derive(Debug)]` for debugging output.

## Project Structure and Testing

1. **Modules and Crates**:
    - Use `mod` to include modules. Crates can be libraries or executables, and can be organized into workspaces.

2. **Testing**:
    - Write unit tests within the same file using `#[cfg(test)]`. For integration tests, use the `tests` directory.

# Ownership in Rust

This part focuses on Rust's unique ownership model, crucial for understanding memory safety without a garbage collector. Rust enforces strict rules on ownership and borrowing to manage memory efficiently.

## Key Concepts

1. **Ownership Rules**:
    - **Single Owner**: Each value in Rust has exactly one owner.
    - **Transfer of Ownership**: Ownership can be transferred, but there can only be one owner at a time.
    - **Scope-Based Destruction**: When the owner goes out of scope, the value is dropped and memory is freed.
2. **Move Semantics**:
    - When a value is assigned to another variable or passed to a function, ownership is transferred (moved) from the original owner to the new one.
    - Example: In the provided code, moving `data` to `find_pos()` invalidates the original `data` in `main()`.
3. **Copy Semantics**:
    - **Copy Trait**: Types that implement the `Copy` trait are copied bit-by-bit rather than moved. This avoids invalidating the original value.
    - Primitive types (e.g., integers, booleans) and fixed-size arrays implement `Copy`.
    - Types that do not implement `Copy` include heap-allocated types like `Vec` and `String`.
4. **Borrowing**:
    - When a value's ownership cannot be transferred but needs to be accessed, Rust allows borrowing. This will be covered in detail in the next part.

## Code Examples and Errors

- **Code Snippet**:
  
    ```rust
    fn main() {
        let data = vec![1, 2, 3, 4];
        let data1 = data;
        println!("sum of data1: {}", sum(data1));
        println!("data1: {:?}", data1); // error: data1 no longer accessible
        println!("sum of data: {}", sum(data)); // error: data no longer accessible
    }
    
    fn sum(data: Vec<u32>) -> u32 {
        data.iter().fold(0, |acc, x| acc + x)
    }
    ```
    
    - Errors occur because `data` and `data1` are no longer accessible after ownership is moved.
- **Copy vs. Move**:
  
    ```rust
    fn is_copy<T: Copy>() {}
    
    fn types_impl_copy_trait() {
        is_copy::<i32>(); // Valid, i32 implements Copy
        is_copy::<Vec<i32>>(); // Invalid, Vec does not implement Copy
    }
    ```
    

## Summary

Rust’s ownership model, involving Move and Copy semantics, provides robust memory safety by enforcing clear ownership rules. The model avoids issues associated with heap memory management in languages with garbage collection or manual memory management. Future parts will delve into borrowing and its role in this system.

# Borrowing in Rust

## Ownership Basics

In Rust, each value has a single owner, and ownership can be transferred via move semantics. If a value does not implement the `Copy` trait, ownership moves to the new owner, leaving the original owner unable to access the value. If a value implements `Copy`, it is duplicated, allowing both the original and new owner to access the value.

## Borrow Semantics

Borrowing allows temporary access to a value without transferring ownership, akin to renting a room. Rust uses references (`&` for immutable, `&mut` for mutable) to implement borrowing.

## Immutable References

- **Immutable Borrowing:** By default, Rust provides immutable borrowing. Immutable references do not affect the ownership of the value but allow read access. Multiple immutable references are allowed simultaneously as long as there are no mutable references.
- **Example Code:**
  
    ```rust
    fn main() {
        let data = vec![1, 2, 3, 4];
        let data_ref = &data;
        println!("sum of data_ref: {}", sum(data_ref));
    }
    
    fn sum(data: &Vec<u32>) -> u32 {
        data.iter().fold(0, |acc, x| acc + x)
    }
    ```
    
    - **Memory Addresses:** The memory address of `data` remains constant. References like `data_ref` point to the same data but have different addresses.

## Mutable References

- **Mutable Borrowing:** Mutable references allow modification of the value. Rust enforces strict rules to prevent unsafe behavior:
    1. Only one mutable reference is allowed at a time in a given scope.
    2. Mutable references are mutually exclusive with immutable references.
- **Example Code:**
  
    ```rust
    fn main() {
        let mut data = vec![1, 2, 3];
        let mut_ref = &mut data;
        mut_ref.push(4);
    }
    ```
    
    - **Safety:** Rust prevents multiple mutable references to avoid undefined behavior, ensuring data consistency and safety.

## Lifetimes

- **Lifetimes:** Rust enforces that references must not outlive the data they point to. This prevents issues like use-after-free. Lifetimes ensure that borrowed data remains valid as long as the references are in use.
- **Example Code:**
  
    ```rust
    fn main() {
        let r = local_ref();
        println!("r: {:p}", r);
    }
    
    fn local_ref<'a>() -> &'a i32 {
        let a = 42;
        &a
    }
    ```
    
    - **Issue:** This code is invalid because it returns a reference to a local variable, which will be dropped when the function exits.

## Special Cases

- **Stack and Heap:** References to stack-allocated data should not be stored in heap-allocated structures if they outlive the stack scope.
- **Example Code:**
  
    ```rust
    fn main() {
        let mut data: Vec<&u32> = Vec::new();
        let v = 42;
        data.push(&v);
    }
    ```
    
    - **Validity:** This code compiles because the reference's lifetime aligns with the scope. However, storing references to local variables in heap-allocated structures is risky and often leads to unsafe behavior.

## Rust's Guarantees

- Rust guarantees memory safety by enforcing strict rules on ownership and borrowing. These include:
    - One owner per value.
    - Multiple immutable references allowed.
    - Only one mutable reference allowed, with no mutable and immutable references coexisting.

## Discussion

Why does mutable borrowing not implement the `Copy` trait? How can you modify the following code to compile while avoiding simultaneous immutable and mutable references?

```rust
fn main() {
    let mut arr = vec![1, 2, 3];
    let last = arr.last();
    arr.push(4);
    println!("last: {:?}", last);
}
```

To fix the code, you need to ensure that you don't have both a mutable reference and an immutable reference active at the same time. Here's a revised version:

```rust
fn main() {
    let mut arr = vec![1, 2, 3];
    let last = {
        let last_ref = arr.last(); // Create a temporary scope for immutable borrow
        arr.push(4);
        last_ref
    };
    println!("last: {:?}", last);
}

```

In this version, the immutable reference to `arr` (`last_ref`) is created and used within its own scope, ensuring it is no longer active by the time `arr` is mutated. This way, `arr.push(4)` occurs only after `last_ref` is no longer in use.

# Arc, RefCell, and Concurrency

## Overview

Rust's ownership model typically ensures that each value has a single owner. This rule prevents data races and ensures memory safety. However, certain scenarios, like implementing Directed Acyclic Graphs (DAGs) or managing shared mutable state across threads, challenge this model. Rust addresses these with specific types: `Rc`, `RefCell`, `Arc`, and synchronization primitives.

## Reference Counting: `Rc` and `Arc`

**`Rc` (Reference Counted):**

- `Rc` enables multiple owners of data. It maintains a reference count, incrementing with `clone()` and decrementing when dropped.
- Example:
Here, `a`, `b`, and `c` all point to the same data on the heap. The data is only freed when the reference count reaches zero.
  
    ```rust
    use std::rc::Rc;
    
    fn main() {
        let a = Rc::new(1);
        let b = a.clone();
        let c = a.clone();
    }
    ```
  

**`Arc` (Atomic Reference Counted):**

- `Arc` is similar to `Rc` but is thread-safe, using atomic operations for reference counting.
- Example:`Arc` allows sharing data across threads safely.
  
    ```rust
    use std::sync::Arc;
    use std::thread;
    
    fn main() {
        let data = Arc::new(1);
        let data_clone = data.clone();
    
        thread::spawn(move || {
            println!("{:?}", data_clone);
        }).join().unwrap();
    }
    
    ```
    

## Internal Mutability: `Cell` and `RefCell`

| Feature | Cell | RefCell |
| --- | --- | --- |
| **Purpose** | Provides internal mutability for types that implement `Copy`. | Provides internal mutability for non-`Copy` types, allowing runtime borrow checking. |
| **Use Case** | Suitable for simple, `Copy` types like integers or `&str`. | Suitable for types that do not implement `Copy` and where borrow checking at runtime is acceptable. |
| **Borrowing Rules** | No borrowing rules; allows modification without references. | Enforces borrowing rules at runtime, allowing mutable and immutable references coexistence. |
| **Error Handling** | No runtime errors; does not panic. | Violates borrowing rules result in runtime `panic`. |
| **Performance** | Zero-cost abstraction; no additional overhead. | Slight runtime overhead due to borrow state tracking. |
| **When to Use** | Use when working with `Copy` types and you need to modify data even when it is immutably borrowed. | Use when working with non-`Copy` types where you need to manage mutable and immutable references dynamically at runtime. |

**`RefCell` :**

- Allows mutable access to data even when the `RefCell` itself is not mutable. It performs **runtime checks** to ensure only one mutable or multiple immutable borrows exist at a time.
- Example:
  
    ```rust
    use std::cell::RefCell;
    
    fn main() {
        let data = RefCell::new(1);
        {
            let mut v = data.borrow_mut();
            *v += 1;
        }
        println!("data: {:?}", data.borrow());
    }
    ```
    

## Thread Safety: `Mutex` and `RwLock`

- For thread safety with mutable data, `Mutex` provides exclusive access, while `RwLock` allows multiple readers or one writer.
- Example with `Mutex`:
  
    ```rust
    use std::sync::{Arc, Mutex};
    
    fn main() {
        let data = Arc::new(Mutex::new(1));
        let data_clone = data.clone();
    
        thread::spawn(move || {
            let mut data = data_clone.lock().unwrap();
            *data += 1;
        }).join().unwrap();
    
        println!("data: {:?}", *data.lock().unwrap());
    }
    
    ```
    

## Implementing a Mutable DAG

To create a DAG where nodes can be modified, use `Rc<RefCell<Node>>`:

```rust
use std::cell::RefCell;
use std::rc::Rc;

#[derive(Debug)]
struct Node {
    id: usize,
    downstream: Option<Rc<RefCell<Node>>>,
}

impl Node {
    pub fn new(id: usize) -> Self {
        Self {
            id,
            downstream: None,
        }
    }

    pub fn update_downstream(&mut self, downstream: Rc<RefCell<Node>>) {
        self.downstream = Some(downstream);
    }

    pub fn get_downstream(&self) -> Option<Rc<RefCell<Node>>> {
        self.downstream.as_ref().map(|v| v.clone())
    }
}

fn main() {
    let mut node1 = Node::new(1);
    let mut node2 = Node::new(2);
    let mut node3 = Node::new(3);
    let node4 = Node::new(4);

    node3.update_downstream(Rc::new(RefCell::new(node4)));
    node1.update_downstream(Rc::new(RefCell::new(node3)));
    node2.update_downstream(node1.get_downstream().unwrap());
    println!("node1: {:?}, node2: {:?}", node1, node2);

    let node5 = Node::new(5);
    let node3 = node1.get_downstream().unwrap();
    node3.borrow_mut().downstream = Some(Rc::new(RefCell::new(node5)));

    println!("node1: {:?}, node2: {:?}", node1, node2);
}

```

## Summary

| Access Method | Data | Immutable Borrow | Mutable Borrow |
| --- | --- | --- | --- |
| **Single Ownership** | `T` | `&T` | `&mut T` |
| **Single Thread Shared Ownership** | `Rc<T>` | `&Rc<T>` | Cannot get mutable borrow |
| **Single Thread Shared Ownership** | `Rc<RefCell<T>>` | `v.borrow()` | `v.borrow_mut()` |
| **Multiple Thread Shared Ownership** | `Arc<T>` | `&Arc<T>` | Cannot get mutable borrow |
| **Multiple Thread Shared Ownership** | `Arc<Mutex<T>>` | `v.lock()` | `v.lock()` |
| **Multiple Thread Shared Ownership** | `Arc<RwLock<T>>` | `v.read()` | `v.write()` |
- **`Rc`**: Used for single-threaded scenarios requiring multiple ownerships of data.
- **`Arc`**: Provides thread-safe reference counting.
- **`RefCell`**: Allows mutable access to data even if the container is immutable.
- **`Mutex`/`RwLock`**: Used for safe concurrent access to mutable data.

Understanding these tools helps manage Rust's strict ownership rules while balancing performance and safety.

# Lifetimes in Rust

## Introduction to Lifetimes

1. **Static Lifetime**:
    - A value with a lifetime that spans the entire duration of the process is called a static lifetime.
    - Values with static lifetimes have references with static lifetimes, denoted by `'static`.
    - Examples include global variables, static variables, string literals, and heap memory using `Box::leak`.
2. **Dynamic Lifetime**:
    - A value defined within a scope, created on the stack or heap, has a dynamic lifetime.
    - The lifetime of such a value ends when its scope ends.
    - Dynamic lifetimes are denoted by lowercase characters or strings like `'a`, `'b`, or `'hello`.
3. **Memory Allocation**:
    - Memory allocated on the heap and stack has dynamic lifetimes.
    - Global variables, static variables, string literals, and code are compiled into segments like BSS/Data/RoData/Text and loaded into memory, giving them static lifetimes.
    - Function pointers also have static lifetimes as they reside in the Text segment and exist as long as the process is alive.

## How the Compiler Determines Lifetimes

- Rust ensures "borrowed references do not outlive the data they point to." The compiler enforces this through *lifetime analysis*.

## Lifetime Annotations

- Rust allows developers to explicitly annotate lifetimes to help the compiler understand how different references relate to each other.
- **Example**: The `max` function
  
    ```rust
    fn max<'a>(s1: &'a str, s2: &'a str) -> &'a str {
        if s1 > s2 { s1 } else { s2 }
    }
    ```
    
- **Why Lifetimes are Necessary**:
    - When you pass references to a function, the compiler doesn't know the relationship between their lifetimes unless you tell it.
    - Example: In a comparison function `max(&s1, &s2)`, without a lifetime specifier, the compiler can't guarantee that the reference returned from the function is valid.

## Compiler Rules for Inference

- Rust tries to minimize the burden of specifying lifetimes. It automatically infers lifetimes based on several rules:
    1. All reference type parameters have independent lifetimes such as **`'a`**, **`'b`**, etc.
    2. If there’s only one reference in the input, the output borrows that reference's lifetime.
    3. If there’s a `self` reference (for struct methods), Rust assumes the output borrows `self`'s lifetime.

### Multiple Lifetimes in Functions

- When a function takes multiple references as arguments, and they have different lifetimes, Rust can't automatically determine how they relate. Thus, you must manually specify the relationships using lifetime parameters.
- **Example**:
  
    ```rust
    fn max<'a, 'b>(s1: &'a str, s2: &'b str) -> &'??? str // Compilor can't annotate the output lifetime.
    ```
    
    - Here, `'a` and `'b` represent different lifetimes for `s1` and `s2`. We need to explicitly define which lifetime the returned reference should have.

### Case Study: `strtok` Implementation in Rust

Here's a Rust implementation of `strtok()`:

```rust
pub fn strtok(s: &mut &str, delimiter: char) -> &str {
    if let Some(i) = s.find(delimiter) {
        let prefix = &s[..i];
        let suffix = &s[(i + delimiter.len_utf8())..];
        *s = suffix;
        prefix
    } else {
        let prefix = *s;
        *s = "";
        prefix
    }
}

fn main() {
    let s = "hello world".to_owned();
    let mut s1 = s.as_str();
    let hello = strtok(&mut s1, ' ');
    println!("hello is: {}, s1: {}, s: {}", hello, s1, s);
}

```

**Explanation:**

1. **Input Parameters**: The function takes a mutable reference to a string slice (`&mut &str`). This allows the function to mutate the string slice so that it can keep track of which part of the string remains for further tokenization.
2. **Delimiter**: We split the string by the given delimiter (in this case, a `char`), which may span multiple bytes due to UTF-8 encoding.
3. **Finding the Delimiter**: The function looks for the delimiter using `find()`. If it finds one, it creates a `prefix` slice containing everything before the delimiter and a `suffix` slice containing everything after the delimiter.
4. **Modifying the Input**: The original string slice (`s`) is updated to point to the suffix, allowing for subsequent calls to `strtok()` to continue from where the previous one left off.
5. **Return**: The function returns the `prefix` slice, or if no delimiter is found, it returns the entire remaining string and sets the original slice to an empty string.

#### The Problem

If you attempt to compile the above code without any lifetime annotations, you'll encounter a compilation error related to lifetimes. Specifically, Rust's borrow checker cannot automatically deduce the relationships between the lifetimes of the input references and the output reference.

In Rust, each reference has a **lifetime**, and the compiler uses these lifetimes to ensure references are valid. In our case, the input reference `&mut &str` needs a lifetime annotation because the returned string slice `&str` is derived from it.

The compiler will infer lifetimes like this:

- `&mut &str` becomes `&'b mut &'a str`.

This means the `&mut` reference (`'b`) has a different lifetime than the string slice it points to (`'a`). However, the return value is directly related to the lifetime of the original string slice (`'a`), not the `&mut` reference itself.

#### Solution

To resolve this, we need to explicitly annotate the lifetimes. Since the return value is tied to the lifetime of the original string slice (`'a`), we only need to annotate the input reference's `'a` lifetime. Here's how we can fix the code:

```rust
pub fn strtok<'a>(s: &mut &'a str, delimiter: char) -> &'a str {
    if let Some(i) = s.find(delimiter) {
        let prefix = &s[..i];
        let suffix = &s[(i + delimiter.len_utf8())..];
        *s = suffix;
        prefix
    } else {
        let prefix = *s;
        *s = "";
        prefix
    }
}
```

#### Understanding Lifetimes

1. **`'a` Lifetime**: The `'a` lifetime annotation ensures that the returned string slice (`&str`) is valid for as long as the original string slice (`&'a str`) is valid. This guarantees that we don't return a reference that outlives its source.
2. **How Lifetimes Work**: Rust enforces that references must not outlive the data they refer to. Lifetimes are a way of ensuring this by explicitly or implicitly associating references with the data they refer to.
3. **Implicit Lifetime Elision**: In some cases, Rust can automatically infer lifetimes, but in more complex cases like this function, we need to manually annotate them. The compiler uses these annotations to track how long different references remain valid.

## Lifetime in Data Structures

- Structs with references require lifetime annotations, as their fields must live as long as the references they contain.
- **Example**:
  
    ```rust
    struct Employee<'a, 'b> {
        name: &'a str,
        title: &'b str,
        age: u8,
    }
    ```
    
- In this case, the lifetimes of the `name` and `title` fields must be at least as long as the struct’s lifetime. Here, the struct `Employee` contains two string slices, each with its own lifetime (`'a` and `'b`). The lifetimes `'a` and `'b` ensure that the `Employee` struct does not outlive the string slices it refers to.

## Summary

1. **Static and Dynamic Lifetimes**: Lifetimes in Rust can be static or dynamic. Static lifetimes apply to data that lives for the entire duration of the program (e.g., string literals), whereas dynamic lifetimes depend on the scope of variables and the relationships between references.
2. **Borrow Checker**: Rust's borrow checker ensures references are always valid. When references have different lifetimes, the compiler checks whether they are used correctly and ensures that no reference outlives the data it refers to.
3. **Manual Lifetime Annotations**: When automatic lifetime elision doesn't work, developers must manually annotate lifetimes to clarify the relationships between references and ensure correct ownership and borrowing semantics.
4. **Lifetimes in Functions**: In functions, lifetimes are typically added to reference types in parameters and return values. The goal is to express constraints between lifetimes of inputs and outputs so that the compiler can check whether references are valid at runtime.
5. **Lifetimes in Structs**: Structs with references also require lifetime annotations. These lifetimes ensure that the struct itself does not outlive the references it contains.

According to the ownership rules, the lifetime of a value can be determined; it can persist until the owner leaves the scope. However, the lifetime of a reference cannot exceed that of the value. Within the same scope, this is obvious. However, when a function call occurs, the compiler needs to determine the constraints between the lifetimes of parameters and return values through the function’s signature.

In most cases, the compiler can automatically add lifetime constraints based on the rules in the context. If it cannot automatically add them, the developer needs to manually add the constraints. Generally, we only need to determine which parameter’s lifetime is related to the return value. For data structures, when there are internal references, we need to annotate the lifetimes of the references.

By understanding these principles, you'll be able to write safe, efficient Rust code that correctly handles lifetimes and borrowing, avoiding memory issues common in lower-level languages like C or C++.

# Memory Management: The Lifecycle of a Value

Throughout our learning journey, we've delved into ownership and lifetimes in Rust. By now, you should have a solid understanding of Rust’s core concepts in memory management.

Rust solves the problem of managing heap memory safely and efficiently using a unique ownership model, avoiding the need for manual memory management like in C/C++, and without resorting to garbage collection (GC) as in Java or .NET. This also avoids the overhead introduced by runtime systems like GC or reference counting (ARC).

However, the ownership model introduces many new concepts like Move, Copy, Borrow, and lifetime management, making it somewhat challenging to learn. But have you noticed that many of these concepts, such as Copy semantics and value lifetimes, implicitly exist in other languages? Rust simply defines them more explicitly and clearly.

## Memory Management Overview

- **Stack Memory** is very efficient for allocation and deallocation because its size is known at compile-time, but it’s limited in handling values with dynamic size or long lifetimes beyond the scope of a function. That’s where **Heap Memory** comes in.
- Heap memory is flexible, but managing its lifecycle can be problematic in many languages. Different languages handle this in their own ways:
  - **C**: Manual memory management, which can lead to errors.
  - **C++**: Adds smart pointers to help, but still requires some manual control.
  - **Java/DotNet**: Use GC to manage heap memory fully.
- **Rust** ties heap memory’s lifecycle to its corresponding stack memory, eliminating the need for a full-blown runtime like GC. In cases where heap memory needs to outlive the stack, Rust offers mechanisms like *leak* to allow memory to persist beyond scope.

## Value Creation

When you create a value, depending on its nature, it may reside in the **stack** or **heap**. Generally:
  - If the value's size is known at compile time, it goes on the stack.
  - If its size is dynamic or it has a longer required lifetime, it goes on the heap.

## Structs in Rust

When Rust lays out memory for structs, it optimizes their layout for memory alignment and performance. For example, it may rearrange fields in memory (e.g., placing `A, C, B` instead of `A, B, C`) to minimize the performance penalties from misaligned memory accesses. This optimization is automatic, though it can be overridden with the `#[repr]` attribute for interoperability with C code.

## Enums in Rust

Rust's `enum` is a **tagged union**: its size is the size of the largest variant plus the size of the tag. For example:
- A simple `Option` enum (like `Option<u8>`) takes 2 bytes: 1 byte for the tag (indicating `None` or `Some`) and 1 byte for the `u8`.
- A more complex enum like `Result<Vec<u8>, String>` will have a size based on the largest variant plus the tag.

Rust optimizes memory layouts for enums to minimize waste. For instance, if a type like `Option<&u8>` is used, Rust cleverly uses the fact that null pointers (which are never valid in Rust) can be used to represent `None`, without requiring extra space.

## Memory Layout of Rust Data Structures

To better understand the memory footprint of different data structures in Rust, we can run a code example:

```rust
use std::collections::HashMap;
use std::mem::size_of;

enum E {
    A(f64),
    B(HashMap<String, String>),
    C(Result<Vec<u8>, String>),
}

macro_rules! show_size {
    (header) => {
        println!(
            "{:<24} {:>4}    {}    {}",
            "Type", "T", "Option<T>", "Result<T, io::Error>"
        );
        println!("{}", "-".repeat(64));
    };
    ($t:ty) => {
        println!(
            "{:<24} {:4} {:8} {:12}",
            stringify!($t),
            size_of::<$t>(),
            size_of::<Option<$t>>(),
            size_of::<Result<$t, std::io::Error>>(),
        )
    };
}

fn main() {
    show_size!(header);
    show_size!(u8);
    show_size!(f64);
    show_size!(&u8);
    show_size!(Box<u8>);
    show_size!(&[u8]);
    show_size!(String);
    show_size!(Vec<u8>);
    show_size!(HashMap<String, String>);
    show_size!(E);
}
```

The `show_size` macro prints the size of each type, as well as the sizes of `Option` and `Result` variants.

```
Type                        T    Option<T>    Result<T, io::Error>
----------------------------------------------------------------
u8                          1        2           16
f64                         8       16           16
&u8                         8        8           16
Box<u8>                     8        8           16
&[u8]                      16       16           16
String                     24       24           24
Vec<u8>                    24       24           24
HashMap<String, String>    48       48           48
E                          56       56           56
```

Notably, types like `Option<&u8>`, `Box<u8>`, `Vec<u8>`, and `HashMap` don’t consume extra space when used with `Option`, due to Rust’s optimizations. The tag value for `Option` uses the null pointer for `None`, avoiding any overhead for such types. 

This efficient memory layout reduces unnecessary padding and makes Rust's enums memory-efficient.

## Using Values

When you assign or pass values around, Rust differentiates between **Copy** and **Move**. 
- Both involve a shallow bitwise memory copy, but in the case of **Copy**, you can still use the original variable, while in **Move**, you cannot.
- Rust ensures efficient copying and moving, especially for small values like primitive types and stack pointers to heap data.

For large data structures like arrays, moving them around could be inefficient. Instead, Rust often recommends passing by reference (`&`) to avoid deep copying.

Rust's data structures like `Vec` and `String` dynamically grow as needed during use. But if memory becomes too large for the data held, methods like `shrink_to_fit` can be used to reduce memory usage.

## Destroying Values

When a value goes out of scope, Rust automatically drops it using the **Drop trait**. This is similar to a destructor in object-oriented languages. Rust will recursively drop fields within structs or elements in collections.

For complex structures like `structs` or collections (`HashMap`, `Vec`), Rust ensures that all inner elements are dropped properly and safely.

### Heap Memory Release

Rust’s ownership model ensures that memory is released safely without needing to worry about double frees or memory leaks. Since values can only have one owner, the process of memory release is straightforward.

Other languages often rely on garbage collection or manual memory management, which can lead to complex and error-prone systems. Rust simplifies this by ensuring clear ownership and efficient memory usage.

### Example: File Resource Management

Rust’s `Drop trait` isn’t limited to just memory management. It can also be used to release other resources, like file handles, sockets, or locks. For example, when you create a file and write data to it in Rust, the file will automatically be closed when it goes out of scope, without needing an explicit `close()` call:

```rust
use std::fs::File;
use std::io::prelude::*;
fn main() -> std::io::Result<()> {
    let mut file = File::create("foo.txt")?;
    file.write_all(b"hello world")?;
    Ok(())
}
```

Other languages like Java or Python typically require explicit resource management calls like `close()`, but Rust’s ownership model ensures resources are released automatically when they are no longer needed.

## Conclusion

We’ve explored Rust’s memory management, from value creation to usage and destruction. Rust’s memory layout and ownership model provide both performance and safety by managing memory more explicitly. Understanding where values reside (stack vs. heap), how data structures like `Vec` and `String` manage memory, and how Rust automates resource cleanup (without a runtime like GC) can help you write more efficient, safe, and clear Rust code.

Lastly, a quick question: How much memory does `Result<String, ()>` occupy, and why?

# Type System in Rust

## Introduction to Type Systems

The type system is a core component of a programming language, largely shaping the user experience and the safety of the programs written in that language. In the world of machine code, without types, instructions only deal with immediate values or memory, and data stored in memory are just byte streams.

Thus, the type system can be viewed as a tool for the compiler to perform static checks on data at compile time or for the language to perform dynamic checks at runtime, ensuring that the data being operated on matches the expected type.

This explains why Rust has strict type checks that often result in compilation errors.

## Basic Concepts and Classifications of Type Systems

Before diving into Rust's type system, let’s clarify some concepts related to type systems to ensure we’re on the same page.

As mentioned in Lecture 2, a type distinguishes values and includes information about the length, alignment in memory, and allowable operations of those values.

For instance, the `u32` type represents an unsigned 32-bit integer, occupying 4 bytes, with an alignment of 4 bytes, and a value range from 0 to 4G. It supports operations like addition, subtraction, and comparisons, allowing expressions like `1 + 2` or `i <= 3`.

A type system is essentially a system for defining, checking, and manipulating types. Based on different operational phases, types can be categorized in various ways:

1. **Strong vs. Weak Typing**: Strongly typed languages (like Rust) do not allow implicit type conversions, while weakly typed languages (like C/C++ and JavaScript) do.
  
2. **Static vs. Dynamic Typing**: This is based on when type checks occur—either at compile time (static) or runtime (dynamic). Static systems can be further divided into explicit static (like Rust, Java, Swift) and implicit static (like Haskell).

3. **Polymorphism**: A vital concept in type systems. In dynamic systems, polymorphism is achieved through duck typing, while in static systems, it can be realized through:
   - **Parametric Polymorphism**: Code operates on a type that meets certain constraints rather than a specific type.
   - **Ad-hoc Polymorphism**: The same behavior can have multiple implementations (e.g., function overloading).
   - **Subtype Polymorphism**: Subtypes can be treated as their parent type.

In Rust, parametric polymorphism is supported through generics, ad-hoc polymorphism through traits, and subtype polymorphism through trait objects.

## Rust's Type System

Now that we have a grasp of basic concepts and classifications, let's examine Rust's type system. 

In terms of the previous classifications, Rust does not allow implicit type conversions, making it a strongly typed language. It employs a static type system that ensures type correctness at compile time, meaning Rust is both strongly and statically typed, contributing to its type safety.

### Understanding Type Safety

Type safety ensures that code can only access memory in ways that are permitted, based on the types involved. For example, if you have an array of `u64` data of length 4, any access must occur within the array's bounds, and only operations permitted for `u64` types can be performed.

Weakly typed languages like C/C++ may allow implicit conversions, potentially leading to unsafe memory access or incorrect data reads. In contrast, Rust's strict type system avoids these pitfalls.

Rust also separates read and write access to memory, enforcing stricter controls on memory safety, meaning code can only access authorized memory using permitted methods and permissions.

In Rust, all expressions have types, making types ubiquitous in the language.

### Unit Type

You may wonder about expressions without explicit types, like:

```rust
if has_work {
    do_something();
}
```

In Rust, the return type of a scope, whether it's an if-else block or a function, is the type of the last expression evaluated. If no value is returned, the return type defaults to the unit type `()`, which has a single value of `()`.

The unit type is widely used, for example, in error handling like `Result<(), Error>` where only errors are of concern, or in data structures like `HashSet`, which is essentially a type alias for `HashMap<K, ()>`.

## Data Types in Rust

Rust's primitive types include characters, integers, floating-point numbers, booleans, arrays, tuples, slices, pointers, references, and functions. The Rust standard library also supports rich composite types.

You can create your own composite types using structs and enums, which have been covered in earlier lessons.

## Type Inference

As a static type system, Rust can guarantee type safety at compile time, but explicit type annotations can be tedious. Rust's type inference allows it to deduce types based on variable usage context, reducing the need for explicit annotations.

For example, consider the following code snippet that creates a `BTreeMap`:

```rust
use std::collections::BTreeMap;

fn main() {
    let mut map = BTreeMap::new();
    map.insert("hello", "world");
    println!("map: {:?}", map);
}
```

Here, the Rust compiler infers that the keys and values of the `BTreeMap` are string references. However, if you remove the `insert` statement, the compiler will raise an error indicating it cannot infer the type for parameter `K`.

In some situations, explicit type declarations are necessary. For example:

```rust
let even_numbers: Vec<_> = numbers.into_iter().filter(|n| n % 2 == 0).collect();
```

This way, you can still leverage type inference for the inner types.

## Using Generics for Parametric Polymorphism

Rust uses generics to avoid requiring developers to write multiple implementations for different types. Generics include both generic data structures and generic functions.

### Generic Data Structures

Rust supports generics in data structures, enhancing code reuse. For example, the `Option` enum allows for a type parameter `T`:

```rust
enum Option<T> {
    Some(T),
    None,
}
```

### Generic Functions

Similarly, functions can use generics. For example:

```rust
fn id<T>(x: T) -> T {
    x
}
```

The Rust compiler applies monomorphization, generating multiple versions of the function for each specific type used.

### Summary of Generics

We introduced the basic concepts of type systems and the specifics of Rust's type system. We discussed the characteristics of Rust, including its attributes, data structures, type inference, and support for generics.

In Rust:
- It is a strong, static, explicit type system.
- Type inference reduces the need for type annotations.
- Generics provide a robust way to implement parametric polymorphism.

In the next lecture, we will cover ad-hoc polymorphism and subtype polymorphism.

## Discussion

Consider the following code that fails to compile. Can you modify it to work correctly?

```rust
use std::io::{BufWriter, Write};
use std::net::TcpStream;

#[derive(Debug)]
struct MyWriter<W> {
    writer: W,
}

impl<W: Write> MyWriter<W> {
    pub fn new(addr: &str) -> Self {
        let stream = TcpStream::connect("127.0.0.1:8080").unwrap();
        Self {
            writer: BufWriter::new(stream),
        }
    }

    pub fn write(&mut self, buf: &str) -> std::io::Result<()> {
        self.writer.write_all(buf.as_bytes())
    }
}

fn main() {
    let writer = MyWriter::new("127.0.0.1:8080");
    writer.write("hello world!");
}
```

### Method 1

The `MyWriter::new` method does not return a specific `MyWriter` instance because `MyWriter<W>` requires a generic parameter `W`. Although a `BufWriter<TcpStream>` is created inside the method, `MyWriter::new` does not explicitly inform the compiler of the concrete type for `W`, leading to a compilation failure.

In the corrected code, passing `BufWriter::new(stream)` as an argument to the `new` method explicitly specifies the type for `W`, allowing the compiler to construct the `MyWriter` instance correctly. Here’s the revised code:

```rust
use std::io::{BufWriter, Write};
use std::net::TcpStream;

#[derive(Debug)]
struct MyWriter<W> {
    writer: W,
}

impl<W: Write> MyWriter<W> {
    pub fn new(writer: W) -> Self {
        Self { writer }
    }

    pub fn write(&mut self, buf: &str) -> std::io::Result<()> {
        self.writer.write_all(buf.as_bytes())
    }
}

fn main() -> std::io::Result<()> {
    let stream = TcpStream::connect("127.0.0.1:8080")?;
    let mut writer = MyWriter::new(BufWriter::new(stream));
    writer.write("hello world!")?;
    Ok(())
}
```

This correction ensures that the `MyWriter` constructor accepts any object implementing the `Write` trait, and it creates the `TcpStream` and `BufWriter` in the `main` function.

### Method 2

The reason the original code does not compile is that in `MyWriter::new`, the return type is `Self`, but `Self`’s generic parameter `W` needs to be explicitly defined during the call. Here, `W` is implicitly defined as a type implementing the `Write` trait, but since `BufWriter` wraps a `TcpStream`, you need to specify `W` explicitly.

The solution is to fix the generic type to `BufWriter<TcpStream>` for `MyWriter`. The implementation of `MyWriter` is fixed to use `BufWriter<TcpStream>`, avoiding generic inference issues. You can modify the code as follows to compile successfully:

```rust
use std::io::{BufWriter, Write};
use std::net::TcpStream;

#[derive(Debug)]
struct MyWriter<W> {
    writer: W,
}

impl MyWriter<BufWriter<TcpStream>> {
    pub fn new(addr: &str) -> Self {
        let stream = TcpStream::connect(addr).unwrap();
        Self {
            writer: BufWriter::new(stream),
        }
    }

    pub fn write(&mut self, buf: &str) -> std::io::Result<()> {
        self.writer.write_all(buf.as_bytes())
    }
}

fn main() {
    let mut writer = MyWriter::new("127.0.0.1:8080");
    writer.write("hello world!").unwrap();
}
```

### Comparison of the Two Methods

Both methods address the same issue: the compiler needs to know the specific type of the generic parameter. However, they differ in their approach regarding **generic parameter usage** and **flexibility**.

#### Method 1
```rust
impl<W: Write> MyWriter<W> {
    pub fn new(writer: W) -> Self {
        Self { writer }
    }
}
```
**Characteristics:**
1. **Generic Flexibility**: This approach allows `MyWriter` to accept any type implementing the `Write` trait, enhancing code reusability with types like `File`, `Vec<u8>`, etc.
2. **Constructor Flexibility**: The `MyWriter::new` method can take any compatible object, making the code more general-purpose.
3. **User-Controlled Creation**: Users create the `TcpStream` and wrap it in a `BufWriter` before passing it to `MyWriter`, providing greater flexibility.

#### Method 2
```rust
impl MyWriter<BufWriter<TcpStream>> {
    pub fn new(addr: &str) -> Self {
        let stream = TcpStream::connect(addr).unwrap();
        Self {
            writer: BufWriter::new(stream),
        }
    }
}
```
**Characteristics:**
1. **Fixed Generic Type**: The generic parameter is constrained to `BufWriter<TcpStream>`, limiting its applicability to this specific combination.
2. **Encapsulated Construction**: `MyWriter::new` directly handles the creation of `TcpStream`, simplifying the user experience.
3. **Simplified Invocation**: Users only need to pass an address string to `MyWriter::new`, hiding the complexity of stream construction.

#### Summary Comparison:

| Aspect            | Method 1 (Flexible Generics)                          | Method 2 (Fixed Generics)                           |
|-------------------|------------------------------------------------------|----------------------------------------------------|
| **Generic Flexibility** | High: Accepts any type implementing `Write`       | Low: Only accepts `BufWriter<TcpStream>`           |
| **Usage Complexity**   | User creates and passes the `Write` object          | `MyWriter` constructs and encapsulates the stream   |
| **Suitable Scenarios** | Ideal for reusable code needing multiple `Write` types | Best for simple use cases targeting a specific stream |
| **Code Control**      | User decides how to create the `Write` object       | `MyWriter` controls all construction details        |
| **Call Simplicity**   | Requires user to set up the object first             | Simplified call with only an address string         |

#### Which Method is Better?
- **Method 1** is more flexible, suitable for scenarios requiring extensibility (e.g., supporting multiple output types). It offers users more control but increases complexity.
- **Method 2** is simpler and easier to use, suitable for cases that don’t need extra extensibility. It focuses on a specific use case, hiding complexity from the user.

The choice between the two methods depends on the desired balance between flexibility and simplicity.

## References

For insights on how various languages handle generics, refer to this resource: [Models of Generics and Metaprogramming: Go, Rust, Swift, D and More](https://thume.ca/2019/07/14/a-tour-of-metaprogramming-models-for-generics/).


# Type System: Using Traits to Define Interfaces

Hello, I'm Chen Tian.

In our previous lesson, we gained insights into the essence of Rust's type system. The type system acts as a tool for defining, checking, and managing types, ensuring that the data types we are working with for operations are as expected.

With Rust's powerful support for generics, we can conveniently define and use generic data structures and functions, enhancing the flexibility of input and output types and improving code reuse.

Today, we'll delve into two other forms of polymorphism: ad-hoc polymorphism and subtype polymorphism, exploring their purposes, implementations, and uses.

## Recap of Polymorphism Types

- **Ad-hoc Polymorphism**: This includes operator overloading, where the same operation has different implementations.
- **Subtype Polymorphism**: Using a subtype as a supertype, such as treating a `Cat` as an `Animal`.

Both forms of polymorphism in Rust are closely tied to traits, so we'll first understand what traits are and how to use them for these types of polymorphism.

## What are Traits?

Traits are Rust's way of defining interfaces, specifying the behaviors that types using these interfaces must implement. You can think of traits as akin to interfaces in Java, protocols in Swift, or type classes in Haskell.

In complex system development, it’s crucial to separate interfaces from implementations. This design principle isolates callers from implementers, allowing them to develop independently as long as they adhere to the interface.

Traits enable us to extract behaviors from data structures, allowing shared behavior across multiple types. They can also serve as constraints in generic programming, ensuring that parameterized types adhere to specified behaviors.

## Basic Traits

Let’s look at how to define a basic trait, using the `std::io::Write` trait from the standard library as an example. This trait outlines a set of method signatures:

```rust
pub trait Write {
    fn write(&mut self, buf: &[u8]) -> Result<usize>;
    fn flush(&mut self) -> Result<()>;
    // Other methods with default implementations...
}
```

Methods in traits can have default implementations, meaning you only need to implement specific methods, while others come with a default behavior.

When defining methods, you’ll notice the keywords `Self` and `self`:
- **Self**: Represents the type implementing the trait.
- **self**: Used as the first parameter in methods (e.g., `&self` or `&mut self`).

To better understand this, let’s implement a `BufBuilder` struct that conforms to the `Write` trait.

```rust
use std::fmt;
use std::io::Write;

struct BufBuilder {
    buf: Vec<u8>,
}

impl BufBuilder {
    pub fn new() -> Self {
        Self {
            buf: Vec::with_capacity(1024),
        }
    }
}

// Implement Debug for BufBuilder
impl fmt::Debug for BufBuilder {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", String::from_utf8_lossy(&self.buf))
    }
}

impl Write for BufBuilder {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.buf.extend_from_slice(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn main() {
    let mut buf = BufBuilder::new();
    buf.write_all(b"Hello world!").unwrap();
    println!("{:?}", buf);
}
```

Here, we implemented `write` and `flush`, using default implementations for the rest. Once a type implements a trait, all methods in that trait become available.

## Basic Trait Exercise

Now, let’s define a trait to solidify our understanding. We’ll create a `Parse` trait for a string parser that converts parts of a string into a specific type.

```rust
pub trait Parse {
    fn parse(s: &str) -> Self;
}
```

Next, we can implement the `Parse` trait for `u8`, where it extracts numbers from a string.

```rust
use regex::Regex;

impl Parse for u8 {
    fn parse(s: &str) -> Self {
        let re: Regex = Regex::new(r"^[0-9]+").unwrap();
        if let Some(captures) = re.captures(s) {
            captures
                .get(0)
                .map_or(0, |s| s.as_str().parse().unwrap_or(0))
        } else {
            0
        }
    }
}

#[test]
fn parse_should_work() {
    assert_eq!(u8::parse("123abc"), 123);
    assert_eq!(u8::parse("abcd"), 0);
}
```

### Enhancing Code Reusability

To reduce code duplication for types like `f64`, we can leverage generics and traits. We need to impose constraints that ensure types can be parsed.

1. The type must implement the `FromStr` trait.
2. The type must also implement the `Default` trait for handling unparseable strings.

Here’s a more generic `Parse` trait implementation:

```rust
use std::str::FromStr;
use regex::Regex;

pub trait Parse {
    fn parse(s: &str) -> Self;
}

impl<T> Parse for T
where
    T: FromStr + Default,
{
    fn parse(s: &str) -> Self {
        let re: Regex = Regex::new(r"^[0-9]+(\.[0-9]+)?").unwrap();
        let d = || Default::default();
        if let Some(captures) = re.captures(s) {
            captures
                .get(0)
                .map_or(d(), |s| s.as_str().parse().unwrap_or(d()))
        } else {
            d()
        }
    }
}
```

### Returning Results Instead of Defaults

To handle parsing errors better, we can modify our trait to return a `Result`, allowing us to define an associated error type.

```rust
pub trait Parse {
    type Error;
    fn parse(s: &str) -> Result<Self, Self::Error>;
}

impl<T> Parse for T
where
    T: FromStr + Default,
{
    type Error = String;

    fn parse(s: &str) -> Result<Self, Self::Error> {
        let re: Regex = Regex::new(r"^[0-9]+(\.[0-9]+)?").unwrap();
        if let Some(captures) = re.captures(s) {
            captures
                .get(0)
                .map_or(Err("failed to capture".to_string()), |s| {
                    s.as_str()
                        .parse()
                        .map_err(|_| "failed to parse captured string".to_string())
                })
        } else {
            Err("failed to parse string".to_string())
        }
    }
}
```

## Generic Traits

We can also define a `Concat` trait that allows concatenation of various types, showcasing the utility of generics in traits. The `std::ops::Add` trait is a good example of this:

```rust
pub trait Add<Rhs = Self> {
    type Output;
    fn add(self, rhs: Rhs) -> Self::Output;
}
```

### Implementing Add for Complex Numbers

Let’s define a `Complex` struct and implement the `Add` trait:

```rust
use std::ops::Add;

#[derive(Debug)]
struct Complex {
    real: f64,
    imagine: f64,
}

impl Add for Complex {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        let real = self.real + rhs.real;
        let imagine = self.imagine + rhs.imagine;
        Self { real, imagine }
    }
}

fn main() {
    let c1 = Complex { real: 1.0, imagine: 1.0 };
    let c2 = Complex { real: 2.0, imagine: 3.0 };
    println!("{:?}", c1 + c2);
}
```

### Reference Implementations

To avoid moving ownership, we can implement the `Add` trait for `&Complex`:

```rust
impl Add for &Complex {
    type Output = Complex;

    fn add(self, rhs: Self) -> Self::Output {
        Complex {
            real: self.real + rhs.real,
            imagine: self.imagine + rhs.imagine,
        }
    }
}
```

## Trait Inheritance in Rust

In Rust, one trait can "inherit" associated types and methods from another trait. For instance, if we define `trait B: A`, any type `T` implementing `trait B` must also implement `trait A`. This allows `trait B` to utilize associated types and methods from `trait A`.

Trait inheritance is useful for extending the capabilities of traits. Many common traits leverage this, such as `AsyncWriteExt` in the Tokio library and `StreamExt` in the futures library. For example, `StreamExt` provides default implementations of its methods, which are available to all types that implement the `Stream` trait:

```rust
impl<T: ?Sized> StreamExt for T where T: Stream {}
```

Thus, if you implement the `Stream` trait, you can directly use methods from `StreamExt`, which is very convenient.

### Summary of Traits

At this point, we have covered the basics of traits. To summarize:

- **Traits as Abstractions**: Traits serve as abstractions for similar behaviors across different data structures.
- **Associated Types**: When behavior is tied to specific data, like the `Parse` trait for string parsing, associated types allow for flexibility in defining the types related to behavior until the trait is implemented.
- **Generic Traits**: The same trait behavior can have multiple implementations for the same type, such as with the `From` trait, utilizing generics.
  
Rust's traits can be likened to a Swiss Army knife, accommodating a variety of scenarios requiring interface definitions.

Special polymorphism involves different implementations of the same behavior. By defining a trait and implementing it for various types, we achieve this polymorphism. The `Add` trait is a classic example, offering different handling for addition operations based on the types involved. The `Service` trait represents a less obvious case, where different handling occurs based on varying web request URLs.

This comprehensive approach demonstrates the versatility and power of traits in Rust, allowing for clean and flexible code design.

# Dynamic Dispatch in Rust

## Understanding Subtype Polymorphism

Strictly speaking, subtype polymorphism is often considered a feature of object-oriented languages. If an object `A` is a subclass of object `B`, then an instance of `A` can be used in any context where an instance of `B` is expected. For example, both cats and dogs are animals, so if a function requires an animal, it can accept either a cat or a dog.

Although Rust does not have classes and subclasses, it can achieve a similar relationship between traits and the types that implement those traits. Here's a demonstration:

```rust
struct Cat;
struct Dog;

trait Animal {
    fn name(&self) -> &'static str;
}

impl Animal for Cat {
    fn name(&self) -> &'static str {
        "Cat"
    }
}

impl Animal for Dog {
    fn name(&self) -> &'static str {
        "Dog"
    }
}

fn name(animal: impl Animal) -> &'static str {
    animal.name()
}

fn main() {
    let cat = Cat;
    println!("cat: {}", name(cat));
}
```

In this example, `impl Animal` is a shorthand for `T: Animal`, meaning the `name` function can accept any type that implements the `Animal` trait. This leads to static dispatch, where the specific types are determined at compile time.

## Dynamic Dispatch

Static dispatch is efficient, but in many cases, the type cannot be determined at compile time. For instance, when writing a formatting tool, you might define a `Formatter` trait with various implementations:

```rust
pub trait Formatter {
    fn format(&self, input: &mut String) -> bool;
}

struct MarkdownFormatter;
impl Formatter for MarkdownFormatter {
    fn format(&self, input: &mut String) -> bool {
        input.push_str("\nformatted with Markdown formatter");
        true
    }
}

struct RustFormatter;
impl Formatter for RustFormatter {
    fn format(&self, input: &mut String) -> bool {
        input.push_str("\nformatted with Rust formatter");
        true
    }
}

struct HtmlFormatter;
impl Formatter for HtmlFormatter {
    fn format(&self, input: &mut String) -> bool {
        input.push_str("\nformatted with HTML formatter");
        true
    }
}
```

The specific formatting method may only be known at runtime when the file is opened and its contents analyzed. Furthermore, a file might require multiple formatting tools.

If you use a `Vec` to hold all necessary formatters, how do you define the type for the `formatters` parameter?

```rust
pub fn format(input: &mut String, formatters: Vec(???)) {
    for formatter in formatters {
        formatter.format(input);
    }
}
```

Since `Vec<>` requires consistent types, and here we cannot provide a single concrete type, we use a trait object, denoted as `&dyn Trait` or `Box<dyn Trait>`. The `dyn` keyword helps indicate that what follows is a trait.

Thus, the code can be rewritten as:

```rust
pub fn format(input: &mut String, formatters: Vec<&dyn Formatter>) {
    for formatter in formatters {
        formatter.format(input);
    }
}
```

This allows runtime construction of a list of formatters to be passed to the `format` function, enabling dynamic dispatch.

## Mechanism of Trait Objects

When using a trait for dynamic dispatch, a specific type reference can be assigned to `&Formatter`. For example, assigning a reference to `HtmlFormatter` creates a trait object, which consists of a "fat pointer." This fat pointer contains one pointer to the data and another to a virtual function table (vtable).

The vtable is a static table generated by Rust during compilation, containing information about the concrete type, such as size, alignment, and a series of function pointers for the methods supported by the interface, such as `format()`.

When `formatter.format()` is called at runtime, the method can be located via the vtable, enabling the specific implementation to be executed.

### Object Safety in Trait Objects

Not all traits can produce trait objects. A trait must be object-safe to be used as a trait object. A trait is object-safe if all its methods satisfy the following conditions:

1. The return type cannot be `Self`.
2. The method cannot have any generic parameters.

This requirement exists because, when using a trait object, the concrete type of the trait is unknown. If a method returns `Self`, there is ambiguity since the specific type is not available. For example, the `Clone` trait cannot generate a trait object because its `clone()` method returns `Self`.

Similarly, traits with generic parameters cannot produce trait objects because generics require type information known at compile time, while trait objects are resolved at runtime.

## Understanding `vtable` in Rust

Some may wonder why I say that "a vtable is generated for each type's implementation of every trait." While this isn't explicitly mentioned in any public documentation, we can explore this data structure by printing its address to track its behavior. Below is a code snippet that you can run to deepen your understanding of `vtable`.

### Demo Code

```rust
use std::fmt::{Debug, Display};
use std::mem::transmute;

fn main() {
    let s1 = String::from("hello world!");
    let s2 = String::from("goodbye world!");
    
    // Creating Display/Debug trait objects for s1
    let w1: &dyn Display = &s1;
    let w2: &dyn Debug = &s1;

    // Creating Display/Debug trait objects for s2
    let w3: &dyn Display = &s2;
    let w4: &dyn Debug = &s2;

    // Unsafe transmute to get addresses of the trait objects and their vtables
    let (addr1, vtable1): (usize, usize) = unsafe { transmute(w1) };
    let (addr2, vtable2): (usize, usize) = unsafe { transmute(w2) };
    let (addr3, vtable3): (usize, usize) = unsafe { transmute(w3) };
    let (addr4, vtable4): (usize, usize) = unsafe { transmute(w4) };

    // Print the addresses of s1, s2, and the main function
    println!(
        "s1: {:p}, s2: {:p}, main(): {:p}",
        &s1, &s2, main as *const ()
    );
    
    // Print addresses of the trait objects and their vtables
    println!("addr1: 0x{:x}, vtable1: 0x{:x}", addr1, vtable1);
    println!("addr2: 0x{:x}, vtable2: 0x{:x}", addr2, vtable2);
    println!("addr3: 0x{:x}, vtable3: 0x{:x}", addr3, vtable3);
    println!("addr4: 0x{:x}, vtable4: 0x{:x}", addr4, vtable4);

    // Assert that the pointers to the same data are equal
    assert_eq!(addr1, addr2);
    assert_eq!(addr3, addr4);

    // Assert that the vtables for the same type and trait are equal
    // Here both are String + Display
    assert_eq!(vtable1, vtable3);
    // Here both are String + Debug
    assert_eq!(vtable2, vtable4);
}
```

This example illustrates how Rust manages trait objects and the underlying `vtable` mechanism. By examining the addresses, you can see that Rust creates a separate vtable for each type's implementation of each trait, reinforcing the type system's flexibility and power.


## Summary

We have covered the definition and usage of traits, including basic traits, associated types, and generic traits. We reviewed how traits enable static dispatch and how trait objects facilitate dynamic dispatch.

Trait objects can be thought of as a powerful tool in Rust, allowing developers to define behaviors abstractly and implement them flexibly.

## Discussion
   
1. Does the following code compile? Why or why not?

```rust
use std::{fs::File, io::Write};
fn main() {
    let mut f = File::create("/tmp/test_write_trait").unwrap();
    let w: &mut dyn Write = &mut f;
    w.write_all(b"hello ").unwrap();
    let w1 = w.by_ref();
    w1.write_all(b"world").unwrap();
}
```

The error occurs because the `by_ref` method requires the type to be `Sized`, but `dyn Write` is a trait object and doesn't have a known size at compile time. Trait objects in Rust do not implement the `Sized` trait, which means you can't use methods that require `Self: Sized` on them. Here’s how you can adjust your code:

```rust
use std::{fs::File, io::Write};
fn main() {
    let mut f = File::create("/tmp/test_write_trait").unwrap();
    let w: &mut dyn Write = &mut f;
    w.write_all(b"hello ").unwrap();
    let w1 = f.by_ref();
    w1.write_all(b"world").unwrap();
}
```

This way, you avoid the trait object and maintain the ability to call `by_ref`.

2. For those interested, the `Iterator` trait in Rust includes an associated type `Item` and a `next()` method that must be implemented. The `next()` method should return `Some(Item)` if another value is available, or `None` if not. Read the following code and consider how to implement the `SentenceIter` iterator:

```rust
struct SentenceIter<'a> {
    s: &'a mut &'a str,
    delimiter: char,
}

impl<'a> SentenceIter<'a> {
    pub fn new(s: &'a mut &'a str, delimiter: char) -> Self {
        Self { s, delimiter }
    }
}

impl<'a> Iterator for SentenceIter<'a> {
    type Item; // Consider what type Item should be

    fn next(&mut self) -> Option<Self::Item> {
        // Implement next method to make the following test pass
        todo!()
    }
}

#[test]
fn it_works() {
    let mut s = "This is the 1st sentence. This is the 2nd sentence.";
    let mut iter = SentenceIter::new(&mut s, '.');
    assert_eq!(iter.next(), Some("This is the 1st sentence."));
    assert_eq!(iter.next(), Some("This is the 2nd sentence."));
    assert_eq!(iter.next(), None);
}

fn main() {
    let mut s = "a。 b。 c";
    let sentences: Vec<_> = SentenceIter::new(&mut s, '。').collect();
    println!("sentences: {:?}", sentences);
}
```
To implement the `SentenceIter` iterator for splitting a string into sentences based on a delimiter, you'll need to define the associated type `Item` and implement the `next()` method. Here's how you can do it:

**Define `Item`**: The type of each item returned by the iterator should be a `String` (or a string slice `&str`).

**Implement `next()`**: In the `next()` method, you'll need to find the next sentence in the string, update the internal state, and return the found sentence.

Here's the complete code:

```rust
struct SentenceIter<'a> {
    s: &'a mut &'a str,
    delimiter: char,
}

impl<'a> SentenceIter<'a> {
    pub fn new(s: &'a mut &'a str, delimiter: char) -> Self {
        Self { s, delimiter }
    }
}

impl<'a> Iterator for SentenceIter<'a> {
    type Item = String; // The type returned by the iterator

    fn next(&mut self) -> Option<Self::Item> {
        // Check if there's any string left to process
        if self.s.is_empty() {
            return None; // No more sentences
        }

        // Find the position of the delimiter
        if let Some(pos) = self.s.find(self.delimiter) {
            // Split the string at the delimiter
            let sentence = &self.s[..pos + 1];
            *self.s = &self.s[pos + 1..]; // Update self.s to point to the rest of the string
            Some(sentence.trim().to_string()) // Return the sentence as a String
        } else {
            // No more delimiters, return the rest of the string
            let sentence = std::mem::take(self.s); // Take ownership of the remaining string
            *self.s = ""; // Clear the string reference
            Some(sentence.trim().to_string()) // Return the last sentence
        }
    }
}

#[test]
fn it_works() {
    let mut s = "This is the 1st sentence. This is the 2nd sentence.";
    let mut iter = SentenceIter::new(&mut s, '.');
    assert_eq!(iter.next(), Some("This is the 1st sentence.".to_string()));
    assert_eq!(iter.next(), Some("This is the 2nd sentence.".to_string()));
    assert_eq!(iter.next(), None);
}

fn main() {
    let mut s = "a。 b。 c";
    let sentences: Vec<_> = SentenceIter::new(&mut s, '。').collect();
    println!("sentences: {:?}", sentences);
}
```
- **`next()` Method**:
  - Checks if there are any characters left in the string.
  - If a delimiter is found, it splits the string, updates `self.s`, and returns the trimmed sentence.
  - If no delimiter is found, it takes the remaining string, clears `self.s`, and returns it.


## Additional Reading

When using traits, two important considerations arise:

1. **Orphan Rule**: At least one of either the trait or the implementing type must be defined in the current crate. You cannot implement a trait for a type that is defined in another crate unless you also defined the trait.
  
2. **Async Functions in Traits**: There is currently no standardized way to implement async functions in traits. If you are interested, refer to the `async_trait` crate, which allows for seamless integration of async functions in trait implementations. However, using `async_trait` incurs an additional heap allocation on each call, but this is often acceptable for most applications.

# Key Traits to Master

When developing software systems, it's crucial to clarify requirements and conduct architectural analysis and design. During this process, appropriately defining and using traits can enhance the extensibility of the code structure, making the system highly flexible.

Previously, in the "Get Hands Dirty" series, we briefly explored the immense power of traits, using the `From` and `TryFrom` traits for type conversion (in Lecture 5), and the `Deref` trait (in Lecture 6) to allow access to methods of internal structures without exposing their implementation. 

With your growing understanding of traits from the previous lectures, you'll find that effectively using these traits can lead to clearer code structures that align with Rust's ecosystem practices. For instance, if a data structure implements the `Debug` trait, you can easily print it using the `{:?}` formatter; if it implements `From`, you can directly use the `into()` method for type conversion.

## Traits

The Rust standard library defines a wealth of standard traits. Let’s enumerate some you may already know:

- **Clone/Copy**: Define deep and shallow copy behaviors.
- **Read/Write**: Specify I/O read/write behaviors.
- **Iterator**: Specify iterator behaviors.
- **Debug**: Define how data should be displayed for debugging.
- **Default**: Define how to generate a default value for a type.
- **From/TryFrom**: Specify how types convert between each other.

We will also learn about several other essential traits related to memory allocation and deallocation, marker traits for type safety, operator traits, and those for formatting (Debug/Display/Default).

## Memory-Related Traits: Clone/Copy/Drop

Let’s dive into memory-related traits: `Clone`, `Copy`, and `Drop`. We’ve touched on these when discussing ownership, but now we’ll explore their definitions and use cases in more depth.

### Clone Trait

Here’s the definition of the `Clone` trait:

```rust
pub trait Clone {
    fn clone(&self) -> Self;

    fn clone_from(&mut self, source: &Self) {
        *self = source.clone()
    }
}
```

The `Clone` trait has two methods: `clone()` and `clone_from()`, with the latter having a default implementation, allowing you to typically only implement `clone()`. You might wonder about the utility of `clone_from()`. While `a.clone_from(&b)` seems equivalent to `a = b.clone()`, the former avoids unnecessary memory allocation, enhancing efficiency if `a` already exists.

You can derive `Clone` using the `#[derive(Clone)]` macro, simplifying your code. For instance, consider the following `Developer` struct and `Language` enum:

```rust
#[derive(Clone, Debug)]
struct Developer {
    name: String,
    age: u8,
    lang: Language,
}

#[derive(Clone, Debug)]
enum Language {
    Rust,
    TypeScript,
    Elixir,
    Haskell,
}

fn main() {
    let dev = Developer {
        name: "Tyr".to_string(),
        age: 18,
        lang: Language::Rust,
    };
    let dev1 = dev.clone();
    println!("dev: {:?}, addr of dev name: {:p}", dev, dev.name.as_str());
    println!("dev1: {:?}, addr of dev1 name: {:p}", dev1, dev1.name.as_str());
}
```

If `Language` does not implement `Clone`, attempting to derive `Clone` for `Developer` will result in a compilation error. When you run this code, you’ll see that the `String` type's heap memory is also cloned, indicating that `Clone` performs a deep copy.

### Copy Trait

In contrast to `Clone`, the `Copy` trait is a marker trait without any additional methods. Its definition is as follows:

```rust
pub trait Copy: Clone {}
```

To implement the `Copy` trait, a type must first implement `Clone`, followed by implementing an empty `Copy` trait. You might question the utility of such a trait; however, it serves as a trait bound for type safety checks.

Like `Clone`, if all fields in a structure implement `Copy`, you can derive it using `#[derive(Copy)]`. For instance, modifying the previous code to include `Copy`:

```rust
#[derive(Clone, Copy, Debug)]
struct Developer {
    name: String,
    age: u8,
    lang: Language,
}

#[derive(Clone, Copy, Debug)]
enum Language {
    Rust,
    TypeScript,
    Elixir,
    Haskell,
}
```

This code will fail to compile because `String` does not implement `Copy`. Therefore, the `Developer` struct can only be cloned, not copied. If a type implements `Copy`, it will be copied during assignment and function calls; otherwise, ownership will be transferred.

You might wonder why immutable references implement `Copy`, while mutable references (`&mut T`) do not. If mutable references could implement `Copy`, it would violate ownership rules, allowing multiple mutable references in the same scope. Rust's standard library carefully considers which structures can be `Copy` and which cannot.

### Drop Trait

We previously discussed the `Drop` trait in the context of memory management. Its definition is as follows:

```rust
pub trait Drop {
    fn drop(&mut self);
}
```

Most of the time, you won’t need to implement the `Drop` trait, as the system automatically drops each field of a data structure in sequence. However, you might want to implement it in two scenarios:

1. To perform specific actions when a data structure's lifetime ends, such as logging.
2. To manage resource recovery, especially if the compiler cannot infer what additional resources are used.

For example, the `MutexGuard` implements `Drop` to release lock resources:

```rust
impl<T: ?Sized> Drop for MutexGuard<'_, T> {
    #[inline]
    fn drop(&mut self) {
        unsafe {
            self.lock.poison.done(&self.poison);
            self.lock.inner.raw_unlock();
        }
    }
}
```

Importantly, the `Copy` and `Drop` traits are mutually exclusive; they cannot coexist. If you try to implement `Copy` for a type that also implements `Drop`, the compiler will throw an error. This makes sense, as `Copy` signifies a shallow copy, while `Drop` is for releasing resources.

To illustrate, consider the following code where a raw pointer is taken from heap memory. This `RawBuffer` struct can implement `Copy`, but if you also implement `Drop`, it could lead to memory leaks:

```rust
use std::{fmt, slice};

#[derive(Clone, Copy)]
struct RawBuffer {
    ptr: *mut u8,
    len: usize,
}

impl From<Vec<u8>> for RawBuffer {
    fn from(vec: Vec<u8>) -> Self {
        let slice = vec.into_boxed_slice();
        Self {
            len: slice.len(),
            ptr: Box::into_raw(slice) as *mut u8,
        }
    }
}

impl fmt::Debug for RawBuffer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let data = self.as_ref();
        write!(f, "{:p}: {:?}", self.ptr, data)
    }
}

impl AsRef<[u8]> for RawBuffer {
    fn as_ref(&self) -> &[u8] {
        unsafe { slice::from_raw_parts(self.ptr, self.len) }
    }
}

fn main() {
    let data = vec![1, 2, 3, 4];
    let buf: RawBuffer = data.into();
    use_buffer(buf);
    println!("buf: {:?}", buf);
}

fn use_buffer(buf: RawBuffer) {
    println!("buf to die: {:?}", buf);
    drop(buf); // This will drop buf
}
```

For memory safety, is memory leakage more harmful than "use after free"? Clearly, the latter is more dangerous. Rust prioritizes memory safety, ensuring that even if developers neglect proper memory management, memory safety issues won’t arise.

## Marker Traits: Sized/Send/Sync/Unpin

We’ve covered memory-related traits, now let’s look at marker traits. We already saw one: `Copy`. Rust also supports several other marker traits: `Sized`, `Send`, `Sync`, and `Unpin`.

**Sized**  
The `Sized` trait marks types with a known size. When using generic parameters, the Rust compiler automatically adds a `Sized` constraint. For example, with `Data<T>` and its processing function `process_data`:

```rust
struct Data<T> {
    inner: T,
}

fn process_data<T>(data: Data<T>) {
    todo!();
}
```
This is equivalent to:

```rust
struct Data<T: Sized> {
    inner: T,
}

fn process_data<T: Sized>(data: Data<T>) {
    todo!();
}
```
Most of the time, we want this automatic constraint since it allows fixed-size types to be passed as function arguments. Without it, if `T` is unsized, the function won’t compile. If you need `T` to be unsized, you can use `?Sized`:

```rust
pub enum Cow<'a, B: ?Sized + 'a> where B: ToOwned {
    Borrowed(&'a B),
    Owned(<B as ToOwned>::Owned),
}
```
Here, `B` can be unsized, like `[T]` or `str`, but note that `Borrowed(&'a B)` has a fixed size because it’s a reference.

**Send/Sync**  
Now, let’s discuss `Send` and `Sync`:

```rust
pub unsafe auto trait Send {}
pub unsafe auto trait Sync {}
```
These are unsafe auto traits, meaning the compiler automatically implements them in appropriate contexts. `Send` allows types to be transferred between threads, while `Sync` means that a reference to the type can be safely shared across threads. For a type to be `Sync`, `&T` must also be `Send`.

For custom data structures, if all fields implement `Send`/`Sync`, then the structure inherits these traits. Most primitive types support them, but exceptions include:

- Raw pointers (`*const T`, `*mut T`)
- `UnsafeCell` (does not implement `Sync`)
- Reference counting (`Rc`), which is not `Send` or `Sync`

Attempting to use `Rc` across threads will result in a compile error. For instance:

```rust
fn rc_is_not_send_and_sync() {
    let a = Rc::new(1);
    let b = a.clone();
    let c = a.clone();
    thread::spawn(move || {
        println!("c= {:?}", c);
    });
}
```
This won’t compile.

**RefCell and Threading**  
`RefCell` implements `Send`, but not `Sync`, making it usable in threads. For instance:

```rust
fn refcell_is_send() {
    let a = RefCell::new(1);
    thread::spawn(move || {
        println!("a= {:?}", a);
    });
}
```
This compiles successfully. However, using `Arc<RefCell<T>>` is problematic:

```rust
fn refcell_is_not_sync() {
    let a = Arc::new(RefCell::new(1));
    let b = a.clone();
    let c = a.clone();
    thread::spawn(move || {
        println!("c= {:?}", c);
    });
}
```
This fails because `RefCell` is not `Sync`. 

To safely share mutable data across threads, use `Arc<Mutex<T>>`:

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn arc_mutex_is_send_sync() {
    let a = Arc::new(Mutex::new(1));
    let b = a.clone();
    let handle = thread::spawn(move || {
        let mut g = b.lock().unwrap();
        *g += 1;
    });
    handle.join().unwrap();
}
```

## Traits for Type Conversion: From/Into/AsRef/AsMut

After understanding marker traits, let’s look at traits related to type conversion. Often, you need to convert between different data structures.

### From/Into
The `From` and `Into` traits facilitate value type conversions:

```rust
pub trait From<T> {
    fn from(T) -> Self;
}

pub trait Into<T> {
    fn into(self) -> T;
}
```
Implementing `From` automatically provides `Into`. For example:

```rust
let s: String = "Hello world!".into();
```

### AsRef/AsMut
`AsRef` and `AsMut` are for reference conversions:

```rust
pub trait AsRef<T> where T: ?Sized {
    fn as_ref(&self) -> &T;
}

pub trait AsMut<T> where T: ?Sized {
    fn as_mut(&mut self) -> &mut T;
}
```
They allow flexibility in accepting different types. For example, `std::fs::File::open` can accept `String`, `&str`, or `Path`.

## Operators: Deref/DerefMut
The `Deref` and `DerefMut` traits allow operator overloading:

```rust
pub trait Deref {
    type Target: ?Sized;
    fn deref(&self) -> &Self::Target;
}

pub trait DerefMut: Deref {
    fn deref_mut(&mut self) -> &mut Self::Target;
}
```
They enable seamless interaction with types like smart pointers:

```rust
impl<T> Deref for Buffer<T> {
    type Target = [T];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
```
This allows you to directly access methods of `Vec<T>` through `Buffer<T>` without needing explicit access to its inner structure.

By understanding these traits, you can leverage Rust's capabilities for safe and flexible type conversions and operations.

## Other Traits: Debug/Display/Default

Now that we have a solid understanding of operator-related traits, let's take a look at some commonly used traits: `Debug`, `Display`, and `Default`.

### Debug and Display

First, let’s examine `Debug` and `Display`. Their definitions are as follows:

```rust
pub trait Debug {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result<(), Error>;
}

pub trait Display {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result<(), Error>;
}
```

Both `Debug` and `Display` have the same signature, taking `&self` and `&mut Formatter`. So why have two traits with identical signatures?

The reason is that `Debug` is designed for developers to print data structures for debugging purposes, while `Display` is intended for user-friendly representation. This is why `Debug` can be derived automatically with macros, whereas `Display` must be manually implemented. When printing, `Debug` uses `{:?}` and `Display` uses `{}`.

### Default Trait

Now, let's look at the `Default` trait, which is defined as follows:

```rust
pub trait Default {
    fn default() -> Self;
}
```

The `Default` trait provides a default value for types. It can also be generated automatically using the `#[derive(Default)]` macro, provided every field in the type implements the `Default` trait. This allows us to partially initialize a data structure and use `Default::default()` for the remaining fields.

### Example Usage of Debug, Display, and Default

Here’s a unified example showcasing how to use `Debug`, `Display`, and `Default`:

```rust
use std::fmt;

// Struct can derive Default, but all fields must implement Default
#[derive(Clone, Debug, Default)]
struct Developer {
    name: String,
    age: u8,
    lang: Language,
}

// Enum cannot derive Default
#[allow(dead_code)]
#[derive(Clone, Debug)]
enum Language {
    Rust,
    TypeScript,
    Elixir,
    Haskell,
}

// Manually implement Default for the enum
impl Default for Language {
    fn default() -> Self {
        Language::Rust
    }
}

impl Developer {
    pub fn new(name: &str) -> Self {
        // Use ..Default::default() for remaining fields
        Self {
            name: name.to_owned(),
            ..Default::default()
        }
    }
}

// Implement Display for Developer
impl fmt::Display for Developer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}({} years old): {:?} developer",
            self.name, self.age, self.lang
        )
    }
}

fn main() {
    // Using T::default()
    let dev1 = Developer::default();
    // Using Default::default(), but type cannot be inferred; must provide type
    let dev2: Developer = Default::default();
    // Using T::new
    let dev3 = Developer::new("Tyr");
    
    println!("dev1: {}\ndev2: {}\ndev3: {:?}", dev1, dev2, dev3);
}
```

The implementation of these traits is straightforward, as demonstrated in the code above.

## Summary

We introduced several fundamental traits related to memory management, type conversion, operator overloading, and data representation, along with marker traits that help the compiler enforce type safety.

Traits occupy a central role in Rust development. A well-designed trait can significantly enhance the usability and extensibility of the entire system.

Many excellent third-party libraries build their capabilities around traits, such as the `Service` trait in the `tower-service` library mentioned earlier, and the `Parser` trait in the `nom` parser combinator library, which you may frequently use in the future.

Traits implement late binding, which you may recall from earlier discussions about foundational programming concepts. Late binding provides immense flexibility in software development.

From a data perspective, data structures represent concrete data through late binding, and generic structures provide late binding for concrete data structures. From a code perspective, functions are expressions implementing a specific behavior with late binding, and generic functions represent late binding for functions. So what does late binding mean for traits?

Traits represent late binding of behavior. We can define many behaviors of the system through traits without knowing the specific data structures to be processed. This is why I frequently referred to "defining behaviors" when explaining standard traits.