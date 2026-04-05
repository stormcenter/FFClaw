# ClipCraft 测试规范

> 本文档定义 ClipCraft 项目交付时的测试标准。所有功能必须通过本文档定义的测试用例方可视为完成。

---

## 1. 测试分类

| 测试类型 | 范围 | 测试方式 |
|---------|------|---------|
| 单元测试 | 每个核心模块（project.js、timeline-model.js、builder.js、filter-dsl.js 等） | Jest 单测 |
| 集成测试 | 各命令层（commands/*.js）能否正确调用 core 模块 | Jest + mock |
| 端到端测试 | 完整工作流（import → timeline → export） | 真实 FFmpeg + 文件系统 |
| CLI 测试 | yargs 解析、帮助文本、错误提示 | snapshot 测试 |

**覆盖率目标：**
- 核心模块（src/core/*）：≥ 90% 行覆盖率
- 命令层（src/commands/*）：≥ 80% 行覆盖率
- 整体：≥ 70% 行覆盖率

---

## 2. 测试环境

### 2.1 前置依赖

```bash
# FFmpeg（必须）
ffmpeg -version  # 需要 ffprobe 支持
ffprobe -version

# Node.js
node >= 18.0.0
npm >= 9.0.0

# FFCreator peer dependency
npm install  # 会自动安装 peerDependencies
```

### 2.2 测试素材规格

测试素材统一放在 `test/fixtures/assets/` 目录下：

```
test/fixtures/assets/
├── video/
│   ├── clip_10s_1920x1080.mp4      # 10秒 1920x1080 有音频
│   ├── clip_5s_1920x1080.mp4       # 5秒 1920x1080 有音频
│   ├── clip_3s_1920x1080_noaudio.mp4  # 3秒 1920x1080 无音频
│   └── clip_vertical_9x16.mp4      # 5秒 1080x1920 竖屏
├── audio/
│   ├── bgm_30s.mp3                 # 30秒背景音乐
│   └── sfx_click.wav                # 1秒音效
├── image/
│   ├── logo_200x200.png            # 200x200 PNG 透明
│   ├── background_1920x1080.jpg     # 1920x1080 JPG
│   └── watermark_100x100.png        # 100x100 PNG
└── subtitle/
    ├── single_line.srt              # 单条字幕
    └── multi_lines.srt              # 多条字幕（3条以上）
```

**视频素材规格要求：**
- 编码：H.264（libx264）
- 帧率：30fps
- 音频：AAC 44.1kHz stereo
- 所有视频必须包含至少 2 秒的有效画面内容

**音频素材规格要求：**
- BGM：MP3 128kbps 以上
- SFX：WAV 44.1kHz 或 MP3

---

## 3. 命令测试用例

### 3.1 `new` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| NEW-01 | 交互式创建默认项目 | `clipcraft new`（无参数） | 生成 `ffclaw.json`，ratio=16:9, fps=30 |
| NEW-02 | 非交互式创建 | `--name "test" --ratio 9:16 --fps 60 --bg-color black` | 生成项目，width=1080, height=1920, fps=60，bgColor="#000000" |
| NEW-03 | 创建重复名称项目 | 同名项目已存在时再次创建 | 提示项目已存在，不覆盖 |
| NEW-04 | 指定无效分辨率 | `--ratio invalid` | 报错，提示有效选项 |
| NEW-05 | 创建后 ffclaw.json 格式校验 | 生成的 JSON | version 字段值为字符串 `"1.0"`，包含 name/ratio/width/height/fps/bgColor/assets/timeline |
| NEW-06 | 自定义背景色 | `--bg-color "#FF0000"` | bgColor="#FF0000" |

### 3.2 `import` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| IMP-01 | 导入有效视频 | `import video clip_10s.mp4` | 分配 v1，duration/width/height/hasAudio 正确 |
| IMP-02 | 导入音频 | `import audio bgm.mp3` | 分配 a1，duration 正确 |
| IMP-03 | 导入图片 | `import image logo.png` | 分配 i1，width/height 正确 |
| IMP-04 | 导入字幕 | `import subtitle subs.srt` | 分配 s1，条目数量正确 |
| IMP-05 | 导入不存在文件 | `import video not_exist.mp4` | 报错 ASSET_NOT_FOUND |
| IMP-06 | 导入重复文件 | 同一文件导入两次 | 第二条记录复用已有 asset ID |
| IMP-07 | 查看素材库 | `import --list` | 输出表格包含所有已导入素材及 ID |
| IMP-08 | 删除素材 | `import remove v1` | 素材从列表移除，ffclaw.json 更新 |
| IMP-09 | 清空素材 | `import clear` | 所有素材清空，ffclaw.json assets={} |
| IMP-10 | 导入非视频文件到 video | `import video doc.pdf` | 报错 INVALID_MEDIA_TYPE |

### 3.3 `timeline` 命令

#### 3.3.1 `timeline add`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TADD-01 | 添加视频到时间线 | `timeline add video v1` | 生成 clipId=c1，start=0，ffclaw.json 更新 |
| TADD-02 | 指定 start 位置 | `--start 15` | clip start=15 |
| TADD-03 | 指定 in/out 裁剪 | `--in 2 --out 8` | clip in=2, out=8 |
| TADD-04 | 添加图片 | `timeline add image i1 --duration 5` | clip type=image, duration=5 |
| TADD-05 | 添加音频 | `timeline add audio a1 --loop` | clip loop=true |
| TADD-06 | 添加文字 | `timeline add text "你好"` | clip content="你好" |
| TADD-07 | 添加不存在的 asset | `timeline add video v999` | 报错 ASSET_NOT_FOUND |
| TADD-08 | 多次添加同一 asset | `add video v1` 两次 | 生成两个不同 clipId |
| TADD-09 | JSON 输出 | `--json` | 输出 `{"type":"ok","op":"add","clipId":"c1"...}` |
| TADD-10 | 指定 position | `--position center` | ffclaw.json 中 position 正确解析 |

#### 3.3.2 `timeline show`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TSH-01 | 空项目 show | 无素材 | 输出空时间线，总时长 0s |
| TSH-02 | 有素材 show | 3个 clips | ASCII 表格正确渲染，显示时间刻度 |
| TSH-03 | JSON 格式 | `--json` | 返回完整的 tracks 结构 |
| TSH-04 | 总时长计算 | 多个 clips | 总时长 = 最长轨道 end 时间 |

#### 3.3.3 `timeline trim`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TTR-01 | 正常裁剪 | `trim c1 --in 2 --out 8` | clip in=2, out=8 |
| TTR-02 | in 大于 out | `--in 10 --out 5` | 报错 INVALID_RANGE |
| TTR-03 | 超出素材范围 | `--in -1` | 报错 INVALID_RANGE |
| TTR-04 | 不存在的 clipId | `trim c999 --in 0 --out 5` | 报错 CLIP_NOT_FOUND |
| TTR-05 | JSON 输出 | `--json` | 输出 `{"type":"ok","op":"trim"...}` |

#### 3.3.4 `timeline split`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TSPL-01 | 正常分割 | `split c1 at 5` | 生成两个新 clipId，原 clip 被拆分 |
| TSPL-02 | 分割点超出范围 | `at 999` | 报错 INVALID_RANGE |
| TSPL-03 | 分割点=0 | `at 0` | 报错 INVALID_RANGE |
| TSPL-04 | JSON 输出 | `--json` | 返回两个新 clipId |

#### 3.3.5 `timeline move`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TMV-01 | 移动到绝对位置 | `move c1 to 10` | clip start=10 |
| TMV-02 | 相对移动 | `--offset 5` | clip start += 5 |
| TMV-03 | 移动到负数 | `to -1` | 报错 INVALID_RANGE |
| TMV-04 | 移动后重叠 | 导致与相邻 clip 重叠 | 允许（时间线模型允许同轨道 clips 重叠） |

#### 3.3.6 `timeline remove`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TRM-01 | 正常删除 | `remove c1` | clip 从 timeline 移除 |
| TRM-02 | 删除不存在的 clip | `remove c999` | 报错 CLIP_NOT_FOUND |
| TRM-03 | 删除后关联转场 | 删除的 clip 有关联转场 | 转场一并删除 |

#### 3.3.7 `timeline add-transition`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TAT-01 | 指定两个 clip | `--between c1 c2 --duration 1.0` | transitions 包含 `{"between":["c1","c2"]}` |
| TAT-02 | 不指定（默认最后两个） | 无 `--between` | 自动取最后两个相邻 clip |
| TAT-03 | 无足够 clip | 只有 1 个 clip 时添加转场 | 报错 NOT_ENOUGH_CLIPS |
| TAT-04 | 无效转场类型 | `--type invalid_trans` | 报错 UNKNOWN_TRANSITION |
| TAT-05 | duration 超范围 | `--duration 999` | 报错 INVALID_DURATION |

#### 3.3.8.5 `timeline transitions list`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TLTL-01 | 查看已设置转场列表 | `transitions list` | 输出当前 timeline 所有已设置转场 |
| TLTL-02 | 查看可用转场类型 | `transitions` | 输出可用转场名称列表（fade/wipe/zoomright...）|

#### 3.3.9 `timeline speed`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TSPD-01 | 正常加速 | `speed c1 2.0` | clip speed=2.0 |
| TSPD-02 | 慢动作 | `speed c1 0.5` | clip speed=0.5 |
| TSPD-03 | speed=1 | `speed c1 1` | clip speed=1（还原） |
| TSPD-04 | speed<=0 | `speed c1 0` | 报错 INVALID_SPEED |
| TSPD-05 | 只对视频 clip 生效 | 对 audio clip 执行 | 报错 WRONG_CLIP_TYPE |

#### 3.3.9 `timeline volume`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TVL-01 | 设置音量 | `volume c3 0.5` | clip volume=0.5 |
| TVL-02 | 静音 | `volume c3 0` | clip volume=0 |
| TVL-03 | 音量>1 | `volume c3 1.5` | 报错 INVALID_VOLUME |
| TVL-04 | 对视频 clip 设置音量 | `volume c1 0.5`（video clip） | 报错 WRONG_CLIP_TYPE（video clip 用 `mute` 静音，用 `volume` 调视频原声音量需通过 FFCreator 参数实现，CLI 暂不支持）|

#### 3.3.10 `timeline mute`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TMU-01 | 静音视频原声 | `mute c1` | clip muted=true |
| TMU-02 | 取消静音 | `mute c1 off` | clip muted=false |
| TMU-03 | 对音频 clip 执行 | 对 audio clip 执行 | 报错 WRONG_CLIP_TYPE |

#### 3.3.11 `timeline fade`

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TFD-01 | 设置淡入淡出 | `fade c3 --in 2 --out 3` | clip fadeIn=2, fadeOut=3 |
| TFD-02 | 只淡入 | `--in 2` | fadeIn=2, fadeOut=0 |
| TFD-03 | 淡出时长超过 clip 时长 | `--out 999` | 报错 INVALID_FADE |

### 3.4 `filter` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| FLT-01 | 列出预设 | `list` | 输出预设列表含 warm_sunshine/cinema/fresh/b_and_w |
| FLT-02 | 应用预设 | `apply c1 --preset warm_sunshine` | clip.filter 展开 preset 参数 |
| FLT-03 | 手动调色 | `adjust c1 --brightness 10 --saturation -5` | clip.filter 覆盖指定字段 |
| FLT-04 | 重置滤镜 | `reset c1` | clip.filter=null |
| FLT-05 | 创建自定义预设 | `create --name "my_preset" --brightness 10` | ffclaw.json.filters 新增预设 |
| FLT-06 | 不存在的 clipId | `apply c999 --preset warm_sunshine` | 报错 CLIP_NOT_FOUND |
| FLT-07 | 不存在的 preset | `--preset invalid` | 报错 UNKNOWN_PRESET |

### 3.5 `text` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TXT-01 | 文字动画 | `animate c4 --in fadeIn --out slideUp` | clip animateIn/Out 正确设置 |
| TXT-02 | 花字渐变 | `gradient c4 --from "#FF0000" --to "#0000FF"` | clip 应用渐变色 |
| TXT-03 | SRT 字幕导入 | `subtitle ./subs.srt --style caption` | 生成多个 text clips |
| TXT-04 | 不存在的动画类型 | `--in invalid_anim` | 报错 UNKNOWN_ANIMATION |
| TXT-05 | 文字动画带 duration | `animate c4 --in fadeIn --out slideUp --duration 0.5` | animateIn/Out 和 duration 均正确设置 |
| TXT-06 | 对不存在的 clip | `animate c999 --in fadeIn` | 报错 CLIP_NOT_FOUND |

### 3.6 `export` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| EXP-01 | 正常导出 | `--output ./out.mp4` | 生成 MP4 文件，时长/分辨率正确 |
| EXP-02 | 指定质量 | `--quality high --crf 18` | 导出文件码率符合 crf 设置 |
| EXP-03 | 空时间线导出 | 无任何 clip | 报错 EMPTY_TIMELINE |
| EXP-04 | 导出封面 | `thumbnail --time 3 --output ./thumb.jpg` | 生成 JPG 文件 |
| EXP-05 | 导出进度 | `--watch` | 实时输出进度条 |
| EXP-06 | JSON 输出 | `--json` | 输出进度 JSON 流 |
| EXP-07 | 导出过程中文件变化 | 源文件在导出中被修改 | 不受影响（读取快照） |
| EXP-08 | 指定编码预设 | `--preset slow` | 导出文件符合 slow preset 编码参数 |
| EXP-09 | 指定音频码率 | `--audio-bitrate 320k` | 导出文件音频码率符合设置 |
| EXP-10 | 无效输出路径 | `--output /root/forbidden.mp4` | 报错 PERMISSION_DENIED 或 CANNOT_WRITE |

### 3.7 全局选项

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| GBL-01 | 指定项目目录 | `--project /path/to/project` | 操作指定目录项目，不受当前目录影响 |
| GBL-02 | JSON 输出模式 | `--json` | 所有输出为机器可解析 JSON |
| GBL-03 | 静默模式 | `--quiet` | 抑制 stderr 输出，只有 stdout 结果 |
| GBL-04 | 指定 FFmpeg 路径 | `--ffmpeg /usr/local/bin/ffmpeg` | 使用指定路径的 FFmpeg |
| GBL-05 | 无效 FFmpeg 路径 | `--ffmpeg /nonexistent/ffmpeg` | 报错 FFMPEG_NOT_FOUND |
| GBL-06 | 全局选项组合 | `--project /a --json --quiet` | 多个选项同时生效 |

### 3.8 `template` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TPL-01 | 保存为模板 | `save --name "my_template" --tag "test"` | 生成 .cfc.json 文件 |
| TPL-02 | 使用模板创建项目 | `use my_template --vars title="test"` | 生成 ffclaw.json，含变量替换 |
| TPL-03 | 列出模板 | `list` | 输出本地模板列表 |
| TPL-04 | 查看模板信息 | `info my_template` | 输出变量列表及说明 |
| TPL-05 | 验证模板 | `validate ./t.cfc.json` | 检查 schema 和变量引用 |
| TPL-06 | 缺少必填变量 | `use t --vars title="x"` | 报错 MISSING_VARIABLE |
| TPL-07 | 变量类型错误 | `vars title=123`（期望 string） | 报错 INVALID_VARIABLE_TYPE |

### 3.9 `preview` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| PRV-01 | 预览整个时间线 | `preview` | 生成低码率 MP4，crf=28 |
| PRV-02 | 预览单个素材 | `--clip v1` | 将 asset v1 渲染为视频（单素材预览，使用 asset ID） |
| PRV-03 | 预览特定时间点 | `--time 5` | 生成该时间点的帧图片 |
| PRV-04 | 预览转场效果 | `--transition fade --clip1 v1 --clip2 v2` | 预览两个素材之间的转场效果 |

### 3.10 `queue` 命令

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| QUE-01 | 批量渲染 | `render t1 --data products.jsonl --concurrency 2` | 顺序/并发渲染多个视频 |
| QUE-02 | 查看队列状态 | `status` | 输出待处理/渲染中/完成/失败数量 |
| QUE-03 | JSON 格式 | `--json` | 输出详细任务列表 |
| QUE-04 | 并发数超限 | `--concurrency 999` | 报错 INVALID_CONCURRENCY |
| QUE-05 | 数据文件格式错误 | jsonl 中有 invalid json | 该任务标记失败，继续其他任务 |
| QUE-06 | 移除任务 | `remove t1` | 任务从队列移除 |

---

## 4. 模块单元测试用例

### 4.1 project.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| PRJ-UT-01 | 加载有效 ffclaw.json | 正确格式的 JSON 文件 | 返回完整 project 对象 |
| PRJ-UT-02 | 加载无效 JSON | 文件格式错误 | 报错 INVALID_JSON |
| PRJ-UT-03 | 加载缺失字段 | 缺少 version 字段 | 报错 MISSING_FIELD |
| PRJ-UT-04 | 原子写 | 写入新内容 | 先写 tmp 再 rename，无损坏 |
| PRJ-UT-05 | 保存后重新加载 | 修改后保存再加载 | 内容完全一致 |
| PRJ-UT-06 | 版本兼容检查 | version=999.0 | 报错 INCOMPATIBLE_VERSION |

### 4.2 timeline-model.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| TLM-UT-01 | addClip 生成唯一 ID | 连续添加 3 个 video clip | 返回 c1, c2, c3 |
| TLM-UT-02 | getDuration 空 | 无 clips | 返回 0 |
| TLM-UT-03 | getDuration 有 clips | 3 个 clips | 返回最长 end 时间 |
| TLM-UT-04 | splitClip 边界情况 | at=0 | 报错 INVALID_SPLIT_POINT |
| TLM-UT-05 | splitClip 产生正确时长 | split 后两个 clip 时长相加 = 原时长 | 成立 |
| TLM-UT-06 | removeClip 更新 transitions | 删除的 clip 在 transitions 中 | 关联 transitions 清除 |
| TLM-UT-07 | toJSON 完整性 | 任意操作后 toJSON | 包含所有字段，可反序列化 |

### 4.3 builder.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| BLD-UT-01 | 单 video clip | timeline 只有 1 个 clip | 生成 1 个 FFScene |
| BLD-UT-02 | 多 video clips 串联 | 2 个 clips | 生成 2 个 FFScene，第二个 Scene 有 transition |
| BLD-UT-03 | 音频 clip | timeline 含 audio clip | FFCreator.addAudio() 被调用 |
| BLD-UT-04 | 文字 clip | timeline 含 text clip | FFText 节点加入对应 Scene |
| BLD-UT-05 | 变速参数 | clip speed=2.0 | FFVideo 使用正确参数 |
| BLD-UT-06 | 滤镜参数 | clip.filter 有值 | FFmpeg filtergraph 包含对应滤镜 |
| BLD-UT-07 | 图片 clip | clip type=image | FFImage 节点创建正确 |
| BLD-UT-08 | 转场参数 | transition 存在 | FFScene.setTransition() 调用正确 |
| BLD-UT-09 | builder 返回可调用实例 | build() 返回值 | 可调用 .start() 方法 |

### 4.4 filter-dsl.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| FDS-UT-01 | warm_sunshine 展开 | preset=warm_sunshine | 返回 brightness/saturation/temperature 参数 |
| FDS-UT-02 | adjust 覆盖部分字段 | brightness=10 | 其他字段保持不变 |
| FDS-UT-03 | toFFmpegFilter 输出 | 正确参数 | 输出符合 FFmpeg eq/unsharp 语法 |
| FDS-UT-04 | 多个滤镜叠加 | brightness + sharpen | filtergraph 字符串正确拼接 |
| FDS-UT-05 | 参数范围校验 | brightness=999 | 报错 OUT_OF_RANGE |

### 4.5 template/engine.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| ENG-UT-01 | 简单变量替换 | `{{title}}` | 正确替换为 vars 中的值 |
| ENG-UT-02 | 未定义变量 | `{{undefined_var}}` | 报错 UNDEFINED_VARIABLE |
| ENG-UT-03 | 嵌套变量 | `{{a.{{b}}}}` | 不支持，报错 INVALID_SYNTAX |
| ENG-UT-04 | 多处同一变量 | 同一变量出现 3 次 | 全部替换 |
| ENG-UT-05 | 变量为文件路径 | `{{bg_video}}` = `./a.mp4` | 路径中包含 `/` 和 `.mp4` 不被误识别为分隔符 |

### 4.6 asset-store.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| ASS-UT-01 | add 生成 ID | 添加 video | 分配 v+N |
| ASS-UT-02 | list 按类型过滤 | `list('video')` | 只返回 video 类型 |
| ASS-UT-03 | get 返回完整信息 | `get('v1')` | 包含 duration/width/height/hasAudio |
| ASS-UT-04 | remove 清理关联 | 删除 asset | timeline 中引用该 asset 的 clip 报错 |

### 4.7 template/validator.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| VAL-UT-01 | 必填变量缺失 | vars 缺少 required=true 的变量 | 报错 MISSING_VARIABLE |
| VAL-UT-02 | 变量类型错误 | string 类型字段传了 number | 报错 INVALID_VARIABLE_TYPE |
| VAL-UT-03 | 文件类型变量 | 期望 video 但传入 .png | 报错 INVALID_FILE_TYPE |
| VAL-UT-04 | 合法变量集 | 所有 required 变量提供且类型正确 | 返回 true，无报错 |
| VAL-UT-05 | 默认值填充 | optional 变量未提供 | 使用 default 值 |

### 4.8 render/progress-reporter.js

| Case ID | 描述 | 输入 | 预期结果 |
|---------|------|------|---------|
| REP-UT-01 | 进度输出格式 | progress 事件（percent=45） | 输出 `{"type":"progress","percent":45,...}` |
| REP-UT-02 | 完成输出格式 | complete 事件 | 输出 `{"type":"complete","output":"...","duration":...}` |
| REP-UT-03 | 错误输出格式 | error 事件 | 输出 `{"type":"error","code":"...","message":"..."}` |
| REP-UT-04 | --json 模式切换 | enableJSON(true) 后 | 所有输出变为 JSON 格式 |
| REP-UT-05 | ETA 计算 | 已知 frame/totalFrames/fps | 正确计算剩余时间 |

---

## 5. 端到端测试用例

### 5.1 工作流测试

| Case ID | 描述 | 步骤 | 验收标准 |
|---------|------|------|---------|
| E2E-01 | 快速剪辑工作流 | new → import → timeline add → export | 导出 MP4 可正常播放 |
| E2E-02 | 带转场剪辑 | 添加 3 个 clips + 2 个转场 | 转场效果可见 |
| E2E-03 | 带滤镜剪辑 | filter apply → export | 导出视频有滤镜效果 |
| E2E-04 | 带文字剪辑 | timeline add text → export | 文字正确显示在视频中 |
| E2E-05 | 批量渲染工作流 | template save → queue render | 所有任务完成，输出文件正确 |
| E2E-06 | 模板使用工作流 | template use → export | 变量替换正确，结果符合预期 |
| E2E-07 | 变速剪辑 | speed 2.0 → export | 导出视频速度为原视频 2x |
| E2E-08 | 音频淡入淡出 | fade → export | 音频开头/结尾有淡入淡出效果 |

### 5.2 边界条件测试

| Case ID | 描述 | 步骤 | 验收标准 |
|---------|------|------|---------|
| E2E-BC-01 | 1秒极短视频 | clip 1s → export | 导出正常，无崩溃 |
| E2E-BC-02 | 5分钟长视频 | clip 5min → export | 导出正常，无内存溢出 |
| E2E-BC-03 | 竖屏视频 | 9:16 → export 16:9 | 正确裁剪/填充 |
| E2E-BC-04 | 无音频视频 | noaudio.mp4 → export | 导出正常，音频轨道为空 |
| E2E-BC-05 | 多语言字幕 | 3 种语言 SRT → export | 字幕时间轴正确 |

---

## 6. 验收标准

### 6.1 功能验收

所有 Case ID 对应的测试必须通过（标记为 PASS），不允许 FAIL。

### 6.2 性能验收

| 指标 | 目标 |
|------|------|
| `timeline show` 响应时间 | < 100ms（100 个 clips 内） |
| `import --list` 响应时间 | < 500ms（50 个 assets 内） |
| 导出启动时间 | < 2s（不含实际渲染） |
| 单元测试执行时间 | < 30s（全量） |

### 6.3 稳定性验收

**内存泄漏测试：**
```bash
# 使用 Node.js --expose-gc 和 process.memoryUsage() 采样
node --expose-gc
> global.gc()
> initial = process.memoryUsage().heapUsed
> // 执行 100 次循环
> final = process.memoryUsage().heapUsed
> growth = (final - initial) / 1024 / 1024  # MB
> // 通过标准：growth < 50MB
```

**并发稳定性测试：**
- 10 个并发渲染任务全部完成
- 无崩溃、无死锁

**中断恢复测试：**
- 导出进行中发送 SIGTERM
- 文件被截断或损坏 → FAIL
- 文件不存在或正常 → PASS

### 6.4 兼容性验收

| 环境 | 要求 |
|------|------|
| macOS 12+ | 正常运行 |
| Ubuntu 20.04+ | 正常运行 |
| Node.js 18/20/22 | 正常运行 |
| FFmpeg 4.4+ / 5.x / 6.x | 正常 |

---

## 7. 测试报告格式

每个版本发布前生成测试报告，包含：

```json
{
  "version": "1.0.0",
  "date": "2026-04-01",
  "results": {
    "unit": { "total": 150, "passed": 148, "failed": 2, "coverage": "92%" },
    "integration": { "total": 30, "passed": 30, "failed": 0 },
    "e2e": { "total": 15, "passed": 15, "failed": 0 }
  },
  "failed_cases": [
    { "id": "FLT-05", "reason": "自定义预设参数未正确持久化" }
  ],
  "notes": "建议在 v1.0.1 中修复 FLT-05"
}
```
