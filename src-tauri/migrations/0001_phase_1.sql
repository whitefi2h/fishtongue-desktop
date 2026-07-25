PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_languages_project
  ON languages(project_id);

CREATE TABLE IF NOT EXISTS lexemes (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  romanized TEXT NOT NULL CHECK (length(trim(romanized)) > 0),
  part_of_speech TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lexemes_language
  ON lexemes(language_id);

CREATE TABLE IF NOT EXISTS senses (
  id TEXT PRIMARY KEY NOT NULL,
  lexeme_id TEXT NOT NULL,
  definition TEXT NOT NULL CHECK (length(trim(definition)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (lexeme_id) REFERENCES lexemes(id) ON DELETE CASCADE,
  UNIQUE (lexeme_id, position)
);

CREATE INDEX IF NOT EXISTS idx_senses_lexeme
  ON senses(lexeme_id, position);

CREATE TABLE IF NOT EXISTS evolutions (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL UNIQUE,
  sound_changes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evolution_test_words (
  id TEXT PRIMARY KEY NOT NULL,
  evolution_id TEXT NOT NULL,
  word TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (evolution_id) REFERENCES evolutions(id) ON DELETE CASCADE,
  UNIQUE (evolution_id, position)
);

CREATE INDEX IF NOT EXISTS idx_evolution_words
  ON evolution_test_words(evolution_id, position);

-- Repository writes a lexeme and every Sense through one statement. The trigger
-- makes that statement atomic: any invalid Sense rolls back the whole change.
CREATE TABLE IF NOT EXISTS lexeme_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  romanized TEXT NOT NULL,
  part_of_speech TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  senses_json TEXT NOT NULL CHECK (json_valid(senses_json))
);

CREATE TRIGGER IF NOT EXISTS execute_lexeme_write
AFTER INSERT ON lexeme_write_commands
BEGIN
  INSERT INTO lexemes (
    id, language_id, romanized, part_of_speech, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.romanized, NEW.part_of_speech,
    NEW.created_at, NEW.updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    language_id = excluded.language_id,
    romanized = excluded.romanized,
    part_of_speech = excluded.part_of_speech,
    updated_at = excluded.updated_at;

  DELETE FROM senses WHERE lexeme_id = NEW.id;

  INSERT INTO senses (id, lexeme_id, definition, position)
  SELECT
    json_extract(value, '$.id'),
    NEW.id,
    json_extract(value, '$.definition'),
    CAST(key AS INTEGER)
  FROM json_each(NEW.senses_json);

  DELETE FROM lexeme_write_commands WHERE id = NEW.id;
END;

-- Evolution and its test words use the same one-statement atomic pattern.
CREATE TABLE IF NOT EXISTS evolution_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  sound_changes TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  test_words_json TEXT NOT NULL CHECK (json_valid(test_words_json))
);

CREATE TRIGGER IF NOT EXISTS execute_evolution_write
AFTER INSERT ON evolution_write_commands
BEGIN
  INSERT INTO evolutions (id, language_id, sound_changes, updated_at)
  VALUES (NEW.id, NEW.language_id, NEW.sound_changes, NEW.updated_at)
  ON CONFLICT(language_id) DO UPDATE SET
    sound_changes = excluded.sound_changes,
    updated_at = excluded.updated_at;

  DELETE FROM evolution_test_words
  WHERE evolution_id = (
    SELECT id FROM evolutions WHERE language_id = NEW.language_id
  );

  INSERT INTO evolution_test_words (id, evolution_id, word, position)
  SELECT
    json_extract(value, '$.id'),
    (SELECT id FROM evolutions WHERE language_id = NEW.language_id),
    json_extract(value, '$.word'),
    CAST(key AS INTEGER)
  FROM json_each(NEW.test_words_json);

  DELETE FROM evolution_write_commands WHERE id = NEW.id;
END;
