PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inflection_systems (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL UNIQUE,
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  rules_version INTEGER NOT NULL CHECK (rules_version > 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inflection_test_cases (
  id TEXT PRIMARY KEY NOT NULL,
  inflection_system_id TEXT NOT NULL,
  stem TEXT NOT NULL CHECK (length(trim(stem)) > 0),
  categories_json TEXT NOT NULL CHECK (json_valid(categories_json)),
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (inflection_system_id) REFERENCES inflection_systems(id) ON DELETE CASCADE,
  UNIQUE (inflection_system_id, position)
);

CREATE INDEX IF NOT EXISTS idx_inflection_test_cases
  ON inflection_test_cases(inflection_system_id, position);

CREATE TABLE IF NOT EXISTS inflection_write_commands (
  id TEXT PRIMARY KEY NOT NULL,
  language_id TEXT NOT NULL,
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  rules_version INTEGER NOT NULL CHECK (rules_version > 0),
  updated_at TEXT NOT NULL,
  test_cases_json TEXT NOT NULL CHECK (json_valid(test_cases_json))
);

CREATE TRIGGER IF NOT EXISTS execute_inflection_write
AFTER INSERT ON inflection_write_commands
BEGIN
  INSERT INTO inflection_systems (
    id, language_id, rules_json, rules_version, updated_at
  ) VALUES (
    NEW.id, NEW.language_id, NEW.rules_json, NEW.rules_version, NEW.updated_at
  )
  ON CONFLICT(language_id) DO UPDATE SET
    rules_json = excluded.rules_json,
    rules_version = excluded.rules_version,
    updated_at = excluded.updated_at;

  DELETE FROM inflection_test_cases
  WHERE inflection_system_id = (
    SELECT id FROM inflection_systems WHERE language_id = NEW.language_id
  );

  INSERT INTO inflection_test_cases (
    id, inflection_system_id, stem, categories_json, position
  )
  SELECT
    json_extract(value, '$.id'),
    (SELECT id FROM inflection_systems WHERE language_id = NEW.language_id),
    json_extract(value, '$.stem'),
    json_extract(value, '$.categories'),
    CAST(key AS INTEGER)
  FROM json_each(NEW.test_cases_json);

  DELETE FROM inflection_write_commands WHERE id = NEW.id;
END;
