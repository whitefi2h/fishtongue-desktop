# Phase 6 风险表

| 风险 | 控制措施 | 状态 |
|---|---|---|
| 用户电脑没有 Python | PyInstaller `onedir` 随 NSIS 发布 | 已自动验证产物 |
| 中文 Windows 读取 PanPhon UTF-8 数据失败 | Sidecar 初始化期间固定 UTF-8 | 已通过打包 EXE 冒烟 |
| Sidecar 超时或残留 | 每任务独立进程、取消、超时、进程树清理 | Rust 测试通过 |
| 借词被误当派生 | 默认继承词性/释义；形态整合必须显式启用 | 服务测试通过 |
| 候选跨电脑顺序变化 | 固定算法、目标音位顺序和 Unicode code point 排序 | 服务测试通过 |
| LLM 绕过审核 | 仅允许 `borrowing_adaptation.suggest`，提交仍走候选审核 | 架构审计通过 |
| 迁移或提交留下半条数据 | v13 事务与触发器原子提交 | SQLite/Rust 测试通过 |
| 第三方许可遗漏 | 锁定依赖、生成 SBOM 和许可证目录 | 构建审计通过 |
