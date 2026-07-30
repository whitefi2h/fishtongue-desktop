PRAGMA foreign_keys = ON;

-- Every language owns one internal default stage. Visible historical stages and
-- lightweight dialects inherit from it (or another explicit base stage).
CREATE TABLE language_stages (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  kind TEXT NOT NULL CHECK (kind IN (
    'internal_default', 'historical_stage', 'lightweight_dialect'
  )),
  documentation_status TEXT NOT NULL CHECK (documentation_status IN (
    'recorded', 'partial', 'unrecorded', 'reconstructed'
  )),
  storage_mode TEXT NOT NULL CHECK (storage_mode IN (
    'inherited_delta', 'independent_snapshot', 'no_data'
  )),
  chronology_parent_id TEXT,
  data_base_stage_id TEXT,
  start_label TEXT NOT NULL DEFAULT '',
  end_label TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (chronology_parent_id) REFERENCES language_stages(id) ON DELETE RESTRICT,
  FOREIGN KEY (data_base_stage_id) REFERENCES language_stages(id) ON DELETE RESTRICT,
  CHECK (
    (documentation_status = 'unrecorded' AND storage_mode = 'no_data') OR
    documentation_status <> 'unrecorded'
  ),
  CHECK (
    (kind = 'internal_default' AND visible = 0 AND
      chronology_parent_id IS NULL AND data_base_stage_id IS NULL) OR
    kind <> 'internal_default'
  )
);

CREATE UNIQUE INDEX idx_language_stages_internal_default
  ON language_stages(language_id) WHERE kind = 'internal_default';
CREATE UNIQUE INDEX idx_language_stages_position
  ON language_stages(language_id, position);
CREATE INDEX idx_language_stages_base
  ON language_stages(data_base_stage_id);

INSERT INTO language_stages (
  id, language_id, name, kind, documentation_status, storage_mode,
  chronology_parent_id, data_base_stage_id, position, visible, created_at, updated_at
)
SELECT
  id || ':default-stage', id, 'Default state', 'internal_default',
  'recorded', 'independent_snapshot', NULL, NULL, 0, 0, created_at, updated_at
FROM languages;

-- New languages receive the same safe internal state automatically.
CREATE TRIGGER create_default_stage_after_language
AFTER INSERT ON languages
BEGIN
  INSERT INTO language_stages (
    id, language_id, name, kind, documentation_status, storage_mode,
    chronology_parent_id, data_base_stage_id, position, visible, created_at, updated_at
  ) VALUES (
    NEW.id || ':default-stage', NEW.id, 'Default state', 'internal_default',
    'recorded', 'independent_snapshot', NULL, NULL, 0, 0, NEW.created_at, NEW.updated_at
  );
END;

CREATE TABLE stage_context_records (
  stage_id TEXT PRIMARY KEY NOT NULL,
  background TEXT NOT NULL DEFAULT '',
  evidence_notes TEXT NOT NULL DEFAULT '',
  sources_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(sources_json)),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stage_id) REFERENCES language_stages(id) ON DELETE CASCADE
);

-- Component deltas are versioned JSON documents. Phase 5 resolves the listed
-- formal components; future phases can add a new component type by migration.
CREATE TABLE stage_component_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  stage_id TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'lexicon', 'morphemes', 'evolution', 'inflection', 'wordgen'
  )),
  operation TEXT NOT NULL CHECK (operation IN ('replace', 'merge', 'remove')),
  target_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (stage_id) REFERENCES language_stages(id) ON DELETE CASCADE,
  UNIQUE (stage_id, component_type, target_id)
);
CREATE INDEX idx_stage_component_overrides
  ON stage_component_overrides(stage_id, component_type, position);

CREATE TABLE language_relations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_language_id TEXT NOT NULL,
  target_language_id TEXT NOT NULL,
  source_stage_id TEXT,
  target_stage_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN (
    'genetic', 'contact', 'dialect'
  )),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN (
    'confirmed', 'probable', 'possible', 'disputed'
  )),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (target_language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (source_stage_id) REFERENCES language_stages(id) ON DELETE SET NULL,
  FOREIGN KEY (target_stage_id) REFERENCES language_stages(id) ON DELETE SET NULL,
  CHECK (source_language_id <> target_language_id),
  CHECK ((kind = 'genetic' AND is_primary IN (0, 1)) OR
         (kind <> 'genetic' AND is_primary = 0))
);
CREATE UNIQUE INDEX idx_language_relations_primary_parent
  ON language_relations(target_language_id)
  WHERE kind = 'genetic' AND is_primary = 1;
CREATE INDEX idx_language_relations_project
  ON language_relations(project_id, kind);

CREATE TABLE historical_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'migration', 'contact', 'split', 'standardization', 'political', 'cultural', 'other'
  )),
  start_label TEXT NOT NULL DEFAULT '',
  end_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX idx_historical_events_project
  ON historical_events(project_id, position);

CREATE TABLE historical_event_participants (
  event_id TEXT NOT NULL,
  language_id TEXT NOT NULL,
  stage_id TEXT,
  role TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (event_id, language_id, stage_id),
  FOREIGN KEY (event_id) REFERENCES historical_events(id) ON DELETE CASCADE,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (stage_id) REFERENCES language_stages(id) ON DELETE SET NULL
);

CREATE TABLE etymology_relations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  source_lexeme_id TEXT,
  target_lexeme_id TEXT NOT NULL,
  source_stage_id TEXT,
  target_stage_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN (
    'inheritance', 'borrowing', 'cognate', 'derivation', 'calque', 'unknown'
  )),
  source_form TEXT NOT NULL DEFAULT '',
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN (
    'confirmed', 'probable', 'possible', 'disputed'
  )),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_lexeme_id) REFERENCES lexemes(id) ON DELETE SET NULL,
  FOREIGN KEY (target_lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE,
  FOREIGN KEY (source_stage_id) REFERENCES language_stages(id) ON DELETE SET NULL,
  FOREIGN KEY (target_stage_id) REFERENCES language_stages(id) ON DELETE SET NULL,
  CHECK (source_lexeme_id IS NULL OR source_lexeme_id <> target_lexeme_id)
);
CREATE INDEX idx_etymology_target ON etymology_relations(target_lexeme_id);
CREATE INDEX idx_etymology_source ON etymology_relations(source_lexeme_id);

-- Event and participant replacement is one atomic repository statement.
CREATE TABLE historical_event_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  start_label TEXT NOT NULL,
  end_label TEXT NOT NULL,
  description TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  participants_json TEXT NOT NULL CHECK (json_valid(participants_json))
);

CREATE TRIGGER execute_historical_event_write
AFTER INSERT ON historical_event_write_commands
BEGIN
  INSERT INTO historical_events (
    id, project_id, name, event_type, start_label, end_label, description,
    position, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.project_id, NEW.name, NEW.event_type, NEW.start_label,
    NEW.end_label, NEW.description, NEW.position, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    event_type = excluded.event_type,
    start_label = excluded.start_label,
    end_label = excluded.end_label,
    description = excluded.description,
    position = excluded.position,
    updated_at = excluded.updated_at;

  DELETE FROM historical_event_participants WHERE event_id = NEW.id;
  INSERT INTO historical_event_participants (
    event_id, language_id, stage_id, role, notes
  )
  SELECT
    NEW.id,
    json_extract(value, '$.languageId'),
    json_extract(value, '$.stageId'),
    coalesce(json_extract(value, '$.role'), ''),
    coalesce(json_extract(value, '$.notes'), '')
  FROM json_each(NEW.participants_json);

  DELETE FROM historical_event_write_commands WHERE id = NEW.id;
END;

CREATE TABLE stage_evolution_batches (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  source_stage_id TEXT NOT NULL,
  target_stage_id TEXT NOT NULL,
  rules_snapshot TEXT NOT NULL,
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'committed', 'undone'
  )),
  created_at TEXT NOT NULL,
  committed_at TEXT,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (source_stage_id) REFERENCES language_stages(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_stage_id) REFERENCES language_stages(id) ON DELETE RESTRICT,
  CHECK (source_stage_id <> target_stage_id)
);

CREATE TABLE stage_evolution_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  source_lexeme_id TEXT NOT NULL,
  source_form TEXT NOT NULL,
  result_form TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'committed'
  )),
  conflict_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(conflict_json)),
  created_lexeme_id TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (batch_id) REFERENCES stage_evolution_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (source_lexeme_id) REFERENCES lexemes(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_lexeme_id) REFERENCES lexemes(id) ON DELETE SET NULL,
  UNIQUE (batch_id, source_lexeme_id)
);

CREATE TABLE stage_evolution_operations (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  undone_at TEXT,
  FOREIGN KEY (batch_id) REFERENCES stage_evolution_batches(id) ON DELETE CASCADE
);

CREATE TABLE stage_evolution_batch_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  source_stage_id TEXT NOT NULL,
  target_stage_id TEXT NOT NULL,
  rules_snapshot TEXT NOT NULL,
  input_snapshot_json TEXT NOT NULL CHECK (json_valid(input_snapshot_json)),
  created_at TEXT NOT NULL,
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json))
);

CREATE TRIGGER execute_stage_evolution_batch_write
AFTER INSERT ON stage_evolution_batch_write_commands
BEGIN
  INSERT INTO stage_evolution_batches (
    id, language_id, source_stage_id, target_stage_id, rules_snapshot,
    input_snapshot_json, status, created_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.source_stage_id, NEW.target_stage_id,
    NEW.rules_snapshot, NEW.input_snapshot_json, 'draft', NEW.created_at
  );
  INSERT INTO stage_evolution_candidates (
    id, batch_id, source_lexeme_id, source_form, result_form, payload_json,
    status, conflict_json, created_lexeme_id, position
  )
  SELECT
    json_extract(value, '$.id'), NEW.id,
    json_extract(value, '$.sourceLexemeId'),
    json_extract(value, '$.sourceForm'),
    json_extract(value, '$.resultForm'),
    json_extract(value, '$.payloadJson'),
    json_extract(value, '$.status'),
    json_extract(value, '$.conflictJson'),
    NULL,
    json_extract(value, '$.position')
  FROM json_each(NEW.candidates_json);
  DELETE FROM stage_evolution_batch_write_commands WHERE id = NEW.id;
END;

CREATE TABLE stage_evolution_candidate_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  result_form TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  status TEXT NOT NULL,
  conflict_json TEXT NOT NULL CHECK (json_valid(conflict_json))
);

CREATE TRIGGER execute_stage_evolution_candidate_write
AFTER INSERT ON stage_evolution_candidate_write_commands
BEGIN
  UPDATE stage_evolution_candidates SET
    result_form = NEW.result_form,
    payload_json = NEW.payload_json,
    status = NEW.status,
    conflict_json = NEW.conflict_json
  WHERE id = NEW.id AND batch_id = NEW.batch_id AND status <> 'committed';
  DELETE FROM stage_evolution_candidate_write_commands WHERE id = NEW.id;
END;

CREATE TABLE stage_evolution_commit_commands (
  operation_id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE TRIGGER execute_stage_evolution_commit
AFTER INSERT ON stage_evolution_commit_commands
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM stage_evolution_candidates
    WHERE batch_id = NEW.batch_id AND status = 'accepted'
  ) THEN RAISE(ABORT, 'NO_ACCEPTED_STAGE_EVOLUTION_CANDIDATES') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM stage_evolution_candidates
    WHERE batch_id = NEW.batch_id AND status = 'accepted'
      AND json_array_length(conflict_json) > 0
  ) THEN RAISE(ABORT, 'STAGE_EVOLUTION_CONFLICTS') END;

  INSERT INTO stage_component_overrides (
    id, stage_id, component_type, operation, target_id, payload_json,
    position, created_at, updated_at
  )
  SELECT
    NEW.batch_id || ':' || c.id,
    b.target_stage_id,
    'lexicon',
    'replace',
    c.source_lexeme_id,
    c.payload_json,
    c.position,
    NEW.committed_at,
    NEW.committed_at
  FROM stage_evolution_candidates c
  JOIN stage_evolution_batches b ON b.id = c.batch_id
  WHERE c.batch_id = NEW.batch_id AND c.status = 'accepted';

  UPDATE stage_evolution_candidates
  SET status = 'committed', created_lexeme_id = source_lexeme_id
  WHERE batch_id = NEW.batch_id AND status = 'accepted';
  UPDATE stage_evolution_batches
  SET status = 'committed', committed_at = NEW.committed_at
  WHERE id = NEW.batch_id AND status = 'draft';
  INSERT INTO stage_evolution_operations (id, batch_id, created_at)
  VALUES (NEW.operation_id, NEW.batch_id, NEW.committed_at);
  DELETE FROM stage_evolution_commit_commands WHERE operation_id = NEW.operation_id;
END;

CREATE TABLE stage_evolution_undo_commands (
  operation_id TEXT PRIMARY KEY NOT NULL,
  undone_at TEXT NOT NULL
);

CREATE TRIGGER execute_stage_evolution_undo
AFTER INSERT ON stage_evolution_undo_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM stage_evolution_operations o
    JOIN stage_evolution_candidates c ON c.batch_id = o.batch_id
    JOIN stage_component_overrides v ON v.id = o.batch_id || ':' || c.id
    WHERE o.id = NEW.operation_id
      AND v.updated_at <> o.created_at
  ) THEN RAISE(ABORT, 'STAGE_EVOLUTION_OVERRIDE_CHANGED') END;

  DELETE FROM stage_component_overrides
  WHERE id IN (
    SELECT o.batch_id || ':' || c.id
    FROM stage_evolution_operations o
    JOIN stage_evolution_candidates c ON c.batch_id = o.batch_id
    WHERE o.id = NEW.operation_id
  );
  UPDATE stage_evolution_candidates
  SET status = 'accepted', created_lexeme_id = NULL
  WHERE batch_id = (
    SELECT batch_id FROM stage_evolution_operations WHERE id = NEW.operation_id
  ) AND status = 'committed';
  UPDATE stage_evolution_batches
  SET status = 'draft', committed_at = NULL
  WHERE id = (
    SELECT batch_id FROM stage_evolution_operations WHERE id = NEW.operation_id
  );
  UPDATE stage_evolution_operations
  SET undone_at = NEW.undone_at
  WHERE id = NEW.operation_id AND undone_at IS NULL;
  DELETE FROM stage_evolution_undo_commands WHERE operation_id = NEW.operation_id;
END;
