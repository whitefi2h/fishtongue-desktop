PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS phonology_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL UNIQUE REFERENCES languages(id) ON DELETE CASCADE,
  structure_version TEXT NOT NULL CHECK (structure_version = 'phonology-profile-v1'),
  syllable_templates_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(syllable_templates_json)),
  phonotactics_json TEXT NOT NULL DEFAULT '{"legalOnsets":[],"legalNuclei":[],"legalCodas":[],"legalClusters":[],"forbiddenPatterns":[]}' CHECK (json_valid(phonotactics_json)),
  stress_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(stress_rules_json)),
  tone_rules_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(tone_rules_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phonemes (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES phonology_profiles(id) ON DELETE CASCADE,
  ipa TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('consonant','vowel','suprasegmental','other')),
  role TEXT NOT NULL CHECK (role IN ('phoneme','allophone')),
  parent_phoneme_id TEXT REFERENCES phonemes(id) ON DELETE RESTRICT,
  distribution TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(profile_id, ipa, role)
);

CREATE TABLE IF NOT EXISTS borrowing_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_language_id TEXT REFERENCES languages(id) ON DELETE CASCADE,
  source_stage_id TEXT REFERENCES language_stages(id) ON DELETE SET NULL,
  target_language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  target_stage_id TEXT REFERENCES language_stages(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  structure_version TEXT NOT NULL CHECK (structure_version = 'borrowing-profile-v1'),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (source_language_id IS NULL OR source_language_id <> target_language_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS borrowing_profile_default_pair
  ON borrowing_profiles(COALESCE(source_language_id,''), COALESCE(source_stage_id,''), target_language_id, COALESCE(target_stage_id,'')) WHERE is_default = 1;

CREATE TABLE IF NOT EXISTS borrowing_profile_write_commands (
  command_id TEXT PRIMARY KEY NOT NULL,
  id TEXT NOT NULL, project_id TEXT NOT NULL, source_language_id TEXT,
  source_stage_id TEXT, target_language_id TEXT NOT NULL, target_stage_id TEXT,
  name TEXT NOT NULL, structure_version TEXT NOT NULL, is_default INTEGER NOT NULL,
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS execute_borrowing_profile_write
AFTER INSERT ON borrowing_profile_write_commands
BEGIN
  UPDATE borrowing_profiles SET is_default = 0, updated_at = NEW.updated_at
   WHERE NEW.is_default = 1 AND id <> NEW.id
     AND COALESCE(source_language_id,'') = COALESCE(NEW.source_language_id,'')
     AND COALESCE(source_stage_id,'') = COALESCE(NEW.source_stage_id,'')
     AND target_language_id = NEW.target_language_id
     AND COALESCE(target_stage_id,'') = COALESCE(NEW.target_stage_id,'');
  INSERT INTO borrowing_profiles VALUES (
    NEW.id,NEW.project_id,NEW.source_language_id,NEW.source_stage_id,
    NEW.target_language_id,NEW.target_stage_id,NEW.name,NEW.structure_version,
    NEW.is_default,NEW.config_json,NEW.created_at,NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,is_default=excluded.is_default,
    config_json=excluded.config_json,updated_at=excluded.updated_at;
  DELETE FROM borrowing_profile_write_commands WHERE command_id=NEW.command_id;
END;

CREATE TABLE IF NOT EXISTS borrowing_batches (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES borrowing_profiles(id) ON DELETE RESTRICT,
  source_language_id TEXT REFERENCES languages(id) ON DELETE SET NULL,
  source_stage_id TEXT REFERENCES language_stages(id) ON DELETE SET NULL,
  target_language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  target_stage_id TEXT REFERENCES language_stages(id) ON DELETE SET NULL,
  source_snapshot_json TEXT NOT NULL CHECK (json_valid(source_snapshot_json)),
  phonology_snapshot_json TEXT NOT NULL CHECK (json_valid(phonology_snapshot_json)),
  profile_snapshot_json TEXT NOT NULL CHECK (json_valid(profile_snapshot_json)),
  snapshot_hash TEXT NOT NULL, panphon_version TEXT NOT NULL, algorithm_version TEXT NOT NULL,
  historical_event_id TEXT REFERENCES historical_events(id) ON DELETE SET NULL,
  lexurgy_stage_chain_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(lexurgy_stage_chain_json)),
  llm_model_label TEXT, status TEXT NOT NULL CHECK (status IN ('draft','committed','discarded')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS borrowing_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES borrowing_batches(id) ON DELETE CASCADE,
  source_lexeme_id TEXT REFERENCES lexemes(id) ON DELETE SET NULL,
  source_form TEXT NOT NULL, source_ipa TEXT NOT NULL, adapted_form TEXT NOT NULL, adapted_ipa TEXT NOT NULL,
  evolved_form TEXT, part_of_speech TEXT NOT NULL, senses_json TEXT NOT NULL CHECK (json_valid(senses_json)),
  morpheme_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(morpheme_ids_json)),
  trace_json TEXT NOT NULL CHECK (json_valid(trace_json)), distance REAL,
  warnings_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warnings_json)), explanation TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','committed')),
  committed_lexeme_id TEXT REFERENCES lexemes(id) ON DELETE SET NULL,
  committed_relation_id TEXT REFERENCES etymology_relations(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS borrowing_candidates_batch_position ON borrowing_candidates(batch_id, position);

CREATE TABLE IF NOT EXISTS borrowing_batch_write_commands (
  command_id TEXT PRIMARY KEY NOT NULL,
  id TEXT NOT NULL, profile_id TEXT NOT NULL, source_language_id TEXT,
  source_stage_id TEXT, target_language_id TEXT NOT NULL, target_stage_id TEXT,
  source_snapshot_json TEXT NOT NULL CHECK (json_valid(source_snapshot_json)),
  phonology_snapshot_json TEXT NOT NULL CHECK (json_valid(phonology_snapshot_json)),
  profile_snapshot_json TEXT NOT NULL CHECK (json_valid(profile_snapshot_json)),
  snapshot_hash TEXT NOT NULL, panphon_version TEXT NOT NULL,
  algorithm_version TEXT NOT NULL, historical_event_id TEXT,
  lexurgy_stage_chain_json TEXT NOT NULL CHECK (json_valid(lexurgy_stage_chain_json)),
  llm_model_label TEXT, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json))
);

CREATE TRIGGER IF NOT EXISTS execute_borrowing_batch_write
AFTER INSERT ON borrowing_batch_write_commands
BEGIN
  INSERT INTO borrowing_batches VALUES (
    NEW.id,NEW.profile_id,NEW.source_language_id,NEW.source_stage_id,
    NEW.target_language_id,NEW.target_stage_id,NEW.source_snapshot_json,
    NEW.phonology_snapshot_json,NEW.profile_snapshot_json,NEW.snapshot_hash,
    NEW.panphon_version,NEW.algorithm_version,NEW.historical_event_id,
    NEW.lexurgy_stage_chain_json,NEW.llm_model_label,NEW.status,
    NEW.created_at,NEW.updated_at
  );
  INSERT INTO borrowing_candidates (
    id,batch_id,source_lexeme_id,source_form,source_ipa,adapted_form,adapted_ipa,
    evolved_form,part_of_speech,senses_json,morpheme_ids_json,trace_json,distance,
    warnings_json,explanation,status,committed_lexeme_id,committed_relation_id,position
  )
  SELECT json_extract(value,'$.id'),NEW.id,json_extract(value,'$.sourceLexemeId'),
    json_extract(value,'$.sourceForm'),json_extract(value,'$.sourceIpa'),
    json_extract(value,'$.adaptedForm'),json_extract(value,'$.adaptedIpa'),
    json_extract(value,'$.evolvedForm'),json_extract(value,'$.partOfSpeech'),
    json_extract(value,'$.senses'),json_extract(value,'$.morphemeIds'),
    json_extract(value,'$.trace'),json_extract(value,'$.distance'),
    json_extract(value,'$.warnings'),COALESCE(json_extract(value,'$.explanation'),''),
    json_extract(value,'$.status'),json_extract(value,'$.committedLexemeId'),
    json_extract(value,'$.committedRelationId'),COALESCE(json_extract(value,'$.position'),0)
  FROM json_each(NEW.candidates_json);
  DELETE FROM borrowing_batch_write_commands WHERE command_id=NEW.command_id;
END;

-- Save one complete phonology aggregate through one statement. Allophones are
-- deleted before their parents and inserted after them to preserve the
-- self-referencing foreign key.
CREATE TABLE IF NOT EXISTS phonology_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  language_id TEXT NOT NULL,
  structure_version TEXT NOT NULL,
  syllable_templates_json TEXT NOT NULL CHECK (json_valid(syllable_templates_json)),
  phonotactics_json TEXT NOT NULL CHECK (json_valid(phonotactics_json)),
  stress_rules_json TEXT NOT NULL CHECK (json_valid(stress_rules_json)),
  tone_rules_json TEXT NOT NULL CHECK (json_valid(tone_rules_json)),
  phonemes_json TEXT NOT NULL CHECK (json_valid(phonemes_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS execute_phonology_write
AFTER INSERT ON phonology_write_commands
BEGIN
  INSERT INTO phonology_profiles (
    id, language_id, structure_version, syllable_templates_json,
    phonotactics_json, stress_rules_json, tone_rules_json, created_at, updated_at
  ) VALUES (
    NEW.profile_id, NEW.language_id, NEW.structure_version,
    NEW.syllable_templates_json, NEW.phonotactics_json,
    NEW.stress_rules_json, NEW.tone_rules_json, NEW.created_at, NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    syllable_templates_json=excluded.syllable_templates_json,
    phonotactics_json=excluded.phonotactics_json,
    stress_rules_json=excluded.stress_rules_json,
    tone_rules_json=excluded.tone_rules_json,
    updated_at=excluded.updated_at;

  DELETE FROM phonemes
   WHERE profile_id = NEW.profile_id AND parent_phoneme_id IS NOT NULL;
  DELETE FROM phonemes WHERE profile_id = NEW.profile_id;

  INSERT INTO phonemes (
    id, profile_id, ipa, display_symbol, category, role,
    parent_phoneme_id, distribution, source, notes, position
  )
  SELECT json_extract(value,'$.id'), NEW.profile_id,
         json_extract(value,'$.ipa'), json_extract(value,'$.displaySymbol'),
         json_extract(value,'$.category'), json_extract(value,'$.role'), NULL,
         COALESCE(json_extract(value,'$.distribution'),''),
         COALESCE(json_extract(value,'$.source'),''),
         COALESCE(json_extract(value,'$.notes'),''),
         COALESCE(json_extract(value,'$.position'),0)
    FROM json_each(NEW.phonemes_json)
   WHERE json_extract(value,'$.parentPhonemeId') IS NULL;

  INSERT INTO phonemes (
    id, profile_id, ipa, display_symbol, category, role,
    parent_phoneme_id, distribution, source, notes, position
  )
  SELECT json_extract(value,'$.id'), NEW.profile_id,
         json_extract(value,'$.ipa'), json_extract(value,'$.displaySymbol'),
         json_extract(value,'$.category'), json_extract(value,'$.role'),
         json_extract(value,'$.parentPhonemeId'),
         COALESCE(json_extract(value,'$.distribution'),''),
         COALESCE(json_extract(value,'$.source'),''),
         COALESCE(json_extract(value,'$.notes'),''),
         COALESCE(json_extract(value,'$.position'),0)
    FROM json_each(NEW.phonemes_json)
   WHERE json_extract(value,'$.parentPhonemeId') IS NOT NULL;

  DELETE FROM phonology_write_commands WHERE id = NEW.id;
END;

-- A reviewed borrowing batch is committed through one statement. The trigger
-- writes lexemes, senses, morpheme links, etymology relations and candidate
-- states in the same SQLite transaction, so a failure cannot leave partial data.
CREATE TABLE IF NOT EXISTS borrowing_commit_commands (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES borrowing_batches(id) ON DELETE CASCADE,
  candidate_ids_json TEXT NOT NULL CHECK (json_valid(candidate_ids_json)),
  committed_at TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS validate_borrowing_commit
BEFORE INSERT ON borrowing_commit_commands
BEGIN
  SELECT CASE WHEN json_array_length(NEW.candidate_ids_json) = 0
    THEN RAISE(ABORT, 'NO_BORROWING_CANDIDATES') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.candidate_ids_json) selected
    LEFT JOIN borrowing_candidates candidate
      ON candidate.id = CAST(selected.value AS TEXT)
     AND candidate.batch_id = NEW.batch_id
    WHERE candidate.id IS NULL OR candidate.status <> 'accepted'
  ) THEN RAISE(ABORT, 'BORROWING_CANDIDATE_NOT_ACCEPTED') END;
END;

CREATE TRIGGER IF NOT EXISTS execute_borrowing_commit
AFTER INSERT ON borrowing_commit_commands
BEGIN
  INSERT INTO lexemes (
    id, language_id, romanized, part_of_speech, created_at, updated_at,
    ipa, status, source_type, notes
  )
  SELECT
    candidate.id || ':lexeme', batch.target_language_id,
    COALESCE(NULLIF(candidate.evolved_form, ''), candidate.adapted_form),
    candidate.part_of_speech, NEW.committed_at, NEW.committed_at,
    candidate.adapted_ipa, 'draft', 'imported', candidate.explanation
  FROM borrowing_candidates candidate
  JOIN borrowing_batches batch ON batch.id = candidate.batch_id
  WHERE candidate.batch_id = NEW.batch_id
    AND candidate.id IN (SELECT CAST(value AS TEXT) FROM json_each(NEW.candidate_ids_json));

  INSERT INTO senses (id, lexeme_id, definition, position)
  SELECT
    candidate.id || ':sense:' || CAST(sense.key AS TEXT),
    candidate.id || ':lexeme',
    json_extract(sense.value, '$.definition'),
    COALESCE(json_extract(sense.value, '$.position'), CAST(sense.key AS INTEGER))
  FROM borrowing_candidates candidate, json_each(candidate.senses_json) sense
  WHERE candidate.batch_id = NEW.batch_id
    AND candidate.id IN (SELECT CAST(value AS TEXT) FROM json_each(NEW.candidate_ids_json));

  INSERT INTO lexeme_morphemes (lexeme_id, morpheme_id, position, role)
  SELECT candidate.id || ':lexeme', CAST(morpheme.value AS TEXT),
         CAST(morpheme.key AS INTEGER), 'borrowing_integration'
  FROM borrowing_candidates candidate, json_each(candidate.morpheme_ids_json) morpheme
  WHERE candidate.batch_id = NEW.batch_id
    AND candidate.id IN (SELECT CAST(value AS TEXT) FROM json_each(NEW.candidate_ids_json));

  INSERT INTO etymology_relations (
    id, project_id, source_lexeme_id, target_lexeme_id,
    source_stage_id, target_stage_id, kind, source_form,
    confidence, notes, created_at, updated_at, historical_event_id
  )
  SELECT
    candidate.id || ':relation', language.project_id,
    candidate.source_lexeme_id, candidate.id || ':lexeme',
    batch.source_stage_id, batch.target_stage_id, 'borrowing', candidate.source_form,
    'confirmed', candidate.explanation, NEW.committed_at, NEW.committed_at,
    batch.historical_event_id
  FROM borrowing_candidates candidate
  JOIN borrowing_batches batch ON batch.id = candidate.batch_id
  JOIN languages language ON language.id = batch.target_language_id
  WHERE candidate.batch_id = NEW.batch_id
    AND candidate.id IN (SELECT CAST(value AS TEXT) FROM json_each(NEW.candidate_ids_json));

  UPDATE borrowing_candidates
  SET status = 'committed',
      committed_lexeme_id = id || ':lexeme',
      committed_relation_id = id || ':relation'
  WHERE batch_id = NEW.batch_id
    AND id IN (SELECT CAST(value AS TEXT) FROM json_each(NEW.candidate_ids_json));

  UPDATE borrowing_batches SET status = 'committed', updated_at = NEW.committed_at
  WHERE id = NEW.batch_id;

  DELETE FROM borrowing_commit_commands WHERE id = NEW.id;
END;
