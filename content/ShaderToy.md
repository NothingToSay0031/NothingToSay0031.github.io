---
title: Shadertoy Projects
date: 2024-09-20 21:01:37
description: Build and Share your best shaders with the world and get Inspired.
---

Recently, I took part in Arm’s Shadertoy hackathon, where my team won the only Professional Award out of 11 teams. Here, I’ll document the projects I created and experimented with on Shadertoy.

# Drawing Chinese Characters with Bézier Curves

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202409202131797.png)

By utilizing the signed distance field (SDF) of Bézier curves—which include start and end points, start and end thickness, and curvature—we can create smooth, intricate lines. This technique is ideal for drawing the complex strokes of Chinese characters.

For a closer look at this shader, check out the demo on Shadertoy: [Shadertoy Demo](https://www.shadertoy.com/view/Xf2BWG).

# Fireworks Forming Chinese Characters

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202409252009518.gif)

The initial idea was to generate fireworks that form Chinese characters by sampling from the `sdfCurvedLine` function to define basic shapes. However, two main challenges arose: slow rendering, which impacted real-time performance, and rough character shapes, leading to poor visual quality.

To address these issues, I implemented **importance sampling** to distribute points more evenly across the strokes.

## Key Steps:
1. **Segment Assignment:** Assign points to each curve segment based on its relative length.
2. **Time Parameter (t):** Calculate the interpolation parameter `t` within each segment.
3. **Position Calculation:** Use the start point, end point, curvature, and `t` to compute the exact position of each point.

The result is a more accurate and efficient rendering of characters formed by fireworks.

For a detailed demonstration, see the shader on Shadertoy: [Shadertoy Demo](https://www.shadertoy.com/view/XXScz1).

# Mid-Autumn Fireworks

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202409252008683.gif)

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202409252008346.gif)

For a detailed view of this shader implementation, check out the demo on Shadertoy: [Shadertoy Demo](https://www.shadertoy.com/view/MXjcDR), or watch the [video](https://youtu.be/ZwiVGLMRdt0).

# Resources for Learning Shadertoy

1. **InspirNathan's Shader Topics**: A fantastic starting point for [ShaderToy](https://inspirnathan.com/topics/shaders).
   
2. **Inigo Quilez's Dist Function Articles**: A deep dive into signed distance functions (SDF), which are essential for creating smooth shapes and curves. Check out [Dist Functions 2D](https://iquilezles.org/articles/distfunctions2d/) and [Dist Functions](https://iquilezles.org/articles/distfunctions/).

3. **Inigo Quilez's Shadertoy Page**: A collection of impressive shader examples that demonstrate the power and versatility of Shadertoy. Explore [Inigo's Shadertoy](https://www.shadertoy.com/user/iq).

4. **The Book of Shaders**: An excellent online resource for learning the fundamentals of shaders. Visit [The Book of Shaders](https://thebookofshaders.com/).

# Guide for Shadertoy

This guide covers the parts of GLSL ES relevant for Shadertoy. For the complete specification, refer to the [GLSL ES Specification](https://www.khronos.org/registry/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf).

## Arithmetic Operators
- `() + - ! * / %`

## Logical/Relational Operators
- `~ < > <= >= == != && ||`

## Bit Operators
- `& ^ | << >>`

## Comments
- `//` for single-line
- `/* */` for multi-line

## Types
- `void`
- `bool`
- `int`
- `uint`
- `float`
- `vec2`, `vec3`, `vec4`
- `bvec2`, `bvec3`, `bvec4`
- `ivec2`, `ivec3`, `ivec4`
- `uvec2`, `uvec3`, `uvec4`
- `mat2`, `mat3`, `mat4`
- `sampler2D`, `sampler3D`, `samplerCube`

## Format
- `float a = 1.0;`
- `int b = 1;`
- `uint i = 1U;`
- `int i = 0x1;`

## Function Parameter Qualifiers
- `in`, `out`, `inout`

## Global Variable Qualifiers
- `const`

## Vector Components
- `.xyzw`, `.rgba`, `.stpq`

## Flow Control
- `if`, `else`, `for`, `return`, `break`, `continue`, `switch/case`

## Output
- `vec4 fragColor`

## Input
- `vec2 fragCoord`

## Preprocessor Directives
- `#`
- `#define`
- `#undef`
- `#if`
- `#ifdef`
- `#ifndef`
- `#else`
- `#elif`
- `#endif`
- `#error`
- `#pragma`
- `#line`

## Built-in Functions

| Function | Description |
| -- | -- |
| type [radians](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/radians.xhtml) (type degrees) | Converts degrees to radians |
| type [degrees](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/degrees.xhtml) (type radians) | Converts radians to degrees |
| type [sin](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/sin.xhtml) (type angle) | Computes sine |
| type [cos](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/cos.xhtml) (type angle) | Computes cosine |
| type [tan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/tan.xhtml) (type angle) | Computes tangent |
| type [asin](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/asin.xhtml) (type x) | Computes arcsine |
| type [acos](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/acos.xhtml) (type x) | Computes arccosine |
| type [atan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/atan.xhtml) (type y, type x) | Computes arctangent |
| type [atan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/atan.xhtml) (type y_over_x) | Computes arctangent of y/x |
| type [sinh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/sinh.xhtml) (type x) | Computes hyperbolic sine |
| type [cosh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/cosh.xhtml) (type x) | Computes hyperbolic cosine |
| type [tanh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/tanh.xhtml) (type x) | Computes hyperbolic tangent |
| type [asinh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/asinh.xhtml) (type x) | Computes hyperbolic arcsine |
| type [acosh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/acosh.xhtml) (type x) | Computes hyperbolic arccosine |
| type [atanh](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/atanh.xhtml) (type x) | Computes hyperbolic arctangent |
| type [pow](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/pow.xhtml) (type x, type y) | Computes x raised to the power of y |
| type [exp](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/exp.xhtml) (type x) | Computes e raised to the power of x |
| type [log](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/log.xhtml) (type x) | Computes the natural logarithm |
| type [exp2](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/exp2.xhtml) (type x) | Computes 2 raised to the power of x |
| type [log2](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/log2.xhtml) (type x) | Computes the base-2 logarithm |
| type [sqrt](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/sqrt.xhtml) (type x) | Computes the square root |
| type [inversesqrt](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/inversesqrt.xhtml) (type x) | Computes the inverse square root |
| type [abs](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/abs.xhtml) (type x) | Computes the absolute value |
| type [sign](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/sign.xhtml) (type x) | Computes the sign of x |
| type [floor](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/floor.xhtml) (type x) | Rounds down to the nearest integer |
| type [ceil](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/ceil.xhtml) (type x) | Rounds up to the nearest integer |
| type [trunc](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/trunc.xhtml) (type x) | Truncates to the nearest integer |
| type [fract](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/fract.xhtml) (type x) | Computes the fractional part of x |
| type [mod](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/mod.xhtml) (type x, float y) | Computes the modulo |
| type [modf](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/modf.xhtml) (type x, out type i) | Decomposes x into integer and fractional parts |
| type [min](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/min.xhtml) (type x, type y) | Returns the minimum of x and y |
| type [max](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/max.xhtml) (type x, type y) | Returns the maximum of x and y |
| type [clamp](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/clamp.xhtml) (type x, type minV, type maxV) | Clamps x to the range [minV, maxV] |
| type [mix](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/mix.xhtml) (type x, type y, type a) | Computes a linear interpolation between x and y |
| type [step](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/step.xhtml) (type edge, type x) | Performs step function |
| type [smoothstep](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/smoothstep.xhtml) (type a, type b, type x) | Performs smooth interpolation |
| float [length](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/length.xhtml) (type x) | Computes the length of x |
| float [distance](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/distance.xhtml) (type p0, type p1) | Computes distance between p0 and p1 |
| float [dot](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/dot.xhtml) (type x, type y) | Computes the dot product |
| vec3 [cross](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/cross.xhtml) (vec3 x, vec3 y) | Computes the cross product |
| type [normalize](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/normalize.xhtml) (type x) | Normalizes x |
| type [faceforward](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/faceforward.xhtml) (type N, type I, type Nref) | Computes the forward face |
| type [reflect](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/reflect.xhtml) (type I, type N) | Computes reflection |
| type [refract](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/refract.xhtml) (type I, type N, float eta) | Computes refraction |
| float [determinant](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/determinant.xhtml) (mat? m) | Computes the determinant |
| mat?x? [outerProduct](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/outerProduct.xhtml) (vec? c, vec? r) | Computes the outer product |
| type [matrixCompMult](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/matrixCompMult.xhtml) (type x, type y) | Computes component-wise matrix multiplication |
| type [inverse](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/inverse.xhtml) (type inverse) | Computes the inverse of a matrix |
| type [transpose](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/transpose.xhtml) (type inverse) | Computes the transpose of a matrix |
| vec4 [texture](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/texture.xhtml) (sampler?, vec? coord [, float bias]) | Samples a texture |
| vec4 [textureLod](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureLod.xhtml) (sampler, vec? coord, float lod) | Samples a texture at a specific level of detail. |
| vec4 [textureLodOffset](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureLodOffset.xhtml) (sampler?, vec? coord, float lod, ivec? offset) | Samples a texture at a specified LOD with an offset. |
| vec4 [textureGrad](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureGrad.xhtml) (sampler?, vec? coord, vec2 dPdx, vec2 dPdy) | Samples a texture using derivatives for gradient computation. |
| vec4 [textureGradOffset](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureGradOffset.xhtml) (sampler?, vec? coord, vec2 dPdx, vec2 dPdy, vec? offset) | Samples a texture with gradients and an offset. |
| vec4 [textureProj](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureProj.xhtml) (sampler?, vec? coord [, float bias]) | Projects a texture. |
| vec4 [textureProjLod](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureProjLod.xhtml) (sampler?, vec? coord, float lod) | Projects a texture at a specific level of detail. |
| vec4 [textureProjLodOffset](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureProjLodOffset.xhtml) (sampler?, vec? coord, float lod, vec? offset) | Projects a texture at LOD with an offset. |
| vec4 [textureProjGrad](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureProjGrad.xhtml) (sampler?, vec? coord, vec2 dPdx, vec2 dPdy) | Projects a texture using gradients. |
| vec4 [texelFetch](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/texelFetch.xhtml) (sampler?, ivec? coord, int lod) | Fetches a texel from a texture. |
| vec4 [texelFetchOffset](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/texelFetchOffset.xhtml) (sampler?, ivec? coord, int lod, ivec? offset) | Fetches a texel with an offset. |
| ivec? [textureSize](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/textureSize.xhtml) (sampler?, int lod) | Returns the size of a texture. |
| type [dFdx](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/dFdx.xhtml) (type x) | Computes the derivative in the x direction. |
| type [dFdy](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/dFdy.xhtml) (type x) | Computes the derivative in the y direction. |
| type [fwidth](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/fwidth.xhtml) (type p) | Computes the sum of absolute derivatives in x and y. |
| type [isnan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/isnan.xhtml) (type x) | Checks if x is NaN. |
| type [isinf](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/isinf.xhtml) (type x) | Checks if x is infinite. |
| float [intBitsToFloat](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/intBitsToFloat.xhtml) (int v) | Converts int bit representation to float. |
| uint [uintBitsToFloat](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/uintBitsToFloat.xhtml) (uint v) | Converts uint bit representation to float. |
| int [floatBitsToInt](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/floatBitsToInt.xhtml) (float v) | Converts float bit representation to int. |
| uint [floatBitsToUint](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/floatBitsToUint.xhtml) (float v) | Converts float bit representation to uint. |
| uint [packSnorm2x16](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/packUnorm.xhtml) (vec2 v) | Packs a normalized signed 2D vector into 16 bits. |
| uint [packUnorm2x16](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/packUnorm.xhtml) (vec2 v) | Packs a normalized unsigned 2D vector into 16 bits. |
| vec2 [unpackSnorm2x16](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/unpackUnorm.xhtml) (uint p) | Unpacks a normalized signed 2D vector from 16 bits. |
| vec2 [unpackUnorm2x16](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/unpackUnorm.xhtml) (uint p) | Unpacks a normalized unsigned 2D vector from 16 bits. |
| bvec [lessThan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/lessThan.xhtml) (type x, type y) | Checks if x is less than y. |
| bvec [lessThanEqual](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/lessThanEqual.xhtml) (type x, type y) | Checks if x is less than or equal to y. |
| bvec [greaterThan](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/greaterThan.xhtml) (type x, type y) | Checks if x is greater than y. |
| bvec [greaterThanEqual](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/greaterThanEqual.xhtml) (type x, type y) | Checks if x is greater than or equal to y. |
| bvec [equal](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/equal.xhtml) (type x, type y) | Checks if x is equal to y. |
| bvec [notEqual](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/notEqual.xhtml) (type x, type y) | Checks if x is not equal to y. |
| bool [any](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/any.xhtml) (bvec x) | Checks if any component of x is true. |
| bool [all](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/all.xhtml) (bvec x) | Checks if all components of x are true. |
| bvec [not](https://www.khronos.org/registry/OpenGL-Refpages/gl4/html/not.xhtml) (bvec x) | Computes the logical NOT of x. |

Here's the formatted version for the conversions and Shadertoy inputs/outputs in Markdown:

## Conversions

* Int to Float: `int(uv.x * 3.0)`

## How to
**Use structs:** 
```glsl
struct myDataType { 
    float occlusion; 
    vec3 color; 
}; 
myDataType myData = myDataType(0.7, vec3(1.0, 2.0, 3.0));  
```

**Initialize arrays:** 
```glsl
float[] x = float[](0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6);  
```

**Do conversions:** 
```glsl
int a = 3; 
float b = float(a);  
```

**Do component swizzling:** 
```glsl
vec4 a = vec4(1.0, 2.0, 3.0, 4.0); 
vec4 b = a.zyyw;  
```

**Access matrix components:** 
```glsl
mat4 m; 
m[1] = vec4(2.0); 
m[0][0] = 1.0; 
m[2][3] = 2.0;  
```

> **Be careful!**
- **The f suffix for floating point numbers:** `1.0f` is illegal in GLSL. Use `1.0`.
- **saturate():** `saturate(x)` doesn't exist in GLSL. Use `clamp(x, 0.0, 1.0)` instead.
- **pow/sqrt:** Please don't feed `sqrt()` and `pow()` with negative numbers. Add `abs()` or `max(0.0, x)` to the argument.
- **mod:** Please don't do `mod(x, 0.0)`. This is undefined on some platforms.
- **Variables:** Initialize your variables! Don't assume they'll be set to zero by default.
- **Functions:** Don't name your functions the same as some of your variables.

## Shadertoy Inputs
| Type | Name | Description |
| --- | --- | --- |
| vec3 | iResolution | Image/buffer: The viewport resolution (z is pixel aspect ratio, usually 1.0) |
| float | iTime | Image/sound/buffer: Current time in seconds |
| float | iTimeDelta | Image/buffer: Time it takes to render a frame, in seconds |
| int | iFrame | Image/buffer: Current frame |
| float | iFrameRate | Image/buffer: Number of frames rendered per second |
| float | iChannelTime[4] | Image/buffer: Time for channel (if video or sound), in seconds |
| vec3 | iChannelResolution[4] | Image/buffer/sound: Input texture resolution for each channel |
| vec4 | iMouse | Image/buffer: xy = current pixel coords (if LMB is down). zw = click pixel |
| sampler2D | iChannel{i} | Image/buffer/sound: Sampler for input textures i |
| vec4 | iDate | Image/buffer/sound: Year, month, day, time in seconds in .xyzw |
| float | iSampleRate | Image/buffer/sound: The sound sample rate (typically 44100) |

## Shadertoy Outputs

#### Image shaders: 
`fragColor` is used as output channel. It is not mandatory, but recommended to leave the alpha channel to 1.0.

#### Sound shaders: 
The `mainSound()` function returns a `vec2` containing the left and right (stereo) sound channel wave data.
