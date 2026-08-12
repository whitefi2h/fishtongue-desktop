import { DatabaseSessionPort } from "@/fishtongue/application/ports/ProjectPorts";
import { BorrowingBatchRepository, BorrowingProfileRepository, PhonologyRepository } from "@/fishtongue/application/ports/Phase6Ports";
import { BorrowingBatch, BorrowingCandidate, BorrowingProfile, PhonologyProfile } from "@/fishtongue/domain/models";

export class SqlitePhonologyRepository implements PhonologyRepository {
  constructor(private readonly db: DatabaseSessionPort) {}
  async getOrCreate(languageId: string): Promise<PhonologyProfile> {
    const rows = await this.db.select<any>("SELECT * FROM phonology_profiles WHERE language_id=$1", [languageId]);
    if (!rows[0]) {
      const now = new Date().toISOString();
      const profile: PhonologyProfile = { id: crypto.randomUUID(), languageId, structureVersion: "phonology-profile-v1", syllableTemplates: [], legalOnsets: [], legalNuclei: [], legalCodas: [], legalClusters: [], forbiddenPatterns: [], stressRules: {}, toneRules: {}, phonemes: [], createdAt: now, updatedAt: now };
      await this.save(profile); return profile;
    }
    const row = rows[0];
    const tactics = JSON.parse(row.phonotactics_json);
    const phonemes = await this.db.select<any>("SELECT * FROM phonemes WHERE profile_id=$1 ORDER BY position", [row.id]);
    return { id: row.id, languageId: row.language_id, structureVersion: row.structure_version, syllableTemplates: JSON.parse(row.syllable_templates_json), legalOnsets: tactics.legalOnsets ?? [], legalNuclei: tactics.legalNuclei ?? [], legalCodas: tactics.legalCodas ?? [], legalClusters: tactics.legalClusters ?? [], forbiddenPatterns: tactics.forbiddenPatterns ?? [], stressRules: JSON.parse(row.stress_rules_json), toneRules: JSON.parse(row.tone_rules_json), phonemes: phonemes.map((p) => ({ id:p.id, profileId:p.profile_id, ipa:p.ipa, displaySymbol:p.display_symbol, category:p.category, role:p.role, parentPhonemeId:p.parent_phoneme_id ?? undefined, distribution:p.distribution, source:p.source, notes:p.notes, position:p.position })), createdAt: row.created_at, updatedAt: row.updated_at };
  }
  async save(value: PhonologyProfile): Promise<void> {
    await this.db.execute(
      `INSERT INTO phonology_write_commands(
        id,profile_id,language_id,structure_version,syllable_templates_json,
        phonotactics_json,stress_rules_json,tone_rules_json,phonemes_json,
        created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [crypto.randomUUID(),value.id,value.languageId,value.structureVersion,
       JSON.stringify(value.syllableTemplates),
       JSON.stringify({legalOnsets:value.legalOnsets,legalNuclei:value.legalNuclei,
         legalCodas:value.legalCodas,legalClusters:value.legalClusters,
         forbiddenPatterns:value.forbiddenPatterns}),
       JSON.stringify(value.stressRules),JSON.stringify(value.toneRules),
       JSON.stringify(value.phonemes),value.createdAt,value.updatedAt]
    );
  }
}

export class SqliteBorrowingProfileRepository implements BorrowingProfileRepository {
  constructor(private readonly db: DatabaseSessionPort) {}
  async list(targetLanguageId: string, sourceLanguageId?: string): Promise<BorrowingProfile[]> {
    const rows=await this.db.select<any>(`SELECT * FROM borrowing_profiles WHERE target_language_id=$1 AND ($2 IS NULL OR source_language_id=$2) ORDER BY is_default DESC,name`,[targetLanguageId,sourceLanguageId??null]);
    return rows.map((r)=>({id:r.id,projectId:r.project_id,sourceLanguageId:r.source_language_id??undefined,sourceStageId:r.source_stage_id??undefined,targetLanguageId:r.target_language_id,targetStageId:r.target_stage_id??undefined,name:r.name,structureVersion:r.structure_version,isDefault:Boolean(r.is_default),config:JSON.parse(r.config_json),createdAt:r.created_at,updatedAt:r.updated_at}));
  }
  async save(v: BorrowingProfile): Promise<void> {
    await this.db.execute(
      `INSERT INTO borrowing_profile_write_commands VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )`,
      [crypto.randomUUID(),v.id,v.projectId,v.sourceLanguageId??null,
       v.sourceStageId??null,v.targetLanguageId,v.targetStageId??null,v.name,
       v.structureVersion,v.isDefault?1:0,JSON.stringify(v.config),v.createdAt,v.updatedAt]
    );
  }
  async delete(id:string){await this.db.execute("DELETE FROM borrowing_profiles WHERE id=$1",[id]);}
}

export class SqliteBorrowingBatchRepository implements BorrowingBatchRepository {
  constructor(private readonly db: DatabaseSessionPort) {}

  async list(targetLanguageId: string): Promise<BorrowingBatch[]> {
    const rows = await this.db.select<any>(
      "SELECT id FROM borrowing_batches WHERE target_language_id=$1 ORDER BY created_at DESC",
      [targetLanguageId]
    );
    return Promise.all(rows.map(async (row) => (await this.get(row.id))!));
  }

  async get(id: string): Promise<BorrowingBatch | null> {
    const rows = await this.db.select<any>("SELECT * FROM borrowing_batches WHERE id=$1", [id]);
    if (!rows[0]) return null;
    const candidateRows = await this.db.select<any>(
      "SELECT * FROM borrowing_candidates WHERE batch_id=$1 ORDER BY position",
      [id]
    );
    return mapBatch(rows[0], candidateRows.map(mapCandidate));
  }

  async create(batch: BorrowingBatch): Promise<void> {
    await this.db.execute(
      `INSERT INTO borrowing_batch_write_commands VALUES(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
      )`,
      [crypto.randomUUID(),batch.id,batch.profileId,batch.sourceLanguageId??null,batch.sourceStageId??null,
       batch.targetLanguageId,batch.targetStageId??null,JSON.stringify(batch.sourceSnapshot),
       JSON.stringify(batch.phonologySnapshot),JSON.stringify(batch.profileSnapshot),batch.snapshotHash,
       batch.panphonVersion,batch.algorithmVersion,batch.historicalEventId??null,
       JSON.stringify(batch.lexurgyStageChain),batch.llmModelLabel??null,batch.status,
       batch.createdAt,batch.updatedAt,JSON.stringify(batch.candidates)]
    );
  }

  async saveCandidate(value: BorrowingCandidate): Promise<void> {
    await this.db.execute(
      `INSERT INTO borrowing_candidates(
        id,batch_id,source_lexeme_id,source_form,source_ipa,adapted_form,adapted_ipa,
        evolved_form,part_of_speech,senses_json,morpheme_ids_json,trace_json,distance,
        warnings_json,explanation,status,committed_lexeme_id,committed_relation_id,position
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT(id) DO UPDATE SET adapted_form=excluded.adapted_form,
        adapted_ipa=excluded.adapted_ipa,evolved_form=excluded.evolved_form,
        part_of_speech=excluded.part_of_speech,senses_json=excluded.senses_json,
        morpheme_ids_json=excluded.morpheme_ids_json,trace_json=excluded.trace_json,
        distance=excluded.distance,warnings_json=excluded.warnings_json,
        explanation=excluded.explanation,status=excluded.status`,
      [value.id,value.batchId,value.sourceLexemeId??null,value.sourceForm,value.sourceIpa,
       value.adaptedForm,value.adaptedIpa,value.evolvedForm??null,value.partOfSpeech,
       JSON.stringify(value.senses),JSON.stringify(value.morphemeIds),JSON.stringify(value.trace),
       value.distance??null,JSON.stringify(value.warnings),value.explanation,value.status,
       value.committedLexemeId??null,value.committedRelationId??null,value.position]
    );
  }

  async commitAtomic(input: { batchId: string; candidateIds: string[]; committedAt: string }) {
    await this.db.execute(
      "INSERT INTO borrowing_commit_commands(id,batch_id,candidate_ids_json,committed_at) VALUES($1,$2,$3,$4)",
      [crypto.randomUUID(),input.batchId,JSON.stringify(input.candidateIds),input.committedAt]
    );
    return {
      lexemeIds: input.candidateIds.map((id) => `${id}:lexeme`),
      relationIds: input.candidateIds.map((id) => `${id}:relation`),
    };
  }

  async discard(id: string, updatedAt: string): Promise<void> {
    await this.db.execute(
      "UPDATE borrowing_batches SET status='discarded',updated_at=$2 WHERE id=$1 AND status='draft'",
      [id, updatedAt]
    );
  }
}

function mapCandidate(row: any): BorrowingCandidate {
  return {
    id:row.id,batchId:row.batch_id,sourceLexemeId:row.source_lexeme_id??undefined,
    sourceForm:row.source_form,sourceIpa:row.source_ipa,adaptedForm:row.adapted_form,
    adaptedIpa:row.adapted_ipa,evolvedForm:row.evolved_form??undefined,
    partOfSpeech:row.part_of_speech,senses:JSON.parse(row.senses_json),
    morphemeIds:JSON.parse(row.morpheme_ids_json),trace:JSON.parse(row.trace_json),
    distance:row.distance??undefined,warnings:JSON.parse(row.warnings_json),
    explanation:row.explanation,status:row.status,
    committedLexemeId:row.committed_lexeme_id??undefined,
    committedRelationId:row.committed_relation_id??undefined,position:row.position,
  };
}

function mapBatch(row: any, candidates: BorrowingCandidate[]): BorrowingBatch {
  return {
    id:row.id,profileId:row.profile_id,sourceLanguageId:row.source_language_id??undefined,
    sourceStageId:row.source_stage_id??undefined,targetLanguageId:row.target_language_id,
    targetStageId:row.target_stage_id??undefined,sourceSnapshot:JSON.parse(row.source_snapshot_json),
    phonologySnapshot:JSON.parse(row.phonology_snapshot_json),profileSnapshot:JSON.parse(row.profile_snapshot_json),
    snapshotHash:row.snapshot_hash,panphonVersion:row.panphon_version,
    algorithmVersion:row.algorithm_version,historicalEventId:row.historical_event_id??undefined,
    lexurgyStageChain:JSON.parse(row.lexurgy_stage_chain_json),llmModelLabel:row.llm_model_label??undefined,
    status:row.status,candidates,createdAt:row.created_at,updatedAt:row.updated_at,
  };
}
