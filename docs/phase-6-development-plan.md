# FishTongue Phase 6：正式音系与智能借词适配开发计划

> 结项状态：已于 2026-08-13 通过外部 Windows 人工验收并正式结项。本文继续作为 Phase 6 回归与边界基线。

## 目标与边界

Phase 6 只交付两项正式能力：

1. 可供分析与历史阶段继承使用的正式音系系统。
2. 集成在“词源与接触”内的 PanPhon、确定性规则、可选 LLM 与可选 Lexurgy 借词适配工作台。

本阶段不实现 Morfessor、自动语素切分、音韵对应、逆向重构、自动祖语或谱系推断。LLM 始终可选；离线且未配置 LLM 时，基础借词流程必须完整可用。

## 正式工作流

```text
选择来源语言、阶段和词条
→ 获取并验证来源 IPA
→ PanPhon 分析音段特征与相似度
→ 映射到目标语言正式音位表
→ 检查目标语言音位配列
→ 替换 / 插音 / 删除 / 音节重组
→ 重音 / 声调适配
→ 可选目标语言形态整合
→ 可选：用户指定阶段链并运行已有 Lexurgy 音变
→ 可选：LLM 解释歧义和比较候选
→ 用户审核候选
→ 原子写入词条、Sense、语素关联与词源关系
```

固定规则：来源语言不能等于目标语言；缺少来源 IPA 时必须由用户补充临时 IPA；借入默认继承核心释义和词性；只有明确选择形态整合时才能增加语素或改变词性；Lexurgy 路径必须由用户选择；任何预览失败都不能修改正式数据。

## 架构

- Schema v13 保存正式音系、借词方案、分析批次和候选。
- `fishtongue-analysis` 是仅封装 PanPhon 的 Python 3.12/PyInstaller `onedir` 短命 Sidecar。
- Sidecar 使用 NDJSON v1，支持 `validate_ipa`、`describe_segments` 和 `rank_segment_mappings`；不监听端口、不读项目文件、不联网。
- React 仅调用 `Phase6Application`；进程、协议与取消由唯一 Tauri Adapter 和 Rust Supervisor 管理。
- `StageStateResolver` 负责历史阶段音系的继承、差异与快照；`no_data` 阶段拒绝音系数据。
- 借词方案作用域是“来源语言/阶段 → 目标语言/阶段”，结构版本为 `borrowing-profile-v1`。

确定性执行顺序不可由 LLM 改变：

```text
显式映射 → PanPhon 相似音位 → 配列检查 → 替换 → 插音
→ 删除 → 音节重组 → 重音/声调 → 形态整合 → 可选 Lexurgy
```

同分候选按目标音位顺序、规则顺序和 Unicode code point 稳定排序。每批最多 500 个来源词，每词最多 10 个候选。

## 数据

Schema v13 新增：

- `phonology_profiles` 与 `phonemes`；
- `borrowing_profiles`；
- `borrowing_batches` 与 `borrowing_candidates`；
- 原子写入命令 `borrowing_commit_commands`。

正式音系包括音位、音位变体、类别、音节模板、合法声母/韵核/韵尾/音丛、禁配、重音和声调规则。借词批次保存来源快照、音系与方案快照、哈希、PanPhon/算法版本、可选 Lexurgy 阶段链和候选审核状态；不保存 API Key。

## PanPhon、LLM 与 Lexurgy 分工

- PanPhon：验证 IPA、识别音段、比较特征并排序映射；不决定唯一借词，不修改词义/词性，不写数据库。
- FishTongue：执行稳定的映射、配列检查、修复、韵律/形态处理、去重、冲突检查和提交。
- LLM：只生成 `borrowing_adaptation.suggest`，解释歧义、比较候选或建议当前批次临时调整；不得直接生成 `lexeme.upsert` 绕过审核。
- Lexurgy：只运行用户明确选择的连续目标阶段链；路径不唯一或规则缺失时拒绝猜测。

## 界面

正式语音学标签固定为：

```text
音位表｜音节与音位配列｜重音与声调｜检查
```

借词流程继续位于现有“词源与接触”新建关系区，单条/批量共用工作区。候选审核显示来源/适配形式与 IPA、词性、释义、距离、配列警告、形态、Lexurgy/LLM 状态和完整轨迹。长说明只放在 `？` 帮助中。

## 任务与验收

- P6-00～04：封存 Phase 5；完成 Schema v13、PanPhon 许可审计、Sidecar 协议、Rust Supervisor 与打包。
- P6-05～08：完成 Port/Service/Repository、正式音系 UI、借词方案和确定性适配管线。
- P6-09～11：完成韵律/形态/Lexurgy、LLM 建议边界和语言接触工作区。
- P6-12～14：故障恢复、帮助、自动化、NSIS 和外部 Windows 验收。

总验收命令为 `npm run verify:phase6`，覆盖 Jest、Cypress、SQLite、Python、Rust、Phase 2～5 回归、静态导出、引擎测试、NSIS、SBOM、许可证和 SHA-256。

外部验收必须在无系统 Python 的 Windows x64 电脑上完成：正式音系与历史阶段差异、`no_data` 拒绝、单条/批量借词、固定输入可复现、临时方案、无 LLM、LLM 建议、显式 Lexurgy 链、原子提交、词典关联追踪、Sidecar 强制结束和 Phase 2～5 回归。

外部验收已于 2026-08-13 通过；发布标签在维护者明确执行发布时创建。
