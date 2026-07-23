# Phase 0 上游基线

> 记录日期：2026-07-23
> 基线状态：仓库、依赖和 Jest 基线完成；构建与 Cypress 既有问题已记录

## 仓库结论

FishTongue Desktop 已在唯一根目录 `E:\FishTongue` 建立。现有规划文档与 Lexurgy App 上游历史已经合并，没有创建嵌套 Git 仓库。

| 项目             | 值                                                    |
| ---------------- | ----------------------------------------------------- |
| Fork             | `https://github.com/whitefi2h/fishtongue-desktop`     |
| `origin`         | `https://github.com/whitefi2h/fishtongue-desktop.git` |
| `upstream`       | `https://github.com/def-gthill/lexurgy-app.git`       |
| 开发分支         | `phase-0/desktop-shell`                               |
| 上游提交         | `2d898a37c0341a2596f20b9de24a621a924f9804`            |
| 首次上游合并提交 | `a769819149277d60bef372b67fcf7f459ebb6f3c`            |
| 许可证           | GPL-3.0，`LICENSE` 已保留                             |

开发分支已推送到 `origin/phase-0/desktop-shell`。

## 上游技术基线

- 包管理器：npm，存在 `package-lock.json`；
- Next.js：`^15.5.15`；
- React：18.2.0；
- TypeScript：`^4.9.5`；
- 单元测试：Jest 29；
- 组件及端到端测试：Cypress 14；
- 音变编辑器：CodeMirror 6 + Lezer；
- Web 后端依赖：NextAuth、Neo4j、API Routes 和 Lexurgy HTTP 服务。

## 改动前测试

| 命令                             | 状态   | 结果                                                                        |
| -------------------------------- | ------ | --------------------------------------------------------------------------- |
| `npm ci`                         | 通过   | 使用官方 npm Registry、关闭 audit、跳过 Cypress 二进制；34 秒安装 1344 个包 |
| `npm ls --depth=0`               | 通过   | 没有缺失或无效依赖                                                          |
| `npm run test-ci -- --runInBand` | 通过   | 11/11 测试套件通过；51/51 测试通过；12.463 秒                               |
| `npm run cypress-unit`           | 未运行 | Cypress 14.0.3 包存在，但 Windows 二进制尚未下载                            |
| `npm run build`                  | 失败   | Next.js 类型检查在 `jest.setup.ts:7` 报错：不能把 `jest` namespace 当作值   |

旧端到端测试依赖 Neo4j、Lexurgy 服务与认证秘密，本阶段只记录依赖，不把未运行描述为通过。

### 构建失败归属

`npm run build` 的失败发生在 FishTongue 业务代码修改之前，属于上游基线问题。原因是 `tsconfig.json` 包含所有 `*.ts`，使 Next.js 生产构建检查了 `jest.setup.ts`，而该文件没有显式导入 `jest` 值。

桌面构建将用最小范围修复隔离测试文件；修复前后的结果都会保留。

### Cypress 状态

第一次 Cypress 14.0.3 二进制下载长时间没有完成，因此依赖重装使用 `CYPRESS_INSTALL_BINARY=0`。运行组件测试时得到明确错误：

```text
Cypress executable not found at:
C:\Users\你的姓名\AppData\Local\Cypress\Cache\14.0.3\Cypress\Cypress.exe
```

这项状态是“未运行”，不是测试失败或测试通过。二进制安装后必须重新执行组件测试。

## 已知上游工作树基线

`git diff --cached --check` 在首次合并时报告 3 处上游尾随空格：

- `src/language/languageEndpoint.ts:45`；
- `test/sc/scParser.spec.ts:45`；
- `test/sc/scParser.spec.ts:86`。

这些内容来自上游提交，本阶段不为制造干净报告而擅自修改。
