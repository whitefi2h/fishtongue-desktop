CREATE TABLE project_operations (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
  before_snapshot_json TEXT,
  changes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(changes_json)),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'undone')),
  created_at TEXT NOT NULL,
  undone_at TEXT,
  redone_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_operations_history
ON project_operations(project_id, status, created_at, id);

