use tauri_plugin_sql::{Migration, MigrationKind};

pub const DATABASE_URL: &str = "sqlite:active-project/project.db";
pub const DATABASE_SCHEMA_VERSION: u32 = 3;

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
            version: DATABASE_SCHEMA_VERSION.into(),
            description: "create_phase_3_lexicon_wordgen_schema",
            sql: include_str!("../migrations/0003_phase_3_lexicon_wordgen.sql"),
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
}
