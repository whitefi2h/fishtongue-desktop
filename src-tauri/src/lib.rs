mod ai;
mod analysis;
mod lexurgy;
mod migrations;
mod project_files;
mod project_history;

use ai::{
    ai_cancel, ai_list_models, ai_secret_delete, ai_secret_set, ai_secret_status, ai_stream_turn,
    ai_test_connection, AiRuntime,
};
use analysis::{
    analysis_cancel, analysis_describe_segments, analysis_rank_segment_mappings,
    analysis_validate_ipa, shutdown_analysis, AnalysisRuntime,
};
use lexurgy::{
    lexurgy_cancel, lexurgy_ensure_ready, lexurgy_generate_words, lexurgy_inflect, lexurgy_run,
    lexurgy_status, lexurgy_validate, lexurgy_validate_wordgen, shutdown_lexurgy,
    LexurgySupervisor,
};
use migrations::migrate_active_project_database;
use project_files::{
    create_project_workspace, discard_project_workspace, import_project_archive,
    inspect_project_recovery, mark_project_dirty, open_project_archive, recover_project_workspace,
    save_project_archive,
};
use project_history::{
    abort_project_operation, begin_project_operation, complete_project_operation,
    recover_pending_project_operations, redo_project_operation, undo_project_operation,
};
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LexurgySupervisor::default())
        .manage(AiRuntime::default())
        .manage(AnalysisRuntime::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            create_project_workspace,
            open_project_archive,
            import_project_archive,
            mark_project_dirty,
            save_project_archive,
            inspect_project_recovery,
            recover_project_workspace,
            discard_project_workspace,
            migrate_active_project_database,
            begin_project_operation,
            complete_project_operation,
            abort_project_operation,
            undo_project_operation,
            redo_project_operation,
            recover_pending_project_operations,
            lexurgy_status,
            lexurgy_ensure_ready,
            lexurgy_validate,
            lexurgy_run,
            lexurgy_cancel,
            lexurgy_inflect,
            lexurgy_validate_wordgen,
            lexurgy_generate_words,
            ai_secret_status,
            ai_secret_set,
            ai_secret_delete,
            ai_list_models,
            ai_test_connection,
            ai_stream_turn,
            ai_cancel,
            analysis_validate_ipa,
            analysis_describe_segments,
            analysis_rank_segment_mappings,
            analysis_cancel,
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                shutdown_lexurgy(window.state::<LexurgySupervisor>().inner());
                shutdown_analysis(window.state::<AnalysisRuntime>().inner());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
