# ClipCraft

> 剪映是 GUI，ClipCraft 是 CLI 版剪映。基于 FFCreator 的命令行视频剪辑工具，面向会用剪映的剪辑师，无需写代码。

## 项目结构

```
ClipCraft/
├── bin/
│   └── clipcraft.js           # CLI 入口（yargs 路由）
├── src/
│   ├── commands/              # CLI 命令层（参数解析 + 输出格式化）
│   │   ├── new.js            # 新建项目
│   │   ├── import.js         # 素材导入
│   │   ├── timeline.js       # 时间线编辑（子命令：add/show/trim/split/move/...）
│   │   ├── filter.js         # 滤镜调色
│   │   ├── text.js          # 文字字幕
│   │   ├── export.js         # 导出视频
│   │   ├── template.js       # 模板管理
│   │   ├── preview.js        # 草稿预览
│   │   └── queue.js          # 批量渲染
│   ├── core/                  # 核心业务逻辑（无 UI 依赖，可独立单测）
│   │   ├── project.js         # ffclaw.json 读写（原子写）、校验
│   │   ├── timeline-model.js  # 多轨时间线纯数据操作
│   │   ├── builder.js         # ★ 多轨时间线 → FFCreator API 翻译层
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
│       └── id-gen.js          # clip ID 生成（c1/c2...）
├── templates/                   # 内置模板
│   ├── product-showcase.cfc.json
│   ├── slideshow.cfc.json
│   └── subtitle-reel.cfc.json
├── test/
│   ├── unit/                  # 单元测试（每个模块独立可测）
│   ├── integration/           # 集成测试（端到端工作流）
│   └── fixtures/              # 测试素材
│       └── assets/
│           ├── video/         # 测试用视频素材
│           ├── audio/         # 测试用音频素材
│           ├── image/         # 测试用图片素材
│           └── subtitle/      # 测试用字幕文件
├── docs/
│   ├── design.md              # 设计文档
│   └── test-spec.md           # 测试规范文档
├── package.json
└── README.md
```

## 与 FFCreator 的关系

```
ClipCraft/src/      ← 纯新增，不碰 FFCreator 代码
FFCreator/          ← 作为 peerDependency 引用
```

ClipCraft 作为独立 npm 包发布，依赖 FFCreator 作为 peer dependency。

## 开发

```bash
# 安装依赖
npm install

# 链接本地 FFCreator（开发时）
npm link ../FFCreatorClaw

# 运行测试
npm test

# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# lint
npm run lint

# CLI 调试（本地 link 后）
node bin/clipcraft.js --help
```

## 核心命令

```bash
clipcraft new --name "项目名" --ratio 16:9
clipcraft import video ./素材.mp4
clipcraft import audio ./音乐.mp3
clipcraft import image ./logo.png
clipcraft timeline add video v1
clipcraft timeline add audio a1 --loop
clipcraft timeline show
clipcraft export --output ./out.mp4
```

详细命令设计见 [docs/design.md](docs/design.md)。

## 架构要点

### Builder 翻译层（核心难点）

FFCreator 是场景串联模型，ClipCraft 是多轨并行模型。Builder 负责将多轨时间线切分为 FFCreator 的 Scene 序列：

1. 收集所有切割点（clip start/end + transition 边界）
2. 切成 Scene 段
3. 每段 Scene 确定可见 clips
4. 设置 Scene transition
5. 全局音频 + 文字分配

### FFCreator 改动（极小）

| 文件 | 改动 | 原因 |
|------|------|------|
| `ffprobe.js` | 标准化返回值 | import 需要统一的 duration/width/height/hasAudio |
| `synthesis.js` | 透传 FFmpeg filtergraph | filter adjust 需要注入 eq/unsharp |
| `index.js` | 确认 node 类导出 | builder.js 需要 FFVideo/FFText 等 |

这些改动作为 FFCreator 的小 PR 合入，不影响 FFCreator 自身功能。

## License

MIT
