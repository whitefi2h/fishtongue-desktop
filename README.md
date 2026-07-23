# FishTongue Desktop

FishTongue 是面向奇幻世界创作者的开源人造语生成与管理桌面应用。用户安装一个程序，就能在本地创建、保存和演化语言项目；LLM 是可选助手，不是基础功能的运行前提。

> 当前状态：Phase 0 桌面壳已完成并通过验收。Tauri 2 窗口、静态 Next.js
> 前端、CodeMirror/Lezer 编辑器切片和 Windows 安装链路均已验证；
> Phase 1 尚未开始，SQLite、项目文件与 Lexurgy Sidecar 尚未接入。

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

SQLite 是正式项目数据的唯一权威来源。推荐的数据访问链路是：

```text
React UI → Service → Repository → Tauri SQL Plugin → SQLite
```

React 页面不得直接执行 SQL。数据访问层负责业务查询、事务、迁移和错误处理。

计划中的主要表包括 `projects`、`languages`、`language_stages`、`lexemes`、`senses`、`morphemes`、`linguistic_rules`、`evolutions`、`historical_events`、`etymology_relations`、`generation_batches`、`candidate_items`、`reference_profiles`、`versions` 和 `settings`。

原 Neo4j 图关系改为外键或关系表。例如：

- `Lexeme → Sense`：使用 `senses.lexeme_id`；
- 语言阶段继承：使用 `language_stages.parent_stage_id`；
- 借词和词源：使用 `etymology_relations` 关系表。

界面仍可将这些关系绘制为语言树和词源图，无需图数据库。

## Lexurgy Sidecar

Lexurgy 继续使用 Kotlin/JVM，不移植到 Rust。推荐采用常驻本地 API：

```text
FishTongue 启动
→ Tauri 启动 Lexurgy Sidecar
→ Lexurgy 监听 127.0.0.1 随机端口
→ 前端通过 Tauri 调用 scv1、validate、poll 和 inflectv1
→ FishTongue 退出时关闭 Sidecar
```

第一阶段随安装包携带最小 Java 运行环境。用户无需自行安装 Java，也不应看到或管理 Lexurgy 进程。

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

项目文件扩展名为 `.fishtongue`，计划使用 ZIP 容器：

```text
project.fishtongue
├── manifest.json   # 格式版本和项目元数据
├── project.db      # SQLite 数据库
├── assets/         # 用户导入的资料
├── exports/        # 导出结果
└── history/        # 可选备份和历史快照
```

桌面端必须支持新建、打开、保存、另存为、最近项目、自动保存、自动备份、旧项目导入和完整项目包导出。格式升级必须通过可测试的迁移完成；迁移失败不能破坏原文件。

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

首版必做：

- Windows 安装程序、独立窗口和原生菜单；
- 文件打开、保存、最近项目和默认项目目录；
- 自动保存、备份与崩溃恢复；
- CSV 拖放导入；
- Sidecar 生命周期管理；
- 单实例运行、日志目录和数据库迁移；
- 安装包版本管理。

后续再增加系统托盘、自动更新、文件关联、多窗口、代码签名和 Linux AppImage。

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
| Phase 2 | Lexurgy Sidecar      | 用户无需安装 Java 即可运行音变、验证规则并查看错误          |
| Phase 3 | 词典与造词           | 支持多词义、语素、确定性造词、审核、批量提交和撤销          |
| Phase 4 | LLM                  | 密钥加密；结构化提案；模型不能直写正式数据；无 LLM 模式可用 |
| Phase 5 | 历史与语言树         | 支持语言阶段、分支、词源、借词事件和 Lexurgy 演化链         |
| Phase 6 | Analysis Sidecar     | PanPhon、Morfessor、借词适配和逆向分析独立打包              |
| Phase 7 | 正式发布             | 安装、更新、备份、恢复、完整测试及跨平台构建                |

## 当前进度

Phase 0 已完成。详细任务、命令、验收证据和风险预案见
[`docs/phase-0-development-plan.md`](docs/phase-0-development-plan.md)。

最终验收结论见
[`docs/phase-0/acceptance-report.md`](docs/phase-0/acceptance-report.md)。

- [x] Fork Lexurgy App 并建立 `fishtongue-desktop`；
- [x] 加入 Tauri 2；
- [x] 将现有 `/sc` 页面改造为可静态导出的桌面编辑器切片；
- [x] 在真实 Tauri 窗口验证 CodeMirror 输入、撤销、行号和语法高亮；
- [x] 生成 Windows x64 NSIS 安装程序；
- [x] 记录现有前端测试基线；
- [x] 完成 Cypress 组件测试；
- [x] 完成干净 Windows 安装、卸载、重装验收。

下一步可以规划和实施 Phase 1“本地数据库与项目文件”。后续仍须遵循
`UI → Service → Repository → Tauri SQL Plugin → SQLite` 数据链路，
不得恢复 Neo4j 主数据源，也不得重写 Lexurgy 核心。

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

本文档以 `FishTongue桌面应用架构调整方案.docx` 为当前架构基线。它覆盖此前规划中与 Web 部署、NextAuth、Neo4j、Docker 用户部署和五仓库结构有关的决定；原功能目标与语言学原则继续有效。
