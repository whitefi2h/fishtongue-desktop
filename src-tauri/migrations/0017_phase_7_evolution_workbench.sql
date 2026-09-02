-- Phase 7.2 keeps editable plan drafts separate from immutable versions and runs.
-- Published migrations v1-v16 remain untouched; legacy evolutions and Phase 5
-- stage-evolution evidence stay readable after this migration.

ALTER TABLE project_operations ADD COLUMN coalesce_key TEXT;
ALTER TABLE project_operations ADD COLUMN coalesce_session_id TEXT;

-- Phase 6 introduced stage-level phonology overrides in the application layer.
-- Expand the Phase 5 enum without changing existing rows.
DROP TRIGGER execute_stage_evolution_commit;
DROP TRIGGER execute_stage_evolution_undo;
CREATE TABLE stage_component_overrides_v17 (
  id TEXT PRIMARY KEY NOT NULL,
  stage_id TEXT NOT NULL,
  component_type TEXT NOT NULL CHECK (component_type IN (
    'lexicon', 'morphemes', 'evolution', 'inflection', 'phonology', 'wordgen'
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
INSERT INTO stage_component_overrides_v17 SELECT * FROM stage_component_overrides;
DROP TABLE stage_component_overrides;
ALTER TABLE stage_component_overrides_v17 RENAME TO stage_component_overrides;
CREATE INDEX idx_stage_component_overrides
  ON stage_component_overrides(stage_id, component_type, position);

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
  SELECT NEW.batch_id || ':' || c.id,b.target_stage_id,'lexicon','replace',
    c.source_lexeme_id,c.payload_json,c.position,NEW.committed_at,NEW.committed_at
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

CREATE TRIGGER execute_stage_evolution_undo
AFTER INSERT ON stage_evolution_undo_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM stage_evolution_operations o
    JOIN stage_evolution_candidates c ON c.batch_id = o.batch_id
    JOIN stage_component_overrides v ON v.id = o.batch_id || ':' || c.id
    WHERE o.id = NEW.operation_id AND v.updated_at <> o.created_at
  ) THEN RAISE(ABORT, 'STAGE_EVOLUTION_OVERRIDE_CHANGED') END;
  DELETE FROM stage_component_overrides WHERE id IN (
    SELECT o.batch_id || ':' || c.id FROM stage_evolution_operations o
    JOIN stage_evolution_candidates c ON c.batch_id = o.batch_id
    WHERE o.id = NEW.operation_id
  );
  UPDATE stage_evolution_candidates SET status = 'accepted', created_lexeme_id = NULL
  WHERE batch_id = (SELECT batch_id FROM stage_evolution_operations WHERE id = NEW.operation_id)
    AND status = 'committed';
  UPDATE stage_evolution_batches SET status = 'draft', committed_at = NULL
  WHERE id = (SELECT batch_id FROM stage_evolution_operations WHERE id = NEW.operation_id);
  UPDATE stage_evolution_operations SET undone_at = NEW.undone_at
  WHERE id = NEW.operation_id AND undone_at IS NULL;
  DELETE FROM stage_evolution_undo_commands WHERE operation_id = NEW.operation_id;
END;

CREATE TABLE evolution_plans (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  legacy_evolution_id TEXT UNIQUE REFERENCES evolutions(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT NOT NULL DEFAULT '',
  source_stage_id TEXT REFERENCES language_stages(id) ON DELETE SET NULL,
  input_mode TEXT NOT NULL DEFAULT 'phonological'
    CHECK (input_mode IN ('phonological', 'orthographic')),
  rules_draft TEXT NOT NULL DEFAULT '',
  test_words_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(test_words_json)),
  scope_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(scope_json)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_evolution_plans_language
ON evolution_plans(language_id, archived, updated_at DESC, id);

CREATE TABLE evolution_plan_versions (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL REFERENCES evolution_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  rules_snapshot TEXT NOT NULL,
  test_words_json TEXT NOT NULL CHECK (json_valid(test_words_json)),
  input_mode TEXT NOT NULL CHECK (input_mode IN ('phonological', 'orthographic')),
  scope_json TEXT NOT NULL CHECK (json_valid(scope_json)),
  note TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL CHECK (length(content_hash) > 0),
  created_at TEXT NOT NULL,
  UNIQUE (plan_id, version_number),
  UNIQUE (plan_id, content_hash)
);

CREATE INDEX idx_evolution_versions_plan
ON evolution_plan_versions(plan_id, version_number DESC);

CREATE TABLE evolution_runs (
  id TEXT PRIMARY KEY NOT NULL,
  plan_version_id TEXT NOT NULL REFERENCES evolution_plan_versions(id) ON DELETE RESTRICT,
  source_language_id TEXT NOT NULL,
  source_stage_id TEXT NOT NULL,
  input_mode TEXT NOT NULL CHECK (input_mode IN ('phonological', 'orthographic')),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'cancelled')),
  engine_version TEXT NOT NULL,
  engine_hash TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  rules_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  source_state_hash TEXT NOT NULL,
  source_phonology_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(source_phonology_json)),
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary_json)),
  error_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(error_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX idx_evolution_runs_version
ON evolution_runs(plan_version_id, created_at DESC, id);
CREATE INDEX idx_evolution_runs_source
ON evolution_runs(source_language_id, source_stage_id, created_at DESC, id);

CREATE TABLE evolution_run_items (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES evolution_runs(id) ON DELETE CASCADE,
  source_lexeme_id TEXT,
  source_display_form TEXT NOT NULL,
  source_phonological_form TEXT NOT NULL DEFAULT '',
  engine_input TEXT NOT NULL DEFAULT '',
  engine_output TEXT NOT NULL DEFAULT '',
  target_phonological_form TEXT NOT NULL DEFAULT '',
  input_origin TEXT NOT NULL DEFAULT 'stored'
    CHECK (input_origin IN ('stored', 'temporary', 'missing')),
  status TEXT NOT NULL CHECK (status IN (
    'changed', 'unchanged', 'warning', 'error', 'not_run'
  )),
  intermediate_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(intermediate_json)),
  trace_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(trace_json)),
  issue_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issue_json)),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (run_id, position)
);

CREATE INDEX idx_evolution_run_items_page
ON evolution_run_items(run_id, position, id);
CREATE INDEX idx_evolution_run_items_status
ON evolution_run_items(run_id, status, position);

CREATE TABLE evolution_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES evolution_runs(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'new_stage', 'existing_stage', 'existing_dialect', 'new_descendant'
  )),
  target_language_id TEXT,
  target_stage_id TEXT,
  target_config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(target_config_json)),
  target_state_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'committed', 'undone')),
  summary_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary_json)),
  project_operation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE INDEX idx_evolution_deliveries_run
ON evolution_deliveries(run_id, created_at DESC, id);
CREATE INDEX idx_evolution_deliveries_target
ON evolution_deliveries(target_language_id, target_stage_id, created_at DESC, id);

CREATE TABLE evolution_delivery_items (
  id TEXT PRIMARY KEY NOT NULL,
  delivery_id TEXT NOT NULL REFERENCES evolution_deliveries(id) ON DELETE CASCADE,
  run_item_id TEXT NOT NULL REFERENCES evolution_run_items(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL DEFAULT 'include'
    CHECK (decision IN ('include', 'skip', 'create_homograph', 'merge_senses')),
  target_phonological_form TEXT NOT NULL DEFAULT '',
  target_display_form TEXT NOT NULL DEFAULT '',
  orthography_resolution TEXT NOT NULL DEFAULT 'pending'
    CHECK (orthography_resolution IN ('pending', 'preserved', 'manual')),
  homophone_acknowledged INTEGER NOT NULL DEFAULT 0
    CHECK (homophone_acknowledged IN (0, 1)),
  conflict_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(conflict_json)),
  notes TEXT NOT NULL DEFAULT '',
  target_lexeme_id TEXT,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (delivery_id, run_item_id),
  UNIQUE (delivery_id, position)
);

CREATE INDEX idx_evolution_delivery_items_page
ON evolution_delivery_items(delivery_id, position, id);

-- A completed engine run and every positional result are written atomically.
CREATE TABLE evolution_run_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  plan_version_id TEXT NOT NULL,
  source_language_id TEXT NOT NULL,
  source_stage_id TEXT NOT NULL,
  input_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  engine_hash TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  rules_hash TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  source_state_hash TEXT NOT NULL,
  source_phonology_json TEXT NOT NULL CHECK (json_valid(source_phonology_json)),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  error_json TEXT NOT NULL CHECK (json_valid(error_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json))
);

CREATE TRIGGER execute_evolution_run_write
AFTER INSERT ON evolution_run_write_commands
BEGIN
  INSERT INTO evolution_runs (
    id, plan_version_id, source_language_id, source_stage_id, input_mode,
    status, engine_version, engine_hash, protocol_version, rules_hash,
    input_hash, source_state_hash, source_phonology_json, summary_json,
    error_json, created_at, completed_at
  ) VALUES (
    NEW.id, NEW.plan_version_id, NEW.source_language_id, NEW.source_stage_id,
    NEW.input_mode, NEW.status, NEW.engine_version, NEW.engine_hash,
    NEW.protocol_version, NEW.rules_hash, NEW.input_hash, NEW.source_state_hash,
    NEW.source_phonology_json, NEW.summary_json, NEW.error_json,
    NEW.created_at, NEW.completed_at
  );
  INSERT INTO evolution_run_items (
    id, run_id, source_lexeme_id, source_display_form,
    source_phonological_form, engine_input, engine_output,
    target_phonological_form, input_origin, status, intermediate_json,
    trace_json, issue_json, position
  )
  SELECT
    json_extract(value, '$.id'), NEW.id,
    json_extract(value, '$.sourceLexemeId'),
    json_extract(value, '$.sourceDisplayForm'),
    coalesce(json_extract(value, '$.sourcePhonologicalForm'), ''),
    coalesce(json_extract(value, '$.engineInput'), ''),
    coalesce(json_extract(value, '$.engineOutput'), ''),
    coalesce(json_extract(value, '$.targetPhonologicalForm'), ''),
    json_extract(value, '$.inputOrigin'), json_extract(value, '$.status'),
    json_extract(value, '$.intermediateJson'),
    json_extract(value, '$.traceJson'), json_extract(value, '$.issueJson'),
    json_extract(value, '$.position')
  FROM json_each(NEW.items_json);
  DELETE FROM evolution_run_write_commands WHERE id = NEW.id;
END;

-- Delivery decisions are one aggregate. Saving a draft replaces its editable
-- items but never changes the immutable engine run.
CREATE TABLE evolution_delivery_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_language_id TEXT,
  target_stage_id TEXT,
  target_config_json TEXT NOT NULL CHECK (json_valid(target_config_json)),
  target_state_hash TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  items_json TEXT NOT NULL CHECK (json_valid(items_json))
);

CREATE TRIGGER execute_evolution_delivery_write
AFTER INSERT ON evolution_delivery_write_commands
BEGIN
  INSERT INTO evolution_deliveries (
    id, run_id, target_type, target_language_id, target_stage_id,
    target_config_json, target_state_hash, status, summary_json,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.run_id, NEW.target_type, NEW.target_language_id,
    NEW.target_stage_id, NEW.target_config_json, NEW.target_state_hash,
    'draft', NEW.summary_json, NEW.created_at, NEW.updated_at
  ) ON CONFLICT(id) DO UPDATE SET
    target_type = excluded.target_type,
    target_language_id = excluded.target_language_id,
    target_stage_id = excluded.target_stage_id,
    target_config_json = excluded.target_config_json,
    target_state_hash = excluded.target_state_hash,
    summary_json = excluded.summary_json,
    updated_at = excluded.updated_at
  WHERE evolution_deliveries.status = 'draft';
  DELETE FROM evolution_delivery_items
  WHERE delivery_id = NEW.id
    AND EXISTS (SELECT 1 FROM evolution_deliveries WHERE id = NEW.id AND status = 'draft');
  INSERT INTO evolution_delivery_items (
    id, delivery_id, run_item_id, decision, target_phonological_form,
    target_display_form, orthography_resolution, homophone_acknowledged,
    conflict_json, notes, target_lexeme_id, position
  )
  SELECT
    json_extract(value, '$.id'), NEW.id, json_extract(value, '$.runItemId'),
    json_extract(value, '$.decision'),
    coalesce(json_extract(value, '$.targetPhonologicalForm'), ''),
    coalesce(json_extract(value, '$.targetDisplayForm'), ''),
    json_extract(value, '$.orthographyResolution'),
    coalesce(json_extract(value, '$.homophoneAcknowledged'), 0),
    json_extract(value, '$.conflictJson'),
    coalesce(json_extract(value, '$.notes'), ''),
    json_extract(value, '$.targetLexemeId'), json_extract(value, '$.position')
  FROM json_each(NEW.items_json)
  WHERE EXISTS (SELECT 1 FROM evolution_deliveries WHERE id = NEW.id AND status = 'draft');
  DELETE FROM evolution_delivery_write_commands WHERE id = NEW.id;
END;

-- Formal delivery is one SQLite statement. The application prepares all
-- deterministic identifiers and resolved payloads; this trigger verifies the
-- editable aggregate again and publishes every dependent row atomically.
CREATE TABLE evolution_delivery_commit_commands (
  operation_id TEXT PRIMARY KEY NOT NULL,
  delivery_id TEXT NOT NULL,
  target_language_id TEXT NOT NULL,
  target_stage_id TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json))
);

CREATE TRIGGER execute_evolution_delivery_commit
AFTER INSERT ON evolution_delivery_commit_commands
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM evolution_deliveries d
    JOIN evolution_runs r ON r.id = d.run_id
    WHERE d.id = NEW.delivery_id AND d.status = 'draft' AND r.status = 'succeeded'
  ) THEN RAISE(ABORT, 'EVOLUTION_DELIVERY_NOT_COMMITTABLE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM evolution_delivery_items
    WHERE delivery_id = NEW.delivery_id AND decision <> 'skip'
  ) THEN RAISE(ABORT, 'EVOLUTION_DELIVERY_EMPTY') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM evolution_delivery_items
    WHERE delivery_id = NEW.delivery_id AND decision <> 'skip'
      AND (orthography_resolution = 'pending' OR length(trim(target_display_form)) = 0)
  ) THEN RAISE(ABORT, 'EVOLUTION_ORTHOGRAPHY_PENDING') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM evolution_delivery_items, json_each(conflict_json) issue
    WHERE delivery_id = NEW.delivery_id AND decision <> 'skip'
      AND json_extract(issue.value, '$.severity') = 'error'
  ) THEN RAISE(ABORT, 'EVOLUTION_DELIVERY_CONFLICT') END;

  -- New descendant language, its visible first stage and primary genealogy.
  INSERT INTO languages (id, project_id, name, created_at, updated_at, profile_json)
  SELECT
    NEW.target_language_id,
    json_extract(NEW.payload_json, '$.descendant.projectId'),
    json_extract(NEW.payload_json, '$.descendant.languageName'),
    NEW.committed_at, NEW.committed_at,
    json(coalesce(json_extract(NEW.payload_json, '$.descendant.profile'), '{}'))
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO language_stages (
    id, language_id, name, kind, documentation_status, storage_mode,
    chronology_parent_id, data_base_stage_id, start_label, end_label,
    position, visible, created_at, updated_at
  )
  SELECT
    NEW.target_stage_id, NEW.target_language_id,
    json_extract(NEW.payload_json, '$.stage.name'),
    'historical_stage', 'recorded', 'inherited_delta',
    json_extract(NEW.payload_json, '$.stage.chronologyParentId'),
    CASE
      WHEN (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant'
        THEN NEW.target_language_id || ':default-stage'
      ELSE json_extract(NEW.payload_json, '$.stage.dataBaseStageId')
    END,
    coalesce(json_extract(NEW.payload_json, '$.stage.startLabel'), ''),
    coalesce(json_extract(NEW.payload_json, '$.stage.endLabel'), ''),
    json_extract(NEW.payload_json, '$.stage.position'), 1,
    NEW.committed_at, NEW.committed_at
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id)
    IN ('new_stage', 'new_descendant');

  INSERT INTO language_relations (
    id, project_id, source_language_id, target_language_id,
    source_stage_id, target_stage_id, kind, is_primary, confidence,
    notes, created_at, updated_at
  )
  SELECT
    json_extract(NEW.payload_json, '$.descendant.relationId'),
    json_extract(NEW.payload_json, '$.descendant.projectId'),
    json_extract(NEW.payload_json, '$.descendant.sourceLanguageId'),
    NEW.target_language_id,
    json_extract(NEW.payload_json, '$.descendant.sourceStageId'),
    NEW.target_stage_id, 'genetic', 1, 'confirmed',
    json_extract(NEW.payload_json, '$.descendant.notes'),
    NEW.committed_at, NEW.committed_at
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO morphemes (
    id, language_id, form, type, meaning, applicable_pos, status,
    composition_rule_json, notes, created_at, updated_at
  )
  SELECT
    json_extract(value, '$.id'), NEW.target_language_id,
    json_extract(value, '$.form'), json_extract(value, '$.type'),
    json_extract(value, '$.meaning'), coalesce(json_extract(value, '$.applicablePartOfSpeech'), ''),
    json_extract(value, '$.status'), json(json_extract(value, '$.compositionRule')),
    coalesce(json_extract(value, '$.notes'), ''), NEW.committed_at, NEW.committed_at
  FROM json_each(NEW.payload_json, '$.descendant.morphemes')
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO lexemes (
    id, language_id, romanized, part_of_speech, created_at, updated_at,
    ipa, status, source_type, notes
  )
  SELECT
    json_extract(value, '$.id'), NEW.target_language_id,
    json_extract(value, '$.romanized'), coalesce(json_extract(value, '$.partOfSpeech'), ''),
    NEW.committed_at, NEW.committed_at, coalesce(json_extract(value, '$.ipa'), ''),
    json_extract(value, '$.status'), json_extract(value, '$.sourceType'),
    coalesce(json_extract(value, '$.notes'), '')
  FROM json_each(NEW.payload_json, '$.descendant.lexemes')
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO senses (id, lexeme_id, definition, position)
  SELECT
    json_extract(sense.value, '$.id'), json_extract(lexeme.value, '$.id'),
    json_extract(sense.value, '$.definition'), CAST(sense.key AS INTEGER)
  FROM json_each(NEW.payload_json, '$.descendant.lexemes') lexeme,
       json_each(lexeme.value, '$.senses') sense
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO lexeme_morphemes (lexeme_id, morpheme_id, position, role)
  SELECT
    json_extract(lexeme.value, '$.id'), json_extract(link.value, '$.morphemeId'),
    CAST(link.key AS INTEGER), coalesce(json_extract(link.value, '$.role'), '')
  FROM json_each(NEW.payload_json, '$.descendant.lexemes') lexeme,
       json_each(lexeme.value, '$.morphemes') link
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  INSERT INTO etymology_relations (
    id, project_id, source_lexeme_id, target_lexeme_id,
    source_stage_id, target_stage_id, kind, source_form, confidence,
    notes, created_at, updated_at
  )
  SELECT
    json_extract(value, '$.id'), json_extract(NEW.payload_json, '$.descendant.projectId'),
    json_extract(value, '$.sourceLexemeId'), json_extract(value, '$.targetLexemeId'),
    json_extract(NEW.payload_json, '$.descendant.sourceStageId'), NEW.target_stage_id,
    'inheritance', json_extract(value, '$.sourceForm'), 'confirmed',
    '由 Phase 7.2 演化提交创建', NEW.committed_at, NEW.committed_at
  FROM json_each(NEW.payload_json, '$.descendant.etymologies')
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id) = 'new_descendant';

  -- Stage and dialect targets store only effective lexical differences.
  INSERT INTO stage_component_overrides (
    id, stage_id, component_type, operation, target_id, payload_json,
    position, created_at, updated_at
  )
  SELECT
    json_extract(value, '$.id'), NEW.target_stage_id, 'lexicon',
    'replace', json_extract(value, '$.targetId'),
    json_extract(value, '$.payloadJson'), CAST(key AS INTEGER),
    NEW.committed_at, NEW.committed_at
  FROM json_each(NEW.payload_json, '$.overrides')
  WHERE (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id)
    IN ('new_stage', 'existing_stage', 'existing_dialect')
  ON CONFLICT(stage_id, component_type, target_id) DO UPDATE SET
    operation=excluded.operation,payload_json=excluded.payload_json,
    position=excluded.position,updated_at=excluded.updated_at;

  INSERT INTO stage_component_overrides (
    id, stage_id, component_type, operation, target_id, payload_json,
    position, created_at, updated_at
  )
  SELECT
    NEW.delivery_id || ':phonology', NEW.target_stage_id, 'phonology', 'merge',
    'phonology', json_extract(NEW.payload_json, '$.phonologyOverride'),
    0, NEW.committed_at, NEW.committed_at
  WHERE json_type(NEW.payload_json, '$.phonologyOverride') = 'object'
    AND (SELECT target_type FROM evolution_deliveries WHERE id = NEW.delivery_id)
      IN ('new_stage', 'existing_stage', 'existing_dialect', 'new_descendant')
  ON CONFLICT(stage_id, component_type, target_id) DO UPDATE SET
    payload_json=excluded.payload_json,updated_at=excluded.updated_at;

  UPDATE evolution_delivery_items
  SET target_lexeme_id = (
    SELECT json_extract(value, '$.targetLexemeId')
    FROM json_each(NEW.payload_json, '$.itemTargets')
    WHERE json_extract(value, '$.itemId') = evolution_delivery_items.id
  )
  WHERE delivery_id = NEW.delivery_id AND decision <> 'skip';

  UPDATE evolution_deliveries SET
    target_language_id = NEW.target_language_id,
    target_stage_id = NEW.target_stage_id,
    status = 'committed', project_operation_id = NEW.operation_id,
    committed_at = NEW.committed_at, updated_at = NEW.committed_at
  WHERE id = NEW.delivery_id AND status = 'draft';

  DELETE FROM evolution_delivery_commit_commands WHERE operation_id = NEW.operation_id;
END;

-- Migrate each legacy per-language editor into one stable default plan.
INSERT INTO evolution_plans (
  id, language_id, legacy_evolution_id, name, description, source_stage_id,
  input_mode, rules_draft, test_words_json, scope_json, archived,
  created_at, updated_at
)
SELECT
  'phase7-plan-' || e.id, e.language_id, e.id, '默认演化方案', '',
  (SELECT s.id FROM language_stages s
   WHERE s.language_id = e.language_id AND s.kind = 'internal_default'
   ORDER BY s.created_at, s.id LIMIT 1),
  'phonological', e.sound_changes,
  coalesce((
    SELECT json_group_array(json_object(
      'id', ordered.id, 'word', ordered.word, 'position', ordered.position
    ))
    FROM (
      SELECT id, word, position FROM evolution_test_words
      WHERE evolution_id = e.id ORDER BY position, id
    ) ordered
  ), '[]'),
  '{}', 0, e.updated_at, e.updated_at
FROM evolutions e
WHERE NOT EXISTS (
  SELECT 1 FROM evolution_plans p WHERE p.legacy_evolution_id = e.id
);
