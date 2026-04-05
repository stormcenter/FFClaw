# ClipCraft CLI — 设计文档

> 剪映是 GUI，ClipCraft 是 CLI 版剪映。面向会用剪映的剪辑师，无需写代码，像剪映一样操作即可。

---

## 1. 项目概述

### 1.1 是什么

**ClipCraft** 是基于 FFCreator 的命令行视频剪辑工具，将 FFCreator 的 WebGL 渲染能力封装为剪映风格的 CLI 接口。支持视频剪辑、模板创建、批量渲染，核心场景是 AI Agent 驱动的自动化视频生产。

### 1.2 核心目标

- CLI 命令语义与剪映操作一一对应，剪辑师零学习成本
- 完整的项目文件体系（ffclaw.json），可保存、可复用、可版本化
- 模板变量系统，支持数据驱动批量生成
- --json 输出模式，AI Agent 可完整解析进度和结果

### 1.3 与 FFCreator 的关系

- FFCreator 提供底层渲染能力（WebGL 场景图 + FFmpeg 编码）
- ClipCraft 提供 CLI 封装层和项目文件系统
- FFCreator 零改动（或极小改动，见 5.3 节）

---

## 2. 命令体系

```
clipcraft <command>

new          新建项目（交互式引导）
import       导入素材到素材库
timeline     时间线编辑（核心命令）
filter       滤镜与调色
text         文字与字幕
export       导出视频
template     模板管理
preview      草稿预览
queue        批量渲染队列

全局选项:
  --project <dir>    指定项目目录（默认当前目录）
  --json             JSON 输出（供 Agent 解析）
  --quiet            静默模式
  --ffmpeg <path>    FFmpeg 路径
```

---

## 3. 详细命令设计

### 3.1 `new` — 新建项目

```bash
# 交互式创建
clipcraft new

# 非交互式创建
clipcraft new --name "春季促销视频" --ratio 16:9 --fps 30 --bg-color black
```

分辨率选项：16:9（1920×1080）、9:16（1080×1920）、1:1（1080×1080）、自定义

**生成项目结构：**
```
my-project/
└── ffclaw.json      # 项目文件（所有状态都在这里）
```

### 3.2 `import` — 导入素材

```bash
clipcraft import video ./素材/产品视频A.mp4
clipcraft import audio ./素材/背景音乐.mp3
clipcraft import image ./素材/logo.png
clipcraft import subtitle ./字幕/产品介绍.srt

# 查看素材库
clipcraft import --list

# 从素材库删除（误导入时清理）
clipcraft import remove v1
clipcraft import clear          # 清空所有素材

# 输出示例：
# 视频 (2):
#   [v1] 产品视频A.mp4  (15s, 1920×1080, 有音频)
#   [v2] 产品视频B.mp4  (20s, 1920×1080, 有音频)
# 图片 (1):
#   [i1] logo.png  (200×200)
# 音频 (1):
#   [a1] 背景音乐.mp3  (3:20)
```

素材自动生成 ID（v1、a1、i1），后续 `timeline add` 时引用这些 ID。

### 3.3 `timeline` — 时间线编辑（核心）

#### 3.3.1 添加素材到时间线

```bash
# 添加视频
clipcraft timeline add video v1
clipcraft timeline add video v2 --start 15          # 从15s开始
clipcraft timeline add video v3 --in 5 --out 12     # 裁剪入出点

# 添加图片（需指定持续时间）
clipcraft timeline add image i1 --duration 5

# 添加音频
clipcraft timeline add audio a1 --loop              # 循环
clipcraft timeline add audio a1 --start 20 --volume 0.5

# 添加文字
clipcraft timeline add text "春日特惠" \
  --start 0 --duration 3 \
  --font "PingFang SC" --size 48 --color "#FFFFFF" \
  --position center
```

#### 3.3.2 时间线查看

```bash
clipcraft timeline show

# 输出：
# ┌────────────────────────────────────────────────────────────────┐
# │ 0s        5s        10s       15s       20s       25s       │
# ├────────────────────────────────────────────────────────────────┤
# │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
# │ [v1: 产品视频A]                              [v2: 产品视频B]   │
# ├────────────────────────────────────────────────────────────────┤
# │ ♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪ │
# │ [a1: 背景音乐 ♫ loop]                                       │
# ├────────────────────────────────────────────────────────────────┤
# │            [文字: 春日特惠]                                     │
# └────────────────────────────────────────────────────────────────┘
# 总时长: 25s
```

#### 3.3.3 裁剪与分割

**所有 timeline 操作统一使用 clip ID（c1、c2...），通过 `timeline show` 查看 ID。**

```bash
# 裁剪视频入出点
clipcraft timeline trim c1 --in 3 --out 10

# 分割视频（在指定时间点切开，返回两个新 clip）
clipcraft timeline split c1 at 8

# 删除片段
clipcraft timeline remove c1

# 移动片段
clipcraft timeline move c1 to 10      # 移动到10s
clipcraft timeline move c1 --offset 5 # 相对移动+5s
```

**JSON 输出示例（所有增删改操作）：**
```json
{"type":"ok","op":"add","clipId":"c1","track":"video","assetId":"v1","start":0,"duration":15.2}
{"type":"ok","op":"trim","clipId":"c1","in":3,"out":10}
{"type":"ok","op":"remove","clipId":"c1"}
```

**错误响应（所有命令统一格式）：**
```json
{"type":"error","code":"ASSET_NOT_FOUND","message":"Asset 'v9' not found in project"}
{"type":"error","code":"CLIP_NOT_FOUND","message":"Clip 'c9' not found in timeline"}
{"type":"error","code":"INVALID_RANGE","message":"--in 5 must be less than --out 3"}
```

#### 3.3.4 转场

```bash
# 在指定两个 clip 之间添加转场
clipcraft timeline add-transition fade --between c1 c2 --duration 1.0

# 默认：最后两个相邻 clip 之间（向下兼容）
clipcraft timeline add-transition zoomright --duration 0.8

# 查看已设置的转场列表
clipcraft timeline transitions list

# 查看可用转场
clipcraft timeline transitions
# 基础: fade, wipe, slide
# 叠化: crossfade, blur
# 特效: zoomright, gridflip, radial, rotate
```

#### 3.3.5 变速、音量与静音

```bash
# 视频加速 2x
clipcraft timeline speed c1 2.0

# 视频慢动作 0.5x
clipcraft timeline speed c1 0.5

# 调整音频音量 (0.0 - 1.0)
clipcraft timeline volume c3 0.8

# 静音（音频轨道）
clipcraft timeline volume c3 0

# 静音视频原声（视频轨道的 clip）
clipcraft timeline mute c1        # 静音 c1 的内嵌音频
clipcraft timeline mute c1 off    # 取消静音

# 音频淡入/淡出（秒数）
clipcraft timeline fade c3 --in 2 --out 3
```

### 3.4 `filter` — 滤镜与调色

```bash
# 查看预设滤镜
clipcraft filter list
# warm_sunshine  暖阳（亮度+8, 饱和度+15, 色温+10）
# cinema         电影（对比度+20, 饱和度-20, 亮度-5）
# fresh          清新（亮度+5, 饱和度+5）
# b_and_w        黑白（去饱和度）

# 应用滤镜到片段
clipcraft filter apply c1 --preset warm_sunshine

# 手动调色（参数范围）
# --brightness  <-100~100>  亮度，0 为原始（正值偏亮）
# --contrast    <-100~100>  对比度
# --saturation  <-100~100>  饱和度（-100 = 黑白）
# --sharpen     <0~100>     锐化
# --blur        <0~100>     模糊
# --temperature <-100~100>  色温（正值偏暖）
clipcraft filter adjust c1 \
  --brightness 10 \
  --contrast 15 \
  --saturation -5 \
  --sharpen 20 \
  --blur 0 \
  --temperature 5

# 重置滤镜
clipcraft filter reset c1

# 创建自定义预设
clipcraft filter create --name "我的调色" \
  --brightness 10 --contrast 15 --saturation -5
```

### 3.5 `text` — 文字与字幕

> **注意**：文字通过 `timeline add text` 添加；text 命令仅处理文字的进阶样式。

```bash
# 文字动画（对已添加的文字 clip 设置动画）
clipcraft text animate c4 --in fadeIn --out slideUp --duration 0.5

# 查看可用动画
clipcraft text animations
# 入场: fadeIn, slideInLeft, slideInRight, zoomIn, bounceIn
# 出场: fadeOut, slideOutLeft, slideOutRight, zoomOut
# 循环: pulse, shake, float

# 花字（渐变颜色，对文字 clip 设置渐变）
clipcraft text gradient c4 \
  --from "#FF6B35" --to "#FFB347" --angle 45

# 添加字幕（从SRT文件，自动拆分为多个 text clip）
clipcraft text subtitle ./字幕/产品介绍.srt \
  --style caption --font "黑体" --size 36
```

### 3.6 `export` — 导出视频

```bash
# 快速导出
clipcraft export --output ./output/春季促销.mp4

# 自定义参数
clipcraft export \
  --output ./output/春季促销.mp4 \
  --quality high \
  --crf 18 \
  --preset slow \
  --audio-bitrate 192k

# 导出封面
clipcraft export thumbnail --time 3 --output ./output/封面.jpg

# 监听进度
clipcraft export --watch
# [████████████████████░░░░] 80%  预计剩余 12s
```

质量选项：high（crf=18）、medium（crf=23）、low（crf=28）
编码预设：slow（最佳压缩）、medium、fast（最快）

### 3.7 `template` — 模板管理

```bash
# 查看本地模板
clipcraft template list

# 使用模板创建项目
clipcraft template use 产品宣传片 \
  --vars title="春日新品" bg_video=v2 logo=i1

# 从当前项目保存为模板
clipcraft template save --name "我的模板" --tag "产品展示"

# 查看模板信息
clipcraft template info 产品宣传片
# 变量:
#   - title (必填): 主标题文字
#   - bg_video (必填): 背景视频
#   - logo (可选): Logo图片
#   - brand_color (可选): 品牌色，默认 #FF4500

# 验证模板
clipcraft template validate ./templates/产品宣传片.cfc.json
```

### 3.8 `preview` — 预览

```bash
# 预览整个时间线（生成低码率预览文件）
clipcraft preview

# 预览某个片段
clipcraft preview --clip v1

# 预览某个时间点
clipcraft preview --time 5

# 预览转场效果
clipcraft preview --transition fade --clip1 v1 --clip2 v2
```

注：preview 使用 `crf=28 preset=ultrafast` 快速导出低码率预览，而非实时预览。

### 3.9 `queue` — 批量渲染

```bash
# 批量渲染（JSONL 数据驱动）
clipcraft queue render 产品宣传片 \
  --data ./products.jsonl \
  --output-dir ./output/ \
  --concurrency 2

# products.jsonl 格式：
# {"title":"产品A","bg_video":"a.mp4","_output":"product-a.mp4"}
# {"title":"产品B","bg_video":"b.mp4","_output":"product-b.mp4"}

# 查看队列状态
clipcraft queue status
# 待处理: 50  |  渲染中: 2  |  完成: 23  |  失败: 0

# 从队列移除任务
clipcraft queue remove <task-id>
```

---

## 4. 数据模型

### 4.1 项目文件 ffclaw.json

```json
{
  "version": "1.0",
  "name": "春季促销视频",
  "ratio": "16:9",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "bgColor": "#000000",
  "assets": {
    "v1": { "type": "video", "path": "./素材/产品视频A.mp4", "duration": 15.2, "hasAudio": true },
    "v2": { "type": "video", "path": "./素材/产品视频B.mp4", "duration": 20.0, "hasAudio": true },
    "a1": { "type": "audio", "path": "./素材/背景音乐.mp3", "duration": 200 },
    "i1": { "type": "image", "path": "./素材/logo.png", "width": 200, "height": 200 }
  },
  "timeline": {
    "video": [
      { "id": "c1", "asset": "v1", "type": "video", "start": 0, "in": 0, "out": 15.2, "speed": 1, "volume": 1.0, "muted": false, "filter": null },
      { "id": "c2", "asset": "v2", "type": "video", "start": 15, "in": 0, "out": 20, "speed": 1, "volume": 1.0, "muted": false, "filter": null },
      { "id": "c5", "asset": "i1", "type": "image", "start": 15, "in": 0, "out": null, "duration": 5, "filter": null }
    ],
    "audio": [
      { "id": "c3", "asset": "a1", "start": 0, "in": 0, "out": null, "loop": true, "volume": 0.8, "fadeIn": 0, "fadeOut": 0 }
    ],
    "text": [
      { "id": "c4", "content": "春日特惠", "start": 5, "duration": 3,
        "font": "PingFang SC", "size": 48, "color": "#FFFFFF",
        "position": { "x": 0.5, "y": 0.7 },
        "animateIn": "fadeIn", "animateOut": "fadeOut" }
    ],
    "transitions": [
      { "between": ["c1", "c2"], "type": "fade", "duration": 1.0 }
    ]
  },
  "filters": {
    "warm_sunshine": { "brightness": 8, "saturation": 15, "temperature": 10 }
  }
}
```

**字段说明：**
- `assets`：素材库，key 为素材 ID，O(1) 查找
- `timeline.video`：视频轨道，**图片作为 `type: "image"` 的 clip 也在此轨道**
- **所有 timeline 操作使用 clip ID（c1、c2...），与 asset ID（v1、a1）是不同概念**
- `video clip`：含 `volume`（原声音量 0-1）、`muted`（是否静音）、`filter`（调色参数对象或 null）
- `audio clip`：含 `in/out`（裁剪范围）、`fadeIn/fadeOut`（淡入淡出秒数）
- `transitions.between`：转场所连接的两个 clip ID 数组 `[前一个, 后一个]`

### 4.2 模板文件 .cfc.json（ClipCraft Template）

```json
{
  "name": "产品宣传片",
  "ratio": "16:9",
  "version": "1.0.0",
  "variables": [
    { "key": "title",       "label": "主标题",   "type": "text",  "required": true },
    { "key": "bg_video",    "label": "背景视频", "type": "video", "required": true },
    { "key": "logo",        "label": "Logo",     "type": "image", "required": false },
    { "key": "brand_color", "label": "品牌色",   "type": "color", "default": "#FF4500" }
  ],
  "timeline": {
    "video": [
      {
        "type": "video",
        "asset": "{{bg_video}}",
        "animations": [{ "in": "fadeIn", "out": "fadeOut" }]
      },
      {
        "type": "image",
        "asset": "{{logo}}",
        "position": { "x": 0.9, "y": 0.1 },
        "scale": 0.15
      }
    ],
    "text": [
      {
        "content": "{{title}}",
        "style": "title",
        "position": { "x": 0.5, "y": 0.7 },
        "animations": [{ "in": "slideInUp", "out": "slideOutDown" }]
      }
    ],
    "transitions": [
      { "at": 0, "type": "fade", "duration": 1.0 }
    ]
  }
}
```

### 4.3 Filter 存储结构

当对 clip 应用滤镜后，`filter` 字段存储展开后的实际参数对象：

```json
{
  "id": "c1",
  "asset": "v1",
  "type": "video",
  "start": 0,
  "filter": {
    "preset": "warm_sunshine",
    "brightness": 8,
    "contrast": 0,
    "saturation": 15,
    "sharpen": 0,
    "blur": 0,
    "temperature": 10
  }
}
```

- `filter apply <preset>` → 展开 preset 参数写入 clip
- `filter adjust` → 覆盖指定字段，保留其余字段
- `filter reset` → 设为 `null`

### 4.4 变量文件格式

**YAML 格式（vars.yaml）：**
```yaml
title: "春日限定特惠"
bg_video: "./素材/spring.mp4"
logo: "./素材/logo.png"
brand_color: "#FF6B35"
```

**JSON 格式（vars.json）：**
```json
{
  "title": "春日限定特惠",
  "bg_video": "./素材/spring.mp4",
  "logo": "./素材/logo.png",
  "brand_color": "#FF6B35"
}
```

### 4.5 批量数据文件（products.jsonl）

```jsonl
{"title":"产品A","bg_video":"a.mp4","logo":"logo-a.png","_output":"product-a.mp4"}
{"title":"产品B","bg_video":"b.mp4","logo":"logo-b.png","_output":"product-b.mp4"}
{"title":"产品C","bg_video":"c.mp4","logo":"logo-c.png","_output":"product-c.mp4"}
```

`_output` 字段指定该次渲染的输出文件名。

---

## 5. 架构设计

### 5.1 目录结构

```
clipcraft/
├── bin/
│   └── clipcraft.js           # CLI 入口（yargs 路由）
├── src/
│   ├── commands/              # 命令层（薄，只做参数解析+输出格式化）
│   │   ├── new.js
│   │   ├── import.js
│   │   ├── timeline.js
│   │   ├── filter.js
│   │   ├── text.js
│   │   ├── export.js
│   │   ├── template.js
│   │   ├── preview.js
│   │   └── queue.js
│   ├── core/                  # 核心业务逻辑（无 UI 依赖，可单测）
│   │   ├── project.js          # ffclaw.json 读写（原子写）、校验
│   │   ├── timeline-model.js   # 多轨时间线纯数据操作
│   │   ├── builder.js          # ★ 多轨时间线 → FFCreator API 翻译层
│   │   ├── asset-store.js     # 素材库：ffprobe 探测 + 持久化
│   │   └── filter-dsl.js      # 滤镜参数 → FFmpeg filtergraph
│   ├── render/
│   │   ├── progress-reporter.js  # 进度事件 → 终端进度条 / JSON
│   │   └── export-runner.js      # 包装 FFCreator.start()
│   ├── template/
│   │   ├── engine.js           # 模板变量替换 {{var}}
│   │   └── validator.js        # 必填变量检查
│   └── utils/
│       ├── output.js           # 统一输出（普通/JSON/Quiet）
│       ├── table.js            # 时间线 ASCII 表格
│       └── id-gen.js          # clip ID 生成（v1/a1/i1...）
├── templates/                 # 内置模板
│   ├── product-showcase.cfc.json
│   ├── slideshow.cfc.json
│   └── subtitle-reel.cfc.json
└── package.json
```

### 5.2 Builder 翻译层（核心难点）

FFCreator 是场景串联模型，ClipCraft 是多轨并行模型。翻译层负责转换：

```
多轨时间线输入
  │
  ▼
步骤1: 收集切割点
  所有 video clip 的 start/end + transition 边界
  │
  ▼
步骤2: 切成 Scene 段
  [0, t1], [t1, t2], [t2, t3] ...
  │
  ▼
步骤3: 每段 Scene 确定可见 clips
  → FFVideo/FFImage 子节点
  → 计算局部入出点 ss/to
  │
  ▼
步骤4: 设置 Scene transition
  │
  ▼
步骤5: 全局音频
  FFCreator.addAudio() 带绝对 start 时间
  │
  ▼
步骤6: 文字分配到各 Scene
  │
  ▼
FFCreator 实例（可调用 .start()）
```

### 5.3 FFCreator 改动（极小）

| 文件 | 改动 | 原因 |
|------|------|------|
| `lib/utils/ffprobe.js` | 标准化返回值字段 | import 需要统一的 duration/width/height/hasAudio |
| `lib/core/synthesis.js` | 透传 FFmpeg filtergraph | filter adjust 需要注入 eq/unsharp 等滤镜 |
| `lib/index.js` | 确认所有 node 类已导出 | builder.js 需要 FFVideo/FFText 等类 |

**均是小改动，可作为 PR 合入 FFCreator 主库。**

### 5.4 数据流

```
CLI 参数 / 模板文件
       │
       ▼
  yargs 解析
       │
       ▼
  Project.load() → ffclaw.json
       │
       ▼
  TimelineModel / AssetStore 操作
       │
       ▼
  TemplateEngine（变量替换）
       │
       ▼
  Builder（TimelineModel → FFCreator 实例）
       │
       ▼
  ExportRunner（FFCreator.start() + 进度上报）
       │
       ▼
  输出视频文件 + JSON 进度流
```

---

## 6. 与 AI Agent 集成

### 6.1 JSON 输出模式

所有命令支持 `--json`，输出机器可解析格式：

```bash
clipcraft timeline show --json
# {
#   "duration": 25,
#   "tracks": {
#     "video": [{"id": "c1", "asset": "v1", "start": 0, "duration": 15}],
#     "audio": [{"id": "c3", "asset": "a1", "start": 0, "loop": true, "volume": 0.8}],
#     "text": [{"id": "c4", "content": "春日特惠", "start": 5, "duration": 3}]
#   }
# }

clipcraft export --output out.mp4 --json
# {"type":"start","output":"./out.mp4"}
# {"type":"progress","percent":45,"frame":1350,"totalFrames":3000,"eta":"40s"}
# {"type":"complete","output":"./out.mp4","duration":25,"size":"12.3MB"}

# queue status --json
# {"type":"queue_status","total":50,"pending":25,"rendering":2,"done":23,"failed":0,
#  "tasks":[{"id":"t1","status":"done","output":"product-a.mp4"},{"id":"t2","status":"rendering","percent":60}]}
```

### 6.2 MCP Tool 封装

```typescript
const clipcraftRenderTool = {
  name: "clipcraft_render",
  description: "渲染 ClipCraft 模板为 MP4",
  inputSchema: {
    type: "object",
    properties: {
      template: { type: "string", description: ".cfc.json 模板路径或内置模板名" },
      vars:     { type: "object", description: "模板变量" },
      output:   { type: "string", description: "输出路径" }
    },
    required: ["template", "vars", "output"]
  }
};

const clipcraftClipTool = {
  name: "clipcraft_clip",
  description: "从素材直接生成视频",
  inputSchema: {
    type: "object",
    properties: {
      inputs:     { type: "array", items: { type: "string" } },
      transitions:{ type: "array" },
      output:     { type: "string" },
      width:      { type: "number", default: 1920 },
      height:     { type: "number", default: 1080 },
      fps:        { type: "number", default: 30 }
    },
    required: ["inputs", "output"]
  }
};
```

---

## 7. 典型工作流

### 工作流 1：快速剪辑（3分钟）

```bash
# 1. 新建项目
clipcraft new --name "产品A视频" --ratio 16:9

# 2. 导入素材
clipcraft import video ./素材/产品A.mp4
clipcraft import audio ./素材/背景音乐.mp3
clipcraft import image ./素材/logo.png

# 3. 时间线编辑
clipcraft timeline add video v1
clipcraft timeline add audio a1 --loop
clipcraft timeline add image i1 --duration 5 --position right-bottom
clipcraft timeline add text "新品上市" --style title --duration 3
clipcraft timeline add-transition fade --between c1 c2 --duration 0.8

# 4. 导出
clipcraft export --output ./output/产品A.mp4 --quality high
```

### 工作流 2：批量生成（50个产品视频）

```bash
# 1. 选择模板
clipcraft template use 产品宣传片

# 2. 批量渲染
clipcraft queue render 产品宣传片 \
  --data ./products.jsonl \
  --output-dir ./批量输出/ \
  --concurrency 3

# 3. 监控
clipcraft queue status
```

### 工作流 3：Agent 驱动

```
用户: 帮我把 products/ 目录下的所有产品视频生成促销视频

Agent 执行步骤:
1. Read products/ → 获取文件列表
2. clipcraft template list → 选择"产品宣传片"模板
3. clipcraft template info 产品宣传片 → 获取变量列表
4. 生成 products.jsonl（每个产品一行）
5. clipcraft queue render 产品宣传片 --data products.jsonl --concurrency 3 --json
6. 解析 JSON 进度流，汇报完成情况
```

---

## 8. 迭代路线图

### P0 — MVP（能跑通最简工作流）

1. bin/clipcraft.js + yargs 骨架
2. src/core/project.js（new 命令可用）
3. src/core/asset-store.js（import 命令可用）
4. src/core/timeline-model.js（timeline add/show 可用）
5. src/core/builder.js（仅支持单 video clip + 单 audio clip）
6. src/render/export-runner.js（export 命令可用）
7. src/utils/output.js（--json 模式）

**验收标准**：工作流 1 可以端到端跑通。

### P1 — 核心剪辑功能

8. timeline trim / split / move
9. timeline add-transition（映射 FFCreator shader）
10. timeline add text（FFText + 动画）
11. timeline speed / volume（FFmpeg 参数）
12. timeline show（ASCII 时间线渲染）
13. 多 video clip 拼接（builder.js 多 Scene 生成）

### P2 — 滤镜与文字

14. filter-dsl.js（滤镜 DSL）
15. filter list / apply / adjust / reset
16. filter create（自定义预设）
17. text gradient（渐变色文字）
18. synthesis.js filtergraph 透传

### P3 — 模板与批量

19. template engine（变量替换）
20. template save / use / list / info / validate
21. queue render（基于 FFCreatorCenter）
22. queue status（进度持久化）

### P4 — 体验打磨

23. preview 命令（ultrafast 预览）
24. export --watch 实时进度条
25. 交互式 new（inquirer.js）
26. 错误提示友好化

### P5 — 高级功能

27. 关键帧动画
28. 画中画（多视频同屏）
29. 语音转字幕（ASR）

---

## 9. 关键技术决策

| 决策点 | 方案 | 理由 |
|-------|------|------|
| CLI 框架 | yargs | 子命令嵌套支持好，文档完善 |
| 交互式提示 | inquirer | 生态成熟 |
| 进度条 | cli-progress | 支持 ETA，比 ora 更适合视频渲染 |
| 项目文件写入 | 原子写（tmp → rename） | 防止程序崩溃导致 JSON 损坏 |
| 滤镜实现 | FFmpeg filtergraph | 对 FFCreator 侵入最小，FFmpeg 能力极强 |
| 时间线翻译 | builder.js 独立层 | 不改 FFCreator 内核，保持库稳定性 |
| 音频 offset | FFCreator.addAudio({ start }) | FFCreator 已支持音频 start 偏移 |
| 模板引擎 | 手写替换 | 仅有 {{var}} 一种语法，无需重型库 |
| ID 生成 | v1/a1/i1/t1 前缀 | 按类型分类，用户可读可预测 |

---

## 10. 与同类项目对比

| 项目 | 类型 | 模板系统 | 批量渲染 | Agent 友好 | 学习成本 |
|------|------|---------|---------|------------|---------|
| **ClipCraft** | CLI + FFCreator | ✅ CFC JSON | ✅ JSONL | ✅ --json | 低（剪映用户） |
| LosslessCut | GUI（Electron） | ❌ | ❌ | ❌ | 中（FFmpeg概念） |
| Remotion | React代码 | ✅ JSX | ✅ Lambda | ✅ API | 高（需写React） |
| FFmpeg | CLI | ❌ | ❌ | ✅ | 极高（参数复杂） |
| digitalsamba/toolkit | CLI + FFmpeg | ✅ | ✅ | ✅ | 中 |

**ClipCraft 的差异化**：最面向剪映用户的 CLI 工具，模板系统简单直观，Agent 集成原生。

---

## 11. 版本约定

- 项目文件：`"version": "1.0"`（主版本.次版本）
- 模板文件：`"version": "1.0.0"`（语义化版本）
- 两者独立演进，ClipCraft 启动时检查兼容性。

---

## 12. 缺失功能（暂不支持）

- 关键帧动画（精细属性变化控制）
- 画中画（多视频同屏叠加）
- 绿幕/色度键
- 视频降噪
- 封面编辑（多封面选择）
- 片尾滚动字幕
- 语音转字幕（ASR）
- AI 配音
