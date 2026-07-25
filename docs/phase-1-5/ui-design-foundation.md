# FishTongue Phase 1.5 UI 设计基础方案

> 方案版本：1.0.0  
> 设计方向：Quiet Modernism / 静谧现代主义  
> 设计令牌状态：已锁定

## 结论

FishTongue 采用简洁务实的现代主义桌面风格：扁平、克制、中高信息密度，以
中性灰阶建立层次，用唯一的靛蓝强调色表达选择、焦点和主要操作。

“高级感”来自精确对齐、稳定布局、清楚的文字层级和完整交互状态，不依赖大面积
留白、巨型标题、阴影、渐变或玻璃效果。

完整令牌见
[`design-system/fishtongue/MASTER.md`](../../design-system/fishtongue/MASTER.md)，
可直接实现的 CSS 变量见
[`design-system/fishtongue/tokens.css`](../../design-system/fishtongue/tokens.css)。

## 选择依据

`ui-ux-pro-max` 的本地设计数据库给出了多种候选。其中：

- “Data-Dense Dashboard”符合表格、树、属性面板和紧凑工具栏的需要；
- B2B/知识工具的中性色与蓝色强调方案符合专业、稳定和长时间使用；
- Fluent 的系统字体层级适合 Windows 桌面应用；
- 自动推荐的“Exaggerated Minimalism”包含巨型标题和大量留白，与项目要求冲突，
  因而明确排除；
- 自动推荐的青绿加橙色双强调方案不符合“单一主强调色”，因而改为单一靛蓝。

## 视觉语言

### 色彩

- 主背景为冷中性浅灰，工作区为白色；
- 导航区比工作区稍暗，使内容自然成为视觉中心；
- 品牌和操作只使用靛蓝；
- 红、黄、绿只表示危险、警告和成功，不能用于装饰；
- 同时定义浅色与深色映射，但两者共享相同语义令牌。

### 字体

界面使用 Windows 原生系统字体栈，以 Segoe UI Variable / Segoe UI 为首选，
中文回退到 Microsoft YaHei UI。这样无需联网下载字体，在 Windows 10/11 上均
保持清晰，并避免中英文使用两套气质冲突的字体。

规则代码使用 Cascadia Code / Cascadia Mono。IPA 和语言学内容使用覆盖范围更广的
无衬线回退栈。所有页面禁止使用装饰性衬线标题。

### 形状与层次

- 4 px 间距基准，中高密度；
- 普通控件高度 32 px，工具栏控件 28 px，表格行 36 px；
- 圆角限定为 2/4/6/8 px；
- 工作区、侧栏和表格不用阴影；
- 菜单、浮层和模态框才允许使用指定阴影；
- 使用背景明度、细边框和选中指示器组织层次。

### 动效

动效仅解释状态变化。悬停和焦点为 120 ms，普通局部状态为 160 ms，面板为
200 ms，模态框进入为 220 ms。不得加入滚动揭示或装饰动画；系统要求减少动效时
全部降为 0 ms。

## 桌面框架基准

```text
菜单栏 28
上下文工具栏 40
左侧导航 240（220–300，可折叠为 48）
主工作区 自适应（不小于 560）
AI 侧栏 360（300–520，可折叠）
状态栏 24
```

最低验收窗口为 `1280 × 800`，参考设计窗口为 `1440 × 900`。空间不足时先折叠
AI 侧栏，不能牺牲主工作区，也不能切换为手机导航。

## 后续 Skill 的权限

| Skill | 责任 | 禁止事项 |
| --- | --- | --- |
| `frontend-design` | 唯一主设计师，完成页面视觉与布局 | 改变风格、颜色、字体或令牌 |
| `emil-design-eng` | 布局稳定后精修交互、反馈和动效 | 引入令牌之外的动效或视觉风格 |
| `web-design-guidelines` | 最终检查并修复可用性和无障碍问题 | 以“整改”为由静默重新配色或换字体 |

如果验收发现令牌本身存在问题，必须先报告并取得用户同意，再发布新版本。

## 风格参考

- [Fluent 2 Color](https://fluent2.microsoft.design/color)：中性色层级、语义色与令牌化。
- [Fluent 2 Typography](https://fluent2.microsoft.design/typography)：Windows 系统字体和紧凑文字层级。
- [VS Code UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/overview)：稳定工作区、主/次侧栏、编辑区和状态栏。
- [Linear UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh)：更安静的侧栏、统一标题和控件、突出主内容。
- [Carbon Data Table](https://carbondesignsystem.com/components/data-table/style/)：高密度表格的分层表面和完整状态。

这些案例只用于参考结构与克制程度，不直接复制品牌样式。
