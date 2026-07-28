# Phase 4 验收报告

## 当前结论

Phase 4 的实现和本机自动验收已经完成，尚未通过外部 Windows 人工验收，不得创建结项标签。

## 已实现

- Schema v6：AI 会话、消息、结构化提案和上下文审计。
- Windows 凭据管理器中的 Provider API Key。
- OpenAI、Gemini、DeepSeek 和 OpenAI 兼容服务 Adapter。
- HTTPS、回环 HTTP、同源重定向和凭据脱敏边界。
- 页面、语言和项目三级只读上下文。
- 五类单聚合提案、快照冲突检查、领域验证和显式保存。
- 正式模型设置页、会话侧栏、引用记录、停止请求和提案卡片。

## 自动验证记录

- Jest：19 个测试套件、72 项测试全部通过。
- Cypress：17 个规格、94 项测试全部通过。
- Rust 与 Schema v6：21 项测试通过，`cargo check` 通过。
- Lexurgy/造词引擎及契约回归：通过。
- Next.js 静态导出、Phase 4 架构与秘密扫描：通过。
- Windows x64 NSIS 安装包：`FishTongue_0.4.0-phase.4_x64-setup.exe`。
- 安装包大小：51,118,382 字节。
- SHA-256：`72E92D93769AEF63903FF4B32D68DBC993C438EBDDA2FE7E7E10C5573CAE25D2`。
- 安装包内容审计：通过。
- 数字签名：未签名。

## 未验证项

- 用户自有 OpenAI、Gemini、DeepSeek Key 的真实联网冒烟测试。
- Windows Credential Manager 外部读取检查。
- 跨电脑移动项目后 Key 不随项目移动。
- 断网、卸载和重装。
- OpenAI 兼容本地服务使用回环 HTTP 的实机测试。

只有上述人工验收通过且无 P0/P1 缺陷后，Phase 4 才能结项。
