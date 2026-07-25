# FishTongue Phase 1 开发计划

> 状态：开发与外部人工验收完成  
> 计划版本：1.0  
> 开始日期：2026-07-23  
> 目标平台：Windows 10/11 x64  
> 目标版本：`0.1.0-phase.1`

## 阶段目标

Phase 1 将 Phase 0 的桌面壳变为可实际保存数据的本地应用。用户无需登录，
也无需安装 Neo4j、Docker、Node.js 或 Java，即可创建、打开和保存
`.fishtongue` 项目，并在一个项目中管理多种语言、词条、独立词义和音变规则草稿。

一个窗口一次只打开一个项目；一个项目可以包含任意数量的语言。Phase 1 不区分
祖语和普通语言，也不建立语言谱系。

## 完成标准

- [x] 新建、打开、保存、另存为和恢复通过本机真实桌面冒烟；导入有自动化覆盖；
- [x] Language、Lexeme、Sense 和 Evolution 数据持久化通过；
- [x] SQLite 迁移、事务、外键和级联删除通过；
- [x] 自动保存、备份策略、失败保护和崩溃恢复通过自动化或本机冒烟；
- [x] 静态导出、Jest、Cypress、Rust 和 NSIS 构建通过；
- [x] 最终用户运行路径不依赖登录、Neo4j、Docker 或 Web 服务；
- [x] Phase 2 的 `SoundChangeEngine` 接口保持可扩展；
- [x] 外部 Windows 人工验收；
- [x] 当前本机验证范围内没有 P0/P1 级缺陷。

## 项目格式

`.fishtongue` 是 ZIP 容器，格式版本从 `1` 开始：

```text
project.fishtongue
├── manifest.json
├── project.db
├── assets/
├── exports/
└── history/
```

当前只支持 `.fishtongue`。格式 v1 直接打开；未来明确登记的旧版本通过迁移导入；
未知旧版本和更高版本安全拒绝。旧格式迁移不得覆盖源文件。

## 数据链路

```text
UI → Application Service → Repository Port → Tauri SQL Adapter → SQLite
```

UI 不得直接导入 Tauri、SQL、文件系统或 Infrastructure Adapter。项目文件操作
由 Rust 完成，前端不获得通用文件系统权限。

## 执行清单

| 编号 | 工作项 | 状态 |
| --- | --- | --- |
| P1-00 | 基线、分支、计划和版本 | 完成 |
| P1-01 | 领域模型、端口和架构护栏 | 完成 |
| P1-02 | Tauri SQL、Dialog、Store 和最小权限 | 完成 |
| P1-03 | Schema v1 与真实 Repository | 完成 |
| P1-04 | `.fishtongue` 容器、格式兼容和安全保存 | 完成 |
| P1-05 | 项目会话、启动页、菜单和快捷键 | 完成 |
| P1-06 | 多语言、词条和 Sense 界面 | 完成 |
| P1-07 | Evolution 持久化和 Phase 2 入口 | 完成 |
| P1-08 | 自动保存、备份和恢复 | 完成 |
| P1-09 | 旧 Web 运行依赖清理 | 完成（旧源码仅保留为静态构建隔离的上游参考） |
| P1-10 | 自动化、安装版和故障验收 | 完成 |
| P1-11 | 结项报告、合并和标签 | 验收报告完成；合并与标签尚未执行 |

## 本阶段不实现

- 语言谱系、祖语/后代标记和 `LanguageStage`；
- Neo4j、JSON 或未压缩目录项目导入；
- CSV 拖放导入；
- Lexurgy Sidecar、规则执行和规则验证；
- 造词、候选审核、LLM、词源、借词和分析 Sidecar；
- 多项目标签页和多窗口。

这些条目描述 Phase 1 的历史范围。后续产品与 UI 组织以
[`phase-1-5-ui-ux-design-spec.md`](phase-1-5-ui-ux-design-spec.md) 为准；
其中阶段基础移入 Phase 1.5，完整历史能力仍留在后续阶段。
