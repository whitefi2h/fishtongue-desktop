# FishTongue 开发上下文

## Phase 7.2 实施边界

- Phase 7.2 正在开发，尚未通过独立 Windows 人工验收，不得标记为正式结项。详细计划、风险和验收材料位于 `docs/phase-7-2/`。
- Schema v17 将可编辑 `EvolutionPlan`、不可变 `EvolutionPlanVersion`、不可变 `EvolutionRun` 与可编辑至提交前的 `EvolutionDelivery` 分开持久化。旧 `evolutions` 只迁移为默认方案；Phase 5 的旧阶段演化证据不删除。
- 默认数据链固定为“来源显示词形 → 来源 IPA → Lexurgy → 目标 IPA → 人工确认目标拼写”。缺少 IPA 不得静默改用显示词形；临时 IPA 只进入运行快照。
- `EvolutionApplicationService` 是演化方案、阶段解析、Lexurgy、IPA 分析、提交和项目操作协议的统一协调入口。React 不直接访问 SQLite 或 Sidecar。
- 提交草稿检查必须通过 Analysis Sidecar 的批量 IPA 命令完成（大型词典按 512 项安全分片）；不得为每个词分别启动 Python 进程。Lexurgy 与 Analysis Sidecar 在窗口收到关闭请求时立即清理，并在窗口销毁事件再次兜底。
- 演化产生的未登记音必须先在提交草稿中配置为独立音位或既有音位的变体；分布/条件从逐规则追踪与 Lexurgy 规则预填。确认配置只解除检查阻断，正式提交时才把音系差异与词典、阶段或后代语言作为同一个项目操作原子写入；失败、撤销和重做不得留下孤立音系记录。
- 测试词通过 `previewTestWords` 直接做临时 Lexurgy 试跑，不读取正式词典，也不创建版本、运行或提交记录；只有正式词典输入可以建立可提交的不可变运行。
- 运行与原始逐规则追踪不可修改。拼写、跳过、同音确认和冲突决定只写入提交草稿；正式提交前必须重新检查来源与目标状态。
- 四类落点共用 `evolution_delivery_commit_commands` 原子入口；来源阶段不修改。提交形成一个全局项目操作，v17 的六组演化表已进入 Rust 项目操作快照。
- 演化图从阶段、语言关系和已提交 Delivery 推导；内部默认状态隐藏，不建立第二套图边权威数据。

## Phase 7.1 已封存边界

- Phase 7.1 已于 2026-08-14 通过外部 Windows 人工验收并正式结项；后续阶段必须回归其全局撤销/重做、阶段词典和导航语义。
- Schema v16 新增 `project_operations`。正式写入必须通过 `ProjectApplication.runProjectOperation` 形成一个可读、可冲突检测、可跨重启回放的项目操作；新操作清空重做栈，每个项目最多保留 100 条已完成操作。
- Rust `project_history` 在写入前保存待恢复快照，完成后只持久化实际变化；失败或下次打开项目时恢复 `pending` 操作。撤销/重做在单一 SQLite 事务内回放，当前行与预期状态不一致时拒绝覆盖。
- 全局快捷键只在非文本编辑环境生效；input、textarea、contenteditable 和 CodeMirror 使用各自的本地撤销栈。
- 历史阶段词典继续由 `StageStateResolver` 解析完整状态，编辑只保存当前阶段的 `lexicon` 覆盖；`no_data` 阶段不可编辑，内部默认状态不得进入普通导航。
- 入口审计、风险与人工验收基线位于 `docs/phase-7-1/`。

## Phase 6 规划边界

- Phase 6 已于 2026-08-13 通过外部 Windows 人工验收并正式结项；后续改动必须保持其自动化与人工验收基线。
- Phase 5 已通过外部 Windows 人工验收；其 Schema v12、历史阶段、谱系、方言、事件、词源、语言接触和跨阶段演化能力作为只回归、不改写语义的基线。
- Phase 6 最终升级到 Schema v15：v13 建立正式音系、音位表和分析批次，v14 补充 `borrowing_adaptation.suggest` AI 提案约束，v15 持久化借词证据备注；历史阶段音系继续由 `StageStateResolver` 解析，`no_data` 阶段拒绝音系数据。
- 借词工作区的未提交表单在当前应用会话内按“项目 + 当前语言”记忆；PanPhon 分析边界兼容拉丁小写 `g` 与 IPA 小写 `ɡ`，但正式词形和用户保存的 IPA 不做全局替换。
- 单条新建和 Phase 6 批量提交都按来源词自动判重，并在正式写入前由 Service 再次检查：同一来源与同一目标词形禁止重复保存，同一来源的不同目标词形必须由用户明确确认；批次内部也执行相同规则。批量重复弹窗允许逐条勾选不同词形，完全重复项固定禁用并从本次提交排除。删除借词时默认只删除关系；只有用户在应用内确认选择后，才通过删除目标词条及 SQLite 外键级联同时清理词条与关系。
- Analysis Sidecar 使用独立 Python/PyInstaller `onedir` 产物，由 Rust 以短命进程和 NDJSON 标准输入输出协议管理；React 不得直接访问进程或 Python。
- PanPhon 只输出 IPA 特征与映射候选；FishTongue 确定性规则完成配列修复，LLM 仅作可选解释。借词候选必须经过持久化审核，不能自动修改词典、谱系、历史阶段或 Lexurgy 规则。
- Morfessor、语素切分、音韵对应与逆向分析均已移出 Phase 6。
- 详细实施顺序、验收门和风险见 `docs/phase-6-development-plan.md`。

## Phase 5 已封存边界

- Phase 4 已通过外部 Windows 人工验收并由 `phase-4.0.1` 标签封存。
- Phase 5 使用 Schema v12；发布过的 v1 ～ v11 迁移不可修改。v9 通过命令表把阶段主体和
  阶段上下文合并为一次原子写入，并在新建阶段位置冲突时安全分配下一个位置；v10 修复
  已记录 v9 但缺少写入对象的既有项目；v11 为词源关系增加可空的历史事件证据链接，v12 为语言增加完整基本属性 JSON。Rust 在每次项目数据库打开前显式执行迁移，不能
  依赖 Tauri SQL 插件只在本次进程第一次加载固定数据库 URL 时消费的一次性迁移清单。
- 每门语言由 v8 迁移或新语言触发器创建一个隐藏的 `internal_default` 状态。它是旧词典、
  语素、演化、屈折和造词配置的安全锚点，不可删除。
- 历史阶段和轻量方言通过 `data_base_stage_id` 继承数据，通过
  `chronology_parent_id` 表达时间顺序；两条边不得混为一谈。
- `StageStateResolver` 是阶段有效状态的唯一正式解析入口。它按基础状态应用
  replace、merge 和 remove 差异，并拒绝循环或过深继承。
- `unrecorded` 阶段固定使用 `no_data`，只允许背景、证据和关系，不得保存语言组件。
- 项目允许多个根语言；主要遗传父级由数据库部分唯一索引限制为一个，接触关系单独保存。
- Phase 5 组合根在 `bootstrap.ts` 中装配 `HistoryApplicationService`、`StageStateResolver` 与五个 SQLite Repository；
  React 的历史工作区只依赖 `Phase5Application`。
- 正向演化先生成 `stage_evolution_batches` 审核批次；只有被接受且无冲突的候选才以事务
  写入目标阶段的词典差异。来源阶段永远不修改，最近提交可在目标差异未被编辑时撤销。
- AI Context Broker 只读阶段、谱系、历史事件和词源，并把项目文字视为不可信数据；
  Phase 5 不授予 AI 绕过编辑器或 Repository 写入历史数据的权限。

### Phase 5 依赖方向

```text
HistoryWorkspaces
→ Phase5Application
→ HistoryApplicationService / StageStateResolver
→ Phase 5 Repository Ports
→ SQLite Adapters
→ Schema v12
```

## Phase 4 已封存边界

- Schema v3 扩展 `lexemes`，并新增语素、造词配置、概念表、审核批次、候选和批量操作记录。
  数据库迁移 v4 修复候选撤销恢复，迁移 v5 增加批量选择写入、同一批次分次提交和逐次撤销，
  不引入新的 Phase 4 领域能力。
- `WordGenerationEngine` 与音变、屈折 Port 分离；唯一桌面 Adapter 复用同一个 Lexurgy
  Sidecar，协议固定为 v2。
- 造词算法固定为 `splitmix64-v1`，配置固定为 `wordgen-profile-v1`；种子以十进制字符串
  传递和保存，禁止经过 JavaScript `number`。
- 生成和派生只创建持久化审核批次，不直接写入词典。只有用户接受的无冲突候选可通过
  SQLite 原子事务写入 Lexeme、Sense、语素关系与操作记录。
- Phase 3 撤销只处理该阶段的批量提交。任何已提交词条在之后被修改，都会令整次撤销
  原子失败，不允许部分删除。
- 正式词典、语素库和造词工作台只能读取真实项目 Repository；原型数据不得混入。
- Phase 3 已通过外部人工验收并结项。Phase 4 在既有正式数据之外增加 AI 会话、上下文审计
  和结构化提案；AI 不得绕过现有 Service 与 Repository 写入正式数据。
- Provider 网络访问只存在于 Rust Adapter，API Key 只存在于 Windows 凭据管理器；
  React 不获得通用 HTTP、Shell、文件系统或凭据读取能力。
- Phase 4 的 AI 数据模型建立于 v6；验收修复迁移 v7 将数据库事务层的单次提案上限与应用层统一为 50。项目容器格式仍为 v1。

### AI 依赖方向与安全边界

```text
AiWorkspace
→ AiApplication
→ AiProviderPort / AiContextBroker / AiConversationRepository
→ TauriAiProviderAdapter / SQLite Repository
→ Rust Provider Adapter / Windows Credential Manager
```

- `src-tauri/src/ai.rs` 是唯一可读取 Provider 凭据并访问外部模型服务的模块。
- Provider 普通设置存 Tauri Store；项目数据库只保存 Provider 名称、类型、模型快照和
  对话审计，不保存 API Key。
- 自定义远程地址强制 HTTPS；仅 `localhost`、`127.0.0.1` 和 `::1` 可使用 HTTP。
- `ProjectAiContextBroker` 只通过 `ProjectApplication` 读取正式数据。“当前页面”包含该页面
  已实现的正式数据：词典页含词条、造词配置和批次摘要，形态页含语素和屈折系统，
  演化页含演化规则。页面、语言和项目范围均实施记录数与字节数上限。
- 模型返回的提案必须匹配五类白名单。保存前 `AiProposalService` 重新计算目标规范快照哈希；
  目标改变后提案只能进入 `stale`，不得覆盖。
- 单项词条、语素、造词、演化和屈折提案先填入对应正式编辑器，由用户修改、验证并手动保存。
  演化草稿填入前必须调用真实 `SoundChangeService` 验证 Lexurgy 语法。
  同一回答中的多个词条或语素提案进入高密度可编辑表格，最多 50 项；首列决定接受或拒绝，
  提交前可以恢复选择，之后才逐项通过正式提案事务保存。保存成功必须通知当前词典或语素库
  重新读取 Repository。
  提案卡片必须跟随产生它的助手消息显示，不能脱离对话顺序堆在侧栏底部。
- 单次提案数量必须在提示词、响应解析和 SQLite 原子写入三层统一为 50。流式阶段不得显示
  `fishtongue-proposals` 原始 JSON；写入失败后必须重新读取会话、保留已经持久化的用户消息并清除“正在回答”状态。
- Provider 提案是外部不可信数据。造词配置在进入 UI 前必须归一化为
  `symbols/value`、`pattern`、`count`；屈折规则在进入引擎前必须归一化并校验为
  `form`、`formula` 或 `split` 规则树。提示词约束不能代替运行时校验。
- 下一轮 Provider 请求必须在固定字符预算内附带先前结构化提案的摘要、状态和 patch；
  只保留自然语言正文会丢失“另一个/不同的提案”所需的会话记忆。响应解析还必须按
  “提案类型 + 规范化 patch”阻止同一会话中的完全重复提案。
- AI 会话写入也必须调用 `ProjectApplication.markProjectChanged()`，从而进入既有项目自动保存、
  备份和恢复流程。

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
- Windows 上传给 Java 启动器的 JRE/JAR 路径不得保留 Tauri/Win32 的 `\\?\`
  verbatim 前缀；Java 可读取该路径中的清单，却无法从同一 JAR 加载主类。
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
- 原型数据只允许在没有真实项目快照时使用。真实项目即使包含零门语言，也必须保持真实空状态，绝不能回退到原型项目、原型语言或示例统计。
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
- Sidecar/IPC 返回值属于不可信边界数据。Rust Command 和前端 Adapter 必须在交给
  Service/UI 前补齐可选集合并校验形状；UI 不得直接假设外部响应中的空数组或空对象存在。
- Schema v2 新增 `inflection_systems` 和 `inflection_test_cases`。规则与测试输入
  持久化，生成结果不持久化；v1 项目只在活动工作区迁移，保存前仍走备份保护。
- 真实项目的 Evolution 和“形态学 → 屈折系统”可以启动引擎；设计原型模式不得
  启动 Sidecar、访问 Repository 或显示伪造运行结果。
- 正式词典页面必须经 `ProjectApplication` 读写当前 Language 的 Lexeme 与独立
  Sense；原型词典不得作为真实项目或 Evolution“当前词典”输入源。
- 所有正常关窗入口必须先经 `ProjectApplication.closeProject()` 完成保存、数据库
  关闭和活动工作区清理，再允许 Tauri 真正关闭窗口；进程被强制终止时才保留恢复工作区。
- Tauri 最终关窗前必须解除前端 `onCloseRequested` 监听，再调用已授权的 `close`；
  不得依赖监听器内部的隐式 `destroy`，也不得为此扩大窗口权限。
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
npm run verify:phase3
npm run verify:phase4
npm run verify:phase5
npm run verify:phase6
npm run verify:phase7-1
npm run verify:phase7-2
```

如果某项因本机工具或下载条件未运行，报告为“未验证”，不得写成通过。
