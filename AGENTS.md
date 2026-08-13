# FishTongue Agent Instructions

## Phase 7.1 结项状态

- Phase 7.1 已于 2026-08-14 通过外部 Windows 人工验收并正式结项；计划见 `docs/phase-7-development-plan.md`，验收基线见 `docs/phase-7-1/`。
- 当前数据库版本是 v16：v15 是 Phase 6 的借词证据备注迁移，v16 建立项目操作日志和持久化撤销/重做。
- 正式写入必须接入统一项目操作协议；撤销/重做必须原子、可冲突检测、重启后可用，新操作清空重做栈，最多保留最近 100 条。
- 历史阶段词典编辑必须形成当前阶段覆盖，不得修改来源阶段；内部默认状态不得进入普通导航，`no_data` 阶段继续拒绝语言数据。

## Phase 6 结项状态

- Phase 5 已于 2026-08-09 通过外部 Windows 人工验收并结项；Phase 6 已于 2026-08-13 通过外部 Windows 人工验收并正式结项。
- 正式词典、语素、造词配置、审核批次和撤销使用 Phase 3 数据模型与真实 Repository；
  数据库迁移 v4 修复候选恢复，迁移 v5 支持同一批次分次提交和逐次撤销。
- 确定性造词固定使用 `wordgen-profile-v1`、`splitmix64-v1` 和十进制字符串种子。
- 候选不得绕过审核写入词典；批量提交和撤销必须保持原子性。
- Phase 3 总验收命令是 `npm run verify:phase3`。
- Phase 4 已结项；其回归命令是 `npm run verify:phase4`。
- Phase 5 数据库版本是 v12；v8 建立历史模型，v9 将阶段与上下文改为一次原子保存，
  v10 修复既有项目漏迁移，v11 允许词源关系引用历史事件，v12 持久化完整语言基本属性；每次打开项目数据库前必须由 Rust 显式执行全部待处理迁移；
  旧语言和新语言都必须拥有一个不可删除的内部默认状态。
- Phase 5 的时间父级与数据基础是两个独立关系；无记录阶段固定使用 `no_data`。
- Phase 5 总验收与外部人工验收均已通过；回归命令是 `npm run verify:phase5`。
- Phase 6 已结项，规划与验收基线见 `docs/phase-6-development-plan.md`；本阶段不做 Morfessor、自动语素切分、音韵对应或逆向重构。Analysis Sidecar 只产生候选和证据，不得自动重建祖语、修改谱系或绕过审核写入正式数据。
- Phase 6 最终数据库版本是 v15：v13 建立正式音系和借词审核数据，v14 允许持久化 `borrowing_adaptation.suggest` 安全提案，v15 持久化借词证据备注。IPA 分析边界将拉丁小写 `g` 兼容映射为 IPA 小写 `ɡ`，但不得改写用户保存的词形或显示文本。
- Phase 4 必须保持 AI 默认只读；任何正式修改都要经过结构化提案、验证、差异预览和用户确认。
- API Key 只存 Windows 凭据管理器，不得进入项目、SQLite、Store 明文、日志或测试夹具。

## 开始工作

- 先读 `README.md`；桌面调整方案覆盖此前冲突的 Web 架构决定。
- 再读 `.context/CONTEXT.md`；它记录当前代码的组合根、依赖方向和跨阶段接口边界。
- Phase 1～Phase 6 已通过验收；Phase 6 实施与回归基线见
  `docs/phase-6-development-plan.md`。
- Phase 1.5 的产品、信息架构和 UI/UX 以 `docs/phase-1-5-ui-ux-design-spec.md` 为最高优先级基线；与旧文档冲突时采用该方案。
- Phase 3 只把通过真实 Repository 和 Sidecar 验证的词典、语素与造词能力标为
  可运行；其他设计稿、页面骨架或预留入口不得写成已经可用的功能。
- 以真实仓库状态为准；不要假设计划中的代码、命令或测试已经完成。
- 实施前检查真实目录、清单、锁文件、测试和未提交改动。
- 最终用户只安装 FishTongue；基础功能不得依赖登录、云服务或 LLM。

## 桌面架构

- 目标是单机、单用户、本地优先的 Tauri 2 桌面应用。
- UI 必须采用设计方案规定的全窗口桌面工作区；禁止回到营销页式大标题、居中单列、大卡片堆叠和浏览器原生弹窗。
- `design-system/fishtongue/MASTER.md` 是锁定的视觉令牌源；未经用户明确同意，不得更换风格、颜色、字体、间距、圆角、阴影、图标或动效令牌。
- UI 流程固定为 `ui-ux-pro-max → frontend-design → emil-design-eng → web-design-guidelines`；`frontend-design` 是唯一主设计师。
- 所有新增界面使用统一组件和中英文资源；不为手机端设计，至少适配 `1280 × 800`。
- Next.js/React 只做静态前端；构建必须支持 `output: "export"`。
- 不新增 API Routes、Server Actions、SSR、NextAuth 或 Node 服务端依赖。
- Tauri Rust 层负责窗口、菜单、文件、设置、SQLite、Sidecar 和安装能力。
- 数据流固定为 `UI → Service → Repository → Tauri SQL Plugin → SQLite`。
- React 页面不得直接执行 SQL、访问项目文件或管理子进程。
- SQLite 是正式项目数据的唯一权威来源；不恢复 Neo4j 主数据源。

## 项目数据与安全

- 项目使用 `.fishtongue` 容器，包含版本清单、SQLite 数据库和资源目录。
- 数据库与文件格式变更必须提供可测试迁移。
- 保存、备份或迁移失败时，不得覆盖最后一个可用项目文件。
- 普通设置存 Tauri Store；API Key 等秘密存加密存储。
- 秘密不得进入 SQLite 明文、JSON、`localStorage`、项目包、日志或测试夹具。
- Tauri capability 只授予所需的文件、Shell、SQL 和网络范围。
- LLM 不能直接提交、删除、覆盖词典或应用语言演化。

## Sidecar 与语言学约束

- Lexurgy 保持 Kotlin/JVM；禁止重写规则语言、ANTLR 或音变核心。
- Lexurgy 本地 API 只监听 `127.0.0.1` 随机端口。
- Tauri 负责 Sidecar 启动、健康检查、超时、日志和退出清理。
- Analysis Sidecar 按需启动，返回结构化 JSON，任务结束后关闭。
- Sidecar 异常不得损坏项目或留下不可控进程。
- 一词多义使用独立 `Sense`；词源和借词使用可追踪关系。
- Language 可不显示阶段，但数据使用内部默认状态；启用阶段后，历史演化创建新 `LanguageStage`，不得覆盖源状态。
- 无记录阶段只保存背景和关系，不得伪造词典、音系、形态或可翻译数据。
- 轻量方言采用继承加差异；任何有数据阶段在应用层都必须解析为完整有效状态。
- LLM 和 PanPhon 只提出候选或证据；Morfessor 已移出 Phase 6。
- 批量生成必须经过审核，并保存输入、规则版本和随机种子。
- AI 与安全脚本默认只读；修改只能形成提案或补丁，经验证、预览和用户确认后提交。

## 质量、上游与许可证

- Phase 1 总验收命令是 `npm run verify:phase1`；Phase 1.5 开发需新增对应的可重复总验收命令。
- 运行适用的 Jest、Cypress、Rust、迁移和上游 Lexurgy 测试。
- 桌面改动至少验证静态导出和安装启动；项目保存从 Phase 1、Sidecar 清理从 Phase 2 起强制验证。
- 数据改动验证迁移、备份、失败恢复和旧项目兼容。
- 通用 Lexurgy 修复优先回馈上游；FishTongue 功能放在独立模块。
- 不删除 GPL-3.0、原作者版权或第三方许可证声明。
- 发布前核对 Sidecar、JRE、Python 产物和数据集的再分发条件。

## 沟通

- 维护者是零代码基础用户；使用简明中文，先给结果，再解释术语。
- 每次交付说明变更、验收步骤、测试结果、未验证项和剩余风险。
