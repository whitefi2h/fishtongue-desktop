-- Phase 6 repair: borrowing comparison is a first-class, review-only AI
-- proposal. Rebuild the table because SQLite cannot extend a CHECK constraint.
DROP TRIGGER execute_ai_turn_write;

CREATE TABLE ai_proposals_v14 (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'lexeme.upsert',
    'morpheme.upsert',
    'wordgen_profile.upsert',
    'evolution.update_draft',
    'inflection_system.update_draft',
    'borrowing_adaptation.suggest'
  )),
  language_id TEXT NOT NULL,
  target_id TEXT,
  base_snapshot_hash TEXT NOT NULL,
  patch_json TEXT NOT NULL CHECK (json_valid(patch_json)),
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'staged', 'applied', 'rejected', 'stale')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

INSERT INTO ai_proposals_v14 (
  id, message_id, kind, language_id, target_id, base_snapshot_hash,
  patch_json, summary, status, created_at, updated_at
)
SELECT
  id, message_id, kind, language_id, target_id, base_snapshot_hash,
  patch_json, summary, status, created_at, updated_at
FROM ai_proposals;

DROP TABLE ai_proposals;
ALTER TABLE ai_proposals_v14 RENAME TO ai_proposals;

CREATE INDEX idx_ai_proposals_message
  ON ai_proposals(message_id, created_at);

CREATE TRIGGER execute_ai_turn_write
AFTER INSERT ON ai_turn_write_commands
BEGIN
  SELECT CASE WHEN json_array_length(NEW.proposals_json) > 50
    THEN RAISE(ABORT, 'TOO_MANY_AI_PROPOSALS') END;

  INSERT INTO ai_messages (
    id, conversation_id, role, content, status, provider_kind,
    provider_label, model_id, usage_json, created_at
  ) VALUES (
    json_extract(NEW.message_json, '$.id'),
    NEW.conversation_id,
    'assistant',
    json_extract(NEW.message_json, '$.content'),
    json_extract(NEW.message_json, '$.status'),
    json_extract(NEW.message_json, '$.providerKind'),
    json_extract(NEW.message_json, '$.providerLabel'),
    json_extract(NEW.message_json, '$.modelId'),
    json_extract(NEW.message_json, '$.usageJson'),
    json_extract(NEW.message_json, '$.createdAt')
  );

  INSERT INTO ai_proposals (
    id, message_id, kind, language_id, target_id, base_snapshot_hash,
    patch_json, summary, status, created_at, updated_at
  )
  SELECT
    json_extract(value, '$.id'),
    json_extract(NEW.message_json, '$.id'),
    json_extract(value, '$.kind'),
    json_extract(value, '$.languageId'),
    json_extract(value, '$.targetId'),
    json_extract(value, '$.baseSnapshotHash'),
    json_extract(value, '$.patchJson'),
    json_extract(value, '$.summary'),
    'pending',
    json_extract(NEW.message_json, '$.createdAt'),
    json_extract(NEW.message_json, '$.createdAt')
  FROM json_each(NEW.proposals_json);

  INSERT INTO ai_context_audits (
    id, message_id, provider_kind, provider_label, model_id, endpoint_label,
    context_scope, context_json, references_json, tool_calls_json,
    context_bytes, outcome, error_code, created_at
  ) VALUES (
    json_extract(NEW.audit_json, '$.id'),
    json_extract(NEW.message_json, '$.id'),
    json_extract(NEW.audit_json, '$.providerKind'),
    json_extract(NEW.audit_json, '$.providerLabel'),
    json_extract(NEW.audit_json, '$.modelId'),
    json_extract(NEW.audit_json, '$.endpointLabel'),
    json_extract(NEW.audit_json, '$.contextScope'),
    json_extract(NEW.audit_json, '$.contextJson'),
    json_extract(NEW.audit_json, '$.referencesJson'),
    json_extract(NEW.audit_json, '$.toolCallsJson'),
    json_extract(NEW.audit_json, '$.contextBytes'),
    json_extract(NEW.audit_json, '$.outcome'),
    json_extract(NEW.audit_json, '$.errorCode'),
    json_extract(NEW.message_json, '$.createdAt')
  );

  UPDATE ai_conversations
  SET updated_at = json_extract(NEW.message_json, '$.createdAt')
  WHERE id = NEW.conversation_id;

  DELETE FROM ai_turn_write_commands WHERE id = NEW.id;
END;
