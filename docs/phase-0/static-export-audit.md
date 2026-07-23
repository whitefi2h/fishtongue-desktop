# Phase 0 静态导出审计

> 审计日期：2026-07-23
> 当前决定：采用单一桌面静态入口隔离路径

## 结论

上游没有发现 `getServerSideProps`、`getInitialProps` 或 Server Actions，但整套页面树仍包含 NextAuth 中间件、Neo4j、API Routes 和大量浏览器端 `/api` 请求。直接把完整上游应用静态导出会把 Phase 1 以后的迁移工作提前拉入 Phase 0。

Phase 0 因此只保留一个正式 Next.js 构建入口，复用 `/sc` 路由职责、`ScCodeEditor`、Lezer 语法和样式；其他旧 Web 页面保留在 Git 历史中，不进入桌面构建。不会建立第二套长期并行前端。

## 审计分类

| 类别       | 发现                                          | Phase 0 处理                                               |
| ---------- | --------------------------------------------- | ---------------------------------------------------------- |
| 保留       | `src/sc/ScCodeEditor.tsx`、解析器、语法和样式 | 直接复用                                                   |
| 客户端隔离 | `localStorage`、`window`、`document`          | 桌面切片避免构建期访问；只在客户端挂载后使用               |
| 桌面替代   | `/api/services` 音变校验与执行                | 经 `SoundChangeEngine` Port 隔离；Phase 2 接 Tauri/Lexurgy |
| 暂缓       | 语言、词典、世界、翻译等页面                  | 不进入 Phase 0 桌面入口                                    |
| 删除候选   | NextAuth、中间件、API Routes、Neo4j 数据层    | 不进入桌面构建；后续按阶段正式移除                         |

## 关键证据

### Web 后端耦合

- `src/middleware.ts` 使用 `next-auth/middleware`；
- `src/pages/_app.tsx` 使用 NextAuth Session；
- `src/db.ts` 直接创建 Neo4j Driver；
- `src/pages/api/` 包含认证、语言、词典、世界和服务代理接口。

### `/sc` 远程调用

- `src/sc/scPublicPage.tsx` 渲染 `ScRunner`；
- `ScRunner` 编辑规则时调用 `requestValidation`；
- `src/sc/api.ts` 通过 Axios 请求 `/api/services`；
- “Apply”按钮触发远程音变执行和轮询。

因此 Phase 0 不直接使用 `ScRunner` 的远程默认实现，也不展示伪造的校验或音变结果。

## `/sc` 复用标准

桌面切片必须保留：

- `/sc` 路由职责；
- `src/sc/ScCodeEditor.tsx`；
- `src/sc/scParser.js` 和 Lezer 高亮；
- 与编辑器有关的现有样式；
- CodeMirror 输入、括号补全、撤销、行号和语法高亮能力。

桌面切片可以替换：

- 旧网站 Header；
- 登录、分享、帮助链接和示例链接；
- 远程规则状态；
- Apply、Trace、Start At、Stop Before 等依赖 Lexurgy 引擎的控件。

所有替换都必须在验收报告中列出，不能把编辑器切片描述成完整音变引擎。

## 后续入口

Phase 0 建立：

```text
Desktop Sound Change UI
→ SoundChangeService
→ SoundChangeEngine
→ UnavailableSoundChangeEngine
```

Phase 2 只替换最外层适配器：

```text
Desktop Sound Change UI
→ SoundChangeService
→ SoundChangeEngine
→ TauriLexurgyEngine
→ Tauri Command
→ Lexurgy Kotlin/JVM Sidecar
```
