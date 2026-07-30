import {
  EtymologyRepository,
  HistoricalEventRepository,
  LanguageRelationRepository,
  LanguageStageRepository,
  DatabaseSessionPort,
  StageEvolutionRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  EtymologyRelation,
  HistoricalEvent,
  LanguageRelation,
  LanguageStage,
  StageComponentOverride,
  StageContextRecord,
  StageEvolutionBatch,
  StageEvolutionCandidate,
  StageEvolutionOperation,
} from "@/fishtongue/domain/models";

type StageRow = {
  id: string;
  language_id: string;
  name: string;
  kind: LanguageStage["kind"];
  documentation_status: LanguageStage["documentationStatus"];
  storage_mode: LanguageStage["storageMode"];
  chronology_parent_id: string | null;
  data_base_stage_id: string | null;
  start_label: string;
  end_label: string;
  position: number;
  visible: number;
  created_at: string;
  updated_at: string;
};

type ContextRow = {
  stage_id: string;
  background: string;
  evidence_notes: string;
  sources_json: string;
  updated_at: string;
};

type OverrideRow = {
  id: string;
  stage_id: string;
  component_type: StageComponentOverride["componentType"];
  operation: StageComponentOverride["operation"];
  target_id: string;
  payload_json: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export class SqliteLanguageStageRepository implements LanguageStageRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<LanguageStage[]> {
    const rows = await this.database.select<StageRow>(
      `SELECT * FROM language_stages
       WHERE language_id = $1 ORDER BY position, created_at`,
      [languageId]
    );
    return rows.map(mapStage);
  }

  async get(id: string): Promise<LanguageStage | null> {
    const [row] = await this.database.select<StageRow>(
      "SELECT * FROM language_stages WHERE id = $1",
      [id]
    );
    return row ? mapStage(row) : null;
  }

  async save(value: LanguageStage): Promise<void> {
    await this.database.execute(
      `INSERT INTO language_stages (
         id, language_id, name, kind, documentation_status, storage_mode,
         chronology_parent_id, data_base_stage_id, start_label, end_label,
         position, visible, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, kind=excluded.kind,
         documentation_status=excluded.documentation_status,
         storage_mode=excluded.storage_mode,
         chronology_parent_id=excluded.chronology_parent_id,
         data_base_stage_id=excluded.data_base_stage_id,
         start_label=excluded.start_label, end_label=excluded.end_label,
         position=excluded.position, visible=excluded.visible,
         updated_at=excluded.updated_at`,
      [
        value.id, value.languageId, value.name, value.kind,
        value.documentationStatus, value.storageMode,
        value.chronologyParentId ?? null, value.dataBaseStageId ?? null,
        value.startLabel, value.endLabel, value.position,
        value.visible ? 1 : 0, value.createdAt, value.updatedAt,
      ]
    );
  }

  delete(id: string): Promise<void> {
    return this.database.execute(
      "DELETE FROM language_stages WHERE id = $1 AND kind <> 'internal_default'",
      [id]
    ).then(() => undefined);
  }

  async getContext(stageId: string): Promise<StageContextRecord | null> {
    const [row] = await this.database.select<ContextRow>(
      "SELECT * FROM stage_context_records WHERE stage_id = $1",
      [stageId]
    );
    return row ? {
      stageId: row.stage_id,
      background: row.background,
      evidenceNotes: row.evidence_notes,
      sources: JSON.parse(row.sources_json) as string[],
      updatedAt: row.updated_at,
    } : null;
  }

  async saveContext(value: StageContextRecord): Promise<void> {
    await this.database.execute(
      `INSERT INTO stage_context_records
       (stage_id, background, evidence_notes, sources_json, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(stage_id) DO UPDATE SET
         background=excluded.background,
         evidence_notes=excluded.evidence_notes,
         sources_json=excluded.sources_json,
         updated_at=excluded.updated_at`,
      [
        value.stageId, value.background, value.evidenceNotes,
        JSON.stringify(value.sources), value.updatedAt,
      ]
    );
  }

  async listOverrides(stageId: string): Promise<StageComponentOverride[]> {
    const rows = await this.database.select<OverrideRow>(
      `SELECT * FROM stage_component_overrides
       WHERE stage_id = $1 ORDER BY component_type, position`,
      [stageId]
    );
    return rows.map((row) => ({
      id: row.id,
      stageId: row.stage_id,
      componentType: row.component_type,
      operation: row.operation,
      targetId: row.target_id,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async saveOverride(value: StageComponentOverride): Promise<void> {
    await this.database.execute(
      `INSERT INTO stage_component_overrides (
         id, stage_id, component_type, operation, target_id, payload_json,
         position, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET
         operation=excluded.operation, target_id=excluded.target_id,
         payload_json=excluded.payload_json, position=excluded.position,
         updated_at=excluded.updated_at`,
      [
        value.id, value.stageId, value.componentType, value.operation,
        value.targetId, JSON.stringify(value.payload), value.position,
        value.createdAt, value.updatedAt,
      ]
    );
  }

  deleteOverride(id: string): Promise<void> {
    return this.database.execute(
      "DELETE FROM stage_component_overrides WHERE id = $1",
      [id]
    ).then(() => undefined);
  }
}

type RelationRow = {
  id: string;
  project_id: string;
  source_language_id: string;
  target_language_id: string;
  source_stage_id: string | null;
  target_stage_id: string | null;
  kind: LanguageRelation["kind"];
  is_primary: number;
  confidence: LanguageRelation["confidence"];
  notes: string;
  created_at: string;
  updated_at: string;
};

export class SqliteLanguageRelationRepository
implements LanguageRelationRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<LanguageRelation[]> {
    const rows = await this.database.select<RelationRow>(
      `SELECT * FROM language_relations
       WHERE project_id = $1 ORDER BY kind, created_at`,
      [projectId]
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceLanguageId: row.source_language_id,
      targetLanguageId: row.target_language_id,
      sourceStageId: row.source_stage_id ?? undefined,
      targetStageId: row.target_stage_id ?? undefined,
      kind: row.kind,
      isPrimary: row.is_primary === 1,
      confidence: row.confidence,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async save(value: LanguageRelation): Promise<void> {
    await this.database.execute(
      `INSERT INTO language_relations (
         id, project_id, source_language_id, target_language_id,
         source_stage_id, target_stage_id, kind, is_primary, confidence,
         notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET
         source_language_id=excluded.source_language_id,
         target_language_id=excluded.target_language_id,
         source_stage_id=excluded.source_stage_id,
         target_stage_id=excluded.target_stage_id,
         kind=excluded.kind, is_primary=excluded.is_primary,
         confidence=excluded.confidence, notes=excluded.notes,
         updated_at=excluded.updated_at`,
      [
        value.id, value.projectId, value.sourceLanguageId,
        value.targetLanguageId, value.sourceStageId ?? null,
        value.targetStageId ?? null, value.kind, value.isPrimary ? 1 : 0,
        value.confidence, value.notes, value.createdAt, value.updatedAt,
      ]
    );
  }

  delete(id: string): Promise<void> {
    return this.database.execute(
      "DELETE FROM language_relations WHERE id = $1",
      [id]
    ).then(() => undefined);
  }
}

type EventRow = {
  id: string;
  project_id: string;
  name: string;
  event_type: HistoricalEvent["eventType"];
  start_label: string;
  end_label: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
};
type ParticipantRow = {
  event_id: string;
  language_id: string;
  stage_id: string | null;
  role: string;
  notes: string;
};

export class SqliteHistoricalEventRepository implements HistoricalEventRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<HistoricalEvent[]> {
    const rows = await this.database.select<EventRow>(
      `SELECT * FROM historical_events
       WHERE project_id = $1 ORDER BY position, created_at`,
      [projectId]
    );
    if (!rows.length) return [];
    const participants = await this.database.select<ParticipantRow>(
      `SELECT p.* FROM historical_event_participants p
       JOIN historical_events e ON e.id = p.event_id
       WHERE e.project_id = $1`,
      [projectId]
    );
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      eventType: row.event_type,
      startLabel: row.start_label,
      endLabel: row.end_label,
      description: row.description,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      participants: participants
        .filter((value) => value.event_id === row.id)
        .map((value) => ({
          languageId: value.language_id,
          stageId: value.stage_id ?? undefined,
          role: value.role,
          notes: value.notes,
        })),
    }));
  }

  async save(value: HistoricalEvent): Promise<void> {
    await this.database.execute(
      `INSERT INTO historical_event_write_commands (
         id, project_id, name, event_type, start_label, end_label,
         description, position, created_at, updated_at, participants_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        value.id, value.projectId, value.name, value.eventType,
        value.startLabel, value.endLabel, value.description, value.position,
        value.createdAt, value.updatedAt, JSON.stringify(value.participants),
      ]
    );
  }

  delete(id: string): Promise<void> {
    return this.database.execute(
      "DELETE FROM historical_events WHERE id = $1",
      [id]
    ).then(() => undefined);
  }
}

type EtymologyRow = {
  id: string;
  project_id: string;
  source_lexeme_id: string | null;
  target_lexeme_id: string;
  source_stage_id: string | null;
  target_stage_id: string | null;
  kind: EtymologyRelation["kind"];
  source_form: string;
  confidence: EtymologyRelation["confidence"];
  notes: string;
  created_at: string;
  updated_at: string;
};

export class SqliteEtymologyRepository implements EtymologyRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<EtymologyRelation[]> {
    return this.read(
      "SELECT * FROM etymology_relations WHERE project_id = $1 ORDER BY created_at",
      [projectId]
    );
  }

  async listForLexeme(lexemeId: string): Promise<EtymologyRelation[]> {
    return this.read(
      `SELECT * FROM etymology_relations
       WHERE source_lexeme_id = $1 OR target_lexeme_id = $1
       ORDER BY created_at`,
      [lexemeId]
    );
  }

  async save(value: EtymologyRelation): Promise<void> {
    await this.database.execute(
      `INSERT INTO etymology_relations (
         id, project_id, source_lexeme_id, target_lexeme_id,
         source_stage_id, target_stage_id, kind, source_form, confidence,
         notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET
         source_lexeme_id=excluded.source_lexeme_id,
         target_lexeme_id=excluded.target_lexeme_id,
         source_stage_id=excluded.source_stage_id,
         target_stage_id=excluded.target_stage_id,
         kind=excluded.kind, source_form=excluded.source_form,
         confidence=excluded.confidence, notes=excluded.notes,
         updated_at=excluded.updated_at`,
      [
        value.id, value.projectId, value.sourceLexemeId ?? null,
        value.targetLexemeId, value.sourceStageId ?? null,
        value.targetStageId ?? null, value.kind, value.sourceForm,
        value.confidence, value.notes, value.createdAt, value.updatedAt,
      ]
    );
  }

  delete(id: string): Promise<void> {
    return this.database.execute(
      "DELETE FROM etymology_relations WHERE id = $1",
      [id]
    ).then(() => undefined);
  }

  private async read(query: string, values: unknown[]): Promise<EtymologyRelation[]> {
    const rows = await this.database.select<EtymologyRow>(query, values);
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceLexemeId: row.source_lexeme_id ?? undefined,
      targetLexemeId: row.target_lexeme_id,
      sourceStageId: row.source_stage_id ?? undefined,
      targetStageId: row.target_stage_id ?? undefined,
      kind: row.kind,
      sourceForm: row.source_form,
      confidence: row.confidence,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

function mapStage(row: StageRow): LanguageStage {
  return {
    id: row.id,
    languageId: row.language_id,
    name: row.name,
    kind: row.kind,
    documentationStatus: row.documentation_status,
    storageMode: row.storage_mode,
    chronologyParentId: row.chronology_parent_id ?? undefined,
    dataBaseStageId: row.data_base_stage_id ?? undefined,
    startLabel: row.start_label,
    endLabel: row.end_label,
    position: row.position,
    visible: row.visible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type EvolutionBatchRow = {
  id: string;
  language_id: string;
  source_stage_id: string;
  target_stage_id: string;
  rules_snapshot: string;
  input_snapshot_json: string;
  status: StageEvolutionBatch["status"];
  created_at: string;
  committed_at: string | null;
};
type EvolutionCandidateRow = {
  id: string;
  batch_id: string;
  source_lexeme_id: string;
  source_form: string;
  result_form: string;
  payload_json: string;
  status: StageEvolutionCandidate["status"];
  conflict_json: string;
  position: number;
};
type EvolutionOperationRow = {
  id: string;
  batch_id: string;
  created_at: string;
  undone_at: string | null;
};

export class SqliteStageEvolutionRepository implements StageEvolutionRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<StageEvolutionBatch[]> {
    const rows = await this.database.select<EvolutionBatchRow>(
      `SELECT * FROM stage_evolution_batches
       WHERE language_id = $1 ORDER BY created_at DESC`,
      [languageId]
    );
    return this.attachCandidates(rows);
  }

  async get(id: string): Promise<StageEvolutionBatch | null> {
    const rows = await this.database.select<EvolutionBatchRow>(
      "SELECT * FROM stage_evolution_batches WHERE id = $1",
      [id]
    );
    return (await this.attachCandidates(rows))[0] ?? null;
  }

  async create(value: StageEvolutionBatch): Promise<void> {
    await this.database.execute(
      `INSERT INTO stage_evolution_batch_write_commands (
         id, language_id, source_stage_id, target_stage_id, rules_snapshot,
         input_snapshot_json, created_at, candidates_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        value.id, value.languageId, value.sourceStageId, value.targetStageId,
        value.rulesSnapshot, JSON.stringify(value.inputSnapshot), value.createdAt,
        JSON.stringify(value.candidates.map((candidate) => ({
          id: candidate.id,
          sourceLexemeId: candidate.sourceLexemeId,
          sourceForm: candidate.sourceForm,
          resultForm: candidate.resultForm,
          payloadJson: JSON.stringify(candidate.payload),
          status: candidate.status,
          conflictJson: JSON.stringify(candidate.conflicts),
          position: candidate.position,
        }))),
      ]
    );
  }

  async saveCandidate(
    batchId: string,
    value: StageEvolutionCandidate
  ): Promise<void> {
    await this.database.execute(
      `INSERT INTO stage_evolution_candidate_write_commands
       (id, batch_id, result_form, payload_json, status, conflict_json)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        value.id, batchId, value.resultForm, JSON.stringify(value.payload),
        value.status, JSON.stringify(value.conflicts),
      ]
    );
  }

  commit(batchId: string, operationId: string, committedAt: string): Promise<void> {
    return this.database.execute(
      "INSERT INTO stage_evolution_commit_commands VALUES ($1,$2,$3)",
      [operationId, batchId, committedAt]
    ).then(() => undefined);
  }

  async listOperations(languageId: string): Promise<StageEvolutionOperation[]> {
    const rows = await this.database.select<EvolutionOperationRow>(
      `SELECT o.* FROM stage_evolution_operations o
       JOIN stage_evolution_batches b ON b.id = o.batch_id
       WHERE b.language_id = $1 ORDER BY o.created_at DESC`,
      [languageId]
    );
    return rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      createdAt: row.created_at,
      undoneAt: row.undone_at ?? undefined,
    }));
  }

  undo(operationId: string, undoneAt: string): Promise<void> {
    return this.database.execute(
      "INSERT INTO stage_evolution_undo_commands VALUES ($1,$2)",
      [operationId, undoneAt]
    ).then(() => undefined);
  }

  private async attachCandidates(
    rows: EvolutionBatchRow[]
  ): Promise<StageEvolutionBatch[]> {
    const result: StageEvolutionBatch[] = rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      sourceStageId: row.source_stage_id,
      targetStageId: row.target_stage_id,
      rulesSnapshot: row.rules_snapshot,
      inputSnapshot: JSON.parse(row.input_snapshot_json) as StageEvolutionBatch["inputSnapshot"],
      status: row.status,
      createdAt: row.created_at,
      committedAt: row.committed_at ?? undefined,
      candidates: [],
    }));
    for (const batch of result) {
      const candidates = await this.database.select<EvolutionCandidateRow>(
        `SELECT * FROM stage_evolution_candidates
         WHERE batch_id = $1 ORDER BY position`,
        [batch.id]
      );
      batch.candidates = candidates.map((row) => ({
        id: row.id,
        sourceLexemeId: row.source_lexeme_id,
        sourceForm: row.source_form,
        resultForm: row.result_form,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        status: row.status,
        conflicts: JSON.parse(row.conflict_json),
        position: row.position,
      }));
    }
    return result;
  }
}
