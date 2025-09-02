---
date: '2025-01-04T22:47:09+08:00'
title: 'Compression-Oriented Programming'
description: 'Explore semantic compression to achieve efficient abstraction and natural architecture in real-world software development.'
---
[[GAMES202.md ]]
# Compression-Oriented Programming: A Practical Approach to Abstraction

Casey Muratori's blog post, [Semantic Compression](https://caseymuratori.com/blog_0015), presents a compelling alternative to traditional object-oriented programming (OOP) practices. By optimizing the UI code for The Witness, the author demonstrates how step-by-step code compression can lead to improved readability, maintainability, and scalability. This article distills the core ideas and methodology outlined in the post.

## The Concept of Code Compression

- **Code compression programming** refers to simplifying code to its minimal expression by extracting repetitive patterns, reducing redundancy, and increasing the level of abstraction.  
- This approach **starts with detailed optimization** and avoids relying on pre-planned architecture. Instead, **the final system architecture emerges naturally** through iterative compression and optimization.  
- Unlike the traditional top-down "design architecture first" approach in OOP, **code compression minimizes the risk of overlooking details or creating suboptimal solutions** during architectural design.  

## Optimization Starting from Details

- The author **extracts patterns from repetitive code**, such as button calculation logic and row management in UI layouts.  
- **Local variables are abstracted into shared structures** (e.g., `Panel_Layout`) to enable data sharing and simplify logic.  
- Each optimization step **is intuitive and does not require complex tools** or workflows (e.g., UML diagrams or index cards).  

### Step-by-Step Code Compression

- **Step 1: Establish a Shared Stack Framework**  
  Extract variables related to panel layout (e.g., `row_height` and `at_y`) into the `Panel_Layout` structure, **acting as a shared state manager**.  

- **Step 2: Extract Repetitive Logic**  
  **Encapsulate common operations** (e.g., drawing window titles, creating rows, rendering buttons) into methods like `window_title()` and `row()`, **reducing redundancy**.  

- **Step 3: Dynamic Computation**  
  Use **dynamic computation** to determine layout heights (via the `complete()` method), **avoiding hardcoded declarations** and enhancing code robustness.  

- **Step 4: Further Logic Compression**  
  **Simplify frequent calls** (e.g., button rendering) into more concise methods like `push_button()`, **making the code cleaner and more compact**.  

Through these steps, the code transforms from **a complex, verbose structure into a streamlined form containing only the essential logic**.  

## Reflections on Object-Oriented Programming (OOP)

- **Criticism of Traditional OOP Methods**: The author argues that **traditional OOP methods overemphasize pre-designed architectures**, making them overly complicated and inefficient.  
- **Code Is Not Intrinsically Object-Oriented**: Code is **fundamentally procedural**, and objects **naturally emerge as structures to facilitate program reuse**.  
- **How to Derive the Right Objects**: Objects should not be **forcibly designed in advance** but should **naturally emerge through code compression and refinement**.  

## Broader Insights

- **The Key to Program Design** is to **understand and address detailed problems first**, then **extract general patterns through code compression**, leading to natural abstractions and architectures.  
- **Avoid Premature Complexity**: Resist the urge to **plan an "ideal" system prematurely**. Instead, **iteratively optimize simple code** to evolve into a practical and functional structure.  

## Summary

This article advocates for a programming approach focused on **starting with details** and **achieving architectural optimization through code compression**. It opposes the traditional OOP method of **"designing the architecture first."** This approach **makes the code more intuitive and efficient** while **avoiding potential pitfalls in architectural design**.