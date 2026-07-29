ALTER TABLE generation_batches
  ADD COLUMN review_deleted_at TEXT;

UPDATE generation_candidates
SET status = 'pending'
WHERE status = 'accepted'
  AND batch_id IN (
    SELECT id FROM generation_batches WHERE status = 'undone'
  );

DROP TRIGGER execute_generation_undo;

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
  SET status = 'pending'
  WHERE id IN (
    SELECT json_extract(snapshot.value, '$.candidateId')
    FROM lexicon_batch_operations o, json_each(o.inverse_snapshot_json) snapshot
    WHERE o.id = NEW.operation_id
  );

  UPDATE generation_batches
  SET status = 'undone', review_deleted_at = NULL
  WHERE id = (
    SELECT batch_id FROM lexicon_batch_operations WHERE id = NEW.operation_id
  );
  UPDATE lexicon_batch_operations SET undone_at = NEW.undone_at
  WHERE id = NEW.operation_id;

  DELETE FROM generation_undo_commands WHERE operation_id = NEW.operation_id;
END;

CREATE TRIGGER prepare_generation_recommit
BEFORE INSERT ON generation_commit_commands
BEGIN
  DELETE FROM lexicon_batch_operations
  WHERE batch_id = NEW.batch_id AND undone_at IS NOT NULL;
END;
