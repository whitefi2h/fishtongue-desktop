export type UiLocale = "zh-CN" | "en-US";
export type ThemeMode = "light" | "dark" | "system";
export type UiFeatureState = "live" | "prototype" | "planned";

export type WorkspaceRoute =
  | "project-home"
  | "languages"
  | "genealogy"
  | "events"
  | "project-settings"
  | "language-overview"
  | "language-properties"
  | "stages"
  | "dialects"
  | "phonology"
  | "morphology"
  | "lexicon"
  | "writing"
  | "evolution"
  | "contact"
  | "translation"
  | "developer-tools"
  | "ai-settings"
  | "map"
  | "reconstruction"
  | "unsafe-scripting"
  | "glyph-designer";

export interface PrototypeStage {
  id: string;
  name: string;
  years: string;
  documentation: "recorded" | "partial" | "unrecorded" | "reconstructed";
}

export interface PrototypeLanguage {
  id: string;
  name: string;
  nativeName: string;
  family: string;
  era: string;
  region: string;
  status: string;
  words: number;
  warnings: number;
  stages: PrototypeStage[];
}

export interface PrototypeLexeme {
  id: string;
  form: string;
  ipa: string;
  meaning: string;
  partOfSpeech: string;
  source: string;
  stage: string;
  confidence: string;
}

export interface PrototypeProjectViewModel {
  id: string;
  name: string;
  path: string;
  languages: PrototypeLanguage[];
  lexemes: PrototypeLexeme[];
}
