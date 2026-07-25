# FishTongue Phase 2 验收报告

状态：**自动验收完成，外部干净 Windows 人工验收待执行；Phase 2 尚未结项。**

## 交付版本

- 桌面应用：`0.2.0-phase.2`
- 引擎：`1.7.6-fishtongue.1`
- 协议：`1`
- Lexurgy 上游基线：`fa5027711cba3cd6a3f4b6defd0d38181fa98cd4`
- 引擎源码提交：`a8defc541faa8e1615c2fa1ba800fef6d86311ba`
- Temurin：`21.0.11+10-LTS`，Windows x64
- 引擎 Release：
  <https://github.com/whitefi2h/fishtongue-engine/releases/tag/engine-1.7.6-fishtongue.1>
- 引擎 ZIP SHA-256：
  `01B8C364ABB86906662556D8356ADB69E7B99038846C8D60AA4FC6889A3C39AE`
- NSIS 安装包：
  `FishTongue_0.2.0-phase.2_x64-setup.exe`
- 安装包大小：`50,931,246` 字节
- 安装包 SHA-256：
  `3EEDCF03BC6B29F483B7246520F11C2F1DB34D7B1BDA1DF16CA150B5EE79E0AB`
- 签名状态：未签名（开发阶段安装包）

## 自动验收范围

`npm run verify:phase2` 是唯一总验收入口，必须全部成功：

- Jest：领域、Service、错误映射和架构边界；
- Cypress：Phase 1.5 回归、真实 Evolution、真实屈折、原型隔离；
- Next.js 静态导出和敏感引用审计；
- SQLite Schema v2、事务、Unicode、级联删除和项目文件失败保护；
- Rust Supervisor、路径、令牌、轮询 URL、项目容器和迁移测试；
- 全部 Lexurgy Core/API/CLI 上游测试和桌面协议测试；
- 使用安装包同款 jlink Runtime 的真实引擎契约测试；
- `cargo check`、NSIS 构建和安装资源审计。

2026-07-26 最终完整运行结果：**通过**。Jest 15 个测试套件、62 项测试通过；
Cypress 15 个规格、78 项测试通过；Rust 14 项测试通过；Lexurgy 全部上游和桌面
协议测试通过；真实引擎契约、静态审计、NSIS 构建和安装资源审计通过。安装资源
审计确认 10 类必要资源和 11 个 JRE 法律模块目录存在且非空。

## 安全与数据结论

- Sidecar 只监听回环地址和随机端口，每次启动生成新认证令牌。
- React 无 HTTP、Shell、通用文件系统或 Sidecar 进程权限。
- 音变和屈折结果没有持久化接口，不修改词典、不创建语言阶段。
- Schema v1 只在活动工作区迁移到 v2；保存仍受备份和原文件保护。
- 安装资源包含引擎 GPL-3.0、JRE `legal/`、第三方声明、版本清单和 SBOM。

## 尚未验证

以下项目必须由没有安装 Java 的外部 Windows x64 电脑验证：

- 无系统 Java 时可启动引擎；
- 安装、卸载、重装和断网运行；
- 中文/空格路径；
- 取消、手动结束 Sidecar 和应用退出后的进程树清理；
- Phase 1 实际项目迁移并往返保存。

步骤见 [`manual-acceptance-guide.md`](manual-acceptance-guide.md)。通过后才可合并
`main` 并创建 `phase-2.0.1` 标签。
