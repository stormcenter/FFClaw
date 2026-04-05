# GL Transitions 集成规划

> 本文档规划如何将 [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions) 的 121 个 GLSL 转场效果集成到 FFClaw 视频编辑器中。

**项目路径：** `/Users/chi/ClipCraft`  
**目标：** 在现有 TRANSITION_MAP 基础上扩展，支持全部 121 个 GL Transition 效果。

---

## 一、概述（Overview）

### 1.1 什么是 GL Transitions？

GL Transitions 是一个开源的 GLSL 转场特效库，提供 121 种基于片段着色器的平滑转场效果。每种转场本质上是一个 GLSL fragment shader 函数：

```glsl
vec4 transition(vec2 p) {
  // progress: 0.0 → 1.0 转场进度
  // ratio: 视频宽高比
  // getFromColor(p): 从源画面采样
  // getToColor(p): 到目标画面采样
  return mix(getFromColor(p), getToColor(p), progress);
}
```

### 1.2 与 FFClaw 的集成方式

FFClaw 使用 FFmpeg 进行视频渲染。GL Transitions 通过 [ffmpeg-gl-transition](https://github.com/transitive-bullshit/ffmpeg-gl-transition) 滤镜应用到 FFmpeg 管道中：

```
ffmpeg -i input.mp4 -i overlay.mp4 \
  -filter_complex "[0:v][1:v]gltransition=duration=1:source=shader.glsl[out]" \
  -map "[out]" output.mp4
```

### 1.3 FFmpeg 兼容性检查

**在开始之前，请验证 FFmpeg 是否支持 gltransition 滤镜：**

```bash
ffmpeg -filters | grep gltransition
```

**如果不支持，有以下几种解决方案：**

1. **通过 npm 安装（推荐）：**
   ```bash
   npm install -g ffmpeg-gl-transition
   ```

2. **使用 Docker 镜像：**
   ```bash
   docker run --rm \
     -v $(pwd):/workdir \
     -w /workdir \
     transitive/ffmpeg-gl-transition \
     -i input.mp4 -i overlay.mp4 \
     -filter_complex "[0:v][1:v]gltransition=duration=1:source=shader.glsl[out]" \
     -map "[out]" output.mp4
   ```

3. **自行编译：**
   参见 [ffmpeg-gl-transition 官方文档](https://github.com/transitive-bullshit/ffmpeg-gl-transition)。

**降级策略：** 如果 gltransition 滤镜不可用，FFClaw 将回退到仅使用内置的简单转场（fade、dissolve、wipe、zoom、blur 等），所有 `gl:` 前缀的转场将返回 `TRANSITION_GLSL_NOT_FOUND` 错误。

### 1.4 现有架构

FFClaw 已有的转场系统：

| 文件 | 说明 |
|------|------|
| `src/core/builder.js` | `TRANSITION_MAP` 字典，将 effect 名称映射为 FFCreator 字符串 |
| `src/core/timeline-model.js` | `TransitionClip` 模型（`effect`, `duration`, `between`） |
| `src/utils/output.js` | `Errors.TRANSITION_NOT_FOUND` 错误码 |

现有支持 8 种简单转场：`fade`, `dissolve`, `wipe`, `zoom`, `blur` 及各方向变体。

---

## 二、技术方案（Technical Approach）

### 2.1 GLSL 文件存储

```
FFClaw/
  vendor/
    gl-transitions/          # 所有 121 个 .glsl 文件
      Bounce.glsl
      CircleCrop.glsl
      CrossZoom.glsl
      ...
  src/
    transitions/             # 编译/注册层
      registry.js            # 转场注册表（名称 → GLSL 文件映射）
      params.js              # 参数类型定义和默认值
```

### 2.2 FFmpeg 集成方式

**方案：使用 ffmpeg-gl-transition 滤镜**

`ffmpeg-gl-transition` 需要预先编译的 GLFW/FFmpeg 环境，滤镜参数：

```
gltransition=duration=1:source=transition.glsl
```

**参数传递方式：**

```javascript
// 带参数的转场需要通过 env 传递
gltransition=duration=1:source=shader.glsl:env="strength=0.5;amplitude=1.2"
```

或者修改 shader 文件，将参数编译进去（不推荐，破坏可复用性）。

### 2.3 sampler2D 纹理处理

两个转场使用 `sampler2D` 类型参数，需要外部纹理输入：

| 转场 | 参数 | 说明 |
|------|------|------|
| `luma` | `luma: sampler2D` | 亮度图，决定转场进度 |
| `displacement` | `displacementMap: sampler2D` | 位移贴图，控制像素偏移方向 |

**内置默认纹理：**

FFClaw 将捆绑一个 256×256 的程序化噪声纹理（`default-noise.png`），自动用于这两个转场。用户可通过 CLI 覆盖：

```bash
ffclaw add-transition t1 \
  --effect gl:luma \
  --duration 0.5 \
  --texture luma:/path/to/custom-luma.png \
  --between clip1,clip2

ffclaw add-transition t1 \
  --effect gl:displacement \
  --duration 0.5 \
  --texture displacement:/path/to/displacement.png \
  --between clip1,clip2
```

注册表条目中需标记 `textureRequired: true`：

```javascript
luma: {
  glsl: 'luma.glsl',
  params: [],
  textureRequired: true,
  description: { zh: '亮度转场', en: 'Luma' },
},
displacement: {
  glsl: 'displacement.glsl',
  params: [{ name: 'strength', type: 'float', default: 0.5 }],
  textureRequired: true,
  description: { zh: '置换转场', en: 'Displacement' },
},
```

### 2.4 核心注册表设计

```javascript
// src/transitions/registry.js

export const GL_TRANSITIONS = {
  bounce: {
    glsl: 'Bounce.glsl',
    params: [
      { name: 'shadow_colour', type: 'vec4', default: [0, 0, 0, 0.6] },
      { name: 'shadow_height', type: 'float', default: 0.075 },
      { name: 'bounces', type: 'float', default: 3.0 },
    ],
    description: { zh: '弹跳转场', en: 'Bounce' },
  },
  circleCrop: {
    glsl: 'CircleCrop.glsl',
    params: [
      { name: 'bgcolor', type: 'vec4', default: [0, 0, 0, 1.0] },
    ],
    description: { zh: '圆形裁剪转场', en: 'Circle Crop' },
  },
  crossZoom: {
    glsl: 'CrossZoom.glsl',
    params: [
      { name: 'strength', type: 'float', default: 0.4 },
    ],
    description: { zh: '交叉缩放转场', en: 'Cross Zoom' },
  },
  // ... 全部 121 个
};

// 查询函数
export function getGLTransition(name) {
  return GL_TRANSITIONS[name] ?? null;
}

export function listGLTransitions() {
  return Object.entries(GL_TRANSITIONS).map(([key, val]) => ({
    name: key,
    ...val,
  }));
}
```

### 2.5 Builder.js 扩展

在现有 `TRANSITION_MAP` 基础上，添加 GL Transition 识别：

```javascript
const GL_TRANSITION_PREFIX = 'gl:';

// 扩展 resolveEffect()
function resolveEffect(effect) {
  if (effect.startsWith(GL_TRANSITION_PREFIX)) {
    const name = effect.slice(3); // 去掉 "gl:"
    const gl = getGLTransition(name);
    if (!gl) throw new Error(`GL Transition '${name}' not found`);
    return { type: 'gl', glsl: gl.glsl, params: gl.params };
  }
  return { type: 'ffcreator', effect: TRANSITION_MAP[effect] ?? DEFAULT_TRANSITION };
}
```

### 2.6 FFmpeg 命令生成

```javascript
// 生成 gl-transition FFmpeg 滤镜
function buildGLTransitionFilter(clip1, clip2, transition, projectDir) {
  const { glsl, params } = transition;
  const glslPath = path.resolve(projectDir, 'vendor/gl-transitions', glsl);

  // 构建 env 参数
  const envParams = (params || [])
    .map(p => `${p.name}=${p.default}`)
    .join(';');

  return `gltransition=duration=${transition.duration}:source=${glslPath}${envParams ? ':env=' + envParams : ''}`;
}
```

---

## 三、转场目录（Transition Catalog）

以下为全部 121 个 GL Transitions 的完整目录，按英文名称字母排序。**Default** 列为各参数的默认值，sampler2D 类型参数无默认值（需要外部纹理）。

| # | English Name | Chinese Name | GLSL File | Has Params | Parameters | Default |
|---|-------------|-------------|-----------|------------|-----------|---------|
| 1 | AdvancedMosaic | 高级马赛克 | AdvancedMosaic.glsl | Yes | `pixelSize: float` | 50.0 |
| 2 | Angular | 角度转场 | Angular.glsl | Yes | `startingAngle: float` | 90 |
| 3 | BlockDissolve | 块状消散 | BlockDissolve.glsl | Yes | `blocksize: float` | 0.02 |
| 4 | BookFlip | 书本翻页 | BookFlip.glsl | No | — | — |
| 5 | Bounce | 弹跳转场 | Bounce.glsl | Yes | `shadow_colour: vec4`, `shadow_height: float`, `bounces: float` | `[0,0,0,0.6]`, `0.075`, `3.0` |
| 6 | BowTieHorizontal | 水平蝴蝶结 | BowTieHorizontal.glsl | No | — | — |
| 7 | BowTieVertical | 垂直蝴蝶结 | BowTieVertical.glsl | No | — | — |
| 8 | BowTieWithParameter | 参数化蝴蝶结 | BowTieWithParameter.glsl | Yes | `adjust: float`, `reverse: bool` | `0.5`, `false` |
| 9 | Box | 盒状转场 | Box.glsl | Yes | `rectIn: int`, `location: int` | `1`, `0` |
| 10 | burn | 燃烧转场 | burn.glsl | Yes | `color: vec3` | `[0.9, 0.4, 0.2]` |
| 11 | burn0 | 燃烧淡化 | burn0.glsl | Yes | `burnColor: vec3` | `[1.0, 0.5, 0.0]` |
| 12 | ButterflyWaveScrawler | 蝴蝶波浪 | ButterflyWaveScrawler.glsl | Yes | `amplitude: float`, `waves: float`, `colorSeparation: float` | `1.0`, `30.0`, `0.3` |
| 13 | cannabisleaf | 绽放涟漪 | cannabisleaf.glsl | No | — | — |
| 14 | chessboard | 棋盘格转场 | chessboard.glsl | Yes | `grid_num: float` | 10.0 |
| 15 | circle | 圆形转场 | circle.glsl | Yes | `center: vec2`, `backColor: vec3` | `[0.5, 0.5]`, `[0.1, 0.1, 0.1]` |
| 16 | CircleCrop | 圆形裁剪 | CircleCrop.glsl | Yes | `bgcolor: vec4` | `[0, 0, 0, 1.0]` |
| 17 | circleopen | 圆形展开 | circleopen.glsl | Yes | `smoothness: float`, `opening: bool` | `0.3`, `true` |
| 18 | ColourDistance | 颜色距离 | ColourDistance.glsl | Yes | `power: float` | 5.0 |
| 19 | colorphase | 相位颜色 | colorphase.glsl | Yes | `fromStep: vec4`, `toStep: vec4` | `[0,0.2,0.4,0]`, `[0.6,0.8,1,1]` |
| 20 | coord-from-in | 坐标来源转场 | coord-from-in.glsl | No | — | — |
| 21 | CrazyParametricFun | 参数曲线 | CrazyParametricFun.glsl | Yes | `a: float`, `b: float`, `amplitude: float`, `smoothness: float` | `4`, `1`, `120`, `0.1` |
| 22 | crosshatch | 十字阴影 | crosshatch.glsl | Yes | `center: vec2`, `threshold: float`, `fadeEdge: float` | `[0.5]`, `3.0`, `0.1` |
| 23 | crosswarp | 交叉扭曲 | crosswarp.glsl | No | — | — |
| 24 | CrossZoom | 交叉缩放 | CrossZoom.glsl | Yes | `strength: float` | 0.4 |
| 25 | cube | 立方体旋转 | cube.glsl | Yes | `persp: float`, `unzoom: float`, `reflection: float`, `floating: float` | `0.7`, `0.3`, `0.4`, `3.0` |
| 26 | DefocusBlur | 散焦模糊 | DefocusBlur.glsl | Yes | `blurSize: float` | 0.02 |
| 27 | Directional | 方向性转场 | Directional.glsl | Yes | `direction: vec2` | `[0.0, 1.0]` |
| 28 | directional-easing | 方向缓动 | directional-easing.glsl | Yes | `direction: vec2` | `[0.0, 1.0]` |
| 29 | DirectionalScaled | 方向缩放 | DirectionalScaled.glsl | Yes | `direction: vec2`, `scale: float` | `[0.0, 1.0]`, `0.7` |
| 30 | directionalwarp | 方向弯曲 | directionalwarp.glsl | Yes | `smoothness: float`, `direction: vec2` | `0.1`, `[-1.0, 1.0]` |
| 31 | directionalwipe | 方向擦除 | directionalwipe.glsl | Yes | `direction: vec2`, `smoothness: float` | `[1.0, -1.0]`, `0.5` |
| 32 | displacement | 置换转场 | displacement.glsl | Yes | `displacementMap: sampler2D`, `strength: float` | *(纹理)*, `0.5` |
| 33 | dissolve | 溶解转场 | dissolve.glsl | Yes | `uLineWidth: float`, `uSpreadClr: vec3`, `uHotClr: vec3`, `uPow: float`, `uIntensity: float` | `0.1`, `[1,0,0]`, `[0.9,0.9,0.2]`, `5.0`, `1.0` |
| 34 | DoomScreenTransition | 毁灭屏幕 | DoomScreenTransition.glsl | Yes | `bars: int`, `amplitude: float`, `noise: float`, `frequency: float`, `dripScale: float` | `30`, `2`, `0.1`, `0.5`, `0.5` |
| 35 | doorway | 门洞转场 | doorway.glsl | Yes | `reflection: float`, `perspective: float`, `depth: float` | `0.4`, `0.4`, `3` |
| 36 | Dreamy | 梦幻转场 | Dreamy.glsl | No | — | — |
| 37 | DreamyZoom | 梦幻缩放 | DreamyZoom.glsl | Yes | `rotation: float`, `scale: float` | `6`, `1.2` |
| 38 | EdgeTransition | 边缘转场 | EdgeTransition.glsl | Yes | `edge_thickness: float`, `edge_brightness: float` | `0.001`, `8.0` |
| 39 | fade | 淡入淡出 | fade.glsl | No | — | — |
| 40 | fadecolor | 颜色淡化 | fadecolor.glsl | Yes | `color: vec3`, `colorPhase: float` | `[0,0,0]`, `0.4` |
| 41 | fadegrayscale | 灰度淡化 | fadegrayscale.glsl | Yes | `intensity: float` | 0.3 |
| 42 | FilmBurn | 胶片燃烧 | FilmBurn.glsl | Yes | `Seed: float` | 2.31 |
| 43 | flyeye | 苍蝇眼转场 | flyeye.glsl | Yes | `size: float`, `zoom: float`, `colorSeparation: float` | `0.04`, `50.0`, `0.3` |
| 44 | Fold | 折叠转场 | Fold.glsl | No | — | — |
| 45 | fragment | 碎片转场 | fragment.glsl | No | — | — |
| 46 | GlitchDisplace | 故障位移 | GlitchDisplace.glsl | No | — | — |
| 47 | GlitchMemories | 故障记忆 | GlitchMemories.glsl | No | — | — |
| 48 | GridFlip | 网格翻转 | GridFlip.glsl | Yes | `size: ivec2`, `pause: float`, `dividerWidth: float`, `bgcolor: vec4`, `randomness: float` | `[4,4]`, `0.1`, `0.05`, `[0,0,0,1]`, `0.1` |
| 49 | heart | 心形转场 | heart.glsl | No | — | — |
| 50 | hexagonalize | 六边形化 | hexagonalize.glsl | Yes | `steps: int`, `horizontalHexagons: float` | `50`, `20` |
| 51 | HSVfade | HSV淡入 | HSVfade.glsl | No | — | — |
| 52 | horizontalClose | 水平关闭 | HorizontalClose.glsl | No | — | — |
| 53 | horizontalOpen | 水平打开 | HorizontalOpen.glsl | No | — | — |
| 54 | InvertedPageCurl | 反向翻页 | InvertedPageCurl.glsl | No | — | — |
| 55 | kaleidoscope | 万花筒 | kaleidoscope.glsl | Yes | `speed: float`, `angle: float`, `power: float` | `1.0`, `1.0`, `1.5` |
| 56 | LeftRight | 左右转场 | LeftRight.glsl | No | — | — |
| 57 | LinearBlur | 线性模糊 | LinearBlur.glsl | Yes | `intensity: float` | 0.1 |
| 58 | luma | 亮度转场 | luma.glsl | Yes | `luma: sampler2D` | *(纹理)* |
| 59 | luminance_melt | 亮度融化 | luminance_melt.glsl | Yes | `direction: bool`, `l_threshold: float`, `above: bool` | `true`, `0.8`, `false` |
| 60 | morph | 变形转场 | morph.glsl | Yes | `strength: float` | 0.1 |
| 61 | Mosaic | 马赛克转场 | Mosaic.glsl | Yes | `endx: int`, `endy: int` | `2`, `-1` |
| 62 | mosaic_transition | 马赛克转场2 | mosaic_transition.glsl | Yes | `mosaicNum: float` | 10.0 |
| 63 | multiply_blend | 正片叠底 | multiply_blend.glsl | No | — | — |
| 64 | Overexposure | 曝光过度 | Overexposure.glsl | Yes | `strength: float` | 0.6 |
| 65 | parametric_glitch | 图形故障 | parametric_glitch.glsl | Yes | `ampx: float`, `ampy: float` | `1.0`, `1.0` |
| 66 | perlin | Perlin噪声 | perlin.glsl | Yes | `scale: float`, `smoothness: float`, `seed: float` | `4.0`, `0.01`, `12.9898` |
| 67 | pinwheel | 风车转场 | pinwheel.glsl | Yes | `speed: float` | 2.0 |
| 68 | pixelize | 像素化转场 | pixelize.glsl | Yes | `squaresMin: ivec2`, `steps: int` | `[20,20]`, `50` |
| 69 | polar_function | 极坐标函数 | polar_function.glsl | Yes | `segments: int` | `5` |
| 70 | PolkaDotsCurtain | 波尔卡点幕布 | PolkaDotsCurtain.glsl | Yes | `dots: float`, `center: vec2` | `20.0`, `[0,0]` |
| 71 | powerKaleido | 指数万花筒 | powerKaleido.glsl | Yes | `scale: float`, `z: float`, `speed: float` | `2.0`, `1.5`, `5.0` |
| 72 | PuzzleRight | 拼图向右 | PuzzleRight.glsl | Yes | `size: ivec2`, `pause: float`, `dividerWidth: float` | `[4,4]`, `0.1`, `0.005` |
| 73 | Radial | 径向转场 | Radial.glsl | Yes | `smoothness: float` | 1.0 |
| 74 | randomNoisex | 随机噪声X | randomNoisex.glsl | No | — | — |
| 75 | randomsquares | 随机方块 | randomsquares.glsl | Yes | `size: ivec2`, `smoothness: float` | `[10,10]`, `0.5` |
| 76 | Rectangle | 矩形转场 | Rectangle.glsl | Yes | `bgcolor: vec4` | `[0, 0, 0, 1.0]` |
| 77 | RectangleCrop | 矩形裁剪 | RectangleCrop.glsl | Yes | `bgcolor: vec4` | `[0, 0, 0, 1.0]` |
| 78 | ripple | 波纹转场 | ripple.glsl | Yes | `amplitude: float`, `speed: float` | `100.0`, `50.0` |
| 79 | Rolls | 卷曲转场 | Rolls.glsl | Yes | `type: int`, `RotDown: bool` | `0`, `false` |
| 80 | rotate_scale_fade | 旋转缩放淡化 | rotate_scale_fade.glsl | Yes | `center: vec2`, `rotations: float`, `scale: float`, `backColor: vec4` | `[0.5,0.5]`, `1`, `8`, `[0.15,0.15,0.15,1]` |
| 81 | rotateTransition | 旋转转场 | rotateTransition.glsl | No | — | — |
| 82 | RotateScaleVanish | 旋转缩放消失 | RotateScaleVanish.glsl | Yes | `FadeInSecond: bool`, `ReverseEffect: bool`, `ReverseRotation: bool` | `true`, `false`, `false` |
| 83 | scale-in | 缩入转场 | scale-in.glsl | No | — | — |
| 84 | simpleFlip | 简单翻转 | SimpleFlip.glsl | No | — | — |
| 85 | SimpleZoom | 简单缩放 | SimpleZoom.glsl | Yes | `zoom_quickness: float` | 0.8 |
| 86 | SimpleZoomOut | 简单缩小 | SimpleZoomOut.glsl | Yes | `zoom_quickness: float`, `fade: bool` | `0.8`, `true` |
| 87 | Slides | 幻灯片转场 | Slides.glsl | Yes | `type: int`, `In: bool` | `0`, `false` |
| 88 | splitSlideInHorizontal | 水平滑入 | splitSlideInHorizontal.glsl | Yes | `reverse: bool` | `false` |
| 89 | splitSlideInOutHorizontal | 水平滑入滑出 | splitSlideInOutHorizontal.glsl | Yes | `reverse: bool` | `false` |
| 90 | splitSlideInOutVertical | 垂直滑入滑出 | splitSlideInOutVertical.glsl | Yes | `reverse: bool` | `false` |
| 91 | splitSlideInVertical | 垂直滑入 | splitSlideInVertical.glsl | Yes | `reverse: bool` | `false` |
| 92 | splitSlideOutHorizontal | 水平滑出 | splitSlideOutHorizontal.glsl | Yes | `reverse: bool` | `false` |
| 93 | splitSlideOutVertical | 垂直滑出 | splitSlideOutVertical.glsl | Yes | `reverse: bool` | `false` |
| 94 | squareswire | 方格线转场 | squareswire.glsl | Yes | `squares: ivec2`, `direction: vec2`, `smoothness: float` | `[10,10]`, `[1.0,-0.5]`, `1.6` |
| 95 | squeeze | 挤压转场 | squeeze.glsl | Yes | `colorSeparation: float` | 0.04 |
| 96 | StarWipe | 星形擦除 | StarWipe.glsl | Yes | `border_thickness: float`, `star_rotation: float`, `border_color: vec4`, `star_center: vec2` | `0.01`, `0.75`, `[1,1,1,1]`, `[0.5,0.5]` |
| 97 | static_wipe | 静态擦除 | static_wipe.glsl | Yes | `u_transitionUpToDown: bool`, `u_max_static_span: float` | `true`, `0.5` |
| 98 | StaticFade | 静态淡化 | StaticFade.glsl | Yes | `n_noise_pixels: float`, `static_luminosity: float` | `200.0`, `0.8` |
| 99 | StereoViewer | 立体视图 | StereoViewer.glsl | Yes | `zoom: float`, `corner_radius: float` | `0.88`, `0.22` |
| 100 | swap | 交换转场 | swap.glsl | Yes | `reflection: float`, `perspective: float`, `depth: float` | `0.4`, `0.2`, `3.0` |
| 101 | Swirl | 漩涡转场 | Swirl.glsl | No | — | — |
| 102 | tangentMotionBlur | 正切运动模糊 | tangentMotionBlur.glsl | No | — | — |
| 103 | TilesWave | 瓷砖波浪 | TilesWave.glsl | Yes | `tileCount: ivec2`, `flipX: bool`, `flipY: bool` | `[8,8]`, `true`, `false` |
| 104 | TopBottom | 上下转场 | TopBottom.glsl | No | — | — |
| 105 | TVStatic | 电视雪花 | TVStatic.glsl | Yes | `offset: float` | 0.05 |
| 106 | undulatingBurnOut | 波动燃烧 | undulatingBurnOut.glsl | Yes | `smoothness: float`, `center: vec2`, `color: vec3` | `0.03`, `[0.5]`, `[0,0,0]` |
| 107 | verticalClose | 垂直关闭 | VerticalClose.glsl | No | — | — |
| 108 | verticalOpen | 垂直打开 | VerticalOpen.glsl | No | — | — |
| 109 | WaterDrop | 水滴转场 | WaterDrop.glsl | Yes | `amplitude: float`, `speed: float` | `30`, `30` |
| 110 | wind | 风力转场 | wind.glsl | Yes | `size: float`, `reversed: bool` | `0.2`, `false` |
| 111 | windowblinds | 百叶窗转场 | windowblinds.glsl | No | — | — |
| 112 | windowslice | 窗口切片 | windowslice.glsl | Yes | `count: float`, `smoothness: float` | `10.0`, `0.5` |
| 113 | wipeDown | 向下擦除 | wipeDown.glsl | No | — | — |
| 114 | wipeLeft | 向左擦除 | wipeLeft.glsl | No | — | — |
| 115 | wipeRight | 向右擦除 | wipeRight.glsl | No | — | — |
| 116 | wipeUp | 向上擦除 | wipeUp.glsl | No | — | — |
| 117 | x_axis_translation | X轴平移 | x_axis_translation.glsl | No | — | — |
| 118 | ZoomInCircles | 圆形缩小 | ZoomInCircles.glsl | No | — | — |
| 119 | ZoomLeftWipe | 左侧缩放擦除 | ZoomLeftWipe.glsl | Yes | `zoom_quickness: float` | 0.8 |
| 120 | ZoomRigthWipe | 右侧缩放擦除 | ZoomRigthWipe.glsl | Yes | `zoom_quickness: float` | 0.8 |
| 121 | zoomInOut | 缩入缩出 | zoomInOut.glsl | No | — | — |

### 有参数的转场统计

- **有参数转场**: 85 个
- **无参数转场**: 36 个

### 参数类型分布

| 类型 | 说明 | 示例 |
|------|------|------|
| `float` | 浮点数参数 | `strength`, `amplitude`, `smoothness` |
| `vec2` | 二维向量 | `direction`, `center` |
| `vec3` | 三维向量/颜色 | `backColor`, `color` |
| `vec4` | 四维向量/颜色+Alpha | `bgcolor`, `shadow_colour` |
| `int` | 整数参数 | `blocksize`, `bars` |
| `bool` | 布尔参数 | `reverse`, `flipX` |
| `ivec2` | 二维整数向量 | `size`, `tileCount` |
| `sampler2D` | 纹理采样器 | `luma`, `displacementMap` |

---

## 四、实施计划（Implementation Plan）

### Phase 1：核心基础设施

**目标**：建立 GL Transition 的注册和 FFmpeg 集成框架

**任务**：
1. 创建 `vendor/gl-transitions/` 目录
2. 批量下载全部 121 个 `.glsl` 文件
3. 创建 `src/transitions/registry.js` — 转场注册表
4. 创建 `src/transitions/params.js` — 参数类型定义
5. 修改 `src/core/builder.js` — 添加 GL Transition 识别逻辑
6. 添加 `TRANSITION_GLSL_NOT_FOUND` 和 `TRANSITION_INVALID_PARAMS` 错误码
7. 在 builder 中实现 FFmpeg `gltransition` 滤镜命令生成
8. 生成默认噪声纹理 `vendor/gl-transitions/default-noise.png`（用于 luma 和 displacement）
9. **FFmpeg 兼容性检查**：在启动时验证 `gltransition` 滤镜可用性，不可用时给出明确提示并降级

**FFmpeg 兼容性检查代码示例**：
```javascript
import { execSync } from 'child_process';

function checkGLTransitionSupport() {
  try {
    const output = execSync('ffmpeg -filters', { encoding: 'utf-8' });
    if (!output.includes('gltransition')) {
      console.warn('[FFClaw] Warning: ffmpeg-gl-transition 滤镜不可用。');
      console.warn('[FFClaw] GL Transitions 将不可用，请安装: npm install -g ffmpeg-gl-transition');
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[FFClaw] Warning: 无法检查 FFmpeg 支持。GL Transitions 可能不可用。');
    return false;
  }
}
```

**验收标准**：
```javascript
// 现有 API 完全兼容
ffclaw timeline add-transition t1 --effect fade --duration 0.5 --between clip1,clip2

// 新 GL Transition 用 gl: 前缀
ffclaw timeline add-transition t1 --effect gl:bounce --duration 0.5 --between clip1,clip2
ffclaw timeline add-transition t1 --effect gl:circleCrop --duration 0.5 --between clip1,clip2
```

### Phase 2：批量导入所有转场

**任务**：
1. 创建导入脚本 `scripts/import-gl-transitions.js`
2. 自动下载所有 121 个 GLSL 文件到 `vendor/gl-transitions/`
3. 自动解析每个 shader 的 uniform 参数（通过正则匹配 `// = value` 注释）
4. 生成 `src/transitions/registry.js` 的初始数据
5. 添加 TypeScript 类型定义

### Phase 3：参数支持

**目标**：让用户可以自定义转场参数

**CLI 设计**：
```bash
# 指定参数
ffclaw timeline add-transition t1 \
  --effect gl:crossZoom \
  --duration 0.5 \
  --params strength=0.8 \
  --between clip1,clip2

# 列出所有转场
ffclaw transition list

# 列出有参数的转场
ffclaw transition list --has-params

# 查看某转场的详细信息
ffclaw transition info crossZoom

# 预览单个转场
ffclaw transition preview crossZoom \
  --from input.jpg \
  --to output.jpg \
  --duration 2 \
  --output preview.gif
```

**需要新增的 CLI 命令**：
| 命令 | 说明 |
|------|------|
| `ffclaw transition list` | 列出所有 GL 转场 |
| `ffclaw transition info <name>` | 显示某转场的参数和默认值 |
| `ffclaw transition preview <name>` | 生成单转场预览 GIF |

**实现**：
1. 在 `Transition` 类型中添加可选 `params` 字段
2. 在 builder 中构建 FFmpeg `env=` 参数
3. 实现 `transition list`、`transition info`、`transition preview` 命令

### Phase 4：预览命令

**目标**：可视化转场效果

**功能**：
```bash
# 预览单个转场（生成 GIF）
ffclaw transition preview crossZoom \
  --from input.jpg \
  --to output.jpg \
  --duration 2 \
  --output preview.gif

# 预览全部 121 个转场（生成 sprite sheet）
ffclaw transition preview-all \
  --from input.jpg \
  --to output.jpg \
  --output sprite.png
```

---

## 五、与现有架构的集成

### 5.1 Transition 数据结构扩展

```typescript
// 扩展 @typedef Transition
interface GLTransitionParams {
  [key: string]: number | boolean | number[] | string;
}

interface Transition {
  id: string;
  effect: string;           // 如 'fade', 'gl:bounce', 'gl:crossZoom'
  duration?: number;
  between: [string, string];
  params?: GLTransitionParams;  // 新增：GL Transition 参数
  texture?: Record<string, string>;  // 新增：sampler2D 纹理覆盖路径
}
```

### 5.2 Builder 集成

```javascript
// builder.js 改动

// 1. 识别 gl: 前缀
function resolveEffect(effect) {
  if (effect.startsWith('gl:')) {
    const name = effect.slice(3);
    const gl = getGLTransition(name);
    if (!gl) throw new Error(`GL Transition '${name}' not found`);
    return { type: 'gl', glsl: gl.glsl, params: gl.params };
  }
  return { type: 'ffcreator', effect: TRANSITION_MAP[effect] ?? DEFAULT_TRANSITION };
}

// 2. 在 buildTransitionFilter 中处理 GL Transition
function buildTransitionFilter(clip1File, clip2File, transition, projectDir) {
  const resolved = resolveEffect(transition.effect);

  if (resolved.type === 'gl') {
    const glslPath = path.resolve(projectDir, 'vendor/gl-transitions', resolved.glsl);
    const env = buildGLEnv(transition.params, resolved.params);
    return `gltransition=duration=${transition.duration}:source=${glslPath}${env}`;
  }

  // 原有的 FFCreator 路径
  return buildFFCreatorTransition(clip1File, clip2File, resolved.effect, transition.duration);
}
```

### 5.3 依赖要求

需要安装支持 OpenGL 的 FFmpeg：

```bash
# 检查当前 ffmpeg 是否支持 gltransition
ffmpeg -filters | grep gltransition

# 如不支持，需要编译带 glfw 的版本
# 参见 https://github.com/transitive-bullshit/ffmpeg-gl-transition
```

---

## 六、使用示例

### 6.1 基本使用

```javascript
// 在项目 JSON 中定义转场
{
  "video": [
    { "id": "v1", "asset": "scene1.mp4", "in": 0, "out": 5 },
    { "id": "v2", "asset": "scene2.mp4", "in": 5, "out": 10 }
  ],
  "transitions": [
    {
      "id": "t1",
      "effect": "gl:crossZoom",      // 使用 GL Transition
      "duration": 0.5,
      "between": ["v1", "v2"],
      "params": { "strength": 0.8 }   // 自定义参数
    }
  ]
}
```

### 6.2 CLI 使用

```bash
# 添加一个简单的 GL 转场
ffclaw timeline add-transition t1 \
  --effect gl:bounce \
  --duration 0.5 \
  --between v1,v2

# 带参数的转场
ffclaw timeline add-transition t1 \
  --effect gl:waterDrop \
  --duration 1.0 \
  --params amplitude=2.0,speed=1.5 \
  --between v1,v2

# 使用需要纹理的转场（使用内置噪声纹理）
ffclaw timeline add-transition t1 \
  --effect gl:luma \
  --duration 1.0 \
  --between v1,v2

# 使用自定义纹理覆盖
ffclaw timeline add-transition t1 \
  --effect gl:displacement \
  --duration 1.0 \
  --texture displacement:/path/to/displacement.png \
  --between v1,v2

# 列出所有可用转场
ffclaw transition list

# 只列出有参数的转场
ffclaw transition list --has-params

# 查看转场详情
ffclaw transition info waterDrop

# 预览转场效果
ffclaw transition preview crossZoom \
  --from scene1.jpg \
  --to scene2.jpg \
  --output preview.gif
```

### 6.3 API 使用

```javascript
import { listGLTransitions, getGLTransition } from './transitions/registry.js';

// 列出所有 GL 转场
const all = listGLTransitions();
console.log(`共 ${all.length} 个 GL 转场`);

// 获取有参数的转场
const withParams = all.filter(t => t.params && t.params.length > 0);
console.log(`其中 ${withParams.length} 个支持参数调节`);

// 获取特定转场详情
const waterDrop = getGLTransition('waterDrop');
console.log(waterDrop.params);
// [
//   { name: 'amplitude', type: 'float', default: 30 },
//   { name: 'speed', type: 'float', default: 30 }
// ]
```

---

## 七、注意事项

1. **FFmpeg GL Transition 依赖**：需要 `ffmpeg` 编译时支持 `gltransition` 滤镜（非默认安装）。必须使用 `ffmpeg-gl-transition` 项目提供的编译版本或自行编译。务必在 Phase 1 中检查兼容性，不可用时提供明确的错误提示和安装指引。

2. **参数验证**：部分 shader 的 `sampler2D` 类型参数（如 `luma`、`displacementMap`）需要额外的纹理输入。FFClaw 会在 `vendor/gl-transitions/` 中预置 `default-noise.png`，用户也可通过 `--texture` 参数覆盖。

3. **性能考虑**：GL Transitions 是 GPU 密集型操作，在批量渲染时需要注意硬件配置。

4. **不破坏现有功能**：所有改动都通过 `gl:` 前缀与现有转场隔离，现有项目无需修改。

5. **文件大小**：121 个 GLSL 文件总计约 300KB，对项目体积影响很小。
