---
title: Geometric Shape Modeling
date: 2024-02-22 22:56:51
description: Developing geometry processing algorithms from scratch.
math: true
---

# Reconstruction

Implement a simplified version of the method in "Poisson Surface Reconstruction" by Kazhdan et al. 2006.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222342552.gif)

# Registration

Implement a version of the iterative closest point (ICP).

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222344314.gif)


# Smoothing

Smooth a data signal defined over a curved surface.

This data could be a scalar field on the surface and smoothing corresponds to data denoising.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222344633.gif)

Or the data could be the vector field of the surface's own geometry. This corresponds to geometric smoothing.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222344457.gif)


# Subdivision

Produce a high-resolution, smooth surface from any coarse triangle mesh by upsampling and loop subdivision.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222345927.gif)


# Decimation

Reduce faces and vertices through shortest edge collapse and quadric error minimization.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202402222345310.gif)

# Deformation

Implement biharmonic deformation and as-rigid-as-possible deformation algorithms for interactive surface deformation.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202403180241804.gif)

# Parameterization

Compute a 2D parameterization utilizing Tutte's mapping as well as the "least squares conformal" energy.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202403222018164.gif)

# Distances

Implement the heat geodesics algorithm.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202403290302589.gif)

# Curvature

Compute discrete curvature quantities on a surface.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202404130638471.gif)


# Normal-Driven Spherical Shape Analogies

Implement the paper "Normal-Driven Spherical Shape Analogies" (SGP 2021).

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202404201324685.gif)

## Introduction

### Related Work

Before the publication of "Normal-Driven Spherical Shape Analogies", the field lacked a comprehensive method for transferring geometric styles effectively. Previous approaches mainly targeted specific stylization styles for 3D objects, like collage art, manga style, or cubic style, but lacked a unified framework for achieving diverse results. Some techniques focused on transferring 3D geometric details, such as patch-based assembly and voxel-based texture synthesis, while others utilized surface normals in various geometry processing tasks like PolyCube deformation or mesh denoising.

However, there was a notable absence of methods that employed analogy-based approaches for stylization across different styles within a single framework. Additionally, existing techniques for surface normal-based deformations struggled to generalize to various stylization styles beyond specific cases like PolyCube deformation or cubic stylization. The paper addressed these limitations by introducing a novel approach that effectively leveraged analogy-based methods for diverse stylization styles and surface normal-based deformations.

### Paper Contribution

The paper proposes a novel method for shape analogy, focusing on transferring geometric styles using surface normals. The approach formulates the problem as finding correspondences between a reference shape (a sphere) and a style shape, and subsequently transferring these correspondences to an input shape to generate an output shape with desired stylistic attributes. 

### Methodology

The paper employs a three-step process:

- **Computing Correspondences:** Correspondences between the style shape and a sphere are computed using either the Gauss map or curvature flow, depending on the complexity of the shape.
- **Transferring Correspondences:** Correspondences between the sphere and the input shape are computed, allowing for the transfer of surface normals from the style shape to the input shape.
- **Normal-Driven Optimization:** An optimization problem is formulated to deform the input shape based on target normals, ensuring that the output shape possesses desired stylistic attributes.

### Impressive Results

The paper demonstrates the efficacy of the proposed method through various examples, showcasing the ability to generate diverse and stylized outputs from input shapes. The method allows for the transformation of shapes with intricate details, such as a cow, into styles represented by simpler geometric forms like cones or cubes. The approach's flexibility in handling different shapes and styles, as well as its efficiency in computation, are among its most impressive results.

## Implementation

The algorithm comprises three simple steps:

1. Map the surface normal of the target style shape $A'$ to a unit sphere $A$ to compute target normals on this sphere ($\widetilde{N}_{A'}$).
2. Construct analogous target normals ($T$) that relate to the normals of input shape $B$ ($N_B$) in the same way that the mapped target normals ($\widetilde{N}_{A'}$) relate to $N_A$.
3. Utilizing inputs $B$ and $T$, generate the stylized shape $B'$ whose normals approximate $T$ through optimization.

### Generating $\widetilde{N}_{A'}$

Depending on the provided style shape $A'$ , a set of target normals on a sphere $\widetilde{N}_{A'}$ is obtained by closest normals. For simple convex shapes like an icosahedron, $ \widetilde{N}_{A'} $ is computed by snapping the normals of the sphere to the nearest normal in the style shape ${N}_{A'}$ .

### Generating $T$

Generating target normals $T$ on the input shape $B$ using analogy necessitates correspondences between $A$ and $B$. This is achieved through the *Gauss map*, leveraging the fact that $A$ is always a unit sphere. The unit normal vector of each element on the input shape $B$ can be interpreted as a point on $A$, enabling the mapping of signals from $A$ back to $B$. Once the correspondences are obtained via the normals of input shape $N_B$, $T$ can be computed by aligning $\widetilde{N}_{A'}$ with $B$. In code implementation, this process can be streamlined into a single function. The function directly derives $T$ from the surface normals of the target style shape $A'$.

```cpp
void setTargetN(const Eigen::MatrixXd& styleN, const Eigen::MatrixXd& currentN,
                Eigen::MatrixXd& targetN) {
  targetN.resizeLike(currentN);
  for (int i = 0; i < currentN.rows(); i++) {
    int minIdx;
    (styleN.rowwise() - currentN.row(i))
        .rowwise()
        .squaredNorm()
        .minCoeff(&minIdx);
    targetN.row(i) = styleN.row(minIdx);
  }
}
```

### Generating $B'$

After obtaining a set of target normals $T=\{\mathrm{t}_k\}$ for each vertex $k$, the objective is to derive a deformed output shape $B'$ that approximates the surface normals to $T$. Let's denote $V$ as a matrix comprising vertex locations with a size of $|V|$-by-3. As a deformation of the input shape, our output shape $B'$ uses $V^{\prime}$ to signify the $|V|$-by-3 matrix of the deformed vertex locations. The energy optimization process, driven by normal deformation, can be expressed as:


$$

\min_{\mathbf{V}^{\prime}}\sum_{k\in\mathbf{V}}E_R(\mathbf{v}_k,\mathbf{u}_k)+\lambda a_k\|\hat{n}_k(\mathbf{V}^{\prime})-\mathbf{t}_k\|_2^2,
$$

Here, $E_R$ symbolizes a regularization energy preserving the details of the input mesh, while the second portion quantifies the squared distance from the output unit surface normal $\hat{n}_k(\mathbb{V}^{\prime})$ to the target output normal $t_{k}$ at vertex $k$. To denote the Voronoi area of vertex $k$, we use $a_k$, with $\lambda$ serving as a weighting parameter that mediates between the two terms. The variables $\mathrm{v}_k\left(\mathrm{u}_k\right)$ outline the input (output) location of vertex $k$. With a smaller value of $\lambda$, the method maintains the input shape $B$; employing a larger $\lambda$ promotes shape deformation towards the style of $A^{\prime}$. The selection of $E_R$ is dependent on the user's objectives and different results can be achieved with varying regularizations.

### Normal-Driven Optimization with ARAP


We can use $\mathrm{e}_{ij}:=\mathrm{v}_j-\mathrm{v}_i\in\mathbb{R}^3$ to denote the edge vector between vertices $i,j$ on the original mesh, and e$^{\prime}_{ij}:=v_j^{\prime}-v_i^{\prime}$ for the edge vectors on the deformed mesh. We can write down the energy that uses ARAP regularization as

$$
\min_{\mathrm{V',R}}\sum_{k\in V}\underbrace{\sum_{i,j\in\mathcal{N}_k}w_{ij}\|\mathrm{R}_k\mathrm{e}_{ij}-\mathrm{e'}_{ij}\|_2^2}_{\text{$E_{\mathrm{ARAP}}$}} +\lambda a_k\|\hat{n}_k(\mathrm{V'})-\mathrm{t}_k\|_2^2,
$$

We use $\mathcal{N}_k$ to denote the edge vectors of the spokes and rims at vertex $k$, $\mathbb{R}_k\in\mathbb{SO}(3)$ to denote a 3-by-3 rotation matrix defined on $k$, and $w_{ij}$ is the cotangent weight of edge $i,j$. However, this energy is difficult to optimize because the term $\hat{n}_k(V^{\prime})$ is non-linear in $V'$.

We adapt the observation that the space of unit vectors can be captured by rotations. Thus, we can perform a change of variables by replacing $\hat{n}_k(V^{\prime})$ with the *rotated* unit normal of the input mesh $\mathbb{R}_k\hat{\mathbf{n}}_k$ as


$$
\boxed{\min_{\mathrm{V',R}}\sum_{k\in V}\sum_{i,j\in\mathcal{N}_k}w_{ij}\|\mathrm{R}_k\mathrm{e}_{ij}-\mathrm{e'}_{ij}\|_2^2+\lambda a_k\|\mathrm{R}_k\hat{\mathrm{n}}_k-\mathrm{t}_k\|_2^2,}
$$

where $\hat{\mathrm{n}}_k$ is the $k$th unit vertex normal of the input mesh computed via area-weighted average of face normals, which is constant throughout the optimization. This $\mathbb{R}_k\hat{n}_k$ can be perceived as an approximation of the area-weighted vertex normals of the output mesh $\hat{n}_k(\mathbb{V}^{\prime}).$ 

We minimize this energy via the local/global strategy, where the local step involves solving a set of small Orthogonal Procrustes problems and the global step amounts to a linear solve.

### Local Step with $E_\mathrm{ARAP}$ 

Given a fixed $V'$, we obtain the optimal rotation for each vertex $k$ by solving the following minimization problem

$$
\mathrm{R}_k=\underset{\mathrm{R}_k\in\mathrm{SO}(3)}{\operatorname*{\arg\min}}\sum_{i,j\in\mathcal{N}_k}w_{ij}\|\mathrm{R}_k\mathrm{e}_{ij}-\mathrm{e}^{\prime}{}_{ij}\|_2^2+\lambda a_k\|\mathrm{R}_k\hat{\mathrm{n}}_k-\mathrm{t}_k\|_2^2
$$

The above optimization is an instance of the *Orthogonal Procrustes* which finds the best rotation matrix $\mathbb{R}_k$ to map a set of vectors $(\mathbf{e}_{ij},\mathbf{\hat{n}}_k)$ to another set of vectors $(\mathbf{e}^{\prime}_{ij},\mathbf{t}_k)$. We can re-write it into a more compact expression as:

$$
\mathbb{R}_k^\star = \operatorname*{argmax}_{\mathbb{R}_k\in\mathrm{SO}(3)}\mathrm{Tr}(\mathbb{R}_k\mathbb{X}_k)
$$

$$
\mathbf{X}_k=\begin{bmatrix}\mathbf{E}_k&\hat{\mathbf{n}}_k\end{bmatrix}
\begin{bmatrix}\mathbf{W}_k&\\
&\lambda a_k\end{bmatrix}
\begin{bmatrix} \mathbf{E}_k^{\prime\top} \\
\mathbf{t}_k^\top\end{bmatrix}.
$$

where $\mathbf{W}_k$ is a $|N_k|$-by-$|N_k|$ diagonal matrix of the cotangent weights $w_{ij}$, $\mathbb{E}_k$ and $\mathbb{E}^{\prime}_k$ are $3$-by-$|N_k|$ matrices concatenating the edge vectors of the face one-ring at the rest and deformed states, respectively. One can then derive the optimal $\mathbb{R}_k$ from the SVD of $\mathcal{X}_k=\mathcal{U}_k\Sigma_k\mathcal{V}_k^\top$:

$$
\mathbb{R}_k=\mathcal{V}_k\mathcal{U}_k^\top,
$$

up to changing the sign of the column of $\mathcal{U}_k$ so that $\det(\mathbb{R}_k)>0$.

### Global Step with $E_\mathrm{ARAP}$

The global step updates the deformed vertex positions $V'$ from a
fixed set of rotations $R$ obtained via the local step. This boils down to solving the following problem

$$
\mathrm{V}^{\prime\star}=\arg\min_{\mathrm{V}^{\prime}}\sum_{k\in V}\sum_{i,j\in\mathcal{N}_k}w_{ij}\|\mathrm{R}_k\mathrm{e}_{ij}-\mathrm{e}^{\prime}_{ij}\|_2^2
$$

We can expand this energy as

$$
\sum_{k\in V}\sum_{i,j\in\mathcal{N}_k}w_{ij}\|\mathrm{R}_k\mathrm{e}_{ij}-\mathrm{e}'_{ij}\|_2^2
$$

$$
=\sum_{k\in V}\sum_{i,j\in f_k}w_{ij}\mathrm{e'}_{ij}^\top\mathrm{e'}_{ij}-2w_{ij}\mathrm{e'}_{ij}^\top\mathrm{R}_k\mathrm{e}_{ij}+\mathrm{constant}
$$

It is often convenient to express the summation in terms of matrices.
We introduce a directed incidence matrix $\mathcal{A}_k$ with size $|V|$-by-$|\mathcal{N}_k|$ to represent the edge vectors in $\mathcal{N}_k$ as $V^\top\mathcal{A}_k$, and we use $\mathrm{M}_k$ to represent a $|\mathcal{N}_k|$-by-$|\mathcal{N}_k|$ diagonal matrix of the weights $w_{ij}$. Then we can re-write the energy in terms of matrices as

$$
\begin{aligned}
&\sum_{k\in V}\operatorname{Tr}(\mathrm{M}_k\mathrm{A}_k^T\mathrm{V}^{\prime}\mathrm{V}^{\prime T}\mathrm{A}_k)-2\operatorname{Tr}(\mathrm{M}_k\mathrm{A}_k^T\mathrm{V}^{\prime}\mathrm{R}_k\mathrm{V}^T\mathrm{A}_k)  \\
&=\sum_{k\in V}\operatorname{Tr}(\mathrm{V'}^\top\mathrm{A}_k\mathrm{M}_k\mathrm{A}_k^\top\mathrm{V'})-2\operatorname{Tr}(\mathrm{R}_k\mathrm{V}^\top\mathrm{A}_k\mathrm{M}_k\mathrm{A}_k^\top\mathrm{V'})  \\
&=\operatorname{Tr}\left(\mathrm{V^{\prime}}^\top\left(\sum_k\mathrm{A}_k\mathrm{M}_k\mathrm{A}_k^\top\right)\mathrm{V^{\prime}}\right)-2\operatorname{Tr}\left(\left(\sum_k\mathrm{R}_k\mathrm{V}^\top\mathrm{A}_k\mathrm{M}_k\mathrm{A}_k^\top\right)\mathrm{V^{\prime}}\right)  \\
&=\operatorname{Tr}(\mathrm{V^{\prime}}^\top\mathrm{QV^{\prime}})-2\operatorname{Tr}(\mathrm{RKV^{\prime}}),
\end{aligned}
$$

where $\mathbb{R}=\{\mathbb{R}_k\}$ is the concatenation of all the rotations, $Q$ is a $|V|$-by-$|V|$ symmetric matrix, and $K$ is a $|9V|$-by-$|3V|$ matrix stacking the constant terms which can be computed during the precomputation. We can then find the optimal $V'$ by solving a linear system

$$
\mathrm{QV^{\prime}=K^{\top}R^{\top}}
$$

$Q$ is the cotangent Laplacian. We can pre-factorize $Q$ to speed up runtime performance. With these pieces in hand, we can minimize our energy by iteratively performing the local and the global steps.

## Validation

### Results

![Higher lambda values result in greater style changes.](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202404192112365.png)

By changing $\lambda$, it was observed that the degree to which style affects the original object can indeed be adjusted, with larger $\lambda$ values resulting in more significant changes.

![Different target normal settings lead to distinct results.](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202404192113505.png)

Setting the target normal $T$ as a constant or treating it as a function of the output mesh $B'$ leads to different local minima. Therefore, setting $T$ as a constant may yield different results in some cases, such as the ears of the bunny.

In terms of convergence, when $T$ is constant, the convergence behaves similarly to the original ARAP, with the energy decreasing monotonically. However, when $T$ depends on $B'$, a monotonic decrease in energy is not guaranteed. But the optimization still converges in my experiments.

### Limitations

While the proposed algorithm presents a direct and efficient approach to style transfer, it still grapples with several unresolved issues. For instance, it remains uncertain whether randomly provided target normals can be achieved through deformation, and if so, whether such alterations might result in surface inversion or other undesired behaviors.

Presently, the method struggles with high-genus style shapes, which entail topological changes. For instance, attempting to utilize curvature flow to morph such shapes into spheres proves unfeasible without addressing essential topological adjustments.

Additionally, the method overlooks area distortion concerns. The adoption of techniques like curvature flow or Gauss maps can induce significant area distortions.