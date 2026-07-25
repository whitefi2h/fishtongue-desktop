# Phase 1 验收报告

> 状态：本机开发验收与外部 Windows 人工验收均通过。

- 目标版本：`0.1.0-phase.1`
- 开发分支：`phase-1/local-project`
- 基线标签：`phase-0.0.1`
- 本机验收日期：2026-07-23
- 外部验收日期：2026-07-25
- 外部验收证据：用户在另一台 Windows 电脑完成并确认；未提供截图

## 当前结论

**Phase 1 开发验收和外部人工验收均已通过。**

用户已确认外部人工验收通过。截图不是验收通过的强制条件，本报告将用户确认作为
人工证据记录。`main` 合并与 `phase-1.0.1` 标签尚未执行，不能写成已经完成。

## 自动化测试

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| `npm run test-ci -- --runInBand` | 通过 | 15 个套件、58 项测试通过 |
| `npm run cypress-unit` | 通过 | 15 个规格、69 项组件测试通过 |
| `npm run build:desktop` | 通过 | Next.js 静态导出 4 个页面 |
| `npm run audit:phase1` | 通过 | 18 个产物文件；无 NextAuth、Neo4j、Bolt 地址或 API 输出目录 |
| `cargo test --manifest-path .\src-tauri\Cargo.toml` | 通过 | 10 项 Rust/SQLite 测试通过 |
| `cargo check --manifest-path .\src-tauri\Cargo.toml` | 通过 | 无编译错误 |
| `npm run tauri:build` | 通过 | 成功生成 Windows x64 NSIS |

## 本机真实桌面冒烟

使用 release 可执行文件完成：

1. 发现上次异常工作区；
2. 恢复项目并强制另存为新文件；
3. 创建语言“祖语甲”；
4. 等待 3 秒自动保存；
5. 关闭项目；
6. 从最近项目重新打开；
7. 确认项目名和“祖语甲”保持一致。

解包保存结果后确认：

- 容器只有 `manifest.json`、`project.db`、`assets/`、`exports/` 和 `history/`；
- 未包含 `project.db-wal` 或 `project.db-shm`；
- `PRAGMA integrity_check` 返回 `ok`；
- `projects` 与 `languages` 数据存在且 Unicode 正常。

冒烟测试曾发现打包器误包含 `project.db-shm`，导致安全校验拒绝保存。现已修复，
并新增回归测试；失败期间没有生成损坏的目标项目。

## 项目文件与数据验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 新建、打开、保存、另存为、恢复 | 通过 | 本机真实桌面冒烟 |
| 导入 `.fishtongue` | 自动化通过 | v1/未知旧版/未来版注册表与拒绝测试 |
| 多语言 | 通过 | Cypress + 本机 SQLite 往返 |
| 词条与多个 Sense | 通过 | Cypress + 单语句触发事务测试 |
| Evolution 与测试词 | 通过 | Repository/Cypress；引擎明确显示未接入 |
| 外键与级联删除 | 通过 | 真实内存 SQLite 集成测试 |
| Unicode 数据 | 通过 | SQLite 中 `ŋa`、中文项目名和 Sense |
| 3 秒自动保存 | 通过 | 本机真实桌面冒烟 |
| 备份保留 10 份 | 通过 | Rust 保留策略测试 |
| 保存失败保护 | 通过 | 无效数据库打包失败后原文件内容不变 |
| ZIP 路径穿越 | 通过 | Rust 拒绝绝对路径、`..` 和异常根目录 |
| 崩溃恢复 | 通过 | 本机恢复后强制另存为 |

## 安装包

- 文件：`FishTongue_0.1.0-phase.1_x64-setup.exe`
- 大小：3,645,203 字节（3.48 MiB）
- SHA-256：`4D14173CC7DA1BD573656F52C81B85E04E0C9A18B244BD11477E2438757FF666`
- 签名：未签名（当前开发阶段预期状态）

## 外部 Windows 人工验收

用户于 2026-07-25 确认外部人工验收通过。由于没有截图，本报告不声称保存了
逐步骤图像证据；自动化、本机冒烟和外部人工确认共同构成本阶段验收依据。

## 已知风险

| 等级 | 风险 | 当前处理 |
| --- | --- | --- |
| P2 | Windows 安装包未签名，会显示发行者未知 | Phase 7 处理代码签名 |
| P2 | 真实磁盘满/权限不足尚未在外部机器验证 | 已有失败保护测试，列入人工验收 |
| P2 | 旧 Web 源码仍在仓库供上游回归测试使用 | 桌面静态构建通过 `*.desktop.tsx` 隔离；服务端包仅为开发依赖 |

## 后续阶段

Phase 1 已具备结项条件。根据最新产品决定，先实施
[`../phase-1-5-ui-ux-design-spec.md`](../phase-1-5-ui-ux-design-spec.md)，
完成桌面 UI/UX 与信息架构重构后再进入 Phase 2。
