PRAGMA foreign_keys = ON;

ALTER TABLE lexemes ADD COLUMN ipa TEXT NOT NULL DEFAULT '';
ALTER TABLE lexemes ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'confirmed', 'deprecated'));
ALTER TABLE lexemes ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'generated', 'derived', 'imported'));
ALTER TABLE lexemes ADD COLUMN notes TEXT NOT NULL DEFAULT '';

ALTER TABLE lexeme_write_commands ADD COLUMN ipa TEXT NOT NULL DEFAULT '';
ALTER TABLE lexeme_write_commands ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE lexeme_write_commands ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE lexeme_write_commands ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE lexeme_write_commands ADD COLUMN morphemes_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(morphemes_json));

DROP TRIGGER IF EXISTS execute_lexeme_write;
CREATE TRIGGER execute_lexeme_write
AFTER INSERT ON lexeme_write_commands
BEGIN
  INSERT INTO lexemes (
    id, language_id, romanized, part_of_speech, created_at, updated_at,
    ipa, status, source_type, notes
  ) VALUES (
    NEW.id, NEW.language_id, NEW.romanized, NEW.part_of_speech,
    NEW.created_at, NEW.updated_at, NEW.ipa, NEW.status, NEW.source_type, NEW.notes
  )
  ON CONFLICT(id) DO UPDATE SET
    language_id = excluded.language_id,
    romanized = excluded.romanized,
    part_of_speech = excluded.part_of_speech,
    updated_at = excluded.updated_at,
    ipa = excluded.ipa,
    status = excluded.status,
    source_type = excluded.source_type,
    notes = excluded.notes;

  DELETE FROM senses WHERE lexeme_id = NEW.id;
  INSERT INTO senses (id, lexeme_id, definition, position)
  SELECT
    json_extract(value, '$.id'),
    NEW.id,
    json_extract(value, '$.definition'),
    CAST(key AS INTEGER)
  FROM json_each(NEW.senses_json);

  DELETE FROM lexeme_morphemes WHERE lexeme_id = NEW.id;
  INSERT INTO lexeme_morphemes (lexeme_id, morpheme_id, position, role)
  SELECT
    NEW.id,
    json_extract(value, '$.morphemeId'),
    CAST(key AS INTEGER),
    coalesce(json_extract(value, '$.role'), '')
  FROM json_each(NEW.morphemes_json);

  DELETE FROM lexeme_write_commands WHERE id = NEW.id;
END;

CREATE TABLE morphemes (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  form TEXT NOT NULL CHECK (length(trim(form)) > 0),
  type TEXT NOT NULL CHECK (
    type IN ('root', 'prefix', 'suffix', 'infix', 'circumfix', 'clitic', 'inflectional_ending')
  ),
  meaning TEXT NOT NULL CHECK (length(trim(meaning)) > 0),
  applicable_pos TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'deprecated')),
  composition_rule_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(composition_rule_json)),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE INDEX idx_morphemes_language ON morphemes(language_id, type, form);

CREATE TABLE lexeme_morphemes (
  lexeme_id TEXT NOT NULL,
  morpheme_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  role TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (lexeme_id, position),
  UNIQUE (lexeme_id, morpheme_id, position),
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE,
  FOREIGN KEY (morpheme_id) REFERENCES morphemes(id) ON DELETE RESTRICT
);

CREATE INDEX idx_lexeme_morphemes_morpheme ON lexeme_morphemes(morpheme_id);

CREATE TABLE word_generation_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  config_version TEXT NOT NULL CHECK (config_version = 'wordgen-profile-v1'),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE INDEX idx_wordgen_profiles_language
  ON word_generation_profiles(language_id, is_default DESC, name);
CREATE UNIQUE INDEX idx_wordgen_default_profile
  ON word_generation_profiles(language_id) WHERE is_default = 1;

CREATE TABLE word_generation_profile_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  config_version TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER execute_word_generation_profile_write
AFTER INSERT ON word_generation_profile_write_commands
BEGIN
  UPDATE word_generation_profiles SET is_default = 0
  WHERE language_id = NEW.language_id AND NEW.is_default = 1;
  INSERT INTO word_generation_profiles (
    id, language_id, name, config_json, config_version, is_default, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.name, NEW.config_json, NEW.config_version,
    NEW.is_default, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    config_json = excluded.config_json,
    config_version = excluded.config_version,
    is_default = excluded.is_default,
    updated_at = excluded.updated_at;
  DELETE FROM word_generation_profile_write_commands WHERE id = NEW.id;
END;

CREATE TABLE concept_lists (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  source TEXT NOT NULL DEFAULT 'custom',
  source_version TEXT NOT NULL DEFAULT '',
  readonly INTEGER NOT NULL DEFAULT 0 CHECK (readonly IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_concept_lists_project ON concept_lists(project_id, name);

CREATE TABLE concepts (
  id TEXT PRIMARY KEY NOT NULL,
  concept_list_id TEXT NOT NULL,
  concept_key TEXT NOT NULL,
  gloss TEXT NOT NULL CHECK (length(trim(gloss)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (concept_list_id) REFERENCES concept_lists(id) ON DELETE CASCADE,
  UNIQUE (concept_list_id, position)
);

CREATE TABLE concept_list_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  source_version TEXT NOT NULL,
  readonly INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  concepts_json TEXT NOT NULL CHECK (json_valid(concepts_json))
);

CREATE TRIGGER execute_concept_list_write
AFTER INSERT ON concept_list_write_commands
BEGIN
  INSERT INTO concept_lists (
    id, project_id, name, source, source_version, readonly, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.project_id, NEW.name, NEW.source, NEW.source_version,
    NEW.readonly, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    source = excluded.source,
    source_version = excluded.source_version,
    readonly = excluded.readonly,
    updated_at = excluded.updated_at;
  DELETE FROM concepts WHERE concept_list_id = NEW.id;
  INSERT INTO concepts (id, concept_list_id, concept_key, gloss, position)
  SELECT
    json_extract(value, '$.id'), NEW.id,
    json_extract(value, '$.conceptKey'),
    json_extract(value, '$.gloss'), CAST(key AS INTEGER)
  FROM json_each(NEW.concepts_json);
  DELETE FROM concept_list_write_commands WHERE id = NEW.id;
END;

CREATE TABLE generation_batches (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('basic', 'derivation')),
  profile_snapshot_json TEXT NOT NULL CHECK (json_valid(profile_snapshot_json)),
  profile_version TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'committed', 'undone')),
  created_at TEXT NOT NULL,
  committed_at TEXT,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE INDEX idx_generation_batches_language
  ON generation_batches(language_id, created_at DESC);

CREATE TABLE generation_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  concept_key TEXT NOT NULL DEFAULT '',
  gloss TEXT NOT NULL CHECK (length(trim(gloss)) > 0),
  romanized TEXT NOT NULL CHECK (length(trim(romanized)) > 0),
  ipa TEXT NOT NULL DEFAULT '',
  part_of_speech TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'committed')),
  conflicts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(conflicts_json)),
  source_lexeme_id TEXT,
  morpheme_id TEXT,
  committed_lexeme_id TEXT NOT NULL,
  committed_sense_id TEXT NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES generation_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (source_lexeme_id) REFERENCES lexemes(id) ON DELETE SET NULL,
  FOREIGN KEY (morpheme_id) REFERENCES morphemes(id) ON DELETE SET NULL,
  UNIQUE (batch_id, position)
);

CREATE INDEX idx_generation_candidates_batch
  ON generation_candidates(batch_id, status, position);

CREATE TABLE lexicon_batch_operations (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  batch_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('generation_commit', 'derivation_commit')),
  inverse_snapshot_json TEXT NOT NULL CHECK (json_valid(inverse_snapshot_json)),
  created_at TEXT NOT NULL,
  undone_at TEXT,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES generation_batches(id) ON DELETE CASCADE
);

CREATE INDEX idx_batch_operations_language
  ON lexicon_batch_operations(language_id, created_at DESC);

CREATE TABLE generation_batch_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  type TEXT NOT NULL,
  profile_snapshot_json TEXT NOT NULL CHECK (json_valid(profile_snapshot_json)),
  profile_version TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  seed TEXT NOT NULL,
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  created_at TEXT NOT NULL,
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json))
);

CREATE TRIGGER execute_generation_batch_write
AFTER INSERT ON generation_batch_write_commands
BEGIN
  INSERT INTO generation_batches (
    id, language_id, type, profile_snapshot_json, profile_version,
    algorithm_version, seed, input_snapshot_json, created_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.type, NEW.profile_snapshot_json,
    NEW.profile_version, NEW.algorithm_version, NEW.seed,
    NEW.input_snapshot_json, NEW.created_at
  );

  INSERT INTO generation_candidates (
    id, batch_id, position, concept_key, gloss, romanized, ipa,
    part_of_speech, status, conflicts_json, source_lexeme_id, morpheme_id,
    committed_lexeme_id, committed_sense_id
  )
  SELECT
    json_extract(value, '$.id'), NEW.id, CAST(key AS INTEGER),
    coalesce(json_extract(value, '$.conceptKey'), ''),
    json_extract(value, '$.gloss'),
    json_extract(value, '$.romanized'),
    coalesce(json_extract(value, '$.ipa'), ''),
    coalesce(json_extract(value, '$.partOfSpeech'), ''),
    coalesce(json_extract(value, '$.status'), 'pending'),
    json(coalesce(json_extract(value, '$.conflicts'), '[]')),
    json_extract(value, '$.sourceLexemeId'),
    json_extract(value, '$.morphemeId'),
    json_extract(value, '$.committedLexemeId'),
    json_extract(value, '$.committedSenseId')
  FROM json_each(NEW.candidates_json);

  DELETE FROM generation_batch_write_commands WHERE id = NEW.id;
END;

CREATE TABLE generation_commit_commands (
  operation_id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE TRIGGER execute_generation_commit
AFTER INSERT ON generation_commit_commands
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_candidates
    WHERE batch_id = NEW.batch_id AND status = 'accepted'
  ) THEN RAISE(ABORT, 'NO_ACCEPTED_CANDIDATES') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM generation_candidates c
    JOIN generation_batches b ON b.id = c.batch_id
    JOIN lexemes l
      ON l.language_id = b.language_id
     AND lower(l.romanized) = lower(c.romanized)
    WHERE c.batch_id = NEW.batch_id AND c.status = 'accepted'
  ) THEN RAISE(ABORT, 'DUPLICATE_LEXEME') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM generation_candidates a
    JOIN generation_candidates b
      ON a.batch_id = b.batch_id
     AND a.id < b.id
     AND lower(a.romanized) = lower(b.romanized)
    WHERE a.batch_id = NEW.batch_id
      AND a.status = 'accepted' AND b.status = 'accepted'
  ) THEN RAISE(ABORT, 'DUPLICATE_CANDIDATE') END;

  INSERT INTO lexemes (
    id, language_id, romanized, part_of_speech, created_at, updated_at,
    ipa, status, source_type, notes
  )
  SELECT
    c.committed_lexeme_id, b.language_id, c.romanized, c.part_of_speech,
    NEW.committed_at, NEW.committed_at, c.ipa, 'draft',
    CASE WHEN b.type = 'derivation' THEN 'derived' ELSE 'generated' END, ''
  FROM generation_candidates c
  JOIN generation_batches b ON b.id = c.batch_id
  WHERE c.batch_id = NEW.batch_id AND c.status = 'accepted';

  INSERT INTO senses (id, lexeme_id, definition, position)
  SELECT committed_sense_id, committed_lexeme_id, gloss, 0
  FROM generation_candidates
  WHERE batch_id = NEW.batch_id AND status = 'accepted';

  INSERT INTO lexeme_morphemes (lexeme_id, morpheme_id, position, role)
  SELECT committed_lexeme_id, morpheme_id, 0, 'derivational'
  FROM generation_candidates
  WHERE batch_id = NEW.batch_id AND status = 'accepted' AND morpheme_id IS NOT NULL;

  INSERT INTO lexicon_batch_operations (
    id, language_id, batch_id, kind, inverse_snapshot_json, created_at
  )
  SELECT
    NEW.operation_id, b.language_id, b.id,
    CASE WHEN b.type = 'derivation' THEN 'derivation_commit' ELSE 'generation_commit' END,
    json_group_array(json_object(
      'candidateId', c.id,
      'lexemeId', c.committed_lexeme_id,
      'updatedAt', NEW.committed_at
    )),
    NEW.committed_at
  FROM generation_batches b
  JOIN generation_candidates c ON c.batch_id = b.id
  WHERE b.id = NEW.batch_id AND c.status = 'accepted'
  GROUP BY b.id;

  UPDATE generation_candidates SET status = 'committed'
  WHERE batch_id = NEW.batch_id AND status = 'accepted';
  UPDATE generation_batches
  SET status = 'committed', committed_at = NEW.committed_at
  WHERE id = NEW.batch_id;

  DELETE FROM generation_commit_commands WHERE operation_id = NEW.operation_id;
END;

CREATE TABLE generation_undo_commands (
  operation_id TEXT PRIMARY KEY NOT NULL,
  undone_at TEXT NOT NULL
);

CREATE TRIGGER execute_generation_undo
AFTER INSERT ON generation_undo_commands
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lexicon_batch_operations
    WHERE id = NEW.operation_id AND undone_at IS NULL
  ) THEN RAISE(ABORT, 'OPERATION_NOT_UNDOABLE') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM lexicon_batch_operations o, json_each(o.inverse_snapshot_json) snapshot
    LEFT JOIN lexemes l ON l.id = json_extract(snapshot.value, '$.lexemeId')
    WHERE o.id = NEW.operation_id
      AND (
        l.id IS NULL OR
        l.updated_at <> json_extract(snapshot.value, '$.updatedAt')
      )
  ) THEN RAISE(ABORT, 'UNDO_CONFLICT') END;

  DELETE FROM lexemes
  WHERE id IN (
    SELECT json_extract(snapshot.value, '$.lexemeId')
    FROM lexicon_batch_operations o, json_each(o.inverse_snapshot_json) snapshot
    WHERE o.id = NEW.operation_id
  );

  UPDATE generation_candidates
  SET status = 'accepted'
  WHERE id IN (
    SELECT json_extract(snapshot.value, '$.candidateId')
    FROM lexicon_batch_operations o, json_each(o.inverse_snapshot_json) snapshot
    WHERE o.id = NEW.operation_id
  );

  UPDATE generation_batches
  SET status = 'undone'
  WHERE id = (
    SELECT batch_id FROM lexicon_batch_operations WHERE id = NEW.operation_id
  );
  UPDATE lexicon_batch_operations SET undone_at = NEW.undone_at
  WHERE id = NEW.operation_id;

  DELETE FROM generation_undo_commands WHERE operation_id = NEW.operation_id;
END;
