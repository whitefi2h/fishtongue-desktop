# FishTongue 开发上下文

本文件记录需要跨阶段长期保持的实现边界。产品目标和用户说明见
[`README.md`](../README.md)，代理工作规则见 [`AGENTS.md`](../AGENTS.md)。

## 当前组合方式

- 正式桌面前端仍是同一个 Next.js 项目。
- `next.config.mjs` 通过 `pageExtensions: ["desktop.tsx"]` 隔离旧 Web 页面，只构建
  `src/pages/*.desktop.tsx`。
- `src/pages/sc.desktop.tsx` 是音变编辑器路由的组合入口。
- `src/fishtongue/bootstrap.ts` 是桌面依赖的组合根；页面不得自行创建基础设施实现。
- `src/sc/ScCodeEditor.tsx` 和 Lezer 语法来自上游 Lexurgy App，应优先复用而不是复制。

## 依赖方向

```text
页面 / UI
  → Application Service
    → Application Port
      ← Infrastructure Adapter
```

未来本地数据链路固定为：

```text
UI → Service → Repository → Tauri SQL Plugin → SQLite
```

UI 不得直接导入 Tauri、SQL、文件系统、Sidecar 或具体 Infrastructure Adapter。

## 分阶段接口

- Phase 0 的 `SoundChangeEngine` 只暴露真实可回答的引擎状态。
- 不提前设计尚未验证的规则执行接口，也不返回模拟校验或模拟音变结果。
- Phase 1 在独立 Repository Port 后接入 SQLite 和 `.fishtongue` 项目文件。
- Phase 2 扩展 `SoundChangeEngine` Port，并用 Kotlin Lexurgy Sidecar 实现。
- 新的 Tauri capability 必须随实际功能逐项增加；Phase 0 只保留 `core:default`。

## 常用验证

```powershell
npm run test-ci
npm run cypress-unit
npm run build:desktop
cargo check --manifest-path .\src-tauri\Cargo.toml
npm run tauri:build
```

如果某项因本机工具或下载条件未运行，报告为“未验证”，不得写成通过。
