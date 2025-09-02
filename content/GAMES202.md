---
title: Real-Time High Quality Rendering
date: 2024-11-22 12:33:58
description: A comprehensive exploration of real-time rendering, covering shadows, global illumination, shading models, ray tracing, and industry techniques.
math: true
---

# Real-Time Shadows

## Shadow Mapping

Shadow mapping is an **image-space algorithm** to determine if a point is in shadow.

- **Pros**: Does not require scene geometry
- **Cons**: Prone to **self-occlusion** and **aliasing** issues

### Algorithm Steps

1. **Generate Depth Map**: Render the scene from the light’s perspective to create a **depth map (shadow map)**.
2. **Shadow Check**: Compare the shading point’s distance to the light with the **shadow map** depth to decide if the point is in shadow.

### Self-Occlusion (Shadow Acne)

Self-occlusion, also known as [shadow acne](https://digitalrune.github.io/DigitalRune-Documentation/html/3f4d959e-9c98-4a97-8d85-7a73c26145d7.htm), happens when **points that should be lit** are incorrectly shadowed. This often results from limited **depth map resolution**, which cannot capture detailed depth variations within small areas.

#### Mitigating Self-Occlusion

- **Bias Adjustment**: Adding a **bias** during shadow checking helps reduce shadow acne by making points close to surfaces visible.  
  - **Drawback**: Excessive bias can cause a “shadow detachment” effect, where shadows appear separated from the object.
  
- **Second-Depth Shadow Mapping**:  
  Another approach is to use a **second-depth shadow map**. Instead of storing the first depth, it records the midpoint between the first and second depths.  
  - **Requirements**: Needs **watertight geometry**
  - **Trade-off**: Higher computational cost

### Aliasing

Shadow maps can have **aliasing** (jagged edges) at shadow boundaries, usually due to **limited depth map resolution** and insufficient **sampling**.

## Percentage Closer Filtering

PCF (Percentage Closer Filtering) is an anti-aliasing technique applied to shadow edges. By **filtering the visibility results** around shadow edges, it helps reduce the jagged, staircase-like artifacts commonly seen in shadow maps.

### Process

1. **Calculate Scene Distance**: For a shading point $p$, first calculate its **distance to the light source** in the scene, denoted as $D_{\text{scene}}(p)$.
    
2. **Define the Filter Kernel**: Choose a **convolution kernel** $w$ for filtering. This kernel determines the size of the region sampled around the point $p$ in the **depth map** (shadow map).
    
    * For example, with a $3 \times 3$ kernel, the region around $p$ in the depth map will include **9 pixels**.
3. **Gather Depths for Comparison**: Use the kernel to read **depth values** $D_{\text{SM}}(q)$ from the shadow map at neighboring points $q$ around $p$, where $q \in \mathcal{N}(p)$.
    
4. **Compute Visibility for Each Neighbor**: For each sampled depth $D_{\text{SM}}(q)$, calculate a **visibility result**:
    
    $$\chi^{+} \left[ D_{\text{SM}}(q) - D_{\text{scene}}(p) \right] = \begin{cases}  
    1 & \text{if } D_{\text{SM}}(q) > D_{\text{scene}}(p) \\  
    0 & \text{otherwise}  
    \end{cases}$$
5. **Weighted Average of Visibility Results**: Using the **weights** $w(p, q)$ from the convolution kernel, compute the **weighted average** of the visibility results to obtain the final visibility $V(p)$ for point $p$:
    
    $$V(p) = \sum_{q \in \mathcal{N}(p)} w(p, q) \cdot \chi^{+}\left[ D_{\text{SM}}(q) - D_{\text{scene}}(p) \right]$$

### Example

For a **mean filter** with a **$3 \times 3$ kernel**:

* For a shading point $p$, gather the **9 neighboring pixels** in the shadow map, and compare each depth to $D_{\text{scene}}(p)$.
* Suppose the visibility results are: $$\begin{bmatrix} 1 & 0 & 1 \\ 1 & 0 & 1 \\ 1 & 1 & 0 \end{bmatrix}$$
* The **final visibility** for $p$ is the **average** of these values, yielding $V(p) = 0.667$.

### Effect of Kernel Size

* **Smaller Kernel**: Results in sharper shadow edges.
* **Larger Kernel**: Produces softer, more blurred shadow edges.

## Soft Shadows

When an **area light source** illuminates an object, it creates **soft shadows** with varying edge softness, depending on the **degree of occlusion**.

While **PCF** can blur shadow edges, it cannot dynamically create soft shadows, as its **filter kernel size is fixed**. To achieve true soft shadows, the filter kernel size should adjust based on occlusion.

## PCSS (Percentage Closer Soft Shadows)

**PCSS (Percentage Closer Soft Shadows)** builds on PCF to produce soft shadows. It calculates the **relative depth of occluders** between the shading point and light source and adjusts the **PCF filter kernel size** based on this depth to achieve edge softness that varies with occlusion.

### PCSS Algorithm Steps

1. **Blocker Search**:
    
    * In the depth map, find the **average depth of occluders** around the shading point within a specified area.
    * The search area can be a **fixed size** (e.g., $5 \times 5$) or adjusted based on the **light source size** $w_{\text{light}}$ and **distance** between the shading point and light $d_{\text{receiver}}$.
2. **Penumbra Estimation**:
    
    * Assuming the light, occluder, and shading surface are **parallel**, use the **light source size** $w_{\text{light}}$, the **distance to the shading point** $d_{\text{receiver}}$, and **average occluder depth** $d_{\text{blocker}}$ to estimate the **penumbra width**: $$w_{\text{penumbra}} = \frac{ d_{\text{receiver}} - d_{\text{blocker}} }{ d_{\text{blocker}} } \cdot w_{\text{light}}$$
3. **PCF Application**:
    
    * Run **PCF** using a filter kernel size proportional to the estimated **penumbra width** $w_{\text{penumbra}}$, resulting in soft shadow edges that adapt to the occlusion level.



## VSSM (Variance Soft Shadow Mapping)

To estimate the **average depth of occluders** $z_{\text{occ}}$ in the first step of **PCSS**, the algorithm must sample the depths of all nearby texels around the shading point and compare them to the shading point's depth. This process is repeated in the third step to determine **average visibility**.

**VSSM (Variance Soft Shadow Mapping)** approximates these steps to **significantly accelerate** both the first and third steps of PCSS. The accelerated process involves:

1. **Calculating the mean and variance** of the depth distribution around the shading point.
2. **Using inequalities** to estimate either the **average unoccluded depth** $z_{\text{occ}}$ or the **visibility result** $V(p)$ at the shading point.

### Calculating Mean and Variance of Depth Distribution

The **mean** $E(X)$ and **variance** $\text{Var}(X)$ of a random variable $X$ are related by:

$$ \text{Var}(X) = E(X^2) - E^2(X) $$

To compute these values, we store both the **depth** $z$ and **depth squared** $z^2$ for each texel when generating the depth map. This allows us to calculate the **summed area table (SAT)** for both.

When a region around the shading point is queried, we can retrieve the **mean depth** $z_{\text{avg}}$ and **mean squared depth** $(z^2)_{\text{avg}}$ from the SATs, using $(1)$ to find the **variance** of the depth distribution:

$$\text{Variance} = (z^2)_{\text{avg}} - (z_{\text{avg}})^2$$

### Estimating Unoccluded Depth or Visibility with Inequalities

**Chebyshev's inequality** describes the relationship between a probability distribution's density function, mean, and variance:

$$P(x > t) \le \frac{\sigma^2}{\sigma^2 + (t - \mu)^2}$$

Let $z_t$ represent the depth of the shading point. Then $P(z > z_t)$ gives the **proportion of unoccluded texels** around the shading point.

VSSM assumes equality in **Chebyshev’s inequality** for simplicity:

$$P(z > z_t) = \frac{(z^2)_{\text{avg}} - (z_{\text{avg}})^2}{(z^2)_{\text{avg}} - (z_{\text{avg}})^2 + (z_t - z_{\text{avg}})^2}$$

* If this is used in **PCSS Step 3**, it directly provides the **visibility** result for the shading point: $V(p) = P(z > z_t)$.
* For **PCSS Step 1**, we assume that the **average depth of unoccluded texels** equals the shading point’s depth $z_{\text{unocc}} = z_t$. Given the occluder average depth $z_{\text{occ}}$ and the unoccluded average depth $z_{\text{unocc}}$, we have:

$$[1 - P(z > z_t)] \cdot z_{\text{occ}} + P(z > z_t) \cdot z_{\text{unocc}} = z_{\text{avg}}$$

By substituting values, we can estimate the **average occluder depth** $z_{\text{occ}}$, used in **PCSS Step 2** to estimate the penumbra.


## Moment Shadow Mapping

**Moment Shadow Mapping** improves on **VSSM** by reconstructing the cumulative distribution function (CDF) for depths around the shading point using higher-order moments, rather than just the mean and second-order moment.

* **Higher-order moments** yield a more accurate fit for the CDF, reducing issues like **light leaks** in shadow generation.
* The trade-off: **increased storage** and **computational resources** are required due to higher-order depth terms, but the shadow quality improves.

## Distance Field Soft Shadows

Unlike the PCSS series, **Distance Field Soft Shadows** utilize a **signed distance field (SDF)** instead of a shadow map to create soft shadows.

* The **SDF** $\text{sdf}: \mathbb{R}^3 \rightarrow \mathbb{R}$ stores the distance from any point in the 3D scene to the nearest surface. Points inside an object have negative values, while points outside have positive values.

To compute the shadow at a shading point $o$:

1. **Trace a ray** from $o$ towards the light source.
2. During this tracing, record each point $p$'s **SDF value** $\text{sdf}(p)$ and its distance from $o$.
3. Calculate the **safe viewing angle** $\theta$, representing the maximum angle from $o$ towards the light source without occlusion.

The smaller $\theta$ is, the more occluded the shading point is, resulting in softer shadows.

### Safe Angle Calculation

Instead of a direct inverse trigonometric function, the following formula is often used for efficiency:

$$ \theta = \min \Big\{ \frac{k \cdot \text{sdf}(p)}{\| p - o \|}, 1 \Big\} $$

* **Parameter $k$** controls the shadow’s softness; larger $k$ values create softer shadow edges.

### Considerations

* **High-quality, fast soft shadows** are achievable with distance fields.
* **Drawbacks**: SDFs require **significant pre-computation** and storage, as they must capture depth information for every point in the 3D space. In contrast, PCSS techniques only store depth at the light source.

To reduce resource usage, **hierarchical data structures** like **octrees** can subdivide the scene efficiently. In regions distant from any surface, a coarser subdivision reduces storage demands and computational costs.

# Real-Time Environment Mapping

## Ambient Lighting and Shading

**Environment Mapping** simplifies the representation of surrounding light and environment by projecting it directly as a texture. This texture, which represents the ambient light, assumes light sources are located at infinity. Common representations include **spherical maps** or **cube maps**.

### Image-Based Lighting (IBL)

**Image-Based Lighting (IBL)** is a technique for shading a point $p$ using an environment map, **ignoring visibility** $V(p, \omega_i)$. The rendering equation for IBL is:

$$L_o(p, \omega_o) = \int_{\Omega^+} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos \theta_i \cancel{V(p, \omega_i)} \, \mathrm{d}\omega_i$$

In IBL, shading is simplified by **excluding visibility calculations** from the rendering equation.

#### Approximation with Monte Carlo Sampling

To approximate this rendering integral, **Monte Carlo sampling** can be used to sample directions of incoming ambient light.

* **Trade-off**: Achieving convergence with Monte Carlo methods requires a **high number of samples** for accurate results, which can demand significant computational resources.


## Split Sum Approximation

### Approximation in RTR
In real-time rendering, a useful approximation for evaluating integrals of function products is to **separate the integral of two multiplied functions** into the product of their integrals:

$$\int_{\Omega} f(x) g(x) \, \mathrm{d}x \approx \frac{\int_{\Omega_G} f(x) \, \mathrm{d}x}{\int_{\Omega_G} \, \mathrm{d}x} \cdot \int_{\Omega} g(x) \, \mathrm{d}x = \overline{f(x)} \cdot \int_{\Omega} g(x) \, \mathrm{d}x$$

($\overline{f(x)}$: the average $f(x)$ in the support of $G$)


#### Key Points

* This approximation holds well when:
    * The integrand $g(x)$ is relatively smooth (e.g., BRDF for diffuse materials).
    * The support domain of $g(x)$ is small (e.g., few light sources are directly sampled for visibility).

### Applying Split Sum to Rendering Equation

To avoid sampling every direction for the integral, **Split Sum** approximates the rendering equation by factoring out the BRDF during integration. This transforms the rendering equation into the following form:

$$
\begin{align}  
L_o(p, \omega_o) & = \int_{\Omega^+} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i \, \mathrm{d}\omega_i  \notag\\  
& \approx \frac{\int_{\Omega^+} L_i(p, \omega_i) \, \mathrm{d}\omega_i}{\int_{\Omega^+} \mathrm{d}\omega_i} \cdot \int_{\Omega^+} f_r(p, \omega_i, \omega_o) \cos\theta_i \, \mathrm{d}\omega_i    \notag
\end{align}
$$

* For **diffuse materials** with smooth BRDFs, this provides a reasonable approximation.
* For **glossy materials**, even if the BRDF isn’t smooth, the support domain is generally small, so the approximation remains effective.

### Sum-Based Approximation

The method is called "Split Sum" rather than "Split Integral" because its originators rewrote the integral as a sum:

$$
\frac{1}{N} \sum_{k=1}^{N} \frac{L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i}{\mathrm{pdf}(p, \omega_i)} \approx \left( \frac{1}{N} \sum_{k=1}^{N} L_i(p, \omega_i) \right) \left( \frac{1}{N} \sum_{k=1}^{N} \frac{f_r(p, \omega_i, \omega_o) \cos\theta_i}{\mathrm{pdf}(p, \omega_i)} \right)
$$

This sum-based approach allows for efficient computation by reducing the number of samples needed, making it suitable for real-time rendering.


### Pre-filtering of the Environment Map

The first part of the integral:

$$
\frac{\int_{\Omega^{+}} L_i(p, \omega_i) \, \mathrm{d}\omega_i}{\int_{\Omega^{+}} \mathrm{d}\omega_i}
$$

can be seen as applying a filter to the environment map, where the size of the filter kernel depends on the support set of the BRDF (Bidirectional Reflectance Distribution Function).

* When shading a given point, querying the pre-filtered environment map using the ideal specular reflection direction essentially queries the environment lighting in the area around the specular reflection direction.
* This approach eliminates the need for sampling, as it directly accesses the precomputed data.

To implement this, you can precompute a mipmap of the environment map, which is an image pyramid of prefiltered environment maps at different levels of detail. During shading, based on the BRDF, you can select the appropriate filter kernel size and fetch the corresponding lighting information from the appropriate mipmap level or use trilinear interpolation.


### Evaluating the BRDF Integral

The second part of the integral:

$$
\int_{\Omega^{+}} f_r(p, \omega_i, \omega_o) \cos\theta_i \, \mathrm{d}\omega_i
$$

can be computed either by evaluating all possible parameters directly or by using **LTC** (Linearly Transformed Cosines).

For **microfacet models** of BRDFs, the **Schlick’s approximation** for the Fresnel term is commonly used:

$$
F(\theta) = R_0 + (1 - R_0) \left( 1 - \cos\theta \right)^5
$$

Where:

* $R_0 = \left( \frac{\eta_1 - \eta_2}{\eta_1 + \eta_2} \right)^2$ is the base reflectance value, with $\eta_1$ and $\eta_2$ being the refractive indices of the two materials surrounding the shading point.
* In real-time rendering, the incident angle $\theta_i$, the exit angle $\theta_o$, and their half-angle are considered very close. Thus, we use $\theta$ to describe the light direction.

The integral can then be split based on the Fresnel term:

$$
\begin{align}  
\int_{\Omega^{+}} f_r(p, \omega_i, \omega_o) \cos\theta_i \, \mathrm{d}\omega_i &\approx \int_{\Omega^{+}} \frac{f_r(p, \omega_i, \omega_o)}{F(\theta_i)} \left[ R_0 + (1 - R_0) (1 - \cos\theta_i)^5 \right] \cos\theta_i \, \mathrm{d}\omega_i  \notag\\  
&= R_0 \int_{\Omega^{+}} \frac{f_r(p, \omega_i, \omega_o)}{F(\theta_i)} \left[ 1 - (1 - \cos\theta_i)^5 \right] \cos\theta_i \, \mathrm{d}\omega_i  \notag\\ & + \int_{\Omega^{+}} \frac{f_r(p, \omega_i, \omega_o)}{F(\theta_i)} (1 - \cos\theta_i)^5 \cos\theta_i \, \mathrm{d}\omega_i  \notag 
\end{align}
$$

Thus, the integral no longer depends on the base color $R_0$. During precomputation, only the **roughness** and **incident angle cosine** need to be considered when evaluating the term $\frac{f_r(p, \omega_i, \omega_o)}{F(\theta)}$.


## Environment Lighting Shadows

When shading is required, real-time rendering becomes a challenging problem.

The equation for shading at a given point $p$ is:

$$
L_o(p, \omega_o) = \int_{\Omega^+} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i \cdot V(p, \omega_i) \, \mathrm{d}\omega_i
$$

Where:

* $L_o(p, \omega_o)$: Shading result at point $p$
* $L_i(p, \omega_i)$: Incoming environmental lighting
* $f_r(p, \omega_i, \omega_o)$: BRDF function
* $V(p, \omega_i)$: Visibility factor for incoming light at point $p$

### Key Challenges

* **Numerous Light Sources**:  
    Since the environment lighting comes from all directions, if shading is considered as a "many-light rendering" problem, each light source would require its own shadow map. The number of shadow maps required would become unmanageable.
    
* **Visibility Complexity**:  
    The visibility term $V(p, \omega_i)$ can be highly complex. If treated as a sampling problem, it might not be approximated by methods like the **split sum** approach.
    
* **BRDF and Support Set**:  
    The support set of $L_i(p, \omega_i)$ spans the entire hemisphere, while the BRDF function $f_r(p, \omega_i, \omega_o)$ might not be smooth. After separating $V$, the remaining integral of $L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i$ might still have a large support set, which could also be non-smooth.
    

### Industry Solutions

* **Shadow Maps**:  
    In practice, the industry tends to choose the brightest light sources (e.g., the sun) or a few prominent light sources to generate shadow maps. Shadows are then created from these selected sources.

### Research Directions

* **Imperfect Shadow Maps**:  
    Techniques to improve shadow map quality by handling issues like low resolution and artifacts.
    
* **Lightcuts**:  
    A method to approximate shadow computation by reducing the number of light sources that contribute to a given point's shading.
    
* **Real-Time Ray Tracing (RTRT)**:  
    Potentially the ultimate solution for real-time shadow generation, allowing for accurate and dynamic lighting and shadow effects.
    
* **Precomputed Radiance Transfer (PRT)**:  
    A technique that precomputes the transfer of radiance for different lighting conditions, which can be used for efficient shading in complex environments.
    
## Precomputed Radiance Transfer

Precomputed Radiance Transfer (PRT) optimizes real-time rendering by separating the rendering equation's integrand into two components: **lighting** and **light transport**. These components are precomputed and represented in the frequency domain, transforming complex integral calculations into efficient vector or matrix operations during shading.

### Precomputing Lighting and Light Transport

PRT separates the rendering equation's integrand into two components: **lighting** and **light transport**, which are precomputed to create two texture images.

* **Rendering Equation Separation**  
   The rendering equation is expressed as:  
   $$
   \begin{align} 
   \underset{\text{Shading result}}{\underbrace{L_o(\omega_o)}} &= \int_{\Omega^+} \underset{\text{Lighting}}{\underbrace{L_i(\omega_i)}} \cdot \underset{\text{BRDF}}{\underbrace{f_r(\omega_i, \omega_o) \cos\theta_i}} \cdot \underset{\text{Visibility}}{\underbrace{V(\omega_i)}} \, \mathrm{d}\omega_i  \notag  \\ 
   &= \int_{\Omega^+} \underset{\text{Lighting}}{\underbrace{L_i(\omega_i)}} \cdot \underset{\text{Light Transport, } T(\omega_i, \omega_o)}{\underbrace{f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i)}} \, \mathrm{d}\omega_i   \notag 
   \end{align}
   $$

   - **Lighting**: $L_i(\omega_i)$, the incoming light distribution.  
   - **Light Transport**: $T(\omega_i, \omega_o)$ combines BRDF, cosine attenuation, and visibility.

* **Frequency Domain Transformation**  
   Lighting and light transport are transformed into the frequency domain as linear combinations of basis functions $B_i(\omega_i)$:
   $$
   \begin{align} 
   L_i(\omega_i) &= \sum_p \underset{\text{Lighting coefficients}}{\underbrace{l_p}} \cdot \underset{\text{Basis function}}{\underbrace{B_p(\omega_i)}}  \notag \\ 
   T(\omega_i, \omega_o) &= \sum_q \underset{\text{Transport coefficients}}{\underbrace{t_q(\omega_o)}} \cdot \underset{\text{Basis function}}{\underbrace{B_q(\omega_i)}}   \notag 
   \end{align}
   $$

* **Orthogonal Basis System**  
   - The basis functions $B_i(\omega_i)$ form an orthogonal set, allowing any signal in the spatial domain to be expanded into its orthogonal series by computing the coefficients through a dot product operation:
   
     $$
     \begin{align}
     l_p &= \int_{\Omega^+} L_i(\omega_i) \overline{B_p(\omega_i)} \, \mathrm{d}\omega_i \notag  \\
     t_q(\omega_o) &= \int_{\Omega^+} T(\omega_i, \omega_o) \overline{B_q(\omega_i)} \, \mathrm{d}\omega_i \notag 
     \end{align}
     $$

* **Dot Product in Extended Space**  
   - The dot product for complex-valued functions is defined as the integral of the product of one function and the conjugate of the other over the given domain.  
   - This simplifies computational operations during shading.

#### Key Points

- **Lighting** and **light transport** are precomputed in the frequency domain, enabling efficient real-time rendering.  
- Orthogonal basis systems allow clean and stable decomposition of spatial signals into coefficients.  
- The PRT framework transforms expensive integral operations into simple linear algebra.

### Spherical Harmonics (SH) in PRT

PRT commonly uses **spherical harmonics (SH)** as basis functions for transformations.  

- Many functions in real-time rendering, such as $L_i(\omega_i)$ and $T(\omega_i)$, are defined on a sphere.  
   - Using 2D Fourier transform for such functions may introduce seams on the spherical domain when reconstructing signals, while SH functions avoid this issue.  

- **Environmental lighting maps** can be stored as cube maps, and each face of the cube can be processed individually with SH transformations.  

- **Additional benefits of SH**:
   - SH allows for efficient computation of coefficients when rotating a light source.  
   - SH basis functions form an orthonormal basis:  
     - $\int_{\Omega} B_n(\omega) B_m(\omega) \, \mathrm{d}\omega = 0$ for $m \ne n$, and  
     - $\int_{\Omega} \left[B_n(\omega)\right]^2 \, \mathrm{d}\omega = 1$.  
     - This property ensures stability and simplifies mathematical operations.  


- **Low-Order SH for Efficiency**:
    - Retaining only low-order SH terms in the frequency domain reduces computational complexity while maintaining acceptable accuracy for low-frequency effects like **diffuse lighting**.  

- **Limitations of SH and Alternatives**

    - SH is well-suited for low-frequency information, such as diffuse reflections. However, describing high-frequency details (e.g., specular highlights) requires higher-order SH terms, which increase computational cost.  

    - To address this, some research explores alternative basis functions like the **wavelet transform**, which can capture high-frequency details more efficiently.

### PRT Diffuse Case

For materials with Lambertian reflectance, the BRDF is constant, and the light transport becomes independent of $\omega_o$:  
$$ 
f_r(\omega_i, \omega_o) = \rho \quad \text{and} \quad T(\omega_i, \omega_o) = T(\omega_i).
$$

During integration in the rendering equation, the BRDF can be factored out:  
$$
\begin{align} 
L(\omega_o) &= \int_{\Omega^+} L_i(\omega_i) \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&= \int_{\Omega^+} \sum_p \left[l_p \cdot B_p(\omega_i)\right] \cdot \rho \cdot \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&= \rho \sum_p l_p \int_{\Omega^+} B_p(\omega_i) \cdot \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&= \rho \sum_p l_p \cdot T_p(\omega_i)  \notag \\ 
&= \rho \cdot  \notag 
\begin{bmatrix} 
l_0 & l_1 & \cdots & l_p 
\end{bmatrix} 
\begin{bmatrix} 
T_0(\omega_i) & T_1(\omega_i) & \cdots & T_p(\omega_i) 
\end{bmatrix}^T. 
\end{align}
$$

Alternatively, the process can be expressed as:  
$$
\begin{align} 
L(\omega_o) &= \int_{\Omega^+} L_i(\omega_i) \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&= \int_{\Omega^+} \sum_p \left[l_p \cdot B_p(\omega_i)\right] \cdot \sum_q \left[t_q \cdot B_q(\omega_i)\right] \,\mathrm{d}\omega_i  \notag \\ 
&= \rho \sum_p \sum_q l_p \cdot t_q \cdot \int_{\Omega^+} B_p(\omega_i) \cdot B_q(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&\text{Note: } \int_{\Omega^+} B_p(\omega_i) \cdot B_q(\omega_i) \,\mathrm{d}\omega_i = 
\begin{cases} 
1 & \text{if } p = q \\ 
0 & \text{if } p \ne q 
\end{cases}  \notag \\
&\text{Thus, } L(\omega_o) = \rho \cdot \sum_k l_k t_k \quad \text{where } k = \min\{p, q\} \notag  \\ 
&= \rho \cdot 
\begin{bmatrix} 
l_0 & l_1 & \cdots & l_k 
\end{bmatrix} 
\begin{bmatrix} 
t_0 & t_1 & \cdots & t_k 
\end{bmatrix}^T.  \notag 
\end{align}
$$

For diffuse surfaces, the PRT shading computation at any point on the surface simplifies to a **dot product between two vectors**.  

- For diffuse surfaces, using **up to third-order spherical harmonics** typically achieves good approximations.

### PRT Glossy Case


For rendering equations involving glossy materials, the formula is given by:

$$
\begin{align} 
L(\omega_o) &= \int_{\Omega^+} L_i(\omega_i) \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i  \notag \\ 
&= \int_{\Omega^+} \sum_p \left[l_p \cdot B_p(\omega_i)\right] \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i \notag \\ 
&= \sum_p l_p \underbrace{\int_{\Omega^+} B_p(\omega_i) \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i}_{T_p(\omega_i, \omega_o)}\notag  \\ 
&= \sum_p l_p \cdot T_p(\omega_i, \omega_o)\notag  \\ 
&= 
\begin{bmatrix} 
l_0 & l_1 & \cdots & l_p 
\end{bmatrix} 
\begin{bmatrix} 
T_0(\omega_i, \omega_o) \\ 
T_1(\omega_i, \omega_o) \\ 
\vdots \\ 
T_p(\omega_i, \omega_o) 
\end{bmatrix}.\notag 
\end{align}
$$

Alternatively, consider expanding the incoming radiance $L_i(\omega_i)$ and the reflectance $f_r(\omega_i, \omega_o)$ in terms of spherical harmonics:

$$
\begin{align} 
L(\omega_o) &= \int_{\Omega^+} L_i(\omega_i) \cdot f_r(\omega_i, \omega_o) \cos\theta_i V(\omega_i) \,\mathrm{d}\omega_i \notag \\ 
&= \int_{\Omega^+} \sum_p \left[l_p \cdot B_p(\omega_i)\right] \cdot \sum_q \left[t_q(\omega_o) \cdot B_q(\omega_i)\right] \,\mathrm{d}\omega_i \notag \\ 
&= \sum_p \sum_q l_p \cdot t_q(\omega_o) \cdot \int_{\Omega^+} B_p(\omega_i) \cdot B_q(\omega_i) \,\mathrm{d}\omega_i \notag \\ 
&\text{Note: } \int_{\Omega^+} B_p(\omega_i) \cdot B_q(\omega_i) \,\mathrm{d}\omega_i = 
\begin{cases} 
1 & \text{if } p = q \\ 
0 & \text{if } p \ne q 
\end{cases} \notag \\ 
&\text{Thus, } L(\omega_o) = \sum_k l_k t_k(\omega_o), \quad \text{where } k = \min\{p, q\}.\notag 
\end{align}
$$

Next, expand the coefficient $t_k(\omega_o)$ in terms of an orthogonal basis $\{B_r(\omega_o)\}$:

$$
t_k(\omega_o) = \sum_r \underbrace{t_{k,r}(\omega_o)}_{\text{Transfer matrix element}} \cdot \underbrace{B_r(\omega_o)}_{\text{Basis function}}.
$$

Substitute this back into the equation:

$$
\begin{align} 
L(\omega_o) &= \sum_k l_k t_k(\omega_o) \notag \\ 
&= \sum_k l_k \sum_r t_{k,r} B_r(\omega_o) \notag \\ 
&= 
\begin{bmatrix} 
l_0 & l_1 & \cdots & l_k 
\end{bmatrix} 
\begin{bmatrix} 
t_{0,0} & t_{0,1} & \cdots & t_{0,r} \\ 
t_{1,0} & t_{1,1} & \cdots & t_{1,r} \\ 
\vdots & \vdots & \ddots & \vdots \\ 
t_{k,0} & t_{k,1} & \cdots & t_{k,r} 
\end{bmatrix} 
\begin{bmatrix} 
B_0(\omega_o) \\ 
B_1(\omega_o) \\ 
\vdots \\ 
B_r(\omega_o) 
\end{bmatrix}.\notag 
\end{align}
$$

For glossy materials, the process for shading a point on a surface using PRT requires the following:
- Glossy materials demand higher-order spherical harmonics compared to diffuse surfaces. 
- In academic research, even 10th-order spherical harmonics may sometimes be insufficient for representing highly glossy surfaces effectively.

# Real-Time Global Illumination  

**Global Illumination (GI)** refers to the comprehensive lighting effects in a scene, encompassing both direct and indirect lighting. It plays a crucial role in creating realistic graphics but is computationally complex.  

In **real-time rendering (RTR)**, global illumination typically considers:  
- **Direct lighting** effects.  
- **Indirect lighting** effects that involve light scattering once between surfaces in the scene.  

When a surface illuminated by a primary light source acts as a **secondary light source**, it scatters light and contributes to indirect lighting. Achieving this effect involves two core tasks:  

1. **Identifying secondary light sources**:  
   - These are surfaces directly lit by the primary light source.  

2. **Calculating the contribution of secondary sources**:  
   - The indirect lighting contribution of secondary light sources to the shading point is computed.  


## Image-Space Algorithms  

To compute direct lighting effects, algorithms often use a **depth map** generated from the light source's perspective.  

For global illumination algorithms, if indirect lighting calculations rely solely on:  
- **Camera-view information** (e.g., screen space data).  
- **Depth maps** (generated from the light's perspective).  
- And do **not** utilize additional 3D scene information from other viewpoints.  

Then such algorithms are categorized as **image-space algorithms**.  

## Reflective Shadow Maps (RSM)

**Reflective Shadow Maps (RSM)** is a real-time global illumination algorithm based on shadow maps. Shadow maps generated from the light source's perspective store information about surfaces directly illuminated by the light source. These directly lit surfaces act as **secondary light sources**, reflecting light to indirectly illuminate the scene. RSM are frequently used in video games for effects such as **flashlight illumination**.

### Key Concepts in RSM  

- Each **pixel in the shadow map** corresponds to a surface patch in the scene.  
- **Diffuse material assumption**:  
   - RSM assumes these surface patches are diffuse, enabling the estimation of **radiant flux**.  
   - The algorithm ignores visibility between secondary sources and shaded points, allowing efficient sampling to estimate indirect lighting.  

### Steps in the RSM Algorithm  

1. **Generate the Reflective Shadow Map**:  
   - In addition to storing scene **depth**, RSM records the following data for each pixel:  
     - **World-space coordinates** of the surface.  
     - **Surface normal vector**.  
     - **Reflected direct lighting flux**.  

2. **Calculate contributions during shading**:  
   - Using the recorded data, RSM computes the contributions of direct and indirect lighting for a given point in the scene.  

The derivation of the RSM algorithm for indirect lighting at shading point $p$ is as follows:

* **The rendering equation for indirect illumination at point $p$ from a surface patch $q$:**
    
    $$L_o^{\text{indir}}\left(p ,\, \omega_o\right) = \int_{A_\text{patch}} L_i\left(q \to p\right) f_{r}\left( p ,\, q \to p ,\, \omega_o \right) \cos\theta_p \cdot V\left( p \leftrightarrow q \right) \cdot \frac{\cos\theta_q \, \mathrm{d}A}{\left\| q - p \right\|^2}$$
    * $\cos\theta_p$: Cosine of the angle between the normal at $p$ and the incident direction $\overrightarrow{pq}$.
    * $\cos\theta_q$: Cosine of the angle between the normal at $q$ and the outgoing direction $\overrightarrow{qp}$.
    * $\mathrm{d}A$: Differential area element at $q$.
    * $d\omega=\frac{dA\cos\theta^{\prime}}{\|x^{\prime}-x\|^2}$: Definition of the solid angle is the projected area on the unit sphere.

* **Incoming radiance $L_i(q \to p)$:** $$L_i\left(q \to p\right) = f_r\left(q ,\, \omega_i \to \omega_o\right) \cdot \frac{\Phi_q^{\prime}}{\mathrm{d}A}$$
    * Assuming the patch at $q$ is diffuse:
        
        $$f_r\left(q ,\, \omega_i \to \omega_o\right) = \frac{\rho_q}{\pi}$$
        
        where $\rho_q$ is the reflectance at $q$.
        
    * $\Phi_q^{\prime}$: Radiant flux received by $q$ from direct illumination.
        
* **Visibility $V(p \leftrightarrow q)$:** 
    - RSM assumes visibility is ignored $$ V\left( p \leftrightarrow q \right) = 1$$


* **Final expression for indirect illumination at $p$:**  
    - Substituting all components:
    
    $$L_o^{\text{indir}}\left(p ,\, \omega_o\right) = \int_{A_\text{patch}} \left( \frac{\rho_q}{\pi} \cdot \frac{\Phi_q^{\prime}}{\mathrm{d}A} \right) f_{r}\left( p ,\, q \to p ,\, \omega_o \right) \cos\theta_p \cdot \frac{\cos\theta_q \, \mathrm{d}A}{\left\| q - p \right\|^2}$$
    
    - Replacing the integral with a sum over sampled patches $q$:
    
    $$L_o^{\text{indir}}\left(p ,\, \omega_o\right) = \sum_{q}\left[ f_{r}\left( p ,\, q \to p ,\, \omega_o \right) \cdot \frac{\rho_q}{\pi} \Phi_q^{\prime} \frac{\cos\theta_p \cos\theta_q}{\left\| q - p \right\|^2} \right]$$
    
    - Simplifying further:
    
    $$L_o^{\text{indir}}\left(p ,\, \omega_o\right) = \sum_{q}\left[ f_{r}\left( p ,\, q \to p ,\, \omega_o \right) \cdot \Phi_q \frac{\cos\theta_p \cos\theta_q}{\left\| q - p \right\|^2} \right]$$
    
    where $\Phi_q = \frac{\rho_q}{\pi} \Phi_q^{\prime}$ represents the radiant flux reflected by $q$ due to direct illumination.


### Acceleration

- A depth map with a resolution of $512 \times 512$ contains over **260,000 surface patches** $q$, each acting as a secondary light source.  
  - Calculating the contribution of indirect illumination from all these patches is computationally expensive.  
- **Sampling surface patches** can significantly reduce computation costs:  
  - The shading point is projected onto the depth map.  
  - Patches farther from the shading point are assigned **lower sampling probability densities** but **higher sampling weights**.  
  - This strategy selects a subset of patches and estimates the indirect illumination as the **expected value** of the samples.  
  
### Pros and Cons

**Pros:**
- **Easy to implement**: Integrates smoothly with existing shadow map pipelines.

**Cons:**
- **Linear performance scaling**: Performance becomes increasingly costly with the number of light sources.
- **Lack of visibility checks** for indirect illumination: Ignores occlusions between secondary light sources and shading points, which can affect realism.
- **Assumptions made**:  
  - Assumes surfaces are diffuse reflectors.  
  - Assumes depth equals distance, which may not always be the case.
- **Sampling rate vs. quality tradeoff.**

## World Space Algorithms

World space algorithms are a category of global illumination techniques that, in addition to using **image space information** from both the camera’s and light source’s viewpoints, also utilize **3D information about the scene** directly within the world space. 


## Light Propagation Volumes (LPV)

The **Light Propagation Volumes (LPV)** algorithm approximates indirect lighting by dividing the scene into a 3D grid and propagating radiance from secondary light sources through this grid. This method captures an approximate **radiance field** without performing detailed visibility checks between shading points and secondary light sources.

### Key Principles of LPV

1. **3D Grid and Radiance Field Propagation**:  
    The scene is divided into **3D grid cells (voxels)**, and radiance from secondary light sources is propagated across these cells to approximate the indirect lighting radiance field.
    
2. **Handling Diffuse Surfaces**:  
    LPV does not make assumptions about secondary light source materials. However, **high-frequency details are lost** during radiance propagation, making it behave similarly to diffuse materials.
    
3. **No Visibility Checks Between Grid Cells**:  
    For efficient propagation, LPV ignores visibility checks between grid cells, leading to potential artifacts such as light leaking.
    

### Indirect Lighting Computation with LPV

* For any shading point $p$, **indirect radiance** $L_i^{\text{indir}}(p ,\, \omega_i)$ is obtained directly from the 3D grid. This allows indirect illumination to be calculated through the rendering equation:
    
    $$L_o^{\text{indir}}(p ,\, \omega_o) = \int_{\Omega^{+}} \underbrace{L_i^{\text{indir}}(p ,\, \omega_i)}_{\text{Obtained from radiance field}} \, f_r(p, \omega_i, \omega_o) \cos\theta_p \, \mathrm{d}\omega_i $$

### LPV Process Steps

1. **Generate Secondary Light Sources**:  
    * Using a **Reflective Shadow Map (RSM)**, the algorithm identifies scene surfaces illuminated by direct lighting. Each RSM pixel represents a **secondary light source**. For optimization, these surfaces are sampled to create virtual point lights.  
    
2. **Inject Radiance into the 3D Grid**:
    
    * The scene is pre-divided into a **3D grid**.
    * For each grid cell, the virtual point lights within it are gathered, and their radiance distribution is combined.
    * This radiance is projected onto **spherical harmonics (SH)**. Only the first two orders (four basis functions) are typically used in industry to reduce computational costs.
3. **Propagate Radiance Through the Grid**:
    
    * Each cell collects radiance from its neighboring cells, updating its **directional radiance distribution** after each iteration.
    * This propagation is repeated **4–5 times** until the radiance distribution stabilizes.
4. **Render Using Grid Radiance Data**:
    
    * During rendering, each shading point retrieves indirect lighting from its corresponding grid cell's stored **directional radiance distribution**.

### Limitations and Artifacts

* **Light Leaking**:  
    LPV can suffer from **light leaking** if grid cells are too large compared to the scene geometry. This is because LPV assumes **uniform radiance distribution within each cell**, which can cause unintended illumination on surfaces behind the actual illuminated geometry.

## Voxel Global Illumination (VXGI)

**Voxel Global Illumination (VXGI)** is an algorithm that achieves a global illumination effect closer to ray tracing compared to other techniques like RSM and LPV, though it generally has a higher computational cost.

### Core Concept of VXGI

- **Voxelization and Sparse Octree Structure**:  
  Before execution, the entire scene is discretized into **voxels** and organized into a **sparse octree** structure, creating a hierarchical data structure.

- **Photon Mapping Approach**:  
  Similar to photon mapping in offline rendering, VXGI "casts photons" from the light source into the scene to collect information on secondary light sources. This information is later used during shading to calculate indirect lighting contributions.


### VXGI Process Steps

1. **Photon Injection from Light Source**:  
   - Photons are cast from the light source into the scene.
   - Each voxel that receives photons records **incident radiance and surface normal distributions**. This information is stored in the leaf nodes of the sparse octree.

2. **Radiance Propagation Up the Octree**:  
   - For each non-leaf node, **filtering is applied** to the data from its child nodes. This creates a hierarchical representation of radiance and normal distributions, allowing coarser approximations of secondary light sources at each level of the octree.

3. **Cone Tracing for Shading**:  
   - During rendering, cone tracing is used to approximate indirect lighting. For each shading point, a **cone is traced** in the direction of reflection.
   - As the cone progresses, it accumulates both **indirect lighting contributions** and **occlusion effects** from the voxels it intersects, simulating light bouncing and shading.

### Handling Different Surface Materials

- **Glossy Surfaces**:  
  For glossy surfaces, cone tracing follows the ideal reflection direction, using a single cone for indirect lighting.

- **Diffuse Surfaces**:  
  For diffuse surfaces, multiple cones (e.g., 8 cones) are used to approximate the scattered light. Gaps between cones are usually negligible in their impact.

### Cone Tracing and Sparse Octree Acceleration

* **Cone Tracing Optimization**:  
    Cone tracing in VXGI leverages the **sparse octree structure** for efficiency. As the cone progresses along its axis, the current cone radius determines the appropriate **octree level**. At each step, interpolation is used to acquire **geometry and lighting information** from the corresponding voxel, which contributes to indirect lighting and occlusion.
    
* **Indirect Lighting and Occlusion Calculation**:  
    Each voxel's **indirect lighting contribution** and **occlusion factor** are accumulated to compute the final indirect illumination and occlusion at the shading point.
    
    * Indirect lighting contribution $c$ is computed with the formula: $c = \alpha c + \left(1-\alpha\right)\alpha_2 c_2$
    * Occlusion factor $\alpha$ is updated as: $\alpha = \alpha + \left(1-\alpha\right) \alpha_2$

### VXGI vs. LPV and RSM

* **Voxelization vs. 3D Grids**:
    
    * VXGI requires **voxelization of the entire scene**, which is resource-intensive. Unlike LPV, where grid cells have no direct correlation with scene geometry, VXGI’s voxel representation is tied closely to the actual objects, adding complexity and resource demands.
* **Material Flexibility**:
    
    * **RSM** assumes surfaces are **diffuse** when acting as secondary light sources.
    * **LPV** similarly captures mostly low-frequency, diffuse-like lighting by projecting directional radiance onto spherical harmonics.
    * **VXGI** allows both **diffuse and glossy materials** as secondary light sources, making it a more flexible choice.

* **Direct vs. Indirect Calculation**:
    
    * LPV uses radiance propagation within a 3D grid to approximate the influence of secondary lighting on a shading point.
    * **RSM** directly calculates secondary lighting influence but does not account for visibility between points.
    * **VXGI** directly calculates secondary light contributions while accounting for **visibility** using cone tracing, offering more accurate occlusion and lighting.


### Advantages and Trade-Offs

* **Quality and Realism**:
    * **VXGI** offers a global illumination quality closer to **ray tracing**, with fewer assumptions than LPV and RSM, achieving higher realism at the cost of computational intensity.
* **Resource Demand**:
    * **Voxelization complexity** and high **resource consumption** limit VXGI’s applicability, especially in real-time graphics under constrained hardware.

### Application Example

* **Marvel's Spider-Man**:
    * This game demonstrates VXGI's high-quality global illumination, resulting in realistic and immersive lighting effects.

## Screen Space Algorithms

  Screen space algorithms for **global illumination** generate indirect lighting effects using only information from the **camera's view**. This approach applies **post-processing** to a scene rendered with only direct lighting, adding indirect lighting effects afterward.

### SSAO (Screen Space Ambient Occlusion)

SSAO (Screen Space Ambient Occlusion) is a technique used to approximate global illumination effects in screen space. The method assumes **constant indirect lighting** and that all surfaces are **diffuse materials**. By estimating the **visibility of shading points**, SSAO directly calculates the effects of indirect illumination.


For **uniform incident lighting** ($L_i = \text{constant}$) and **diffuse BSDF** ($f_r = \frac{\rho}{\pi}$), both terms can be factored out of the integral:

$$ L_o(p, \omega_o) = \int_{\Omega^+} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) V(p, \omega_i) \cos \theta_i \, \mathrm{d}\omega_i $$ 
$$= \frac{\rho}{\pi} \cdot L_i(p) \cdot \int_{\Omega^+} V(p, \omega_i) \cos \theta_i \, \mathrm{d}\omega_i $$


### Derivation of SSAO

The derivation of Screen Space Ambient Occlusion (SSAO) starts from the **rendering equation**:

$$L_o(p,\omega_o) = \int_{\Omega^+} L_i(p,\omega_i) f_r(p,\omega_i,\omega_o) V(p,\omega_i) \cos\theta_i \, \mathrm{d}\omega_i$$

Where:

* $L_o(p, \omega_o)$: Outgoing radiance at point $p$ in direction $\omega_o$.
* $L_i(p, \omega_i)$: Incoming radiance at $p$ from direction $\omega_i$.
* $f_r$: Bidirectional scattering distribution function (BSDF).
* $V(p, \omega_i)$: **Visibility function**, indicating whether light reaches $p$ from $\omega_i$.
* $\cos \theta_i$: Angle between surface normal and incoming light.
* $\Omega^+$: Hemisphere above the surface at $p$.

#### Separating the Visibility Term

The equation is approximated by isolating the **visibility function $V(p, \omega_i)$**:

$$
L_o^{\text{indir}}(p, \omega_o) \approx  
\frac{\int_{\Omega^+} V(p, \omega_i) \cos \theta_i \, \mathrm{d}\omega_i}{\int_{\Omega^+} \cos \theta_i \, \mathrm{d}\omega_i}  
\cdot \int_{\Omega^+} L_i^{\text{indir}}(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos \theta_i \, \mathrm{d}\omega_i 
$$

* The first term represents **weight-averaged visibility** ($\overline{V}$) over all directions:
    
    $$
    \frac{\int_{\Omega^+} V(p, \omega_i) \cos \theta_i \, \mathrm{d}\omega_i}{\int_{\Omega^+} \cos \theta_i \, \mathrm{d}\omega_i}  
    \triangleq k_A 
    $$
* For Ambient Occlusion (AO), $k_A$ simplifies to:
    
    $$
    k_A = \frac{\int_{\Omega^+} V(p, \omega_i) \cos \theta_i \, \mathrm{d}\omega_i}{\pi} 
    $$

* The second term simplifies under assumptions of **diffuse BSDF** and **uniform indirect lighting**:

    * $L_i^{\text{indir}}(p, \omega_i)$: Assumed constant ($L_i^{\text{indir}}(p)$).
    * Diffuse BRDF ($f_r = \frac{\rho}{\pi}$) is also constant.

* Thus:

$$
\int_{\Omega^+} L_i^{\text{indir}}(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos \theta_i \, \mathrm{d}\omega_i  
= L_i^{\text{indir}}(p) \cdot \frac{\rho}{\pi} \cdot \pi = L_i^{\text{indir}}(p) \cdot \rho 
$$

#### Why Include $\cos \theta_i$ in Visibility Term?

$$
\int_{\Omega} f(x) g(x) \, \mathrm{d}x \approx \frac{\int_{\Omega_G} f(x) \, \mathrm{d}x}{\int_{\Omega_G} \, \mathrm{d}x} \cdot \int_{\Omega} g(x) \, \mathrm{d}x
$$

For the approximation, the $ \mathrm{d}x $ term is replaced by the **projected solid angle** $\mathrm{d}x_\perp = \cos \theta_i \, \mathrm{d}\omega_i$.

* A projected solid angle is defined as $\mathrm{d}x_\perp = \cos \theta_i \, \mathrm{d}\omega_i$.
    
* Mapping the hemisphere ($\Omega^+$) to a **unit disk** results in an integration equal to the area of the disk ($\pi$):
    
    $$
    \int_{\Omega^+} \cos\theta_i \, \mathrm{d}\omega_i = \pi
    $$


### Real-Time Computation of $k_A(p)$ in SSAO

To compute $k_A(p)$ in real time, SSAO uses **random sampling** within a sphere centered at the shading point. These samples are tested for **visibility** using the **depth buffer (z-buffer)** to determine whether they are visible from the camera. The ratio of visible samples is used to estimate the visibility of the shading point.

#### Key Points

* **Surface Normal Direction Ignored**:  
    SSAO does not account for the **surface normal direction** of the shading point during visibility estimation.
    * To mitigate this, SSAO only applies if **more than half** of the sample points are occluded.
* **Cosine Weighting Not Applied**:  
    The average visibility $k_A(p)$ is calculated without **cosine weighting**, which makes the result **physically inaccurate**. However, it still produces visually plausible results.
    
* **Camera Visibility vs. Shading Point Visibility**:
    
    * **Camera visibility** derived from the z-buffer may differ from the true **shading point visibility**.
    * The z-buffer only provides an **approximation** of the scene's geometry, leading to potential inaccuracies like **false occlusions** (shadows where there should be none).


#### Sampling in SSAO

* **Number of Samples**:
    
    * Increasing the number of samples improves accuracy.
    * For performance reasons, **only ~16 samples** are typically used.
* **Randomized Sampling**:
    
    * Sample positions are derived from a **randomized texture** to prevent banding artifacts.
* **Noise and Smoothing**:
    
    * The result often contains noise due to the limited sample count.
    * A **blur filter with edge preservation** is applied to smooth the output without sacrificing sharpness at object boundaries.

* **Limited Radius**:
    
    * SSAO is limited to a **local occlusion radius** to avoid capturing occlusion from distant objects.
    * This limitation is beneficial for **enclosed areas** like interiors, where distant occlusion would be unrealistic.
    
### Horizon-Based Ambient Occlusion (HBAO)  

HBAO is an improvement over SSAO, also implemented in **screen space**, and provides more accurate ambient occlusion by addressing the limitations of SSAO.  

#### Key Characteristics  
  
- **Normal Direction Considered**:  
  HBAO requires surface normals to be known and **only samples within a hemisphere** above the shading point, aligned with the normal.  


#### Why HBAO is More Accurate

- **Limited Range of Occlusion**:  
  - HBAO **only considers occlusion within a specific range**, avoiding SSAO's simplistic assumption where any nearby geometry is treated as fully occluding, regardless of distance.  
  - This approach reduces **false occlusions** and produces more accurate shading.  

- **Directional Sampling**:  
  - By sampling within a **bounded hemisphere**, HBAO incorporates the surface normal's influence, making the visibility calculation more physically accurate.  


### SSDO (Screen Space Directional Occlusion)

SSDO (Screen Space Directional Occlusion) improves upon SSAO by introducing the concept of **directional and non-uniform indirect lighting**, leading to more realistic global illumination effects.

#### Core Idea

* Unlike SSAO, which assumes indirect lighting comes from a constant and distant source, **SSDO assumes indirect lighting originates from nearby surfaces**.
* If an object occludes the shading point from the camera, the occluder acts as a **secondary light source**, contributing indirect illumination to the shading point.
* Direct lighting, meanwhile, enters the shading point from directions that are not occluded.

#### Advantages of SSDO

* **Non-Uniform Indirect Illumination**:
    
    * Indirect light is influenced by nearby surfaces, resulting in **color bleeding effects**.
    * The final global illumination effect is more realistic compared to SSAO's uniform approach.

#### Steps of the SSDO Algorithm

1. **Sampling in a Hemisphere**:
    
    * Around the shading point $P$, sample points within a hemisphere defined by the **normal $n$** and a fixed radius $r_\text{max}$.
    * Project these sample points into the **camera's shadow map** to find corresponding surface points in the scene.
2. **Occlusion and Secondary Source Detection**:
    
    * Compare the depth of the sampled surface points with the depth of the shading point $P$:
        * If a surface point's depth is **smaller** than $P$'s depth, it acts as a **potential secondary light source** that could occlude $P$.
        * If a surface point's depth is **greater**, it corresponds to a direction from which **direct light** reaches $P$.
3. **Indirect Lighting Accumulation**:
    
    * For potential secondary light sources, use their **surface normals** and **direct lighting information** to compute their contribution to $P$'s indirect illumination.
    * Accumulate the contributions to get the final indirect lighting at $P$.

#### **Example Workflow**

* For a given shading point $P$, with normal $n$:
    * Sample points $A, B, C, D$ within a hemisphere of radius $r_\text{max}$.
    * Project these points into the shadow map to locate their corresponding surface points.
    * Compare depths:
        * $C$'s depth is greater than $P$'s depth → $C$ represents a **direct lighting direction**.
        * $A, B, D$'s depths are smaller → They are **potential secondary light sources**.
    * Use surface normals and lighting data to determine indirect light contributions:
        * Only $B, D$ contribute indirect illumination based on their orientations.
    * Accumulate the indirect light contributions to compute the final shading for $P$.

### Issues with SSDO  

While SSDO can achieve near offline rendering quality, it has certain limitations that impact its accuracy and applicability.

* **Visibility Misjudgments**:
    
    * SSDO uses **depth comparisons** to determine visibility between the shading point and sample points.
    * This approach can lead to **errors when other objects obscure the sampled points**:
        * For example, a sample point $A$ corresponds to a surface point with depth $z_1$, smaller than the shading point $P$'s depth.
        * SSDO might incorrectly treat $A$ as a **secondary light source**, when it actually represents a direction of **direct lighting**.
* **Limited Sampling Range**:
    
    * SSDO only considers global illumination within a **small area** around the shading point.
    * If the source of indirect lighting is **too far** from the shading point, SSDO fails to capture its contribution, resulting in **inaccurate colors**.
* **Loss of Hidden Information**:
    
    * As a **screen-space algorithm**, SSDO only processes information visible from the **camera's perspective**.
    * Any occluded or off-screen surfaces are ignored, leading to a loss of potential indirect light contributions.

## Screen Space Reflection (SSR)

SSAO assumes indirect lighting comes from a distant source, while SSDO assumes it comes from near the shading point. In reality, indirect lighting can originate from both distant sources and nearby surfaces. **SSR (Screen Space Reflection)** simulates ray tracing in screen space, accounting for both distant and nearby indirect lighting.

SSR's execution, given a shading point $p$, involves three main steps:

1. **Determine possible incoming light directions** $\omega_i$ at the shading point:
   - Use an importance sampling method to generate possible reflection directions based on the surface's BRDF $f_r(p, \omega_i, \omega_o)$. This process samples more probable reflection directions and assigns them probability densities $\mathrm{pdf}(\omega_i)$.

2. **Trace rays in screen space along sampled directions**:
   - Rather than finding intersections in 3D world space (e.g., using BVH for 3D primitives), SSR finds intersections in 2D screen space. Here, it uses depth image pyramids (e.g., depth mipmaps) as a 2D acceleration structure.
   - If two shading points are close, their ray intersections with the scene may contribute to each other's indirect lighting, allowing intersection reuse to speed up calculations.
   - SSR can leverage prefiltering from the split sum method: apply a filter to screen-space information so that tracing a single ideal reflection ray yields results for multiple reflection directions. Since each point has a unique depth, depth variation must be considered during filtering.

3. **Calculate indirect lighting assuming diffuse surface at intersection**:
   - If the intersected surface at point $q$ is diffuse, use its color as the reflected light color $L_o(q, q \to p)$ and solve the rendering equation for indirect lighting:

   $$
   \begin{align} 
   L_o^{\text{indir}}(p, \omega_o) &= \int_{\Omega^+} L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i \,\mathrm{d}\omega_i \notag\\ 
   &= \sum_{\omega_i}\frac{L_i(p, \omega_i) f_r(p, \omega_i, \omega_o) \cos\theta_i}{ \mathrm{pdf}(\omega_i) } \notag\\ 
   &= \sum_q \frac{L_o(q, q \to p) f_r(p, q \to p, \omega_o) \cos\theta_i}{ \mathrm{pdf}(q \to p) } \notag
   \end{align}
   $$

SSR is essentially Monte Carlo ray tracing, capturing only direct lighting and indirect lighting from a single scatter. It assumes that surfaces scatter light as diffuse material and relies on **depth mipmaps** (2D) rather than 3D acceleration structures like BVH or k-d trees.

**Requires only scene information visible from the camera's perspective**, which is available from the geometry buffer in deferred rendering.

**Limitations**: Since depth mipmaps only store visible surfaces from the camera's perspective, SSR lacks information about surfaces occluded or outside the screen view.

**To prevent harsh reflection cutoffs for objects extending beyond the screen bounds**, SSR applies an additional decay factor when tracing reflection rays. Although not physically accurate, this produces more natural, progressively blurred reflections compared to abrupt cutoffs.

# Physically-Based Rendering

- **Definition**:  
  - **Physically-Based Rendering (PBR)** refers to rendering techniques where everything—materials, lighting, cameras, and light transport—is grounded in physical principles.

  - While PBR extends to various aspects of rendering, it is most commonly associated with **physically-based materials**.

- **PBR in Real-Time Rendering (RTR)**:  
  - Real-time rendering (RTR) often uses **approximations** for efficiency, making it less physically accurate than offline rendering.  
  - Examples include:  
    - **Microfacet Models**:  
      - Widely used for general surface modeling.  
      - These models are based on physics but are sometimes applied **in physically incorrect ways**.  
    - **Disney Principled BRDFs**:  
      - Designed for ease of use by artists rather than strict physical correctness.  

- **Handling Complex Scattering**:  
  - For materials like **participating media** (e.g., fog or smoke) or **hair**, where light scattering is complex, computations are often broken down into simpler stages:  
    - **Single Scattering**: Calculates light interacting with the medium once.  
    - **Multiple Scattering**: Estimates light interacting with the medium multiple times.  
    - The results from these computations are combined to produce the final effect.  
  - Example:  
    - **Dual Scattering Algorithm**: A fast approximation for modeling **multiple light scattering in hair**, widely used in real-time rendering for hair effects.


## Microfacet BRDF

**Microfacet Models** are physically-based local lighting models. They assume that a surface is composed of many tiny, flat microfacets, each capable of reflecting or refracting light perfectly. This roughness at the microscopic level leads to the macroscopic appearance of the surface.

The BRDF (Bidirectional Reflectance Distribution Function) for a microfacet model is given as:

$$f_\text{r}\left(\omega_i ,\, \omega_o \right) = \frac{F(\omega_i,\,h)\, G(\omega_i,\,\omega_o,\,h) \, D(h)}{4 \,\left| \omega_i\cdot n\right| \,\left| \omega_o\cdot n\right|}$$

* **Vectors**:
    
    * $n$: The macro surface **normal vector**.
    * $h = \frac{\omega_i + \omega_o}{\|\omega_i + \omega_o\|}$: The **halfway vector**, representing the microfacet's normal direction.
    * $\omega_i$: The incident light direction.
    * $\omega_o$: The outgoing light direction.
* **Terms in the BRDF**:
    
    * **Fresnel Term** $F(\omega_i, h)$:
        * Describes the **proportion of light** reflected at the boundary of two media, based on the angle of incidence and material properties.
    * **Normal Distribution Function (NDF)** $D(h)$:
        * Determines the fraction of microfacets aligned with the halfway vector $h$.
        * Governs how rough or smooth the surface appears.
    * **Shadowing-Masking Term** $G(\omega_i, \omega_o, h)$:
        * Accounts for **self-shadowing** and **masking** between microfacets.
        * Reduces the effective light contribution due to occlusion between microfacets.


### Fresnel Term

The **Fresnel Term** describes the proportion of light reflected by a surface as a function of the **incident angle** and **polarization** of light.

#### Fresnel Equations for Dielectrics

The Fresnel reflectance for **perpendicular** and **parallel polarization components** is given as:

**Perpendicular Polarization $R_s$:**

$$R_s = \left| \frac{\eta_i\cos\theta_i - \eta_t\cos\theta_t}{\eta_i\cos\theta_i + \eta_t\cos\theta_t} \right|^2$$

**Parallel Polarization $R_p$:**

$$R_p = \left| \frac{\eta_i\cos\theta_t - \eta_t\cos\theta_i}{\eta_i\cos\theta_t + \eta_t\cos\theta_i} \right|^2$$

The effective Fresnel term is:

$$R_\text{eff} = \frac{1}{2}(R_s + R_p)$$

* $\eta_i$, $\eta_t$: Refractive indices of the incident and transmitted media.
* For conductors (metals), $\eta_t$ becomes a **complex number** to account for the extinction coefficient.


#### Schlick's Approximation

Schlick's approximation simplifies the Fresnel term:

$$R_{\text{Schlick}}\left(\theta\right) = R_0 + (1 - R_0)(1 - \cos\theta)^5$$

* $R_0 = \left(\frac{\eta_i - \eta_t}{\eta_i + \eta_t}\right)^2$: Reflectance at normal incidence.
* **Accuracy:**
    * For dielectrics, average error $ < 1\%$, maximum error $ 3.6\%$ at high angles.
    * For metals, the extinction coefficient $k$ must be considered for better accuracy.

### Fresnel Approximations for Metals

1. **Lazániy and Szirmay-Kalos Approximation:**  
    Expands Schlick's model to include the extinction coefficient $k$:
    
    $$R_{\text{Lazániy}}(\theta) = \frac{(\eta - 1)^2 + k^2 + 4\eta(1 - \cos\theta)^5}{(\eta + 1)^2 + k^2}$$
    * For metals with large $\eta$ and $k$, additional compensation terms can reduce errors.
2. **Hoffman’s Approximation:**  
    Refines Lazániy’s approach with a correction term to minimize errors at grazing angles:
    
    $$R_{\text{Hoffman}}(\theta) \approx r + (1 - r)(1 - \cos\theta)^5 - a\cos\theta(1 - \cos\theta)^\alpha$$
    * $r = \frac{(\eta - 1)^2 + k^2}{(\eta + 1)^2 + k^2}$: Reflectance at normal incidence.
    * $\alpha = 6$, $a$: Derived parameters.

#### Key Observations

* **Schlick's approximation** is efficient but introduces significant errors for **metals** or at high grazing angles.
* **Advanced methods** (e.g., Lazániy, Hoffman) offer high accuracy, especially for metals like aluminum with large $k$.
* These advanced methods reduce errors to less than **0.65%**, significantly improving realism in metallic surfaces.

### Normal Distribution Function (NDF)

The **Normal Distribution Function (NDF)** determines the proportion of microfacet normals oriented toward a given direction $h$. It is the **probability density function (PDF)** defined over the hemisphere above a surface.

#### Key Properties of NDF

* The distribution's **mean** is the half-vector $h$.
* **Variance** describes material roughness:
    * **Small variance**: The distribution is concentrated, representing **glossy** materials.
    * **Large variance**: The distribution is spread out, representing **diffuse** materials.

#### Common NDF Models

1. **Beckmann Distribution**  
    Derived from a normal distribution in **slope space**:
    
    $$D_\text{Beckmann}(h) = \frac{1}{\pi \alpha^2 \cos^4\theta_h} e^{-\frac{\tan^2\theta_h}{\alpha^2}}$$
    * $\alpha$: Surface roughness parameter.
    * $\theta_h$: Angle between the microfacet normal and the surface normal.
2. **GGX Distribution (Trowbridge-Reitz)**  
    Known for its **long tail**, meaning probabilities decrease more gradually for deviations from the mean:
    
    $$D_\text{GGX}(h) = \frac{\alpha^2}{\pi \cos^4\theta_h (\alpha^2 + \tan^2\theta_h)^2}$$
    * Under the same level of roughness, **GGX produces more natural results** because its **long tail property** ensures a **smooth transition** from highlights to non-highlighted areas. In contrast, **Beckmann’s sharp falloff** causes highlights to abruptly terminate at grazing angles, which looks less realistic.

#### Generalized-Trowbridge-Reitz (GTR)

Brent Burley introduced the **GTR distribution** in the Disney Principled BRDF:

$$D_\text{GTR}(h) = \frac{c}{(\alpha^2\cos^2\theta_h + \sin^2\theta_h)^\gamma}$$

* $c$: Normalization constant.
* When $\gamma = 2$, $c = \frac{\alpha^2}{\pi}$, and GTR reduces to **GGX**.
* **Even longer tail** than GGX for more complex microfacet distributions.

#### Advanced NDF for Surface Effects

* Materials with **micro-scratches** or **glints** (e.g., slightly worn stainless steel under sharp lighting) require specialized NDFs.
* Simple bump mapping is insufficient to reproduce the intricate patterns caused by **near-field point lights**.
* **Yan et al.** proposed a more complex NDF for these scenarios.

#### Practical Considerations

* In real-time rendering, **simpler NDFs** like Beckmann or GGX are typically used for efficiency.
* Special cases, such as snow-covered surfaces, may justify the use of more advanced models.

### Shadowing-Masking Term   

The **shadowing-masking term**, also known as the **geometry term**, accounts for the attenuation of light due to self-shadowing and masking among microfacets on a surface.   

* **Near-Perpendicular Angles**:     
    When the light or viewing direction is almost **perpendicular to the surface**, there is minimal self-shadowing or masking. The geometry term approaches **1**, meaning little to no light attenuation occurs.   
    
* **Grazing Angles**:
    At **grazing angles**, where the light or view direction is nearly **parallel to the surface**, microfacets heavily shadow or mask each other. The geometry term approaches **0**, indicating significant light attenuation.

The geometry term works in conjunction with the **normal distribution function** to simulate the energy lost due to occlusion between microfacets.   

#### Smith Shadowing-Masking Approximation

Under the **Smith assumption**, the **bidirectional shadowing-masking term** can be factored into two independent terms for light and view directions:   

$$G\left(\omega_i,\,\omega_o,\,h\right) \approx G_1\left(\omega_i,\,h\right) \,G_1\left(\omega_o,\,h\right)$$

* **$G_1(\omega, h)$**: Represents the fraction of microfacets visible from the light or view direction independently.   
* This factorization simplifies calculations and is widely used in real-time rendering.   

## Kulla-Conty Approximation

While the shadowing and masking term $G(\omega_i, \omega_o, h)$ accounts for energy loss due to micro-surface occlusion, it does not consider energy that scatters multiple times between micro-surfaces before exiting.

* **Heitz et al.** proposed an accurate compensation method in their paper "Multiple-Scattering Microfacet BSDFs with the Smith Model" ([link](https://eheitzresearch.wordpress.com/240-2/)).
    
    * However, this method is computationally expensive and impractical for real-time rendering.
* **Kulla and Conty** introduced a simpler and more efficient method suited for real-time rendering ([slides](https://fpsunflower.github.io/ckulla/data/s2017_pbs_imageworks_slides_v2.pdf)). The key ideas are:

### Integral Estimation

For rough materials, the BRDF is smoother, allowing the following approximation for indirect lighting:

$$
\begin{align}  
L_{o,\,\text{indirect}}\left(p,\,\omega_o\right) &= \int_{\Omega^+} L_i\left(p,\,\omega_i\right) f_r\left(p,\,\omega_i \to \omega_o\right)\cos\left<\omega_i,\, n\right>\, \mathrm{d}\omega_i  \notag \\  
&= \int_{\Omega^+} L_i\left(p,\,\omega_i\right) \frac{F(\omega_i,\,h)\, G(\omega_i,\,\omega_o,\,h) \, D(h)}{4\,\left| \omega_i\cdot n\right| \,\left| \omega_o\cdot n\right|} \cos\left<\omega_i,\, n\right>\, \mathrm{d}\omega_i \notag \\  
&\approx \frac{\int_{\Omega^+} F(\omega_i,\,h)\,\mathrm{d}\omega_i}{\int_{\Omega^+}\mathrm{d}\omega_i} \cdot \int_{\Omega^+} L_i\left(p,\,\omega_i\right) \frac{G(\omega_i,\,\omega_o,\,h) \, D(h)}{4\,\left| \omega_i\cdot n\right| \,\left| \omega_o\cdot n\right|} \cos\left<\omega_i,\, n\right>\, \mathrm{d}\omega_i   \notag 
\end{align}
$$

### Albedo Approximation

To compute the **albedo** $E(\mu_o)$ for a specific direction $\mu_o$:

$$
E(\mu_o) = \int_0^{2\pi}\int_0^1 f\left(\mu_o,\,\mu_i,\,\phi\right)\mu_i\,\mathrm{d}\mu_i\mathrm{d}\phi
$$

### Energy Loss in Direction $\mu_o$

The energy $E(\mu_o)$ represents the total energy radiated out after one bounce under the assumption of uniform lighting and an isotropic BRDF. The integral expression is:

$$
E(\mu_o) = \int_0^{2\pi}\int_0^1 f(\mu_o, \mu_i, \phi)\mu_i \, \mathrm{d}\mu_i \mathrm{d}\phi
$$

* **Assumptions**:

    * **Lighting**: The incident radiance is uniform and normalized to 1. This simplifies the rendering equation by omitting the lighting term.
    * **Isotropic BRDF**: The BRDF $f(\mu_o, \mu_i, \phi)$ is independent of azimuthal angle $\phi$, meaning it depends only on $\mu_o$ and $\mu_i$.
    * **No Fresnel Term**: Assume $F(\omega_i, h) = 1$, meaning there is no angular-dependent reflectance.
    * **Uniform Lighting**: The result reflects the total energy emitted after one bounce when all incoming radiance is uniformly distributed.

* **Variables**:

    * $\mu = \sin\theta$: the projection of the incoming direction onto the surface normal.
    * The proportion of energy lost in direction $\mu_o$ is **$1 - E(\mu_o)$**.

### Average Albedo

The **average albedo** across all directions $E_\text{avg}$:

$$
E_\text{avg} = \frac{\int_0^1 E(\mu)\mu\,\mathrm{d}\mu}{\int_0^1 \mu\,\mathrm{d}\mu} = 2\int_0^1 E(\mu)\mu\,\mathrm{d}\mu
$$

* The total **energy loss proportion** is $1 - E_\text{avg}$, which includes:
    * Energy absorbed by the material.
    * Energy that exits after multiple scattering.


### Fresnel Term and Multiple Scattering Compensation

#### Average Fresnel Term

The average Fresnel term $F_\text{avg}$ is calculated as:

$$
F_\text{avg} = \frac{\int_0^1 F(\mu) \mu \, \mathrm{d}\mu}{\int_0^1 \mu \, \mathrm{d}\mu} = 2 \int_0^1 F(\mu) \mu \, \mathrm{d}\mu
$$

#### Energy Distribution After Surface Incidence

When light interacts with a surface:

* **First Reflection**: The proportion of energy directly visible is $F_\text{avg} E_\text{avg}$.
* **One Bounce of Scattering**: Visible energy proportion is $F_\text{avg}(1-E_\text{avg}) \cdot F_\text{avg} E_\text{avg}$.
* **Two Bounces of Scattering**: Visible energy proportion is $F_\text{avg}(1-E_\text{avg}) \cdot F_\text{avg}(1-E_\text{avg}) \cdot F_\text{avg} E_\text{avg}$.
* **k Bounces of Scattering**: Visible energy proportion is: $$F^k_\text{avg}(1-E_\text{avg})^k \cdot F_\text{avg} E_\text{avg}$$


#### Total Multiple Scattering Contribution

The total energy proportion from all bounces is:

$$
f_\text{add} = \frac{\sum_{k=1}^\infty F^k_\text{avg}(1-E_\text{avg})^k \cdot F_\text{avg} E_\text{avg}}{1-E_\text{avg}} = \frac{F^2_\text{avg}E_\text{avg}}{1-F_\text{avg}(1-E_\text{avg})}
$$


### Final BRDF with Compensation

The final BRDF compensating for multiple scattering is:

$$
f_r = f_\text{micro} + f_\text{add} \cdot f_\text{ms}
$$

* **$f_\text{micro}$**: The microfacet model’s original BRDF.
* **Pre-computed values**:
    * Average albedo $E_\text{avg}$,
    * Compensation factor $f_\text{ms}$,
    * Average Fresnel term $F_\text{avg}$.

These values can be pre-calculated and directly used during rendering.

### Compensation Factor $f_\text{ms}$

Kulla and Conty proposed a compensation factor for lost multiple scattering energy:

$$
f_\text{ms}(\mu_o, \mu_i) = \frac{[1-E(\mu_o)][1-E(\mu_i)]}{\pi(1-E_\text{avg})}
$$

#### Validation

The compensation factor $f_\text{ms}$ ensures energy conservation:

$$
\begin{align}  
E_\text{ms}(\mu_o) &= \int_0^{2\pi} \int_0^1 f_\text{ms}(\mu_o, \mu_i, \phi) \mu_i \, \mathrm{d}\mu_i \mathrm{d}\phi \notag \\  
&= 2\pi \int_0^1 \frac{[1-E(\mu_o)][1-E(\mu_i)]}{\pi(1-E_\text{avg})} \mu_i \, \mathrm{d}\mu_i \notag\\  
&= \frac{1-E(\mu_o)}{1-E_\text{avg}} \cdot (1-E_\text{avg}) \notag\\  
&= 1-E(\mu_o) \text{ (equal to the lost energy proportion).}  \notag
\end{align}
$$

### Other Energy Compensation Methods

A physically accurate BRDF consists of two terms:

$$
f(\omega_i, \omega_o) = f_\text{micro}(\omega_i, \omega_o) + f_\text{multi}(\omega_i, \omega_o)
$$


* The approximation of $f_\text{multi}$ by Kulla and Conty is **physically correct**.
* To simplify, some methods use diffuse lobes to approximate $f_\text{multi}$.
    * However, directly adding diffuse lobes leads to **non-conservation of energy** and is **physically incorrect**.

* Some research focuses on constructing **energy-conserving diffuse lobes** to approximate $f_\text{multi}$.

# Non-Photorealistic Rendering (NPR)

NPR focuses on creating stylized images that mimic artistic styles rather than photorealistic scenes. Its primary goal in real-time rendering is to produce **fast and reliable stylized results** using lightweight techniques in shaders.

* **Deep learning methods** are generally unsuitable due to performance and reliability concerns.
* NPR research has declined, with the NPAR conference inactive since 2017.

The general approach starts with realistic rendering and abstracts it to emphasize key features, producing a stylized result. Common styles include:

* **Cartoon style**: Uses outlines to emphasize object contours and employs discrete color blocks.
* **Sketch style**: Utilizes textures with varying line densities to create a sketch-like appearance.

## Outline Rendering

To emphasize object contours, various techniques can be applied:

* **Shading-based approach**:
    
    * Darken surfaces with normals nearly perpendicular to the view direction.
    * This approach may produce uneven line thickness.
* **Geometry-based approach**:
    
    * Enlarge back-facing surfaces relative to front-facing ones before shading.
    * Assign black color to back-facing surfaces, creating a visible black outline around the object.
* **Post-processing approach**:
    
    * Use edge-detection algorithms like the **Sobel operator** to extract outlines in screen space.

## Color Blocks

Discrete color blocks can be achieved using **thresholding** to create sharp boundaries between regions of different colors.

## Sketch Style

In the paper [Real-time Hatching](https://hhoppe.com/hatching.pdf) (2001) by Praun et al., a method for sketch-style rendering was introduced, which represents surface variations using line textures of different densities.

* **Tonal Art Maps (TAMs)**:
    
    * TAMs consist of textures with line patterns at various densities, each with its own **MIPMAP levels**.
    * **MIPMAP levels within a TAM share the same density**, ensuring consistent texture quality.
    
* **Shading Process**:
    
    * Select appropriate textures based on the **brightness and position** of shading points.

# Real-Time Ray Tracing

* **Key Technique**: Uses acceleration structures like BVH (Bounding Volume Hierarchy) or KD-Tree for efficiently finding ray-object intersections.
* **Hardware Role**: NVIDIA RTX GPUs introduced dedicated RT cores to accelerate ray-tracing tasks, such as BVH traversal and intersection calculations, allowing significantly more rays to be processed.

## RTX and Path Tracing in Real-Time Applications

**RTX Overview:**
- RTX technology focuses on enabling real-time ray tracing by leveraging hardware acceleration, such as NVIDIA's RT cores.
- **Performance Benchmarks:** Achieving 1 sample per pixel (SPP) in real-time applications requires around **10 Giga rays per second** processing capability.

### Components of 1 SPP Path Tracing

A single sample per pixel (SPP) in path tracing typically involves the following steps:

1. **Rasterization (Primary):**  
   - Used to determine primary visibility and initialize the scene's geometry.
   - This step is often paired with ray tracing to speed up the initial pixel visibility.

2. **Ray Tracing - Primary Visibility Ray:**  
   - A ray is traced from the camera to determine the first visible point of the geometry in the scene (hit point).

3. **Ray Tracing - Secondary Bounce Ray:**  
   - A secondary ray is generated to simulate light interaction at the primary hit point, such as reflection, refraction, or indirect lighting.

4. **Ray Tracing - Secondary Visibility Ray:**  
   - This ray is cast to determine if the secondary hit point is directly visible to a light source, contributing to shadows and final illumination. 

This combination of rasterization and multiple rays simulates realistic lighting and materials, even with only one sample per pixel.

### Challenges of RTRT

* **Noise**: Path tracing introduces noise due to Monte Carlo sampling. At 1 spp, noise is particularly high, necessitating advanced **denoising techniques**.
* **Performance**: Balancing quality and speed, as ray tracing competes for computational resources with gameplay logic, post-processing, and other tasks.

### Motion Vectors

* Describe how objects move between frames, allowing tracking of pixels' corresponding positions across time.
* Essential for **temporal reprojection**, enabling the reuse of filtered results from previous frames.

### Temporal Accumulation and Filtering

* **Temporal Assumption**: Scene movement is continuous and predictable, making shading consistent across frames.
* **Method**:
    1. Use motion vectors to map a pixel in the current frame to its corresponding pixel in the previous frame.
    2. Blend the previous frame's denoised result with the current noisy frame to accumulate detail and improve quality over time.
    3. This recursive accumulation simulates having multiple spp per pixel, exponentially increasing effective spp across frames.

### Denoising Solutions

1. **Temporal Filtering**:
    
    * **Linear Blending**: Combine the current noisy frame (e.g., 20%) with the previous denoised frame (e.g., 80%) for stability.
    * **Key Balance**: A blending factor ($\alpha$) controls the trade-off between reusing past data and incorporating new information.
2. **Back Projection**:
    
    * Reprojects the world coordinates of a pixel in the current frame to its corresponding pixel in the previous frame using motion matrices.
    * Ensures alignment of pixel data across frames for effective temporal filtering.

### Challenges and Failure Cases

#### Switching Scenes

* **Burn-In Period**: New scenes lack sufficient temporal data, leading to visible noise until multiple frames are accumulated.

#### Screen-Space Issues

* **Walking Backwards**: Newly revealed areas outside the previous frame's coverage cannot reuse past data, causing inconsistencies.
* **Suddenly Appearing Backgrounds (Disocclusion)**: Areas previously occluded (e.g., behind an object) now visible, creating temporal artifacts.

#### Shading Changes

* **Example**: Moving light sources cause shadow artifacts as static motion vectors fail to track dynamic shading changes, leading to lagged reflections or shadow dragging.

    * Temporal failures in shading occur when lighting changes while geometry remains static, e.g., a fence scene with a moving light source.

    * Glossy reflections and similar effects experience lag due to static motion vectors for geometrically static surfaces.


### Solutions for Temporal Artifacts

**1. Clamping**

* Adjust previous frame results to be closer to current frame results before blending.

**2. Detection**

* Identify when previous frame data is unreliable:
    * Use object IDs to validate corresponding motion vectors.
    * Tune the blending factor $\alpha$ (binary or continuous) based on reliability.
    * Increase spatial filtering for noisy current frame results.

* **Challenges**
    * Clamping reduces ghosting but risks introducing noise.
    * Detection methods may eliminate reuse of prior data, reintroducing noise. This noise can be mitigated with increased spatial filtering (e.g., blurring).

### Implementation of Filtering

Assume a Gaussian filter centered at a pixel (2D):
* Each pixel in the neighborhood contributes to the result.
* Contribution is determined by the **distance between the current pixel** $i$ and the neighboring pixel $j$.

Filtering Algorithm

1. **Initialization:**
    * Set `sum_of_weights = 0.0`.
    * Set `sum_of_weighted_values = 0.0`.
2. **For each pixel $i$:**
    * Iterate over all pixels $j$ in the neighborhood of $i$.
3. **Calculate the weight $w_{ij}$:**
    * Use the Gaussian formula $G(|i - j|, \sigma)$ to determine the weight.
    * The weight depends on the distance between $i$ and $j$, controlled by $\sigma$.
4. **Update sums:**
    
    * Add $w_{ij} \times C^{\text{input}}[j]$ to `sum_of_weighted_values`.
    * Add $w_{ij}$ to `sum_of_weights`.
5. **Output the filtered value:**
    * Compute $C^{\text{output}}[i]=$ ` sum_of_weighted_values / sum_of_weights`.

#### Important Notes:

* **Normalization:**
    
    * Keep track of `sum_of_weights` to ensure proper normalization of pixel values.

* **Handle edge cases:**
    
    * Check if `sum_of_weights` is zero, especially when using non-Gaussian kernels.

* **Color channels:**
    
    * The filter supports multi-channel color data (e.g., RGB), and each channel can be processed independently.

### Bilateral Filtering

* A Gaussian filter creates a blurred image, which smooths both the low-frequency and high-frequency regions, including boundaries.
* To **preserve sharp edges** while smoothing, we use **Bilateral Filtering**, a technique that incorporates both spatial and intensity differences to reduce contributions from pixels across boundaries.

#### Key Idea:

* **Observation:** Regions with abrupt color changes often correspond to edges or boundaries.
* **How to preserve boundaries?**
    * For neighboring pixels $j$ around $i$:
        * If their intensity difference is small, process them with a Gaussian weight.
        * If the intensity difference is large, reduce $j$'s contribution to $i$.

#### Filtering Kernel:

The **bilateral filtering kernel** combines spatial and intensity information to selectively smooth an image while preserving edges.

### Kernel Definition:

$$ w(i, j, k, l) = \exp\left(-\frac{(i - k)^2 + (j - l)^2}{2\sigma_d^2}- \frac{\|I(i, j) - I(k, l)\|^2}{2\sigma_r^2} \right) $$

#### Components:

1. **First Term** $\left(-\frac{(i - k)^2 + (j - l)^2}{2\sigma_d^2}\right)$:
    
    * Represents a Gaussian function applied to the **spatial distance** between pixel $(i, j)$ and pixel $(k, l)$.
    * Ensures that contributions decrease with increasing spatial distance, favoring nearby pixels.
2. **Second Term** $\left(-\frac{\|I(i, j) - I(k, l)\|^2}{2\sigma_r^2}\right)$:
    
    * Represents a Gaussian function applied to the **intensity difference** between the two pixels.
    * Ensures that contributions decrease with increasing intensity differences, favoring similar colors or intensities.

#### Key Behavior:

* **Combined Effect:**
    
    * The two terms together penalize contributions both from spatially distant pixels and from pixels with significantly different intensity values.
    * This dual consideration helps preserve edges by reducing the influence of pixels across sharp intensity transitions.
* **Edge Preservation:**
    
    * Pixels with similar intensities across short spatial distances are weighted higher, helping smooth within regions while retaining boundary details.

#### Effects:

* Smoothens low-frequency regions while **preserving edge details**.
* Boundary pixels contribute less to neighboring pixels across the edge, avoiding boundary blurring.

### Joint Bilateral Filtering

#### Overview:

* **Gaussian Filtering:** Considers only spatial distance.
* **Bilateral Filtering:** Considers **two metrics**—spatial distance and color similarity.
* **Joint Bilateral Filtering:** Extends bilateral filtering by incorporating **additional features** like depth or normals to improve results.

#### Motivation:

* Bilateral filtering may fail when:
    * Noise and edges are indistinguishable (e.g., Monte Carlo noise in path tracing).
    * Features beyond position and intensity, such as depth or normals, are needed.

#### G-buffer Features:

* **G-buffer** contains auxiliary data from rendering, such as:
    * Depth
    * Normals
    * World coordinates
* **Key Property:** G-buffer data is noise-free, as it is derived from rasterization.

#### Examples of Feature Guidance:

1. **Depth:**
    
    * Pixels $A$ and $B$: If their depth values differ significantly, reduce the contribution.
    * Use a depth-based Gaussian to penalize contributions from pixels at different depths.
2. **Normals:**
    
    * Pixels $B$ and $C$: If their normal vectors differ (e.g., large angular difference), reduce the contribution.
    * Use a normal-based kernel, often derived from cosine similarity.
3. **Color:**
    
    * Pixels $D$ and $E$: If their color difference is large, reduce the contribution.

#### Implementation:

* For joint bilateral filtering, **multiple kernels** are computed for different features (e.g., spatial distance, depth, normals, etc.).
* The final kernel weight is the **product of these feature-based contributions**.

#### Notes:

* **Normalization:** The kernel does not need to be pre-normalized; the filtering process includes normalization in the final calculation.
* **Flexible Kernels:** Any function that decays with distance can be used, not just Gaussians. Examples include exponential or triangular functions.
* **Practical Applications:** Joint bilateral filtering is effective in denoising Monte Carlo renders by leveraging G-buffer features.


### Implementing Large Filters

For large filters (e.g., $128 \times 128$), directly applying the filter to compute the weighted contributions of $N \times N$ pixels for each pixel is computationally expensive. Here are two industrially popular methods to speed up the process:

#### Solution 1: Separate Passes

* **Concept:**  
    Instead of applying a $N \times N$ filter in one pass, break it into two passes:
    
    * A **horizontal filter** ($1 \times N$)
    * Followed by a **vertical filter** ($N \times 1$)
* **Why it works:**
    
    * A 2D Gaussian filter is **separable**, meaning: $$G_{2D}(x, y) = G_{1D}(x) \cdot G_{1D}(y)$$
    * Filtering with $N \times N$ involves $N^2$ texture accesses per pixel, but splitting it into two passes reduces this to **$2N$ accesses**.
* **Mathematical Intuition:**
    
    * Filtering is convolution.
    * The convolution integral of $F(x, y)$ with $G_{2D}$ splits into two steps: $$\int \int F(x_0, y_0) G_{2D}(x_0 - x, y_0 - y) dx_0 dy_0  
        = \int \left(\int F(x_0, y_0) G_{1D}(x_0 - x) dx_0\right) G_{1D}(y_0 - y) dy_0$$
* **Practical Notes:**
    
    * This approach is **theoretically limited to Gaussian filters**.
    * For **bilateral filters** or **joint bilateral filters**, it is challenging to split the kernel into $x$- and $y$-dependent terms. However, **approximate separability** is sometimes acceptable for smaller ranges (e.g., $32 \times 32$).

#### Solution 2: Progressively Growing Sizes

* **Concept:**  
    Apply multiple smaller filters (e.g., $5 \times 5$) in progressive passes, where the **sample interval grows** after each pass.
    
* **Steps:**
    
    1. Start with a small filter ($5 \times 5$).
    2. In each pass, increase the sample interval by $2^i$ (e.g., 1, 2, 4, 8, ...).
    3. After several passes, simulate the effect of a large $N \times N$ filter (e.g., $64 \times 64$).
* **Example:**  
    To approximate a $64 \times 64$ filter:
    
    * Use $5 \times 5$ filters in 5 passes, with sample intervals of $2^i$ where $i = 0, 1, 2, 3, 4$.
    * Instead of $4096$ texture accesses ($64 \times 64$), perform **125 accesses** ($5 \times 5 \times 5$).
* **Advantages:**
    
    * Efficiently removes **low-frequency information** progressively.
    * Avoids aliasing by carefully selecting sample intervals.
* **Why it works:**
    
    * Sampling theory:
        * Sampling creates **repeated frequency spectra**.
        * As sample intervals grow, aliasing is avoided by removing high frequencies in earlier passes.
    * Progressive filters mitigate spectral overlap by ensuring earlier passes remove interfering high-frequency components.

- **Challenges with Progressive Filters:**  
  While progressive filters are efficient, **artifacts** can emerge due to:  
  - **Incomplete high-frequency removal:**  
    - Each pass may leave residual high-frequency components, especially with **non-Gaussian** or **joint bilateral filters**.  
  - **Artifact accumulation:**  
    - Insufficient filtering in early passes can lead to visible distortions, particularly when high frequencies are intentionally preserved for detail retention.  

  - **Mitigation:**  
    - Apply an **additional small-pass filter** after the final pass to clean up lingering high-frequency artifacts.

### Outlier Removal

When using Monte Carlo methods for rendering, the results often include overly bright or dark points (outliers). Applying filters directly on such outliers can cause artifacts: for instance, a single bright point may brighten a larger region when processed by a 7×7 filter. To address this, outliers should be handled **before** filtering.

* **Outlier Detection**
    
    * Define the dominant range of colors for each pixel using the surrounding region (e.g., a 7×7 or 5×5 window).
    * Compute the mean ($\mu$) and variance ($\sigma$) of the colors in this region.
    * Identify outliers as values outside the range $[\mu - k\sigma, \mu + k\sigma]$, where $k$ determines the tolerance.
* **Outlier Clamping**
    
    * Clamp outlier values to the nearest boundary within the valid range.
        * For example, if the valid range is (-0.1, 0.1):
            * A value of **10** is clamped to **0.1**.
            * A value of **-0.3** is clamped to **-0.1**.
    * **Note:** Outlier removal does not discard values; it adjusts them, ensuring better filter results downstream.

### Temporal Clamping

Temporal clamping mitigates **ghosting** caused by motion vectors or excessive discrepancies between consecutive frames. It clamps previous frame values to match the valid range of the current frame before blending.

* **Process:**
    
    1. **Identify Valid Range**
        
        * After spatial filtering of the current frame, find the mean ($\mu$) and variance ($\sigma$) within a small region around the corresponding pixel.
        * Define the valid range as $[\mu - k\sigma, \mu + k\sigma]$.
    2. **Clamp Previous Frame Values**
        
        * If a value from the previous frame lies outside this range, clamp it to the nearest boundary.
    3. **Blend Frames**
        
        * Perform **linear blending** between the clamped value and the current frame to produce a noisy-free result.
* **Notes:**
    * It is a tradeoff mechanism rather than a complete solution.
    * This approach clamps unreliable previous frame data to the filtered range of the current frame for better temporal consistency.
* In real-time ray tracing, balancing **noise**, **ghosting (lagging)**, and **over-blurring** is crucial.


### Specific Filtering Approaches for RTRT

#### SVGF

* **SVGF (Spatiotemporal Variance-Guided Filtering)** closely resembles general spatiotemporal denoising methods.
* It incorporates **variance analysis** and specific **tricks** to enhance results, achieving outputs similar to ground truth.

**Three Key Factors for Filtering:**

1. **Depth:**
    
    * Contribution weight depends on the **depth difference** between two points.  
        $$w_z = \exp\left(-\frac{|z(p) - z(q)|}{\sigma_z |\nabla z(p) \cdot (p-q)| + \epsilon}\right)$$
    * **Key Insights:**
        * Larger depth differences result in smaller contributions due to the exponential decay.
        * **$\sigma_z$** controls the rate of decay, balancing how depth influences contributions.
        * The term **$|\nabla z(p) \cdot (p-q)|$** accounts for depth changes in the plane’s normal direction, ensuring reasonable contributions for co-planar points even if their depths differ significantly.
        * **$\epsilon$** prevents division by zero and avoids numerical instability when two points are very close.
    
    **Example:**
    
    * If points **A** and **B** lie on the same slanted surface:
        * Their raw depth difference may be large, but their projected depth in the plane's normal direction is minimal, leading to a higher contribution weight.
2. **Normal:**
    
    * **Normal similarity** is computed using dot products:  
        $$w_n = \max(0, n(p) \cdot n(q))^{\sigma_n}$$
    * **Key Insights:**
        * Higher **$\sigma_n$** results in stricter normal similarity criteria.
        * Normal maps for effects like bump mapping are not used; only original surface normals are considered.
3. **Luminance:**
    
    * Contribution based on grayscale color (luminance):  
        $$w_l = \exp\left(-\frac{|l_i(p) - l_i(q)|}{\sigma_l \sqrt{g_{3\times3}(Var(l_i(p)))} + \epsilon}\right)$$
    * **Variance (V) Role:**
        * Variance helps adjust weights when noisy pixels have misleading brightness.
        * A multi-step process ensures accurate variance:
            * **Spatial filtering** to compute variance in a 7×7 region.
            * **Temporal accumulation** using motion vectors to average variance over frames.
            * **Final spatial filtering** with a smaller 3×3 region.
    
**Results of SVGF**

- **Strengths:**
  - SVGF effectively reduces noise and closely matches ground truth in most scenarios.
  - It leverages **variance analysis** to handle statistical noise and enhance filtering accuracy.

- **Limitations:**
  - **Ghosting artifacts:** 
    - Occur when the light source moves without any geometric changes, resulting in zero motion vectors.
    - Temporal reuse of shadow data from the previous frame causes visible "ghosting."
  - **Boiling artifacts:**
    - Persistent low-frequency noise leads to frame-to-frame flickering.
    - This effect resembles "boiling water," despite using a large filter size.

#### RAE

* RAE (Recurrent AutoEncoder) is a **post-processing denoising method** for real-time ray-traced images.
* It reconstructs noisy Monte Carlo results into clean images.

**Key Features:**

* **Inputs:**
    * Noisy image and G-buffer information.
* **AutoEncoder Architecture:**
    * U-shaped neural network with skip connections to enhance training efficiency.
    * Performs image transformations effectively.

**Recurrent Connections:**

* Layers contain recurrent connections, enabling the model to:
    * Accumulate and adapt previous frame information without motion vectors.
    * Gradually "forget" old information as new frames are processed.

# Real-Time Rendering Techniques

## Temporal Anti-Aliasing (TAA)

* **Aliasing Origins:**  
    Aliasing occurs due to insufficient samples per pixel during rasterization. The ultimate solution to aliasing is to use more samples, as seen in MSAA (Multisample Anti-Aliasing).
    
* **TAA Approach:**  
    TAA aims to approximate the effects of super-sampling without the performance cost by reusing samples from previous frames. Each frame effectively uses a single sample per pixel (1SPP), but temporal reuse increases the effective samples per pixel (SPP) over time.
    
    * **Concept:** Distribute sample points across N past frames. In each frame, retrieve samples from these frames and filter them to simulate N× super-sampling.
    * **Jittered Sampling:** For static scenes, jittered sampling offsets sample points in a fixed pattern across consecutive frames. This allows averaging the contributions from different sample locations over time, achieving a similar result to upsampling (e.g., 2×2).
* **Moving Scenes:**
    
    * Temporal samples are reprojected using motion vectors to map current geometry to its position in previous frames.
    * **Clamping:** If temporal information is unreliable, clamping techniques adjust previous frame data to align with the current frame's results, avoiding visual inconsistencies.

## MSAA vs. SSAA

* **SSAA (Super-Sampling Anti-Aliasing):**  
    SSAA renders a scene at a higher resolution and downsamples it to the target resolution, averaging pixel results. This method is accurate but computationally expensive.
    
* **MSAA (Multisample Anti-Aliasing):**  
    MSAA optimizes SSAA by reusing shading computations:
    
    * Each pixel has multiple samples, but shading is performed per primitive rather than per sample. For example, a 4× MSAA only shades unique primitives once, significantly reducing computation compared to SSAA.
        
    * **Spatial Sample Reuse:** Shared sample points at pixel boundaries can contribute to multiple pixels, reducing the required number of samples and improving efficiency.
   

## Image-Based Anti-Aliasing

* **Image-Based Solutions:** These methods apply anti-aliasing as a post-process on the rendered image, identifying and correcting jagged edges directly from the image data.
    * **Popular Techniques:**
        * **FXAA (Fast Approximate AA):** Focuses on performance with moderate quality.
        * **MLAA (Morphological AA):** Matches and smoothens jagged patterns in the image.
        * **SMAA (Enhanced Subpixel Morphological AA):** Combines MLAA with additional steps for better edge detection and subpixel quality.

## No Anti-Aliasing on G-Buffers

* **G-buffers should never be anti-aliased.** Applying anti-aliasing to G-buffers can corrupt their precise data representation, causing issues in subsequent rendering stages. This is a strict rule in deferred rendering pipelines.


## DLSS (Deep Learning Super Sampling)


* **Super Resolution** or **Super Sampling** aims to convert low-resolution images into high-resolution ones, essentially increasing the image's resolution.

### DLSS 1.0

* **Approach:** Relied purely on data-driven methods and made guesses to fill in missing information.
    * Operated on **current frames only**, without leveraging temporal information from previous frames.
    * Used game-specific or scene-specific neural network training to identify common patterns like edges.
    * Goal: Replace blurred edges with sharper ones in upscaled low-resolution images.
* **Limitation:** Results were not robust and lacked temporal stability, leading to suboptimal performance.

### DLSS 2.0

* **Core Idea:** Shifted focus to **temporal information** rather than deep learning alone.
    * Leveraged **temporal reuse** to integrate information from previous frames for more accurate upscaling.
    * Core mechanism rooted in **TAA (Temporal Anti-Aliasing)** principles, ensuring improved resolution with temporal stability.

#### Challenges in DLSS 2.0:

1. **Handling Temporal Failures:**
    
    * Simple clamping of unreliable temporal data is insufficient, especially for higher resolutions.
    * Blind clamping can result in over-smoothing, producing blurry high-resolution images.
2. **Generating Accurate Pixel Values for New Pixels:**
    
    * Increasing resolution introduces smaller, new pixels requiring precise values.
    * Poorly estimated values (e.g., resembling neighboring pixel colors) lead to blurry results.
    
3. **Better Temporal Data Integration:**
    
    * Requires advanced techniques to merge temporal information without clamping.
    * **Neural network role:** Does not output final blended colors. Instead, it guides how to integrate information from the current and previous frames effectively.
    
### Practical Considerations for DLSS 2.0:

* **Performance:** Inference time must be optimized for real-time usage.
    * Hardware-specific optimizations improve performance significantly.
* **Industry Variants:**
    * AMD's **FidelityFX Super Resolution** serves as a competitive alternative, applying similar concepts.


## Deferred Shading

**Deferred Shading** improves shading efficiency by only shading visible fragments.

### Traditional Rasterization Process

* Workflow:  
    Triangles → Fragments → Depth Test → Shade → Pixel.
* **Problem:**  
    Every fragment is shaded, even those later discarded due to occlusion (e.g., fragments from distant objects are shaded unnecessarily).
    * Complexity: **O(\#fragments × \#lights)** because every fragment interacts with all lights.

### Key Idea

* Many fragments pass the depth test but are later **overwritten** by closer fragments.
* **Solution:** Shade only **visible fragments**.

### Solution: Two-Pass Rasterization

1. **Pass 1:**
    * Rasterize the scene and update the **depth buffer** without performing shading.
2. **Pass 2:**
    * Use the depth buffer to ensure only the **nearest visible fragments** are shaded.

### Benefits

* Complexity reduced to **O(#visible fragments × #lights)**.
* This approach assumes that **rasterization is faster than shading unseen fragments**, which is usually true.

### Issue

* Anti-aliasing cannot be performed during Pass 1 and Pass 2 because of dependency on the **depth buffer (G-buffer)**.
* **Solution:** Use post-processing techniques like **TAA** (Temporal Anti-Aliasing) or image-based AA.

## Tiled Shading

**Tiled Shading** builds on Deferred Shading by dividing the screen into smaller tiles for more efficient shading.

### Process

* Divide the screen into tiles (e.g., 32 × 32 pixels).
* Perform shading for each tile independently.

### Key Observations

* Light intensity decreases with distance due to **inverse-square law**, limiting a light's effective range.
* **Optimization:** Each tile only considers lights within its **affected region** (approximated as spherical volumes).

### Complexity Reduction

* From **O(#visible fragments × #lights)** to **O(#visible fragments × avg #lights per tile)**.


## Clustered Shading

**Clustered Shading** further improves efficiency by dividing the 3D space into clusters, adding depth-based subdivisions to the tiles.

### Process

* Extend Tiled Shading by slicing the scene along the **depth axis**, creating 3D clusters.

### Key Observations

* In large depth ranges within a tile, lights may influence only specific depth slices.
* By subdividing along the depth axis, **fewer lights are associated with each cluster**.

### Complexity Reduction
* From **O(#visible fragments × avg #lights per tile)** to **O(#visible fragments × avg #lights per cluster)**.

### Final Result

* **Efficiency Gains:** Avoid unnecessary shading by optimizing the number of lights affecting each fragment.

## Level of Detail Solutions

**Level of Detail (LoD)** is a crucial technique for balancing visual fidelity and performance by adapting detail levels based on context.

### Core Concepts

* **LoD Purpose:**  
    Select the appropriate detail level during computations to reduce resource usage without sacrificing quality.
* **Texture Mip-maps:**  
    A common example of LoD where lower-resolution textures are used for distant objects.
* **Cascaded Approach:**  
    Industrial LoD methods often involve selecting detail levels dynamically, such as in **Cascaded Shadow Maps**.

### Examples of LoD Techniques

#### Cascaded Shadow Maps (CSM)

* **Observation:**  
    Shadow map texels near the camera cover smaller regions, requiring higher resolution. Texels farther away can use lower resolutions.
* **Implementation:**
    * Multiple shadow maps with varying resolutions (e.g., high-resolution near the camera and coarse maps farther away).
    * **Blending Transition:**  
        Overlap between layers may cause abrupt changes (artifacts). Smooth transitions are achieved by blending maps based on distance.
* **Benefit:**  
    Efficient use of resolution while minimizing artifacts.

#### Cascaded LPV (Light Propagation Volumes)

* Similar concept applied to global illumination.
* Use finer grids near the camera and coarser grids farther away to save computation.

### Geometric LoD

* **High Poly vs. Low Poly:**  
    Models are simplified into lower-resolution versions (low-poly models). A hierarchy of models is generated.
* **Dynamic Selection:**  
    Based on distance from the camera:
    * Close objects → High poly.
    * Distant objects → Low poly.
    * **Per-Part LoD:** Different parts of the same model can use different LoD levels.
* **Transition Challenge:**
    * Popping artifacts occur when switching between levels suddenly.
    * **Solution:** Temporal Anti-Aliasing (TAA) can mitigate this effect.
* **Advanced Example:**  
    Nanite in Unreal Engine 5 dynamically handles geometric LoD with advanced optimizations.

### Technical Challenges

* **Smooth Transitions:**  
    Avoiding visual cracks or artifacts between levels.
* **Efficient Loading and Scheduling:**  
    Dynamically load levels to optimize cache and bandwidth usage.
* **Geometry Representation:**  
    Using triangles or alternate methods like geometry textures.
* **Clipping and Culling:**  
    Improve performance by excluding non-visible parts.


## Global Illumination Solutions

### Overview

* **Screen Space Ray Tracing (SSR):**  
    SSR is commonly used for global illumination but has inherent limitations:
    
    * Fails when reflections go **off-screen**.
    * Reflections of objects behind the **camera** are not captured.
    * Uses a screen-space depth buffer, which only represents a single layer. Geometry behind this layer cannot be traced.
    * Other scenarios where depth information is insufficient.
* **Real-Time Ray Tracing (RTRT):**  
    Theoretically solves all global illumination (GI) scenarios since it accurately simulates light paths.  
    However, **RTRT is too costly** for full-scene implementation in real-time applications, leading to significant performance issues.
    
* **Hybrid Solutions:**  
    The industry often combines multiple GI methods to balance quality and performance.
    

### A Typical Hybrid GI Solution

#### **Step 1: Use SSR for an Approximation**

* SSR provides an initial, approximate GI solution.
* **Limitations:** Areas SSR cannot handle are addressed using other methods.

#### **Step 2: Address SSR Limitations with Ray Tracing**

* **Near-field Objects:**
    
    * Use high-quality Signed Distance Fields (SDFs) around a shading point.
    * SDFs allow for efficient ray tracing in shaders.
* **Far-field Objects:**
    
    * Use lower-quality SDFs to represent the entire scene.
    * This ensures global illumination is captured efficiently, both near and far.
* **Directional or Point Light Sources:**
    
    * Handle using **Reflective Shadow Maps (RSM)** for localized illumination, such as flashlights.
* **Diffuse Scenes:**
    
    * Use **probes** to store irradiance in a 3D grid for dynamic diffuse GI (e.g., **DDGI**).

### Hardware Ray Tracing Techniques

* **Simplified Geometry:**
    
    * Replace original geometry with low-poly proxies.
    * This optimization makes RTRT faster while maintaining acceptable accuracy for indirect illumination.
* **Probes and RTXGI:**
    
    * Combine hardware ray tracing with probe-based methods (e.g., **RTXGI**) for efficient dynamic lighting.


### Example: Lumen in Unreal Engine 5

* A hybrid approach combining **SSR**, **SDF-based tracing**, **RSM**, and **low-poly RTRT** forms the foundation of **UE5's Lumen system**, achieving efficient and high-quality GI.


## Challenges in Rendering Engines

From an engine's perspective, the real challenge lies in managing numerous technical issues:
* Making solutions adaptable across various scenes.
* Ensuring solutions are efficient and fast.

# Uncovered Topics

-  **Texturing an SDF:**

    * Applying textures to Signed Distance Fields (SDFs) efficiently remains a technical hurdle.

- **Transparent Materials & Order-Independent Transparency:**
    * Accurately rendering transparent materials while avoiding sorting artifacts.
    * Solutions like Order-Independent Transparency (OIT) can help but are computationally expensive.

- **Particle Rendering:**

    * Efficiently simulating and rendering millions of particles, especially with complex effects like lighting and transparency.

- **Post-Processing:**

    * Effects like depth of field, motion blur, bloom, and tone mapping.
    * These are computationally expensive but essential for photorealism.

- **Random Seed & Blue Noise:**

    * Using **blue noise** for stochastic sampling to reduce visible noise in ray tracing and other algorithms.

- **Foveated Rendering:**

    * Rendering at higher quality in regions the viewer focuses on, leveraging eye-tracking.
    * Crucial for VR/AR applications.

- **Probe-Based Global Illumination:**

    * Efficient use of probes to approximate lighting and irradiance in real-time scenarios.

- **Advanced Lighting Techniques:**

    * **ReSTIR (Reservoir-based Spatiotemporal Importance Resampling):**  
        Optimizes light sampling for real-time ray tracing.
    * **Neural Radiance Caching:**  
        Uses machine learning to approximate radiance fields for global illumination.
    * **Many-Light Theory & Light Cuts:**  
        Efficiently handling thousands of lights in a scene by clustering and pruning lights.

- **Participating Media:**

    * Simulating light interactions with fog, smoke, and volumetric effects.
    * Subsurface scattering (SSSSS) for materials like skin and wax.

- **Hair Rendering:**

    * Realistically rendering hair with accurate light scattering and anisotropic reflections.
