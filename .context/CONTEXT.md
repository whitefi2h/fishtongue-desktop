# FishTongue 开发上下文

本文件记录需要跨阶段长期保持的实现边界。产品目标和用户说明见
[`README.md`](../README.md)，代理工作规则见 [`AGENTS.md`](../AGENTS.md)。
Phase 1.5 的页面、交互和功能信息架构见
[`docs/phase-1-5-ui-ux-design-spec.md`](../docs/phase-1-5-ui-ux-design-spec.md)。
锁定的视觉令牌见
[`design-system/fishtongue/MASTER.md`](../design-system/fishtongue/MASTER.md)。

## 当前组合方式

- 正式桌面前端仍是同一个 Next.js 项目。
- `next.config.mjs` 通过 `pageExtensions: ["desktop.tsx"]` 隔离旧 Web 页面，只构建
  `src/pages/*.desktop.tsx`。
- `src/pages/index.desktop.tsx` 是唯一正式桌面入口，挂载 Phase 1.5 自定义窗口与工作区。
- `src/fishtongue/ui/FishTongueDesktopApp.tsx` 负责视觉壳和原型页面；旧 Phase 1 页面不再挂载。
- `src/fishtongue/bootstrap.ts` 是桌面依赖的组合根；页面不得自行创建基础设施实现。
- `src/sc/ScCodeEditor.tsx` 和 Lezer 语法来自上游 Lexurgy App，应优先复用而不是复制。
- 窗口操作必须经 `DesktopWindowPort`，UI 不得直接导入 Tauri Window API。
- `src-tauri/src/project_files.rs` 独占 `.fishtongue` 解包、保存、备份和恢复。
- 活动数据库固定为应用配置目录下 `active-project/project.db`。
- `src-tauri/src/lexurgy.rs` 独占 Lexurgy 进程、认证令牌、回环 HTTP、超时、
  取消、日志和退出清理；React 只能经 Application Port 和 Tauri Command 使用。
- `engine/engine-lock.json` 固定独立引擎提交、上游提交、协议、发布包、Fat JAR、
  Temurin 源和 SHA-256，构建不得接受不匹配产物。

## Phase 1.5 组合目标

- 应用壳固定为菜单、上下文工具栏、可折叠左侧导航、主工作区、可折叠 AI 侧栏和状态栏。
- 欢迎页、项目主页和语言工作区共享同一设计系统；业务页面使用表格、树、分栏和属性面板。
- 项目与语言是互斥的导航层级：项目页面只显示项目功能；语言页面只保留项目主页返回入口，再显示当前语言功能。
- 上下文路径在项目页面为“项目 → 页面”，在语言页面为“项目 → 语言 → 阶段/默认状态 → 模块”；项目、语言和阶段节点均承担真实导航或切换。
- 上下文工具栏维护最多 20 个页面级历史记录，提供返回按钮和 `Alt+左方向键`；它只回退工作区页面，不修改项目数据。
- 响应式布局按主工作区容器宽度调整，不能只依赖整个窗口宽度；AI 侧栏打开后仍须保证表单与分栏不溢出。
- AI 侧栏宽度使用 `clamp(260px, 22vw, 360px)`；其内部响应式规则读取侧栏自身宽度，而不是整个窗口宽度。
- 浏览器原生 `alert`、`confirm` 和 `prompt` 不得进入正式交互；文件选择继续使用原生文件对话框。
- 所有界面字符串进入统一中英文资源；项目内容不随界面语言切换。
- `1360 × 860` 是核心编辑流程的最小验收视口；`1440 × 900` 是标准截图尺寸，不建立手机端布局。
- 视觉实现必须使用 `design-system/fishtongue/tokens.css` 的语义变量；页面不得定义竞争性的颜色、字体、间距或动效体系。

## 依赖方向

```text
页面 / UI
  → Application Service
    → Application Port
      ← Infrastructure Adapter
```

未来本地数据链路固定为：

```text
UI → Service → Repository → Tauri SQL Plugin → SQLite
```

UI 不得直接导入 Tauri、SQL、文件系统、Sidecar 或具体 Infrastructure Adapter。

AI Context Broker 和安全脚本工作台也必须走 Application Port。它们不得直接读取
SQLite、文件系统、网络、系统进程或秘密；任何修改先产生提案或补丁，再经验证、
差异预览、用户确认和事务提交。

## Language 状态模型

- 每个 `Language` 都有一个可解析的数据状态；用户未启用阶段系统时，内部默认状态不显示为历史阶段。
- 启用阶段后使用用户自由命名的 `LanguageStage`；名称不能用于推断先后顺序。
- 有数据阶段的有效状态由继承和差异解析；应用层需为词典、音系、形态和书写系统提供统一解析接口。
- “无记录”阶段只保存背景和关系，不能自动继承或生成可用语言数据。
- 轻量方言继承指定状态并保存差异；转换为独立快照后，上游变化不再自动传播。
- 所有迁移必须保留 Phase 1 数据，并在失败时保持最后一个可用项目不变。

## 分阶段接口

- Phase 0 的 `SoundChangeEngine` 只暴露真实可回答的引擎状态。
- 不提前设计尚未验证的规则执行接口，也不返回模拟校验或模拟音变结果。
- Phase 1 已在 Repository Port 后接入 SQLite 和 `.fishtongue` v1；未知旧版本与未来版本安全拒绝。
- Phase 1.5 在 Schema v1 上设计可测试迁移，引入内部默认状态和可选阶段基础；不得假装现有 Schema 已具备这些字段。
- Phase 1.5 的 AI 侧栏是受控入口和交互壳；完整模型接入仍属于 Phase 4。
- Phase 1.5 的谱系、演化、开发者工具等 P1 项必须明确区分“真实能力”和“可交互原型”。
- Phase 2 已扩展 `SoundChangeEngine` 并新增独立 `InflectionEngine` Port；
  `TauriLexurgyEngineAdapter` 是唯一可调用引擎 Command 的前端适配器。
- Schema v2 新增 `inflection_systems` 和 `inflection_test_cases`。规则与测试输入
  持久化，生成结果不持久化；v1 项目只在活动工作区迁移，保存前仍走备份保护。
- 真实项目的 Evolution 和“形态学 → 屈折系统”可以启动引擎；设计原型模式不得
  启动 Sidecar、访问 Repository 或显示伪造运行结果。
- 音变和屈折预览不得修改 Lexeme、Sense 或 LanguageStage。
- Phase 1 capability 只开放 Dialog、SQL 和 Store；没有 Shell、HTTP 或通用文件系统权限。

## 常用验证

```powershell
npm run test-ci
npm run cypress-unit
npm run build:desktop
npm run audit:phase1
cargo check --manifest-path .\src-tauri\Cargo.toml
npm run tauri:build
npm run verify:phase1
npm run verify:phase1-ui
npm run verify:phase2
```

如果某项因本机工具或下载条件未运行，报告为“未验证”，不得写成通过。
