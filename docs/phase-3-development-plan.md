# FishTongue Phase 3：词典、语素与确定性造词

状态：开发中。版本：`0.3.0-phase.3`。

## 完成标准

- Schema v2 项目安全迁移到 v3。
- 正式词典支持 IPA、状态、来源、备注、多 Sense 和语素组成。
- 语素库、造词配置、概念表、审核批次和批量操作随项目保存。
- 相同引擎版本、配置、种子和输入顺序产生相同候选。
- 候选必须审核后才能以事务批量提交。
- 批量撤销发现提交后修改时必须停止，不能删除用户的新修改。
- Phase 2 音变、屈折、项目保存和退出能力无回归。
- `npm run verify:phase3` 和 Windows x64 NSIS 构建通过。

## 锁定边界

- 使用独立的造词配置，不等待完整音系模块。
- 内置版本化 Swadesh 100/207，并支持项目内自定义概念表。
- 词源、历史形式、LanguageStage、LLM、Morfessor、PanPhon 和全局撤销不属于本阶段。
- PolyGlot 只作算法与交互参考；不迁入 Swing、NetBeans 或 XML 存储。
- 造词进入现有 Kotlin/JVM Sidecar；React 只能经 Service、Port 和 Tauri Adapter 使用。

## 执行清单

- [x] P3-00：封存 Phase 2、创建标签与分支、更新版本和结项文档。
- [ ] P3-01：固定 PolyGlot 与概念数据来源、许可证和哈希。
- [ ] P3-02：领域模型、Schema v3、Repository、迁移和事务。
- [ ] P3-03：SplitMix64 v1 确定性造词核心及 Sidecar 协议 v2。
- [ ] P3-04：Rust Supervisor、Tauri Command 和前端 Adapter。
- [ ] P3-05：词典、语素、造词、审核与批量操作 Service。
- [ ] P3-06：正式三栏词典。
- [ ] P3-07：正式语素库。
- [ ] P3-08：造词配置工作台。
- [ ] P3-09：概念表和候选审核。
- [ ] P3-10：批量派生、提交和安全撤销。
- [ ] P3-11：迁移、故障恢复与数据安全。
- [ ] P3-12：`verify:phase3`、安装包和许可证审计。
- [ ] P3-13：外部 Windows 人工验收和结项。

## 人工验收摘要

在无系统 Java 的 Windows x64 电脑上验证：v2→v3 迁移；词典和语素往返保存；
固定种子跨重启复现；候选接受、拒绝和编辑；批量提交；派生；正常撤销；修改后阻止
撤销；取消与 Sidecar 崩溃不损坏项目；Phase 2 回归；退出无残留 Java 进程。
