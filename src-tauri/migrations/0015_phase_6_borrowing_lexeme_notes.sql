-- Keep technical borrowing analysis on the etymology relation, not in the
-- general-purpose lexeme notes field shown in the dictionary editor.
DROP TRIGGER IF EXISTS execute_borrowing_commit;

CREATE TRIGGER execute_borrowing_commit
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
    candidate.adapted_ipa, 'draft', 'imported', ''
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
