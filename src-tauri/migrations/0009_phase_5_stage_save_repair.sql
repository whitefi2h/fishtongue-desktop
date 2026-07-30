PRAGMA foreign_keys = ON;

-- A stage and its context form one user edit. Persist both through one trigger
-- so a failed context write can never leave a half-saved stage.
CREATE TABLE language_stage_write_commands (
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
  start_label TEXT NOT NULL,
  end_label TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  background TEXT NOT NULL,
  evidence_notes TEXT NOT NULL,
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json))
);

CREATE TRIGGER execute_language_stage_write
AFTER INSERT ON language_stage_write_commands
BEGIN
  INSERT INTO language_stages (
    id, language_id, name, kind, documentation_status, storage_mode,
    chronology_parent_id, data_base_stage_id, start_label, end_label,
    position, visible, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.name, NEW.kind, NEW.documentation_status,
    NEW.storage_mode, NEW.chronology_parent_id, NEW.data_base_stage_id,
    NEW.start_label, NEW.end_label,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM language_stages
        WHERE language_id = NEW.language_id
          AND position = NEW.position
          AND id <> NEW.id
      )
      THEN (
        SELECT coalesce(max(position), 0) + 1
        FROM language_stages
        WHERE language_id = NEW.language_id
      )
      ELSE NEW.position
    END,
    NEW.visible, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    kind = excluded.kind,
    documentation_status = excluded.documentation_status,
    storage_mode = excluded.storage_mode,
    chronology_parent_id = excluded.chronology_parent_id,
    data_base_stage_id = excluded.data_base_stage_id,
    start_label = excluded.start_label,
    end_label = excluded.end_label,
    position = excluded.position,
    visible = excluded.visible,
    updated_at = excluded.updated_at;

  INSERT INTO stage_context_records (
    stage_id, background, evidence_notes, sources_json, updated_at
  ) VALUES (
    NEW.id, NEW.background, NEW.evidence_notes, NEW.sources_json, NEW.updated_at
  )
  ON CONFLICT(stage_id) DO UPDATE SET
    background = excluded.background,
    evidence_notes = excluded.evidence_notes,
    sources_json = excluded.sources_json,
    updated_at = excluded.updated_at;

  DELETE FROM language_stage_write_commands WHERE id = NEW.id;
END;
