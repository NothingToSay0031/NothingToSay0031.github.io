---
date: '2025-01-03T11:16:31+08:00'
title: 'Exploring False Sharing'
description: 'How to beat the 99.99% of CS grads.'
---

# Understanding False Sharing: A Subtle Performance Killer in Multithreaded Programs

Today, I stumbled upon an intriguing post on Twitter:  

> *"If you can tell what's wrong here, you're better than 99.99% of CS grads."*

Here’s the code snippet from the post:

```cpp
struct Point {
    int x;
    int y;
};

int main() {
    struct Point point = {0, 0};
    // Thread 1
    for (int i = 0; i < 100; i++) { point.x += 1; }
    // Thread 2
    for (int j = 0; j < 100; j++) { point.y += 1; }
}
```

At first glance, nothing seems amiss—it looks like a straightforward implementation where two threads increment `x` and `y` independently. 
But as the Twitter post boldly claimed, just figuring out the issue puts you ahead of 99.99% of CS graduates. Naturally, I couldn't resist diving deeper to see what all the fuss was about!

## The Culprit: False Sharing

The problem lies in **false sharing**, a subtle performance issue that arises in multithreaded programs. 

### What Is False Sharing?

False sharing occurs when multiple threads modify variables that reside on the same cache line, even though the threads are not explicitly sharing data. CPUs cache data in chunks called *cache lines* (usually 64 bytes). When one thread updates a variable, the entire cache line is marked invalid for other cores, causing unnecessary cache synchronization overhead.

In this example:
- `x` and `y` are likely stored on the same cache line in the `Point` struct.
- Thread 1 updates `x`, and Thread 2 updates `y`. However, since `x` and `y` share the same cache line, the two threads end up contending for access to the cache line, despite working on different variables.

## Verifying False Sharing with Code

To demonstrate false sharing, I wrote a benchmark comparing two scenarios:
1. **With False Sharing**: Variables `x` and `y` share the same cache line.
2. **Without False Sharing**: Variables `x` and `y` are padded to occupy separate cache lines.

Here’s the code:

```c++
// false_sharing_test.cpp
#include <immintrin.h>  // For _mm_pause()

#include <atomic>
#include <cassert>
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

constexpr size_t ITERATIONS = 100000000;

// Data structure with potential False Sharing
struct SharedData {
  int x;
  int y;
};

// Data structure to avoid False Sharing
struct PaddedData {
  alignas(64) int x;  // Force alignment to 64 bytes (size of a cache line)
  alignas(64) int y;
};

// Function to perform increments
template <typename T>
void increment(T& data, int& counter, bool increment_x) {
  for (size_t i = 0; i < ITERATIONS; ++i) {
    if (increment_x) {
      data.x++;
    } else {
      data.y++;
    }
  }
}

int main() {
  // Shared data structures
  SharedData shared_data{0, 0};
  PaddedData padded_data{0, 0};

  // Test shared structure (False Sharing case)
  auto start = std::chrono::high_resolution_clock::now();
  {
    std::thread t1(increment<SharedData>, std::ref(shared_data),
                   std::ref(shared_data.x), true);
    std::thread t2(increment<SharedData>, std::ref(shared_data),
                   std::ref(shared_data.y), false);
    t1.join();
    t2.join();
  }
  auto end = std::chrono::high_resolution_clock::now();
  auto false_sharing_duration =
      std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
          .count();

  // Test padded structure (Avoiding False Sharing case)
  start = std::chrono::high_resolution_clock::now();
  {
    std::thread t1(increment<PaddedData>, std::ref(padded_data),
                   std::ref(padded_data.x), true);
    std::thread t2(increment<PaddedData>, std::ref(padded_data),
                   std::ref(padded_data.y), false);
    t1.join();
    t2.join();
  }
  end = std::chrono::high_resolution_clock::now();
  auto no_sharing_duration =
      std::chrono::duration_cast<std::chrono::milliseconds>(end - start)
          .count();

  assert(shared_data.x == ITERATIONS && shared_data.y == ITERATIONS &&
         padded_data.x == ITERATIONS && padded_data.y == ITERATIONS);

  // Output results
  std::cout << "False Sharing Case Time: " << false_sharing_duration << " ms\n";
  std::cout << "Avoided Sharing Case Time: " << no_sharing_duration << " ms\n";
  return 0;
}
```

### Running the Benchmark

Compile and run the code:

```bash
g++ -O2 -std=c++11 false_sharing_test.cpp -o false_sharing_test -pthread
./false_sharing_test
```

**Results:**
- False Sharing Case Time: **680 ms**
- Avoided Sharing Case Time: **162 ms**

## Conclusion

The performance difference between the two cases highlights the impact of false sharing. By aligning variables to separate cache lines using `alignas(64)`, we eliminate unnecessary contention, significantly improving performance.

## Takeaways

**Use Padding or Alignment**: Properly align data to avoid false sharing in performance-critical sections.

False sharing is a classic example of a performance pitfall that often goes unnoticed but can have a significant impact. Spotting and addressing such issues truly sets you apart as a seasoned programmer!
