---
title: "ReSTIR: Path Reuse in Real-time"
date: 2025-04-21 17:23:03
description: Reservoir-based SpatioTemporal Importance Resampling for Real-time Ray Tracing.
math: true
---

# ReSTIR 

This is my [ReSTIR implementation](https://github.com/NothingToSay0031/ReSTIR), developed on top of Microsoft’s DirectX 12 Raytracing Samples.

[A Gentle Introduction to ReSTIR: Path Reuse in Real-time](https://intro-to-restir.cwyman.org/).

# Resampled Importance Sampling (RIS)

## Proof: $\mathbb{E}[W_X]$ is to estimate $\frac{1}{\hat{p}(X)}$

We begin by computing the expectation of $W_X$ over the samples $X_1, \dots, X_M$, conditioning on $X$:

$$
\mathbb{E}_{X_1, \dots, X_M} \left[ W_X \right] 
= \mathbb{E} \left[ \frac{1}{\hat{p}(X)} \cdot \frac{1}{M} \sum_{i=1}^M \frac{\hat{p}(X_i)}{p(X_i)} \right]
$$

Using linearity of expectation:

$$
= \frac{1}{\hat{p}(X)} \cdot \frac{1}{M} \sum_{i=1}^M \mathbb{E}_{X_i} \left[ \frac{\hat{p}(X_i)}{p(X_i)} \right]
$$

Since each $X_i \sim p(x)$:

$$
\mathbb{E}_{X_i} \left[ \frac{\hat{p}(X_i)}{p(X_i)} \right] = \int \frac{\hat{p}(x)}{p(x)} p(x) dx = \int \hat{p}(x) dx
$$

Therefore:

$$
\mathbb{E}_{X_1, \dots, X_M} \left[ W_X \right] = \frac{\int \hat{p}(x) dx}{\hat{p}(X)} = \frac{1}{\frac{\hat{p}(X)}{\int \hat{p}(x) dx}} = \frac{1}{\text{normalized } \hat{p}(X)}
$$

## Proof: $W_X$ is an Unbiased Contribution Weight

Based on [Course Notes](https://intro-to-restir.cwyman.org/presentations/2023ReSTIR_Course_Notes.pdf), Equation 3.1.

Let $X_1, \dots, X_M \sim p(x)$ be i.i.d. samples from a probability distribution $p$.  
We define:

$$
w_i = \frac{\hat{p}(X_i)}{p(X_i)}, \quad
W_X = \frac{1}{\hat{p}(X)} \cdot \left( \frac{1}{M} \sum_{i=1}^M w_i \right)
$$

Our goal is to show that $W_X$ is an **unbiased contribution weight**, meaning it satisfies:

$$
\mathbb{E}_X[f(X) W_X] = \int f(x) \, dx
$$


### Compute $\mathbb{E}_X[f(X) W_X]$


Since $W_X = \frac{1}{\hat{p}(X)} \cdot \left( \frac{1}{M} \sum_j w_j \right)$, we get:

$$
f(X) W_X = f(X) \cdot \frac{1}{\hat{p}(X)} \cdot \left( \frac{1}{M} \sum_j w_j \right)
$$

We are interested in evaluating:

$$
\mathbb{E}[f(X) W_X] = \mathbb{E}_{X_1, \dots, X_M}\left[ \mathbb{E}_{X \mid X_1,\dots,X_M}[f(X) W_X] \right]
$$

Given that resampling selects $X = X_i$ with probability:

$$
\Pr[X = X_i \mid X_1, \dots, X_M] = \frac{w_i}{\sum_{j=1}^M w_j}
$$

We have:

$$
\mathbb{E}[f(X) \mid X_1, \dots, X_M] = \sum_{i=1}^M \frac{w_i}{\sum_j w_j} f(X_i)
$$


Therefore:

$$
\mathbb{E}_{X \mid X_1,\dots,X_M}[f(X) W_X] 
= \sum_{i=1}^M \left( \frac{w_i}{\sum_j w_j} \cdot f(X_i) \cdot \frac{1}{\hat{p}(X_i)} \cdot \left( \frac{1}{M} \sum_j w_j \right) \right)
$$

Simplifying:

$$
= \frac{1}{M} \sum_{i=1}^M f(X_i) \cdot \frac{w_i}{\hat{p}(X_i)} 
= \frac{1}{M} \sum_{i=1}^M f(X_i) \cdot \frac{\hat{p}(X_i)}{p(X_i)} \cdot \frac{1}{\hat{p}(X_i)} 
= \frac{1}{M} \sum_{i=1}^M \frac{f(X_i)}{p(X_i)}
$$

Now:

$$
\mathbb{E}[f(X) W_X] = \mathbb{E}_{X_1, \dots, X_M} \left[ \frac{1}{M} \sum_{i=1}^M \frac{f(X_i)}{p(X_i)} \right]
$$

Since each $X_i \sim p(x)$, we know:

$$
\mathbb{E} \left[ \frac{f(X_i)}{p(X_i)} \right] = \int \frac{f(x)}{p(x)} p(x) dx = \int f(x) dx
$$

So:

$$
\mathbb{E}[f(X) W_X] = \frac{1}{M} \cdot M \cdot \int f(x) dx = \int f(x) dx
$$

### Conclusion

We have successfully proven:

$$
\mathbb{E}[f(X) W_X] = \int f(x)\, dx
$$

This shows that $W_X$ is indeed an **unbiased contribution weight**, as stated in Equation 3.1 of the ReSTIR course notes.

# Weighted Reservoir Sampling

## Reservoir Sampling

**Reservoir Sampling** is a class of algorithms used to randomly select $N$ elements from a stream of data (or from a set where $M$ is very large and cannot be stored entirely). The value of $N$ is usually small, and $M$ is typically large, meaning the entire dataset may not be stored in memory.

### Basic Algorithm

Given a sequence of size $M$, or when the total size is unknown and data is being streamed, you need to sample $N$ elements.

1. **Initialization**:
    
    * Create an array that can hold $N$ elements.
    * Populate this array with the first $N$ elements from the stream.
2. **Subsequent Elements**:
    
    * Starting from element $N+1$, for each new element in the stream, decide with a probability of $\frac{N}{M_{\text{so far}}}$ (where $M_{\text{so far}}$ is the total number of elements seen so far) whether the element should replace one of the elements in the array.
    * The probability of replacement for any element in the reservoir is equal across the array.
3. **Final Result**:
    
    * Once all elements have been processed, the array will contain $N$ elements, which are the required samples.

### Derivation of the Probability

For each element in the reservoir, the probability of it being retained is derived as follows:

* Before any new elements are encountered, all elements in the reservoir have a probability of 1 of being retained.
    
* At step $N+1$, the probability that an element in the reservoir is replaced by the $N+1$-th element is:
    
    $$\text{probability of replacement} = \frac{N}{N+1} \times \frac{1}{N} = \frac{1}{N+1}$$
    
    Therefore, the probability of not being replaced is:
    
    $$1 - \frac{N}{N+1} \times \frac{1}{N} = \frac{N}{N+1}$$
* At step $N+2$, the probability of not being replaced is:
    
    $$1 - \frac{N}{N+2} \times \frac{1}{N} = \frac{N+1}{N+2}$$
* This process continues, and after $M$ elements have been processed, the probability of an element being retained in the reservoir is:
    
    $$\text{probability of being retained} = 1 \times \frac{N}{N+1} \times \frac{N+1}{N+2} \times \frac{N+2}{N+3} \times \ldots \times \frac{M-1}{M}=\frac{N}{M}$$

Hence, every element has an equal probability of $\frac{N}{M}$ of being retained in the final sample.

When the total number of elements, $M_{\text{so far}}$, is unknown, this probability becomes $\frac{N}{M_{\text{so far}}}$ at any point during the sampling process.

## Weighted Reservoir Sampling

**Weighted Reservoir Sampling** extends the basic algorithm by allowing each element to have an associated weight $w_i$, which determines its likelihood of being included in the sample.

### Pseudocode for Weighted Reservoir Sampling

```plaintext
# Reservoir Sampling Algorithm with Weights

class Reservoir:
    y = 0                # Output sample
    w_sum = 0            # Sum of weights
    M = 0                # Number of samples seen so far

    function update(x_i, w_i):
        w_sum = w_sum + w_i
        M = M + 1
        if rand() < (w_i / w_sum):
            y = x_i

function reservoirSampling(S):
    Reservoir r
    for i = 1 to M:
        r.update(S[i], weight(S[i]))
    return r
```

### Derivation of the Probability

To understand why the probability of the last element being selected in **Weighted Reservoir Sampling** is $\frac{w_i}{w_{\text{total}}}$, let’s break it down step by step.

#### Definitions

* $S = \{x_1, x_2, \dots, x_M\}$: A sequence of elements.
* $w_i$: Weight associated with element $x_i$.
* $w_{\text{sofar}} = \sum_{k=1}^{j} w_k$: Total weight of elements processed up to $x_j$.
* $y$: Current reservoir sample.

#### Key Idea

Each element $x_i$ has a weight $w_i$, which determines the probability it gets selected into the reservoir **at the time it is processed**. For $x_i$ to remain in the reservoir, it must survive the updates from all subsequent elements $x_{i+1}, x_{i+2}, \dots, x_M$.

#### Selection Probability for $x_i$

1. **Initial Selection**  
    When $x_i$ is processed, it has a probability of being selected as $y$:
    
    $$P(\text{select } x_i \text{ at step } i) = \frac{w_i}{w_{\text{sofar}}}$$
    
    Here, $w_{\text{sofar}}$ is the sum of weights of the elements processed up to $x_i$.
    
2. **Survival Probability**  
    After $x_i$ is selected, it must **survive replacement** by $x_{i+1}, x_{i+2}, \dots, x_M$. At each subsequent step $j$, $x_i$ is replaced with probability:
    
    $$P(\text{replace } x_i \text{ at step } j) = \frac{w_j}{w_{\text{sofar}}^{(j)}}$$
    
    where $w_{\text{sofar}}^{(j)}$ is the cumulative weight after including $x_j$.
    
    The probability that $x_i$ **survives** step $j$ is:
    
    $$P(\text{survive step } j) = 1 - \frac{w_j}{w_{\text{sofar}}^{(j)}} = \frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}}$$
    
3. **Combined Survival Probability**  
    For $x_i$ to remain the final reservoir sample, it must survive all replacements from $x_{i+1}$ to $x_M$. The overall survival probability is:
    
    $$P(\text{survive } x_{i+1}, \dots, x_M) = \prod_{j=i+1}^M \left( \frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}} \right)$$
    
4. **Final Probability for $x_i$**  
    Combining the probability of being selected at step $i$ with the probability of surviving subsequent steps, we have:
    
    $$P(x_i \text{ is final sample}) = P(\text{select } x_i \text{ at step } i) \cdot P(\text{survive } x_{i+1}, \dots, x_M)$$
    
    Substituting the expressions:
    
    $$P(x_i \text{ is final sample}) = \frac{w_i}{w_{\text{sofar}}} \cdot \prod_{j=i+1}^M \left( \frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}} \right)$$
    

#### Simplification Using Recursion

The term $\frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}}$ can be rewritten as:

$$\frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}} = \frac{w_{\text{sofar}}^{(j-1)}}{w_{\text{sofar}}^{(j)}}$$

This reflects the fact that removing the weight $w_j$ leaves the cumulative weight of the previous step. Substituting this into the product:

$$\prod_{j=i+1}^M \left( \frac{w_{\text{sofar}}^{(j)} - w_j}{w_{\text{sofar}}^{(j)}} \right) = \prod_{j=i+1}^M \left( \frac{w_{\text{sofar}}^{(j-1)}}{w_{\text{sofar}}^{(j)}} \right)$$

This is a telescoping product, where intermediate terms cancel out, leaving:

$$\prod_{j=i+1}^M \left( \frac{w_{\text{sofar}}^{(j-1)}}{w_{\text{sofar}}^{(j)}} \right) = \frac{w_{\text{sofar}}^{(i)}}{w_{\text{sofar}}^{(M)}}$$

#### Substituting Back

Substituting this result into the original formula:

$$P(x_i \text{ is final sample}) = \frac{w_i}{w_{\text{sofar}}^{(i)}} \cdot \frac{w_{\text{sofar}}^{(i)}}{w_{\text{sofar}}^{(M)}}$$

The $w_{\text{sofar}}^{(i)}$ terms cancel, leaving:

$$P(x_i \text{ is final sample}) = \frac{w_i}{w_{\text{sofar}}^{(M)}}$$

Since $w_{\text{sofar}}^{(M)} = w_{\text{total}}$, we conclude:

$$P(x_i \text{ is final sample}) = \frac{w_i}{w_{\text{total}}}$$

### Combining Weighted Reservoir Sampling with RIS

The following steps illustrate how this combination works:

1. Generate a sample stream for each pixel, neighboring pixels, and time-reusable pixels in the image.
2. Update the reservoir with the sample, weight, and the total count of samples each time.
3. After updating, use the **RIS unbiased estimator** to perform the final sampling.


# References

[Understanding The Math Behind ReSTIR DI](https://zhuanlan.zhihu.com/p/591979133)

[ReSTIR GI](https://zhuanlan.zhihu.com/p/551267761)

[UE5.4 Lumen ReSTIR Gather](https://zhuanlan.zhihu.com/p/703950102)

[UE5.4 Lumen ReSTIR Gather](https://zhuanlan.zhihu.com/p/704930249)

[ReSTIR DI](https://www.cnblogs.com/Liuwq/p/15974079.html)