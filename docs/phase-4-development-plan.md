# FishTongue Phase 4 开发计划

## 目标

Phase 4 将 AI 侧栏接入 OpenAI、Gemini、DeepSeek 和 OpenAI 兼容服务。AI 只能读取用户
允许的项目范围并形成结构化提案；正式数据仍须经过领域验证、差异预览和用户确认。

## 实施顺序

1. 封存 Phase 3，建立 `phase-3.0.1` 标签和 Phase 4 分支。
2. 将项目数据库升级到 Schema v6，持久化会话、消息、提案和上下文审计。
3. 使用 Windows 凭据管理器保存 API Key，普通 Provider 设置保存到 Tauri Store。
4. 在 Rust 中实现四类 Provider、地址策略、模型列表、连接测试、取消和错误映射。
5. 建立只读 Context Broker，对页面、语言和项目范围实施数据量上限。
6. 建立安全提案服务，逐项验证并阻止过期提案覆盖新数据。
7. 将模型设置和 AI 侧栏接入正式桌面工作区。
8. 运行 `npm run verify:phase4`，再进入干净 Windows 外部人工验收。

## 固定边界

- React 不直接访问网络、凭据、SQL 或 Tauri。
- API Key 不进入 `.fishtongue`、SQLite、Store 明文或日志。
- 每个提案只修改一个聚合对象，不提供批量应用。
- 模型不能删除数据、提交候选、执行音变写回或修改项目和语言结构。
- 无 Provider、断网或模型故障时，Phase 1～3 功能不受影响。

## 完成门

- Schema v5→v6 迁移、备份和失败保护通过。
- 四类 Provider 契约、上下文限制、取消和错误映射通过。
- 对话重开后存在，项目迁移到另一台电脑时 Key 不随项目迁移。
- `npm run verify:phase4` 和外部人工验收通过，且无 P0/P1 缺陷。
