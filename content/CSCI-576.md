---
title: Multimedia Systems Design
date: 2023-10-08 19:32:01
description: Yeah, grade is something you need to worry about. But after five years when you graduate and you're working in the industry, the grade is not. You're going to remember what you learned and how you're applying it.
---
[[GAMES202.md ]]

> I especially try to tell students, yeah, grade is something you need to worry about. But after five years when you graduate and you're working in the industry, the grade is not. You're not going to remember the grade. You're going to remember what you learned and how you're applying it.  
> ——Parag Havaldar


# Anti-aliasing

This assignment covers resampling and filtering for RGB images. The job is to display them using C++ without external libraries (except for WxWidgets). 

The program takes four parameters:

1. Image name in 8-bit per channel RGB format (24 bits per pixel).
2. A scaling factor (S) between 0 and 1 for resizing the image.
3. A boolean value (A) to turn aliasing on or off.
4. Window width/height for displaying the original image overlaid when the control key is pressed.

> Tips: When resizing and aliasing simultaneously, only the pixels that need to be displayed are counted for their value through the filter to speed up the program.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202310090018236.gif)


## Extra Credit

Knowing that the samples lost/removed will always have a random sampling, predict the reconstruction error given a
specific image with its content as input and a number x as percentage input.

> Fit a function with both FFT and color channel variations as inputs.

# Object Detection

This assignment covers practical aspects of color representations, color spaces, and data structures commonly utilized in color analysis, with a specific focus on their application in detecting and localizing objects within images. The task involves processing a set of object images, each depicting a colorful object against a green background, and creating color representations for these objects. The goal is to use these representations as data points to identify and outline the areas of objects within a given input image, which may contain a combination of objects.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202312092249839.png)

# Image Compression

This programming assignment focuses on understanding image compression using wavelets. The task involves reading an RGB image file, converting the pixel data to a Discrete Wavelet Transform (DWT) representation (similar to JPEG2000 implementation) for each color channel, and subsequently decoding the representations based on a specified parameter `n`. The decoding process utilizes only `n` levels of the low-pass coefficients.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202312092249105.gif)

# Project: Video Querying

This project focuses on the complexities of searching and indexing video/audio content, distinct from text-based methods. The task involves efficiently identifying and indexing video snippets within a database based on content, with the additional challenge of computing the indexed start frame of a query video snippet.

We have successfully built a database of 20 approximately 15-minute videos, achieving the goal of identifying an exact match frame within around 100 milliseconds. Our rendering process effectively showcased the synchronization between audio and video.

![](https://raw.githubusercontent.com/NothingToSay0031/Images/main/202312092250853.gif)

[Source Code](https://github.com/NothingToSay0031/VideoQuerying)
