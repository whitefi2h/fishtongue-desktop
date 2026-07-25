import { UiLocale } from "./types";

const messages = {
  "zh-CN": {
    preview: "设计预览 · 不会写入项目",
    project: "项目",
    language: "语言",
    stage: "阶段",
    saved: "已保存",
    aiOffline: "AI 未连接",
    search: "搜索",
    create: "新建",
    filter: "筛选",
    sort: "排序",
  },
  "en-US": {
    preview: "Design preview · Changes are not written to the project",
    project: "Project",
    language: "Language",
    stage: "Stage",
    saved: "Saved",
    aiOffline: "AI disconnected",
    search: "Search",
    create: "New",
    filter: "Filter",
    sort: "Sort",
  },
} as const;

export type MessageKey = keyof (typeof messages)["zh-CN"];

export function t(locale: UiLocale, key: MessageKey): string {
  return messages[locale][key];
}

export const localeMessageKeys = {
  "zh-CN": Object.keys(messages["zh-CN"]),
  "en-US": Object.keys(messages["en-US"]),
};
