# Phase 0 开发环境检查

> 检查日期：2026-07-23
> 检查状态：基础工具、Node 依赖、Tauri 编译与 NSIS 打包通过

## 结论

当前电脑具备 Tauri 2 Windows 开发和打包条件。Node 依赖已完成干净安装，
`cargo check`、Tauri 开发窗口、发布版程序、NSIS 安装包构建和 Cypress
组件测试均已通过。

## 系统与工具

| 项目             | 检测结果                                                          | 状态                              |
| ---------------- | ----------------------------------------------------------------- | --------------------------------- |
| 操作系统         | Windows 11 家庭中文版，64 位，Build 26200                         | 通过                              |
| Git              | 2.54.0.windows.1                                                  | 通过                              |
| Node.js          | 24.16.0                                                           | 通过                              |
| npm              | 11.13.0                                                           | 通过                              |
| Rust             | rustc 1.92.0                                                      | 通过                              |
| Cargo            | 1.92.0                                                            | 通过                              |
| Rust 工具链      | `stable-x86_64-pc-windows-msvc`                                   | 通过                              |
| C++ Build Tools  | Visual Studio Build Tools 2019 16.11.49；C++ x86/x64 工具已检测到 | 通过，已由 Tauri release 编译复核 |
| WebView2 Runtime | 150.0.4078.83                                                     | 通过                              |
| GitHub CLI       | 已登录 `whitefi2h`                                                | 通过                              |

## 已执行检查

```powershell
git --version
node --version
npm --version
rustc --version
cargo --version
rustup show active-toolchain
gh auth status
```

Visual Studio C++ 工具使用 `vswhere` 检测；WebView2 使用 Windows 注册表检测。报告不保存 GitHub Token、用户名目录以外的个人信息或其他秘密。

## 依赖安装说明

第一次 `npm ci` 被命令执行器在 30 秒处中止，但 npm 子进程继续运行；随后启动的第二次安装与它并发操作 `node_modules`，导致 `TAR_ENTRY_ERROR` 和 `ENOTEMPTY`。这属于执行器并发问题，不是上游源码测试结果。

处理方式：

1. 确认没有仍在运行的 `npm ci`；
2. 验证目标严格等于 `E:\FishTongue\node_modules`；
3. 删除不完整的生成目录；
4. 使用单一 npm 进程重新执行干净安装，并设置 `CYPRESS_INSTALL_BINARY=0`，避免可选的 Cypress 二进制下载再次阻塞 npm 包安装；
5. 只把最后一次独占运行的结果计入正式基线。

上游基线独占运行结果：退出码 0，34 秒安装 1344 个包。加入 Tauri CLI 后，
又从当前锁文件执行一次全新 `npm ci`：退出码 0，53 秒安装 1346 个包。
`npm ls --depth=0` 通过，没有缺失依赖。

## Tauri 实际复核

- `cargo check --manifest-path .\src-tauri\Cargo.toml`：通过；
- `npm run tauri:dev`：独立 FishTongue 窗口成功启动并正常结束；
- `npm run tauri:build`：通过，生成 NSIS 安装程序；
- 发布版 `src-tauri/target/release/fishtongue.exe`：成功启动，窗口关闭后无残留进程。
- 本机 NSIS 循环：安装、启动、卸载、重装和开始菜单再次启动均通过；
  最终状态为 FishTongue 已安装、应用已关闭、无残留进程。

## 待复核

- NSIS 安装程序的干净 Windows 安装、卸载和重装。
