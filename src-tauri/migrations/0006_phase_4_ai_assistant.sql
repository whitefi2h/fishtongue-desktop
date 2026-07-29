CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  language_id TEXT,
  title TEXT NOT NULL,
  provider_kind TEXT NOT NULL CHECK (
    provider_kind IN ('openai', 'gemini', 'deepseek', 'openai_compatible')
  ),
  provider_label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  context_scope TEXT NOT NULL CHECK (context_scope IN ('page', 'language', 'project')),
  allow_expansion INTEGER NOT NULL DEFAULT 0 CHECK (allow_expansion IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE SET NULL
);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('complete', 'error', 'cancelled')),
  provider_kind TEXT NOT NULL,
  provider_label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  usage_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(usage_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE TABLE ai_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'lexeme.upsert',
    'morpheme.upsert',
    'wordgen_profile.upsert',
    'evolution.update_draft',
    'inflection_system.update_draft'
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

CREATE TABLE ai_context_audits (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  provider_kind TEXT NOT NULL,
  provider_label TEXT NOT NULL,
  model_id TEXT NOT NULL,
  endpoint_label TEXT NOT NULL,
  context_scope TEXT NOT NULL CHECK (context_scope IN ('page', 'language', 'project')),
  context_json TEXT NOT NULL CHECK (json_valid(context_json)),
  references_json TEXT NOT NULL CHECK (json_valid(references_json)),
  tool_calls_json TEXT NOT NULL CHECK (json_valid(tool_calls_json)),
  context_bytes INTEGER NOT NULL CHECK (context_bytes >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('complete', 'error', 'cancelled')),
  error_code TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_conversations_project
  ON ai_conversations(project_id, updated_at DESC);
CREATE INDEX idx_ai_messages_conversation
  ON ai_messages(conversation_id, created_at);
CREATE INDEX idx_ai_proposals_message
  ON ai_proposals(message_id, created_at);
CREATE INDEX idx_ai_audits_message
  ON ai_context_audits(message_id, created_at);

-- The front end inserts one command so the completed assistant response,
-- proposals, and audit can never be split across partially successful writes.
CREATE TABLE ai_turn_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  message_json TEXT NOT NULL CHECK (json_valid(message_json)),
  proposals_json TEXT NOT NULL CHECK (json_valid(proposals_json)),
  audit_json TEXT NOT NULL CHECK (json_valid(audit_json))
);

CREATE TRIGGER execute_ai_turn_write
AFTER INSERT ON ai_turn_write_commands
BEGIN
  SELECT CASE WHEN json_array_length(NEW.proposals_json) > 5
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
