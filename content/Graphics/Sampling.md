---
title: Sampling on the Unit Hemisphere and Disk
date: '2024-12-28T16:55:53+08:00'
description: Generating random directions and points.
math: true
---

# Deriving PDF for Hemisphere Sampling

* **Target distribution** in $\omega$, which is $(x, y, z)$ with $\sqrt{x^2 + y^2 + z^2} = 1$.
    
* **The transformation $T$** from $(r, \theta, \phi)$ to $(x, y, z)$:
    
$$
x = r \sin \theta \cos \phi
$$ 
$$
y = r \sin \theta \sin \phi
$$ 
$$
z = r \cos \theta
$$
* **The Jacobian** of the transformation $T$ gives $|J_T| = r^2 \sin \theta$.
    
* $r = 1$, so we have:
    
    $$
    p(1, \theta, \phi) = \sin \theta \, p(x, y, z) = \sin \theta \, p(\omega)
    $$

## Jacobian Determinant Derivation

**Transformation from spherical to Cartesian coordinates**:

$$
x = r \sin \theta \cos \phi, \quad y = r \sin \theta \sin \phi, \quad z = r \cos \theta
$$

**Jacobian matrix $J_T$**:

$$
J_T =  
\begin{bmatrix}  
\frac{\partial x}{\partial r} & \frac{\partial x}{\partial \theta} & \frac{\partial x}{\partial \phi} \\  
\frac{\partial y}{\partial r} & \frac{\partial y}{\partial \theta} & \frac{\partial y}{\partial \phi} \\  
\frac{\partial z}{\partial r} & \frac{\partial z}{\partial \theta} & \frac{\partial z}{\partial \phi}  
\end{bmatrix}
$$

Compute each partial derivative:

* $\frac{\partial x}{\partial r} = \sin \theta \cos \phi, \quad \frac{\partial x}{\partial \theta} = r \cos \theta \cos \phi, \quad \frac{\partial x}{\partial \phi} = -r \sin \theta \sin \phi$
* $\frac{\partial y}{\partial r} = \sin \theta \sin \phi, \quad \frac{\partial y}{\partial \theta} = r \cos \theta \sin \phi, \quad \frac{\partial y}{\partial \phi} = r \sin \theta \cos \phi$
* $\frac{\partial z}{\partial r} = \cos \theta, \quad \frac{\partial z}{\partial \theta} = -r \sin \theta, \quad \frac{\partial z}{\partial \phi} = 0$

Substituting into $J_T$:

$$
J_T =  
\begin{bmatrix}  
\sin \theta \cos \phi & r \cos \theta \cos \phi & -r \sin \theta \sin \phi \\  
\sin \theta \sin \phi & r \cos \theta \sin \phi & r \sin \theta \cos \phi \\  
\cos \theta & -r \sin \theta & 0  
\end{bmatrix}
$$

**Determinant**:

$$
|J_T| = \text{det}(J_T)
$$

Using Laplace expansion along the third row:

$$
|J_T| = \cos \theta \cdot M_{31} + (-r \sin \theta) \cdot M_{32}
$$

Computing $M_{31}$ and $M_{32}$:

$$
M_{31} = r^2 \cos \theta \sin \theta, \quad M_{32} = r \sin^2 \theta
$$

Substituting:

$$
|J_T| = r^2 \sin \theta (\cos^2 \theta + \sin^2 \theta)
$$

Using $\cos^2 \theta + \sin^2 \theta = 1$:

$$
|J_T| = r^2 \sin \theta
$$

For $r = 1$:

$$
|J_T| = \sin \theta
$$


# Uniformly Sampling the Unit Hemisphere

## Domain and Probability Density

* **The domain**, i.e., the unit hemisphere surface area, is $2\pi$.  
    Uniformly sampling the domain over $\omega$ implies:
    
    $$
    p(\omega) = \frac{1}{2\pi}
    $$
    
* Since $p(1, \theta, \phi) = \sin \theta \, p(\omega)$, we want:
    
    $$
    p(\theta, \phi) = \frac{\sin \theta}{2\pi}
    $$
    

## Marginal and Conditional Densities

### Marginal Density $p_\Theta(\theta)$:

$$
\int_{0}^{2\pi} p(\theta, \phi) \, d\phi = \sin \theta
$$


### Conditional Density $p(\phi | \theta)$:

$$
p(\phi | \theta) = \frac{p(\theta, \phi)}{p_\Theta(\theta)} = \frac{1}{2\pi}
$$


## Antiderivatives

### Antiderivative of $p_\Theta(\theta)$:

$$
\int \sin \theta \, d\theta = 1 - \cos \theta \, (\text{added constant 1})
$$


### Antiderivative of $p(\phi | \theta)$:

$$
\int \frac{1}{2\pi} \, d\phi = \frac{\phi}{2\pi}
$$


## Inversion and Sampling

### Invert to Get $\theta$ and $\phi$:

$$
\theta = \cos^{-1} \xi_1 \, (\text{cos is symmetric}), \quad \phi = 2\pi \xi_2
$$


### Apply Transformation:

Apply transformation $T$ on $(\theta, \phi)$ to obtain uniformly distributed $\omega$.

# Cosine-Weighted Sampling on the Unit Hemisphere

## Define the Target PDF

The cosine-weighted sampling is based on a probability density function (PDF) proportional to the cosine of the angle between the sample direction $\omega$ and the normal $\mathbf{n}$:

$$
p(\omega) = \frac{\cos \theta}{\pi}
$$

where $\cos \theta = \mathbf{n} \cdot \mathbf{\omega}$.


## Express the PDF in Spherical Coordinates

The PDF in spherical coordinates becomes:

$$
p(\theta, \phi) = \frac{\cos \theta \sin \theta}{\pi}
$$

where $\cos \theta$ represents the cosine of the angle between the sample direction and the normal, and $\sin \theta$ is the Jacobian determinant.

## Marginal Density $p_\Theta(\theta)$

To obtain the marginal density $p_\Theta(\theta)$, integrate over $\phi$:

$$
p_\Theta(\theta) = \int_0^{2\pi} \frac{\cos \theta \sin \theta}{\pi} \, d\phi = 2 \cos \theta \sin \theta
$$


## Conditional Density $p(\phi | \theta)$

The conditional density of $\phi$ given $\theta$ is uniform:

$$
p(\phi | \theta) = \frac{1}{2\pi}
$$


## Inverse Transform Sampling

### Marginal $p_\Theta(\theta)$

The cumulative distribution function (CDF) for $\theta$ is:

$$
C_\Theta(\theta) = 1 - \cos^2(\theta)
$$

By setting $C_\Theta(\theta) = \xi_1$, where $\xi_1$ is a random variable, we obtain:

$$
 \cos \theta = \sqrt{1 - \xi_1}
 $$

### Conditional $p(\phi | \theta)$

The CDF for $\phi$ is:

$$
C_\Phi(\phi) = \frac{\phi}{2\pi}
$$

Set $C_\Phi(\phi) = \xi_2$, where $\xi_2$ is a random variable, leading to:

$$
\phi = 2\pi \xi_2
$$

## Final Sampling Transformation

Using $\xi_1$ and $\xi_2$, we compute:

$$
\theta =  \cos^{-1}(\sqrt{1 - \xi_1}), \quad \phi = 2\pi \xi_2
$$

Converting these spherical coordinates to Cartesian coordinates:

$$
x = \sin \theta \cos \phi, \quad y = \sin \theta \sin \phi, \quad z = \cos \theta
$$


## Why use this target PDF $p(\omega) = \frac{\cos \theta}{\pi}$?

1. **Physical Background:** In optics and rendering, cosine-weighted sampling is commonly used to simulate diffuse reflection of light. This kind of reflection follows Lambert's Cosine Law, which can be described as:
    
    * The brightness of light reflected from a surface is proportional to the cosine of the angle $\theta$ between the light ray and the surface normal.
    * The energy density of the reflected light should be weighted by $\cos \theta$ to more accurately simulate diffuse reflection behavior.
2. **Diffuse Energy Distribution:** Consider a small area element $d\omega$ on the unit hemisphere (measured in solid angle). The energy flux (radiance) in the direction of this element is proportional to $\cos \theta$, where $\theta$ is the angle between the direction and the normal.
    
    * To satisfy the definition of a probability density function, the total probability distribution $p(\omega)$ must be normalized so that its integral over the entire hemisphere equals 1.
3. **Normalization Derivation:**
    
    **(1) Unnormalized PDF:** Since the distribution needs to be proportional to $\cos \theta$, we have $p(\omega) \propto \cos \theta$.
    
    **(2) Integral over the unit hemisphere:** In spherical coordinates, the solid angle element is given by $d\omega = \sin \theta \, d\theta \, d\phi$. Therefore:
    
    $$
    \int_\text{hemisphere} p(\omega) \, d\omega = 1
    $$
    
    Substituting $p(\omega) = \frac{\cos \theta}{C}$ (where $C$ is the normalization factor), the integral becomes:
    
    $$
    \int_\text{hemisphere} \frac{\cos \theta}{C} \, d\omega = 1
    $$
    
    Substituting $d\omega = \sin \theta \, d\theta \, d\phi$:
    
    $$
    \int_0^{2\pi} \int_0^{\pi/2} \frac{\cos \theta}{C} \sin \theta \, d\theta \, d\phi = 1
    $$
    
    Separating the variables:
    
    $$
    \frac{1}{C} \int_0^{2\pi} d\phi \int_0^{\pi/2} \cos \theta \sin \theta \, d\theta = 1
    $$
    
    **(3) Computing the Integral:**
    
    First, integrate with respect to $\phi$:
    
    $$
    \int_0^{2\pi} d\phi = 2\pi
    $$
    
    Next, for $\theta$, use $\cos \theta \sin \theta = \frac{1}{2} \sin(2\theta)$:
    
    $$
    \int_0^{\pi/2} \cos \theta \sin \theta \, d\theta = \frac{1}{2} \int_0^{\pi/2} \sin(2\theta) \, d\theta
    $$ 
    $$
    \int_0^{\pi/2} \sin(2\theta) \, d\theta = \frac{-\cos(2\theta)}{2} \Big|_0^{\pi/2} = \frac{-\cos(\pi) + \cos(0)}{2} = \frac{-(-1) + 1}{2} = 1
    $$
    
    Therefore:
    
    $$
    \frac{1}{C} \cdot 2\pi \cdot \frac{1}{2} = 1
    $$
    
    Solving for $C$, we get $C = \pi$.
   
4. **Final PDF:**
    
    After normalization, the probability density function becomes:
    
    $$
    p(\omega) = \frac{\cos \theta}{\pi}
    $$

# Implementation

The following C++ functions generate random directions based on uniform and cosine-weighted sampling:

```cpp
vec3 random_cosine_direction() {
    auto r1 = random_double();
    auto r2 = random_double();
    auto phi = 2 * pi * r2;

    auto z = std::sqrt(1 - r1);
    auto sin_theta = std::sqrt(r1);
    auto x = std::cos(phi) * sin_theta;
    auto y = std::sin(phi) * sin_theta;

    return vec3(x, y, z);
}

vec3 random_uniform_direction() {
    auto r1 = random_double();
    auto r2 = random_double();
    auto phi = 2 * pi * r2;

    auto z = 1 - r1;
    auto sin_theta = std::sqrt(1 - z * z);
    auto x = std::cos(phi) * sin_theta;
    auto y = std::sin(phi) * sin_theta;

    return vec3(x, y, z);
}
```


# Sampling the Unit Disk

## Computing the PDF of a Transformation

To transform polar coordinates to Cartesian coordinates, we use:

$$ 
\begin{pmatrix} x \\  y  
\end{pmatrix} = T \begin{pmatrix}  r \\  \theta  
\end{pmatrix} = \begin{pmatrix} r \cos \theta \\ r \sin \theta  \end{pmatrix}. 
$$

The Jacobian determinant of the transformation is:
$$ 
\left| \frac{\partial T \begin{pmatrix} r \\ \theta \end{pmatrix} }{\partial \begin{pmatrix} r \\ \theta \end{pmatrix}} \right| 
= |J_T| 
= \begin{vmatrix} 
\frac{\partial x}{\partial r} & \frac{\partial x}{\partial \theta} \\ 
\frac{\partial y}{\partial r} & \frac{\partial y}{\partial \theta} 
\end{vmatrix} 
= \begin{vmatrix} 
\cos \theta & -r \sin \theta \\ 
\sin \theta & r \cos \theta 
\end{vmatrix} 
= r. 
$$

Thus, the relationship between probability densities in Cartesian and polar coordinates is:

$$ 
p(x, y) = \frac{p(r, \theta)}{r}, \quad \text{or } p(r, \theta) = r \, p(x, y), 
$$

indicating that the change in probability density from $(r, \theta)$ to $(x, y)$ is **inversely proportional to $r$**.

## Uniform PDF in Cartesian Coordinates

The proportionality constant is the area of the unit disk, $\pi$. For uniform sampling, the target PDF in Cartesian coordinates is:

$$
p(x, y) = \frac{1}{\pi}.
$$

## PDF in Polar Coordinates

Using the Jacobian determinant:

$$
p(r, \theta) = r \, p(x, y),
$$

we get:

$$
p(r, \theta) = \frac{r}{\pi}.
$$

## Marginal and Conditional PDFs

The marginal PDF for $r$ is:

$$
p_R(r) = \int_0^{2\pi} p(r, \theta) \, d\theta = 2r,
$$

The conditional PDF for $\theta$ given $r$ is:

$$
p(\theta | r) = \frac{p(r, \theta)}{p_R(r)} = \frac{1}{2\pi}.
$$

## Sampling from the PDFs

To sample $r$ and $\theta$, integrate the marginal and conditional PDFs:

$$
r = P_R^{-1}(\xi_1) = \sqrt{\xi_1}, \quad \theta = P_\Theta^{-1}(\xi_2) = 2\pi \xi_2,
$$

where $\xi_1, \xi_2 \sim U(0, 1)$. This ensures:

* $p(\theta | r)$ is constant: all positions on a ring of radius $r$ are equally likely.

# Malley's Method: A Quick Solution

Malley's method provides an easy way to generate cosine-weighted samples on the unit hemisphere. The steps are:

1. **Uniform Sampling on the Unit Disk**  
    Generate uniform samples on the unit disk. This process is well-established.
    
2. **Projection to the Hemisphere**  
    Project the disk samples onto the surface of the hemisphere. This results in:
    
    * A sample distribution over the hemisphere's surface that is weighted by the cosine of $\theta$.

## Why Does This Work?

The projection ensures the resulting distribution aligns with the cosine weighting due to the geometry of the hemisphere and the relationship between the disk and spherical coordinates.

To derive this explicitly:

1. **Coordinate Transformation:**  
    Express the hemisphere's surface coordinates $(\theta, \phi)$ in terms of disk coordinates $(r, \phi)$. The Jacobian determinant of the transformation accounts for the change in density.
    
2. **Jacobian Determinant:**  
    Compute the Jacobian determinant when transforming from $(r, \phi)$ to $(\theta, \phi)$. It reveals that the density transforms proportionally to $\cos\theta$, aligning with cosine weighting.
    
3. **Projection:**  
    Uniform sampling on the disk ($p(x, y) = \frac{1}{\pi}$) naturally transforms into cosine-weighted sampling ($p(\omega) = \frac{\cos\theta}{\pi}$) over the hemisphere due to this relationship and the geometry of the projection.
    

By starting with the uniform distribution on the disk and projecting, the resulting samples inherit the cosine weighting without requiring additional adjustments.


## Computing the Jacobian Determinant for the Transformation $(r, \phi) \to (\theta, \phi)$

We are projecting points from the unit disk $(r, \phi)$ to the hemisphere $(\theta, \phi)$, where:

* $r$ is the radial distance in the disk,
* $\phi$ is the azimuthal angle in the disk,
* $\theta$ is the polar angle in the hemisphere,
* $\phi$ remains unchanged.

#### Step 1: Define the Relationship Between $(r, \phi)$ and $(\theta, \phi)$

From the projection, the radial distance $r$ maps to $\sin \theta$:

$$
r = \sin \theta \quad \text{or equivalently} \quad \theta = \arcsin(r).
$$

Thus, the transformation is:

$$
\begin{pmatrix}  
r \\  
\phi  
\end{pmatrix}  
\to  
\begin{pmatrix}  
\theta \\  
\phi  
\end{pmatrix},
$$

with:

$$
\theta = \arcsin(r), \quad \phi = \phi.
$$

#### Step 2: Write the Jacobian Matrix

The Jacobian matrix $J_T$ for the transformation is:

$$
J_T =  
\begin{pmatrix}  
\frac{\partial \theta}{\partial r} & \frac{\partial \theta}{\partial \phi} \\  
\frac{\partial \phi}{\partial r} & \frac{\partial \phi}{\partial \phi}  
\end{pmatrix}.
$$

From the transformation equations:

* $\frac{\partial \theta}{\partial r} = \frac{d}{dr} (\arcsin(r)) = \frac{1}{\sqrt{1 - r^2}} = \frac{1}{\cos \theta},$
* $\frac{\partial \theta}{\partial \phi} = 0$,
* $\frac{\partial \phi}{\partial r} = 0$,
* $\frac{\partial \phi}{\partial \phi} = 1.$

Thus, the Jacobian matrix becomes:

$$
J_T =  
\begin{pmatrix}  
\frac{1}{\cos \theta} & 0 \\  
0 & 1  
\end{pmatrix}.
$$

#### Step 3: Compute the Determinant

The Jacobian determinant is the absolute value of the determinant of $J_T$:

$$
\left| J_T \right| = \left|  
\begin{vmatrix}  
\frac{1}{\cos \theta} & 0 \\  
0 & 1  
\end{vmatrix}  
\right| = \frac{1}{\cos \theta}.
$$

#### Step 4: Adjust for Density Transformation

The relationship between densities is proportional to the inverse of the Jacobian determinant. Thus, the transformation of probability density scales proportionally to $\cos \theta$:

$$
p(\theta, \phi) = p(r, \phi) \cdot \left| J_T \right|^{-1} = p(r, \phi) \cdot \cos \theta.
$$

### Final Result

The Jacobian determinant for the transformation $(r, \phi) \to (\theta, \phi)$ is:

$$
\left| J_T \right| = \frac{1}{\cos \theta}.
$$

The density transforms proportionally to $\cos \theta$, aligning with the cosine-weighted sampling over the hemisphere.
