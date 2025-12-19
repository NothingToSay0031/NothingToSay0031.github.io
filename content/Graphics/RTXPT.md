---
title: 'NVIDIA RTXPT: Code Walkthrough'
date: '2025-05-09T20:25:47-07:00'
description: Real-time path tracing library and sample.
math: true
---

这篇博客主要探讨了 NVIDIA 开源的 [RTX Path Tracing (RTXPT)](https://github.com/NVIDIA-RTX/RTXPT) 项目。路径追踪的基础知识我是在 TU Wien 的 Rendering 课程上学习的，当时也写了一篇[[MIS_NEE.md|关于 MIS 和 NEE 的博客]]，但一直没有真正编写过完整的 Path Tracing 代码，对 NEE 和 BSDF 在 MIS 中的正确计算也只是略知一二。最近看到这个项目，觉得是个很好的学习机会，正好可以深入理解这些概念。虽然这个库还实现了许多实时路径追踪的优化算法，但本篇主要聚焦于 MIS 和 NEE 的实现过程。

# `RayGen` Shader

我们来开始解析 NVIDIA RTXPT 代码中的 `Sample.hlsl` 文件，并从 `RayGen` (光线生成) 着色器入手。这部分是路径追踪的起点，负责为每个像素生成初始光线并驱动整个追踪过程。

在 DirectX Raytracing (DXR) 中，`RayGen` 着色器是光线追踪管线的入口点。对于屏幕上的每一个像素（或者说，每一个调度），`RayGen` 着色器都会被执行一次。它的主要任务是：

1.  **初始化**：设置当前像素的追踪环境和状态。
2.  **生成主光线** (Primary Ray)：根据相机参数计算从视点出发，穿过当前像素的光线。
3.  **驱动光线追踪**：调用光线追踪的核心逻辑，模拟光线在场景中的传播、碰撞和着色。
4.  **收集结果**：将最终计算得到的颜色写入输出纹理。

现在，让我们深入 `Sample.hlsl` 中的 `RayGen` 函数：

```hlsl
[shader("raygeneration")]
void RayGen()
{
    // 1. 获取当前像素坐标
    uint2 pixelPos = DispatchRaysIndex().xy;

    // 2. 初始化工作上下文 (WorkingContext)
    PathTracer::WorkingContext workingContext = getWorkingContext( pixelPos );

    // 根据不同的路径追踪模式进行初始化
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_REFERENCE
    // 对于非参考模式，启动稳定平面相关的路径追踪过程
    workingContext.stablePlanes.StartPathTracingPass();
#endif

#if PATH_TRACER_MODE!=PATH_TRACER_MODE_FILL_STABLE_PLANES
    // 对于非填充稳定平面模式，重置调试信息
    workingContext.debug.Reset(0); 
#endif

    // 子采样索引，这里固定为0，注释表明是为了降噪引导缓冲区的稳定性
    uint subSampleIndex = 0; 

    // PathState 用于存储和管理一条光路的所有状态信息
    PathState path;

    // 3. 初始化路径状态并设置主光线
    //    - EmptyPathInitialize: 初始化路径的基本状态 (如像素ID，相机像素锥角等)
    //    - computeCameraRay: 根据像素位置计算相机光线
    //    - SetupPathPrimaryRay: 将计算出的相机光线设置到path状态中
    path = PathTracer::EmptyPathInitialize(pixelPos, g_Const.ptConsts.camera.PixelConeSpreadAngle);
    PathTracer::SetupPathPrimaryRay(path, Bridge::computeCameraRay(pixelPos, /*subSampleIndex*/0));

    // 4. 【可选】根据稳定平面模式处理首次命中
#if PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES
    // 如果是 PATH_TRACER_MODE_FILL_STABLE_PLANES 模式，
    // 光线的首次命中信息会从预计算的“基础稳定平面”(base stable plane, index 0)加载，
    // 而不是实际追踪主光线。这是一种优化手段，可以复用之前计算的结果。
    firstHitFromBasePlane(path, 0, workingContext);
    // lastOrigin = path.origin; // 记录光线起点，这里被注释掉了
#endif

    // 初始化用于构建稳定平面的次表面位置法线信息 (如果处于该模式)
#if PATH_TRACER_MODE_BUILD_STABLE_PLANES==1
    u_SecondarySurfacePositionNormal[pixelPos] = 0;
#endif

    // 5. 主路径追踪循环
    //    只要光线路径仍然有效 (isActive)，就继续调用 nextHit 进行下一次弹射处理
    while (path.isActive())
        nextHit(path, workingContext, false); // false 参数表示不跳过稳定平面探索
    
    // 6. 数据清理：处理 NaN 或 无穷大值
    //    防止计算过程中出现非法数值导致最终结果异常
    SanitizeNaNs(path, workingContext);
        
    // 7. 【可选】根据稳定平面模式提交降噪器相关的光照信息
#if PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES
    workingContext.stablePlanes.CommitDenoiserRadiance(path.getStablePlaneIndex(), path.denoiserSampleHitTFromPlane,
        path.denoiserDiffRadianceHitDist, path.denoiserSpecRadianceHitDist,
        path.secondaryL, path.hasFlag(PathFlags::stablePlaneBaseScatterDiff),
        path.hasFlag(PathFlags::stablePlaneOnDeltaBranch),
        path.hasFlag(PathFlags::stablePlaneOnDominantBranch));
#endif    

    // 8. 根据不同的路径追踪模式，计算最终的路径光照贡献
    float3 pathRadiance;
#if PATH_TRACER_MODE==PATH_TRACER_MODE_REFERENCE
    // 参考模式：直接使用路径累计的光照 (path.L)
    pathRadiance = path.L;
#elif PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES
    // 构建稳定平面模式：完成稳定平面的构建过程，并返回相应光照
    pathRadiance = workingContext.stablePlanes.CompletePathTracingBuild(path.L);
#elif PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES
    // 填充稳定平面模式：使用稳定平面数据完成光照计算
    pathRadiance = workingContext.stablePlanes.CompletePathTracingFill(g_Const.ptConsts.denoisingEnabled);
#endif
        
    // 调试相关的可视化功能 (如果启用)
#if PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES && ENABLE_DEBUG_DELTA_TREE_VIZUALISATION
    DeltaTreeVizExplorePixel(workingContext, 0);
    return; // 调试可视化时可能直接返回
#endif

    // 9. 输出最终颜色
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_BUILD_STABLE_PLANES
    // 如果不是构建稳定平面模式，则将计算得到的 pathRadiance 写入输出纹理 u_Output
    // alpha 设置为 1 对截图很重要
    u_Output[pixelPos] = float4( pathRadiance, 1 );    
#endif

    // 下面是一些调试打印的示例代码，已被注释
    // ...
}
```

**主要逻辑梳理：**

1.  **获取像素坐标 (`DispatchRaysIndex().xy`)**: 这是 DXR 的标准操作，用于确定当前线程处理哪个像素。
2.  **初始化 `WorkingContext` (`getWorkingContext`)**:
    * `getWorkingContext` 函数会打包该像素进行路径追踪所需的各种上下文信息，包括：
        * `ptConsts`: 路径追踪相关的常量（如最大弹射次数、场景信息等）。
        * `pixelPos`: 当前像素坐标。
        * `debug`: 调试相关的上下文和资源。
        * `stablePlanes`: “稳定平面” (Stable Planes) 技术的上下文。这是一种用于在复杂光照条件下（尤其是多次弹射后）提高性能和稳定性的技术，通过缓存和复用某些表面上的光照信息来实现。
    * 根据 `PATH_TRACER_MODE` (路径追踪模式，如参考模式、构建稳定平面模式、填充稳定平面模式)，可能会有不同的初始化步骤，特别是与 `stablePlanes` 相关的。

3.  **路径和主光线设置 (`PathTracer::EmptyPathInitialize`, `Bridge::computeCameraRay`, `PathTracer::SetupPathPrimaryRay`)**:
    * `PathState` 结构体是核心，它封装了一条光路在追踪过程中的所有状态（例如当前光线起点、方向、吞吐量、已弹射次数、累积光照等）。
    * `EmptyPathInitialize` 初始化一个空的 `PathState`。
    * `computeCameraRay` (在 `PathTracerBridgeDonut.hlsli` 中) 根据相机模型（如透视投影）计算出对应当前 `pixelPos` 的主光线（起点和方向）。
    * `SetupPathPrimaryRay` 将这条主光线的信息填充到 `PathState` 中。

4.  **`PATH_TRACER_MODE_FILL_STABLE_PLANES` 特殊处理**:
    * 如果处于这个模式，代码会调用 `firstHitFromBasePlane`。这个函数非常关键，它表明在某些模式下，**主光线的第一次碰撞并不通过实际的 `TraceRay` 调用来寻找**，而是直接从一个预先计算或缓存的“基础稳定平面” (base stable plane) 中加载命中信息。这通常用于利用时序或空域上的光照缓存来加速渲染。
    * `firstHitFromBasePlane` 会重建光线，并根据加载的命中信息（`PackedHitInfo`）来决定是内联处理未命中情况（调用 `PathTracer::HandleMiss`）还是准备调用命中着色器。
        * 如果使用 `USE_HIT_OBJECT_EXTENSION` (NVAPI Hit Object 扩展)，它会构造一个 `NvHitObject` 并通过 `NvInvokeHitObject` 来执行相应的 ClosestHit 着色器。
        * 否则，它会通过一些技巧（重新投射一条微小偏移的光线）来确保标准的 `TraceRay` 能够命中同一个三角形并触发正确的着色器。这是一个兼容性处理，目标是简化API后移除。

5.  **主路径追踪循环 (`while (path.isActive()) nextHit(...)`)**:
    * 这是路径追踪的核心迭代部分。只要 `path.isActive()` 返回真（意味着光线没有终止，例如达到最大深度、能量过低或打到背景等），就会调用 `nextHit`。
    * `nextHit` 函数负责：
        * 根据当前 `PathState` 中的散射光线信息（通常由上一个 `HandleHit` 或 `HandleMiss` 生成）进行下一次光线投射（`TraceRay` 或 `TraceRayInline`）。
        * 当光线投射完成后，会触发场景中的 `ClosestHit` (如果命中几何体) 或 `Miss` (如果未命中任何物体) 着色器。这些着色器会更新 `PathState`（例如，计算表面材质交互、生成新的散射光线、累积光照等）。
    * 我们将在后续文章中详细解析 `nextHit` 和相关的命中/未命中着色器。

6.  **结果处理与输出**:
    * `SanitizeNaNs`: 检查并修正路径光照 `path.L` 和吞吐量 `path.thp` 中的 `NaN` (Not a Number) 或无穷大值，保证输出的健壮性。
    * 根据 `PATH_TRACER_MODE` 的不同，`pathRadiance` 的最终计算方式也不同：
        * `REFERENCE` (参考模式): 直接使用路径追踪累积的光照 `path.L`。
        * `BUILD_STABLE_PLANES` (构建稳定平面模式): 调用 `workingContext.stablePlanes.CompletePathTracingBuild`，这可能涉及到将当前路径追踪的结果用于构建或更新稳定平面的数据结构。
        * `FILL_STABLE_PLANES` (填充稳定平面模式): 调用 `workingContext.stablePlanes.CompletePathTracingFill`，这可能意味着主要依赖稳定平面中存储的信息来计算最终颜色，当前路径追踪的结果可能用于调制或补充。
    * 最后，如果不是在构建稳定平面模式（该模式可能不直接输出图像，而是生成数据），则将 `pathRadiance` 写入到输出纹理 `u_Output` 中。

**总结 `RayGen` 的核心职责**

`RayGen` 着色器为每个像素精心策划了路径追踪的“第一步”。它不仅生成初始相机光线，还根据不同的运行模式（尤其是与“稳定平面”相关的模式）采取不同的初始化策略。最核心的是它驱动的 `while (path.isActive()) nextHit(...)` 循环，这个循环不断地投射光线、处理碰撞、更新路径状态，直到光路终止。

接下来，我们将深入探讨 `nextHit` 函数的实现，以及 `ClosestHit` 和 `Miss` 着色器是如何与 `PathState` 交互来模拟复杂的光线传播和材质表现的。

# 深入 `nextHit` 与 `firstHitFromBasePlane`

在上一节中，我们分析了 `RayGen` 着色器如何初始化路径追踪并发出主光线。现在，我们将目光投向光线在场景中“弹射”的核心逻辑，主要通过 `nextHit` 函数实现。此外，我们还会探讨一个特殊的函数 `firstHitFromBasePlane`，它在特定模式下用于优化首次光线命中。

## `nextHit`：驱动光线在场景中持续弹射

`nextHit` 函数是路径追踪循环的核心，在 `RayGen` 的 `while (path.isActive())` 循环中被反复调用。每调用一次，它就负责处理光线的下一次弹射（或称“路径顶点”）。

```hlsl
void nextHit(inout PathState path, const PathTracer::WorkingContext workingContext, uniform bool skipStablePlaneExploration)
{
// Conditionally use Hit Object Extension (RayQuery) or standard TraceRay
#if USE_HIT_OBJECT_EXTENSION
    RayDesc ray; RayQuery<RAY_FLAG_NONE> rayQuery;
    PackedHitInfo packedHitInfo; uint SERSortKey;

    // 1. 准备并追踪散射光线
    // Bridge::traceScatterRay 会从 PathState 中获取上一 bounces 的散射光线信息，
    // 初始化 ray 和 rayQuery，并执行 TraceRayInline。
    // 如果有命中，ray.TMax 会被更新为实际的命中距离。
    Bridge::traceScatterRay(path, ray, rayQuery, packedHitInfo, SERSortKey, workingContext.debug);

    NvHitObject hit; // NVAPI Hit Object
    if (rayQuery.CommittedStatus() != COMMITTED_TRIANGLE_HIT)
    {
        // 2a. 未命中 (Miss)
        // 如果 RayQuery 没有命中三角形，则内联调用 HandleMiss 处理。
        PathTracer::HandleMiss(path, ray.Origin, ray.Direction, ray.TMax, workingContext );
    }
    else
    {
        // 2b. 命中 (Hit)
        // 构建内置的三角形交叉属性
        BuiltInTriangleIntersectionAttributes attrib;
        attrib.barycentrics = rayQuery.CommittedTriangleBarycentrics();

        // 使用 NvMakeHitWithRecordIndex 创建一个 HitObject。
        // 这个 HitObject 封装了命中信息，并将用于调用正确的 ClosestHit 着色器。
        // RecordIndex 用于 Shader Binding Table (SBT) 索引。
        NvMakeHitWithRecordIndex( rayQuery.CommittedInstanceContributionToHitGroupIndex()+rayQuery.CommittedGeometryIndex(), SceneBVH, rayQuery.CommittedInstanceIndex(), rayQuery.CommittedGeometryIndex(), rayQuery.CommittedPrimitiveIndex(), 0, ray, attrib, hit );
        
        uint vertexIndex = path.getVertexIndex();
        PathPayload payload = PathPayload::pack(path); // 将 PathState 打包到 payload

        // Shader Execution Reordering (SER) - 可选的着色器执行重排序优化
#if SER_USE_SORTING
        if (workingContext.ptConsts.enableShaderExecutionReordering)
#if SER_USE_MANUAL_SORT_KEY
            NvReorderThread(SERSortKey, 16); // 使用手动生成的排序键
#else
            NvReorderThread(hit, 0, 0);      // 使用基于命中属性的启发式排序键
#endif
#endif // SER_USE_SORTING

        // 调用 HitObject 对应的 ClosestHit 着色器
        NvInvokeHitObject(SceneBVH, hit, payload);
        path = PathPayload::unpack(payload, PACKED_HIT_INFO_ZERO); // 从 payload 解包更新后的 PathState
    }
#else // Fallback to standard TraceRay if Hit Object Extension is not used
    // 1. 获取散射光线
    RayDesc ray = path.getScatterRay().toRayDesc(); // 从 PathState 获取要追踪的光线
    PathPayload payload = PathPayload::pack(path);   // 打包 PathState

    // 2. 执行标准 TraceRay
    // 这会调用 DXR 管线中的 ClosestHit 或 Miss 着色器
    TraceRay( SceneBVH, RAY_FLAG_NONE, 0xff, 0, 1, 0, ray, payload );
    
    // 3. 解包 PathState
    path = PathPayload::unpack(payload, PACKED_HIT_INFO_ZERO);
#endif

// --- 稳定平面探索 (Stable Plane Exploration) ---
// (仅在 PATH_TRACER_MODE_BUILD_STABLE_PLANES 模式下)
#if PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES 
    int nextPlaneToExplore;
    // 如果当前路径已经终止 (isActive() == false) 并且还有稳定平面需要探索
    if (!path.isActive() && (nextPlaneToExplore=workingContext.stablePlanes.FindNextToExplore(path.getStablePlaneIndex()+1))!=-1 )
    {
        // 保存当前累积的非噪声光照
        float3 prevL = path.L; 
        PathPayload payloadForNewExploration;
        // 开始探索新的稳定平面，这会重置或初始化一个新的 PathState 到 payloadForNewExploration
        workingContext.stablePlanes.ExplorationStart(nextPlaneToExplore, payloadForNewExploration.packed);
        path = PathPayload::unpack(payloadForNewExploration, PACKED_HIT_INFO_ZERO);
        path.L = prevL; // 恢复之前累积的非噪声光照，继续在其上累加
        
        // 调试代码示例，用于可视化特定稳定平面的内容
		// #if 0 
        // if (path.getStablePlaneIndex()==1)
        //     workingContext.debug.DrawDebugViz( float4( DbgShowNormalSRGB(path.dir), 1 ) );
        // #endif
    }
#endif
}
```

**`nextHit` 的主要逻辑：**

1.  **获取并追踪光线**：
    * 光线的起点和方向通常由上一次命中表面后的材质散射决定，存储在 `PathState` 中。
    * **`USE_HIT_OBJECT_EXTENSION` 分支**:
        * `Bridge::traceScatterRay` 内部会使用 `RayQuery::TraceRayInline`。这是一种更现代、更灵活的光线追踪方式，允许在同一个着色器内完成光线投射和命中处理的逻辑。
        * `SERSortKey` (Shader Execution Reordering Sort Key) 是为光线排序准备的，旨在通过将具有相似计算负载或数据访问模式的光线分组执行来提高 GPU 效率。在我的 RTX 4060 Laptop GPU 上，开启SER会大幅提高实时路径追踪的性能（从`~10FPS`提升到`~20FPS`）。
    * **`else` 分支 (标准 `TraceRay`)**:
        * 直接从 `path.getScatterRay()` 获取光线描述，并调用传统的 `TraceRay` DXR 指令。这将暂停当前 `RayGen` (或 `ClosestHit`) 着色器，并根据命中结果调用相应的 `ClosestHit` 或 `Miss` 着色器。

2.  **处理命中 (Hit) 或未命中 (Miss)**：
    * **`USE_HIT_OBJECT_EXTENSION` 分支**:
        * **Miss**: 如果 `rayQuery.CommittedStatus()` 不是 `COMMITTED_TRIANGLE_HIT`，则认为光线未命中任何物体（或命中了程序化几何体，但这里主要关注三角形）。`PathTracer::HandleMiss` 会被调用，它通常会处理环境光照、终止路径等。
        * **Hit**:
            * `NvMakeHitWithRecordIndex` 和 `NvHitObject`: 如果命中，会创建一个 `NvHitObject`。这个对象可以理解为一个包含了所有命中信息的“句柄”，可以直接用于调用正确的 `ClosestHit` 着色器（通过 `NvInvokeHitObject`），而无需通过传统的SBT查找。这提供了更大的灵活性。
            * `NvReorderThread`: 在调用 `ClosestHit` 之前，可以选择性地进行线程重排序 (`NvReorderThread`) 以优化执行效率。
            * `NvInvokeHitObject`: 执行与该 `HitObject` 关联的 `ClosestHit` 着色器。`PathState` 被打包到 `payload` 中传递给 `ClosestHit`，并在其执行完毕后解包回来。
    * **`else` 分支 (标准 `TraceRay`)**:
        * `TraceRay` 本身会负责调用管线中绑定的 `ClosestHit` 或 `Miss` 着色器。这些着色器会直接修改传入的 `payload` (即打包后的 `PathState`)。

3.  **Payload 管理**:
    * `PathState` (包含光线的所有状态) 在调用 `TraceRay` 或 `NvInvokeHitObject` 之前通过 `PathPayload::pack` 打包成 `PathPayload`。在这些调用返回后，再通过 `PathPayload::unpack` 解包回 `PathState`。这样做是为了符合 DXR 的 payload 机制。

4.  **稳定平面探索 (Stable Plane Exploration)**:
    * 这个 `#if` 块只在 `PATH_TRACER_MODE_BUILD_STABLE_PLANES` 模式下有效。
    * 当一条路径追踪完成 (`!path.isActive()`) 后，如果还有“稳定平面”需要被探索（通过 `workingContext.stablePlanes.FindNextToExplore` 检查），系统会“重新利用”当前线程。
    * `ExplorationStart` 会为选定的下一个稳定平面准备一个新的初始路径状态，并加载到 `path` 变量中。这意味着当前像素的计算线程会接着去处理另一个（可能是场景中其它位置的）稳定平面的光照计算任务。这是一种任务分发和复用的机制，用于高效地构建稳定平面数据。

`nextHit` 是路径追踪的心跳，每一次调用都代表光线与场景的一次交互。

## `firstHitFromBasePlane`：从“稳定平面”开始的特殊首次命中

`firstHitFromBasePlane` 函数是一个非常有趣的优化，它仅在 `PATH_TRACER_MODE_FILL_STABLE_PLANES` 模式下的 `RayGen` 函数中被调用。其核心思想是：**对于主光线（相机光线）的第一次场景交叉，不进行实际的光线投射，而是直接从一个预先计算好的“基础稳定平面” (base stable plane) 加载命中信息。**

这通常用于以下场景：
* 当渲染前一帧或附近像素时，可能已经计算并存储了某些表面的光照信息（这些表面被识别为“稳定平面”）。
* 当前帧可以直接复用这些信息，从而跳过昂贵的首次光线追踪和部分光照计算。

```hlsl
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_REFERENCE // 这个函数在非参考模式下才可能被定义和使用
void firstHitFromBasePlane(inout PathState path, const uint basePlaneIndex, const PathTracer::WorkingContext workingContext)
{
    // 1. 从稳定平面加载数据
    //    这些数据包括：打包的命中信息(packedHitInfo)、光线方向(rayDir)、场景长度(sceneLength)即命中距离、
    //    吞吐量(thp)等。这些都是之前在构建稳定平面阶段计算并存储的。
    PackedHitInfo packedHitInfo; float3 rayDir; uint vertexIndex; uint SERSortKey; uint stableBranchID; float sceneLength; float3 thp; float3 motionVectors;
    workingContext.stablePlanes.LoadStablePlane(workingContext.pixelPos, basePlaneIndex, vertexIndex, packedHitInfo, SERSortKey, stableBranchID, rayDir, sceneLength, thp, motionVectors);

    // 2. 重建光线描述 (RayDesc)
    RayDesc ray;
    ray.Direction = rayDir; // 使用加载的方向
    // Origin 仍然使用 path 中由 SetupPathPrimaryRay 初始化的相机位置。
    // 注释警告：对于非主光线的弹射，这个 origin 是不正确的，但这里是处理主光线替换。
    ray.Origin    = path.origin; 
    ray.TMin      = 0;
    ray.TMax      = sceneLength; // 使用加载的命中距离作为 TMax

    // 路径顶点索引调整，因为我们将直接处理这次命中
    path.setVertexIndex(vertexIndex-1); 

    // 3. 更新 PathState 以反映这是基于稳定平面的命中
    path.setFlag(PathFlags::stablePlaneOnPlane , true);
    path.setFlag(PathFlags::stablePlaneOnBranch, true);
    path.setStablePlaneIndex(basePlaneIndex);
    path.stableBranchID = stableBranchID;
    path.thp = thp; // 设置加载的吞吐量

#if PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES
    // 加载主导稳定平面索引，并设置相应标志位
    const uint dominantSPIndex = workingContext.stablePlanes.LoadDominantIndexCenter();
    path.setFlag(PathFlags::stablePlaneOnDominantBranch, dominantSPIndex == basePlaneIndex );
    // 重置从稳定平面开始的弹射计数器和降噪器相关数据
    path.setCounter(PackedCounters::BouncesFromStablePlane, 0);
    path.denoiserSampleHitTFromPlane = 0.0;
    path.denoiserDiffRadianceHitDist = lpfloat4(0,0,0,0);
    path.denoiserSpecRadianceHitDist = lpfloat4(0,0,0,0);
#endif

    // 4. 处理加载的命中信息
    if (!IsValid(packedHitInfo)) // IsValid 是一个辅助宏或函数，检查 packedHitInfo 是否有效
    {
        // 4a. 无效命中 (视为 Miss)
        // 直接内联调用 HandleMiss，使用重建的光线信息。
        PathTracer::HandleMiss(path, ray.Origin, ray.Direction, ray.TMax, workingContext);
    }
    else
    {
        // 4b. 有效命中 (Hit)
#if USE_HIT_OBJECT_EXTENSION
        // 使用 Hit Object 扩展
        NvHitObject hit;
        // (IsValid(packedHitInfo) 已在上层 if 确认)
        const TriangleHit triangleHit = TriangleHit::make(packedHitInfo); // 解包为 TriangleHit
        const uint instanceIndex    = triangleHit.instanceID.getInstanceIndex();
        const uint geometryIndex    = triangleHit.instanceID.getGeometryIndex();
        const uint primitiveIndex   = triangleHit.primitiveIndex;
    
        BuiltInTriangleIntersectionAttributes attrib;
        attrib.barycentrics = triangleHit.barycentrics;
        // 创建 HitObject
        NvMakeHit( SceneBVH, instanceIndex, geometryIndex, primitiveIndex, 0, 0, 1, ray, attrib, hit );

        // 可选的 Shader Execution Reordering (SER)
        // 注释提到：首次弹射的排序通常对性能帮助不大，因为光线此时还比较相干。
#if 0 && SER_USE_SORTING 
        if (workingContext.ptConsts.enableShaderExecutionReordering) 
#if SER_USE_MANUAL_SORT_KEY
            NvReorderThread(SERSortKey, 16);    
#else
            NvReorderThread(hit, 0, 0);
#endif
#endif // SER_USE_SORTING

        PathPayload payload = PathPayload::pack(path);
        // 调用 HitObject 对应的 ClosestHit 着色器
        NvInvokeHitObject(SceneBVH, hit, payload);
        path = PathPayload::unpack(payload, PACKED_HIT_INFO_ZERO);
#else
        // 不使用 Hit Object 扩展时的兼容性“hack”
        // 目的是重新投射一条极短的光线，以确保能正确触发 DXR 管线中的 ClosestHit 着色器。
        float3 surfaceHitPosW; float3 surfaceHitFaceNormW;    
        // 加载表面位置和法线
        Bridge::loadSurfacePosNormOnly(surfaceHitPosW, surfaceHitFaceNormW, TriangleHit::make(packedHitInfo), workingContext.debug);    
        bool frontFacing = dot( -ray.Direction, surfaceHitFaceNormW ) >= 0.0;

        // 计算一个新的光线起点，稍微偏离表面，确保能再次命中同一三角形
        float3 newOrigin = ComputeRayOrigin(surfaceHitPosW, (frontFacing)?(surfaceHitFaceNormW):(-surfaceHitFaceNormW)) - ray.Direction * 8e-5;

        // 更新路径已行进的距离，因为我们“跳过”了从相机到 newOrigin 的这段距离
        PathTracer::UpdatePathTravelled(path, ray.Origin, ray.Direction, length(newOrigin-ray.Origin), workingContext, false, false); 

        ray.Origin = newOrigin; // 更新光线起点为这个微调后的位置
        // ray.TMax 保持不变 (sceneLength)，因为我们知道命中点在此距离内。
    
        PathPayload payload = PathPayload::pack(path);
        // 用这条极短的光线调用 TraceRay
        TraceRay( SceneBVH, RAY_FLAG_NONE, 0xff, 0, 1, 0, ray, payload );
        path = PathPayload::unpack(payload, PACKED_HIT_INFO_ZERO);
#endif // USE_HIT_OBJECT_EXTENSION
    }
}
#endif
```

**`firstHitFromBasePlane` 的关键点：**

1.  **数据加载**: 核心是 `workingContext.stablePlanes.LoadStablePlane(...)`。它从预计算的稳定平面数据中获取完整的首次命中信息，包括命中点、法线（间接通过`packedHitInfo`）、材质信息（通过SBT索引间接确定）、以及可能的初始吞吐量 `thp`。
2.  **路径状态更新**: 加载数据后，`PathState` 会被相应更新，设置各种与稳定平面相关的标志位和计数器。这使得后续的路径追踪逻辑能够感知到它是从一个稳定平面开始或经过一个稳定平面的。
3.  **处理加载的命中**:
    * 如果加载的 `packedHitInfo` 无效（可能表示之前认为的稳定平面在该像素视角下实际未命中），则直接调用 `PathTracer::HandleMiss`。
    * 如果有效，则根据是否使用 `USE_HIT_OBJECT_EXTENSION` 来触发相应的 `ClosestHit` 着色器：
        * **使用 Hit Object**: 直接构造 `NvHitObject` 并调用 `NvInvokeHitObject`。
        * **不使用 Hit Object**: 这里有一个精巧的“hack”。由于不能直接“注入”一个命中结果到标准的 DXR `TraceRay` 管线中，代码通过 `ComputeRayOrigin` 在已知的命中点附近（沿着法线方向稍微偏移一点）计算出一个新的光线起点 `newOrigin`。然后，从这个 `newOrigin` 发出一条非常短的、方向指向原始命中点的光线，并调用 `TraceRay`。这条光线几乎肯定会立刻命中同一个三角形，从而触发正确的 `ClosestHit` 着色器。`PathTracer::UpdatePathTravelled` 用于补偿因为修改了光线起点而“跳过”的原始光路长度。注释表明这个hack在SER API更普及时会被移除。

**总结**

* `nextHit` 是通用的光线弹射驱动函数，负责获取当前路径的散射光线，执行光线追踪（通过 `RayQuery` 或 `TraceRay`），并根据结果调用相应的 `HandleMiss` 或触发 `ClosestHit` 着色器 (通过 `NvInvokeHitObject` 或 DXR 管线)。它还包含了在特定模式下探索更多稳定平面的逻辑。
* `firstHitFromBasePlane` 是一个针对 `PATH_TRACER_MODE_FILL_STABLE_PLANES` 模式的特定优化。它通过加载预计算的稳定平面数据来“伪造”主光线的首次命中，避免了实际的光线投射，从而复用历史信息并加速渲染。

这两个函数共同构成了 RTXPT 中光线如何在场景中游走并与物体交互的核心机制。理解它们的运作方式，特别是它们如何根据不同的配置（如 `USE_HIT_OBJECT_EXTENSION` 和 `PATH_TRACER_MODE`）改变行为，对于深入掌握 RTXPT 的渲染流程至关重要。

# 深入 ClosestHit 与核心光线命中处理 PathTracer::HandleHit

在前两部分，我们了解了 `RayGen` 如何启动路径追踪，以及 `nextHit` 和 `firstHitFromBasePlane` 如何管理光线的投射与初步命中。现在，当一条光线确实命中了场景中的某个物体时，DXR管线会调用相应的 `ClosestHit` (最近命中) 着色器。

## ClosestHit 着色器

在 `Sample.hlsl` 文件中，你会看到 `ClosestHit` 着色器是通过一个宏 `CLOSEST_HIT_VARIANT` 来定义的。这种设计非常巧妙，它允许为不同类型的表面或交互定义多个 `ClosestHit` 着色器变体，每个变体可以携带一些优化提示。

```hlsl
// 定义 ClosestHit 着色器变体的宏
// name: 着色器名称后缀
// NoTextures: 是否忽略纹理采样的提示
// NoTransmission: 是否忽略透射计算的提示
// OnlyDeltaLobes: 是否只处理理想镜面/透射（Delta lobes）的提示
#define CLOSEST_HIT_VARIANT( name, NoTextures, NoTransmission, OnlyDeltaLobes )      \
[shader("closesthit")] void ClosestHit##name(inout PathPayload payload : SV_RayPayload, in BuiltInTriangleIntersectionAttributes attrib) \
{ \
    /* 从每个实例的附加数据中提取预计算的 SERSortKey (Shader Execution Reordering Sort Key) */ \
    uint SERSortKey = t_SubInstanceData[InstanceID()+GeometryIndex()].FlagsAndSERSortKey & 0xFFFF; \
    /* 调用核心的 HandleHit 函数，并传入优化提示和打包的命中信息 */ \
    HandleHit( PathTracer::OptimizationHints::make( NoTextures, NoTransmission, OnlyDeltaLobes, SERSortKey ), TriangleHit::make( InstanceIndex(), GeometryIndex(), PrimitiveIndex(), attrib.barycentrics ).pack(), payload); \
}

// 根据不同的优化组合生成8个 ClosestHit 着色器变体
// 例如，ClosestHit000, ClosestHit001, ..., ClosestHit111
#if 1 // 3bit 8-variant version
CLOSEST_HIT_VARIANT( 000, false, false, false ); // 无优化提示
CLOSEST_HIT_VARIANT( 001, false, false, true  ); // 只处理Delta Lobes
CLOSEST_HIT_VARIANT( 010, false, true,  false ); // 忽略透射
// ... 等等
CLOSEST_HIT_VARIANT( 111, true,  true,  true  ); // 忽略纹理、忽略透射、只处理Delta Lobes
#endif
```

**`ClosestHit` 着色器的主要作用：**

1.  **入口点**：当 `TraceRay` (或 `NvInvokeHitObject`) 确定了一个最近命中点时，DXR会根据Shader Binding Table (SBT) 中的设置，调用与该几何体关联的 `ClosestHit` 着色器。
2.  **收集命中信息**：它接收系统提供的 `BuiltInTriangleIntersectionAttributes` (内置三角形交叉属性，主要是重心坐标 `barycentrics`) 和 `SV_RayPayload` (光线载荷，即我们打包的 `PathState`)。
3.  **准备参数**:
    * 它从 `t_SubInstanceData` 这个StructuredBuffer中获取预计算的 `SERSortKey`。这个排序键用于后续可能的着色器执行重排序（SER）优化。
    * 它将 DXR 提供的命中信息（`InstanceIndex()`, `GeometryIndex()`, `PrimitiveIndex()`, `attrib.barycentrics`）打包成一个 `TriangleHit` 对象，然后再 `pack()` 成 `PackedHitInfo`。
    * 它根据宏参数创建 `PathTracer::OptimizationHints` 结构体。这些提示（如 `NoTextures`, `NoTransmission`, `OnlyDeltaLobes`）可以被 `HandleHit` 函数用来跳过某些计算，从而在特定情况下提高性能（例如，一个完全不透明且没有复杂纹理的材质）。
4.  **调用核心逻辑**: 最重要的是，所有的 `ClosestHit` 变体都会调用 `Sample.hlsl` 中的一个中介函数 `HandleHit(OptimizationHints, PackedHitInfo, PathPayload)`。

`Sample.hlsl` 中还有两个 `HandleHit` 的包装函数：
```hlsl
// 被 ClosestHit 着色器直接调用的版本
void HandleHit(const uniform PathTracer::OptimizationHints optimizationHints, const PackedHitInfo packedHitInfo, inout PathPayload payload)
{
    PathState path = PathPayload::unpack(payload, packedHitInfo); // 解包 PathState，并将当前命中信息设置进去
    PathTracer::WorkingContext workingContext = getWorkingContext(PathIDToPixel(path.id)); // 获取工作上下文
    // 调用另一个 HandleHitUnpacked，传入解包后的参数和 DXR 系统变量
    HandleHitUnpacked(optimizationHints, packedHitInfo, path, WorldRayOrigin(), WorldRayDirection(), RayTCurrent(), workingContext);
    payload = PathPayload::pack( path ); // 将可能已更新的 PathState 重新打包回 payload
}

// 进一步解包，并最终调用 PathTracer 命名空间内的核心 HandleHit
void HandleHitUnpacked(const uniform PathTracer::OptimizationHints optimizationHints, const PackedHitInfo packedHitInfo, inout PathState path, float3 worldRayOrigin, float3 worldRayDirection, float rayT, const PathTracer::WorkingContext workingContext)
{
    // 重新设置 path 中的 origin 和 dir，因为 PathPayload 为了减少寄存器压力可能没有携带它们。
    // 这些值从 DXR 的 WorldRayOrigin() 和 WorldRayDirection() 获取，代表了当前 TraceRay 指令的光线。
    path.origin = worldRayOrigin;
    path.dir = worldRayDirection;
    path.setHitPacked( packedHitInfo ); // 再次确认命中信息
    PathTracer::HandleHit(optimizationHints, path, worldRayOrigin, worldRayDirection, rayT, workingContext); // 调用 PathTracer.hlsli 中的核心 HandleHit
}
```
这些包装函数的主要职责是：
* 从 `PathPayload` 中解包出 `PathState`。
* 将当前光线的 `PackedHitInfo` 设置到 `PathState` 中。
* 获取当前像素的 `WorkingContext`。
* 从DXR内置函数（如 `WorldRayOrigin()`, `WorldRayDirection()`, `RayTCurrent()`）获取当前光线的准确起点、方向和命中距离 `T`。
* 最终调用定义在 `PathTracer/PathTracer.hlsli` 中的核心函数 `PathTracer::HandleHit`。
* 在核心逻辑执行完毕后，将更新后的 `PathState` 重新打包回 `PathPayload`。

现在，让我们把目光转向 `PathTracer/PathTracer.hlsli` 中那个至关重要的 `PathTracer::HandleHit` 函数。

### `PathTracer::HandleHit`：核心命中处理逻辑

这个函数是路径追踪中当光线与表面发生交互时的“大脑”。它负责加载材质、处理自发光、计算直接光照（Next Event Estimation）、进行BSDF采样以产生下一条光线，并处理路径终止等。

```hlsl
// PathTracer/PathTracer.hlsli
namespace PathTracer
{
    // ... (其他函数) ...

    // 目前只支持 TriangleHit；未来需要时会添加更多类型
    inline void HandleHit(const uniform OptimizationHints optimizationHints, inout PathState path, const float3 rayOrigin, const float3 rayDir, const float rayTCurrent, const WorkingContext workingContext)
    {
        // 1. 更新路径已行进的距离和相关状态 (如光线锥)
        UpdatePathTravelled(path, rayOrigin, rayDir, rayTCurrent, workingContext);
        
        const uint2 pixelPos = PathIDToPixel(path.id);
        // 初始化当前路径顶点的随机数生成器种子
        const SampleGeneratorVertexBase sampleGeneratorVertexBase = SampleGeneratorVertexBase::make(pixelPos, path.getVertexIndex(), Bridge::getSampleIndex() );
        
#if ENABLE_DEBUG_VIZUALISATION
        const bool debugPath = workingContext.debug.IsDebugPixel();
#else
        const bool debugPath = false;
#endif

        // ----- 命中时的主要步骤概述 -----
        // - 加载顶点/材质数据
        // - 如果 path.getVertexIndex() > 1 (非首次命中) 且命中自发光表面，计算 MIS 权重
        // - 累加自发光辐射亮度
        // - 使用阴影光线采样光源 (直接光照)
        // - 采样散射光线或终止路径

        // (关于如何判断“首次命中”在有 Primary Surface Replacement 时的讨论注释)

        // 2. 加载表面和材质数据
        const TriangleHit triangleHit = TriangleHit::make(path.hitPacked); // 从 path 中解包命中信息
        // Bridge::loadSurface 是一个非常关键的调用：
        // 它会根据 triangleHit 加载所有必要的表面属性，如位置、法线、切线、UV坐标。
        // 同时，它会加载材质属性（反照率、粗糙度、金属度、自发光、折射率等），
        // 并根据材质类型（如漫反射、镜面、玻璃等）构建一个 ActiveBSDF 对象。
        // optimizationHints (来自 ClosestHit 变体) 和 path.rayCone (光线锥信息，可用于纹理LOD) 会被传入。
        SurfaceData bridgedData = Bridge::loadSurface(optimizationHints, triangleHit, rayDir, path.rayCone, path.getVertexIndex(), pixelPos, workingContext.debug);

        // (调试 RayCone 数据的示例代码)

        // 3. 处理体积吸收 (Volume Absorption)
        float volumeAbsorption = 0; // 用于统计
        if (!path.interiorList.isEmpty()) // 如果光线当前在某个体积内部
        {
            const uint materialID = path.interiorList.getTopMaterialID(); // 获取最内层体积的材质ID
            const HomogeneousVolumeData hvd = Bridge::loadHomogeneousVolumeData(materialID); // 加载均匀体积数据
            const float3 transmittance = HomogeneousVolumeSampler::evalTransmittance(hvd, rayTCurrent); // 计算这段距离的透射率
            volumeAbsorption = 1 - luminance(transmittance);
            UpdatePathThroughput(path, transmittance); // 根据透射率衰减路径的吞吐量 (throughput)
        }

        // 4. 处理嵌套电介质 (Nested Dielectrics)
        // HandleNestedDielectrics 对于正确渲染具有多个界面的透明对象（如玻璃杯中的水）至关重要。
        // 它会更新 path.interiorList (当光线进入/离开体积时推入/弹出材质ID)。
        // 它可以拒绝“假命中”：例如，由于薄壁近似或接口逻辑，某些命中应被忽略，光线应视为穿过。
        // 还会根据当前介质更新 bridgedData.shadingData.IoR (外部折射率)。
        bool rejectedFalseHit = !HandleNestedDielectrics(bridgedData, path, workingContext);

        // (Delta Tree 可视化调试相关的代码块，如果命中被拒绝则返回)
#if PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES && ENABLE_DEBUG_DELTA_TREE_VIZUALISATION
        if (path.hasFlag(PathFlags::deltaTreeExplorer))
        {
            DeltaTreeVizHandleHit(path, rayOrigin, rayDir, rayTCurrent, bridgedData, rejectedFalseHit, HasFinishedSurfaceBounces(path), volumeAbsorption, workingContext);
            return;
        }
#endif
        if (rejectedFalseHit) // 如果是假命中，则忽略此次交互，光线实质上继续传播
            return;

        // 获取着色数据和BSDF的快捷方式
        const ShadingData shadingData = bridgedData.shadingData;
        const ActiveBSDF bsdf = bridgedData.bsdf;

        // (更多调试可视化代码：切线空间、光线锥足迹等)

        // 获取BSDF属性，如漫反射/镜面反射率、自发光等
        BSDFProperties bsdfProperties = bsdf.getProperties(shadingData);

        // 5. 累加自发光表面辐射 (Emissive Surface Handling)
        float3 surfaceEmission = 0.0;
        // 解包之前NEE步骤中存储的MIS信息 (如果上一 bounces 做了NEE且恰好采样到了当前这个自发光面)
        NEEBSDFMISInfo misInfo = NEEBSDFMISInfo::Unpack16bit(path.packedMISInfo);

        // 检查是否应该忽略此三角形的自发光，以及它是否有自发光
        if ( !(misInfo.SkipEmissiveBRDF && !path.wasScatterTransmission()) && (any(bsdfProperties.emission>0)) )
        {
            float misWeight = 1.0f; // 多重重要性采样 (MIS) 权重
            // 如果启用了光源采样 (NEE) 并且当前是通过BSDF采样命中的 (path.bsdfScatterPdf != 0)
            if( misInfo.LightSamplingEnabled && path.bsdfScatterPdf != 0 )
            {
                // 创建光源采样器
                // this is the NEE light sampler configured same as it was at previous vertex (previous vertex's "next event estimation" matches this light "event")
                LightSampler lightSampler = Bridge::CreateLightSampler( workingContext.pixelPos, misInfo.LightSamplingIsIndirect, workingContext.debug.IsDebugPixel() );
                // 计算 BSDF 路径命中自发光体的 MIS 权重
                misWeight = lightSampler.ComputeBSDFMISForEmissiveTriangle(bridgedData.neeLightIndex, path.bsdfScatterPdf, path.origin, shadingData.posW, misInfo.NarrowNEESamples, misInfo.TotalSamples);
                
                // (向光源采样器提供反馈，用于自适应光源采样)
                float simpleRandom = Hash32ToFloat( Hash32Combine( Hash32Combine(Hash32(path.getVertexIndex() + 0x0367C2C7), path.id), Bridge::getSampleIndex() ) );
                lightSampler.InsertFeedbackFromBSDF(bridgedData.neeLightIndex, average(path.thp*bsdfProperties.emission), misWeight, simpleRandom ); // 注意这里用 bsdfProperties.emission 更合理
            }

            surfaceEmission = bsdfProperties.emission * misWeight; // 应用MIS权重
            if( workingContext.ptConsts.fireflyFilterThreshold != 0 ) // 飞火过滤
                surfaceEmission = FireflyFilter(surfaceEmission, workingContext.ptConsts.fireflyFilterThreshold, path.fireflyFilterK);
            surfaceEmission *= Bridge::getNoisyRadianceAttenuation(); // 应用噪声衰减 (可能用于多重采样抗锯齿)

            // 如果不是填充稳定平面模式，将自发光贡献累加到路径光照 L
#if PATH_TRACER_MODE != PATH_TRACER_MODE_FILL_STABLE_PLANES 
            if (any(surfaceEmission>0))
                path.L += max( 0.xxx, path.thp*surfaceEmission ); 
#endif
        }
        
        // 6. 路径终止判断 (第一部分：最大深度和稳定平面逻辑)
        bool pathStopping = HasFinishedSurfaceBounces(path); // 检查是否达到最大表面弹射次数
        
        // 如果不是参考模式，调用稳定平面命中处理逻辑
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_REFERENCE
        // StablePlanesHandleHit 是稳定平面优化方案的关键部分。
        // 它可以更新稳定平面数据，将当前光照贡献给稳定平面，
        // 甚至根据稳定平面的状态终止或重定向当前路径。
        // pathStopping 可能会被此函数更新。
        StablePlanesHandleHit(path, rayOrigin, rayDir, rayTCurrent, optimizationHints.SERSortKey, workingContext, bridgedData, volumeAbsorption, surfaceEmission, pathStopping);
#endif

        // 7. 路径终止判断 (第二部分：俄罗斯轮盘赌 Russian Roulette)
        // 如果不是构建稳定平面模式（该模式下路径终止可能已由 StablePlanesHandleHit 处理）
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_BUILD_STABLE_PLANES 
        // HandleRussianRoulette 根据路径吞吐量进行俄罗斯轮盘赌。
        // 如果随机数超过吞吐量，路径终止；否则，吞吐量被放大以补偿。
        // 注意：此函数会更新 path.thp!
        pathStopping |= HandleRussianRoulette(path, sampleGeneratorVertexBase, workingContext); 
#endif

        if (pathStopping) // 如果决定终止路径
        {
            path.terminate(); // 设置路径为非激活状态
            return;           // 结束 HandleHit
        }

        // 如果是构建稳定平面模式，在此处提前返回。
        // 注释说明：在该模式下，自发光已被处理，路径也由 StablePlanesHandleHit 更新或终止，
        // 因此跳过后续的BSDF采样和NEE。
#if PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES    
        return;
#endif    
        
        // 保存散射前的路径状态，主要用于NEE计算时的吞吐量
        const PathState preScatterPath = path; 

        // 8. 生成散射光线 (BSDF Sampling)
        // GenerateScatterRay 是材质交互的核心：
        // - 根据表面材质的 BSDF (双向散射分布函数) 采样一个新的散射方向。
        // - 计算该采样方向的概率密度函数 (PDF)。
        // - 更新路径的起点 (path.origin = shadingData.posW) 和方向 (path.dir = newDir)。
        // - 更新路径吞吐量 (path.thp *= bsdf_color * cos_theta / pdf)。
        // - 返回 ScatterResult，包含是否有效及PDF。
        ScatterResult scatterResult = GenerateScatterRay(shadingData, bsdf, path, sampleGeneratorVertexBase, workingContext);
        
        // 9. 执行下一事件估计 (Next Event Estimation - NEE) / 直接光照采样
#if defined(RTXPT_COMPILE_WITH_NEE) && RTXPT_COMPILE_WITH_NEE!=0
        // HandleNEE 执行直接光照采样：
        // - 选择一个或多个光源。
        // - 从当前命中点向选定的光源投射阴影光线 (shadow ray)。
        // - 如果阴影光线未被遮挡，计算直接光照贡献。
        // - 计算并返回 MIS 相关信息 (neeResult.BSDFMISInfo)，这个信息会被打包到 path.packedMISInfo，
        //   用于下一 bounces 如果恰好通过BSDF采样命中了这个被NEE采样到的光源时，进行MIS加权。
        NEEResult neeResult = HandleNEE(optimizationHints, preScatterPath, shadingData, bsdf, sampleGeneratorVertexBase, workingContext);    
#else
        NEEResult neeResult = NEEResult::empty(); // 如果未编译NEE，则结果为空
#endif
        
        // 存储NEE的MIS信息和BSDF散射的PDF，供下一次弹射使用
        path.packedMISInfo  = (lpuint)neeResult.BSDFMISInfo.Pack16bit();
        path.bsdfScatterPdf = (lpfloat)scatterResult.Pdf;

        lpfloat3 neeDiffuseRadiance, neeSpecularRadiance;
        neeResult.GetRadiances(neeDiffuseRadiance, neeSpecularRadiance); // 获取NEE计算出的漫反射和镜面反射光照
    
        if ( any( (neeDiffuseRadiance+neeSpecularRadiance) > 0 ) ) // 如果NEE有贡献
        {
            neeDiffuseRadiance *= (lpfloat3)Bridge::getNoisyRadianceAttenuation();
            neeSpecularRadiance *= (lpfloat3)Bridge::getNoisyRadianceAttenuation();

#if PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES // 填充稳定平面模式
            // StablePlanesHandleNEE 可能会将NEE的结果与稳定平面数据结合或存储。
            StablePlanesHandleNEE(preScatterPath, path, neeDiffuseRadiance, neeSpecularRadiance, neeResult.RadianceSourceDistance, workingContext);
#else
            // 其他模式下，直接将NEE贡献累加到路径光照 L
            float3 neeContribution = neeDiffuseRadiance + neeSpecularRadiance;
            path.L += max(0.xxx, preScatterPath.thp * neeContribution); 
#endif
        }
        
        // 10. 最终路径终止判断 (基于BSDF散射结果)
        if (!scatterResult.Valid) // 如果BSDF散射无效 (例如，被纯黑材质吸收)
        {
            path.terminate(); // 终止路径
        }
    } // end of PathTracer::HandleHit
} // end of namespace PathTracer
```

**`PathTracer::HandleHit` 逻辑步骤详解：**

1.  **路径更新 (`UpdatePathTravelled`)**: 根据当前射线段的长度 `rayTCurrent` 更新路径总长度、光线锥（Ray Cone）等状态。光线锥用于纹理LOD等。
2.  **加载表面数据 (`Bridge::loadSurface`)**: 这是至关重要的一步。它负责从内存中提取与命中三角形相关的几何信息（位置、法线、UV等）和完整的材质信息（颜色、粗糙度、金属度、折射率、自发光强度等）。并根据这些信息构建一个 `ActiveBSDF` 对象，该对象封装了当前表面的光散射行为。`OptimizationHints` 在这里可能被用来决定加载哪些数据或材质的复杂度。
3.  **体积吸收**: 如果光线在介质中传播（`path.interiorList` 非空），则根据介质的吸收系数和传播距离 `rayTCurrent` 来衰减路径的吞吐量 `path.thp`。
4.  **嵌套电介质处理 (`HandleNestedDielectrics`)**: 处理光线进出透明材质（如玻璃）的复杂情况，正确管理光线在不同介质间的内外状态，并可能因“假命中”而使光线继续传播。
5.  **自发光处理**:
    * 如果命中的表面是自发光的 (`bsdfProperties.emission > 0`)，则计算其对路径总光照 `path.L` 的贡献。
    * **MIS (Multiple Importance Sampling)**: 如果启用了NEE（下一事件估计），并且这条BSDF采样路径恰好命中了光源，那么就需要进行MIS加权，以平衡BSDF采样和NEE采样光源的贡献，避免重复计算或权重不当。`misInfo` (从 `path.packedMISInfo` 解包) 包含了**上一个路径顶点**进行NEE采样时的信息，用于此处的MIS计算。
6.  **路径终止 - 最大深度/稳定平面 (`HasFinishedSurfaceBounces`, `StablePlanesHandleHit`)**:
    * 检查是否达到预设的最大弹射次数。
    * `StablePlanesHandleHit`: 在非参考模式下，此函数会介入，根据稳定平面的逻辑来处理当前命中。它可能会更新稳定平面数据，将当前的光照贡献（自发光、NEE等）存储到稳定平面，或者根据稳定平面的状态决定是否终止当前路径。
7.  **路径终止 - 俄罗斯轮盘赌 (`HandleRussianRoulette`)**: 当路径的吞吐量 `path.thp` 降低到一定程度时，为了避免浪费计算资源在贡献很小的路径上，会使用俄罗斯轮盘赌。以 `path.thp` 为概率继续追踪，如果继续，则将 `path.thp` 除以该概率（放大贡献）；否则终止路径。
8.  **BSDF 采样 (`GenerateScatterRay`)**: 如果路径未终止，则根据当前命中表面的材质BSDF（双向散射分布函数）来采样一个新的散射方向，并计算相应的颜色衰减和概率密度函数(PDF)。结果（新方向、新吞吐量、PDF）会更新到 `path` 中，为下一次 `nextHit` 做准备。
9.  **下一事件估计 (NEE - `HandleNEE`)**: 为了更有效地采样直接光照，NEE会尝试从当前命中点向场景中的光源直接投射“阴影光线”。
    * 如果阴影光线未被遮挡，则将光源的直接贡献（考虑距离衰减、BSDF在该方向的值、MIS权重等）累加到 `path.L`。
    * NEE的结果，特别是其用于MIS的PDF信息，会打包到 `path.packedMISInfo` 中，供下一 bounces 使用（如第5步所述）。
10. **最终终止**: 如果BSDF采样失败或表明光线被吸收 (`!scatterResult.Valid`)，则终止路径。

`PathTracer::HandleHit` 是整个路径追踪算法的心脏。它精确地模拟了光线与物体表面交互的复杂物理过程，包括材质加载、自发光、体积效应、直接光照采样、间接光照的BSDF散射以及各种终止条件和优化策略（如MIS、俄罗斯轮盘赌、稳定平面）。

至此，我们已经覆盖了从光线生成到命中处理的核心流程。

# 下一事件估计 (NEE) 详解 —— HandleNEE 与光源采样

在上一部分，我们了解了 `PathTracer::HandleHit` 如何处理光线与表面的交互，包括加载材质、自发光、BSDF采样等。其中一个关键步骤就是通过 `HandleNEE` 进行下一事件估计，即直接对光源进行采样。

## `HandleNEE`：NEE 的主入口与决策点

`HandleNEE` 函数是执行直接光照采样的入口。它首先判断是否应该执行NEE，然后可能会调用更核心的采样逻辑。

```hlsl
// PathTracer/PathTracerNEE.hlsli
namespace PathTracer
{
    // ... (其他函数) ...
    inline NEEResult HandleNEE(const uniform OptimizationHints optimizationHints, const PathState preScatterPath,
                            const ShadingData shadingData, const ActiveBSDF bsdf, const SampleGeneratorVertexBase sgBase, const WorkingContext workingContext)
    {
        // 1. 判断 BSDF 是否有非 Delta 分布 (例如，漫反射或光泽反射/折射)
        // Delta 分布 (理想镜面/折射) 通常由 BSDF 采样完美处理，不需要 NEE。
        const uint lobes = bsdf.getLobes(shadingData);
        const bool hasNonDeltaLobes = ((lobes & (uint) LobeType::NonDelta) != 0) && (!optimizationHints.OnlyDeltaLobes);

        // (一些性能相关的注释和标志位)
        const bool onDominantBranch = preScatterPath.hasFlag(PathFlags::stablePlaneOnDominantBranch);
        const bool onStablePlane = preScatterPath.hasFlag(PathFlags::stablePlaneOnPlane);

        // 2. 决定是否应用 NEE
        // 条件：全局启用 NEE、优化提示未要求只处理 Delta Lobes、且 BSDF 确实有非 Delta 分布
        const bool applyNEE = (workingContext.ptConsts.NEEEnabled && !optimizationHints.OnlyDeltaLobes) && hasNonDeltaLobes;

        NEEResult result = NEEResult::empty(); // 初始化 NEE 结果为空
        
        if (!applyNEE) // 如果不满足 NEE 条件，直接返回空结果
            return result;
        
        // 3. 检查是否应由 ReSTIR DI (Reservoir-based Spatiotemporal Importance Resampling for Direct Illumination) 处理直接光照
        // ReSTIR DI 是一种更高级的直接光照采样技术，如果启用并适用，可能会取代传统的 NEE。
    #if PATH_TRACER_MODE==PATH_TRACER_MODE_FILL_STABLE_PLANES
        // 在填充稳定平面模式下，如果启用了 ReSTIR DI，并且当前BSDF有非Delta分量，
        // 且位于主导稳定平面上，则应用ReSTIR DI。
        const bool applyReSTIRDI = workingContext.ptConsts.useReSTIRDI && hasNonDeltaLobes && onDominantBranch && onStablePlane;
    #else
        const bool applyReSTIRDI = false;
    #endif
        
        // 如果 ReSTIR DI 负责光照，则跳过此处的 NEE。
        // 当前 RTXDI 主要处理反射；对于首次弹射的透射，由于复杂性，仍不尝试使用NEE，
        // 也考虑到未来 ReSTIR DI 可能支持透射。
        if (applyReSTIRDI)
        {
            // 设置标志位，告知自发光处理部分不要重复计算（因为ReSTIR DI已处理）
            result.BSDFMISInfo.SkipEmissiveBRDF = true; 
            return result; // 返回，不执行后续的NEE
        }

        // 4. 调用核心的多重采样NEE处理函数
        // (onDominantBranch && onStablePlane) ? workingContext.ptConsts.NEEBoostSamplingOnDominantPlane : 0
        // 这个三元操作符为在“主导稳定平面”上的点增加了NEE的采样数量 (sampleCountBoost)
        HandleNEE_MultipleSamples(result, preScatterPath, shadingData, bsdf, sgBase, workingContext, (onDominantBranch&&onStablePlane)?(workingContext.ptConsts.NEEBoostSamplingOnDominantPlane):(0));
        
        // 5. 调试选项：抑制在主表面上的 NEE
        // 如果路径在主导稳定平面上，并且ptConsts中设置了suppressPrimaryNEE，则清零NEE贡献。
        // 这主要用于调试或效果对比，保持MIS信息有效但光照贡献为0。
        const bool suppressNEE = preScatterPath.hasFlag(PathFlags::stablePlaneOnDominantBranch) && preScatterPath.hasFlag(PathFlags::stablePlaneOnPlane) && workingContext.ptConsts.suppressPrimaryNEE;
        if (suppressNEE) 
            result.SetRadiances(0,0); // 清零漫反射和镜面反射光照贡献
        
        return result; // 返回包含直接光照贡献和MIS信息的 NEEResult
    }
}
```

**`HandleNEE` 的逻辑流程：**

1.  **适用性判断**：首先检查当前BSDF是否适合进行NEE。理想的delta分布（如完美镜面）由BSDF采样就能高效处理，NEE通常用于漫反射和光泽反射/折射表面。
2.  **全局开关与优化提示**：`workingContext.ptConsts.NEEEnabled` 控制全局是否启用NEE，`optimizationHints.OnlyDeltaLobes` 允许特定材质跳过NEE。
3.  **ReSTIR DI 优先**：如果启用了更高级的直接光照技术ReSTIR DI，并且当前情况适用（例如，在 `PATH_TRACER_MODE_FILL_STABLE_PLANES` 模式下处理稳定平面上的非Delta表面），则优先使用ReSTIR DI，并跳过此处的传统NEE。`result.BSDFMISInfo.SkipEmissiveBRDF = true;` 是一个重要的标志，它告诉后续的自发光处理逻辑，如果BSDF路径命中了自发光体，不需要进行MIS加权，因为ReSTIR DI已经处理了这部分贡献。
4.  **调用多重采样**：如果需要执行NEE，则调用 `HandleNEE_MultipleSamples`。这里可以传入一个 `sampleCountBoost` 参数，用于在特定条件下（如在“主导稳定平面”上）增加NEE的采样数量，以期获得更好的直接光照效果。
5.  **调试抑制**：提供了一个选项 `suppressPrimaryNEE`，可以在调试时关闭在某些主表面上的NEE贡献，方便分析和比较。

## `HandleNEE_MultipleSamples`：管理多个光源样本

该函数负责循环采样多个光源（或同一光源上的多个点），并将它们的贡献累加起来。

```hlsl
// PathTracer/PathTracerNEE.hlsli
// 'inoutResult' 参数期望已被初始化为 'NEEResult::empty()'
inline void HandleNEE_MultipleSamples(inout NEEResult inoutResult, const PathState preScatterPath, const ShadingData shadingData, const ActiveBSDF bsdf,    
                                      const SampleGeneratorVertexBase sgBase, const WorkingContext workingContext, int sampleCountBoost)
{
    // 1. 创建光源采样器 (LightSampler)
    // Bridge::CreateLightSampler 根据当前像素位置、光线锥展角与场景长度之比（可能影响采样策略）等创建光源采样器。
    // 光源采样器负责选择光源并生成光源上的采样点。
    LightSampler lightSampler = Bridge::CreateLightSampler( workingContext.pixelPos, preScatterPath.rayCone.getWidth() / preScatterPath.sceneLength, workingContext.debug.IsDebugPixel() );

    // 确定总采样数
    // sampleCountBoost 来自 HandleNEE，可能在主导稳定平面上增加采样。
    // workingContext.ptConsts.NEEFullSamples 是基础采样数。
    // 如果光源采样器为空 (场景中无光源)，则总采样数为0。
    const uint totalSamples = min(RTXPT_LIGHTING_NEEAT_MAX_TOTAL_SAMPLE_COUNT, (!lightSampler.IsEmpty()) ? (sampleCountBoost + workingContext.ptConsts.NEEFullSamples)     : (0));
    if (totalSamples == 0) // 如果没有样本可采，直接返回
        return;

    bool useLowDiscrepancyGen = true; // 是否使用低差异序列生成器 (如 Halton, Sobol)

    // 2. 初始化多个随机数生成器，用于NEE的不同阶段
    SampleGenerator sampleGenerator           = SampleGenerator::make( sgBase, SampleGeneratorEffectSeed::NextEventEstimation ); // 通用随机数
    // NEECandidateSamples 可能用于从多个候选光源中选择一个
    SampleGenerator sampleGeneratorLightSampler = SampleGenerator::make( sgBase, SampleGeneratorEffectSeed::NextEventEstimationLightSampler, useLowDiscrepancyGen, totalSamples * workingContext.ptConsts.NEECandidateSamples ); // 光源采样专用
    SampleGenerator sampleGeneratorFeedback = SampleGenerator::make( sgBase, SampleGeneratorEffectSeed::NextEventEstimationFeedback ); // 反馈机制专用

    // 3. 初始化光源反馈机制 (用于 NEE-AT: Next Event Estimation with Adaptive Training)
    LightFeedbackReservoir feedbackReservoir; // 存储光源反馈信息的Reservoir
    bool useFeedback = false; // 是否启用反馈
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_BUILD_STABLE_PLANES // 构建稳定平面模式下通常不使用时序反馈
    if( lightSampler.IsTemporalFeedbackRequired() ) // 如果光源采样器需要时序反馈
    {
        feedbackReservoir = lightSampler.LoadFeedback(); // 加载上一帧或之前存储的反馈信息
        useFeedback = true;
    }
#endif
    // 计算“窄域”NEE样本数，可能指针对特定区域或更重要光源的采样
    const uint narrowNEESamples      = lightSampler.ComputeNarrowSampleCount(totalSamples);

    // 4. 设置传递给下一 bounces 的 BSDFMISInfo
    // 这些信息用于在BSDF路径恰好命中光源时进行正确的MIS加权。
    inoutResult.BSDFMISInfo.LightSamplingEnabled    = true;       // 标记已执行光源采样
    inoutResult.BSDFMISInfo.LightSamplingIsIndirect = lightSampler.IsIndirect; // 标记是否为间接光路径上的NEE
    inoutResult.BSDFMISInfo.NarrowNEESamples        = narrowNEESamples; // “窄域”样本数
    inoutResult.BSDFMISInfo.TotalSamples            = totalSamples;     // 总样本数

    // 初始化累加器
    inoutResult.RadianceSourceDistance = 0; // 用于降噪器的加权平均光源距离
    float luminanceSum = 0.0;               // 用于加权平均的亮度总和
    
    int narrowNEESamplesRemaining = narrowNEESamples;
    
    // 5. 主采样循环：采集 totalSamples 个光源样本
    for (uint sampleIndex = 0; sampleIndex < totalSamples; sampleIndex++)
    {
        bool sampleIsNarrow = narrowNEESamplesRemaining > 0; // 判断当前是否为“窄域”样本
        narrowNEESamplesRemaining--;

        // 5a. 生成一个光源样本 (PathLightSample)
        // GenerateLightSample (具体实现未在此代码段中) 会调用 lightSampler 来：
        //  - 选择一个光源。
        //  - 在该光源上选择一个点。
        //  - 返回包含光源辐射亮度(Li)、到光源方向、距离、采样PDF等信息的 PathLightSample 结构。
        // workingContext.ptConsts.NEECandidateSamples 可能用于从多个候选光源中进行选择。
        PathLightSample lightSample = GenerateLightSample(workingContext, shadingData, bsdf, workingContext.ptConsts.NEECandidateSamples, sampleGeneratorLightSampler, sampleGenerator, lightSampler, sampleIsNarrow);

        // 5b. 处理这个光源样本
        // ProcessLightSample 会投射阴影光线，如果可见，则计算BSDF、MIS权重并累加贡献。
        ProcessLightSample(inoutResult, luminanceSum, lightSample, sampleIsNarrow, narrowNEESamples, totalSamples, shadingData, bsdf, preScatterPath, lightSampler, useFeedback, feedbackReservoir, sampleGeneratorFeedback, workingContext);
    }

    // 6. 存储反馈信息 (如果启用)
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_BUILD_STABLE_PLANES
    if( useFeedback )
        lightSampler.StoreFeedback( feedbackReservoir, true ); // 将更新后的反馈水塘存储起来
#endif

    // 7. 计算最终的加权平均光源距离
    FinalizeLightSample(inoutResult, luminanceSum);
}
```

**`HandleNEE_MultipleSamples` 的核心步骤：**

1.  **光源采样器 (`LightSampler`)**: 初始化一个光源采样器，它封装了选择光源和采样点于其上的逻辑。这可能是简单的均匀采样，也可能是基于重要性或自适应反馈的复杂采样。
2.  **随机数生成器**: 为不同的采样需求（光源选择、反馈等）准备独立的随机数流，有助于结果的稳定性和可复现性。
3.  **反馈机制 (NEE-AT)**: `LightFeedbackReservoir` 和相关逻辑用于实现自适应光源采样。通过收集哪些光源对成像贡献更大，并在后续采样中倾向于这些光源，从而提高采样效率。反馈数据通常具有时序性，即利用前一帧的信息。
4.  **MIS信息设置**: 在 `NEEResult` 中预先设置好用于BSDF路径的MIS信息，如总样本数、是否为间接光等。
5.  **采样循环**:
    * **`GenerateLightSample`**: 这是未在代码片段中显示的辅助函数，但其作用是调用`lightSampler`来产生一个`PathLightSample`。这个样本包含了光源的辐射亮度 `Li`、从着色点到光源上采样点的方向和距离，以及选择该光源和该点的组合PDF。`sampleIsNarrow`标志可能指示采样器使用不同的策略（例如，更集中地采样已知的重要光源）。
    * **`ProcessLightSample`**: 对每个生成的光源样本进行处理，这是下一步要详细分析的函数。
6.  **存储反馈**: 如果启用了自适应反馈，将更新后的`feedbackReservoir`存储起来，供后续帧或像素使用。
7.  **最终化**: `FinalizeLightSample` 对累积的一些量（如加权光源距离）进行归一化。

## `ProcessLightSample`：处理单个光源样本

此函数负责获取一个光源样本，投射阴影光线，如果光源可见，则计算其对当前着色点的贡献，并应用BSDF和MIS权重。

```hlsl
// PathTracer/PathTracerNEE.hlsli
// 该函数投射光线，如果光源可见，则正确累积辐射亮度，包括进行加权和。
void ProcessLightSample(inout NEEResult accum, inout float luminanceSum, PathLightSample lightSample, bool sampleIsNarrow, uint narrowNEESamples, uint totalSamples,
                        const ShadingData shadingData, const ActiveBSDF bsdf, const PathState preScatterPath, LightSampler lightSampler,
                        const bool useFeedback, inout LightFeedbackReservoir feedbackReservoir, inout SampleGenerator sampleGeneratorFeedback, const WorkingContext workingContext)
{
    if (!lightSample.Valid()) // 如果光源样本无效，则跳过
        return;

    // 1. 计算阴影光线 (Visibility Ray)
    const RayDesc ray = lightSample.ComputeVisibilityRay(shadingData).toRayDesc();
        
    // 2. 追踪阴影光线以判断可见性
    // Bridge::traceVisibilityRay 会投射这条光线，并返回光源是否可见。
    // preScatterPath.rayCone 和 preScatterPath.getVertexIndex() 可能用于优化。
    bool visible = Bridge::traceVisibilityRay(ray, preScatterPath.rayCone, preScatterPath.getVertexIndex(), workingContext.debug);

    // (调试代码：画出阴影光线，颜色表示是否可见)

    if (visible) // 只有当光源可见时，才计算其贡献
    {
        // 3. 计算掠射角衰减 (Grazing Angle Fadeout)
        // ComputeLowGrazingAngleFalloff 用于在光线与表面法线夹角过大（掠射角）时减少贡献，
        // 以避免法线贴图等造成的边缘高光或锯齿。
        float fadeOut = (shadingData.shadowNoLFadeout>0)?(ComputeLowGrazingAngleFalloff( ray.Direction, shadingData.vertexN, shadingData.shadowNoLFadeout, 2.0 * shadingData.shadowNoLFadeout )):(1.0);

        // 4. 计算多重重要性采样 (MIS) 权重
        // scatterPdfForDir: 计算使用BSDF采样得到当前光线方向(lightSample.Direction)的PDF。
        // 这是与NEE进行MIS加权的“另一个采样策略”的PDF。
        float scatterPdfForDir = bsdf.evalPdf(shadingData, lightSample.Direction, kUseBSDFSampling);
        // lightSampler.ComputeInternalMIS 使用NEE采样PDF和BSDF采样PDF来计算MIS权重 (通常是1 / (pdf_nee + pdf_bsdf) * pdf_nee 或 Balance Heuristic)。
        // sampleIsNarrow, narrowNEESamples, totalSamples 可能影响MIS权重的计算方式，
        // 例如，针对不同采样策略（窄域/全局）使用不同的PDF组合。
        float misWeight = lightSampler.ComputeInternalMIS(shadingData.posW, lightSample, sampleIsNarrow, narrowNEESamples, totalSamples, scatterPdfForDir);

        fadeOut *= misWeight; // 将MIS权重乘入衰减因子

        // 5. 计算BSDF在该方向的吞吐量 (BRDF * cos_theta)
        float3 bsdfThpDiff, bsdfThpSpec; // 漫反射和镜面反射的BSDF吞吐量
        bsdf.eval(shadingData, lightSample.Direction, bsdfThpDiff, bsdfThpSpec);

        // 6. Firefly Filter - 可选
        // 对于贡献过大且概率较低的样本（可能导致噪点/飞火），进行过滤。
#if 1 
        if( workingContext.ptConsts.fireflyFilterThreshold != 0 )
        {
            const float pdf = lightSample.SelectionPdf * lightSample.SolidAnglePdf; // NEE采样总PDF
            float neeFireflyFilterK = ComputeNewScatterFireflyFilterK(preScatterPath.fireflyFilterK, pdf, 1.0); // 计算过滤参数K
            // FireflyFilterShort 根据阈值和K值对潜在的飞火进行衰减
            fadeOut *= FireflyFilterShort(average(lightSample.Li*(bsdfThpDiff+bsdfThpSpec))*misWeight, workingContext.ptConsts.fireflyFilterThreshold, neeFireflyFilterK); // 注意这里 misWeight 已乘入 fadeOut，避免重复
        }
#endif
        
        // 7. 将衰减因子应用到光源的辐射亮度 Li 上
        lightSample.Li *= fadeOut;

        // 8. 计算最终的漫反射和镜面反射贡献
        float3 diffRadiance = bsdfThpDiff * lightSample.Li;
        float3 specRadiance = bsdfThpSpec * lightSample.Li;

        float3 combinedContribution = diffRadiance + specRadiance;
        float combinedContributionAvg = average(combinedContribution); // 平均贡献亮度

        // 9. 累加光照贡献到 NEEResult
        lpfloat3 neeDiffuseRadiance, neeSpecularRadiance;
        accum.GetRadiances(neeDiffuseRadiance, neeSpecularRadiance);
        neeDiffuseRadiance = lpfloat3( min(neeDiffuseRadiance + diffRadiance, HLF_MAX.xxx ) ); // 使用低精度浮点累加
        neeSpecularRadiance = lpfloat3( min(neeSpecularRadiance + specRadiance, HLF_MAX.xxx ) );
        accum.SetRadiances(neeDiffuseRadiance, neeSpecularRadiance);

        // 10. 累加加权光源距离 (用于降噪器)
        // RadianceSourceDistance 是一个按光照贡献加权的平均距离
        accum.RadianceSourceDistance = lpfloat( min( accum.RadianceSourceDistance + lightSample.Distance * combinedContributionAvg, HLF_MAX ) );
        luminanceSum += combinedContributionAvg; // 累加总贡献亮度，用于后续归一化
        
        // 11. 光源采样反馈 (NEE-AT)
        if( useFeedback && lightSample.LightIndex != 0xFFFFFFFF ) // 如果启用反馈且光源索引有效
        {
            // 计算反馈权重：考虑路径吞吐量和当前样本的贡献
            float feedbackWeight = average(preScatterPath.thp) * combinedContributionAvg;

            // (注释掉的代码：根据光源被全局采样器采样的PDF来调整反馈权重，但效果不确定，默认禁用)
            // feedbackWeight /= sqrt(lightSampler.SampleGlobalPDF(lightSample.LightIndex));

            // 将反馈信息（光源索引、权重、随机数）插入到反馈水塘中
            lightSampler.InsertFeedbackFromNEE(feedbackReservoir, lightSample.LightIndex, feedbackWeight, sampleNext1D(sampleGeneratorFeedback) );
        }
    }
}
```

**`ProcessLightSample` 的核心功能：**

1.  **可见性测试**: 构造并追踪一条从当前着色点到光源采样点的阴影光线 (`Bridge::traceVisibilityRay`)。
2.  **掠射角衰减**: 对接近掠射角度的光线进行衰减，以减少视觉瑕疵。
3.  **MIS权重计算**: 这是NEE的核心之一。为了正确地结合NEE和BSDF采样，需要计算MIS权重。`bsdf.evalPdf` 计算了如果通过BSDF采样得到当前光线方向的PDF，然后 `lightSampler.ComputeInternalMIS` 结合NEE本身的采样PDF（封装在 `lightSample` 中）和这个BSDF PDF来计算MIS权重（通常使用Balance Heuristic或Power Heuristic）。
4.  **BSDF求值**: `bsdf.eval` 计算当前表面材质在光源方向上的BSDF值（区分漫反射和镜面反射部分），并乘以cosine项。
5.  **飞火过滤**: 对可能产生高亮噪点（飞火）的样本进行额外的衰减。
6.  **贡献累加**: 将经过MIS加权、BSDF调制和各种衰减后的光源辐射亮度 `lightSample.Li` 分别乘以漫反射和镜面反射BSDF吞吐量，得到最终的光照贡献，并累加到 `NEEResult accum` 中。
7.  **加权距离**: 计算一个按光照贡献加权的平均光源距离，这个信息可能被后续的降噪器使用。
8.  **反馈 (NEE-AT)**: 如果启用了自适应反馈，将当前光源样本的贡献信息（光源索引、贡献大小等）通过 `lightSampler.InsertFeedbackFromNEE` 记录到 `feedbackReservoir` 中。这使得 `LightSampler` 能够“学习”哪些光源在特定情况下更重要。

## `FinalizeLightSample`：最终处理

这是一个非常简短的函数，用于在所有光源样本处理完毕后进行归一化。

```hlsl
// PathTracer/PathTracerNEE.hlsli
void FinalizeLightSample( inout NEEResult accum, const float luminanceSum )
{
    // 将累积的加权光源距离除以总贡献亮度，得到最终的平均光源距离。
    // luminanceSum + 1e-30 是为了防止除以零。
    accum.RadianceSourceDistance = lpfloat( min( accum.RadianceSourceDistance / (luminanceSum + 1e-30), HLF_MAX ) );
}
```
它将累积的（贡献亮度 \* 距离）之和除以总贡献亮度，得到一个加权平均的光源距离。

**总结**

RTXPT中的NEE实现是一个相当完善的系统：

* 它支持对多个光源样本进行采样 (`HandleNEE_MultipleSamples`)。
* 通过 `LightSampler` 抽象了光源选择和采样点生成的逻辑，允许实现不同的采样策略。
* 正确地实现了多重重要性采样 (MIS)，以结合NEE和BSDF采样。
* 包含了如掠射角衰减和飞火过滤等用于提高渲染质量的技巧。
* 集成了一套自适应光源采样反馈机制 (NEE-AT)，通过 `LightFeedbackReservoir` 在时序上学习光源的重要性，以优化采样效率。
* 为降噪器准备了加权平均光源距离等辅助信息。

理解这套NEE的实现，对于掌握现代路径追踪器如何高效处理直接光照至关重要。

# 多重重要性采样 (MIS) 权重详解

在之前的讨论中，我们看到 Next Event Estimation (NEE) 和 BSDF 采样是路径追踪中产生光线路径的两种主要方式。当一个NEE样本（直接采样光源）或者一个BSDF样本（材质表面散射）最终“殊途同归”（例如，NEE采样了某个光源，而BSDF采样也恰好散射到了同一个光源），MIS就变得至关重要，以避免重复计算光照贡献或产生过高方差。

这些函数的核心是使用 `EvalMIS` 函数（它会实现某种MIS启发式，如平衡启发式Balance Heuristic）来计算权重。平衡启发式的基本形式对于技术 $i$ 的权重是 $w_i = \frac{n_i p_i}{\sum_j n_j p_j}$，其中 $n_j$ 是技术 $j$ 的样本数，$p_j$ 是技术 $j$ 产生该特定样本的概率密度函数 (PDF)。

## `ComputeInternalMIS`：为NEE样本计算MIS权重

此函数计算当通过NEE（光源显式采样）得到一个光源样本 `lightSample` 时，这个样本应有的MIS权重。它考虑了以下采样策略：
1.  **当前NEE策略**（可能是“窄域(Narrow)”或“全局(Global)”采样）。
2.  **另一种NEE策略**（如果当前是窄域，则另一种是全局；反之亦然）。
3.  **BSDF采样策略**（即通过材质表面散射恰好采样到这个光源方向的策略）。

```hlsl
// PathTracer/Lighting/LightSampler.hlsli
float ComputeInternalMIS(const float3 surfacePosW, const PathTracer::PathLightSample lightSample, bool isNarrow, const uint narrowSamples, const uint totalSamples, float bsdfPdf)
{
    float thisCount;  // 当前NEE策略的样本数
    float otherCount; // 另一种NEE策略的样本数
    float thisPdf = lightSample.SelectionPdf; // 当前NEE策略选择此光源的PDF
    float otherPdf;   // 另一种NEE策略选择此光源的PDF

    // 根据当前NEE样本是“窄域”还是“全局”来设置样本数和对应PDF
    [branch]if ( isNarrow ) // 如果当前是窄域NEE样本
    {
        thisCount  = narrowSamples;
        otherCount = totalSamples - narrowSamples; // 全局样本数
        // 获取用“全局”策略采样到这个特定光源的PDF
        otherPdf   = SampleGlobalPDF(lightSample.LightIndex); 
    }
    else // 如果当前是全局NEE样本
    {
        thisCount  = totalSamples - narrowSamples; // 全局样本数
        otherCount = narrowSamples;
        [branch]if( narrowSamples != 0 )
            // 获取用“窄域”策略采样到这个特定光源的PDF
            otherPdf   = SampleNarrowPDF(lightSample.LightIndex);
        else
            otherPdf   = 0;
    }

    // 光源表面点采样PDF（已转换为立体角PDF）。
    // 对于同一个光源上的同一点，无论是窄域还是全局策略选中它，这个立体角PDF都一样。
    float solidAnglePdf = lightSample.SolidAnglePdf; 
    // 裁剪bsdfPdf，主要为了数值稳定性，特别是与其他地方可能用fp16打包的情况匹配。
    bsdfPdf = clamp(bsdfPdf, 0, HLF_MAX); 

    // 调试宏，可以强制覆盖PDF值
#if defined(RTXPT_NEEAT_MIS_OVERRIDE_BSDF_PDF)
    bsdfPdf = RTXPT_NEEAT_MIS_OVERRIDE_BSDF_PDF;
#endif
#if defined(RTXPT_NEEAT_MIS_OVERRIDE_SOLID_ANGLE_PDF)
    solidAnglePdf = RTXPT_NEEAT_MIS_OVERRIDE_SOLID_ANGLE_PDF;
#endif

    // LightSamplingMISBoost() 是一个调整因子，可以用来提升或降低光源采样在MIS中的相对权重。
    solidAnglePdf *= LightSamplingMISBoost(); 

    // 调用EvalMIS计算MIS权重。RTXPT_NEE_MIS_HEURISTIC 很可能指向平衡启发式。
    // EvalMIS的参数大致对应 (启发式, n1, p1, n2, p2, n3, p3, ...)，其中pi是完整PDF。
    // 技巧1: 当前NEE策略 (thisCount, thisPdf * solidAnglePdf)
    // 技巧2: 另一种NEE策略 (otherCount, otherPdf * solidAnglePdf)
    // 技巧3: BSDF采样 (1个样本, bsdfPdf)。仅当 lightSample.LightSampleableByBSDF 为真时才考虑BSDF PDF。
    float thisMIS = EvalMIS(RTXPT_NEE_MIS_HEURISTIC, 
                            thisCount, thisPdf*solidAnglePdf, 
                            otherCount, otherPdf*solidAnglePdf, 
                            1, lightSample.LightSampleableByBSDF ? bsdfPdf : 0); 

    // (solidAnglePdf 验证的调试代码块)
    // ...

    // TODO: 注释指出 "/ thisCount" 严格来说不是MIS的一部分。
    // 这表明返回的是一个平均化的MIS权重，或者说，是已将1/N项部分折叠进去的权重。
    return thisMIS / thisCount; 
}
```

**解析 `ComputeInternalMIS`:**

* **区分窄域/全局NEE**：NEE本身可能包含两种策略：
    * `isNarrow = true`：表示当前样本来自“窄域”采样（例如，针对场景中一小部分更重要的光源，或者使用更集中的PDF）。`thisCount` 为 `narrowSamples`，`thisPdf` 为窄域选择此光源的PDF。相对的“另一种”策略是全局采样，其PDF为 `SampleGlobalPDF(lightSample.LightIndex)`。
    * `isNarrow = false`：表示当前样本来自“全局”采样。`thisCount` 为全局样本数，`thisPdf` 为全局选择此光源的PDF。相对的“另一种”策略是窄域采样，其PDF为 `SampleNarrowPDF(lightSample.LightIndex)`。
* **组合PDF**：
    * 对于NEE策略，完整的采样PDF是 `SelectionPdf * SolidAnglePdf`。`SelectionPdf` 是选择特定光源的概率，`SolidAnglePdf` 是在选定光源上采样到特定点（从而产生特定出射方向）的概率密度（以立体角衡量）。
    * 对于BSDF策略，`bsdfPdf` 是材质表面散射到该方向的概率密度。
* **`LightSamplingMISBoost()`**：这是一个调整因子，可以用来在MIS计算中增加或减少光源采样策略的整体权重，用于微调不同策略间的平衡。
* **`EvalMIS` 调用**：
    * 它比较了三种策略的加权PDF：
        1.  **当前NEE策略**：样本数为 `thisCount`，PDF为 `thisPdf * solidAnglePdf`。
        2.  **另一种NEE策略**：样本数为 `otherCount`，PDF为 `otherPdf * solidAnglePdf`。
        3.  **BSDF采样策略**：样本数视为1（因为我们是在评估单个BSDF方向），PDF为 `bsdfPdf`。`lightSample.LightSampleableByBSDF` 标志控制是否将BSDF采样纳入此特定光源的MIS计算（例如，某些类型的光源可能无法通过BSDF采样击中）。
* **返回值 `thisMIS / thisCount`**：这里的 `thisMIS` 是由 `EvalMIS` 计算得到的分子项（即 `thisCount * thisPdf_full`）。这是一种将蒙特卡洛估计器的 $1/N$ 项部分融入权重计算的方式。

## `ComputeBSDFMIS`：为BSDF命中光源的样本计算MIS权重

此函数用于当BSDF采样（材质表面散射）恰好命中了某个光源时，计算该BSDF样本的MIS权重。它需要与两种NEE策略（窄域和全局）进行比较。

```hlsl
// PathTracer/Lighting/LightSampler.hlsli
float ComputeBSDFMIS(const uint lightIndex, lpfloat bsdfPdf, float solidAnglePdf, const uint narrowSamples, const uint totalSamples)
{
    const uint globalSamples = totalSamples - narrowSamples; // 全局NEE样本数

    // 获取窄域和全局NEE策略采样到这个特定光源(lightIndex)的“选择光源”PDF
    float globPdf = SampleGlobalPDF(lightIndex);
    float narrPdf = SampleNarrowPDF(lightIndex);

    // 调试宏，可以强制覆盖PDF值
#if defined(RTXPT_NEEAT_MIS_OVERRIDE_BSDF_PDF)
    bsdfPdf = RTXPT_NEEAT_MIS_OVERRIDE_BSDF_PDF;
#endif
#if defined(RTXPT_NEEAT_MIS_OVERRIDE_SOLID_ANGLE_PDF)
    solidAnglePdf = RTXPT_NEEAT_MIS_OVERRIDE_SOLID_ANGLE_PDF;
#endif

    solidAnglePdf *= LightSamplingMISBoost(); // 应用同样的MIS调整因子

    // 调用EvalMIS计算MIS权重
    // 技巧1: BSDF采样 (1个样本, bsdfPdf)
    // 技巧2: 全局NEE策略 (globalSamples, globPdf * solidAnglePdf)
    // 技巧3: 窄域NEE策略 (narrowSamples, narrPdf * solidAnglePdf)
    return EvalMIS(RTXPT_NEE_MIS_HEURISTIC, 
                   1, bsdfPdf, 
                   globalSamples, globPdf*solidAnglePdf, 
                   narrowSamples, narrPdf*solidAnglePdf); 
}
```

**解析 `ComputeBSDFMIS`:**

* **输入参数**：
    * `lightIndex`：被BSDF命中的光源索引。
    * `bsdfPdf`：产生这个命中方向的BSDF采样PDF。
    * `solidAnglePdf`：光源在该方向发射光线的立体角PDF（即，如果NEE采样这个光源，得到这个方向的 `SolidAnglePdf` 部分）。
    * `narrowSamples`, `totalSamples`：NEE策略的样本数。
* **NEE策略PDFs**：获取通过全局NEE (`SampleGlobalPDF`) 和窄域NEE (`SampleNarrowPDF`) 采样到 `lightIndex` 这个特定光源的“选择光源”PDF。
* **`EvalMIS` 调用**：
    * 比较三种策略的加权PDF：
        1.  **BSDF采样**：样本数1，PDF为 `bsdfPdf`。
        2.  **全局NEE策略**：样本数为 `globalSamples`，PDF为 `globPdf * solidAnglePdf`。
        3.  **窄域NEE策略**：样本数为 `narrowSamples`，PDF为 `narrPdf * solidAnglePdf`。
* **返回值**：返回的是标准的MIS权重，没有像 `ComputeInternalMIS` 那样除以样本数。

## `ComputeBSDFMISForEmissiveTriangle`：针对命中三角形光源的BSDF样本

这是一个特化版本，用于BSDF样本命中了三角形光源的情况。

```hlsl
// PathTracer/Lighting/LightSampler.hlsli
float ComputeBSDFMISForEmissiveTriangle(const uint emissiveTriangleLightIndex, lpfloat bsdfPdf, const float3 viewerPosition, const float3 lightSamplePosition, const uint narrowSamples, const uint totalSamples)
{
    // 如果bsdfPdf为0，通常表示Delta分布（如完美镜面）。
    // 这种情况下，NEE几乎不可能采样到这个精确路径，BSDF采样是唯一途径，所以MIS权重为1。
    if( bsdfPdf == 0 ) 
        return 1;

    // 加载三角形光源信息
    PolymorphicLightInfoFull lightInfo = LoadLight(emissiveTriangleLightIndex);
    TriangleLight triangleLight = TriangleLight::Create(lightInfo);

    // 计算光源在该方向发射的立体角PDF
    // viewerPosition是当前着色点，lightSamplePosition是光源上被命中的点。
    float solidAnglePdf = triangleLight.CalcSolidAnglePdfForMIS(viewerPosition, lightSamplePosition);
    
    // 调用通用的ComputeBSDFMIS函数
    return ComputeBSDFMIS(emissiveTriangleLightIndex, bsdfPdf, solidAnglePdf, narrowSamples, totalSamples);
}
```

**解析 `ComputeBSDFMISForEmissiveTriangle`:**

* **Delta BSDF 特判**：如果 `bsdfPdf` 为0（通常意味着纯粹的镜面反射/折射），则认为只有BSDF采样能产生这个路径，NEE贡献为0，所以BSDF的MIS权重为1。
* **计算 `solidAnglePdf`**：关键在于调用 `triangleLight.CalcSolidAnglePdfForMIS(...)`。这个函数计算从 `viewerPosition` 看向三角形光源上的 `lightSamplePosition` 点时，该光源在该方向发射的概率密度（以立体角衡量）。这个PDF是光源本身的固有属性，对于MIS至关重要。
* **调用通用函数**：计算出特定于三角形光源的 `solidAnglePdf`后，将其连同其他参数传递给 `ComputeBSDFMIS` 进行最终的权重计算。

## `ComputeBSDFMISForEnvironmentQuad`：针对命中环境四边形光源的BSDF样本

与三角形光源类似，这是为命中环境四边形光源的BSDF样本设计的。

```hlsl
// PathTracer/Lighting/LightSampler.hlsli
float ComputeBSDFMISForEnvironmentQuad(const uint environmentQuadLightIndex, lpfloat bsdfPdf, const uint narrowSamples, const uint totalSamples)
{
#if POLYLIGHT_QT_ENV_ENABLE // 仅当启用环境四边形光源时编译
    if( bsdfPdf == 0 ) 
        return 1;

    PolymorphicLightInfoFull lightInfo = LoadLight(environmentQuadLightIndex);
    EnvironmentQuadLight eqLight = EnvironmentQuadLight::Create(lightInfo);
    // 计算环境四边形光源的立体角PDF。参数(0,0)可能表示其PDF不依赖于具体观察点和光源点，
    // 或者是这些信息已封装在eqLight对象中，或这是一个简化的计算。
    float solidAnglePdf = eqLight.CalcSolidAnglePdfForMIS(0, 0); 
    return ComputeBSDFMIS(environmentQuadLightIndex, bsdfPdf, solidAnglePdf, narrowSamples, totalSamples);
#else
    return 1.0; // 如果未启用，则返回1
#endif
}
```

**解析 `ComputeBSDFMISForEnvironmentQuad`:**

* **编译开关**：整个函数的功能取决于 `POLYLIGHT_QT_ENV_ENABLE` 是否定义。
* **Delta BSDF 特判**：同上。
* **计算 `solidAnglePdf`**：调用 `eqLight.CalcSolidAnglePdfForMIS(0,0)`。传递 `(0,0)` 作为参数可能意味着环境光（尤其是当它代表“远在天边”的光源时）的发射PDF在所有方向上是均匀的，或者其方向性变化已经通过纹理等方式编码，此处的 `solidAnglePdf` 是一个基础值或平均值。
* **调用通用函数**：同上。

**总结**

这些MIS函数共同协作，确保了当不同的采样技术（BSDF与NEE，以及NEE内部的不同策略）可能采样到相同的光路时，它们的贡献能够被合理地加权。

* `ComputeInternalMIS` 处理NEE样本，并引入了一个特殊的 `thisMIS / thisCount` 返回值，暗示其结果是用于一种特定累加方式的“平均化”权重。
* `ComputeBSDFMIS` 是一个更通用的函数，为BSDF命中的光源计算标准的MIS权重。
* 针对特定光源类型（三角形、环境四边形）的函数（`ComputeBSDFMISForEmissiveTriangle` 和 `ComputeBSDFMISForEnvironmentQuad`）主要负责计算该光源类型特有的 `solidAnglePdf`，然后复用 `ComputeBSDFMIS` 的逻辑。
* `LightSamplingMISBoost()` 的存在表明系统允许对NEE与BSDF在MIS中的相对重要性进行调整。
* 对“窄域(Narrow)”和“全局(Global)”NEE采样的区分处理，使得MIS计算能够适应更复杂的、分层的NEE策略。

理解这些MIS权重的计算是深入分析路径追踪器方差控制和收敛行为的关键。

# 从细节到整体

## `HandleHit` 函数的行为分析

### 当光线打到不发光的三角形时，`HandleHit` 会做什么

1.  **加载表面数据 (`Bridge::loadSurface`)**:
    * 获取三角形的几何信息（位置、法线、UV等）。
    * 获取材质属性。因为是不发光三角形，所以其自发光属性（`bsdfProperties.emission`）将为零或非常接近零。其他属性如反照率、粗糙度、折射率等会被加载。
    * 构建 `ActiveBSDF` 对象，用于后续的BSDF计算。

2.  **体积和嵌套电介质处理**:
    * 如果光线在体积内传播，会计算并应用体积吸收/散射 (`UpdatePathThroughput`)。
    * 如果涉及透明材质和嵌套表面，`HandleNestedDielectrics` 会处理，可能导致“假命中”被拒绝。

3.  **自发光处理**:
    * 由于 `bsdfProperties.emission` 为零，计算出的 `surfaceEmission` 也将为零。
    * 因此，**该表面本身不会对路径光照 `path.L` 产生直接的自发光贡献**。

4.  **路径终止检查 (第一轮)**:
    * 检查是否达到最大弹射深度 (`HasFinishedSurfaceBounces`)。
    * `StablePlanesHandleHit` 会介入（如果不是参考模式），可能会根据稳定平面逻辑更新路径或标记路径终止。

5.  **俄罗斯轮盘赌**:
    * 如果路径未终止，`HandleRussianRoulette` 会根据路径吞吐量 `path.thp` 决定是否继续。

6.  **下一事件估计 (NEE - 通过 `HandleNEE` 调用)**:
    * **这是关键一步**。即使当前表面不发光，NEE依然会执行。
    * 它会尝试从当前着色点向场景中的**其他已知光源**投射阴影光线。
    * 如果阴影光线未被遮挡，会计算这些光源对当前点的直接光照贡献（经过BSDF调制和MIS加权）。
    * 这部分直接光照贡献会累加到 `path.L`。

7.  **BSDF采样 (`GenerateScatterRay`)**:
    * 如果路径仍然有效且未在之前的步骤（如稳定平面或构建模式特定逻辑）中提前返回，则会根据当前不发光材质的BSDF（例如漫反射、镜面反射、折射等）采样一个新的散射方向。
    * `path.origin`, `path.dir`, `path.thp` 会被更新，为下一次弹射做准备。
    * 如果BSDF采样失败（例如，被纯黑材质吸收），路径可能会终止。

**总结 (不发光三角形)**: `HandleHit` 会加载其材质属性，**不添加自发光贡献**。但它会通过 **NEE 计算来自场景中其他光源的直接光照**，并累加到路径中。然后，它会根据该表面的BSDF**产生一条散射光线**，让路径继续传播（除非因达到最大深度、俄罗斯轮盘赌或无效散射而终止）。

### 当光线打到发光的三角形时，`HandleHit` 会做什么

1.  **加载表面数据 (`Bridge::loadSurface`)**:
    * 同上，但这次 `bsdfProperties.emission` 会是一个大于零的值。

2.  **体积和嵌套电介质处理**: 同上。

3.  **自发光处理**:
    * **这是关键区别**。由于 `bsdfProperties.emission > 0`：
        * 会计算 `surfaceEmission = bsdfProperties.emission * misWeight`。
        * 这里的 `misWeight` 是通过 `ComputeBSDFMISForEmissiveTriangle` 计算得到的。它用于平衡“BSDF采样恰好命中此发光面”与“在上一路径顶点通过NEE采样到此发光面”这两种策略。
        * 这个经过MIS加权的 `surfaceEmission` 会乘以当前路径吞吐量 `path.thp` 并累加到 `path.L`。
        * **所以，该发光表面本身的辐射能量被计入路径。**

4.  **路径终止检查 (第一轮)**: 同上。如果设定了“命中光源即终止路径”的逻辑，这里可能会终止。

5.  **俄罗斯轮盘赌**: 同上。

6.  **下一事件估计 (NEE - 通过 `HandleNEE` 调用)**:
    * NEE **依然会执行**。它会尝试从当前着色点（即这个发光三角形表面上的点）向场景中的**其他光源**（甚至可能包括这个发光三角形自身，MIS应能处理这种情况）投射阴影光线。
    * 来自这些光源的直接光照贡献（MIS加权后）会累加到 `path.L`。

7.  **BSDF采样 (`GenerateScatterRay`)**:
    * 发光表面也可能有其自身的BSDF（例如，一个磨砂灯泡表面既发光也漫反射）。
    * `GenerateScatterRay` 仍然会尝试根据其BSDF（非自发光部分）采样一个新的散射方向。如果材质是纯粹的自发光体并且不散射任何入射光，则BSDF采样可能会导致路径终止或产生零吞吐量的散射。

**总结 (发光三角形)**: `HandleHit` 会加载其材质和自发光属性。它会**计算并累加该发光表面本身的辐射贡献**（经过MIS加权，以正确处理与NEE的组合）。同时，它也**会通过NEE计算来自场景中其他光源的直接光照**。并且，它还会尝试根据该表面的（非自发光）BSDF**产生散射光线**。

## NEE又做了什么呢

在`HandleHit`的上下文中，NEE（通过`HandleNEE`及其辅助函数实现）的核心作用是**在当前光线与表面交互点（无论是发光还是不发光表面），主动地、显式地向场景中的已知光源投射光线，以计算这些光源对该点的直接光照贡献。**

具体步骤如下（在`HandleNEE_MultipleSamples` 和 `ProcessLightSample`中）：
1.  **选择光源**: `LightSampler`根据一定策略（可能包括窄域/全局、自适应反馈等）选择一个或多个光源进行采样。
2.  **在光源上采样点**: 在选定的光源表面（或体积内）选择一个具体的点。
3.  **构造阴影光线**: 从当前着色点向光源上的采样点构造一条“阴影光线”或“可见性光线”。
4.  **可见性测试**: 追踪这条阴影光线 (`Bridge::traceVisibilityRay`)，判断它是否被场景中的其他物体遮挡。
5.  **如果可见**:
    * 获取光源在该方向的辐射亮度 `Li`。
    * 评估当前着色点表面的BSDF在阴影光线方向上的值 ( $f_r \cdot \cos\theta_i$ )。
    * 计算NEE采样本身的PDF ($p_{NEE}$)。
    * 计算BSDF采样得到该方向的PDF ($p_{BSDF}$)。
    * 使用这些PDF和相应的样本数，通过 `ComputeInternalMIS` 计算此NEE样本的MIS权重 ($w_{NEE}$)。
    * 最终贡献大致为：$ L_D = \text{Li} \cdot \text{BSDF\_value} \cdot \text{Visibility} \cdot w_{NEE} / p_{NEE} $ (这里的 $1/p_{NEE}$ 通常已经包含在 `Li` 或 `lightSample` 的值中，而 $w_{NEE}$ 在RTXPT中可能如我们之前讨论的包含了 $1/N$ 因子)。
    * 将此贡献累加到 `path.L`。
6.  **重复**: 如果配置了多次NEE采样，则重复以上步骤。

NEE通过这种方式，确保了即使BSDF采样很难“偶然”碰到光源（特别是小光源或远距离光源），直接光照也能被有效地采样，从而显著降低渲染图像中直接光照部分的噪声，并加速收敛。

## NEE的BSDF和光源采样的MIS weight有什么特殊的处理吗

1.  **`ComputeInternalMIS` 的返回值**:
    * 如我们之前深入讨论的，`ComputeInternalMIS`（用于NEE样本的MIS权重计算）返回的是 `thisMIS / thisCount`。这里的 `thisMIS` 是 `EvalMIS` 计算得到的分子项或完整权重（取决于 `EvalMIS` 的具体实现），而 `thisCount` 是当前NEE策略（窄域或全局）的样本数。
    * **特殊之处**: 标准的MIS权重本身不包含 $1/N$ 这个因子。这里的处理意味着，每个NEE样本的贡献在 `ProcessLightSample` 中计算时，其权重已经部分地为最终的蒙特卡洛估计器的 $1/N$ 求和形式做了适配。这意味着 `HandleNEE_MultipleSamples` 中对这些贡献的简单求和可能对应着一种特定形式的组合估计量。代码注释也指出了 `"/ thisCount" isn't technically part of MIS!!`。

2.  **区分NEE内部策略 (Narrow vs. Global)**:
    * MIS计算明确区分了NEE可能存在的“窄域(Narrow)”和“全局(Global)”两种采样策略。
    * `ComputeInternalMIS` 在计算一个窄域样本的权重时，会将其与全局NEE策略以及BSDF策略进行平衡。计算一个全局样本的权重时，则与窄域NEE策略和BSDF策略平衡。
    * `ComputeBSDFMIS` 在计算一个BSDF命中光源的权重时，会同时与窄域NEE和全局NEE策略进行平衡。
    * 这要求 `SampleNarrowPDF()` 和 `SampleGlobalPDF()` 提供选择特定光源的正确PDF，并且样本数 `narrowSamples` 和 `globalSamples` (`totalSamples - narrowSamples`) 被正确使用。

3.  **`LightSamplingMISBoost()`**:
    * 这是一个应用于光源立体角PDF (`solidAnglePdf`) 的调整因子。
    * 它允许开发者对NEE策略的“有效PDF”进行微调，从而在MIS平衡中或多或少地偏向NEE策略或BSDF策略。这是一种经验性的调整，可能用于处理特定场景或光照条件下的疑难杂症，或者根据某些启发式来优化收敛。

4.  **`lightSample.LightSampleableByBSDF` 标志**:
    * 在 `ComputeInternalMIS` 中，BSDF的PDF仅在 `lightSample.LightSampleableByBSDF` 为真时才被包含在MIS分母中。
    * 这允许某些类型的光源（例如，无真实表面的点光源，或用户定义的某些特殊光源）被排除在“可被BSDF采样命中”的范畴之外，从而在对这些光源进行NEE采样时，其MIS权重不会考虑BSDF采样的可能性。

5.  **BSDF PDF为零时的特殊处理**:
    * 在 `ComputeBSDFMISForEmissiveTriangle` 和 `ComputeBSDFMISForEnvironmentQuad` 中，如果传入的 `bsdfPdf` 为0（通常意味着BSDF是Delta分布，如理想镜面或玻璃），则直接返回MIS权重1。
    * 理由是：如果BSDF是Delta分布，它会以100%的概率将光线散射到一个确定的方向。如果这个方向恰好命中了光源，那么NEE策略（通常不针对精确的Delta方向进行采样）几乎不可能独立地产生完全相同的路径。因此，BSDF采样被认为是100%负责这条路径，其MIS权重为1。

这些特殊处理反映了在复杂渲染器中实现MIS时需要考虑的细微之处和优化技巧，旨在提高鲁棒性、性能和最终图像质量。

## 为什么这样是正确的

“正确性”在路径追踪中通常指**无偏性**（随着样本数量增加，结果收敛到物理精确解）和**有效性**（在有限样本下能有效降低方差，更快收敛）。

1.  **无偏性的基础**:
    * 路径追踪本身是求解渲染方程的一种无偏蒙特卡洛方法。
    * 只要每个单独的采样技术（BSDF采样、NEE采样）都是无偏的（即其贡献的期望值等于要求解的真实值），并且它们的PDF被正确使用，那么基础是稳固的。
        * BSDF采样贡献形式为 $L_i \cdot \frac{f_r \cdot \cos\theta}{p_{BSDF}}$。
        * NEE采样贡献形式为 $L_e \cdot \frac{f_r \cdot \cos\theta \cdot G \cdot V}{p_{NEE}}$。

2.  **MIS的正确性 (基于平衡启发式)**:
    * 当你用多种技术采样同一个积分量时（例如直接光照可以由NEE采样，也可以由BSDF采样间接命中光源得到），直接将它们的贡献相加会导致重复计算和偏差。
    * 多重重要性采样（MIS），特别是平衡启发式 ($w_k(X) = \frac{n_k p_k(X)}{\sum_j n_j p_j(X)}$)，提供了一种组合这些技术的方式，使得最终的组合估计量仍然是**无偏的**，并且其方差通常**低于或等于**所有单个技术中最优者的方差。
    * **关键在于**：对于任何一个特定的采样结果（例如，一条从点x到达光源L的特定光路），所有可能产生该结果的采样技术的加权PDF之和（或者说，MIS权重之和，如果每个权重对应一个技术产生了该样本）必须为1。即，$\sum_k w_k(X) = 1$ (当我们将 $w_k(X)$ 定义为当技术k产生样本X时的权重时)。
    * RTXPT中的 `EvalMIS` 函数（假设它实现了平衡启发式）正是基于这个原理。只要提供给它的所有技术的样本数($n_k$)和PDF($p_k$)是准确的，它计算出的权重就能保证组合估计的无偏性。

3.  **对RTXPT中特定实现的考量**:
    * **PDF的准确性**: 整个MIS系统的正确性高度依赖于 `lightSample.SelectionPdf`, `lightSample.SolidAnglePdf`, `bsdfPdf`, `SampleGlobalPDF()`, `SampleNarrowPDF()` 这些函数返回的PDF值的准确性。它们必须精确反映对应采样过程的真实概率密度。
    * **样本数的正确使用**: `narrowSamples`, `totalSamples - narrowSamples`, 以及BSDF的隐式样本数1，必须正确地代表各个策略的相对采样投入。
    * **`ComputeInternalMIS` 的 `thisMIS / thisCount`**:
        * 这是最需要仔细推敲其“正确性”的地方。如果 `EvalMIS` 返回的是标准的MIS权重 $w_k = \frac{N_k p_k}{\sum_j N_j p_j}$，那么 `ComputeInternalMIS` 返回的是 $w_k / N_k$。
        * 这意味着在 `ProcessLightSample` 中，每个NEE样本的贡献被计算为 $\text{Value} \cdot (w_k / N_k)$。
        * 当 `HandleNEE_MultipleSamples` 将这些单个样本的贡献（它们已经携带了 $1/N_k$ 因子）直接相加时，它得到的总和是 $\sum_{k \in \text{NEE strategies}} \sum_{i=1}^{N_k} \frac{\text{Value}_{k,i}}{p_{k,i}} \frac{w_{k,i}}{N_k}$。
        * 这可以被看作是**多个独立估计量之和**：$\sum_{k} (\frac{1}{N_k} \sum_{i=1}^{N_k} \frac{\text{Value}_{k,i}}{p_{k,i}} w_{k,i})$，其中 $w_{k,i}$ 是标准MIS权重。如果每个 $ (\frac{1}{N_k} \sum \dots ) $ 都是对同一积分量的无偏估计，那么将它们相加通常不是标准做法（除非它们估计的是积分的不同部分）。
        * **然而，这可能是为了与某种特定的NEE多策略组合或自适应方案的数学推导保持一致。** 例如，如果“窄域”和“全局”NEE策略被视为对不同“重要性区域”的探测，并且最终的NEE贡献是这些探测结果的某种形式的合并，那么这种加权和累加方式可能是特定于该合并方案的。其“正确性”将取决于整个NEE估计量的完整数学形式。对于外部观察者，这确实是一个值得标记为“高级/特定实现细节”的点。
    * **条件性包含PDF (`lightSample.LightSampleableByBSDF`, `bsdfPdf == 0`)**: 这些判断是正确的，因为它们确保了MIS只在真正存在多种竞争采样策略的情况下应用。如果一种策略实际上不可能产生某个样本，那么它不应该参与该样本的MIS权重计算。

**结论性的思考**:
这些MIS实现展现了现代路径追踪器所需考虑的复杂性和细致性。虽然某些部分（如 `ComputeInternalMIS` 的最终除法）可能看起来与教材中的标准MIS表述略有不同，但这通常是为了适应更高级的采样方案、性能优化或特定的估计量组合。其核心正确性依赖于：
1.  每个基础采样技术的无偏性。
2.  所有相关PDF的准确计算。
3.  MIS组合（如平衡启发式）的正确应用，以确保最终组合估计量的无偏性。

只要这些要素得到保证，即使形式上有所调整，系统也能收敛到正确的结果，并且MIS的目标——降低方差——也能得以实现。对于非常规的部分，通常背后有特定的数学推导来支持其在该系统框架内的正确性。

# Miss Shader揭秘 —— HandleMiss 与环境光处理

到目前为止，我们已经探讨了光线的生成、在场景中的弹射、与不发光/发光表面的交互，以及NEE（下一事件估计）如何计算直接光照。但如果一条光线飞向无穷远，没有碰到任何物体，会发生什么呢？这时就轮到`Miss Shader`（在RTXPT中通过 `PathTracer.hlsli` 里的 `PathTracer::HandleMiss` 函数实现）登场了。它的主要职责是计算来自环境（例如天空盒、环境贴图）的光照贡献，并终止这条光线的路径。

```hlsl
// PathTracer/PathTracer.hlsli
namespace PathTracer
{
    // ... (其他函数) ...

    // Miss shader
    inline void HandleMiss(inout PathState path, const float3 rayOrigin, const float3 rayDir, const float rayTCurrent, const WorkingContext workingContext)
    {
        // 1. 更新路径已行进的距离和相关状态
        // rayTCurrent 在这里通常是 TraceRay 时设置的 TMax，表示光线行进了这么远仍未命中。
        UpdatePathTravelled(path, rayOrigin, rayDir, rayTCurrent, workingContext);

        // (Delta Tree 可视化调试相关的代码块)
#if PATH_TRACER_MODE==PATH_TRACER_MODE_BUILD_STABLE_PLANES && ENABLE_DEBUG_DELTA_TREE_VIZUALISATION
        if (path.hasFlag(PathFlags::deltaTreeExplorer))
        {
            DeltaTreeVizHandleMiss(path, rayOrigin, rayDir, rayTCurrent, workingContext);
            return;
        }
#endif

        float3 environmentEmission = 0.f; // 初始化环境光贡献

        // 2. 解包 MIS (多重重要性采样) 信息
        // misInfo 来自上一路径顶点的NEE计算，用于判断是否需要对环境光进行MIS。
        NEEBSDFMISInfo misInfo = NEEBSDFMISInfo::Unpack16bit(path.packedMISInfo);

        // 3. 判断是否需要计算环境光贡献 (考虑与NEE/ReSTIR DI的配合)
        // !(A && B) 等价于 !A || !B
        // misInfo.SkipEmissiveBRDF: 如果为true (例如ReSTIR DI已处理直接光)，则可能跳过自发光/环境光。
        // !path.wasScatterTransmission(): 如果上一次散射是透射，即使SkipEmissiveBRDF为true，可能仍需评估环境光。
        // 总体逻辑：除非(明确指示跳过自发光/环境光 并且 上一次不是透射)，否则就计算环境光。
        if ( !(misInfo.SkipEmissiveBRDF && !path.wasScatterTransmission()) )
        {
            // 3a. 获取环境贴图对象
            EnvMap envMap = Bridge::CreateEnvMap(); 

            // 3b. 根据漫反射弹射次数选择环境贴图的MIP级别
            // 多次漫反射后，使用较低的MIP级别可以减少高频环境贴图带来的噪声和计算成本。
            float mipLevel = (path.getCounter(PackedCounters::DiffuseBounces)>1)?(Bridge::DiffuseEnvironmentMapMIPOffset()):(0); 

            // 3c. 将光线方向转换为环境贴图的本地坐标系 (环境贴图可能自带旋转)
            float3 localDir = envMap.ToLocal(path.dir);      
            // 3d. 从环境贴图采样，获取辐射亮度 Le
            float3 Le = envMap.EvalLocal(localDir, mipLevel);

            // 3e. 计算 MIS 权重
            // 目的是平衡“BSDF采样方向恰好指向环境的这个部分”与“NEE从前一顶点显式采样环境光的这个部分”
            float misWeight = 1.0f;
            // 条件：前一顶点启用了光源采样(NEE)，且当前未命中路径是由BSDF采样产生的(PDF非零)
            if( misInfo.LightSamplingEnabled && path.bsdfScatterPdf != 0 )
            {
                // 创建与前一顶点配置相同的光源采样器
                LightSampler lightSampler = Bridge::CreateLightSampler( workingContext.pixelPos, misInfo.LightSamplingIsIndirect, workingContext.debug.IsDebugPixel() );
                // 根据当前未命中的方向，查找对应的环境光源索引（环境贴图常被视为一个或多个光源）
                // LookupEnvLightByDirection 是关键，它将一个方向映射到一个“光源实体”以便获取NEE的PDF。
                uint environmentQuadLightIndex = lightSampler.LookupEnvLightByDirection( localDir ); 
                // 计算BSDF路径命中此环境区域的MIS权重，与NEE采样此区域的可能性进行平衡。
                misWeight = lightSampler.ComputeBSDFMISForEnvironmentQuad(environmentQuadLightIndex, path.bsdfScatterPdf, misInfo.NarrowNEESamples, misInfo.TotalSamples);

                // (向光源采样器提供反馈，用于自适应光源采样)
                float simpleRandom = Hash32ToFloat( Hash32Combine( Hash32Combine(Hash32(path.getVertexIndex() + 0x0366FE2F), path.id), Bridge::getSampleIndex() ) );
                lightSampler.InsertFeedbackFromBSDF(environmentQuadLightIndex, average(path.thp*Le), misWeight, simpleRandom );
            }

            environmentEmission = misWeight * Le; // 应用MIS权重到环境光亮度
        }

        // 4. 对计算出的环境光贡献进行后处理
        if( workingContext.ptConsts.fireflyFilterThreshold != 0 ) // 飞火过滤
            environmentEmission = FireflyFilter( environmentEmission, workingContext.ptConsts.fireflyFilterThreshold, path.fireflyFilterK );
        environmentEmission *= Bridge::getNoisyRadianceAttenuation(); // 应用噪声衰减（例如用于多重采样抗锯齿）
        
        // 5. 更新路径状态：清除命中信息并终止路径
        path.clearHit();  // 清除任何可能残留的命中信息
        path.terminate(); // 标记路径为非激活，因为它不会再继续传播

        // 6. 【可选】稳定平面系统处理未命中情况
#if PATH_TRACER_MODE!=PATH_TRACER_MODE_REFERENCE
        // StablePlanesHandleMiss 允许稳定平面系统记录或使用这条未命中路径的环境光贡献。
        // 如果它返回false，可能表示路径已被稳定平面系统完全处理，可以提前返回。
        if( !StablePlanesHandleMiss(path, environmentEmission, rayOrigin, rayDir, rayTCurrent, 0, workingContext) )
            return;
#endif

        // 7. 将环境光贡献累加到路径总光照 L
        // (在特定模式下，例如填充稳定平面模式，可能不直接累加到 L，而是输出到特定缓冲区)
#if PATH_TRACER_MODE != PATH_TRACER_MODE_FILL_STABLE_PLANES 
        if (any(environmentEmission>0))
            path.L += max( 0.xxx, path.thp*environmentEmission ); // 确保贡献非负
#endif
    } // end of HandleMiss
} // end of namespace PathTracer
```

**`HandleMiss` 的核心逻辑剖析：**

1.  **路径状态更新 (`UpdatePathTravelled`)**: 与 `HandleHit` 类似，首先更新光线行进的距离等信息。对于 `HandleMiss`，`rayTCurrent` 通常是光线追踪时设定的最大追踪距离 `TMax`。

2.  **MIS 信息与条件判断 (`misInfo`, `if (!(misInfo.SkipEmissiveBRDF && !path.wasScatterTransmission()))`)**:
    * `misInfo` 是从 `path.packedMISInfo` 解包得到的，它包含了上一个路径顶点（如果执行了NEE）的MIS相关决策信息。
    * `SkipEmissiveBRDF` 标志若为真，通常意味着像ReSTIR DI这样的技术已经负责了直接光照（包括来自环境的光源），因此BSDF路径不应再次重复计算这些贡献。
    * `!path.wasScatterTransmission()` 表示上一次散射不是透射。如果上一次是透射（例如光线从物体内部射出到环境中），即使 `SkipEmissiveBRDF` 为真，也可能需要评估环境光。
    * 这个 `if` 条件决定了是否真的需要对环境贴图进行采样。如果条件不满足（例如，ReSTIR DI已处理且非透射出界），`environmentEmission` 将保持为0。

3.  **环境光采样与MIS**:
    * **采样环境贴图**: 如果需要计算环境光，代码会获取环境贴图 (`Bridge::CreateEnvMap()`)，根据光线方向 `path.dir`（可能需要转换到环境贴图的局部坐标系）和选定的MIP级别（多次漫反射后使用较低MIP以减少噪声）来评估环境贴图，得到基础的环境辐射亮度 `Le`。
    * **MIS权重计算**: 这是非常关键的一步。
        * 如果前一个顶点执行了NEE (`misInfo.LightSamplingEnabled == true`)，并且当前这条未命中场景的路径是由BSDF散射产生的 (`path.bsdfScatterPdf != 0`)，那么就需要计算MIS权重。
        * 这是因为环境贴图本身也可以被视为一个巨大的光源，NEE有可能会从前一个顶点直接采样到当前这个方向的环境光。因此，当BSDF路径“自然地”射向这个方向的环境时，需要与NEE策略进行平衡。
        * `lightSampler.LookupEnvLightByDirection(localDir)`: 这个函数很关键，它试图将当前光线的方向 `localDir` 映射到光源采样器 `LightSampler` 中的一个“环境光源实体”（例如一个代表天空的 `EnvironmentQuadLight`）。有了这个光源索引，才能获取NEE采样该环境光源的PDF。
        * `lightSampler.ComputeBSDFMISForEnvironmentQuad(...)`: 使用我们之前讨论过的MIS计算函数，传入BSDF的PDF (`path.bsdfScatterPdf`) 和从 `environmentQuadLightIndex` 获取到的NEE采样该环境区域的PDF，来计算当前BSDF路径命中此环境的MIS权重。
        * `lightSampler.InsertFeedbackFromBSDF(...)`: 如果BSDF路径命中了环境光，并且该环境光贡献显著，这个信息会反馈给光源采样器，用于未来的自适应采样。
    * 最终的环境光贡献是 `misWeight * Le`。

4.  **后处理与路径终止**:
    * 计算得到的 `environmentEmission` 会经过飞火过滤和噪声衰减。
    * `path.clearHit()` 清除路径上的命中信息（因为确实未命中）。
    * `path.terminate()` 将路径标记为终止，因为它已经到达了“世界尽头”，不会再有后续的弹射。

5.  **稳定平面交互 (`StablePlanesHandleMiss`)**: 如果启用了稳定平面技术（非参考模式），`StablePlanesHandleMiss` 会被调用。这个函数允许稳定平面系统利用这次未命中事件的信息，例如记录逃逸出稳定区域的光线的环境光贡献。

6.  **累加贡献**: 最后，在合适的路径追踪模式下，经过处理的 `environmentEmission` 会乘以当前路径的吞吐量 `path.thp`，并累加到总的路径光照 `path.L` 中。

**总结 `HandleMiss` 的重要性：**

* 它不仅仅是返回一个固定的背景色。对于基于图像的照明（Image-Based Lighting, IBL），`HandleMiss` 是实现真实感环境光照的核心。
* 它通过MIP级别选择来平衡环境贴图的细节和渲染性能/噪声。
* 最精妙之处在于它与NEE的MIS集成。通过将环境视为一个（或多个）可被NEE采样的光源，`HandleMiss` 能够正确地处理BSDF路径命中环境与NEE直接采样环境之间的权重分配，避免了重复计算或权重失衡，这对于IBL的无偏和高效渲染至关重要。
* 与稳定平面系统的交互进一步展示了RTXPT中不同渲染子系统间的协同工作。

`HandleMiss` 虽然代表光线的“终点”，但其内部逻辑（特别是MIS部分）同样体现了现代路径追踪算法的复杂与精巧。

# 阶段性总结

目前我们已经梳理了 `RayGen`、`ClosestHit` (`HandleHit`)、`NEE` (`HandleNEE`) 以及 `Miss Shader` (`HandleMiss`) 的主要逻辑，对 NEE 的采样流程和 MIS 的计算也有了初步理解。如果之后有时间，可以进一步研究一些辅助函数，例如 `Bridge::` 系列或者光源/BSDF 采样的具体实现。

这个仓库的功能还挺丰富，其中很多都是我感兴趣的，后续有空的话可以继续探索，比如：

* **简单可扩展的 BSDF 模型**
* **基本体积和嵌套介质（支持优先级）**
* **支持解析光源（平行光、聚光灯、点光源）、发光三角形和环境贴图**
* **基于反馈的时间自适应重要性采样 (NEE)**
* **基础路径追踪功能**

  * Practical Hash-based Owen Scrambling 低差异样本生成
  * 基于 RayCones 的 MIP 选择、早期光线终止等
* **基本光栅化功能**

  * 基本 TAA、色调映射等
* **高级优化**

  * Shader Execution Reordering (SER) 提升执行效率
  * RTXDI 集成 (ReSTIR DI 和 ReSTIR GI)
  * OMM 集成 (快速 alpha 测试)
  * NRD ReLAX 和 ReBLUR 去噪（支持三层路径空间分解）
  * RTXTF 集成 (随机纹理过滤)
  * Streamline 集成 (DLSS 4.0，包括 SR, AA, FG 和 MFG)

这些功能基本覆盖了一个现代路径追踪引擎的各个方面，有机会的话可以逐步深入学习。
