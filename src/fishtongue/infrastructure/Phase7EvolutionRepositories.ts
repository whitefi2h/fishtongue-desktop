import {
  EvolutionDeliveryRepository,
  EvolutionDeliveryCommitCommand,
  EvolutionPlanRepository,
  EvolutionRunRepository,
} from "@/fishtongue/application/ports/EvolutionPorts";
import { DatabaseSessionPort } from "@/fishtongue/application/ports/ProjectPorts";
import {
  EvolutionDelivery,
  EvolutionDeliveryItem,
  EvolutionPlan,
  EvolutionPlanScope,
  EvolutionPlanVersion,
  EvolutionRun,
  EvolutionRunItem,
  EvolutionRunSummary,
  EvolutionGraphMarker,
} from "@/fishtongue/domain/models";

const emptyScope = (): EvolutionPlanScope => ({
  query: "",
  partOfSpeech: "",
  lexicalStatus: "all",
  sourceType: "all",
});

export class SqliteEvolutionPlanRepository implements EvolutionPlanRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(
    languageId: string,
    includeArchived = false
  ): Promise<EvolutionPlan[]> {
    const rows = await this.database.select<any>(
      `SELECT * FROM evolution_plans
       WHERE language_id = $1 AND ($2 = 1 OR archived = 0)
       ORDER BY archived, updated_at DESC, id`,
      [languageId, includeArchived ? 1 : 0]
    );
    return rows.map(mapPlan);
  }

  async get(id: string): Promise<EvolutionPlan | null> {
    const [row] = await this.database.select<any>(
      "SELECT * FROM evolution_plans WHERE id = $1",
      [id]
    );
    return row ? mapPlan(row) : null;
  }

  async save(plan: EvolutionPlan): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_plans (
         id, language_id, legacy_evolution_id, name, description,
         source_stage_id, input_mode, rules_draft, test_words_json,
         scope_json, archived, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description,
         source_stage_id=excluded.source_stage_id, input_mode=excluded.input_mode,
         rules_draft=excluded.rules_draft, test_words_json=excluded.test_words_json,
         scope_json=excluded.scope_json, archived=excluded.archived,
         updated_at=excluded.updated_at`,
      [
        plan.id,
        plan.languageId,
        plan.legacyEvolutionId ?? null,
        plan.name,
        plan.description,
        plan.sourceStageId ?? null,
        plan.inputMode,
        plan.rulesDraft,
        JSON.stringify(plan.testWords),
        JSON.stringify(plan.scope),
        plan.archived ? 1 : 0,
        plan.createdAt,
        plan.updatedAt,
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM evolution_plans WHERE id = $1", [
      id,
    ]);
  }

  async listVersions(planId: string): Promise<EvolutionPlanVersion[]> {
    const rows = await this.database.select<any>(
      `SELECT * FROM evolution_plan_versions
       WHERE plan_id = $1 ORDER BY version_number DESC`,
      [planId]
    );
    return rows.map(mapVersion);
  }

  async getVersion(id: string): Promise<EvolutionPlanVersion | null> {
    const [row] = await this.database.select<any>(
      "SELECT * FROM evolution_plan_versions WHERE id = $1",
      [id]
    );
    return row ? mapVersion(row) : null;
  }

  async createVersion(version: EvolutionPlanVersion): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_plan_versions (
         id, plan_id, version_number, rules_snapshot, test_words_json,
         input_mode, scope_json, note, content_hash, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        version.id,
        version.planId,
        version.versionNumber,
        version.rulesSnapshot,
        JSON.stringify(version.testWords),
        version.inputMode,
        JSON.stringify(version.scope),
        version.note,
        version.contentHash,
        version.createdAt,
      ]
    );
  }
}

export class SqliteEvolutionRunRepository implements EvolutionRunRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(planId: string): Promise<EvolutionRun[]> {
    const rows = await this.database.select<any>(
      `SELECT r.* FROM evolution_runs r
       JOIN evolution_plan_versions v ON v.id = r.plan_version_id
       WHERE v.plan_id = $1 ORDER BY r.created_at DESC, r.id`,
      [planId]
    );
    return rows.map(mapRun);
  }

  async get(id: string): Promise<EvolutionRun | null> {
    const [row] = await this.database.select<any>(
      "SELECT * FROM evolution_runs WHERE id = $1",
      [id]
    );
    return row ? mapRun(row) : null;
  }

  async create(
    run: EvolutionRun & { items: EvolutionRunItem[] }
  ): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_run_write_commands (
         id, plan_version_id, source_language_id, source_stage_id, input_mode,
         status, engine_version, engine_hash, protocol_version, rules_hash,
         input_hash, source_state_hash, source_phonology_json, summary_json,
         error_json, created_at, completed_at, items_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        run.id,
        run.planVersionId,
        run.sourceLanguageId,
        run.sourceStageId,
        run.inputMode,
        run.status,
        run.engineVersion,
        run.engineHash,
        run.protocolVersion,
        run.rulesHash,
        run.inputHash,
        run.sourceStateHash,
        JSON.stringify(run.sourcePhonology),
        JSON.stringify(run.summary),
        JSON.stringify(run.errors),
        run.createdAt,
        run.completedAt,
        JSON.stringify(run.items.map(serializeRunItem)),
      ]
    );
  }

  async listItems(
    runId: string,
    offset = 0,
    limit = 100
  ): Promise<EvolutionRunItem[]> {
    const rows = await this.database.select<any>(
      `SELECT * FROM evolution_run_items WHERE run_id = $1
       ORDER BY position, id LIMIT $2 OFFSET $3`,
      [runId, limit, offset]
    );
    return rows.map(mapRunItem);
  }
}

export class SqliteEvolutionDeliveryRepository
  implements EvolutionDeliveryRepository
{
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(runId: string): Promise<EvolutionDelivery[]> {
    const rows = await this.database.select<any>(
      "SELECT * FROM evolution_deliveries WHERE run_id = $1 ORDER BY created_at DESC, id",
      [runId]
    );
    return Promise.all(rows.map((row) => this.withItems(row)));
  }

  async get(id: string): Promise<EvolutionDelivery | null> {
    const [row] = await this.database.select<any>(
      "SELECT * FROM evolution_deliveries WHERE id = $1",
      [id]
    );
    return row ? this.withItems(row) : null;
  }

  async saveDraft(delivery: EvolutionDelivery): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_delivery_write_commands (
         id, run_id, target_type, target_language_id, target_stage_id,
         target_config_json, target_state_hash, summary_json, created_at,
         updated_at, items_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        delivery.id,
        delivery.runId,
        delivery.targetType,
        delivery.targetLanguageId ?? null,
        delivery.targetStageId ?? null,
        JSON.stringify(delivery.targetConfig),
        delivery.targetStateHash,
        JSON.stringify(delivery.summary),
        delivery.createdAt,
        delivery.updatedAt,
        JSON.stringify(delivery.items.map(serializeDeliveryItem)),
      ]
    );
  }

  async commit(command: EvolutionDeliveryCommitCommand): Promise<void> {
    await this.database.execute(
      `INSERT INTO evolution_delivery_commit_commands (
         operation_id, delivery_id, target_language_id, target_stage_id,
         committed_at, payload_json
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        command.operationId,
        command.deliveryId,
        command.targetLanguageId,
        command.targetStageId,
        command.committedAt,
        JSON.stringify(command.payload),
      ]
    );
  }

  async listGraphMarkers(projectId: string): Promise<EvolutionGraphMarker[]> {
    const rows = await this.database.select<any>(
      `SELECT d.id delivery_id,d.status delivery_status,d.target_type,
              r.source_language_id,r.source_stage_id,d.target_language_id,d.target_stage_id,
              p.id plan_id,p.name plan_name,v.version_number,r.id run_id,r.rules_hash,
              r.summary_json,d.committed_at
       FROM evolution_deliveries d
       JOIN evolution_runs r ON r.id=d.run_id
       JOIN evolution_plan_versions v ON v.id=r.plan_version_id
       JOIN evolution_plans p ON p.id=v.plan_id
       JOIN languages l ON l.id=r.source_language_id
       WHERE l.project_id=$1 AND d.status='committed'
       ORDER BY d.committed_at,d.created_at,d.id`,
      [projectId]
    );
    return rows.map((row) => {
      const summary = parseJson<EvolutionRunSummary>(row.summary_json, {
        total: 0,
        changed: 0,
        unchanged: 0,
        warnings: 0,
        errors: 0,
        notRun: 0,
      });
      return {
        deliveryId: row.delivery_id,
        deliveryStatus: row.delivery_status,
        targetType: row.target_type,
        sourceLanguageId: row.source_language_id,
        sourceStageId: row.source_stage_id,
        targetLanguageId: row.target_language_id,
        targetStageId: row.target_stage_id,
        planId: row.plan_id,
        planName: row.plan_name,
        versionNumber: row.version_number,
        runId: row.run_id,
        rulesHash: row.rules_hash,
        total: summary.total,
        changed: summary.changed,
        warnings: summary.warnings + summary.errors,
        committedAt: row.committed_at ?? undefined,
      } as EvolutionGraphMarker;
    });
  }

  private async withItems(row: any): Promise<EvolutionDelivery> {
    const itemRows = await this.database.select<any>(
      `SELECT * FROM evolution_delivery_items WHERE delivery_id = $1
       ORDER BY position, id`,
      [row.id]
    );
    return mapDelivery(row, itemRows.map(mapDeliveryItem));
  }
}

function mapPlan(row: any): EvolutionPlan {
  return {
    id: row.id,
    languageId: row.language_id,
    legacyEvolutionId: row.legacy_evolution_id ?? undefined,
    name: row.name,
    description: row.description,
    sourceStageId: row.source_stage_id ?? undefined,
    inputMode: row.input_mode,
    rulesDraft: row.rules_draft,
    testWords: parseJson(row.test_words_json, []),
    scope: { ...emptyScope(), ...parseJson(row.scope_json, {}) },
    archived: Boolean(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: any): EvolutionPlanVersion {
  return {
    id: row.id,
    planId: row.plan_id,
    versionNumber: row.version_number,
    rulesSnapshot: row.rules_snapshot,
    testWords: parseJson(row.test_words_json, []),
    inputMode: row.input_mode,
    scope: { ...emptyScope(), ...parseJson(row.scope_json, {}) },
    note: row.note,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  };
}

function mapRun(row: any): EvolutionRun {
  return {
    id: row.id,
    planVersionId: row.plan_version_id,
    sourceLanguageId: row.source_language_id,
    sourceStageId: row.source_stage_id,
    inputMode: row.input_mode,
    status: row.status,
    engineVersion: row.engine_version,
    engineHash: row.engine_hash,
    protocolVersion: row.protocol_version,
    rulesHash: row.rules_hash,
    inputHash: row.input_hash,
    sourceStateHash: row.source_state_hash,
    sourcePhonology: parseJson(row.source_phonology_json, {}),
    summary: parseJson<EvolutionRunSummary>(row.summary_json, {
      total: 0,
      changed: 0,
      unchanged: 0,
      warnings: 0,
      errors: 0,
      notRun: 0,
    }),
    errors: parseJson(row.error_json, []),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapRunItem(row: any): EvolutionRunItem {
  return {
    id: row.id,
    runId: row.run_id,
    sourceLexemeId: row.source_lexeme_id ?? undefined,
    sourceDisplayForm: row.source_display_form,
    sourcePhonologicalForm: row.source_phonological_form,
    engineInput: row.engine_input,
    engineOutput: row.engine_output,
    targetPhonologicalForm: row.target_phonological_form,
    inputOrigin: row.input_origin,
    status: row.status,
    intermediate: parseJson(row.intermediate_json, {}),
    trace: parseJson(row.trace_json, []),
    issues: parseJson(row.issue_json, []),
    position: row.position,
  };
}

function mapDelivery(
  row: any,
  items: EvolutionDeliveryItem[]
): EvolutionDelivery {
  return {
    id: row.id,
    runId: row.run_id,
    targetType: row.target_type,
    targetLanguageId: row.target_language_id ?? undefined,
    targetStageId: row.target_stage_id ?? undefined,
    targetConfig: parseJson(row.target_config_json, {}),
    targetStateHash: row.target_state_hash,
    status: row.status,
    summary: parseJson(row.summary_json, {}),
    projectOperationId: row.project_operation_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    committedAt: row.committed_at ?? undefined,
    items,
  };
}

function mapDeliveryItem(row: any): EvolutionDeliveryItem {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    runItemId: row.run_item_id,
    decision: row.decision,
    targetPhonologicalForm: row.target_phonological_form,
    targetDisplayForm: row.target_display_form,
    orthographyResolution: row.orthography_resolution,
    homophoneAcknowledged: Boolean(row.homophone_acknowledged),
    conflicts: parseJson(row.conflict_json, []),
    notes: row.notes,
    targetLexemeId: row.target_lexeme_id ?? undefined,
    position: row.position,
  };
}

function serializeRunItem(item: EvolutionRunItem) {
  return {
    id: item.id,
    sourceLexemeId: item.sourceLexemeId ?? null,
    sourceDisplayForm: item.sourceDisplayForm,
    sourcePhonologicalForm: item.sourcePhonologicalForm,
    engineInput: item.engineInput,
    engineOutput: item.engineOutput,
    targetPhonologicalForm: item.targetPhonologicalForm,
    inputOrigin: item.inputOrigin,
    status: item.status,
    intermediateJson: JSON.stringify(item.intermediate),
    traceJson: JSON.stringify(item.trace),
    issueJson: JSON.stringify(item.issues),
    position: item.position,
  };
}

function serializeDeliveryItem(item: EvolutionDeliveryItem) {
  return {
    id: item.id,
    runItemId: item.runItemId,
    decision: item.decision,
    targetPhonologicalForm: item.targetPhonologicalForm,
    targetDisplayForm: item.targetDisplayForm,
    orthographyResolution: item.orthographyResolution,
    homophoneAcknowledged: item.homophoneAcknowledged ? 1 : 0,
    conflictJson: JSON.stringify(item.conflicts),
    notes: item.notes,
    targetLexemeId: item.targetLexemeId ?? null,
    position: item.position,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
