# FishTongue Phase 2 实施清单

本文件把已批准的 Phase 2 方案映射到真实实现。Phase 2 只有在自动验收和无 Java
干净 Windows 外部人工验收都通过后才结项。

## 交付边界

- 真实能力：Lexurgy 规则验证、只读音变预览、运行追踪、取消、屈折规则与测试输入
  持久化、只读屈折预览。
- 不属于本阶段：把生成结果写回词典、创建 `LanguageStage`、确定性造词、LLM、
  PanPhon、Morfessor、批量审核或多平台发行。
- 最终用户只安装 FishTongue；Java 运行时、引擎和许可证随安装包携带。

## 任务状态

| 编号 | 交付 | 状态 | 主要证据 |
| --- | --- | --- | --- |
| P2-00 | 封存 Phase 1.5、建 Phase 2 分支与版本 | 完成 | `phase-1.5.0`、`codex/phase-2-lexurgy-sidecar`、`0.2.0-phase.2` |
| P2-01 | 独立引擎仓库 | 完成 | `whitefi2h/fishtongue-engine`，上游基线 `fa50277…` |
| P2-02 | 回环、随机端口、令牌与协议 v1 | 完成 | `desktop-api` 协议测试 |
| P2-03 | Fat JAR、Temurin 21 jlink、SBOM | 完成 | 引擎 Release 和 `engine-lock.json` |
| P2-04 | Rust `LexurgySupervisor` | 完成 | `src-tauri/src/lexurgy.rs` |
| P2-05 | Port、Service、Adapter、Channel | 完成 | `SoundChangeEngine`、`InflectionEngine`、`TauriLexurgyEngineAdapter` |
| P2-06 | Schema v2 与屈折 Repository | 完成 | `0002_phase_2_inflection.sql` 和迁移测试 |
| P2-07 | 真实 Evolution 工作区 | 完成 | 验证、错误行列、两种输入源、追踪、取消 |
| P2-08 | 真实屈折工作区 | 完成 | 规则/测试输入保存与瞬时结果表 |
| P2-09 | 故障恢复和安全加固 | 完成自动测试 | 外部进程异常仍需人工复核 |
| P2-10 | 离线帮助、许可和构建审计 | 完成 | F1 快速参考、SBOM、静态审计 |
| P2-11 | `verify:phase2` | 完成 | 自动运行前端、Rust、SQLite、上游引擎、契约和 NSIS |
| P2-12 | 外部人工验收与结项 | 待用户验收 | `phase-2/manual-acceptance-guide.md` |

## 固定技术决定

```text
React UI
→ SoundChangeService / InflectionService
→ SoundChangeEngine / InflectionEngine Port
→ TauriLexurgyEngineAdapter
→ Tauri Command / Channel
→ Rust LexurgySupervisor
→ 127.0.0.1 随机端口
→ Kotlin Lexurgy Sidecar
```

React 无 HTTP、Shell、通用文件系统或进程权限。取消任务时先请求协作取消；为保证
Lexurgy 计算线程不会残留，宿主随后终止 Sidecar，下一次操作再重新启动。应用不会
自动重放失败、取消或崩溃时的任务。

项目容器格式仍为 v1，数据库版本升为 v2。正式保存继续使用 Phase 1 的临时包、
完整性检查、备份和替换恢复流程。

