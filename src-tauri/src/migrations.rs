use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:active-project/project.db";
pub const DATABASE_SCHEMA_VERSION: u32 = 8;

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
            version: DATABASE_SCHEMA_VERSION.into(),
            description: "create_phase_5_history_genealogy_schema",
            sql: include_str!("../migrations/0008_phase_5_history_genealogy.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg(test)]
mod tests {
    use sqlx::{Connection, Row, SqliteConnection};

    async fn migrated_database() -> SqliteConnection {
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
        sqlx::raw_sql(include_str!("../migrations/0003_phase_3_lexicon_wordgen.sql"))
            .execute(&mut connection)
            .await
            .expect("apply schema v3");
        sqlx::raw_sql(include_str!("../migrations/0004_phase_3_acceptance_fixes.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 3 acceptance fixes");
        sqlx::raw_sql(include_str!("../migrations/0005_phase_3_review_workflow.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 3 review workflow fixes");
        sqlx::raw_sql(include_str!("../migrations/0006_phase_4_ai_assistant.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 4 AI assistant schema");
        sqlx::raw_sql(include_str!("../migrations/0007_phase_4_proposal_limit.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 4 proposal-limit repair");
        sqlx::raw_sql(include_str!("../migrations/0008_phase_5_history_genealogy.sql"))
            .execute(&mut connection)
            .await
            .expect("apply Phase 5 history and genealogy schema");
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
        sqlx::query("INSERT INTO languages VALUES (?1, ?2, ?3, ?4, ?5)")
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

        let failed =
            sqlx::query(
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
            INSERT INTO languages VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            INSERT INTO languages VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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

        let failed = sqlx::query(
            "INSERT INTO inflection_write_commands VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
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
            INSERT INTO languages VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            INSERT INTO languages VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            INSERT INTO languages VALUES ('l', 'p', 'L', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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

        let operation_count: i64 =
            sqlx::query("SELECT count(*) AS count FROM lexicon_batch_operations WHERE batch_id = 'b'")
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
            INSERT INTO languages VALUES ('l', 'p', '阿兰语', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            .fetch_one(&mut database).await.unwrap().get("count");
        let proposal_count: i64 = sqlx::query("SELECT count(*) count FROM ai_proposals")
            .fetch_one(&mut database).await.unwrap().get("count");
        let command_count: i64 = sqlx::query("SELECT count(*) count FROM ai_turn_write_commands")
            .fetch_one(&mut database).await.unwrap().get("count");
        assert_eq!((message_count, proposal_count, command_count), (1, 1, 0));

        for table in ["ai_conversations", "ai_messages", "ai_proposals", "ai_context_audits"] {
            let columns: Vec<String> = sqlx::query(&format!("PRAGMA table_info({table})"))
                .fetch_all(&mut database).await.unwrap().into_iter()
                .map(|row| row.get::<String, _>("name")).collect();
            assert!(!columns.iter().any(|column| column.contains("secret") || column.contains("api_key")));
        }
    }

    #[tokio::test]
    async fn schema_v7_accepts_fifty_ai_proposals_and_atomically_rejects_fifty_one() {
        use serde_json::json;

        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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

        let proposal_count: i64 =
            sqlx::query("SELECT count(*) count FROM ai_proposals")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        assert_eq!(proposal_count, 50);

        let result =
            sqlx::query("INSERT INTO ai_turn_write_commands VALUES (?1, 'c', ?2, ?3, ?4)")
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
    async fn schema_v8_creates_one_internal_default_stage_for_old_and_new_languages() {
        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            INSERT INTO languages VALUES ('a', 'p', 'A', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages VALUES ('b', 'p', 'B', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages VALUES ('c', 'p', 'C', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
            INSERT INTO languages VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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
    async fn schema_v8_commits_and_undoes_forward_evolution_without_changing_source() {
        use serde_json::json;

        let mut database = migrated_database().await;
        sqlx::raw_sql(
            r#"
            INSERT INTO projects VALUES ('p', 'Project', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO languages VALUES ('l', 'p', 'Language', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
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

        let source_form: String =
            sqlx::query("SELECT romanized FROM lexemes WHERE id = 'x'")
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
        let remaining: i64 =
            sqlx::query("SELECT count(*) count FROM stage_component_overrides")
                .fetch_one(&mut database)
                .await
                .unwrap()
                .get("count");
        assert_eq!(remaining, 0);
    }
}
