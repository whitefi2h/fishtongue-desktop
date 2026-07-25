import { WorkspaceRoute, UiFeatureState } from "./types";

export interface RouteDefinition {
  id: WorkspaceRoute;
  label: string;
  englishLabel: string;
  group: "project" | "language" | "tools";
  state: UiFeatureState;
}

export const routeRegistry: RouteDefinition[] = [
  { id: "project-home", label: "项目主页", englishLabel: "Project home", group: "project", state: "prototype" },
  { id: "languages", label: "所有语言", englishLabel: "All languages", group: "project", state: "prototype" },
  { id: "genealogy", label: "语言谱系", englishLabel: "Language family", group: "project", state: "prototype" },
  { id: "events", label: "历史事件", englishLabel: "Historical events", group: "project", state: "prototype" },
  { id: "project-settings", label: "项目设置", englishLabel: "Project settings", group: "project", state: "prototype" },
  { id: "language-overview", label: "概览", englishLabel: "Overview", group: "language", state: "prototype" },
  { id: "language-properties", label: "基本属性", englishLabel: "Properties", group: "language", state: "prototype" },
  { id: "stages", label: "阶段管理", englishLabel: "Stages", group: "language", state: "prototype" },
  { id: "dialects", label: "方言", englishLabel: "Dialects", group: "language", state: "prototype" },
  { id: "phonology", label: "语音学", englishLabel: "Phonology", group: "language", state: "prototype" },
  { id: "morphology", label: "形态学", englishLabel: "Morphology", group: "language", state: "prototype" },
  { id: "lexicon", label: "词典", englishLabel: "Lexicon", group: "language", state: "prototype" },
  { id: "writing", label: "书写系统", englishLabel: "Writing system", group: "language", state: "prototype" },
  { id: "evolution", label: "演化", englishLabel: "Evolution", group: "language", state: "prototype" },
  { id: "contact", label: "语言接触", englishLabel: "Language contact", group: "language", state: "prototype" },
  { id: "translation", label: "辅助翻译", englishLabel: "Assisted translation", group: "language", state: "prototype" },
  { id: "developer-tools", label: "开发者工具", englishLabel: "Developer tools", group: "tools", state: "prototype" },
  { id: "map", label: "地图视图", englishLabel: "Map", group: "project", state: "planned" },
  { id: "reconstruction", label: "历史重构", englishLabel: "Reconstruction", group: "language", state: "planned" },
  { id: "unsafe-scripting", label: "高级脚本模式", englishLabel: "Unsafe scripting", group: "tools", state: "planned" },
  { id: "global-undo", label: "全局撤销", englishLabel: "Global undo", group: "tools", state: "planned" },
  { id: "glyph-designer", label: "原创文字绘制", englishLabel: "Glyph designer", group: "language", state: "planned" },
];

export const routesById = Object.fromEntries(
  routeRegistry.map((route) => [route.id, route])
) as Record<WorkspaceRoute, RouteDefinition>;
