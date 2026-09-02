import {
  EvolutionDelivery,
  EvolutionInputMode,
  EvolutionPlan,
  EvolutionPlanVersion,
  EvolutionRun,
  EvolutionRunItem,
  EvolutionGraphData,
  EvolutionLexemeSourceType,
  Lexeme,
} from "@/fishtongue/domain/models";

export interface EvolutionInputCandidate extends Lexeme {
  selected: boolean;
  evolutionSourceType: EvolutionLexemeSourceType;
  temporaryPhonologicalForm?: string;
}

export interface RunEvolutionInput {
  planId: string;
  sourceStageId: string;
  selectedLexemeIds: string[];
  temporaryPhonologicalForms?: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

export interface EvolutionTestWordPreviewItem {
  source: string;
  engineInput: string;
  engineOutput: string;
  displayOutput: string;
  changed: boolean;
  error?: string;
}

export interface EvolutionTestWordPreview {
  ruleNames: string[];
  items: EvolutionTestWordPreviewItem[];
}

export interface EvolutionApplication {
  listPlans(
    languageId: string,
    includeArchived?: boolean
  ): Promise<EvolutionPlan[]>;
  getPlan(id: string): Promise<EvolutionPlan | null>;
  createPlan(
    languageId: string,
    sourceStageId?: string
  ): Promise<EvolutionPlan>;
  duplicatePlan(planId: string): Promise<EvolutionPlan>;
  savePlan(plan: EvolutionPlan): Promise<void>;
  endPlanEditSession(planId: string): void;
  archivePlan(planId: string, archived: boolean): Promise<void>;
  deletePlan(planId: string): Promise<void>;
  listVersions(planId: string): Promise<EvolutionPlanVersion[]>;
  createVersion(planId: string, note?: string): Promise<EvolutionPlanVersion>;
  restoreVersion(versionId: string): Promise<EvolutionPlan>;
  resolveInputs(
    languageId: string,
    stageId: string
  ): Promise<EvolutionInputCandidate[]>;
  previewTestWords(
    plan: EvolutionPlan,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<EvolutionTestWordPreview>;
  runPreview(input: RunEvolutionInput): Promise<EvolutionRun>;
  reproduceRun(runId: string, signal?: AbortSignal): Promise<EvolutionRun>;
  rerunCurrent(runId: string, signal?: AbortSignal): Promise<EvolutionRun>;
  listRuns(planId: string): Promise<EvolutionRun[]>;
  getRun(id: string): Promise<EvolutionRun | null>;
  listRunItems(
    runId: string,
    offset?: number,
    limit?: number
  ): Promise<EvolutionRunItem[]>;
  createDeliveryDraft(runId: string): Promise<EvolutionDelivery>;
  saveDeliveryDraft(delivery: EvolutionDelivery): Promise<void>;
  listDeliveries(runId: string): Promise<EvolutionDelivery[]>;
  getDelivery(id: string): Promise<EvolutionDelivery | null>;
  validateDelivery(delivery: EvolutionDelivery): Promise<EvolutionDelivery>;
  commitDelivery(deliveryId: string): Promise<EvolutionDelivery>;
  getGraphData(): Promise<EvolutionGraphData>;
  normalizeEngineInput(value: string, mode: EvolutionInputMode): string;
}
