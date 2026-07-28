# FishTongue Desktop

## Phase 4 实施状态（2026-07-28）

Phase 3 已通过干净 Windows 外部人工验收并正式结项。当前正式项目已使用
Schema v3，可保存扩展词条、独立词义、语素、造词配置、自定义概念表和候选审核批次。
人工验收补丁迁移 v5 允许一个审核批次分多次提交，每次提交都会形成可独立撤销的操作记录。
Lexurgy Sidecar 协议已升级为 v2，并加入固定 SplitMix64 v1 种子的离线确定性造词。
候选只有经用户接受后才会以原子事务写入词典；最近的 Phase 3 批量提交可以安全撤销，
但提交后被人工修改的词条会阻止整次撤销。

自动总验收命令为：

```powershell
npm run verify:phase3
```

Phase 4 正在实现多模型 AI 助手、安全上下文读取和结构化提案审核。AI 是可选能力；
未配置模型或断网时，项目、词典、造词、演化和屈折仍须正常工作。Phase 5 的词源、
历史阶段和谱系能力仍未实现。

人工验收提出的 IPA 音位选点、演化词典筛选、候选冲突处理和面向语言学新手的
离线 `⍰` 帮助要求，统一记录在
[`docs/product-follow-up-requirements.md`](docs/product-follow-up-requirements.md)。

FishTongue 是面向奇幻世界创作者的开源人造语生成与管理桌面应用。用户安装一个程序，就能在本地创建、保存和演化语言项目；LLM 是可选助手，不是基础功能的运行前提。

> 当前状态：Phase 0、Phase 1、Phase 1.5、Phase 2 和 Phase 3 已通过验收。Phase 2 已交付
> Lexurgy Sidecar、音变预览、屈折预览和 Schema v2，并通过无系统 Java 的外部
> Windows 验收。Phase 3 已交付正式词典、语素、确定性造词、候选审核、批量提交
> 和安全撤销。Phase 4 正在开发可选的多模型 AI 助手与安全提案系统。
> 其他设计原型入口不代表相应能力已经实现。

## 最终用户体验

FishTongue 的目标使用流程是：

```text
下载安装包
→ 安装并双击启动
→ 新建或打开 .fishtongue 项目
→ 在本地管理词典、音系、造词和语言演化
→ 按需配置在线或本地 LLM
```

最终用户不需要自行安装 Docker、Neo4j、Node.js、Python、Java，也不需要登录账户或启动独立服务。

## 当前产品与界面基线

Phase 1.5 以
[`docs/phase-1-5-ui-ux-design-spec.md`](docs/phase-1-5-ui-ux-design-spec.md)
为产品信息架构和 UI/UX 的最高优先级基线。它要求 FishTongue 从“网页装进桌面壳”
转为高信息密度的桌面工作软件，采用稳定导航、上下文工具栏、多栏工作区、可折叠
AI 侧栏和状态栏。

Phase 1.5 的实施边界是：

- P0 必须交付桌面框架、欢迎与创建流程、项目和语言工作区、应用内模态框、
  中英文国际化、阶段基础、无记录状态与 AI 侧栏基础壳；
- P1 应交付功能骨架或可交互原型，不能将原型标记为真实业务能力；
- P2 只显示清楚标注的后续入口，不提供误导性的可执行按钮；
- AI、批量操作和安全脚本只能生成草稿、提案或补丁，经验证、预览和用户确认后
  才能修改正式数据。

桌面系统架构、安全边界和本地优先原则继续有效。新方案覆盖旧文档中与页面结构、
功能入口、阶段引入时间和交互方式冲突的决定。

## 产品能力

- 参考现实语言建立音位、音节、重音和拼写方案；
- 按确定性规则批量生成基础词汇；
- 管理词义、词根、词缀、例句、词源和使用状态；
- 审核、编辑、接受、拒绝和撤销生成候选；
- 从祖语推演后代语言、方言和历史阶段；
- 分析已有词表中的候选语素和语音对应；
- 模拟借词、语言接触和语义变化；
- 用 LLM 辅助规划、分析和解释。

## 桌面架构

```text
FishTongue Desktop
├── Tauri 2
│   ├── 桌面窗口、菜单和单实例运行
│   ├── 项目文件、自动保存、备份与崩溃恢复
│   ├── SQLite、数据库迁移和本地设置
│   ├── Sidecar 生命周期管理
│   └── 安装、日志和更新
├── Next.js / React 静态前端
│   ├── 全窗口桌面工作区与中英文设计系统
│   ├── CodeMirror / Lezer 规则编辑器
│   ├── 词典、音系、审核和历史界面
│   └── Radix UI
├── SQLite
│   └── 本地项目和词典数据库
├── Lexurgy Sidecar
│   └── 音变、规则验证和词形生成
├── Analysis Sidecar
│   └── PanPhon、Morfessor 和借词分析
└── LLM Provider
    └── 用户配置的在线或本地模型
```

### 相比原 Web 方案的三项核心变化

| 原方案                     | 桌面方案                          |
| -------------------------- | --------------------------------- |
| Next.js 全栈 Web 应用      | Next.js 静态导出，作为 Tauri 界面 |
| Neo4j 服务端数据库         | 应用内嵌 SQLite                   |
| 独立 Lexurgy / Python 服务 | 随安装包携带的 Sidecar            |

首版采用单机、单用户和本地项目文件。NextAuth、在线注册、多用户权限、云端数据库和 Web 服务器部署不属于首版范围。

## 保留并继续使用的能力

FishTongue 不重写成熟的语言学核心：

- **Lexurgy Core**：音变规则语言、ANTLR 解析器、音位类别、音节、重音、规则验证、中间阶段和词形接口；
- **Lexurgy App 前端**：React 页面、CodeMirror 编辑器、Lezer 高亮、Radix UI、Jest 和 Cypress 测试；
- **PolyGlot**：选择性移植造词和候选审核逻辑，不移植 Swing、NetBeans 与 XML 存储；
- **PanPhon**：音位特征、音位距离和借词映射；
- **Morfessor**：候选语素切分；
- **Concepticon、PHOIBLE、CLTS、Glottolog**：版本化的概念和现实语言参考数据。

## 前端与本地能力的边界

Next.js 必须使用静态导出，构建结果由 Tauri 加载。以下能力不能留在 Next.js 服务端：

- API Routes；
- Server Actions；
- SSR 页面；
- 服务端 Session；
- 直接访问数据库的服务器函数；
- 依赖 Node.js 服务端环境的代码。

这些逻辑分别迁移到 Tauri Rust Command、SQLite 数据层、Lexurgy Sidecar 或 Analysis Sidecar。

## SQLite 数据层

SQLite 是正式项目数据的唯一权威来源。正式数据访问链路是：

```text
React UI → Service → Repository → Tauri SQL Plugin → SQLite
```

React 页面不得直接执行 SQL。数据访问层负责业务查询、事务、迁移和错误处理。

当前已验收的 Schema v2 持久化项目、语言、词条、独立 Sense、Evolution、屈折规则
和屈折测试输入。Phase 3 将升级至 Schema v3，加入词典扩展字段、语素、造词配置、
概念表、候选审核和批量操作记录。语言阶段、词源和历史事件仍属后续阶段。

原 Neo4j 图关系改为外键或关系表。例如：

- `Lexeme → Sense`：使用 `senses.lexeme_id`；
- 语言阶段继承：使用 `language_stages.parent_stage_id`；
- 借词和词源：使用 `etymology_relations` 关系表。

界面仍可将这些关系绘制为语言树和词源图，无需图数据库。

## Lexurgy Sidecar

Lexurgy 继续使用 Kotlin/JVM，不移植到 Rust。Phase 2 已实现按需启动的本地 API：

```text
FishTongue 启动（此时不启动 Java）
→ 首次进入真实演化或屈折功能时由 Tauri 启动 Lexurgy Sidecar
→ Lexurgy 监听 127.0.0.1 随机端口
→ 前端通过 Tauri 调用 scv1、validate、poll 和 inflectv1
→ FishTongue 退出时关闭 Sidecar
```

安装包携带由 Eclipse Temurin 21 生成的精简 Java 运行环境。每次启动使用新的
256 位认证令牌；React 无 HTTP、Shell 或进程权限。音变与屈折结果只存在内存，
不会写回词典或创建语言阶段。锁定版本和哈希见
[`engine/engine-lock.json`](engine/engine-lock.json)。

## Analysis Sidecar

PanPhon 和 Morfessor 继续使用 Python，并在发布时打包成独立可执行文件。分析进程按需启动：

```text
用户发起分析
→ Tauri 启动 Analysis Sidecar
→ 返回结构化 JSON
→ 任务结束后关闭进程
```

分析结果只提供候选与证据，不自动成为正式词素或规则。逆向分析和高级借词可推迟到 Phase 6，避免阻塞桌面基础功能。

## 本地项目文件

项目文件扩展名为 `.fishtongue`，Phase 1 已实现格式版本 1 的 ZIP 容器：

```text
project.fishtongue
├── manifest.json   # 格式版本和项目元数据
├── project.db      # SQLite 数据库
├── assets/         # 用户导入的资料
├── exports/        # 导出结果
└── history/        # 可选备份和历史快照
```

桌面端已支持新建、打开/导入受支持项目、保存、另存为、最近项目、3 秒自动保存、自动备份和异常退出恢复。当前没有早于 v1 的真实桌面项目，因此未知旧版本会被拒绝；新增兼容版本时必须同时提交迁移器和夹具。迁移失败不能破坏原文件。

## LLM 与密钥安全

普通设置（界面语言、主题、默认路径、模型和 Base URL）保存在 Tauri Store。

API Key、代理认证等敏感数据必须存入 Tauri Stronghold 等加密存储，不能写入：

- SQLite 明文字段；
- JSON 配置；
- `localStorage`；
- `.fishtongue` 项目文件；
- 日志。

LLM 只能产生结构化提案或候选，不能绕过审核直接修改正式词典或应用语言演化。无 LLM 时，词典、音系、造词、审核和 Lexurgy 演化仍须可用。

## 桌面功能范围

Phase 1 已交付 Windows 安装程序、项目文件、SQLite、多语言、词条、多 Sense、
Evolution 草稿、自动保存、备份与崩溃恢复。Phase 1.5 在这些能力上重建桌面
交互，并引入 Language 的内部默认状态和可选 `LanguageStage` 基础。

“导入项目”当前仍只接受受支持的 `.fishtongue`；语言交换格式、CSV 字段契约和
批量导入在格式规范确定前只保留入口或原型。系统托盘、自动更新、文件关联、
多窗口、代码签名和 Linux AppImage 继续留待后续。

## 仓库规划

项目调整为三个核心仓库：

```text
fishtongue-desktop   # Tauri、React、SQLite、项目文件、LLM、审核和安装
fishtongue-engine    # Lexurgy、规则验证、词形、造词和音系验证
fishtongue-analysis  # PanPhon、Morfessor、借词和逆向分析
```

参考数据可作为固定版本的构建资源纳入桌面仓库，也可放在独立数据目录。无论放在哪里，都必须保留来源、版本、许可证和署名信息。

## 开发路线图

| 阶段    | 目标                 | 核心验收                                                    |
| ------- | -------------------- | ----------------------------------------------------------- |
| Phase 0 | 桌面壳验证           | `FishTongue.exe` 可以安装和启动；CodeMirror 在 Tauri 中工作 |
| Phase 1 | 本地数据库与项目文件 | 不运行 Neo4j 和 Docker 也能创建语言和词条                   |
| Phase 1.5 | 桌面 UI/UX 与信息架构 | 统一桌面工作区；阶段基础；中英文组件；后续入口不误导用户  |
| Phase 2 | Lexurgy Sidecar      | 用户无需安装 Java 即可运行音变、验证规则并查看错误          |
| Phase 3 | 词典与造词           | 支持多词义、语素、确定性造词、审核、批量提交和撤销          |
| Phase 4 | LLM                  | 密钥加密；结构化提案；模型不能直写正式数据；无 LLM 模式可用 |
| Phase 5 | 完整历史与语言树     | 完善谱系、历史事件、词源、借词和跨阶段演化链                |
| Phase 6 | Analysis Sidecar     | PanPhon、Morfessor、借词适配和逆向分析独立打包              |
| Phase 7 | 正式发布             | 安装、更新、备份、恢复、完整测试及跨平台构建                |

## 当前进度

Phase 0 已完成。详细任务、命令、验收证据和风险预案见
[`docs/phase-0-development-plan.md`](docs/phase-0-development-plan.md)。

最终验收结论见
[`docs/phase-0/acceptance-report.md`](docs/phase-0/acceptance-report.md)。

Phase 1 的执行清单、真实测试证据和剩余人工验收项见
[`docs/phase-1-development-plan.md`](docs/phase-1-development-plan.md) 和
[`docs/phase-1/acceptance-report.md`](docs/phase-1/acceptance-report.md)。

Phase 1.5 的完整设计基线和文档冲突处理结果见
[`docs/phase-1-5-ui-ux-design-spec.md`](docs/phase-1-5-ui-ux-design-spec.md) 和
[`docs/phase-1-5/document-alignment-report.md`](docs/phase-1-5/document-alignment-report.md)。

Phase 2 的实施清单、自动验收证据和干净 Windows 人工验收步骤见
[`docs/phase-2-development-plan.md`](docs/phase-2-development-plan.md)、
[`docs/phase-2/acceptance-report.md`](docs/phase-2/acceptance-report.md) 和
[`docs/phase-2/manual-acceptance-guide.md`](docs/phase-2/manual-acceptance-guide.md)。

- [x] Fork Lexurgy App 并建立 `fishtongue-desktop`；
- [x] 加入 Tauri 2；
- [x] 将现有 `/sc` 页面改造为可静态导出的桌面编辑器切片；
- [x] 在真实 Tauri 窗口验证 CodeMirror 输入、撤销、行号和语法高亮；
- [x] 生成 Windows x64 NSIS 安装程序；
- [x] 记录现有前端测试基线；
- [x] 完成 Cypress 组件测试；
- [x] 完成干净 Windows 安装、卸载、重装验收。
- [x] 建立 SQLite Schema v1 与 Repository 边界；
- [x] 实现 `.fishtongue` 安全打包、版本校验、备份与恢复；
- [x] 实现多语言、词条、多 Sense 与 Evolution 草稿界面；
- [x] 加入 3 秒自动保存、原生文件菜单与最近项目；
- [x] 构建 Phase 1 Windows x64 NSIS 安装包；
- [x] 完成 Phase 1 外部 Windows 人工验收。
- [x] `frontend-design` 已完成 Phase 1.5 自定义窗口、桌面工作区和高保真页面原型。
- [x] `emil-design-eng` 已完成 Phase 1.5 交互精修、层级调整和两轮响应式问题修复。
- [x] `web-design-guidelines` 已完成 Phase 1.5 最终验收与无障碍修复。
- [x] 建立独立 `fishtongue-engine` 仓库、认证协议、精简 JRE 和可校验发布资产。
- [x] 实现 Rust Sidecar Supervisor、启动/超时/取消/退出清理和日志轮换。
- [x] 实现 Schema v2、真实音变工作区、真实屈折工作区和只读结果预览。
- [x] 建立 `npm run verify:phase2` 自动总验收。
- [ ] 完成无 Java 的干净 Windows 外部人工验收并正式结项 Phase 2。

交互精修的变更说明、截图和测试证据见
[`docs/phase-1-5/emil-design-engineering-report.md`](docs/phase-1-5/emil-design-engineering-report.md)。
项目/语言层级和受限宽度修订见
[`docs/phase-1-5/hierarchy-responsive-revision-report.md`](docs/phase-1-5/hierarchy-responsive-revision-report.md)。
最终 Web Interface Guidelines 验收结果见
[`docs/phase-1-5/web-design-guidelines-acceptance-report.md`](docs/phase-1-5/web-design-guidelines-acceptance-report.md)。

Phase 1.5 已完成验收。Phase 2 实施继续遵循
`UI → Service → Repository →
Tauri SQL Plugin → SQLite` 数据链路；不得恢复 Neo4j 主数据源，
也不得重写 Lexurgy 核心。

## 开发与发布边界

- Docker 可用于开发测试，但最终用户不能依赖 Docker；
- 不提供浏览器访问地址或首版 Web 部署；
- 不让 React 页面直接访问数据库或文件系统；
- 不把 Lexurgy 重写为 Rust；
- 不让 Python 分析服务长期常驻；
- 不把密钥写入项目文件或日志；
- 不把计划中的功能描述成已经实现。

## 许可证

Lexurgy 与 Lexurgy App 的 GPL-3.0 许可和原作者版权声明必须保留。移植 PolyGlot、使用 PanPhon、Morfessor 或打包开放数据时，必须保留对应许可证与署名。发布前应逐项复核 Sidecar、最小 JRE、Python 打包产物和数据集的再分发条件。

## 文档依据

系统架构仍以 `FishTongue桌面应用架构调整方案.docx` 为基线；产品信息架构、
UI/UX、交互和功能入口以
[`docs/phase-1-5-ui-ux-design-spec.md`](docs/phase-1-5-ui-ux-design-spec.md)
为最新基线。两者冲突时，新方案覆盖 UI 与功能组织决定；Tauri、本地优先、
SQLite 权威数据源、静态前端、保存安全和 Sidecar 隔离等系统约束继续有效。
