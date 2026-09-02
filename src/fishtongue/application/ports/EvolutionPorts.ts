import {
  EvolutionDelivery,
  EvolutionPlan,
  EvolutionPlanVersion,
  EvolutionRun,
  EvolutionRunItem,
  EvolutionGraphMarker,
} from "@/fishtongue/domain/models";

export interface EvolutionPlanRepository {
  list(languageId: string, includeArchived?: boolean): Promise<EvolutionPlan[]>;
  get(id: string): Promise<EvolutionPlan | null>;
  save(plan: EvolutionPlan): Promise<void>;
  delete(id: string): Promise<void>;
  listVersions(planId: string): Promise<EvolutionPlanVersion[]>;
  getVersion(id: string): Promise<EvolutionPlanVersion | null>;
  createVersion(version: EvolutionPlanVersion): Promise<void>;
}

export interface EvolutionRunRepository {
  list(planId: string): Promise<EvolutionRun[]>;
  get(id: string): Promise<EvolutionRun | null>;
  create(run: EvolutionRun & { items: EvolutionRunItem[] }): Promise<void>;
  listItems(
    runId: string,
    offset?: number,
    limit?: number
  ): Promise<EvolutionRunItem[]>;
}

export interface EvolutionDeliveryRepository {
  list(runId: string): Promise<EvolutionDelivery[]>;
  get(id: string): Promise<EvolutionDelivery | null>;
  saveDraft(delivery: EvolutionDelivery): Promise<void>;
  commit(command: EvolutionDeliveryCommitCommand): Promise<void>;
  listGraphMarkers(projectId: string): Promise<EvolutionGraphMarker[]>;
}

export interface EvolutionDeliveryCommitCommand {
  operationId: string;
  deliveryId: string;
  targetLanguageId: string;
  targetStageId: string;
  committedAt: string;
  payload: Record<string, unknown>;
}
