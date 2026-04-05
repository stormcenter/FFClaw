# FFClaw

> 剪映是 GUI，FFClaw 是 CLI 版剪映。基于 FFCreator 的命令行视频剪辑工具，面向会用剪映的剪辑师，无需写代码。

---

## 目录

- [简介](#简介)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令参考](#命令参考)
  - [new — 新建项目](#new--新建项目)
  - [import — 导入素材](#import--导入素材)
  - [timeline — 时间线编辑](#timeline--时间线编辑)
  - [filter — 滤镜调色](#filter--滤镜调色)
  - [text — 文字字幕](#text--文字字幕)
  - [export — 导出视频](#export--导出视频)
  - [template — 模板管理](#template--模板管理)
  - [preview — 草稿预览](#preview--草稿预览)
  - [queue — 批量渲染](#queue--批量渲染)
- [滤镜 DSL](#滤镜-dsl)
- [模板变量系统](#模板变量系统)
- [项目文件 ffclaw.json](#项目文件-ffclawjson)
- [架构说明](#架构说明)
- [开发与测试](#开发与测试)

---

## 简介

**FFClaw** 将 FFCreator 的 WebGL 渲染能力封装为剪映风格的 CLI 接口，支持：

- 视频剪辑：多轨时间线、裁剪、分割、移动、变速
- 音频控制：音量、静音、淡入淡出、循环
- 文字字幕：字体、颜色、入场/出场动画
- 滤镜调色：DSL 表达式或预设（brightness、contrast、saturation…）
- 模板系统：`{{变量}}` 驱动批量生产
- `--json` 输出模式：全程可供 AI Agent 解析

## 安装

**前置依赖**

```bash
node >= 18.0.0
ffmpeg  # 需附带 ffprobe
```

**克隆并安装**

```bash
git clone --recursive https://github.com/your-repo/FFClaw.git
cd FFClaw
npm install          # postinstall 会自动安装 FFCreator 的依赖
```

**全局注册（可选）**

```bash
npm link
ffclaw --help
```

---

## 快速开始

```bash
# 1. 新建项目
ffclaw new --name "春季促销" --ratio 16:9 --fps 30

# 2. 导入素材
ffclaw import video ./素材/产品.mp4       # → v1
ffclaw import audio ./素材/bgm.mp3        # → a1
ffclaw import image ./素材/logo.png       # → i1

# 3. 编排时间线
ffclaw timeline add video v1              # → c1，从 0s 开始
ffclaw timeline add audio a1 --loop       # → c2，循环播放
ffclaw timeline add text "春日特惠" --start 2 --duration 3 --size 48 --color "#FFFFFF"

# 4. 预览
ffclaw timeline show

# 5. 导出
ffclaw export --output ./output/春季促销.mp4
```

---

## 命令参考

所有命令均支持以下全局选项：

| 选项 | 说明 |
|------|------|
| `--project <dir>` | 指定项目目录（默认当前目录） |
| `--json` | JSON 输出（供 Agent 解析） |
| `--quiet` | 静默模式 |
| `--ffmpeg <path>` | FFmpeg 可执行文件目录 |

### new — 新建项目

```bash
# 交互式创建
ffclaw new

# 非交互式
ffclaw new --name "项目名" --ratio 16:9 --fps 30 --bg-color "#000000"
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--name` | 必填 | 项目名称 |
| `--ratio` | `16:9` | 分辨率比例（`16:9` / `9:16` / `1:1` / `4:3`） |
| `--fps` | `30` | 帧率 |
| `--bg-color` | `#000000` | 背景颜色 |

分辨率对照：`16:9` → 1920×1080，`9:16` → 1080×1920，`1:1` → 1080×1080，`4:3` → 1440×1080

生成 `ffclaw.json` 到当前目录（或 `--project` 指定目录）。

---

### import — 导入素材

```bash
ffclaw import video ./产品.mp4       # 视频 → v1
ffclaw import audio ./bgm.mp3        # 音频 → a1
ffclaw import image ./logo.png       # 图片 → i1
ffclaw import subtitle ./字幕.srt    # 字幕 → s1

ffclaw import --list                 # 查看素材库
ffclaw import remove v1             # 删除素材
ffclaw import clear                  # 清空全部
```

- 素材 ID 按类型自动分配：视频 `v1/v2…`，音频 `a1/a2…`，图片 `i1/i2…`，字幕 `s1/s2…`
- 视频和音频自动通过 `ffprobe` 探测 duration/分辨率/音轨
- 字幕仅记录路径，不做探测

---

### timeline — 时间线编辑

#### 添加素材到时间线

```bash
# 视频
ffclaw timeline add video v1
ffclaw timeline add video v2 --start 15          # 从 15s 开始
ffclaw timeline add video v3 --in 5 --out 12     # 裁剪入出点

# 图片（需指定持续时间）
ffclaw timeline add image i1 --duration 5

# 音频
ffclaw timeline add audio a1 --loop
ffclaw timeline add audio a1 --start 20 --volume 0.5

# 文字
ffclaw timeline add text "春日特惠" \
  --start 0 --duration 3 \
  --font "PingFang SC" --size 48 --color "#FFFFFF" \
  --position center
```

每个 clip 分配一个 ID（`c1`、`c2`…），后续所有操作通过 clip ID 引用。

#### 查看时间线

```bash
ffclaw timeline show

# ┌────────────────────────────────────────────────────────────┐
# │ 0s        5s        10s       15s       20s       25s     │
# ├────────────────────────────────────────────────────────────┤
# │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
# │ [c1: v1 产品视频A]                [c2: v2 产品视频B]       │
# ├────────────────────────────────────────────────────────────┤
# │ ♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪♪  │
# │ [c3: a1 背景音乐 ♫ loop]                                   │
# ├────────────────────────────────────────────────────────────┤
# │          [c4: 春日特惠]                                     │
# └────────────────────────────────────────────────────────────┘
# 总时长: 25s
```

#### 裁剪与分割

```bash
ffclaw timeline trim c1 --in 3 --out 10    # 设置入出点
ffclaw timeline split c1 at 8              # 在 8s 切开，返回两个 clip
ffclaw timeline remove c1                  # 删除片段
ffclaw timeline move c1 to 10              # 移动到 10s
```

#### 转场

```bash
# 在两个相邻 clip 之间添加转场
ffclaw timeline add-transition fade --between c1 c2 --duration 1.0
ffclaw timeline add-transition zoomright --duration 0.8

# 查看可用转场
ffclaw timeline transitions
# 基础: fade, wipe, slide, dissolve
# 叠化: crossfade, blur
# 特效: zoomright, gridflip, radial, rotate
```

#### 变速、音量与静音

```bash
ffclaw timeline speed c1 2.0          # 2x 加速
ffclaw timeline speed c1 0.5          # 0.5x 慢动作
ffclaw timeline volume c3 0.8         # 设置音量（0.0–1.0）
ffclaw timeline mute c1               # 静音视频原声
ffclaw timeline mute c1 off           # 取消静音
ffclaw timeline fade c3 --in 2 --out 3  # 音频淡入 2s / 淡出 3s
```

#### JSON 输出格式

使用 `--json` 时所有操作返回结构化结果，可直接供 AI Agent 解析：

```json
{"type":"ok","op":"add","clipId":"c1","track":"video","assetId":"v1","start":0,"duration":15.2}
{"type":"ok","op":"trim","clipId":"c1","in":3,"out":10}
{"type":"ok","op":"split","left":"c1","right":"c5","at":8}
```

错误统一格式：

```json
{"type":"error","code":"ASSET_NOT_FOUND","message":"Asset 'v9' not found in project"}
{"type":"error","code":"CLIP_NOT_FOUND","message":"Clip 'c9' not found in timeline"}
{"type":"error","code":"INVALID_RANGE","message":"Split time 99s is outside clip range [0s, 15.2s]"}
```

---

### filter — 滤镜调色

```bash
# 查看可用滤镜
ffclaw filter list

# 应用预设
ffclaw filter apply c1 --preset warm_sunshine

# 手动调色
ffclaw filter adjust c1 \
  --brightness 10 \
  --contrast 15 \
  --saturation -5 \
  --sharpen 20

# 重置
ffclaw filter reset c1

# 保存为自定义预设
ffclaw filter create --name "我的调色" --brightness 10 --saturation -5
```

滤镜参数也可通过 DSL 表达式直接传入，详见[滤镜 DSL](#滤镜-dsl)。

---

### text — 文字字幕

```bash
# 对已添加的文字 clip 设置动画
ffclaw text animate c4 --in fadeIn --out slideUp --duration 0.5

# 查看可用动画
ffclaw text animations
# 入场: fadeIn, slideInLeft, slideInRight, zoomIn, bounceIn
# 出场: fadeOut, slideOutLeft, slideOutRight, zoomOut
# 循环: pulse, shake, float

# 设置渐变颜色
ffclaw text gradient c4 --from "#FF6B35" --to "#FFB347" --angle 45

# 从 SRT 文件批量导入字幕（自动拆分为多个 text clip）
ffclaw text subtitle ./字幕.srt --style caption --font "黑体" --size 36
```

---

### export — 导出视频

```bash
# 快速导出
ffclaw export --output ./output/out.mp4

# 自定义编码参数
ffclaw export \
  --output ./output/out.mp4 \
  --quality high \
  --crf 18 \
  --preset slow \
  --audio-bitrate 192k

# 导出封面截图
ffclaw export thumbnail --time 3 --output ./output/cover.jpg

# 显示实时进度
ffclaw export --watch
# [████████████████████░░░░] 80%  预计剩余 12s
```

质量预设：`high`（crf=18）、`medium`（crf=23）、`low`（crf=28）
编码速度：`slow`（最佳压缩）、`medium`、`fast`

---

### template — 模板管理

```bash
# 列出可用模板
ffclaw template list

# 用模板创建项目
ffclaw template use 产品宣传片 \
  --vars title="春日新品" bg_video=v2 logo=i1

# 将当前项目保存为模板
ffclaw template save --name "我的模板" --tag "产品展示"

# 查看模板变量说明
ffclaw template info 产品宣传片

# 验证模板文件
ffclaw template validate ./templates/产品宣传片.cfc.json
```

---

### preview — 草稿预览

```bash
ffclaw preview                          # 预览整条时间线
ffclaw preview --clip v1                # 预览某个片段
ffclaw preview --time 5                 # 预览某个时间点的帧
ffclaw preview --transition fade --clip1 v1 --clip2 v2   # 预览转场效果
```

> preview 使用 `crf=28 preset=ultrafast` 快速生成低码率预览文件，而非实时预览。

---

### queue — 批量渲染

```bash
# 数据驱动批量渲染（JSONL 格式）
ffclaw queue render 产品宣传片 \
  --data ./products.jsonl \
  --output-dir ./output/ \
  --concurrency 2

# 查看队列状态
ffclaw queue status
# 待处理: 50  |  渲染中: 2  |  完成: 23  |  失败: 0

# 从队列移除任务
ffclaw queue remove <task-id>
```

`products.jsonl` 格式（每行一个 JSON 对象，`_output` 指定输出文件名）：

```jsonl
{"title":"产品A","bg_video":"a.mp4","logo":"logo-a.png","_output":"product-a.mp4"}
{"title":"产品B","bg_video":"b.mp4","logo":"logo-b.png","_output":"product-b.mp4"}
```

---

## 滤镜 DSL

滤镜通过管道符 `|` 串联多个效果，编译为 FFmpeg `-vf` 滤镜图：

```bash
# 基本语法
"filterName=value|filterName=key1=v1:key2=v2|flagFilter"

# 示例
ffclaw filter adjust c1 --dsl "brightness=1.2|contrast=1.1|unsharp"
ffclaw filter adjust c1 --dsl "eq=brightness=0.3:saturation=1.5"
ffclaw filter adjust c1 --dsl "flip|grayscale"
```

**支持的滤镜：**

| 类别 | 滤镜名 |
|------|--------|
| 亮度/色彩 | `brightness`, `contrast`, `saturation`, `gamma`, `hue`, `eq` |
| 几何变换 | `scale`, `crop`, `pad`, `flip`, `flop`, `rotate` |
| 模糊/锐化 | `blur`, `sharpen`, `unsharp`, `denoise`, `hqdn3d` |
| 风格效果 | `grayscale`, `sepia`, `invert`, `Noir`, `Vintage`, `edgedetect` |
| 时间/帧率 | `fps`, `slow`, `fast`, `reverse`, `setpts`, `atempo` |
| 音频 | `volume`, `amix`, `acompressor` |

---

## 模板变量系统

模板文件（`.cfc.json`）中使用 Mustache 风格变量，支持过滤器、条件块和循环：

```
{{title}}                    # 简单替换
{{title|uppercase}}          # 过滤器：大写
{{title|default:未命名}}     # 过滤器：默认值
{{project.name}}             # 点路径
{{ENV.USER}}                 # 环境变量

{{#if logo}}                 # 条件块
  <logo content>
{{/if}}

{{#each items}}              # 循环
  {{this}}
{{/each}}
```

**支持的过滤器：**`uppercase`, `lowercase`, `capitalize`, `trim`, `slug`, `default`, `replace`, `json`, `number`, `round`, `floor`, `ceil`, `ftime`, `date`

变量末尾加 `?` 表示可选：`{{logo?}}`（缺失时不报错）。

---

## 项目文件 ffclaw.json

所有项目状态存储在 `ffclaw.json`，使用原子写入保证崩溃安全：

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
    "v1": { "type": "video", "path": "./素材/产品.mp4", "duration": 15.2, "width": 1920, "height": 1080, "hasAudio": true },
    "a1": { "type": "audio", "path": "./素材/bgm.mp3", "duration": 200 },
    "i1": { "type": "image", "path": "./素材/logo.png", "width": 200, "height": 200 }
  },
  "timeline": {
    "video": [
      { "id": "c1", "asset": "v1", "type": "video", "start": 0, "in": 0, "out": 15.2, "volume": 1.0, "muted": false, "filter": null },
      { "id": "c3", "asset": "i1", "type": "image", "start": 10, "duration": 5 }
    ],
    "audio": [
      { "id": "c2", "asset": "a1", "type": "audio", "start": 0, "loop": true, "volume": 0.8, "fadeIn": 2, "fadeOut": 3 }
    ],
    "text": [
      { "id": "c4", "type": "text", "content": "春日特惠", "start": 2, "duration": 3,
        "font": "PingFang SC", "fontSize": 48, "color": "#FFFFFF", "animateIn": "fadeIn", "animateOut": "fadeOut" }
    ],
    "transitions": [
      { "id": "t1", "between": ["c1", "c3"], "type": "fade", "duration": 1.0 }
    ]
  },
  "filters": {}
}
```

**概念区分：**
- **Asset ID**（`v1`/`a1`/`i1`）：素材库标识，通过 `import` 分配
- **Clip ID**（`c1`/`c2`…）：时间线上的片段标识，通过 `timeline add` 分配
- 同一个素材可多次添加到时间线，每次产生不同的 clip ID

---

## 架构说明

```
ffclaw/
├── bin/ffclaw.js           # CLI 入口（yargs 路由）
├── src/
│   ├── commands/              # 命令层：参数解析 + 输出格式化
│   ├── core/
│   │   ├── project.js         # ffclaw.json 原子读写 + 校验
│   │   ├── timeline-model.js  # 多轨时间线纯数据操作（可独立单测）
│   │   ├── builder.js         # ★ 多轨时间线 → FFCreator API 翻译层
│   │   ├── asset-store.js     # ffprobe 探测 + 素材持久化
│   │   └── filter-dsl.js      # 滤镜 DSL → FFmpeg filtergraph
│   ├── render/
│   │   ├── progress-reporter.js  # 进度事件 → 终端进度条 / JSON
│   │   └── export-runner.js      # 包装 FFCreator.start()
│   ├── template/
│   │   ├── engine.js           # {{var}} 模板渲染引擎
│   │   └── validator.js        # 必填变量检查
│   └── utils/
│       ├── output.js           # 统一输出（普通/JSON/Quiet）
│       ├── table.js            # 时间线 ASCII 表格渲染
│       └── id-gen.js           # Asset ID / Clip ID 生成
├── vendor/FFCreator/           # FFCreator git submodule
└── test/
    ├── unit/                   # 核心模块单元测试（89 个用例）
    └── fixtures/               # 测试素材
```

**Builder 翻译层**（`src/core/builder.js`）是核心难点：FFCreator 是 Scene 串联模型，FFClaw 是多轨并行模型。Builder 将多轨时间线切分为 FFCreator 的 Scene 序列：

1. 收集所有切割点（clip start/end + transition 边界）
2. 每段切割点区间对应一个 Scene
3. 确定每个 Scene 内可见的 clips
4. 设置 Scene 间的 transition
5. 全局附加音频轨和文字层

---

## 开发与测试

```bash
# 运行全部单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行所有测试
npm test

# Lint
npm run lint

# CLI 调试
node bin/ffclaw.js --help
node bin/ffclaw.js timeline --help
```

**测试覆盖目标：**
- 核心模块（`src/core/*`）：≥ 90% 行覆盖率
- 命令层（`src/commands/*`）：≥ 80% 行覆盖率

**与 FFCreator 的关系：**

```
FFClaw/src/           ← 纯新增，不修改 FFCreator 代码
FFClaw/vendor/FFCreator  ← FFCreator 作为 git submodule
```

如需修改 FFCreator，在 `vendor/FFCreator/` 内直接操作并提交，submodule 会记录新的 commit 引用。

## License

MIT
