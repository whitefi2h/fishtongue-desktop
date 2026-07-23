# Phase 0 正式版网络检查

> 检查日期：2026-07-23
> 结论：通过；启动与编辑期间没有非本机网络连接

## 检查对象

- 已安装程序：`C:\Users\你的姓名\AppData\Local\FishTongue\fishtongue.exe`
- 安装包 SHA-256：
  `B18FBF743C0597A2391688F0690536256D999D3997F6D4655C1936D5FBD0E27D`
- 覆盖操作：启动、输入 `# network smoke`、撤销、关闭

## 检查方法

正式版不开放 WebView 开发者工具，因此没有用开发模式的 Network 面板替代正式版。
监控程序在 FishTongue 启动前运行，每 100 毫秒检查 FishTongue 及其全部子进程的
TCP 连接和 UDP 端点，直到应用关闭。

该方法能看到 WebView2 子进程实际建立的系统网络端点，比只检查页面源码更接近
最终用户运行状态。静态产物引用扫描和生产 CSP 同时作为补充证据。

## 结果

| 项目              | 数量 | 说明                                            |
| ----------------- | ---: | ----------------------------------------------- |
| 非本机远程连接    |    0 | 没有公网或局域网目标                            |
| UDP 端点          |    0 | 没有 DNS 或其他 UDP 活动                        |
| 本机回环 TCP 记录 |    4 | `127.0.0.1 → 127.0.0.1`，来自 WebView2 内部通信 |
| 绑定端点记录      |    2 | 远端为 `0.0.0.0:0`，不是出站连接                |

监控记录到的连接全部属于 `msedgewebview2.exe`，远端只出现 `127.0.0.1` 或
未连接状态的 `0.0.0.0`。没有发现旧 `/api/services`、Neo4j、NextAuth 或外部
Lexurgy 服务通信。

生产 CSP 的 `connect-src` 只允许 Tauri IPC：

```text
connect-src ipc: http://ipc.localhost
```

## 判定

Phase 0 的“启动和编辑过程中不请求外部服务”要求通过。后续 Phase 2 接入本地
Lexurgy Sidecar 后，必须重新检查随机回环端口和外部连接边界。
