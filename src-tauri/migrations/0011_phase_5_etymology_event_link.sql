ALTER TABLE etymology_relations
ADD COLUMN historical_event_id TEXT
REFERENCES historical_events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_etymology_relations_historical_event
ON etymology_relations(historical_event_id);
