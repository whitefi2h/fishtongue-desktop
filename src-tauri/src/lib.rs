mod migrations;
mod project_files;

use migrations::{project_migrations, DATABASE_URL};
use project_files::{
    create_project_workspace, discard_project_workspace, import_project_archive,
    inspect_project_recovery, mark_project_dirty, open_project_archive, recover_project_workspace,
    save_project_archive,
};
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, project_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            create_project_workspace,
            open_project_archive,
            import_project_archive,
            mark_project_dirty,
            save_project_archive,
            inspect_project_recovery,
            recover_project_workspace,
            discard_project_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
