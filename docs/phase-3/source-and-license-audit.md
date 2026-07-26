# Phase 3 来源与许可证审计

## PolyGlot

- 上游：<https://github.com/DraqueT/PolyGlot>
- 审计基线：`089b9d0b863dcf80356da036f7bed068945c9aaf`
- 仓库许可证：MIT。
- 本阶段仅参考其“按音位类别、音节结构和权重生成候选”的产品思路。
- 没有复制 PolyGlot 的 Java/Swing、NetBeans、XML 存储、窗口代码或源代码实现。
- FishTongue 的生成器为独立 Kotlin 实现，随机算法固定为 SplitMix64 v1，并有独立测试向量。

因此，Phase 3 不会把 PolyGlot 的 UI、存储格式或运行时依赖带入安装包。

## Swadesh 100 / 207

- 语义和顺序依据经典 Swadesh 100/207 概念表整理。
- 使用 Concepticon 3.4.0（标签提交
  `e4dd2886d93ffd9724f38feb3b254619d341978f`）核对列表身份与概念命名：
  <https://concepticon.clld.org/>。
- 内置资源版本：`swadesh-classic-v1`。
- 资源文件：
  `src/fishtongue/data/BuiltInConceptLists.ts`。
- 当前 SHA-256：
  `DB052643B789F5EAD7580390EDEB00405DA8C0C26BD0FDFAF84E4849CEB0DADB`。
- 内置表只读；用户自定义概念表单独保存在项目 SQLite 中。

列表只包含短概念标签和顺序，不包含第三方释义文章、例句、翻译或数据库转储。

## 结论

- Phase 3 未引入新的闭源运行时或在线服务。
- 安装包继续保留 Lexurgy GPL-3.0、精简 Temurin JRE 的 `legal/` 目录及 SBOM。
- 引擎和概念资源版本、来源与哈希均可追溯。
