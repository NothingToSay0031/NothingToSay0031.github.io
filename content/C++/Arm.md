---
title: Interesting C++ Code Snippets
date: 2024-06-18 22:27:03
description: From my ARM GPU Software Internship.
---

A couple of fun and intriguing C++ code snippets I explored while developing a Vulkan trace tool at ARM.

# Compile-Time Type-to-Type Map

While working on translating the Vulkan API into our own data structure, I developed a compile-time type-to-type map. This map allows us to retrieve the corresponding CreateInfo type for a given Vulkan object type. Here’s the implementation:

```c++
#include <tuple>
#include <type_traits>

template <typename T>
struct TypeTag {
  using Type = T;
};

template <typename K, typename... V>
struct Pair {
  using FirstType = K;
  using SecondType = std::tuple<V...>;
};

template <typename Pair>
struct Element {
  template <typename K, typename = std::enable_if_t<
                            std::is_same_v<K, typename Pair::FirstType>>>
  static auto Value(TypeTag<K>) -> TypeTag<typename Pair::SecondType>;
};

template <typename... Elems>
struct TypeMap : Element<Elems>... {
  using Element<Elems>::Value...;

  template <typename K>
  struct FindHelper {
    using Type = typename decltype(TypeMap::Value(TypeTag<K>{}))::Type;
  };

  template <typename K>
  using Find = typename FindHelper<K>::Type;
};

// Key types
struct TypeA {};
struct TypeB {};

// Value types
struct InfoA1 {};
struct InfoA2 {};
struct InfoB {};

// Create a TypeMap with types
using TypeToInfoMap = TypeMap<Pair<TypeA, InfoA1, InfoA2>, Pair<TypeB, InfoB>>;

// Helper to get the type at a specific index in a tuple
template <typename Tuple, std::size_t Index>
using TupleElementType = std::tuple_element_t<Index, Tuple>;

int main() {
  using ValueA = TypeToInfoMap::Find<TypeA>;
  static_assert(std::is_same_v<ValueA, std::tuple<InfoA1, InfoA2>>,
                "Type mismatch!");

  using ValueB = TypeToInfoMap::Find<TypeB>;
  static_assert(std::is_same_v<ValueB, std::tuple<InfoB>>, "Type mismatch!");

  using FirstTypeValueA = std::tuple_element_t<0, ValueA>;
  static_assert(std::is_same_v<FirstTypeValueA, InfoA1>, "Type mismatch!");

  using SecondTypeValueA = TupleElementType<ValueA, 1>;
  static_assert(std::is_same_v<SecondTypeValueA, InfoA2>, "Type mismatch!");

  constexpr std::size_t size = std::tuple_size_v<ValueA>;
  static_assert(size == 2, "Tuple size mismatch!");

  return 0;
}
```

# Easily Ignoring Implicit Conversions

Here's an odd case where passing an lvalue to a function expecting an rvalue doesn't always cause a compiler complaint, depending on how it's used. This snippet illustrates how you might unintentionally bypass this check:

```c++
#include <iostream>
#include <memory>

class base {
 public:
  virtual ~base() = default;
  virtual void print() const { std::cout << "base" << std::endl; }
};

class derived : public base {
 public:
  void print() const override { std::cout << "derived" << std::endl; }
};

void func(std::shared_ptr<base>&& sp) { sp->print(); }

int main() {
  auto sp_base = std::make_shared<base>();
  auto sp_derived = std::make_shared<derived>();

  // func(sp_base);             // This line will cause a compile-time error
  func(sp_derived);             // This line works
  func(std::move(sp_base));     // This line works
  func(std::move(sp_derived));  // This line works

  return 0;
}
```

In this example, the function func expects an rvalue (`std::shared_ptr<base>&&`). Attempting to pass an lvalue directly to this function results in a compile-time error, as expected. However, when passing `sp_derived`, it works without a complaint because `std::shared_ptr<derived>` can be implicitly converted to `std::shared_ptr<base>`, even though it’s not an rvalue. Using `std::move` explicitly converts lvalues to rvalues, allowing the function to work as intended.

# Managing Vulkan Handles Across Architectures: A Unified Approach

Vulkan, the low-overhead, cross-platform API for high-performance 3D graphics, uses handles to represent devices, queues, and other entities. These handles come in two flavors: dispatchable and non-dispatchable.

## Handle Types in Vulkan

### Dispatchable Handles

Dispatchable handles are pointers to opaque types and are used as the first parameter in API commands, allowing layers to intercept and process API calls. Each dispatchable object must have a unique handle value during its lifetime. On both 32-bit and 64-bit systems, these handles are represented as pointers to a struct, such as struct VkDevice_T *.

### Non-Dispatchable Handles

Non-dispatchable handles are 64-bit integer types whose values can be implementation-dependent. If the privateData feature is enabled for a `VkDevice`, each non-dispatchable handle must be unique during its lifetime on that device. Otherwise, these handles can encode object information directly, potentially leading to non-unique values. This encoding is a performance optimization, enabling direct usage without dereferencing or indirection, even on 32-bit operating systems. Thus, 32-bit systems use `uint64_t` to represent non-dispatchable handles.

## Problem

We can't use `void*` to represent all handles. On 32-bit systems, non-dispatchable handles are `uint64_t` values, which cannot be directly cast to `void*` without causing errors. We need a unified approach to manage the handles on both 32-bit and 64-bit systems.

## Solution

To address the differences in handle representations, we can use C++17's `std::variant` to create a unified `VkHandle` type that can hold either a `void*` or a `uint64_t`. This approach ensures that our code remains portable and handles Vulkan objects correctly across different architectures.

## Implementation

Here's a step-by-step implementation of the solution:

### Define the Unified Handle Type

```c++
using VkHandle = std::variant<void*, uint64_t>;
```
    
### Define Hashing and Equality for VkHandle

Actually we can use the default hash and equality functions provided for `std::variant`.

```c++
struct VkHandleHash {
  template <typename T>
  std::size_t operator()(const T& t) const {
    return std::hash<T>{}(t);
  }

  template <typename... Types>
  std::size_t operator()(const std::variant<Types...>& v) const {
    return std::visit(
        [](const auto& value) {
          return std::hash<std::decay_t<decltype(value)>>{}(value);
        },
        v);
  }
};

struct VkHandleEqual {
  template <typename... Types>
  bool operator()(const std::variant<Types...>& lhs,
                  const std::variant<Types...>& rhs) const {
    return lhs == rhs;
  }
};
```
    
### Demonstrating Usage: Function Parameters and Map Keys

```c++ 
#include <cstdint>
#include <iostream>
#include <unordered_map>
#include <variant>

// Define a variant type for Vulkan handles
using VkHandle = std::variant<void*, uint64_t>;

// Function to demonstrate handling of VkHandle
void DemoFunction(const VkHandle& handle) {
  if (std::holds_alternative<void*>(handle)) {
    std::cout << std::get<void*>(handle) << std::endl;
  } else if (std::holds_alternative<uint64_t>(handle)) {
    std::cout << std::get<uint64_t>(handle) << std::endl;
  }
}

// Define Vulkan handle types
typedef uint64_t VkBuffer;  // Non-dispatchable handle (on 32-bit machine,
                            // otherwise it would be struct VkBuffer_T *)
typedef struct VkDevice_T* VkDevice;  // Dispatchable handle

int main() {
  // Initialize handles
  VkBuffer non_dispatchable_handle = 42;
  VkDevice dispatchable_handle = nullptr;

  // Create a map to associate VkHandles with integers
  std::unordered_map<VkHandle, int> handle_map;
  handle_map[non_dispatchable_handle] = 1;
  handle_map[dispatchable_handle] = 2;

  // Demonstrate the function handling both types of handles
  DemoFunction(non_dispatchable_handle);  // Output: 42
  DemoFunction(dispatchable_handle);      // Output: 0 (nullptr)

  // Output the values stored in the map for each handle
  std::cout << handle_map[non_dispatchable_handle] << std::endl;  // Output: 1
  std::cout << handle_map[dispatchable_handle] << std::endl;      // Output: 2

  return 0;
}
```

### Extract Vulkan Raw Handle from VkHandle

We can easily construct VkHandle from a Vulkan handle, but extracting the raw handle requires a bit more work. Here’s how we can do it:

```cpp
template <class T>
T Handle(const VkHandle &handle) {
  if constexpr (std::is_same<T, uint64_t>::value) {
    if (std::holds_alternative<uint64_t>(handle)) {  // For non-dispatchable handle on 32-bit systems
      return reinterpret_cast<T>(std::get<uint64_t>(handle));
    }
  } else {
    if (std::holds_alternative<void *>(handle)) {
      return reinterpret_cast<T>(std::get<void *>(handle));
    }
  }
  return VK_NULL_HANDLE;
}

uint64_t buffer_address = 42;
void *device_address = nullptr;
VkDevice device = Handle<VkDevice>(device_address);
VkBuffer buffer = Handle<VkBuffer>(buffer_address);
```

### Print it out

To print the address of the handle, whether it's a Vulkan raw handle or our `VkHandle`, we can use a unified method:

```c++
std::string HandleToHexString(const std::variant<void*, uint64_t>& vkhandle) {
  std::stringstream ss;
  if (std::holds_alternative<uint64_t>(vkhandle)) {
    uint64_t value = std::get<uint64_t>(vkhandle);
    ss << "0x" << std::hex << value;
  } else {
    void* value = std::get<void*>(vkhandle);
    ss << "0x" << std::hex << reinterpret_cast<uintptr_t>(value);
  }
  return ss.str();
}

```

If the input is a pointer to a struct, it will be converted to `void*` before being passed into the `std::variant`. Otherwise, the `VkHandle` will be passed or constructed in directly.

# Flexible Type Deduction with `is_constructible_v`

I use `std::conditional_t` and `std::is_constructible_v` to automatically select the appropriate struct based on the argument types provided, while `std::enable_if_t` is used to constrain the template function definition.

```c++
#include <iostream>
#include <memory>
#include <type_traits>

struct BufferRenderInfo {
  BufferRenderInfo(int, float) {
    std::cout << "BufferRenderInfo constructed." << std::endl;
  }
  bool Verify() const {
    std::cout << "BufferRenderInfo verification passed." << std::endl;
    return true;
  }
};

struct ImageRenderInfo {
  ImageRenderInfo(double, const char*) {
    std::cout << "ImageRenderInfo constructed." << std::endl;
  }
  bool Verify() const {
    std::cout << "ImageRenderInfo verification passed." << std::endl;
    return true;
  }
};

struct AsRenderInfo {
  AsRenderInfo(const char*) {
    std::cout << "AsRenderInfo constructed." << std::endl;
  }
  bool Verify() const {
    std::cout << "AsRenderInfo verification passed." << std::endl;
    return true;
  }
};

template <typename... Args>
using deduced_type_t = std::conditional_t<
    std::is_constructible_v<BufferRenderInfo, Args...>, BufferRenderInfo,
    std::conditional_t<
        std::is_constructible_v<ImageRenderInfo, Args...>, ImageRenderInfo,
        std::conditional_t<std::is_constructible_v<AsRenderInfo, Args...>,
                           AsRenderInfo, void>>>;

template <typename... Args, typename T = deduced_type_t<Args...>>
std::enable_if_t<!std::is_void_v<T>, void> Merge(Args&&... args) {
  auto render_info = std::make_shared<T>(std::forward<Args>(args)...);
  if (render_info->Verify()) {
    std::cout << "Merge successful." << std::endl;
  } else {
    std::cerr << "Merge failed: Verification failed." << std::endl;
  }
}

int main() {
  Merge(2.718, "example");  // Constructs ImageRenderInfo
  Merge(42, 3.14f);         // Constructs BufferRenderInfo
  Merge("example");         // Constructs AsRenderInfo

  return 0;
}
```

# Understanding Vulkan Image Memory Layout: A Deep Dive into A2B10G10R10_UNORM_PACK32

When working with Vulkan, understanding how image data is laid out in memory is crucial for correct image processing. Let's analyze a specific example of `VK_FORMAT_A2B10G10R10_UNORM_PACK32` format and how to interpret the raw memory data.

## The Format Specification

First, let's understand what `VK_FORMAT_A2B10G10R10_UNORM_PACK32` means:
- It's a 32-bit packed format
- Contains four components (A, B, G, R)
- Bit distribution:
  - Alpha (A): 2 bits (bits 30-31)
  - Blue (B): 10 bits (bits 20-29)
  - Green (G): 10 bits (bits 10-19)
  - Red (R): 10 bits (bits 0-9)

## Memory Layout Analysis

Let's analyze a real memory example. We have four bytes in little-endian order:

```
addr[0]: 10101101
addr[1]: 01111000
addr[2]: 00110010
addr[3]: 11000011
```

### Little-Endian Interpretation

In little-endian systems, the least significant byte comes first. So our 32-bit value is arranged as:

```
addr[3]    addr[2]    addr[1]    addr[0]
11000011   00110010   01111000   10101101
```

### Component Extraction

Let's break down how each component is extracted:

#### Red Component (bits 0-9)
```
addr[0]        addr[1]
10101101       01111000
                    ⬇
10101101       xxxxxx00 = 00 10101101 = 173
```
- Takes all 8 bits from addr[0]: 10101101
- Takes lowest 2 bits from addr[1]: 00
- Total value: 173 out of 1023 possible values (2¹⁰-1)
- Normalized value = 173/1023 ≈ 0.16911

#### Green Component (bits 10-19)
```
addr[1]        addr[2]
01111000       00110010
    ⬇             ⬇
011110xx       xxxx0010 = 0010 011110 = 158
```
- Takes upper 6 bits from addr[1]: 011110
- Takes lower 4 bits from addr[2]: 0010
- Total value: 158 out of 1023 possible values
- Normalized value = 158/1023 ≈ 0.15445

#### Blue Component (bits 20-29)
```
addr[2]        addr[3]
00110010       11000011
    ⬇             ⬇
0011xxxx       xx000011 = 000011 0011 = 51
```
- Takes upper 4 bits from addr[2]: 0011
- Takes lower 6 bits from addr[3]: 000011
- Total value: 51 out of 1023 possible values
- Normalized value = 51/1023 ≈ 0.04985

#### Alpha Component (bits 30-31)
```
addr[3]
11000011
    ⬇
11xxxxxx = 3
```
- Takes upper 2 bits from addr[3]: 11
- Total value: 3 out of 3 possible values (2²-1)
- Normalized value = 3/3 = 1.0

## Final Color Values

The final normalized color values are:
- R: 0.16911
- G: 0.15445
- B: 0.04985
- A: 1.0


## Code Implementation Example

```cpp
#include <cstdint>
#include <iostream>
#include <iomanip>

// Structure representing a packed 32-bit value in A2B10G10R10_UNORM format
struct A2B10G10R10_UNORM {
    uint32_t raw; // 32-bit packed color value
};

// Function to extract the red component (R) and normalize it
float extract_r(A2B10G10R10_UNORM value) {
    return (value.raw & 0x3FF) / 1023.0f;
}

// Function to extract the green component (G) and normalize it
float extract_g(A2B10G10R10_UNORM value) {
    return ((value.raw >> 10) & 0x3FF) / 1023.0f;
}

// Function to extract the blue component (B) and normalize it
float extract_b(A2B10G10R10_UNORM value) {
    return ((value.raw >> 20) & 0x3FF) / 1023.0f;
}

// Function to extract the alpha component (A) and normalize it
float extract_a(A2B10G10R10_UNORM value) {
    return ((value.raw >> 30) & 0x3) / 3.0f;
}

// Helper function to print the raw binary form of the 32-bit value
void print_binary(uint32_t value) {
    for (int i = 31; i >= 0; i--) {
        std::cout << ((value >> i) & 1);
        if (i % 8 == 0) std::cout << " "; // Add space every byte
    }
    std::cout << std::endl;
}

int main() {
    A2B10G10R10_UNORM test_value { 0xC33278ADu }; // Memory: [0xAD, 0x78, 0x32, 0xC3]

    // Print raw binary data for inspection
    std::cout << "Raw binary data:\n";
    print_binary(test_value.raw);

    // Set output precision to 5 decimal places
    std::cout << std::fixed << std::setprecision(5);

    // Extract and display each color component
    float r = extract_r(test_value);
    float g = extract_g(test_value);
    float b = extract_b(test_value);
    float a = extract_a(test_value);

    std::cout << "\nExtracted values:\n";
    std::cout << "R = " << r << " (expected: 0.16911)\n";
    std::cout << "G = " << g << " (expected: 0.15445)\n";
    std::cout << "B = " << b << " (expected: 0.04985)\n";
    std::cout << "A = " << a << " (expected: 1.00000)\n";

    // Verify results against expected values
    const float epsilon = 0.00001f;
    bool success = true;

    if (std::abs(r - 0.16911f) > epsilon) {
        std::cout << "R value mismatch!\n";
        success = false;
    }
    if (std::abs(g - 0.15445f) > epsilon) {
        std::cout << "G value mismatch!\n";
        success = false;
    }
    if (std::abs(b - 0.04985f) > epsilon) {
        std::cout << "B value mismatch!\n";
        success = false;
    }
    if (std::abs(a - 1.0f) > epsilon) {
        std::cout << "A value mismatch!\n";
        success = false;
    }

    if (success) {
        std::cout << "\nAll tests passed! Extraction functions work correctly.\n";
    } else {
        std::cout << "\nSome tests failed! Please check the implementation.\n";
    }

    return 0;
}

```

### Program Output

```
Raw binary data:
11000011 00110010 01111000 10101101 

Extracted values:
R = 0.16911 (expected: 0.16911)
G = 0.15445 (expected: 0.15445)
B = 0.04985 (expected: 0.04985)
A = 1.00000 (expected: 1.00000)

All tests passed! Extraction functions work correctly.
```