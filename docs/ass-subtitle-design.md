# ASS 字幕渲染能力设计文档

## 1. 技术方案

### 1.1 渲染链路

FFClaw 当前使用 FFmpeg `drawtext` 滤镜渲染文字。ASS 字幕升级方案改为：

```
timeline TextClip → ASS 生成器 → .ass 文件 → FFmpeg subtitles/ass 滤镜（libass）→ 烧录进输出视频
```

核心滤镜：
```
ffmpeg -i input.mp4 -vf "ass=subtitle.ass" output.mp4
```

或者使用 `subtitles` 滤镜（功能相同，但支持字体目录参数）：
```
ffmpeg -i input.mp4 \
  -vf "subtitles=subtitle.ass:fontsdir=/path/to/fonts" \
  output.mp4
```

### 1.2 为什么用 ASS 而不是 drawtext

| 能力 | drawtext | ASS/libass |
|------|----------|------------|
| 逐帧动画（移动/缩放/旋转） | 困难，需手写复杂 filter | 原生支持 `\move` `\t()` tag |
| 卡拉OK逐字变色 | 不支持 | 原生 `\k` tag |
| 描边/阴影/模糊 | 有限 | 完整样式控制 |
| 多行/换行 | 困难 | 原生 |
| 字体嵌入 | 需 fontconfig | fontsdir 参数直接指定 |
| 扩展性 | 每个动画需改 filter 生成代码 | 动画库只需输出不同 ASS tag |

### 1.3 ASS 文件结构

```
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, ...
Style: Default,Source Han Sans SC,60,&H00FFFFFF,...

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.00,0:00:05.00,Default,,0,0,0,,{\fad(300,300)}Hello World
```

### 1.4 libass 可用性检查

渲染前检测 FFmpeg 是否编译了 libass：
```bash
ffmpeg -filters 2>/dev/null | grep -q 'subtitles\|ass'
```

---

## 2. 内置字体方案

### 2.1 字体选择原则

- 开源协议（OFL / Apache 2.0），可商用
- 同时覆盖中文（简体）+ 英文
- 文件体积合理（单字重 ≤ 15 MB）

### 2.2 内置字体列表

| 用途 | 字体名 | 字重 | 文件名 | 来源 |
|------|--------|------|--------|------|
| 默认无衬线·中文（字幕/标题） | Noto Sans CJK SC（即思源黑体） | Regular | NotoSansCJKsc-Regular.otf | Google Fonts / GitHub |
| 粗体强调·中文 | Noto Sans CJK SC | Bold | NotoSansCJKsc-Bold.otf | Google Fonts / GitHub |
| 衬线·中文（标题/艺术字） | Noto Serif CJK SC（即思源宋体） | Regular | NotoSerifCJKsc-Regular.otf | Google Fonts / GitHub |
| 默认无衬线·英文 fallback | Roboto | Regular | Roboto-Regular.ttf | Google Fonts |
| 粗体·英文 fallback | Roboto | Bold | Roboto-Bold.ttf | Google Fonts |

字体存放目录：`assets/fonts/`

> **注：** Adobe 官方思源字体（`source-han-sans`）在 GitHub 上只发布压缩包（.zip / .tar.gz），没有单文件直链，不能用 curl 直接下载 .otf。  
> 本项目统一使用 Google 发行的同源字体（Noto CJK），通过 GitHub Releases 可获取单文件直链，下载后在 ASS 中按实际字体名引用即可。

### 2.3 字体下载命令

下载逻辑集中在 `scripts/download-fonts.js`，以下为等效的 curl 命令（URL 均经过验证可用）：

```bash
mkdir -p assets/fonts

# Noto Sans CJK SC Regular（~17 MB）— 中文默认无衬线
curl -L -o assets/fonts/NotoSansCJKsc-Regular.otf \
  "https://github.com/googlefonts/noto-cjk/releases/download/Sans2.004/09_NotoSansCJK-OTF-VF.zip" 
# ↑ 注意：noto-cjk 较新版本以 Variable Font 打包，需解压。
# 如需单文件 OTF，使用 2.001 版本的直链（已验证）：
curl -L -o assets/fonts/NotoSansCJKsc-Regular.otf \
  "https://github.com/googlefonts/noto-cjk/raw/NotoSansV2.001/NotoSansCJKsc-Regular.otf"

# Noto Sans CJK SC Bold（~17 MB）
curl -L -o assets/fonts/NotoSansCJKsc-Bold.otf \
  "https://github.com/googlefonts/noto-cjk/raw/NotoSansV2.001/NotoSansCJKsc-Bold.otf"

# Noto Serif CJK SC Regular（~17 MB）— 中文衬线
curl -L -o assets/fonts/NotoSerifCJKsc-Regular.otf \
  "https://github.com/googlefonts/noto-cjk/raw/NotoSerifV1.001/NotoSerifCJKsc-Regular.otf"

# Roboto Regular（~140 KB）— 英文 fallback
curl -L -o assets/fonts/Roboto-Regular.ttf \
  "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf"

# Roboto Bold（~140 KB）
curl -L -o assets/fonts/Roboto-Bold.ttf \
  "https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Bold.ttf"
```

> **维护说明：** 上述 URL 锁定到具体 tag（`NotoSansV2.001` / `NotoSerifV1.001` / `main`），不会因上游重命名失效。  
> 如需升级字体版本，在 `scripts/download-fonts.js` 中统一更新 URL 常量即可。  
> 建议在 `package.json` 中添加 `postinstall` 钩子：`"postinstall": "node scripts/download-fonts.js"`。

### 2.4 字体别名映射

在 `src/ass/fonts.js` 中维护用户友好别名，并根据内容自动选择字体：

```js
export const FONT_ALIASES = {
  'sans':        'Noto Sans CJK SC',   // 中文默认，含 CJK 全字符
  'serif':       'Noto Serif CJK SC',
  'mono':        'Noto Sans Mono CJK SC',
  'sans-latin':  'Roboto',             // 英文专用
  // 用户可通过 --font 传完整字体名绕过别名
};

export const DEFAULT_FONT_CJK   = 'sans';        // 含中文字符时使用
export const DEFAULT_FONT_LATIN = 'sans-latin';  // 纯 ASCII 内容时使用
export const FONTS_DIR = path.resolve(PROJECT_ROOT, 'assets/fonts');

/**
 * 根据文本内容自动选择字体别名。
 * 若 text 中所有字符均在 ASCII 范围内（0x00–0x7F），使用英文字体；否则使用中文字体。
 *
 * @param {string} text
 * @param {string} [userFont]  用户显式指定的字体别名或全名，优先级最高
 * @returns {string}  解析后的字体全名（供 ASS Style 使用）
 */
export function resolveFont(text, userFont) {
  if (userFont) return FONT_ALIASES[userFont] ?? userFont;
  const isAsciiOnly = /^[\x00-\x7F]*$/.test(text);
  const alias = isAsciiOnly ? DEFAULT_FONT_LATIN : DEFAULT_FONT_CJK;
  return FONT_ALIASES[alias];
}
```

---

## 3. ASS 动画风格库

### 3.1 预设列表

| 风格名 | 描述 | ASS Tag 核心 |
|--------|------|-------------|
| `fade` | 淡入淡出（默认） | `\fad(inMs,outMs)` |
| `fade-in` | 仅淡入 | `\fad(inMs,0)` |
| `fade-out` | 仅淡出 | `\fad(0,outMs)` |
| `slide-up` | 从下方滑入 | `\move(x,y+offset,x,y)` + `\fad` |
| `slide-down` | 从上方滑入 | `\move(x,y-offset,x,y)` + `\fad` |
| `slide-left` | 从右方滑入 | `\move(x+offset,y,x,y)` + `\fad` |
| `slide-right` | 从左方滑入 | `\move(x-offset,y,x,y)` + `\fad` |
| `zoom-in` | 放大出现 | `\t(\fscx0\fscy0,\fscx100\fscy100)` + `\fad` |
| `zoom-out` | 缩小消失 | `\t(\fscx100\fscy100,\fscx0\fscy0)` |
| `typewriter` | 逐字打字机（charDelay 默认 50ms/字符） | 每字符独立 Dialogue + `\fad(0,0)` |
| `shake` | 抖动（震动感） | 多帧 `\move` 微偏移序列 |
| `bounce` | 弹跳入场 | `\move` 缓动曲线（超过目标后回弹） |
| `karaoke` | 卡拉OK逐字高亮 | `\k<duration>` 逐词 tag |
| `glow` | 发光（光晕脉冲） | `\t(\blur0,\blur8,\blur0)` |
| `none` | 无动画 | 无额外 tag |

### 3.2 动画风格定义结构

每个动画风格是一个纯函数，接受标准化参数，返回 ASS 行内 tag 字符串。

```js
// src/ass/animations/fade.js
/**
 * @param {AnimationContext} ctx
 * @returns {string}  ASS inline override tags (without outer {})
 */
export function fade({ inDuration, outDuration }) {
  const i = Math.round(inDuration * 1000);
  const o = Math.round(outDuration * 1000);
  return `\\fad(${i},${o})`;
}

export const meta = {
  name: 'fade',
  description: '淡入淡出',
  params: {
    inDuration:  { type: 'number', default: 0.4, description: '淡入时长（秒）' },
    outDuration: { type: 'number', default: 0.4, description: '淡出时长（秒）' },
  },
};
```

#### typewriter 动画说明

`typewriter` 将每个字符拆分为独立 Dialogue 行，按 `charDelay` 间隔依次出现：

```js
// src/ass/animations/typewriter.js
export const meta = {
  name: 'typewriter',
  params: {
    charDelay: { type: 'number', default: 50, description: '每字符延迟（毫秒），默认 50ms/字符' },
  },
};

/**
 * 截断逻辑：
 * - 所有字符显示完毕所需时间 = chars.length * charDelay（ms）
 * - 若该值超过 clip.duration * 1000，则按 duration 截断，超出部分字符不渲染。
 * - 截断时不报错，但会在 ASS 生成器中以 warning 级别输出提示：
 *   "typewriter: text truncated (N chars dropped, increase duration or reduce charDelay)"
 */
```

### 3.3 AnimationContext 类型

```js
/**
 * @typedef {object} AnimationContext
 * @property {number} inDuration      入场动画时长（秒），来自 clip.animateInDuration
 * @property {number} outDuration     出场动画时长（秒）
 * @property {number} clipDuration    整段字幕时长
 * @property {number} playResX        视频宽度（像素）
 * @property {number} playResY        视频高度（像素）
 * @property {number} x               字幕中心 X 坐标
 * @property {number} y               字幕中心 Y 坐标
 * @property {string} text            文字内容
 * @property {Record<string,any>} params  动画额外参数（用户可覆盖默认值）
 */
```

### 3.4 动画注册表

```js
// src/ass/animations/index.js
import { fade, meta as fadeMeta }           from './fade.js';
import { slideUp, meta as slideUpMeta }     from './slide-up.js';
// ... 其他导入

const registry = new Map();

export function registerAnimation(fn, meta) {
  registry.set(meta.name, { fn, meta });
}

// 内置注册
registerAnimation(fade, fadeMeta);
registerAnimation(slideUp, slideUpMeta);
// ...

export function getAnimation(name) {
  return registry.get(name);
}

export function listAnimations() {
  return [...registry.values()].map(({ meta }) => meta);
}
```

用户项目可在 `.ffclawrc.js` 中注册自定义动画：
```js
import { registerAnimation } from 'ffclaw/ass/animations';
registerAnimation(myCustomFn, myMeta);
```

---

## 4. CLI 命令设计

### 4.1 新增/扩展命令

#### `ffclaw text add`（扩展现有命令）

新增选项：

```
--animation <name>         动画风格（默认 fade）
--animate-in-duration <s>  入场动画时长，默认 0.4
--animate-out-duration <s> 出场动画时长，默认 0.4
--font <alias|fullname>    字体（sans / serif / mono 或完整字体名）
--outline <n>              描边粗细（像素，默认 2）
--shadow <n>               阴影距离（像素，默认 1）
--bold                     粗体
--italic                   斜体
--karaoke-words <json>     卡拉OK单词时间列表（JSON数组）
```

示例：
```bash
ffclaw text add "欢迎观看" --start 0 --duration 3 --animation slide-up
ffclaw text add "Hello" --animation karaoke --karaoke-words '[{"w":"Hel","ms":500},{"w":"lo","ms":500}]'
# ms 为该词的持续毫秒数；总字幕时长 = 所有 ms 之和 = 1000ms = 1 秒
# --duration 应与 ms 总和对齐，否则最后一词可能被截断
```

#### `ffclaw text animations`（新命令）

枚举所有可用动画风格：

```bash
ffclaw text animations           # 表格列出所有预设
ffclaw text animations --json    # JSON 输出（含参数说明）
ffclaw text animations fade      # 查看单个动画详情
```

输出示例：
```
  ANIMATION STYLES
  ──────────────────────────────────────────────────────
  NAME            DESCRIPTION          PARAMS
  ──────────────────────────────────────────────────────
  fade            淡入淡出             inDuration, outDuration
  fade-in         仅淡入               inDuration
  slide-up        从下方滑入           inDuration, offset
  slide-down      从上方滑入           inDuration, offset
  slide-left      从右方滑入           inDuration, offset
  slide-right     从左方滑入           inDuration, offset
  zoom-in         放大出现             inDuration
  zoom-out        缩小消失             outDuration
  typewriter      逐字打字机           charDelay（默认 50ms/字符）
  shake           抖动                 intensity, frequency
  bounce          弹跳入场             inDuration, overshoot
  karaoke         卡拉OK逐字高亮       highlightColor
  glow            发光脉冲             blurMax, pulsePeriod
  none            无动画               -
  ──────────────────────────────────────────────────────
  Total: 14 animation style(s)
```

#### `ffclaw text preview`（新命令）

生成单个字幕片段的预览视频（黑底 + 字幕，3 秒）。支持两种调用方式：

```bash
# 方式一：预览 timeline 中已有的 clip
ffclaw text preview <clipId>

# 方式二：无需创建 clip，直接传入文本和动画参数预览效果
ffclaw text preview --animation slide-up --text "测试文字"
ffclaw text preview --animation typewriter --text "Hello World" --duration 4
ffclaw text preview --animation fade --text "欢迎" --output preview.mp4
```

方式二会在内存中临时构造一个 TextClip，不写入 timeline，也不需要预先执行 `ffclaw text add`。  
所有 `ffclaw text add` 支持的样式选项（`--font`、`--font-size`、`--color` 等）均可在 `preview` 命令中使用。

内部生成一段黑色背景视频 + 对应 .ass 文件，渲染 3 秒 mp4（可通过 `--duration` 覆盖）。

#### `ffclaw export`（现有命令，自动集成）

导出时自动检测 timeline 中是否有 text clips，若有则：
1. 生成完整 `.ass` 文件（含所有字幕、样式、动画）
2. 在 FFmpeg filter_complex 中加入 `ass=<file>:fontsdir=<dir>` 滤镜
3. 临时 `.ass` 文件写入系统 temp 目录，导出完成后清理

---

## 5. 工程集成方案

### 5.1 目录结构

```
src/
  ass/
    generator.js          # ASS 文件生成器（TextClip[] → .ass 内容）
    styles.js             # ASS Style 行生成
    fonts.js              # 字体别名 + 路径解析
    time.js               # 秒数 → ASS 时间码 (h:mm:ss.cc)
    animations/
      index.js            # 注册表 + listAnimations / getAnimation
      fade.js
      slide-up.js
      slide-down.js
      slide-left.js
      slide-right.js
      zoom-in.js
      zoom-out.js
      typewriter.js
      shake.js
      bounce.js
      karaoke.js
      glow.js
      none.js
assets/
  fonts/
    SourceHanSansSC-Regular.otf
    SourceHanSansSC-Bold.otf
    SourceHanSerifSC-Regular.otf
scripts/
  download-fonts.js       # 字体下载脚本
```

### 5.2 TextClip 数据模型扩展

在 `timeline-model.js` 的 `TextClip` typedef 中新增字段：

```js
/**
 * @typedef {object} TextClip
 * @property {string} id
 * @property {'text'} type
 * @property {number} start
 * @property {number} [duration]
 * @property {string} content
 * @property {number} [fontSize]           默认 60
 * @property {string} [color]             CSS hex，默认 #ffffff
 * @property {string} [outlineColor]      描边颜色，默认 #000000
 * @property {number} [outline]           描边粗细，默认 2
 * @property {number} [shadow]            阴影距离，默认 1
 * @property {string} [font]             别名或完整字体名，默认 'sans'
 * @property {boolean} [bold]
 * @property {boolean} [italic]
 * @property {'left'|'center'|'right'} [align]
 * @property {'top'|'center'|'bottom'} [position]  默认 'bottom'
 * @property {string|null} [animation]   动画风格名，默认 'fade'
 * @property {number} [animateInDuration]  默认 0.4
 * @property {number} [animateOutDuration] 默认 0.4
 * @property {Record<string,any>} [animationParams]  动画额外参数
 * @property {Array<{w:string,ms:number}>} [karaokeWords]
 *   卡拉OK词组。每项 `{w, ms}` 中：
 *   - `w`：该词的文字内容
 *   - `ms`：该词的持续毫秒数（即高亮停留时长）
 *   - 总字幕时长 = 所有词的 ms 之和，clip 的 duration 应与此对齐
 */
```

### 5.3 ASS 生成器接口

```js
// src/ass/generator.js

/**
 * 从 timeline TextClip 数组生成完整 ASS 文件内容。
 *
 * @param {TextClip[]} clips
 * @param {object} opts
 * @param {number} opts.width    视频宽度
 * @param {number} opts.height   视频高度
 * @returns {string}  ASS 文件完整内容
 */
export function generateASS(clips, { width, height }) { ... }
```

### 5.4 ffmpeg-renderer.js 集成

在 `buildFilterComplex()` 中，当存在 text clips 时：

```js
// 伪代码
import { generateASS } from '../ass/generator.js';
import { FONTS_DIR } from '../ass/fonts.js';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// 生成 .ass 文件
const assContent = generateASS(textClips, { width, height });
const assPath = path.join(tmpdir(), `ffclaw-${Date.now()}.ass`);
writeFileSync(assPath, assContent, 'utf8');

// 在 filter chain 末尾追加 ass 滤镜
// 替换原先的 drawtext 方案
filterParts.push(`[last]ass=${escapeFilterVal(assPath)}:fontsdir=${escapeFilterVal(FONTS_DIR)}[out]`);
```

> `drawtext` 方案保留为 fallback（当 libass 不可用时），通过 `checkLibass()` 在渲染前探测。

### 5.5 时间码转换

ASS 使用 `h:mm:ss.cc`（百分之一秒）格式：

```js
// src/ass/time.js
export function toASSTime(seconds) {
  const h   = Math.floor(seconds / 3600);
  const m   = Math.floor((seconds % 3600) / 60);
  const s   = Math.floor(seconds % 60);
  const cs  = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}
```

### 5.6 位置映射

ASS 使用 `\an<1-9>` 九宫格定位：

```js
const POSITION_MAP = {
  'top-left': 7,    'top': 8,    'top-right': 9,
  'left': 4,        'center': 5, 'right': 6,
  'bottom-left': 1, 'bottom': 2, 'bottom-right': 3,
};
```

---

## 6. 实施步骤和优先级

### Phase 1：基础 ASS 渲染（必须）

**目标：** 替换 drawtext，能烧录带淡入淡出字幕的完整视频

1. `scripts/download-fonts.js` — 字体下载脚本 + package.json postinstall
2. `src/ass/fonts.js` — 字体别名和路径解析
3. `src/ass/time.js` — 时间码工具函数
4. `src/ass/styles.js` — ASS Style 行生成（字体/颜色/大小/位置）
5. `src/ass/animations/none.js` + `fade.js` + `index.js` — 最小动画库
6. `src/ass/generator.js` — 完整 ASS 文件生成
7. `src/render/ffmpeg-renderer.js` — 集成 `ass=` 滤镜，替换 drawtext
8. `src/commands/text.js` — 新增 `--animation` / `--font` 等选项
9. 冒烟测试：`ffclaw text add "测试" && ffclaw export test.mp4`

### Phase 2：动画风格库（核心体验）

10. `slide-up/down/left/right.js` — 方向滑入动画
11. `zoom-in.js` / `zoom-out.js` — 缩放动画
12. `typewriter.js` — 打字机效果
13. `shake.js` — 抖动效果
14. `ffclaw text animations` 命令 — 枚举所有风格

### Phase 3：进阶功能（可选）

15. `karaoke.js` — 卡拉OK动画
16. `bounce.js` / `glow.js` — 弹跳/发光动画
17. `ffclaw text preview` 命令 — 快速预览单个动画
18. `.ffclawrc.js` 自定义动画注册机制
19. `--animate-in` / `--animate-out` 分开设置入场/出场动画
20. **LRC 歌词文件导入**（卡拉OK时间轴）

    ```bash
    ffclaw text add --animation karaoke \
      --lyrics-format lrc \
      --lyrics-file ./lyrics.lrc
    ```

    解析器读取标准 LRC（`[mm:ss.xx]歌词行`）或逐字 LRC（Enhanced LRC，`<mm:ss.xx>词`），  
    自动转换为 `karaokeWords` 数组（每项含 `w` 和 `ms`），无需手写 JSON 时间轴。  
    支持格式：标准行级 LRC（每行一个时间戳）和 Enhanced LRC（`<>` 逐字时间戳）。

### 测试策略

- 单元测试：`src/ass/generator.js` 的 ASS 输出格式正确性
- 单元测试：每个动画函数的 tag 字符串格式
- 集成测试：`ffclaw export` 生成的视频文件可被 ffprobe 识别
- E2E：至少验证 `fade` / `slide-up` / `typewriter` 三种动画的视频渲染结果

---

## 附录：ASS 文件示例

```ass
[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1920
PlayResY: 1080
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Source Han Sans SC,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,80,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,{\fad(400,400)}欢迎观看本视频
Dialogue: 0,0:00:03.50,0:00:06.50,Default,,0,0,0,,{\move(960,1000,960,900)\fad(400,400)}字幕从下方滑入
```

---

## 测试用例

### TC-01 字体下载脚本

**描述：** `scripts/download-fonts.js` 能正确下载所有内置字体到 `assets/fonts/`，并通过文件完整性校验。

**输入：**
```bash
node scripts/download-fonts.js
```

**预期输出：**
- 以下文件存在且大小非零：
  - `assets/fonts/NotoSansCJKsc-Regular.otf`（≥ 10 MB）
  - `assets/fonts/NotoSansCJKsc-Bold.otf`（≥ 10 MB）
  - `assets/fonts/NotoSerifCJKsc-Regular.otf`（≥ 10 MB）
  - `assets/fonts/Roboto-Regular.ttf`（≥ 100 KB）
  - `assets/fonts/Roboto-Bold.ttf`（≥ 100 KB）
- 脚本退出码为 `0`
- 控制台输出每个字体的下载完成提示

**验证方法：**
```js
import { existsSync, statSync } from 'node:fs';
const files = [
  'assets/fonts/NotoSansCJKsc-Regular.otf',
  'assets/fonts/NotoSansCJKsc-Bold.otf',
  'assets/fonts/NotoSerifCJKsc-Regular.otf',
  'assets/fonts/Roboto-Regular.ttf',
  'assets/fonts/Roboto-Bold.ttf',
];
for (const f of files) {
  assert(existsSync(f), `缺失字体文件: ${f}`);
  assert(statSync(f).size > 0, `文件为空: ${f}`);
}
```

---

### TC-02 resolveFont() — 纯 ASCII 返回 Roboto

**描述：** `fonts.js` 的 `resolveFont()` 对纯 ASCII 文本返回 `'Roboto'`。

**输入：**
```js
resolveFont('Hello World');
resolveFont('123 !@#');
resolveFont('');
```

**预期输出：**
```
'Roboto'
'Roboto'
'Roboto'
```

**验证方法：**
```js
import { resolveFont } from '../src/ass/fonts.js';
assert.strictEqual(resolveFont('Hello World'), 'Roboto');
assert.strictEqual(resolveFont('123 !@#'), 'Roboto');
assert.strictEqual(resolveFont(''), 'Roboto');
```

---

### TC-03 resolveFont() — 含中文返回 Noto Sans CJK SC

**描述：** `fonts.js` 的 `resolveFont()` 对含中文字符的文本返回 `'Noto Sans CJK SC'`。

**输入：**
```js
resolveFont('欢迎观看');
resolveFont('Hello 世界');
resolveFont('混合 mixed 内容');
```

**预期输出：**
```
'Noto Sans CJK SC'
'Noto Sans CJK SC'
'Noto Sans CJK SC'
```

**验证方法：**
```js
import { resolveFont } from '../src/ass/fonts.js';
assert.strictEqual(resolveFont('欢迎观看'), 'Noto Sans CJK SC');
assert.strictEqual(resolveFont('Hello 世界'), 'Noto Sans CJK SC');
assert.strictEqual(resolveFont('混合 mixed 内容'), 'Noto Sans CJK SC');
```

---

### TC-04 resolveFont() — 用户显式指定字体优先

**描述：** 传入 `userFont` 参数时，优先使用用户指定的字体别名或全名，忽略文本内容检测。

**输入：**
```js
resolveFont('欢迎', 'sans-latin');
resolveFont('Hello', 'serif');
resolveFont('test', 'My Custom Font');
```

**预期输出：**
```
'Roboto'
'Noto Serif CJK SC'
'My Custom Font'
```

**验证方法：**
```js
assert.strictEqual(resolveFont('欢迎', 'sans-latin'), 'Roboto');
assert.strictEqual(resolveFont('Hello', 'serif'), 'Noto Serif CJK SC');
assert.strictEqual(resolveFont('test', 'My Custom Font'), 'My Custom Font');
```

---

### TC-05 toASSTime() — 时间格式转换正确性

**描述：** `time.js` 的 `toASSTime()` 将秒数正确转换为 ASS 格式时间码 `h:mm:ss.cc`，其中 `h` 为小时（不补零）、`mm` 为分钟（两位）、`ss` 为秒（两位）、`cc` 为百分之一秒（centiseconds，两位）。

**输入与预期输出：**

| 输入（秒） | 预期输出 | 说明 |
|-----------|---------|------|
| `toASSTime(0)` | `'0:00:00.00'` | 零点 |
| `toASSTime(0.5)` | `'0:00:00.50'` | 半秒，cc = 50 |
| `toASSTime(1.0)` | `'0:00:01.00'` | 整数秒 |
| `toASSTime(90)` | `'0:01:30.00'` | 跨分钟边界 |
| `toASSTime(90.45)` | `'0:01:30.45'` | 小数部分直接映射到 cc |
| `toASSTime(3600)` | `'1:00:00.00'` | 整小时 |
| `toASSTime(7261.99)` | `'2:01:01.99'` | 复合值 |

**验证方法：**
```js
import { toASSTime } from '../src/ass/time.js';
const cases = [
  [0,       '0:00:00.00'],
  [0.5,     '0:00:00.50'],
  [1.0,     '0:00:01.00'],
  [90,      '0:01:30.00'],
  [90.45,   '0:01:30.45'],
  [3600,    '1:00:00.00'],
  [7261.99, '2:01:01.99'],
];
for (const [input, expected] of cases) {
  assert.strictEqual(toASSTime(input), expected, `toASSTime(${input})`);
}
```

---

### TC-06 样式生成 — Style 行格式正确

**描述：** 各种 `TextClip` 配置生成的 ASS `Style:` 行符合 V4+ 格式规范，颜色、字号、字体、对齐等字段正确映射。

**输入：**
```js
// clip1：默认配置
{ content: 'Hello', fontSize: 60, color: '#ffffff', outlineColor: '#000000', outline: 2, shadow: 1, font: 'sans-latin', bold: false, italic: false, position: 'bottom' }

// clip2：自定义粗体、居中、大字号
{ content: '标题', fontSize: 90, color: '#ffff00', outlineColor: '#ff0000', outline: 3, shadow: 2, font: 'sans', bold: true, italic: false, position: 'center' }
```

**预期输出（关键字段）：**
- clip1：`Fontname=Roboto`, `Fontsize=60`, `PrimaryColour=&H00FFFFFF`, `OutlineColour=&H00000000`, `Outline=2`, `Shadow=1`, `Bold=0`, `Alignment=2`
- clip2：`Fontname=Noto Sans CJK SC`, `Fontsize=90`, `PrimaryColour=&H0000FFFF`, `OutlineColour=&H000000FF`, `Outline=3`, `Shadow=2`, `Bold=-1`, `Alignment=5`

**验证方法：**
```js
import { buildStyleLine } from '../src/ass/styles.js';
const line1 = buildStyleLine(clip1);
assert.match(line1, /^Style: /);
assert.match(line1, /Roboto/);
assert.match(line1, /&H00FFFFFF/);  // 白色（BGR顺序）
assert.match(line1, /,2,$/);        // Alignment=2（底部居中）

const line2 = buildStyleLine(clip2);
assert.match(line2, /Noto Sans CJK SC/);
assert.match(line2, /-1/);          // Bold=-1 (true)
assert.match(line2, /,5,$/);        // Alignment=5（垂直居中）
```

---

### TC-07 fade 动画函数 — ASS tag 格式正确

**描述：** `animations/fade.js` 的 `fade()` 输出正确的 `\fad` tag 字符串。

**输入：**
```js
fade({ inDuration: 0.4, outDuration: 0.4 })
fade({ inDuration: 0.3, outDuration: 0 })    // fade-in only
fade({ inDuration: 0,   outDuration: 0.5 })  // fade-out only
fade({ inDuration: 1.5, outDuration: 2.0 })  // 长时淡入淡出
```

**预期输出：**
```
'\\fad(400,400)'
'\\fad(300,0)'
'\\fad(0,500)'
'\\fad(1500,2000)'
```

**验证方法：**
```js
import { fade } from '../src/ass/animations/fade.js';
assert.strictEqual(fade({ inDuration: 0.4, outDuration: 0.4 }), '\\fad(400,400)');
assert.strictEqual(fade({ inDuration: 0.3, outDuration: 0 }),   '\\fad(300,0)');
assert.strictEqual(fade({ inDuration: 0,   outDuration: 0.5 }), '\\fad(0,500)');
assert.strictEqual(fade({ inDuration: 1.5, outDuration: 2.0 }), '\\fad(1500,2000)');
```

---

### TC-08 slide-up 动画函数 — 包含 \move 和 \fad tag

**描述：** `animations/slide-up.js` 的 `slideUp()` 输出同时包含 `\move` 和 `\fad` tag，起始 Y 坐标大于终止 Y 坐标（从下方滑入）。

**输入：**
```js
slideUp({
  x: 960, y: 900,
  inDuration: 0.4, outDuration: 0.4,
  playResX: 1920, playResY: 1080,
  params: { offset: 80 }
})
```

**预期输出（结构）：**
- 包含 `\move(960,980,960,900)` 或等效（起始 Y = 目标 Y + offset）
- 包含 `\fad(400,400)`

**验证方法：**
```js
import { slideUp } from '../src/ass/animations/slide-up.js';
const tag = slideUp({ x: 960, y: 900, inDuration: 0.4, outDuration: 0.4,
                      playResX: 1920, playResY: 1080, params: { offset: 80 } });
assert.match(tag, /\\move\(/);
assert.match(tag, /\\fad\(400,400\)/);
// 验证起始Y > 终止Y（从下方滑入）
const moveMatch = tag.match(/\\move\((\d+),(\d+),(\d+),(\d+)\)/);
assert(moveMatch, '应包含 \\move tag');
assert(Number(moveMatch[2]) > Number(moveMatch[4]), '起始Y应大于终止Y（从下方滑入）');
```

---

### TC-09 karaoke 动画 — \k tag 和词组解析正确

**描述：** `animations/karaoke.js` 对 `karaokeWords` 数组生成正确的 `\k` tag 序列，每词的时长单位为厘秒（ms ÷ 10）。

**输入：**
```js
karaokeWords: [
  { w: 'Hello', ms: 500 },
  { w: ' ', ms: 100 },
  { w: 'World', ms: 600 },
]
```

**预期输出（Dialogue Text 部分）：**
```
{\k50}Hello{\k10} {\k60}World
```

**验证方法：**
```js
import { buildKaraokeText } from '../src/ass/animations/karaoke.js';
const text = buildKaraokeText([
  { w: 'Hello', ms: 500 },
  { w: ' ',     ms: 100 },
  { w: 'World', ms: 600 },
]);
assert.strictEqual(text, '{\\k50}Hello{\\k10} {\\k60}World');
```

---

### TC-10 typewriter 动画 — 多字符拆分和 Dialogue 行生成正确

**描述：** `animations/typewriter.js` 将文本拆分为逐字符出现的多条 Dialogue 行，每行间隔 `charDelay` 毫秒。

**输入：**
```js
clip = {
  content: 'Hi!',
  start: 0,
  duration: 3,
  animation: 'typewriter',
  animationParams: { charDelay: 100 },
}
```

**预期输出（3 条 Dialogue 行）：**
```
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,H
Dialogue: 0,0:00:00.10,0:00:03.00,Default,,0,0,0,,Hi
Dialogue: 0,0:00:00.20,0:00:03.00,Default,,0,0,0,,Hi!
```

**验证方法：**
```js
import { buildTypewriterDialogues } from '../src/ass/animations/typewriter.js';
const lines = buildTypewriterDialogues(clip, { width: 1920, height: 1080 });
assert.strictEqual(lines.length, 3);
assert.match(lines[0], /0:00:00\.00.*,,H$/);
assert.match(lines[1], /0:00:00\.10.*,,Hi$/);
assert.match(lines[2], /0:00:00\.20.*,,Hi!$/);
```

---

### TC-11 generateASS() — 完整 ASS 文件格式

**描述：** `generator.js` 的 `generateASS()` 生成的字符串包含三个必需区段：`[Script Info]`、`[V4+ Styles]`、`[Events]`，且 PlayResX/PlayResY 与传入参数一致。

**输入：**
```js
generateASS(
  [{ id: 'c1', type: 'text', content: 'Hello', start: 0, duration: 3 }],
  { width: 1920, height: 1080 }
)
```

**预期输出（结构验证）：**
- 包含 `[Script Info]` 区段
- 包含 `PlayResX: 1920` 和 `PlayResY: 1080`
- 包含 `[V4+ Styles]` 区段
- 包含 `Format: Name, Fontname, Fontsize` 行
- 包含 `[Events]` 区段
- 包含至少一行 `Dialogue:` 行
- `Dialogue:` 行包含 `Hello`

**验证方法：**
```js
import { generateASS } from '../src/ass/generator.js';
const ass = generateASS(
  [{ id: 'c1', type: 'text', content: 'Hello', start: 0, duration: 3 }],
  { width: 1920, height: 1080 }
);
assert.match(ass, /\[Script Info\]/);
assert.match(ass, /PlayResX: 1920/);
assert.match(ass, /PlayResY: 1080/);
assert.match(ass, /\[V4\+ Styles\]/);
assert.match(ass, /Format: Name, Fontname, Fontsize/);
assert.match(ass, /\[Events\]/);
assert.match(ass, /^Dialogue:.*Hello/m);
```

---

### TC-12 libass 可用性检测

**描述：** `checkLibass()` 在 FFmpeg 编译了 libass 时返回 `true`，未编译时返回 `false`。

**输入（mock ffmpeg 输出）：**
- 场景 A：`ffmpeg -filters` 输出包含 `subtitles` 或 `ass`
- 场景 B：`ffmpeg -filters` 输出不包含上述关键词

**预期输出：**
- 场景 A：`true`
- 场景 B：`false`

**验证方法：**
```js
import { checkLibass } from '../src/ass/libass-check.js';

// 使用 mock 替换 execSync
vi.mock('node:child_process', () => ({
  execSync: vi.fn()
    .mockReturnValueOnce('... subtitles ...')   // 场景 A
    .mockReturnValueOnce('... drawtext ...')    // 场景 B
}));

assert.strictEqual(await checkLibass(), true);
assert.strictEqual(await checkLibass(), false);
```

---

### TC-13 text add 命令 — 创建字幕 clip 并写入 timeline

**描述：** `ffclaw text add` 命令执行后，在 timeline 文件中创建包含正确字段的 TextClip 条目。

**输入：**
```bash
ffclaw text add "欢迎观看" --start 2 --duration 3 --animation slide-up --font sans
```

**预期输出：**
- 命令退出码为 `0`
- timeline JSON 中新增一个 clip 对象，包含：
  - `type: 'text'`
  - `content: '欢迎观看'`
  - `start: 2`
  - `duration: 3`
  - `animation: 'slide-up'`
  - `font: 'sans'`

**验证方法：**
```js
// 集成测试
const { execSync } = require('node:child_process');
execSync('ffclaw text add "欢迎观看" --start 2 --duration 3 --animation slide-up --font sans');
const timeline = JSON.parse(readFileSync('timeline.json', 'utf8'));
const clip = timeline.clips.find(c => c.content === '欢迎观看');
assert(clip, '应找到新建的 clip');
assert.strictEqual(clip.type, 'text');
assert.strictEqual(clip.start, 2);
assert.strictEqual(clip.duration, 3);
assert.strictEqual(clip.animation, 'slide-up');
```

---

### TC-14 text animations 命令 — 枚举所有动画风格

**描述：** `ffclaw text animations` 命令输出包含所有 14 种预设动画风格名称，`--json` 模式输出合法 JSON 数组。

**输入：**
```bash
ffclaw text animations
ffclaw text animations --json
```

**预期输出：**
- 纯文本模式：包含 `fade`、`slide-up`、`typewriter`、`karaoke` 等关键词，`Total: 14 animation style(s)`
- JSON 模式：合法 JSON 数组，长度为 14，每项含 `name`、`description`、`params` 字段

**验证方法：**
```js
// 子场景 A：纯文本模式
const textOut = execSync('ffclaw text animations').toString();
assert.match(textOut, /fade/);
assert.match(textOut, /typewriter/);
assert.match(textOut, /karaoke/);
assert.match(textOut, /Total: 14/);

// 子场景 B：--json 输出合法 JSON，包含所有必需字段
const rawJson = execSync('ffclaw text animations --json').toString();
let list;
assert.doesNotThrow(() => { list = JSON.parse(rawJson); }, '输出应为合法 JSON');
assert.strictEqual(list.length, 14, 'JSON 数组长度应为 14');
for (const item of list) {
  assert(item.name,        `每项须有 name 字段，实际: ${JSON.stringify(item)}`);
  assert(item.description, `每项须有 description 字段，实际: ${JSON.stringify(item)}`);
  assert('params' in item, `每项须有 params 字段，实际: ${JSON.stringify(item)}`);
}
```

---

### TC-15 text preview 命令 — 生成预览视频文件

**描述：** `ffclaw text preview` 命令生成可播放的 mp4 预览视频，文件存在且为合法视频格式。

**输入：**
```bash
ffclaw text preview --animation fade --text "测试文字" --output /tmp/preview-test.mp4
```

**预期输出：**
- 命令退出码为 `0`
- `/tmp/preview-test.mp4` 文件存在且大小 > 0
- `ffprobe` 能识别该文件为有效视频（包含视频流）
- 视频时长约为 3 秒（默认）

**验证方法：**
```bash
ffclaw text preview --animation fade --text "测试文字" --output /tmp/preview-test.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/preview-test.mp4
# 输出应为 3.xxx
test -f /tmp/preview-test.mp4 && echo "OK"
```
```js
const { size } = statSync('/tmp/preview-test.mp4');
assert(size > 0, '预览视频文件不应为空');
const duration = parseFloat(execSync('ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/preview-test.mp4').toString());
assert(Math.abs(duration - 3) < 0.5, `视频时长应约为3秒，实际: ${duration}`);
```

---

### TC-16 export 命令 — 字幕正确烧录进输出视频

**描述：** `ffclaw export` 对含有 TextClip 的 timeline 生成视频，字幕通过 libass 烧录，导出文件可被 ffprobe 识别为有效视频。libass 必须实际被使用，不接受 `drawtext` 作为通过条件。

**输入：**
```bash
# 准备：创建一个带字幕的 timeline
ffclaw init
ffclaw video add input.mp4 --start 0 --duration 5
ffclaw text add "Hello World" --start 1 --duration 3 --animation fade
ffclaw export output.mp4
```

**预期输出：**
- 命令退出码为 `0`
- `output.mp4` 存在且大小 > 0
- `ffprobe` 识别为有效视频，时长与 timeline 一致
- FFmpeg filter_complex 中必须包含 `ass=<path>.ass` 滤镜（不接受 `drawtext` 替代）

**验证方法：**
```bash
ffprobe -v error -show_entries format=duration output.mp4
# 应输出约 5 秒
```
```js
// 检查 ffmpeg 命令使用了 ass 滤镜（通过 spy/mock 渲染器）
// 注意：不能用 drawtext 作为 fallback 时不应通过此测试
assert.match(capturedFilterComplex, /ass=[^'"]+\.ass/);
```

---

### TC-17 karaoke --karaoke-words 输入格式验证

**描述：** `text add --karaoke-words` 的 `ms` 总和与 `--duration` 不匹配时，命令应输出警告但仍正常执行；匹配时无警告。

**输入（ms 总和不匹配）：**
```bash
# ms 总和 = 500+500 = 1000ms = 1秒，但 duration = 3秒
ffclaw text add "Hi" \
  --animation karaoke \
  --karaoke-words '[{"w":"H","ms":500},{"w":"i","ms":500}]' \
  --duration 3
```

**输入（ms 总和匹配）：**
```bash
ffclaw text add "Hi" \
  --animation karaoke \
  --karaoke-words '[{"w":"H","ms":1500},{"w":"i","ms":1500}]' \
  --duration 3
```

**预期输出：**
- 不匹配时：命令退出码 `0`，stderr 或 stdout 包含 `warn` / `warning` 关键词（大小写不敏感），提示 ms 总和与 duration 不一致
- 匹配时：命令退出码 `0`，无警告输出

**验证方法：**
```js
// 不匹配场景
const { stderr, stdout } = execSyncWithOutput('ffclaw text add "Hi" --animation karaoke --karaoke-words \'[{"w":"H","ms":500},{"w":"i","ms":500}]\' --duration 3');
const output = (stderr + stdout).toLowerCase();
assert.match(output, /warn/i);

// 匹配场景
const { stderr: se2 } = execSyncWithOutput('ffclaw text add "Hi" --animation karaoke --karaoke-words \'[{"w":"H","ms":1500},{"w":"i","ms":1500}]\' --duration 3');
assert(!se2.toLowerCase().includes('warn'), '匹配时不应有警告');
```

---

### TC-18 LRC 导入（Phase 3）— 标准 LRC 解析

**描述：** LRC 解析器正确解析标准 LRC 文件（行级时间戳），生成对应的 `karaokeWords` 时间轴数组。

**输入（`lyrics.lrc` 内容）：**
```lrc
[ar:Test Artist]
[ti:Test Song]
[00:01.00]第一句歌词
[00:04.50]第二句歌词
[00:08.00]第三句歌词
```

**预期输出（karaokeWords 数组）：**
```js
[
  { w: '第一句歌词', ms: 3500 },  // 4.50 - 1.00 = 3.5秒 = 3500ms
  { w: '第二句歌词', ms: 3500 },  // 8.00 - 4.50 = 3.5秒 = 3500ms
  { w: '第三句歌词', ms: 0 },     // 最后一行，ms=0 或根据整体时长推断
]
```

**验证方法：**
```js
import { parseLRC } from '../src/ass/lrc-parser.js';
const lrcContent = `[00:01.00]第一句歌词\n[00:04.50]第二句歌词\n[00:08.00]第三句歌词`;
const words = parseLRC(lrcContent);
assert.strictEqual(words[0].w, '第一句歌词');
assert.strictEqual(words[0].ms, 3500);
assert.strictEqual(words[1].w, '第二句歌词');
assert.strictEqual(words[1].ms, 3500);
assert.strictEqual(words[2].w, '第三句歌词');
```

---

### TC-19 LRC 导入（Phase 3）— Enhanced LRC 逐字解析

**描述：** LRC 解析器正确解析 Enhanced LRC（逐字 `<>` 时间戳），生成词粒度的 `karaokeWords` 数组。

**输入（Enhanced LRC 格式）：**
```lrc
[00:01.00]<00:01.00>Hello<00:01.50> <00:01.60>World<00:02.20>
```

**预期输出：**
```js
[
  { w: 'Hello', ms: 500 },   // 1.50 - 1.00 = 0.5秒 = 500ms
  { w: ' ',     ms: 100 },   // 1.60 - 1.50 = 0.1秒 = 100ms
  { w: 'World', ms: 600 },   // 2.20 - 1.60 = 0.6秒 = 600ms
]
```

**验证方法：**
```js
import { parseEnhancedLRC } from '../src/ass/lrc-parser.js';
const lrc = '[00:01.00]<00:01.00>Hello<00:01.50> <00:01.60>World<00:02.20>';
const words = parseEnhancedLRC(lrc);
assert.strictEqual(words.length, 3);
assert.strictEqual(words[0].w, 'Hello');
assert.strictEqual(words[0].ms, 500);
assert.strictEqual(words[1].w, ' ');
assert.strictEqual(words[1].ms, 100);
assert.strictEqual(words[2].w, 'World');
assert.strictEqual(words[2].ms, 600);
```

---

### TC-20 `none` 动画函数 — 返回空字符串

**描述：** `animations/none.js` 的 `none()` 函数返回空字符串，不向 Dialogue 行注入任何额外 ASS tag，适用于纯静态字幕。

**输入：**
```js
none()
none({})
none({ duration: 5, start: 0 })
```

**预期输出：**
- 所有调用均返回 `''`（空字符串）
- 返回值不包含 `\fad`、`\move`、`\k`、`\pos` 等任何 ASS tag

**验证方法：**
```js
import { none } from '../src/ass/animations/none.js';

assert.strictEqual(none(), '', 'none() 应返回空字符串');
assert.strictEqual(none({}), '', 'none({}) 应返回空字符串');
assert.strictEqual(none({ duration: 5, start: 0 }), '', '带参数调用也应返回空字符串');

// 确认不含任何 ASS override tag
const result = none({ duration: 10 });
assert(!result.includes('\\'), '不应包含任何反斜杠（ASS tag 起始符）');
```

---

### TC-21 `drawtext` fallback — libass 不可用时降级渲染

**描述：** 当 `checkLibass()` 返回 `false`（系统未安装 libass）时，`ffmpeg-renderer.js` 应自动降级到 `drawtext` 滤镜生成字幕。export 命令仍能成功完成并生成可播放视频，但无 ASS 动画效果（仅显示静态文字）。

**输入：**
```js
// mock checkLibass() 使其返回 false
vi.mock('../src/ass/libass-check.js', () => ({ checkLibass: () => false }));
```
```bash
ffclaw export output.mp4  # 环境中无 libass
```

**预期输出：**
- 命令退出码为 `0`
- `output.mp4` 存在且大小 > 0，`ffprobe` 识别为有效视频
- FFmpeg filter_complex 中包含 `drawtext=` 滤镜而非 `ass=`
- stderr 或日志中包含降级提示（如 `warn`、`fallback`、`drawtext` 等关键词，大小写不敏感）

**验证方法：**
```js
import { renderWithSubtitles } from '../src/ffmpeg-renderer.js';
import * as libassCheck from '../src/ass/libass-check.js';

// stub libass 为不可用
const stub = vi.spyOn(libassCheck, 'checkLibass').mockReturnValue(false);

let capturedArgs;
// spy ffmpeg 调用，捕获实际传入的 filter_complex
vi.spyOn(childProcess, 'spawn').mockImplementation((cmd, args) => {
  capturedArgs = args.join(' ');
  return mockSpawn();
});

await renderWithSubtitles({ clips, output: '/tmp/tc21-out.mp4' });

assert.match(capturedArgs, /drawtext=/, 'libass 不可用时应降级到 drawtext');
assert(!capturedArgs.includes('ass='), '降级后不应出现 ass= 滤镜');

stub.mockRestore();
```
