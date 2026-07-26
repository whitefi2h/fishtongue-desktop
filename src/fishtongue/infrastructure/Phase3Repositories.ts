import {
  ConceptListRepository,
  DatabaseSessionPort,
  GenerationBatchRepository,
  MorphemeRepository,
  WordGenerationProfileRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  ConceptList,
  GenerationBatch,
  GenerationCandidate,
  LexiconBatchOperation,
  Morpheme,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";

type MorphemeRow = {
  id: string;
  language_id: string;
  form: string;
  type: Morpheme["type"];
  meaning: string;
  applicable_pos: string;
  status: Morpheme["status"];
  composition_rule_json: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export class SqliteMorphemeRepository implements MorphemeRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<Morpheme[]> {
    const rows = await this.database.select<MorphemeRow>(
      `SELECT id, language_id, form, type, meaning, applicable_pos, status,
              composition_rule_json, notes, created_at, updated_at
       FROM morphemes WHERE language_id = $1 ORDER BY type, form`,
      [languageId]
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      form: row.form,
      type: row.type,
      meaning: row.meaning,
      applicablePartOfSpeech: row.applicable_pos,
      status: row.status,
      compositionRule: JSON.parse(row.composition_rule_json),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async save(value: Morpheme): Promise<void> {
    await this.database.execute(
      `INSERT INTO morphemes (
         id, language_id, form, type, meaning, applicable_pos, status,
         composition_rule_json, notes, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT(id) DO UPDATE SET
         form=excluded.form, type=excluded.type, meaning=excluded.meaning,
         applicable_pos=excluded.applicable_pos, status=excluded.status,
         composition_rule_json=excluded.composition_rule_json,
         notes=excluded.notes, updated_at=excluded.updated_at`,
      [
        value.id, value.languageId, value.form, value.type, value.meaning,
        value.applicablePartOfSpeech, value.status,
        JSON.stringify(value.compositionRule), value.notes,
        value.createdAt, value.updatedAt,
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM morphemes WHERE id = $1", [id]);
  }
}

type ProfileRow = {
  id: string;
  language_id: string;
  name: string;
  config_json: string;
  config_version: WordGenerationProfile["configVersion"];
  is_default: number;
  created_at: string;
  updated_at: string;
};

export class SqliteWordGenerationProfileRepository
  implements WordGenerationProfileRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<WordGenerationProfile[]> {
    const rows = await this.database.select<ProfileRow>(
      `SELECT id, language_id, name, config_json, config_version, is_default,
              created_at, updated_at
       FROM word_generation_profiles
       WHERE language_id = $1 ORDER BY is_default DESC, name`,
      [languageId]
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      name: row.name,
      config: JSON.parse(row.config_json),
      configVersion: row.config_version,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async save(value: WordGenerationProfile): Promise<void> {
    await this.database.execute(
      `INSERT INTO word_generation_profile_write_commands
       (id, language_id, name, config_json, config_version, is_default, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        value.id, value.languageId, value.name, JSON.stringify(value.config),
        value.configVersion, value.isDefault ? 1 : 0, value.createdAt, value.updatedAt,
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute("DELETE FROM word_generation_profiles WHERE id = $1", [id]);
  }
}

type ConceptRow = {
  list_id: string;
  project_id: string;
  name: string;
  source: string;
  source_version: string;
  readonly: number;
  created_at: string;
  updated_at: string;
  concept_id: string | null;
  concept_key: string | null;
  gloss: string | null;
  position: number | null;
};

export class SqliteConceptListRepository implements ConceptListRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<ConceptList[]> {
    const rows = await this.database.select<ConceptRow>(
      `SELECT l.id AS list_id, l.project_id, l.name, l.source, l.source_version,
              l.readonly, l.created_at, l.updated_at, c.id AS concept_id,
              c.concept_key, c.gloss, c.position
       FROM concept_lists l LEFT JOIN concepts c ON c.concept_list_id = l.id
       WHERE l.project_id = $1 ORDER BY l.readonly DESC, l.name, c.position`,
      [projectId]
    );
    const lists = new Map<string, ConceptList>();
    for (const row of rows) {
      const value = lists.get(row.list_id) ?? {
        id: row.list_id,
        projectId: row.project_id,
        name: row.name,
        source: row.source,
        sourceVersion: row.source_version,
        readonly: row.readonly === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        concepts: [],
      };
      if (row.concept_id && row.concept_key !== null && row.gloss !== null && row.position !== null) {
        value.concepts.push({
          id: row.concept_id,
          conceptKey: row.concept_key,
          gloss: row.gloss,
          position: row.position,
        });
      }
      lists.set(row.list_id, value);
    }
    return [...lists.values()];
  }

  async save(value: ConceptList): Promise<void> {
    await this.database.execute(
      `INSERT INTO concept_list_write_commands
       (id, project_id, name, source, source_version, readonly, created_at, updated_at, concepts_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        value.id, value.projectId, value.name, value.source, value.sourceVersion,
        value.readonly ? 1 : 0, value.createdAt, value.updatedAt,
        JSON.stringify(value.concepts),
      ]
    );
  }

  async delete(id: string): Promise<void> {
    await this.database.execute(
      "DELETE FROM concept_lists WHERE id = $1 AND readonly = 0",
      [id]
    );
  }
}

type BatchRow = {
  id: string;
  language_id: string;
  type: GenerationBatch["type"];
  profile_snapshot_json: string;
  profile_version: string;
  algorithm_version: string;
  seed: string;
  input_snapshot_json: string;
  status: GenerationBatch["status"];
  created_at: string;
  committed_at: string | null;
};
type CandidateRow = {
  id: string;
  batch_id: string;
  position: number;
  concept_key: string;
  gloss: string;
  romanized: string;
  ipa: string;
  part_of_speech: string;
  status: GenerationCandidate["status"];
  conflicts_json: string;
  source_lexeme_id: string | null;
  morpheme_id: string | null;
  committed_lexeme_id: string;
  committed_sense_id: string;
};
type OperationRow = {
  id: string;
  language_id: string;
  batch_id: string;
  kind: LexiconBatchOperation["kind"];
  created_at: string;
  undone_at: string | null;
};

export class SqliteGenerationBatchRepository implements GenerationBatchRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(languageId: string): Promise<GenerationBatch[]> {
    const rows = await this.database.select<BatchRow>(
      `SELECT * FROM generation_batches
       WHERE language_id = $1 ORDER BY created_at DESC`,
      [languageId]
    );
    return this.attachCandidates(rows);
  }

  async get(id: string): Promise<GenerationBatch | null> {
    const rows = await this.database.select<BatchRow>(
      "SELECT * FROM generation_batches WHERE id = $1",
      [id]
    );
    return (await this.attachCandidates(rows))[0] ?? null;
  }

  async create(value: GenerationBatch): Promise<void> {
    await this.database.execute(
      `INSERT INTO generation_batch_write_commands
       (id, language_id, type, profile_snapshot_json, profile_version,
        algorithm_version, seed, input_snapshot_json, created_at, candidates_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        value.id, value.languageId, value.type, JSON.stringify(value.profileSnapshot),
        value.profileVersion, value.algorithmVersion, value.seed,
        JSON.stringify(value.inputSnapshot), value.createdAt,
        JSON.stringify(value.candidates),
      ]
    );
  }

  async saveCandidate(batchId: string, value: GenerationCandidate): Promise<void> {
    await this.database.execute(
      `UPDATE generation_candidates SET
         concept_key=$1, gloss=$2, romanized=$3, ipa=$4, part_of_speech=$5,
         status=$6, conflicts_json=$7
       WHERE id=$8 AND batch_id=$9 AND status <> 'committed'`,
      [
        value.conceptKey, value.gloss, value.romanized, value.ipa,
        value.partOfSpeech, value.status, JSON.stringify(value.conflicts),
        value.id, batchId,
      ]
    );
  }

  async commit(batchId: string, operationId: string, committedAt: string): Promise<void> {
    await this.database.execute(
      "INSERT INTO generation_commit_commands VALUES ($1,$2,$3)",
      [operationId, batchId, committedAt]
    );
  }

  async listOperations(languageId: string): Promise<LexiconBatchOperation[]> {
    const rows = await this.database.select<OperationRow>(
      `SELECT id, language_id, batch_id, kind, created_at, undone_at
       FROM lexicon_batch_operations
       WHERE language_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [languageId]
    );
    return rows.map((row) => ({
      id: row.id,
      languageId: row.language_id,
      batchId: row.batch_id,
      kind: row.kind,
      createdAt: row.created_at,
      undoneAt: row.undone_at ?? undefined,
    }));
  }

  async undo(operationId: string, undoneAt: string): Promise<void> {
    await this.database.execute(
      "INSERT INTO generation_undo_commands VALUES ($1,$2)",
      [operationId, undoneAt]
    );
  }

  private async attachCandidates(rows: BatchRow[]): Promise<GenerationBatch[]> {
    if (!rows.length) return [];
    const result = rows.map(mapBatch);
    for (const batch of result) {
      const candidateRows = await this.database.select<CandidateRow>(
        `SELECT * FROM generation_candidates
         WHERE batch_id = $1 ORDER BY position`,
        [batch.id]
      );
      batch.candidates = candidateRows.map(mapCandidate);
    }
    return result;
  }
}

function mapBatch(row: BatchRow): GenerationBatch {
  return {
    id: row.id,
    languageId: row.language_id,
    type: row.type,
    profileSnapshot: JSON.parse(row.profile_snapshot_json),
    profileVersion: row.profile_version,
    algorithmVersion: row.algorithm_version,
    seed: row.seed,
    inputSnapshot: JSON.parse(row.input_snapshot_json),
    status: row.status,
    createdAt: row.created_at,
    committedAt: row.committed_at ?? undefined,
    candidates: [],
  };
}

function mapCandidate(row: CandidateRow): GenerationCandidate {
  return {
    id: row.id,
    position: row.position,
    conceptKey: row.concept_key,
    gloss: row.gloss,
    romanized: row.romanized,
    ipa: row.ipa,
    partOfSpeech: row.part_of_speech,
    status: row.status,
    conflicts: JSON.parse(row.conflicts_json),
    sourceLexemeId: row.source_lexeme_id ?? undefined,
    morphemeId: row.morpheme_id ?? undefined,
    committedLexemeId: row.committed_lexeme_id,
    committedSenseId: row.committed_sense_id,
  };
}
