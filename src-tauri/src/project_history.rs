use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, QueryBuilder, Row, Sqlite, SqliteConnection, Transaction};
use std::collections::{BTreeMap, BTreeSet};
use tauri::{AppHandle, Manager};

const MAX_PENDING_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;
const MAX_HISTORY_ITEMS: i64 = 100;

// Parents precede children. Replay deletes use the reverse order and upserts use
// this order so SQLite foreign-key checks remain active throughout recovery.
const TRACKED_TABLES: &[&str] = &[
    "projects",
    "languages",
    "language_stages",
    "stage_context_records",
    "evolutions",
    "evolution_test_words",
    "inflection_systems",
    "inflection_test_cases",
    "morphemes",
    "word_generation_profiles",
    "concept_lists",
    "concepts",
    "lexemes",
    "senses",
    "lexeme_morphemes",
    "language_relations",
    "historical_events",
    "historical_event_participants",
    "etymology_relations",
    "generation_batches",
    "generation_candidates",
    "lexicon_batch_operations",
    "stage_component_overrides",
    "stage_evolution_batches",
    "stage_evolution_candidates",
    "stage_evolution_operations",
    "phonology_profiles",
    "phonemes",
    "borrowing_profiles",
    "borrowing_batches",
    "borrowing_candidates",
    "ai_conversations",
    "ai_messages",
    "ai_proposals",
    "ai_context_audits",
];

type Snapshot = BTreeMap<String, BTreeMap<String, Value>>;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginProjectOperationInput {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredChange {
    table: String,
    key: String,
    before: Option<Value>,
    after: Option<Value>,
}

#[derive(Debug)]
struct TableMetadata {
    columns: Vec<String>,
    primary_key: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOperationResult {
    pub id: String,
    pub summary: String,
}

#[tauri::command]
pub fn begin_project_operation(
    app: AppHandle,
    input: BeginProjectOperationInput,
) -> Result<(), String> {
    tauri::async_runtime::block_on(begin_operation(app, input))
}

#[tauri::command]
pub fn complete_project_operation(app: AppHandle, operation_id: String) -> Result<bool, String> {
    tauri::async_runtime::block_on(complete_operation(app, &operation_id))
}

#[tauri::command]
pub fn abort_project_operation(app: AppHandle, operation_id: String) -> Result<(), String> {
    tauri::async_runtime::block_on(abort_operation(app, &operation_id))
}

#[tauri::command]
pub fn undo_project_operation(
    app: AppHandle,
    project_id: String,
    changed_at: String,
) -> Result<Option<ProjectOperationResult>, String> {
    tauri::async_runtime::block_on(replay_latest(app, &project_id, &changed_at, false))
}

#[tauri::command]
pub fn redo_project_operation(
    app: AppHandle,
    project_id: String,
    changed_at: String,
) -> Result<Option<ProjectOperationResult>, String> {
    tauri::async_runtime::block_on(replay_latest(app, &project_id, &changed_at, true))
}

#[tauri::command]
pub fn recover_pending_project_operations(app: AppHandle) -> Result<u32, String> {
    tauri::async_runtime::block_on(recover_pending(app))
}

async fn begin_operation(app: AppHandle, input: BeginProjectOperationInput) -> Result<(), String> {
    if input.id.trim().is_empty() || input.project_id.trim().is_empty() {
        return Err("INVALID_PROJECT_OPERATION".into());
    }
    if input.summary.trim().is_empty() {
        return Err("EMPTY_PROJECT_OPERATION_SUMMARY".into());
    }
    let mut connection = connect(&app).await?;
    rollback_pending(&mut connection).await?;
    let snapshot = read_snapshot(&mut connection).await?;
    let snapshot_json = serde_json::to_string(&snapshot)
        .map_err(|error| format!("cannot serialize project operation snapshot: {error}"))?;
    if snapshot_json.len() > MAX_PENDING_SNAPSHOT_BYTES {
        return Err("PROJECT_OPERATION_SNAPSHOT_TOO_LARGE".into());
    }
    sqlx::query(
        "INSERT INTO project_operations
         (id, project_id, kind, summary, before_snapshot_json, changes_json, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, '[]', 'pending', ?6)",
    )
    .bind(input.id)
    .bind(input.project_id)
    .bind(input.kind)
    .bind(input.summary.trim())
    .bind(snapshot_json)
    .bind(input.created_at)
    .execute(&mut connection)
    .await
    .map_err(|error| format!("cannot begin project operation: {error}"))?;
    Ok(())
}

async fn complete_operation(app: AppHandle, operation_id: &str) -> Result<bool, String> {
    let mut connection = connect(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("cannot lock project operation: {error}"))?;
    let row = sqlx::query(
        "SELECT project_id, before_snapshot_json FROM project_operations
         WHERE id = ?1 AND status = 'pending'",
    )
    .bind(operation_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("cannot read pending project operation: {error}"))?
    .ok_or_else(|| "PROJECT_OPERATION_NOT_PENDING".to_string())?;
    let project_id: String = row.get("project_id");
    let before_json: String = row.get("before_snapshot_json");
    let before: Snapshot = serde_json::from_str(&before_json)
        .map_err(|error| format!("cannot decode project operation snapshot: {error}"))?;
    let after = read_snapshot(&mut transaction).await?;
    let changes = diff_snapshots(&before, &after);
    if changes.is_empty() {
        sqlx::query("DELETE FROM project_operations WHERE id = ?1")
            .bind(operation_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("cannot remove empty project operation: {error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| format!("cannot finish empty project operation: {error}"))?;
        return Ok(false);
    }
    let changes_json = serde_json::to_string(&changes)
        .map_err(|error| format!("cannot serialize project changes: {error}"))?;
    // A new successful operation starts a new branch and invalidates redo.
    sqlx::query(
        "DELETE FROM project_operations
         WHERE project_id = ?1 AND status = 'undone'",
    )
    .bind(&project_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("cannot clear project redo history: {error}"))?;
    sqlx::query(
        "UPDATE project_operations SET before_snapshot_json = NULL,
         changes_json = ?1, status = 'applied' WHERE id = ?2",
    )
    .bind(changes_json)
    .bind(operation_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("cannot complete project operation: {error}"))?;
    sqlx::query(
        "DELETE FROM project_operations WHERE id IN (
           SELECT id FROM project_operations
           WHERE project_id = ?1 AND status <> 'pending'
           ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?2
         )",
    )
    .bind(&project_id)
    .bind(MAX_HISTORY_ITEMS)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("cannot trim project operation history: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("cannot commit project operation: {error}"))?;
    Ok(true)
}

async fn abort_operation(app: AppHandle, operation_id: &str) -> Result<(), String> {
    let mut connection = connect(&app).await?;
    rollback_one(&mut connection, operation_id).await
}

async fn recover_pending(app: AppHandle) -> Result<u32, String> {
    let mut connection = connect(&app).await?;
    let rows = sqlx::query(
        "SELECT id FROM project_operations WHERE status = 'pending' ORDER BY created_at DESC",
    )
    .fetch_all(&mut connection)
    .await
    .map_err(|error| format!("cannot inspect pending project operations: {error}"))?;
    let ids = rows
        .into_iter()
        .map(|row| row.get::<String, _>("id"))
        .collect::<Vec<_>>();
    for id in &ids {
        rollback_one(&mut connection, id).await?;
    }
    Ok(ids.len() as u32)
}

async fn rollback_pending(connection: &mut SqliteConnection) -> Result<(), String> {
    let rows = sqlx::query(
        "SELECT id FROM project_operations WHERE status = 'pending' ORDER BY created_at DESC",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("cannot inspect pending project operations: {error}"))?;
    for row in rows {
        let id: String = row.get("id");
        rollback_one(connection, &id).await?;
    }
    Ok(())
}

async fn rollback_one(connection: &mut SqliteConnection, operation_id: &str) -> Result<(), String> {
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("cannot lock pending project operation: {error}"))?;
    let row = sqlx::query(
        "SELECT before_snapshot_json FROM project_operations
         WHERE id = ?1 AND status = 'pending'",
    )
    .bind(operation_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("cannot read pending project operation: {error}"))?;
    let Some(row) = row else {
        transaction
            .commit()
            .await
            .map_err(|error| format!("cannot finish pending-operation check: {error}"))?;
        return Ok(());
    };
    let before_json: String = row.get("before_snapshot_json");
    let before: Snapshot = serde_json::from_str(&before_json)
        .map_err(|error| format!("cannot decode pending project snapshot: {error}"))?;
    let current = read_snapshot(&mut transaction).await?;
    let changes = diff_snapshots(&before, &current);
    apply_changes(&mut transaction, &changes, false).await?;
    sqlx::query("DELETE FROM project_operations WHERE id = ?1")
        .bind(operation_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("cannot discard pending project operation: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("cannot roll back pending project operation: {error}"))?;
    Ok(())
}

async fn replay_latest(
    app: AppHandle,
    project_id: &str,
    changed_at: &str,
    redo: bool,
) -> Result<Option<ProjectOperationResult>, String> {
    let mut connection = connect(&app).await?;
    rollback_pending(&mut connection).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("cannot lock project history: {error}"))?;
    let status = if redo { "undone" } else { "applied" };
    let direction = if redo { "ASC" } else { "DESC" };
    let query = format!(
        "SELECT id, summary, changes_json FROM project_operations
         WHERE project_id = ?1 AND status = ?2
         ORDER BY created_at {direction}, id {direction} LIMIT 1"
    );
    let row = sqlx::query(&query)
        .bind(project_id)
        .bind(status)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| format!("cannot read project history: {error}"))?;
    let Some(row) = row else {
        transaction
            .commit()
            .await
            .map_err(|error| format!("cannot finish project history check: {error}"))?;
        return Ok(None);
    };
    let id: String = row.get("id");
    let summary: String = row.get("summary");
    let changes_json: String = row.get("changes_json");
    let changes: Vec<StoredChange> = serde_json::from_str(&changes_json)
        .map_err(|error| format!("cannot decode project history: {error}"))?;
    let current = read_snapshot(&mut transaction).await?;
    assert_expected_state(&current, &changes, redo)?;
    apply_changes(&mut transaction, &changes, redo).await?;
    if redo {
        sqlx::query(
            "UPDATE project_operations SET status = 'applied', undone_at = NULL,
             redone_at = ?1 WHERE id = ?2 AND status = 'undone'",
        )
        .bind(changed_at)
        .bind(&id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("cannot mark project operation redone: {error}"))?;
    } else {
        sqlx::query(
            "UPDATE project_operations SET status = 'undone', undone_at = ?1,
             redone_at = NULL WHERE id = ?2 AND status = 'applied'",
        )
        .bind(changed_at)
        .bind(&id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("cannot mark project operation undone: {error}"))?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("cannot replay project operation: {error}"))?;
    Ok(Some(ProjectOperationResult { id, summary }))
}

fn assert_expected_state(
    current: &Snapshot,
    changes: &[StoredChange],
    redo: bool,
) -> Result<(), String> {
    for change in changes {
        let expected = if redo { &change.before } else { &change.after };
        let actual = current
            .get(&change.table)
            .and_then(|rows| rows.get(&change.key));
        if actual != expected.as_ref() {
            return Err("PROJECT_OPERATION_CONFLICT".into());
        }
    }
    Ok(())
}

async fn apply_changes(
    transaction: &mut Transaction<'_, Sqlite>,
    changes: &[StoredChange],
    redo: bool,
) -> Result<(), String> {
    sqlx::query("PRAGMA defer_foreign_keys = ON")
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("cannot defer project-history foreign keys: {error}"))?;
    for table in TRACKED_TABLES.iter().rev() {
        for change in changes
            .iter()
            .filter(|change| change.table == *table && target_value(change, redo).is_none())
        {
            delete_row(transaction, table, &change.key).await?;
        }
    }
    for table in TRACKED_TABLES {
        for change in changes.iter().filter(|change| change.table == *table) {
            if let Some(row) = target_value(change, redo) {
                upsert_row(transaction, table, row).await?;
            }
        }
    }
    Ok(())
}

fn target_value(change: &StoredChange, redo: bool) -> Option<&Value> {
    if redo {
        change.after.as_ref()
    } else {
        change.before.as_ref()
    }
}

async fn delete_row(
    transaction: &mut Transaction<'_, Sqlite>,
    table: &str,
    key_json: &str,
) -> Result<(), String> {
    let metadata = table_metadata(&mut **transaction, table).await?;
    let keys: Vec<Value> = serde_json::from_str(key_json)
        .map_err(|error| format!("cannot decode row key for {table}: {error}"))?;
    if keys.len() != metadata.primary_key.len() {
        return Err(format!("invalid row key for {table}"));
    }
    let mut query = QueryBuilder::<Sqlite>::new(format!("DELETE FROM {} WHERE ", quote(table)));
    for (index, (column, value)) in metadata.primary_key.iter().zip(keys.iter()).enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(quote(column));
        if value.is_null() {
            query.push(" IS NULL");
        } else {
            query.push(" = ");
            push_json_bind(&mut query, value)?;
        }
    }
    query
        .build()
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("cannot delete restored row from {table}: {error}"))?;
    Ok(())
}

async fn upsert_row(
    transaction: &mut Transaction<'_, Sqlite>,
    table: &str,
    value: &Value,
) -> Result<(), String> {
    let metadata = table_metadata(&mut **transaction, table).await?;
    let object = value
        .as_object()
        .ok_or_else(|| format!("invalid stored row for {table}"))?;
    let mut query = QueryBuilder::<Sqlite>::new(format!("INSERT INTO {} (", quote(table)));
    {
        let mut separated = query.separated(", ");
        for column in &metadata.columns {
            separated.push(quote(column));
        }
    }
    query.push(") VALUES (");
    for (index, column) in metadata.columns.iter().enumerate() {
        if index > 0 {
            query.push(", ");
        }
        let cell = object.get(column).unwrap_or(&Value::Null);
        push_json_bind(&mut query, cell)?;
    }
    query.push(") ON CONFLICT (");
    {
        let mut separated = query.separated(", ");
        for column in &metadata.primary_key {
            separated.push(quote(column));
        }
    }
    query.push(") DO UPDATE SET ");
    {
        let mut separated = query.separated(", ");
        for column in metadata
            .columns
            .iter()
            .filter(|column| !metadata.primary_key.contains(column))
        {
            separated.push(format!("{} = excluded.{}", quote(column), quote(column)));
        }
    }
    query
        .build()
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("cannot restore row in {table}: {error}"))?;
    Ok(())
}

fn push_json_bind<'a>(
    query: &mut QueryBuilder<'a, Sqlite>,
    value: &'a Value,
) -> Result<(), String> {
    match value {
        Value::Null => {
            query.push_bind(Option::<String>::None);
        }
        Value::String(value) => {
            query.push_bind(value);
        }
        Value::Bool(value) => {
            query.push_bind(if *value { 1_i64 } else { 0_i64 });
        }
        Value::Number(value) if value.is_i64() => {
            query.push_bind(value.as_i64().unwrap_or_default());
        }
        Value::Number(value) if value.is_u64() => {
            let number = i64::try_from(value.as_u64().unwrap_or_default())
                .map_err(|_| "stored integer exceeds SQLite range".to_string())?;
            query.push_bind(number);
        }
        Value::Number(value) => {
            query.push_bind(value.as_f64().unwrap_or_default());
        }
        Value::Array(_) | Value::Object(_) => {
            return Err("stored SQLite cell has an unsupported structured value".into());
        }
    }
    Ok(())
}

fn diff_snapshots(before: &Snapshot, after: &Snapshot) -> Vec<StoredChange> {
    let mut changes = Vec::new();
    for table in TRACKED_TABLES {
        let before_rows = before.get(*table);
        let after_rows = after.get(*table);
        let keys = before_rows
            .into_iter()
            .flat_map(|rows| rows.keys())
            .chain(after_rows.into_iter().flat_map(|rows| rows.keys()))
            .cloned()
            .collect::<BTreeSet<_>>();
        for key in keys {
            let old = before_rows.and_then(|rows| rows.get(&key)).cloned();
            let new = after_rows.and_then(|rows| rows.get(&key)).cloned();
            if old != new {
                changes.push(StoredChange {
                    table: (*table).to_string(),
                    key,
                    before: old,
                    after: new,
                });
            }
        }
    }
    changes
}

async fn read_snapshot(connection: &mut SqliteConnection) -> Result<Snapshot, String> {
    let mut snapshot = Snapshot::new();
    for table in TRACKED_TABLES {
        let metadata = table_metadata(&mut *connection, table).await?;
        let json_arguments = metadata
            .columns
            .iter()
            .flat_map(|column| [format!("'{}'", column.replace('\'', "''")), quote(column)])
            .collect::<Vec<_>>()
            .join(", ");
        let query = format!(
            "SELECT json_object({json_arguments}) AS row_json FROM {}",
            quote(table)
        );
        let rows = sqlx::query(&query)
            .fetch_all(&mut *connection)
            .await
            .map_err(|error| format!("cannot snapshot {table}: {error}"))?;
        let mut stored = BTreeMap::new();
        for row in rows {
            let row_json: String = row.get("row_json");
            let value: Value = serde_json::from_str(&row_json)
                .map_err(|error| format!("cannot decode row from {table}: {error}"))?;
            let object = value
                .as_object()
                .ok_or_else(|| format!("invalid row snapshot from {table}"))?;
            let key = serde_json::to_string(
                &metadata
                    .primary_key
                    .iter()
                    .map(|column| object.get(column).cloned().unwrap_or(Value::Null))
                    .collect::<Vec<_>>(),
            )
            .map_err(|error| format!("cannot encode row key for {table}: {error}"))?;
            stored.insert(key, value);
        }
        snapshot.insert((*table).to_string(), stored);
    }
    Ok(snapshot)
}

async fn table_metadata(
    connection: &mut SqliteConnection,
    table: &str,
) -> Result<TableMetadata, String> {
    if !TRACKED_TABLES.contains(&table) {
        return Err(format!("project history rejected unknown table {table}"));
    }
    let rows = sqlx::query(&format!("PRAGMA table_info({})", quote(table)))
        .fetch_all(connection)
        .await
        .map_err(|error| format!("cannot inspect table {table}: {error}"))?;
    let columns = rows
        .iter()
        .map(|row| row.get::<String, _>("name"))
        .collect::<Vec<_>>();
    let mut primary = rows
        .iter()
        .filter_map(|row| {
            let position = row.get::<i64, _>("pk");
            (position > 0).then(|| (position, row.get::<String, _>("name")))
        })
        .collect::<Vec<_>>();
    primary.sort_by_key(|(position, _)| *position);
    if columns.is_empty() || primary.is_empty() {
        return Err(format!("tracked table {table} has no usable primary key"));
    }
    Ok(TableMetadata {
        columns,
        primary_key: primary.into_iter().map(|(_, name)| name).collect(),
    })
}

fn quote(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

async fn connect(app: &AppHandle) -> Result<SqliteConnection, String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("cannot resolve the project workspace: {error}"))?
        .join("active-project")
        .join("project.db");
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(false)
        .foreign_keys(true);
    SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("cannot open project history database: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{apply_changes, assert_expected_state, diff_snapshots, read_snapshot, Snapshot};
    use serde_json::json;
    use sqlx::{Connection, Executor, Row, SqliteConnection};
    use std::collections::BTreeMap;

    #[test]
    fn snapshot_diff_keeps_only_changed_rows() {
        let before = Snapshot::from([(
            "lexemes".into(),
            BTreeMap::from([("[\"one\"]".into(), json!({"id":"one","romanized":"ama"}))]),
        )]);
        let after = Snapshot::from([(
            "lexemes".into(),
            BTreeMap::from([("[\"one\"]".into(), json!({"id":"one","romanized":"eme"}))]),
        )]);
        let changes = diff_snapshots(&before, &after);
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].before.as_ref().unwrap()["romanized"], "ama");
        assert_eq!(changes[0].after.as_ref().unwrap()["romanized"], "eme");
    }

    async fn database() -> SqliteConnection {
        let mut connection = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open in-memory SQLite");
        for migration in crate::migrations::project_migrations() {
            connection
                .execute(migration.sql.as_ref())
                .await
                .expect("apply project migration");
        }
        sqlx::query(
            "INSERT INTO projects(id,name,created_at,updated_at) VALUES('p','Project','t','t')",
        )
        .execute(&mut connection)
        .await
        .expect("insert project");
        sqlx::query(
            "INSERT INTO languages(id,project_id,name,created_at,updated_at)
             VALUES('l','p','Language','t','t')",
        )
        .execute(&mut connection)
        .await
        .expect("insert language");
        sqlx::query(
            "INSERT INTO lexemes(id,language_id,romanized,part_of_speech,created_at,updated_at)
             VALUES('x','l','ama','noun','t','t')",
        )
        .execute(&mut connection)
        .await
        .expect("insert lexeme");
        sqlx::query(
            "INSERT INTO senses(id,lexeme_id,definition,position) VALUES('s','x','water',0)",
        )
        .execute(&mut connection)
        .await
        .expect("insert sense");
        connection
    }

    #[tokio::test]
    async fn undo_replay_restores_changed_rows_with_foreign_keys_enabled() {
        let mut connection = database().await;
        let before = read_snapshot(&mut connection)
            .await
            .expect("snapshot before");
        sqlx::query("UPDATE lexemes SET romanized='eme',updated_at='later' WHERE id='x'")
            .execute(&mut connection)
            .await
            .expect("edit lexeme");
        let after = read_snapshot(&mut connection)
            .await
            .expect("snapshot after");
        let changes = diff_snapshots(&before, &after);
        let mut transaction = connection.begin().await.expect("begin replay");
        apply_changes(&mut transaction, &changes, false)
            .await
            .expect("apply inverse");
        transaction.commit().await.expect("commit inverse");
        let row = sqlx::query("SELECT romanized,updated_at FROM lexemes WHERE id='x'")
            .fetch_one(&mut connection)
            .await
            .expect("read restored lexeme");
        assert_eq!(row.get::<String, _>("romanized"), "ama");
        assert_eq!(row.get::<String, _>("updated_at"), "t");
    }

    #[tokio::test]
    async fn conflict_check_rejects_a_later_edit() {
        let mut connection = database().await;
        let before = read_snapshot(&mut connection)
            .await
            .expect("snapshot before");
        sqlx::query("UPDATE lexemes SET romanized='eme',updated_at='operation' WHERE id='x'")
            .execute(&mut connection)
            .await
            .expect("operation edit");
        let after = read_snapshot(&mut connection)
            .await
            .expect("snapshot after");
        let changes = diff_snapshots(&before, &after);
        sqlx::query("UPDATE lexemes SET romanized='imi',updated_at='later' WHERE id='x'")
            .execute(&mut connection)
            .await
            .expect("later edit");
        let current = read_snapshot(&mut connection)
            .await
            .expect("current snapshot");
        assert_eq!(
            assert_expected_state(&current, &changes, false).unwrap_err(),
            "PROJECT_OPERATION_CONFLICT"
        );
    }

    #[tokio::test]
    async fn replay_handles_null_inside_a_composite_primary_key() {
        let mut connection = database().await;
        sqlx::query(
            "INSERT INTO historical_events(id,project_id,name,event_type,start_label,end_label,description,position,created_at,updated_at)
             VALUES('event','p','Event','other','','','',0,'t','t')",
        )
        .execute(&mut connection)
        .await
        .expect("insert event");
        sqlx::query(
            "INSERT INTO historical_event_participants(event_id,language_id,stage_id,role,notes)
             VALUES('event','l',NULL,'speaker','')",
        )
        .execute(&mut connection)
        .await
        .expect("insert participant without a stage");
        let before = read_snapshot(&mut connection)
            .await
            .expect("snapshot before");
        let stage_id: String = sqlx::query_scalar(
            "SELECT id FROM language_stages WHERE language_id='l' AND kind='internal_default'",
        )
        .fetch_one(&mut connection)
        .await
        .expect("read internal stage");
        sqlx::query("DELETE FROM historical_event_participants WHERE event_id='event'")
            .execute(&mut connection)
            .await
            .expect("remove old participant");
        sqlx::query(
            "INSERT INTO historical_event_participants(event_id,language_id,stage_id,role,notes)
             VALUES('event','l',?1,'speaker','')",
        )
        .bind(&stage_id)
        .execute(&mut connection)
        .await
        .expect("insert staged participant");
        let after = read_snapshot(&mut connection)
            .await
            .expect("snapshot after");
        let changes = diff_snapshots(&before, &after);

        let mut undo = connection.begin().await.expect("begin undo");
        apply_changes(&mut undo, &changes, false)
            .await
            .expect("undo");
        undo.commit().await.expect("commit undo");
        let null_count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM historical_event_participants WHERE stage_id IS NULL",
        )
        .fetch_one(&mut connection)
        .await
        .expect("count null participant");
        assert_eq!(null_count, 1);

        let mut redo = connection.begin().await.expect("begin redo");
        apply_changes(&mut redo, &changes, true)
            .await
            .expect("redo");
        redo.commit().await.expect("commit redo");
        let rows: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM historical_event_participants WHERE event_id='event'",
        )
        .fetch_one(&mut connection)
        .await
        .expect("count redone participants");
        let staged: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM historical_event_participants WHERE stage_id=?1",
        )
        .bind(stage_id)
        .fetch_one(&mut connection)
        .await
        .expect("count staged participant");
        assert_eq!((rows, staged), (1, 1));
    }
}
