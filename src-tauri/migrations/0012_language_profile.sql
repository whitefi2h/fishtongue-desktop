ALTER TABLE languages
  ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}'
  CHECK (json_valid(profile_json));
