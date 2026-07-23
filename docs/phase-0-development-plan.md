# FishTongue Phase 0 开发计划

> 状态：待执行  
> 计划版本：1.1  
> 制定日期：2026-07-23  
> 目标平台：Windows 10/11 x64  
> 预计工作量：6～9 个开发工作日  

1.1 版根据项目自检结果补充：唯一仓库根目录、后续阶段接口边界、阶段性 N/A 验收规则，以及现有 `/sc` 页面的复用标准。

## 1. 用一句话说明 Phase 0

Phase 0 要证明一件事：**Lexurgy App 的现有 CodeMirror 音变规则编辑器，可以被放进 Tauri 2 桌面窗口，静态构建成无需 Node.js、Docker、Neo4j 或 Java 即可安装和启动的 Windows 应用。**

这不是正式产品版本。它是后续开发的“地基验收”：只有桌面壳、静态前端和安装链路都可靠，才进入本地数据库、项目文件和 Lexurgy Sidecar 开发。

## 2. 完成标准（Definition of Done）

Phase 0 只有在以下条件**全部通过**时才算完成：

- [ ] 已建立 `fishtongue-desktop` Git 仓库，并保留 Lexurgy App 的 GPL-3.0 许可证与原作者声明；
- [ ] 已记录所采用的 Lexurgy App 上游提交哈希，且仓库配置了 `upstream` 远程地址；
- [ ] `npm ci` 可以从锁文件完成全新安装；
- [ ] 原项目单元测试与 Cypress 组件测试的基线结果已记录；
- [ ] Next.js 使用 `output: "export"`，`npm run build` 生成 `out/` 静态文件；
- [ ] 运行时不使用 SSR、API Routes、Server Actions、NextAuth、Neo4j 或 Node.js 服务端；
- [ ] Tauri 2 开发模式可以启动 FishTongue 独立窗口；
- [ ] CodeMirror 可以输入、删除、选择、撤销、重做和自动补全括号；
- [ ] Lexurgy 规则关键字能显示语法高亮，行号正常；
- [ ] 桌面音变页面只通过 `SoundChangeEngine` Port 表达引擎需求，不直接依赖 Tauri 或远程 API；
- [ ] 未接入的音变运行和规则校验不会请求公网，也不会展示伪造结果；
- [ ] `npm run tauri:build` 能生成 Windows NSIS 安装程序；
- [ ] 在一台没有安装 Node.js、Rust、Docker、Neo4j 和 Java 的干净 Windows 环境中，安装、启动和卸载均成功；
- [ ] 已提交 Phase 0 验收报告、测试记录和必要截图；
- [ ] 没有 P0/P1 级缺陷，且所有已知限制均已写入验收报告。

## 3. 本阶段范围

### 必须完成

1. 上游代码基线与许可证保留；
2. Windows 开发环境检查；
3. 现有测试基线记录；
4. Next.js 静态导出兼容性审计；
5. Tauri 2 桌面壳；
6. `/sc` 音变编辑页面的桌面版最小切片；
7. CodeMirror 自动化测试与人工验收；
8. Windows NSIS 安装程序；
9. 干净环境安装验证；
10. 可供人类阅读的验收报告。

### 明确不做

- SQLite、`.fishtongue` 项目文件、自动保存和备份（Phase 1）；
- Lexurgy JVM Sidecar、规则校验和音变执行（Phase 2）；
- 词典、造词、审核、LLM、PanPhon 或 Morfessor；
- NextAuth、用户注册、云数据库或 Web 部署；
- 自动更新、代码签名、Microsoft Store、macOS 和 Linux 安装包；
- 为通过演示而伪造音变执行结果；
- 重写 Lexurgy、CodeMirror 或 Lezer。

### 本阶段明确不适用的验收

AGENTS.md 中的下列质量要求仍然有效，但对应功能尚未进入 Phase 0：

| 验收项 | Phase 0 状态 | 转为强制验收的阶段 |
|---|---|---|
| `.fishtongue` 项目往返保存 | N/A，不得填写“通过” | Phase 1 |
| SQLite 迁移、备份与失败恢复 | N/A，不得填写“通过” | Phase 1 |
| Lexurgy Sidecar 启动与退出清理 | N/A，不得填写“通过” | Phase 2 |
| 上游 Lexurgy 引擎测试 | N/A；本阶段未修改引擎 | Phase 2 或首次修改引擎时 |

`N/A` 表示“本阶段尚无该功能”，不是测试通过。进入对应阶段后，这些项目自动变成阻断性验收条件。

## 4. 已确定的技术选择

| 项目 | Phase 0 决定 | 原因 |
|---|---|---|
| 桌面框架 | Tauri 2 | 与项目桌面架构一致 |
| 前端 | 继续使用上游 Next.js/React | 最大限度复用现有页面与编辑器 |
| 输出方式 | Next.js 静态导出到 `out/` | Tauri 不运行 Next.js 服务端 |
| 包管理器 | npm | 上游已有 `package-lock.json`，避免无意义更换 |
| 首个桌面页面 | 上游 `/sc` 的编辑器切片 | 已包含 CodeMirror、Lezer 和真实规则语法 |
| 安装包 | NSIS `setup.exe` | Phase 0 只需验证普通 Windows 安装链路 |
| CPU 架构 | Windows x64 | 先形成单一、可重复的验收基线 |
| 网络策略 | 启动和编辑过程零网络请求 | Sidecar 尚未接入，避免意外访问旧 Web 服务 |
| 音变执行 | 明确禁用并提示 Phase 2 接入 | Phase 0 只验证桌面壳与编辑器 |
| 版本号 | `0.0.1-phase.0` | 清楚表示这是内部验证版本 |
| 应用标识 | `com.fishtongue.desktop` | 提供稳定且唯一的 Windows 应用标识 |

> 注意：上游当前使用 Next.js 15，而 Tauri 官方 Next.js 指南示例说明其内容基于 Next.js 14.2.3。实施时必须以真实构建结果证明兼容性，不能仅凭文档假定兼容。

### 为 Phase 1/2 预留的稳定边界

Phase 0 不提前实现 SQLite 或 Sidecar，但必须建立不会被后续基础设施绑死的最小边界：

```text
React UI
→ Application Service
→ 客户端拥有的 Port（接口）
→ Infrastructure Adapter
→ Tauri Command / Tauri SQL Plugin / Lexurgy Sidecar
```

FishTongue 新代码放在独立模块，采用以下固定职责边界：

```text
src/fishtongue/
├── application/
│   ├── ports/          # Service 需要的接口；接口归调用方所有
│   └── services/       # 用例编排，不导入 Tauri、SQL 或 Sidecar 细节
├── infrastructure/
│   └── tauri/          # Tauri、SQLite 和 Sidecar 适配器
└── ui/                 # React 页面和展示组件
```

实施规则：

- Phase 0 建立 `SoundChangeEngine` Port；桌面音变页面只依赖该接口；
- Phase 0 使用 `UnavailableSoundChangeEngine` 返回结构化“尚未接入”状态，不返回伪造校验或音变结果；
- Phase 2 以 `TauriLexurgyEngine` 替换该适配器，UI 和编辑器接口保持不变；
- Phase 2 的 Lexurgy 继续使用 Kotlin/JVM，由 Tauri 管理，并监听 `127.0.0.1` 随机端口；
- Phase 1 首次出现项目数据用例时，再由 Application 层定义 `ProjectRepository`，由 Tauri SQL Plugin 适配器实现；
- 不为尚无调用方的数据能力创建空接口或空目录；
- UI 不得直接导入 Tauri SQL、文件系统、Shell 或 Sidecar 实现；
- 通用 CodeMirror、Lezer 或 Lexurgy 修复优先提交上游；FishTongue 桌面适配保留在 `src/fishtongue/`。

## 5. 计划产物

完成后仓库至少应包含：

```text
fishtongue-desktop/
├── src/                         # React/Next.js 前端
│   ├── fishtongue/              # FishTongue 独立应用、基础设施与 UI 模块
│   └── sc/                      # 复用的上游音变编辑能力
├── public/                      # 静态资源
├── src-tauri/                   # Tauri 2 Rust 桌面壳
├── tests/                       # FishTongue 新增测试
├── docs/
│   └── phase-0/
│       ├── environment.md       # 开发环境检查记录
│       ├── upstream-baseline.md # 上游版本和原测试结果
│       ├── static-export-audit.md
│       ├── acceptance-report.md # 最终人类验收报告
│       └── screenshots/         # 启动、编辑器、安装/卸载证据
├── LICENSE                      # GPL-3.0，保留上游许可
├── package.json
├── package-lock.json
└── README.md
```

编译产生的 `out/`、`node_modules/` 和 `src-tauri/target/` 不提交到 Git。安装包是否作为 GitHub Release 附件发布，在 Phase 0 验收后另行决定。

## 6. 可执行任务清单

### P0-00：建立仓库与上游基线

**目标：** 后续改动可以追踪、比较和回退。

#### 唯一仓库根目录

`E:\FishTongue` 是 FishTongue Desktop 的唯一仓库根目录。不得在其中再创建 `fishtongue-desktop/` 嵌套仓库，也不得让 README、AGENTS.md 或本计划留在 Git 仓库之外。

当前目录已有规划文件但尚无 `.git`，因此采用“在当前目录初始化，再合并上游历史”的方式：

执行：

1. 在 GitHub 将 `def-gthill/lexurgy-app` Fork 为 `fishtongue-desktop`；
2. 确认 `E:\FishTongue` 只包含预期规划文件，且不存在 `.git`；
3. 在当前目录初始化 Git，将现有规划文档作为第一个可回退提交；
4. 将 Fork 配置为 `origin`，将原仓库配置为 `upstream`；
5. 获取并合并 `upstream/main` 历史；如 README 发生冲突，保留 FishTongue README，并确认上游许可与源码完整进入工作树；
6. 从合并后的提交建立 `phase-0/desktop-shell` 开发分支；
7. 推送该分支，记录提交哈希、远程地址和许可证。

命令模板：

```powershell
Set-Location E:\FishTongue
git init -b main
git add -- README.md AGENTS.md docs/phase-0-development-plan.md
git commit -m "docs: establish FishTongue desktop plan"
git remote add origin <你的-fishtongue-desktop-仓库地址>
git remote add upstream https://github.com/def-gthill/lexurgy-app.git
git fetch upstream main
git merge upstream/main --allow-unrelated-histories --no-commit
```

合并后先人工检查冲突、许可证和目录内容，再执行：

```powershell
git add -- .
git commit -m "chore: import Lexurgy App upstream baseline"
git switch -c phase-0/desktop-shell
git push -u origin phase-0/desktop-shell
git remote -v
git rev-parse HEAD
```

`<你的-fishtongue-desktop-仓库地址>` 是执行时必须替换的用户仓库地址，不是可直接复制的命令。合并遇到意外文件删除或无法解释的冲突时停止，不使用强制覆盖命令。

产物：`docs/phase-0/upstream-baseline.md`。

验收：

- `origin` 指向 FishTongue Fork；
- `upstream` 指向原 Lexurgy App；
- `git rev-parse --show-toplevel` 返回 `E:/FishTongue`；
- `E:\FishTongue` 下不存在第二个 `.git`；
- 文档中有上游提交哈希；
- `LICENSE` 与版权信息仍在。

预计：0.5 天。

---

### P0-01：检查 Windows 开发环境

**目标：** 先排除工具缺失，避免把环境问题误判为代码问题。

需要：

- Microsoft C++ Build Tools，并勾选“Desktop development with C++”；
- Microsoft Edge WebView2；
- Rust stable-msvc；
- Node.js LTS 与 npm；
- Git。

检查命令：

```powershell
git --version
node --version
npm --version
rustc --version
cargo --version
rustup show active-toolchain
```

把命令、版本、执行日期和结论写入 `docs/phase-0/environment.md`。不在文档中记录用户名、访问令牌或其他秘密。

验收：

- 每个命令成功退出；
- Rust 工具链是 Windows MSVC；
- `npm ci` 可以启动安装；
- 缺失组件已安装后重新检查。

预计：0.5 天；下载安装耗时不计。

---

### P0-02：建立“改动前”测试基线

**目标：** 知道哪些问题原本就存在，避免把旧问题算成 FishTongue 回归。

依次执行：

```powershell
npm ci
npm run test-ci
npm run cypress-unit
npm run build
```

记录每条命令的：

- 上游提交哈希；
- 开始/结束时间；
- 退出码；
- 通过、失败、跳过数量；
- 失败测试名称和错误摘要；
- 是否属于上游既有问题。

上游端到端测试依赖 Neo4j、Lexurgy 服务和认证秘密。本任务只做依赖清单和可运行性判断，不要求为了 Phase 0 搭建整套旧 Web 服务。

产物：`docs/phase-0/upstream-baseline.md`。

验收：

- 单元和组件测试均有可复查结果；
- 旧 `npm run build` 结果已记录；
- 没有用删除测试、改写断言或盲目跳过的方式制造“全绿”。

预计：0.5～1 天。

---

### P0-03：静态导出兼容性审计

**目标：** 找出所有依赖 Web 服务端的代码，并为 Phase 0 选择最小、安全的隔离方式。

先运行搜索：

```powershell
rg -n "getServerSideProps|getInitialProps|Server Action|use server" src
rg -n "next-auth|NEXTAUTH|neo4j|pages/api|middleware" src
rg -n "process\.env|window\.|document\.|localStorage" src
rg -n "fetch\(|axios|servicesEndpoint|LEXURGY_SERVICES" src
```

然后在 `docs/phase-0/static-export-audit.md` 中给每项标记：

- **保留**：浏览器静态代码，可直接进入桌面版；
- **客户端隔离**：需要在挂载后运行或增加 `window` 防护；
- **桌面替代**：未来改为 Tauri Command、SQLite 或 Sidecar；
- **暂缓**：不属于 Phase 0，不进入桌面入口；
- **删除候选**：NextAuth、旧 API Route 等，由后续阶段正式移除。

#### 四小时决策门

先尝试让现有 `/sc` 页面在根项目直接静态导出。四小时内根据事实选择：

1. **直接路径：** 若服务端页面不会阻止导出，则保留根项目结构，只隔离 `/sc` 的远程调用；
2. **隔离路径：** 若无关的 NextAuth、API Route、动态路由或中间件阻止构建，则建立专用的桌面静态入口，只复用上游 `src/sc`、通用组件和样式；旧 Web 页面保留在源码历史中，但不进入桌面构建。

采用隔离路径时，仍然只保留一个正式 Next.js 构建入口，不建立第二套长期并行前端。不得复制 CodeMirror/Lezer 实现，不大规模迁移页面，也不删除旧功能。选择和理由写入审计文档，作为 Phase 0 的小型架构决策记录。

“复用现有 `/sc` 页面”的最低标准是：继续使用上游 `src/pages/sc.tsx` 的路由职责、`src/sc/ScCodeEditor.tsx`、Lezer 语法和相关样式。因移除远程服务而改变的容器、按钮和提示必须列入审计文档，不能把全新演示页面描述为原页面已完成迁移。

验收：

- 每个静态导出阻塞项都有文件位置、影响和处理决定；
- 确认 `/sc` 当前的规则运行/校验会调用 Lexurgy 服务；
- 选定的路径可以在 Phase 0 范围内完成；
- 没有为了构建通过而暗中恢复 Web 服务端。

预计：1 天。

---

### P0-04：配置 Next.js 静态构建

**目标：** 生成 Tauri 可以直接打包的纯静态前端。

实施要点：

1. 在 Next.js 配置中加入 `output: "export"`；
2. 若使用 `next/image`，配置静态导出兼容方式；
3. 增加明确脚本：

```json
{
  "scripts": {
    "build:desktop": "next build"
  }
}
```

4. 处理浏览器对象的服务端构建问题；
5. 桌面入口不得导入 NextAuth、Neo4j、API Route 或 Node 专用模块；
6. 删除 `out/` 后重复构建，证明结果不是旧文件残留。

验证命令：

```powershell
Remove-Item -Recurse -Force -LiteralPath .\out
npm run build:desktop
Test-Path -LiteralPath .\out\index.html
```

执行删除前必须确认当前目录是仓库根目录，且目标解析为该仓库下的 `out`。

验收：

- 全新构建退出码为 0；
- `out/` 中存在桌面入口 HTML 和所需静态资源；
- 断开网络后仍能打开页面；
- 构建日志没有启动数据库或认证服务。

预计：0.5～1 天。

---

### P0-05：接入 Tauri 2 桌面壳

**目标：** 用 Tauri 窗口加载同一个前端开发服务器和静态构建结果。

初始化：

```powershell
npm install --save-dev @tauri-apps/cli@latest
npx tauri init
```

配置约定：

- 应用名称：`FishTongue`；
- 窗口标题：`FishTongue`；
- 标识符：`com.fishtongue.desktop`；
- 开发地址：`http://localhost:3000`；
- 开发命令：`npm run dev`；
- 构建命令：`npm run build:desktop`；
- 静态资源目录：`../out`；
- 初始版本：`0.0.1-phase.0`；
- 初始窗口建议为 1280×800，最小 960×640。

增加脚本：

```json
{
  "scripts": {
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build --bundles nsis"
  }
}
```

Phase 0 不安装 SQL、文件系统、Shell、HTTP、Stronghold 或 Sidecar 插件。默认 capability 只保留窗口启动所需的最小权限。

验证：

```powershell
npm run tauri:dev
cargo check --manifest-path .\src-tauri\Cargo.toml
```

验收：

- 出现独立 FishTongue 窗口，不依赖外部浏览器；
- 窗口关闭后开发进程可以正常结束；
- Rust 检查通过；
- 没有申请 Phase 0 不需要的文件、Shell、数据库或网络权限。

预计：1 天。

---

### P0-06：制作音变编辑器桌面切片

**目标：** 真实验证上游 CodeMirror/Lezer 组件在 WebView2 中工作。

桌面页面应包含：

- FishTongue 标题；
- “Phase 0 桌面壳验证版”状态；
- 上游 `ScCodeEditor`；
- 一段可直接编辑的 Lexurgy 示例规则；
- 清楚的提示：“规则运行与校验将在 Phase 2 接入本地 Lexurgy 引擎”。

实施步骤：

1. 保留 `/sc` 路由职责，并把桌面状态放在 `src/fishtongue/`；
2. 在 Application 层定义 `SoundChangeEngine` Port 和结构化的“不可用”结果；
3. 在 Infrastructure 层实现 `UnavailableSoundChangeEngine`；
4. 由桌面入口完成 Port 与适配器的组装，React 页面不得自行创建基础设施实现；
5. 继续复用 `ScCodeEditor`、Lezer 语法和样式；
6. 隐藏或禁用依赖远程执行的控件，并显示真实的阶段说明。

必须隔离：

- `ScRunner` 默认的远程规则校验；
- “Apply”触发的远程音变执行；
- 旧分享链接、登录和远端服务地址；
- 任何启动后自动发出的 HTTP 请求。

不得伪造：

- 规则合法/非法状态；
- 音变输出；
- Lexurgy 已连接状态。

验收操作：

1. 输入多行规则，确认内容与光标没有跳动；
2. 输入括号，确认自动补全；
3. 使用 `Ctrl+Z` 和 `Ctrl+Y`；
4. 输入注释、关键字、类名和规则名，确认颜色不同；
5. 滚动至少 100 行文本；
6. 调整窗口尺寸，确认编辑器仍可使用；
7. 打开开发者工具 Network 面板，确认启动和编辑过程中没有 HTTP 请求；
8. 关闭再打开应用，确认不会出现登录或 Neo4j 错误。

预计：1～1.5 天。

---

### P0-07：补充自动化测试

**目标：** 让后续改动可以重复验证 Phase 0 的核心能力。

最低测试集：

- Jest：桌面入口能渲染阶段说明与编辑器；
- Jest：未接入引擎时不调用 `getRuleNames` 或 `runSoundChanges`；
- Jest：`UnavailableSoundChangeEngine` 只返回“尚未接入”，不返回伪造结果；
- Cypress 组件测试：CodeMirror 输入、行号、括号补全、撤销；
- Cypress 组件测试：Lexurgy 关键字产生语法高亮标记；
- 边界检查：`src/fishtongue/ui/` 不直接导入 Tauri、SQL 或 Sidecar 实现；
- 静态构建检查：`out/index.html` 存在；
- Rust：`cargo check`；
- 人工桌面冒烟：启动、缩放、关闭。

建议新增统一检查脚本：

```json
{
  "scripts": {
    "verify:phase0": "npm run test-ci && npm run cypress-unit && npm run build:desktop"
  }
}
```

验收：

- 新增测试先能在故障状态下失败，再在实现后通过；
- 不依赖公网、Neo4j、Docker、Java 或秘密环境变量；
- 原测试若因桌面隔离发生变化，报告中说明原因。

预计：1 天。

---

### P0-08：构建 Windows 安装程序

**目标：** 生成普通用户可双击安装的应用。

执行：

```powershell
npm ci
npm run verify:phase0
npm run tauri:build
```

构建后记录：

- Git 提交哈希；
- Node、npm、Rust 和 Tauri 版本；
- 安装包完整文件名、大小和 SHA-256；
- 构建日志位置；
- 是否签名（Phase 0 预期为“未签名”）。

计算校验值：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath <安装包完整路径>
```

验收：

- 产生 NSIS `setup.exe`；
- 安装包名称和版本可识别；
- 构建不捆绑开发源代码、访问令牌或 `.env`；
- 未签名构建可能触发 Windows SmartScreen，报告中如实记录，不把它误判为应用崩溃。

预计：0.5 天。

---

### P0-09：干净 Windows 环境验收

**目标：** 证明最终用户无需开发工具。

优先使用 Windows Sandbox、全新虚拟机或专用测试机。测试机不得预装 Node.js、Rust、Docker、Neo4j 或 Java。

按顺序验收：

1. 校验安装包 SHA-256；
2. 双击安装；
3. 从开始菜单启动 FishTongue；
4. 完成 P0-06 的编辑器人工验收；
5. 断开网络后重新启动并编辑；
6. 关闭应用，检查没有遗留 FishTongue 进程；
7. 卸载应用；
8. 再次安装并启动，确认安装过程可重复。

每一步记录“通过/失败”、截图和异常。产物写入 `docs/phase-0/acceptance-report.md`。

验收报告还必须把“项目往返保存”“迁移/备份恢复”“Sidecar 清理”和“上游 Lexurgy 引擎测试”列为 N/A，并注明它们各自转为强制验收的阶段。

验收：

- 普通用户不需要命令行；
- 安装、启动、编辑、关闭、卸载全部通过；
- 无外部服务错误弹窗；
- 没有残留常驻进程；
- 未通过项不能只用“开发机上正常”代替。

预计：0.5～1 天。

---

### P0-10：收尾评审与进入 Phase 1 的门禁

**目标：** 用证据决定是否继续，而不是凭演示印象宣布完成。

收尾：

1. 运行最终 `npm run verify:phase0`；
2. 审查 Tauri capabilities；
3. 审查依赖和许可证变化；
4. 完成验收报告；
5. 将完成标准逐项勾选；
6. 给已知问题分级；
7. 合并开发分支并打内部标签 `phase-0.0.1`。

只有满足以下条件才进入 Phase 1：

- 所有 Definition of Done 项通过；
- P0/P1 缺陷为 0；
- 安装包可在干净环境运行；
- 静态导出和 CodeMirror 测试可重复；
- 验收报告已由人类阅读确认。

预计：0.5 天。

## 7. 建议执行顺序与里程碑

| 里程碑 | 包含任务 | 可见结果 | 累计预计 |
|---|---|---|---|
| M0 基线可追踪 | P0-00～P0-02 | 仓库、环境、原测试报告 | 1.5～2 天 |
| M1 静态前端成立 | P0-03～P0-04 | `out/` 可离线打开 | 3～4 天 |
| M2 桌面编辑器成立 | P0-05～P0-07 | Tauri 窗口中可用的 CodeMirror | 5～7.5 天 |
| M3 可交付安装包 | P0-08～P0-10 | 安装包与验收报告 | 6～9 天 |

任务按顺序执行。P0-03 是关键决策门；在静态导出路径未确定前，不提前加入 SQLite、Sidecar 或其他 Tauri 插件。

## 8. 缺陷分级与处理规则

| 等级 | 示例 | Phase 0 处理 |
|---|---|---|
| P0 阻断 | 无法安装、无法启动、数据或系统受损 | 立即停止验收，必须修复 |
| P1 严重 | 编辑器无法输入/撤销、应用自动联网、构建不可重复 | 必须修复后才能完成 |
| P2 一般 | 小范围布局错误、提示文案不清 | 尽量修复；否则记录负责人和后续阶段 |
| P3 轻微 | 非关键视觉细节 | 可记录后进入后续阶段 |

同一问题连续三次出现时，不再只做临时重试，必须记录复现步骤并调查根因。

## 9. 主要风险与预案

| 风险 | 早期信号 | 预案 |
|---|---|---|
| Next.js 15 与当前 Tauri 示例存在版本差异 | 静态导出或资源路径失败 | 以构建测试为准；记录兼容修复，不盲目降级 |
| 旧页面依赖 NextAuth/Neo4j/API Route | `next build` 报服务器能力不支持 | 触发 P0-03 隔离路径，只构建桌面最小入口 |
| `/sc` 编辑后自动调用远程服务 | Network 面板出现请求或错误 | 注入禁用适配器；Phase 2 前不提供执行按钮 |
| `localStorage` 在静态构建期间访问 `window` | 构建时报 `window is not defined` | 延后到客户端挂载或为浏览器对象增加边界 |
| WebView2 与浏览器表现不同 | 编辑、快捷键或样式异常 | Cypress 组件测试加 Tauri 人工冒烟双重验证 |
| Windows 未签名安装包触发警告 | SmartScreen 提示 | Phase 0 如实记录；正式签名留到发布阶段 |
| 上游测试本身失败 | 改动前已失败 | 保存原始基线，只对新增回归负责 |
| 权限配置过宽 | capability 出现 Shell/文件系统/HTTP | 删除非 Phase 0 权限并重新构建 |

## 10. 验收报告模板

`docs/phase-0/acceptance-report.md` 使用以下结构：

```markdown
# Phase 0 验收报告

- 验收日期：
- 验收人：
- Git 提交：
- 安装包：
- SHA-256：
- 测试环境：

## 结论
通过 / 不通过

## 自动化测试
| 命令 | 结果 | 通过/失败数 | 证据 |

## 人工验收
| 编号 | 操作 | 预期 | 实际 | 结果 | 截图 |

## 与上游基线的差异

## 已知问题
| 编号 | 等级 | 复现步骤 | 处理决定 |

## 未验证事项

| 项目 | 本阶段状态 | 转为强制验收的阶段 |
|---|---|---|
| 项目往返保存 | N/A | Phase 1 |
| SQLite 迁移、备份与恢复 | N/A | Phase 1 |
| Sidecar 启动与退出清理 | N/A | Phase 2 |
| 上游 Lexurgy 引擎测试 | N/A | Phase 2 或首次修改引擎时 |

## 是否允许进入 Phase 1
是 / 否，以及理由
```

## 11. 参考依据

- [Tauri 2 Windows 开发前置条件](https://v2.tauri.app/start/prerequisites/)
- [Tauri 2 为现有前端手动初始化项目](https://v2.tauri.app/start/create-project/)
- [Tauri 2 配置 Next.js 静态前端](https://v2.tauri.app/start/frontend/nextjs/)
- [Tauri 2 Windows 安装程序](https://v2.tauri.app/distribute/windows-installer/)
- [Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)
- [Lexurgy App 上游仓库](https://github.com/def-gthill/lexurgy-app)
