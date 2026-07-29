-- Phase 4 acceptance repair:
-- existing Schema v6 projects still enforce the original five-proposal limit.
DROP TRIGGER execute_ai_turn_write;

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
