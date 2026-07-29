DROP TRIGGER execute_generation_commit;
DROP TRIGGER execute_generation_undo;
DROP TRIGGER prepare_generation_recommit;

DROP INDEX idx_batch_operations_language;
ALTER TABLE lexicon_batch_operations RENAME TO lexicon_batch_operations_v4;

CREATE TABLE lexicon_batch_operations (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('generation_commit', 'derivation_commit')),
  inverse_snapshot_json TEXT NOT NULL CHECK (json_valid(inverse_snapshot_json)),
  created_at TEXT NOT NULL,
  undone_at TEXT,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES generation_batches(id) ON DELETE CASCADE
);

INSERT INTO lexicon_batch_operations (
  id, language_id, batch_id, kind, inverse_snapshot_json, created_at, undone_at
)
SELECT
  id, language_id, batch_id, kind, inverse_snapshot_json, created_at, undone_at
FROM lexicon_batch_operations_v4;

DROP TABLE lexicon_batch_operations_v4;

CREATE INDEX idx_batch_operations_language
  ON lexicon_batch_operations(language_id, created_at DESC);
CREATE INDEX idx_batch_operations_batch
  ON lexicon_batch_operations(batch_id, created_at DESC);

UPDATE generation_batches
SET status = 'draft'
WHERE status IN ('committed', 'undone')
  AND EXISTS (
    SELECT 1 FROM generation_candidates
    WHERE batch_id = generation_batches.id AND status <> 'committed'
  );

CREATE TABLE generation_candidate_bulk_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  candidates_json TEXT NOT NULL CHECK (json_valid(candidates_json))
);

CREATE TRIGGER execute_generation_candidate_bulk_write
AFTER INSERT ON generation_candidate_bulk_write_commands
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.candidates_json) candidate
    LEFT JOIN generation_candidates stored
      ON stored.id = json_extract(candidate.value, '$.id')
     AND stored.batch_id = NEW.batch_id
    WHERE stored.id IS NULL OR stored.status = 'committed'
  ) THEN RAISE(ABORT, 'CANDIDATE_NOT_EDITABLE') END;

  UPDATE generation_candidates
  SET status = json_extract((
    SELECT candidate.value FROM json_each(NEW.candidates_json) candidate
    WHERE json_extract(candidate.value, '$.id') = generation_candidates.id
  ), '$.status')
  WHERE batch_id = NEW.batch_id
    AND id IN (
      SELECT json_extract(candidate.value, '$.id')
      FROM json_each(NEW.candidates_json) candidate
    );

  DELETE FROM generation_candidate_bulk_write_commands WHERE id = NEW.id;
END;

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
  SELECT c.committed_lexeme_id, lm.morpheme_id, lm.position, lm.role
  FROM generation_candidates c
  JOIN lexeme_morphemes lm ON lm.lexeme_id = c.source_lexeme_id
  WHERE c.batch_id = NEW.batch_id AND c.status = 'accepted';

  INSERT INTO lexeme_morphemes (lexeme_id, morpheme_id, position, role)
  SELECT
    c.committed_lexeme_id,
    c.morpheme_id,
    coalesce((
      SELECT max(lm.position) + 1
      FROM lexeme_morphemes lm
      WHERE lm.lexeme_id = c.committed_lexeme_id
    ), 0),
    'derivational'
  FROM generation_candidates c
  WHERE c.batch_id = NEW.batch_id
    AND c.status = 'accepted'
    AND c.morpheme_id IS NOT NULL;

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
  SET
    status = CASE WHEN EXISTS (
      SELECT 1 FROM generation_candidates
      WHERE batch_id = NEW.batch_id AND status <> 'committed'
    ) THEN 'draft' ELSE 'committed' END,
    committed_at = NEW.committed_at
  WHERE id = NEW.batch_id;

  DELETE FROM generation_commit_commands WHERE operation_id = NEW.operation_id;
END;

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
  SET status = 'draft', review_deleted_at = NULL
  WHERE id = (
    SELECT batch_id FROM lexicon_batch_operations WHERE id = NEW.operation_id
  );

  UPDATE lexicon_batch_operations SET undone_at = NEW.undone_at
  WHERE id = NEW.operation_id;

  DELETE FROM generation_undo_commands WHERE operation_id = NEW.operation_id;
END;
