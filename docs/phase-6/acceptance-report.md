# Phase 6 验收报告

日期：2026-08-10  
版本：`0.6.0-phase.6`  
状态：本机自动验收通过；等待外部 Windows 人工验收

## 已实现能力

- Schema v13：正式音系、借词方案、分析批次、候选及原子提交。
- 正式音位表、音位变体、音节与音位配列、重音与声调、PanPhon 检查工作台。
- 音系编辑改为 800 毫秒防抖自动保存；多行音位配列保持原始换行，检查页支持最多 500 条 IPA 逐行检查。
- 历史阶段音系继承、差异和独立快照；`no_data` 阶段禁止保存音系。
- PanPhon NDJSON v1 Sidecar：10 秒启动握手、60 秒任务超时、取消、输出限制、nonce 与协议校验、进程树清理。
- PanPhon Runtime 同时兼容 Tauri 开发目录和 NSIS 安装后的嵌套资源目录；安装脚本审计会验证真实安装路径。
- 单条和批量借词适配：显式映射、PanPhon 特征距离、替换、插音、删除、音节重组及完整轨迹。
- 语言对借词方案、批次临时覆盖、重音/声调、可选形态整合及用户显式选择的 Lexurgy 阶段链。
- 可选 `borrowing_adaptation.suggest` LLM 建议；未配置 LLM 或断网时，确定性基础流程仍可运行。
- 接受候选时，词条、Sense、语素关系和词源关系在同一事务中写入并立即刷新。
- Morfessor、音韵对应分析和逆向重构未加入 Phase 6。

## 自动验收结果

统一命令：`npm run verify:phase6`

| 项目 | 结果 |
|---|---|
| Jest | 24 suites / 93 tests，通过 |
| Cypress | 19 specs / 112 tests，通过 |
| Python / PanPhon | 5 tests，通过；打包环境强制使用 PanPhon 0.22.2 |
| Rust | 43 tests，通过；`cargo check` 通过 |
| Lexurgy | 上游、桌面协议及真实契约测试通过 |
| Next.js 静态导出 | 通过 |
| 架构与 Phase 6 边界审计 | 通过 |
| PyInstaller `onedir` | 构建及真实可执行文件冒烟通过 |
| NSIS 构建与包内容审计 | 通过 |

## 安装包

- 文件：`FishTongue_0.6.0-phase.6_x64-setup.exe`
- 大小：73,363,828 字节
- SHA-256：`8EC21AFA02B41780F564F32E8A39E3B5449F6288BCD0A07C9AFCDE653ABE2E66`
- 签名状态：未签名
- 内容审计：包含 FishTongue、Lexurgy/JRE、PanPhon/Python Runtime、SBOM、许可证和第三方声明

## 外部人工验收要求

需要在没有安装系统 Python 和 Java 的 Windows x64 电脑上执行 `docs/phase-6-development-plan.md` 的关键验收场景，重点检查：

1. 断网安装和启动。
2. 正式音系及历史阶段差异的保存与重开。
3. 单条和批量借词、PanPhon 映射、配列修复及重复运行一致性。
4. 无 LLM、配置 LLM、拒绝 LLM 建议三种路径。
5. 显式 Lexurgy 阶段链、逐规则追踪及失败保护。
6. 候选提交后词典、Sense、形态组成和词源追踪同时出现。
7. 强制终止分析任务以及退出应用后，没有残留 Python 或 Java 进程。

外部验收通过前，不创建 `phase-6.0.1` 标签。

## 剩余风险

- PanPhon 会拒绝不能识别的 IPA；用户必须修正或补充来源 IPA，系统不会猜测。
- LLM 结果只作为批次草稿建议，不具权威性，也不能绕过借词审核提交词条。
- Lexurgy 只运行用户显式选择的连续阶段链；路径不完整或不唯一时不会自动猜测。
- 安装包尚未进行代码签名，Windows 可能显示未知发布者提示。
