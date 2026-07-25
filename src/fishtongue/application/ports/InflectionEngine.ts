import { LexurgyEngineStatus } from "./SoundChangeEngine";

export interface InflectionStem {
  id: string;
  value: string;
  categories: Record<string, string>;
}

export interface InflectionRunInput {
  rules: unknown;
  stems: InflectionStem[];
}

export interface InflectionRunResult {
  inflectedForms: unknown;
}

export interface InflectionEngine {
  getStatus(): Promise<LexurgyEngineStatus>;
  ensureReady(): Promise<LexurgyEngineStatus>;
  inflect(
    input: InflectionRunInput,
    signal?: AbortSignal
  ): Promise<InflectionRunResult>;
}
