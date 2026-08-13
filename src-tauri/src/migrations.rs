use sqlx::migrate::{Migrate, Migration as SqlxMigration, MigrationType, Migrator};
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, SqliteConnection};
use std::borrow::Cow;
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_SCHEMA_VERSION: u32 = 16;

pub fn project_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_phase_1_project_schema",
            sql: include_str!("../migrations/0001_phase_1.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_phase_2_inflection_schema",
            sql: include_str!("../migrations/0002_phase_2_inflection.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_phase_3_lexicon_wordgen_schema",
            sql: include_str!("../migrations/0003_phase_3_lexicon_wordgen.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "repair_phase_3_acceptance_workflows",
            sql: include_str!("../migrations/0004_phase_3_acceptance_fixes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "improve_phase_3_review_workflow",
            sql: include_str!("../migrations/0005_phase_3_review_workflow.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "create_phase_4_ai_assistant_schema",
            sql: include_str!("../migrations/0006_phase_4_ai_assistant.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "repair_phase_4_proposal_limit",
            sql: include_str!("../migrations/0007_phase_4_proposal_limit.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_phase_5_history_genealogy_schema",
            sql: include_str!("../migrations/0008_phase_5_history_genealogy.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "repair_phase_5_atomic_stage_save",
            sql: include_str!("../migrations/0009_phase_5_stage_save_repair.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "repair_phase_5_existing_project_stage_save",
            sql: include_str!("../migrations/0010_phase_5_existing_project_stage_save_repair.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "link_etymology_relations_to_historical_events",
            sql: include_str!("../migrations/0011_phase_5_etymology_event_link.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "persist_language_profile",
            sql: include_str!("../migrations/0012_language_profile.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "create_phase_6_phonology_borrowing_schema",
            sql: include_str!("../migrations/0013_phase_6_phonology_borrowing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "allow_phase_6_borrowing_ai_proposals",
            sql: include_str!("../migrations/0014_phase_6_ai_borrowing_proposal.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "separate_borrowing_evidence_from_lexeme_notes",
            sql: include_str!("../migrations/0015_phase_6_borrowing_lexeme_notes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: DATABASE_SCHEMA_VERSION.into(),
            description: "create_phase_7_project_history",
            sql: include_str!("../migrations/0016_phase_7_project_history.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

fn project_migrator() -> Migrator {
    let migrations = project_migrations()
        .into_iter()
        .map(|migration| {
            SqlxMigration::new(
                migration.version,
                migration.description.into(),
                MigrationType::ReversibleUp,
                migration.sql.into(),
                false,
            )
        })
        .collect::<Vec<_>>();

    Migrator {
        migrations: Cow::Owned(migrations),
        ..Migrator::DEFAULT
    }
}

/// Run project migrations for every workspace that is opened or created.
///
/// The SQL plugin consumes its registered migration list after the first
/// database load. FishTongue deliberately reuses one active-workspace URL for
/// different project files, so relying on that one-shot list leaves later
/// projects unmigrated. This command is called before every `Database.load`.
#[tauri::command]
pub fn migrate_active_project_database(app: AppHandle) -> Result<u32, String> {
    tauri::async_runtime::block_on(migrate_database(app))
}

async fn migrate_database(app: AppHandle) -> Result<u32, String> {
    let database_path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("cannot resolve the project workspace: {error}"))?
        .join("active-project")
        .join("project.db");
    let options = SqliteConnectOptions::new()
        .filename(database_path)
        .create_if_missing(true)
        .foreign_keys(true);
    let mut connection = SqliteConnection::connect_with(&options)
        .await
        .map_err(|error| format!("cannot open the project database for migration: {error}"))?;

    run_pending_project_migrations(&mut connection).await?;

    Ok(DATABASE_SCHEMA_VERSION)
}

/// Apply only migrations that are not yet recorded for this project.
///
/// FishTongue's early desktop releases registered migrations through the
/// Tauri SQL plugin. Some of those already-applied SQL files were later
/// expanded while keeping their version number, so their stored checksums can
/// differ from the current source. Re-validating those historical checksums
/// would make a healthy project impossible to open. We therefore keep SQLx's
/// transactional `apply` implementation for new versions, but deliberately
/// treat the highest successful ledger version as authoritative and never
/// replay an older version.
async fn run_pending_project_migrations(connection: &mut SqliteConnection) -> Result<(), String> {
    connection
        .ensure_migrations_table()
        .await
        .map_err(|error| format!("cannot prepare the project migration ledger: {error}"))?;

    if let Some(version) = connection
        .dirty_version()
        .await
        .map_err(|error| format!("cannot inspect the project migration ledger: {error}"))?
    {
        return Err(format!(
            "cannot migrate the project database: migration {version} is only partially applied"
        ));
    }

    let applied_migrations = connection
        .list_applied_migrations()
        .await
        .map_err(|error| format!("cannot read the project migration ledger: {error}"))?;
    let latest_applied_version = applied_migrations
        .iter()
        .map(|migration| migration.version)
        .max()
        .unwrap_or(0);
    if latest_applied_version > i64::from(DATABASE_SCHEMA_VERSION) {
        return Err(format!(
            "cannot migrate the project database: schema version {latest_applied_version} requires a newer FishTongue version"
        ));
    }

    let migrator = project_migrator();
    for migration in migrator
        .migrations
        .iter()
        .filter(|migration| migration.version > latest_applied_version)
    {
        connection
            .apply(migration)
            .await
            .map_err(|error| format!("cannot migrate the project database: {error}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use sqlx::migrate::Migrate;
    use sqlx::{Connection, Row, SqliteConnection};

    async fn database_through_v8() -> SqliteConnection {
        let mut connection = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open in-memory SQLite");
        sqlx::raw_sql(include_str!("../migrations/0001_phase_1.sql"))
            .execute(&mut connection)
            .await
            .expect("apply schema v1");
        sqlx::raw_sql(include_str!("../migrations/0002_phase_2_inflection.sql"))
            .execute(&mut connection)
            .await
            .expect("apply schema v2");
        sqlx::raw_sql(include_str!(
            "../migrations/0003_phase_3_lexicon_wordgen.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply schema v3");
        sqlx::raw_sql(include_str!(
            "../migrations/0004_phase_3_acceptance_fixes.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 3 acceptance fixes");
        sqlx::raw_sql(include_str!(
            "../migrations/0005_phase_3_review_workflow.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 3 review workflow fixes");
        sqlx::raw_sql(include_str!("../migrations/0006_phase_4_ai_assistant.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 4 AI assistant schema");
        sqlx::raw_sql(include_str!(
            "../migrations/0007_phase_4_proposal_limit.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 4 proposal-limit repair");
        sqlx::raw_sql(include_str!(
            "../migrations/0008_phase_5_history_genealogy.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 5 history and genealogy schema");
        connection
    }

    async fn migrated_database() -> SqliteConnection {
        let mut connection = database_through_v8().await;
        sqlx::raw_sql(include_str!(
            "../migrations/0009_phase_5_stage_save_repair.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 5 atomic stage save repair");
        sqlx::raw_sql(include_str!(
            "../migrations/0010_phase_5_existing_project_stage_save_repair.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 5 existing-project stage save repair");
        sqlx::raw_sql(include_str!(
            "../migrations/0011_phase_5_etymology_event_link.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 5 etymology event link");
        sqlx::raw_sql(include_str!("../migrations/0012_language_profile.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 5 language profile schema");
        sqlx::raw_sql(include_str!(
            "../migrations/0013_phase_6_phonology_borrowing.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 6 phonology and borrowing schema");
        sqlx::raw_sql(include_str!(
            "../migrations/0014_phase_6_ai_borrowing_proposal.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 6 AI borrowing proposal repair");
        sqlx::raw_sql(include_str!(
            "../migrations/0015_phase_6_borrowing_lexeme_notes.sql"
        ))
        .execute(&mut connection)
        .await
        .expect("apply Phase 6 borrowing lexeme notes repair");
        connection
    }

    #[tokio::test]
    async fn schema_v1_atomically_writes_lexeme_and_unicode_senses() {
        let mut database = migrated_database().await;
        sqlx::query("INSERT INTO projects VALUES (?1, ?2, ?3, ?4)")
            .bind("project-1")
            .bind("语言计划")
            .bind("2026-01-01T00:00:00Z")
            .bind("2026-01-01T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query("INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)")
            .bind("language-1")
            .bind("project-1")
            .bind("原始语")
            .bind("2026-01-01T00:00:00Z")
            .bind("2026-01-01T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO lexeme_write_commands
             (id, language_id, romanized, part_of_speech, created_at, updated_at, senses_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind("lexeme-1")
        .bind("language-1")
        .bind("ŋa")
        .bind("名词")
        .bind("2026-01-01T00:00:00Z")
        .bind("2026-01-01T00:00:00Z")
        .bind(r#"[{"id":"sense-1","definition":"鱼","position":0},{"id":"sense-2","definition":"水中生物","position":1}]"#)
        .execute(&mut database)
        .await
        .unwrap();

        let sense_count: i64 = sqlx::query("SELECT count(*) AS count FROM senses")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        assert_eq!(sense_count, 2);

        let failed = sqlx::query(
            "INSERT INTO lexeme_write_commands
                 (id, language_id, romanized, part_of_speech, created_at, updated_at, senses_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind("lexeme-1")
        .bind("language-1")
        .bind("changed")
        .bind("名词")
        .bind("2026-01-01T00:00:00Z")
        .bind("2026-01-02T00:00:00Z")
        .bind(r#"[{"id":"sense-invalid","definition":"","position":0}]"#)
        .execute(&mut database)
        .await;
        assert!(failed.is_err());

        let form: String = sqlx::query("SELECT romanized FROM lexemes WHERE id = 'lexeme-1'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("romanized");
        assert_eq!(form, "ŋa", "failed transaction must preserve old lexeme");
    }

    #[tokio::test]
    async fn foreign_keys_cascade_from_language_to_all_phase_1_data() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'P', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO lexeme_write_commands
              (id, language_id, romanized, part_of_speech, created_at, updated_at, senses_json)
            VALUES ('x', 'l', 'a', '', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '[{"id":"s","definition":"one","position":0}]');
            INSERT INTO evolution_write_commands VALUES ('e', 'l', 'a => e', '2026-01-01T00:00:00Z', '[{"id":"w","word":"ama","position":0}]');
            DELETE FROM languages WHERE id = 'l';
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        for table in ["lexemes", "senses", "evolutions", "evolution_test_words"] {
            let count: i64 = sqlx::query(&format!("SELECT count(*) AS count FROM {table}"))
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
            assert_eq!(count, 0, "{table} should be cascade deleted");
        }
    }

    #[tokio::test]
    async fn schema_v2_atomically_writes_unicode_inflection_data() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', '项目', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO inflection_write_commands VALUES (
              'i', 'l', '{"type":"form","value":"固定词形"}', 1,
              '2026-01-01T00:00:00Z',
              '[{"id":"t","stem":"词干","categories":{"数":"复数"},"position":0}]'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let stem: String = sqlx::query("SELECT stem FROM inflection_test_cases WHERE id = 't'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("stem");
        assert_eq!(stem, "词干");

        let failed =
            sqlx::query("INSERT INTO inflection_write_commands VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
                .bind("i")
                .bind("l")
                .bind("{invalid")
                .bind(1)
                .bind("2026-01-02T00:00:00Z")
                .bind("[]")
                .execute(&mut database)
                .await;
        assert!(failed.is_err());
    }

    #[tokio::test]
    async fn schema_v3_commits_and_safely_undoes_an_accepted_batch() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', '项目', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO generation_batch_write_commands VALUES (
              'b', 'l', 'basic', '{}', 'wordgen-profile-v1', 'splitmix64-v1',
              '42', '[{"key":"water","gloss":"水"}]', '2026-01-01T00:00:00Z',
              '[{"id":"c","conceptKey":"water","gloss":"水","romanized":"aka","status":"accepted","conflicts":[],"committedLexemeId":"x","committedSenseId":"s"}]'
            );
            INSERT INTO generation_commit_commands VALUES ('o', 'b', '2026-01-02T00:00:00Z');
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let form: String = sqlx::query("SELECT romanized FROM lexemes WHERE id = 'x'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("romanized");
        assert_eq!(form, "aka");

        sqlx::query("INSERT INTO generation_undo_commands VALUES ('o', ?1)")
            .bind("2026-01-03T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();
        let count: i64 = sqlx::query("SELECT count(*) AS count FROM lexemes WHERE id = 'x'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        assert_eq!(count, 0);
        let candidate_status: String =
            sqlx::query("SELECT status FROM generation_candidates WHERE id = 'c'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("status");
        assert_eq!(candidate_status, "pending");
        let batch_status: String =
            sqlx::query("SELECT status FROM generation_batches WHERE id = 'b'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("status");
        assert_eq!(batch_status, "draft");
        let review_deleted_at: Option<String> =
            sqlx::query("SELECT review_deleted_at FROM generation_batches WHERE id = 'b'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("review_deleted_at");
        assert_eq!(review_deleted_at, None);
    }

    #[tokio::test]
    async fn schema_v3_refuses_undo_after_committed_lexeme_changes() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'P', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO generation_batch_write_commands VALUES (
              'b', 'l', 'basic', '{}', 'wordgen-profile-v1', 'splitmix64-v1',
              '1', '[]', '2026-01-01T00:00:00Z',
              '[{"id":"c","gloss":"fish","romanized":"na","status":"accepted","conflicts":[],"committedLexemeId":"x","committedSenseId":"s"}]'
            );
            INSERT INTO generation_commit_commands VALUES ('o', 'b', '2026-01-02T00:00:00Z');
            UPDATE lexemes SET notes = 'edited', updated_at = '2026-01-03T00:00:00Z' WHERE id = 'x';
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let result = sqlx::query("INSERT INTO generation_undo_commands VALUES ('o', ?1)")
            .bind("2026-01-04T00:00:00Z")
            .execute(&mut database)
            .await;
        assert!(result.is_err());
        let notes: String = sqlx::query("SELECT notes FROM lexemes WHERE id = 'x'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("notes");
        assert_eq!(notes, "edited");
    }

    #[tokio::test]
    async fn phase_3_review_batch_supports_independent_partial_commits_and_undos() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'P', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO generation_batch_write_commands VALUES (
              'b', 'l', 'basic', '{}', 'wordgen-profile-v1', 'splitmix64-v1',
              '1', '[]', '2026-01-01T00:00:00Z',
              '[
                {"id":"c1","gloss":"fish","romanized":"na","status":"accepted","conflicts":[],"committedLexemeId":"x1","committedSenseId":"s1"},
                {"id":"c2","gloss":"water","romanized":"mi","status":"pending","conflicts":[],"committedLexemeId":"x2","committedSenseId":"s2"}
              ]'
            );
            INSERT INTO generation_commit_commands VALUES ('o1', 'b', '2026-01-02T00:00:00Z');
            INSERT INTO generation_candidate_bulk_write_commands VALUES (
              'bulk', 'b',
              '[{"id":"c2","gloss":"water","romanized":"mi","status":"accepted","conflicts":[],"committedLexemeId":"x2","committedSenseId":"s2"}]'
            );
            INSERT INTO generation_commit_commands VALUES ('o2', 'b', '2026-01-03T00:00:00Z');
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let operation_count: i64 = sqlx::query(
            "SELECT count(*) AS count FROM lexicon_batch_operations WHERE batch_id = 'b'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap()
        .get("count");
        assert_eq!(operation_count, 2);

        sqlx::query("INSERT INTO generation_undo_commands VALUES ('o1', ?1)")
            .bind("2026-01-04T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();

        let first_status: String =
            sqlx::query("SELECT status FROM generation_candidates WHERE id = 'c1'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("status");
        let second_status: String =
            sqlx::query("SELECT status FROM generation_candidates WHERE id = 'c2'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("status");
        assert_eq!(first_status, "pending");
        assert_eq!(second_status, "committed");

        let remaining_lexeme: String = sqlx::query("SELECT romanized FROM lexemes WHERE id = 'x2'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("romanized");
        assert_eq!(remaining_lexeme, "mi");
    }

    #[tokio::test]
    async fn schema_v6_atomically_persists_ai_turn_without_secrets() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', '项目', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO ai_conversations VALUES (
              'c', 'p', 'l', '词典建议', 'openai', 'OpenAI', 'chosen-model',
              'language', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO ai_turn_write_commands VALUES (
              'command', 'c',
              '{"id":"m","content":"建议添加词条","status":"complete","providerKind":"openai","providerLabel":"OpenAI","modelId":"chosen-model","usageJson":"{}","createdAt":"2026-01-02T00:00:00Z"}',
              '[{"id":"a","kind":"lexeme.upsert","languageId":"l","targetId":null,"baseSnapshotHash":"new","patchJson":"{\"romanized\":\"ŋa\"}","summary":"添加鱼"}]',
              '{"id":"audit","providerKind":"openai","providerLabel":"OpenAI","modelId":"chosen-model","endpointLabel":"https://api.openai.com","contextScope":"language","contextJson":"{\"language\":\"阿兰语\"}","referencesJson":"[]","toolCallsJson":"[]","contextBytes":24,"outcome":"complete","errorCode":null}'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let message_count: i64 = sqlx::query("SELECT count(*) count FROM ai_messages")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        let proposal_count: i64 = sqlx::query("SELECT count(*) count FROM ai_proposals")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        let command_count: i64 = sqlx::query("SELECT count(*) count FROM ai_turn_write_commands")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        assert_eq!((message_count, proposal_count, command_count), (1, 1, 0));

        for table in [
            "ai_conversations",
            "ai_messages",
            "ai_proposals",
            "ai_context_audits",
        ] {
            let columns: Vec<String> = sqlx::query(&format!("PRAGMA table_info({table})"))
                .fetch_all(&mut database)
                .await
                .unwrap()
                .into_iter()
                .map(|row| row.get::<String, _>("name"))
                .collect();
            assert!(!columns
                .iter()
                .any(|column| column.contains("secret") || column.contains("api_key")));
        }
    }

    #[tokio::test]
    async fn schema_v7_accepts_fifty_ai_proposals_and_atomically_rejects_fifty_one() {
        use serde_json::json;

        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO ai_conversations VALUES (
              'c', 'p', 'l', 'Proposal test', 'openai', 'OpenAI', 'model',
              'language', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let proposals = |count: usize| {
            serde_json::to_string(
                &(0..count)
                    .map(|index| {
                        json!({
                            "id": format!("proposal-{count}-{index}"),
                            "kind": "lexeme.upsert",
                            "languageId": "l",
                            "targetId": null,
                            "baseSnapshotHash": "new",
                            "patchJson": format!(r#"{{"romanized":"word-{index}"}}"#),
                            "summary": format!("Add word {index}")
                        })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap()
        };
        let message = |id: &str| {
            json!({
                "id": id,
                "content": "Generated proposals",
                "status": "complete",
                "providerKind": "openai",
                "providerLabel": "OpenAI",
                "modelId": "model",
                "usageJson": "{}",
                "createdAt": "2026-01-02T00:00:00Z"
            })
            .to_string()
        };
        let audit = |id: &str| {
            json!({
                "id": id,
                "providerKind": "openai",
                "providerLabel": "OpenAI",
                "modelId": "model",
                "endpointLabel": "https://api.openai.com",
                "contextScope": "language",
                "contextJson": "{}",
                "referencesJson": "[]",
                "toolCallsJson": "[]",
                "contextBytes": 2,
                "outcome": "complete",
                "errorCode": null
            })
            .to_string()
        };

        sqlx::query("INSERT INTO ai_turn_write_commands VALUES (?1, 'c', ?2, ?3, ?4)")
            .bind("command-50")
            .bind(message("message-50"))
            .bind(proposals(50))
            .bind(audit("audit-50"))
            .execute(&mut database)
            .await
            .unwrap();

        let proposal_count: i64 = sqlx::query("SELECT count(*) count FROM ai_proposals")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        assert_eq!(proposal_count, 50);

        let result = sqlx::query("INSERT INTO ai_turn_write_commands VALUES (?1, 'c', ?2, ?3, ?4)")
            .bind("command-51")
            .bind(message("message-51"))
            .bind(proposals(51))
            .bind(audit("audit-51"))
            .execute(&mut database)
            .await;
        assert!(result.is_err());

        let rejected_message_count: i64 =
            sqlx::query("SELECT count(*) count FROM ai_messages WHERE id = 'message-51'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        let rejected_proposal_count: i64 =
            sqlx::query("SELECT count(*) count FROM ai_proposals WHERE message_id = 'message-51'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        assert_eq!((rejected_message_count, rejected_proposal_count), (0, 0));
    }

    #[tokio::test]
    async fn schema_v14_accepts_borrowing_adaptation_ai_proposals() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO ai_conversations VALUES (
              'c', 'p', 'l', 'Borrowing review', 'openai', 'OpenAI', 'model',
              'language', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO ai_turn_write_commands VALUES (
              'command', 'c',
              '{"id":"message","content":"Borrowing comparison","status":"complete","providerKind":"openai","providerLabel":"OpenAI","modelId":"model","usageJson":"{}","createdAt":"2026-01-02T00:00:00Z"}',
              '[{"id":"proposal","kind":"borrowing_adaptation.suggest","languageId":"l","targetId":null,"baseSnapshotHash":"new","patchJson":"{\"candidateRecommendations\":[],\"temporaryRuleAdjustments\":[]}","summary":"Compare candidates"}]',
              '{"id":"audit","providerKind":"openai","providerLabel":"OpenAI","modelId":"model","endpointLabel":"official","contextScope":"language","contextJson":"{}","referencesJson":"[]","toolCallsJson":"[]","contextBytes":2,"outcome":"complete","errorCode":null}'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let kind: String = sqlx::query("SELECT kind FROM ai_proposals WHERE id = 'proposal'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("kind");
        assert_eq!(kind, "borrowing_adaptation.suggest");
    }

    #[tokio::test]
    async fn schema_v8_creates_one_internal_default_stage_for_old_and_new_languages() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let row = sqlx::query(
            "SELECT kind, visible, storage_mode FROM language_stages WHERE language_id = 'l'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        assert_eq!(row.get::<String, _>("kind"), "internal_default");
        assert_eq!(row.get::<i64, _>("visible"), 0);
        assert_eq!(row.get::<String, _>("storage_mode"), "independent_snapshot");
    }

    #[tokio::test]
    async fn schema_v8_protects_unrecorded_stages_and_primary_parent_uniqueness() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('a', 'p', 'A', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('b', 'p', 'B', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('c', 'p', 'C', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO language_relations VALUES (
              'r1', 'p', 'a', 'c', NULL, NULL, 'genetic', 1, 'confirmed', '',
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let invalid_stage = sqlx::query(
            r#"INSERT INTO language_stages VALUES (
              's', 'a', 'Unknown', 'historical_stage', 'unrecorded',
              'inherited_delta', NULL, 'a:default-stage', '', '', 1, 1,
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            )"#,
        )
        .execute(&mut database)
        .await;
        assert!(invalid_stage.is_err());

        let second_primary = sqlx::query(
            r#"INSERT INTO language_relations VALUES (
              'r2', 'p', 'b', 'c', NULL, NULL, 'genetic', 1, 'confirmed', '',
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            )"#,
        )
        .execute(&mut database)
        .await;
        assert!(second_primary.is_err());
    }

    #[tokio::test]
    async fn schema_v8_atomically_replaces_historical_event_participants() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO historical_event_write_commands VALUES (
              'e', 'p', 'Migration', 'migration', '100', '200', 'Northward',
              0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
              '[{"languageId":"l","stageId":null,"role":"participant","notes":""}]'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let command_count: i64 =
            sqlx::query("SELECT count(*) count FROM historical_event_write_commands")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        let participant_count: i64 =
            sqlx::query("SELECT count(*) count FROM historical_event_participants")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        assert_eq!((command_count, participant_count), (0, 1));
    }

    #[tokio::test]
    async fn schema_v9_atomically_saves_a_stage_with_its_context() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES (
              'l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        // Position 0 is already occupied by the internal default stage. The
        // command repairs that collision while keeping the whole edit atomic.
        sqlx::query(
            r#"INSERT INTO language_stage_write_commands VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
              ?13, ?14, ?15, ?16, ?17
            )"#,
        )
        .bind("stage")
        .bind("l")
        .bind("古典期")
        .bind("historical_stage")
        .bind("partial")
        .bind("inherited_delta")
        .bind("l:default-stage")
        .bind("l:default-stage")
        .bind("前 400")
        .bind("前 100")
        .bind(0_i64)
        .bind(1_i64)
        .bind("2026-01-02T00:00:00Z")
        .bind("2026-01-02T00:00:00Z")
        .bind("城邦时代")
        .bind("资料不完整")
        .bind(r#"["碑铭","手稿"]"#)
        .execute(&mut database)
        .await
        .unwrap();

        let stage = sqlx::query("SELECT name, position FROM language_stages WHERE id = 'stage'")
            .fetch_one(&mut database)
            .await
            .unwrap();
        let context = sqlx::query(
            "SELECT background, sources_json FROM stage_context_records WHERE stage_id = 'stage'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let command_count: i64 =
            sqlx::query("SELECT count(*) count FROM language_stage_write_commands")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");

        assert_eq!(stage.get::<String, _>("name"), "古典期");
        assert_eq!(stage.get::<i64, _>("position"), 1);
        assert_eq!(context.get::<String, _>("background"), "城邦时代");
        assert_eq!(
            context.get::<String, _>("sources_json"),
            r#"["碑铭","手稿"]"#
        );
        assert_eq!(command_count, 0);
    }

    #[tokio::test]
    async fn schema_v9_rolls_back_the_stage_when_its_context_is_invalid() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES (
              'l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let result = sqlx::query(
            r#"INSERT INTO language_stage_write_commands VALUES (
              'stage', 'l', '古典期', 'historical_stage', 'partial',
              'inherited_delta', 'missing-stage', 'l:default-stage', '', '',
              1, 1, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z',
              '', '', '[]'
            )"#,
        )
        .execute(&mut database)
        .await;
        assert!(result.is_err());

        let stage_count: i64 =
            sqlx::query("SELECT count(*) count FROM language_stages WHERE id = 'stage'")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        let context_count: i64 = sqlx::query(
            "SELECT count(*) count FROM stage_context_records WHERE stage_id = 'stage'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap()
        .get("count");
        assert_eq!((stage_count, context_count), (0, 0));
    }

    #[tokio::test]
    async fn schema_v10_repairs_an_existing_project_that_missed_the_v9_objects() {
        let mut database = database_through_v8().await;

        // This represents a project whose migration ledger already says v9,
        // while the first stage-save repair objects are absent. Applying the
        // new version must repair it without replaying or editing migration 9.
        sqlx::raw_sql(include_str!(
            "../migrations/0010_phase_5_existing_project_stage_save_repair.sql"
        ))
        .execute(&mut database)
        .await
        .expect("apply existing-project repair");

        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'Existing project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES (
              'l', 'p', 'Existing language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO language_stage_write_commands VALUES (
              'stage', 'l', 'Later stage', 'historical_stage', 'partial',
              'inherited_delta', 'l:default-stage', 'l:default-stage', '', '',
              1, 1, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z',
              'Background', 'Evidence', '[]'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .expect("save a historical stage after the v10 repair");

        let saved: (String, String) = sqlx::query_as(
            r#"SELECT s.name, c.background
               FROM language_stages s
               JOIN stage_context_records c ON c.stage_id = s.id
               WHERE s.id = 'stage'"#,
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        assert_eq!(saved, ("Later stage".to_owned(), "Background".to_owned()));
    }

    #[tokio::test]
    async fn schema_v11_links_etymology_to_an_event_without_coupling_lifetimes() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'History project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES (
              'l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO lexemes (
              id, language_id, romanized, part_of_speech, created_at, updated_at
            ) VALUES (
              'target', 'l', 'word', 'noun', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO historical_events (
              id, project_id, name, event_type, start_label, end_label,
              description, position, created_at, updated_at
            ) VALUES (
              'event', 'p', 'Contact', 'contact', '100', '200', '', 0,
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO etymology_relations (
              id, project_id, target_lexeme_id, kind, source_form,
              confidence, notes, created_at, updated_at, historical_event_id
            ) VALUES (
              'relation', 'p', 'target', 'borrowing', 'source',
              'confirmed', '', '2026-01-01T00:00:00Z',
              '2026-01-01T00:00:00Z', 'event'
            );
            DELETE FROM historical_events WHERE id = 'event';
            "#,
        )
        .execute(&mut database)
        .await
        .expect("store an event-backed etymology relation");

        let event_id: Option<String> = sqlx::query_scalar(
            "SELECT historical_event_id FROM etymology_relations WHERE id = 'relation'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        assert_eq!(event_id, None);
    }

    #[tokio::test]
    async fn etymology_deletion_can_keep_or_cascade_to_the_target_lexeme() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'Contact project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES
              ('source-language', 'p', 'Source', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
              ('target-language', 'p', 'Target', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO lexemes (
              id, language_id, romanized, part_of_speech, created_at, updated_at
            ) VALUES
              ('source', 'source-language', 'pata', 'noun', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
              ('keep-target', 'target-language', 'bada', 'noun', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
              ('delete-target', 'target-language', 'pada', 'noun', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO etymology_relations (
              id, project_id, source_lexeme_id, target_lexeme_id, kind,
              source_form, confidence, notes, created_at, updated_at
            ) VALUES
              ('keep-relation', 'p', 'source', 'keep-target', 'borrowing', '', 'confirmed', '', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
              ('delete-relation', 'p', 'source', 'delete-target', 'borrowing', '', 'confirmed', '', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            DELETE FROM etymology_relations WHERE id = 'keep-relation';
            DELETE FROM lexemes WHERE id = 'delete-target';
            "#,
        )
        .execute(&mut database)
        .await
        .expect("delete borrowing relation and target lexeme safely");

        let kept_target: i64 =
            sqlx::query_scalar("SELECT count(*) FROM lexemes WHERE id = 'keep-target'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let deleted_relation: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM etymology_relations WHERE id = 'delete-relation'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let source: i64 = sqlx::query_scalar("SELECT count(*) FROM lexemes WHERE id = 'source'")
            .fetch_one(&mut database)
            .await
            .unwrap();
        assert_eq!(kept_target, 1);
        assert_eq!(deleted_relation, 0);
        assert_eq!(source, 1);
    }

    #[tokio::test]
    async fn schema_v12_persists_language_profile_without_changing_identity() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES (
              'p', 'Profile project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            INSERT INTO languages (
              id, project_id, name, profile_json, created_at, updated_at
            ) VALUES (
              'l', 'p', '阿兰语',
              '{"nativeName":"Árana","region":"北海沿岸","notes":"礼仪语言"}',
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .expect("store a Unicode language profile");

        let saved: (String, String) =
            sqlx::query_as("SELECT name, profile_json FROM languages WHERE id = 'l'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        assert_eq!(saved.0, "阿兰语");
        assert!(saved.1.contains("Árana"));
        assert!(saved.1.contains("北海沿岸"));
    }

    #[tokio::test]
    async fn explicit_migrator_runs_for_each_project_opened_in_one_app_session() {
        for project_number in 1..=2 {
            let mut database = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("open project database");
            super::run_pending_project_migrations(&mut database)
                .await
                .expect("migrate every independently opened project");

            let latest_version: i64 = sqlx::query(
                "SELECT max(version) AS version FROM _sqlx_migrations WHERE success = 1",
            )
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("version");
            let stage_command_table: i64 = sqlx::query(
                "SELECT count(*) AS count FROM sqlite_master \
                 WHERE type = 'table' AND name = 'language_stage_write_commands'",
            )
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");

            assert_eq!(latest_version, super::DATABASE_SCHEMA_VERSION as i64);
            assert_eq!(
                stage_command_table, 1,
                "project {project_number} was not migrated"
            );
        }
    }

    #[tokio::test]
    async fn explicit_migrator_accepts_legacy_checksums_and_applies_new_versions() {
        let mut database = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open legacy project database");
        database
            .ensure_migrations_table()
            .await
            .expect("create migration ledger");

        let migrator = super::project_migrator();
        for migration in migrator
            .migrations
            .iter()
            .filter(|migration| migration.version <= 8)
        {
            database
                .apply(migration)
                .await
                .expect("apply legacy migration");
        }

        sqlx::query("UPDATE _sqlx_migrations SET checksum = x'00' WHERE version = 2")
            .execute(&mut database)
            .await
            .expect("simulate an early release checksum");

        super::run_pending_project_migrations(&mut database)
            .await
            .expect("accept successful legacy versions and apply v9/v10");

        let latest_version: i64 =
            sqlx::query("SELECT max(version) AS version FROM _sqlx_migrations WHERE success = 1")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("version");
        assert_eq!(latest_version, super::DATABASE_SCHEMA_VERSION as i64);
    }

    #[tokio::test]
    async fn explicit_migrator_rejects_a_future_database_schema() {
        let mut database = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open future project database");
        database
            .ensure_migrations_table()
            .await
            .expect("create migration ledger");
        sqlx::query(
            "INSERT INTO _sqlx_migrations
             (version, description, success, checksum, execution_time)
             VALUES (99, 'future schema', TRUE, x'00', 0)",
        )
        .execute(&mut database)
        .await
        .expect("record a future schema version");

        let result = super::run_pending_project_migrations(&mut database).await;
        assert!(result
            .expect_err("future databases must be rejected")
            .contains("requires a newer FishTongue version"));
    }

    #[tokio::test]
    async fn schema_v8_commits_and_undoes_forward_evolution_without_changing_source() {
        use serde_json::json;

        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages (id, project_id, name, created_at, updated_at) VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO lexeme_write_commands (
              id, language_id, romanized, part_of_speech, created_at, updated_at,
              senses_json, ipa, status, source_type, notes, morphemes_json
            ) VALUES (
              'x', 'l', 'aka', 'noun', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
              '[{"id":"s","definition":"fish","position":0}]', '', 'confirmed', 'manual', '', '[]'
            );
            INSERT INTO language_stages VALUES (
              'target', 'l', 'Later', 'historical_stage', 'recorded',
              'inherited_delta', 'l:default-stage', 'l:default-stage', '', '', 1, 1,
              '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();
        let payload = json!({
            "id": "x",
            "languageId": "l",
            "romanized": "eke",
            "senses": [{"id":"s","definition":"fish","position":0}]
        })
        .to_string();
        let candidates = json!([{
            "id": "c",
            "sourceLexemeId": "x",
            "sourceForm": "aka",
            "resultForm": "eke",
            "payloadJson": payload,
            "status": "accepted",
            "conflictJson": "[]",
            "position": 0
        }])
        .to_string();
        sqlx::query(
            "INSERT INTO stage_evolution_batch_write_commands VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        )
        .bind("b")
        .bind("l")
        .bind("l:default-stage")
        .bind("target")
        .bind("raising:\na => e")
        .bind(r#"[{"lexemeId":"x","form":"aka"}]"#)
        .bind("2026-01-02T00:00:00Z")
        .bind(candidates)
        .execute(&mut database)
        .await
        .unwrap();

        sqlx::query("INSERT INTO stage_evolution_commit_commands VALUES ('o','b',?1)")
            .bind("2026-01-03T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();

        let source_form: String = sqlx::query("SELECT romanized FROM lexemes WHERE id = 'x'")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("romanized");
        let target_form: String = sqlx::query(
            "SELECT json_extract(payload_json, '$.romanized') form \
             FROM stage_component_overrides WHERE stage_id = 'target'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap()
        .get("form");
        assert_eq!((source_form, target_form), ("aka".into(), "eke".into()));

        sqlx::query("INSERT INTO stage_evolution_undo_commands VALUES ('o', ?1)")
            .bind("2026-01-04T00:00:00Z")
            .execute(&mut database)
            .await
            .unwrap();
        let remaining: i64 = sqlx::query("SELECT count(*) count FROM stage_component_overrides")
            .fetch_one(&mut database)
            .await
            .unwrap()
            .get("count");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn schema_v13_saves_phonology_as_one_aggregate() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p','Project','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO languages (id,project_id,name,created_at,updated_at)
              VALUES ('l','p','Language','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO phonology_write_commands VALUES (
              'command','profile','l','phonology-profile-v1','["CV"]',
              '{"legalOnsets":["p"],"legalNuclei":["a"],"legalCodas":[],"legalClusters":[],"forbiddenPatterns":[]}',
              '{}','{}',
              '[
                {"id":"p","ipa":"p","displaySymbol":"p","category":"consonant","role":"phoneme","distribution":"","source":"manual","notes":"","position":0},
                {"id":"p-allophone","ipa":"b","displaySymbol":"b","category":"consonant","role":"allophone","parentPhonemeId":"p","distribution":"between vowels","source":"manual","notes":"","position":1}
              ]',
              '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .expect("save parent and allophone atomically");

        let saved: i64 =
            sqlx::query_scalar("SELECT count(*) FROM phonemes WHERE profile_id='profile'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let command_count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM phonology_write_commands")
                .fetch_one(&mut database)
                .await
                .unwrap();
        assert_eq!(saved, 2);
        assert_eq!(command_count, 0);
    }

    #[tokio::test]
    async fn schema_v13_commits_borrowing_lexeme_sense_and_relation_atomically() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p','Project','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO languages (id,project_id,name,created_at,updated_at) VALUES
              ('source-language','p','Source','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
              ('target-language','p','Target','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO lexemes (
              id,language_id,romanized,part_of_speech,created_at,updated_at,
              ipa,status,source_type,notes
            ) VALUES (
              'source-lexeme','source-language','pata','noun',
              '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','pata','confirmed','manual',''
            );
            INSERT INTO senses VALUES ('source-sense','source-lexeme','stone',0);
            INSERT INTO borrowing_profiles VALUES (
              'profile','p','source-language',NULL,'target-language',NULL,'Default',
              'borrowing-profile-v1',1,
              '{"explicitMappings":[],"distanceWeights":{},"epenthesis":[],"deletionRules":[],"replacementRules":[],"repairOrder":[],"stressStrategy":"none","toneStrategy":"none","candidateCount":1,"maxSearchAttempts":10}',
              '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
            );
            INSERT INTO borrowing_batches VALUES (
              'batch','profile','source-language',NULL,'target-language',NULL,
              '[]','{}','{}','hash','0.22.2','borrowing-adaptation-v1',NULL,'[]',NULL,
              'draft','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
            );
            INSERT INTO borrowing_candidates VALUES (
              'candidate','batch','source-lexeme','pata','pata','bada','bada',NULL,
              'noun','[{"definition":"stone","position":0}]','[]','[]',0.5,'[]','trace',
              'accepted',NULL,NULL,0
            );
            INSERT INTO borrowing_commit_commands VALUES (
              'commit','batch','["candidate"]','2026-01-02T00:00:00Z'
            );
            "#,
        )
        .execute(&mut database)
        .await
        .expect("commit the reviewed borrowing");

        let lexeme: (String, String, String, String) = sqlx::query_as(
            "SELECT romanized,part_of_speech,source_type,notes FROM lexemes WHERE id='candidate:lexeme'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        let sense: String =
            sqlx::query_scalar("SELECT definition FROM senses WHERE lexeme_id='candidate:lexeme'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        let relation: (String, String) = sqlx::query_as(
            "SELECT kind,notes FROM etymology_relations WHERE id='candidate:relation'",
        )
        .fetch_one(&mut database)
        .await
        .unwrap();
        assert_eq!(
            lexeme,
            ("bada".into(), "noun".into(), "imported".into(), "".into())
        );
        assert_eq!(sense, "stone");
        assert_eq!(relation, ("borrowing".into(), "trace".into()));
    }

    #[tokio::test]
    async fn schema_v13_rejects_unaccepted_borrowing_without_partial_writes() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p','Project','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO languages (id,project_id,name,created_at,updated_at) VALUES
              ('s','p','Source','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
              ('t','p','Target','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
            INSERT INTO borrowing_profiles VALUES (
              'profile','p','s',NULL,'t',NULL,'Default','borrowing-profile-v1',1,'{}',
              '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
            );
            INSERT INTO borrowing_batches VALUES (
              'batch','profile','s',NULL,'t',NULL,'[]','{}','{}','hash','0.22.2',
              'borrowing-adaptation-v1',NULL,'[]',NULL,'draft',
              '2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'
            );
            INSERT INTO borrowing_candidates VALUES (
              'candidate','batch',NULL,'pata','pata','bada','bada',NULL,'noun',
              '[{"definition":"stone","position":0}]','[]','[]',0.5,'[]','trace',
              'pending',NULL,NULL,0
            );
            "#,
        )
        .execute(&mut database)
        .await
        .unwrap();

        let result = sqlx::query(
            "INSERT INTO borrowing_commit_commands VALUES ('commit','batch','[\"candidate\"]','2026-01-02T00:00:00Z')",
        )
        .execute(&mut database)
        .await;
        assert!(result.is_err());
        let created: i64 =
            sqlx::query_scalar("SELECT count(*) FROM lexemes WHERE id='candidate:lexeme'")
                .fetch_one(&mut database)
                .await
                .unwrap();
        assert_eq!(created, 0);
    }
}
