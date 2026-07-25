use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    io::{self, Read, Seek, Write},
    path::{Component, Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tempfile::{Builder as TempBuilder, NamedTempFile};
use thiserror::Error;
use uuid::Uuid;
use walkdir::WalkDir;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::migrations::DATABASE_SCHEMA_VERSION;

const FORMAT_VERSION: u32 = 1;
const MAX_ARCHIVE_ENTRIES: usize = 10_000;
const MAX_UNCOMPRESSED_SIZE: u64 = 2 * 1024 * 1024 * 1024;
const BACKUP_LIMIT: usize = 10;
const BACKUP_INTERVAL_MINUTES: i64 = 10;
const MANIFEST_FILE: &str = "manifest.json";
const DATABASE_FILE: &str = "project.db";
const DATABASE_WAL_FILE: &str = "project.db-wal";
const DATABASE_SHM_FILE: &str = "project.db-shm";
const SESSION_FILE: &str = ".session.json";

/// Stable Phase 1 extension point. A supported legacy format must provide an
/// implementation and compatibility fixture before it can enter this registry.
#[allow(dead_code)]
trait ProjectFormatMigrator {
    fn source_version(&self) -> u32;
    fn target_version(&self) -> u32;
    fn migrate(&self, workspace: &Path) -> Result<(), ProjectFileError>;
}

fn registered_migrator(source_version: u32) -> Option<&'static dyn ProjectFormatMigrator> {
    let _ = source_version;
    // There are no real desktop projects older than v1. Future migrators are
    // registered here rather than guessing an unknown data layout.
    None
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub format_version: u32,
    pub database_schema_version: u32,
    pub project_id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionMarker {
    source_path: Option<PathBuf>,
    dirty: bool,
    requires_save_as: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSession {
    pub manifest: ProjectManifest,
    pub source_path: Option<String>,
    pub requires_save_as: bool,
    pub recovered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCandidate {
    pub manifest: ProjectManifest,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommandError {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Error)]
enum ProjectFileError {
    #[error("项目名称不能为空。")]
    EmptyProjectName,
    #[error("请选择 .fishtongue 项目文件。")]
    InvalidExtension,
    #[error("项目包包含不安全路径：{0}")]
    UnsafeArchivePath(String),
    #[error("项目包包含不支持的符号链接：{0}")]
    SymlinkEntry(String),
    #[error("项目包条目超过 {MAX_ARCHIVE_ENTRIES} 个。")]
    TooManyEntries,
    #[error("项目解压后超过 2 GiB 安全限制。")]
    ArchiveTooLarge,
    #[error("项目包缺少 {0}。")]
    MissingEntry(&'static str),
    #[error("项目包包含重复的 {0}。")]
    DuplicateEntry(&'static str),
    #[error("项目清单格式无效：{0}")]
    InvalidManifest(String),
    #[error("此项目由更高版本的 FishTongue 创建，请升级应用后再打开。")]
    FutureFormat,
    #[error("项目格式版本 {0} 尚未列入兼容表。")]
    UnsupportedFormat(u32),
    #[error("项目数据库文件无效。")]
    InvalidDatabase,
    #[error("当前项目尚未选择保存位置。")]
    SavePathRequired,
    #[error("项目文件不存在：{0}")]
    ProjectNotFound(String),
    #[error("文件操作失败：{0}")]
    Io(#[from] io::Error),
    #[error("ZIP 操作失败：{0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("JSON 操作失败：{0}")]
    Json(#[from] serde_json::Error),
    #[error("桌面路径操作失败：{0}")]
    Tauri(#[from] tauri::Error),
    #[error("项目路径必须包含父目录。")]
    MissingParent,
    #[error("无法安全替换项目文件：{0}")]
    ReplaceFailed(String),
}

impl From<ProjectFileError> for ProjectCommandError {
    fn from(error: ProjectFileError) -> Self {
        let code = match error {
            ProjectFileError::EmptyProjectName => "VALIDATION_FAILED",
            ProjectFileError::InvalidExtension => "UNSUPPORTED_FORMAT",
            ProjectFileError::UnsafeArchivePath(_)
            | ProjectFileError::SymlinkEntry(_)
            | ProjectFileError::TooManyEntries
            | ProjectFileError::ArchiveTooLarge
            | ProjectFileError::MissingEntry(_)
            | ProjectFileError::DuplicateEntry(_)
            | ProjectFileError::InvalidManifest(_)
            | ProjectFileError::InvalidDatabase => "CORRUPT_PROJECT",
            ProjectFileError::FutureFormat => "FUTURE_FORMAT",
            ProjectFileError::UnsupportedFormat(_) => "UNSUPPORTED_FORMAT",
            ProjectFileError::SavePathRequired => "SAVE_PATH_REQUIRED",
            ProjectFileError::ProjectNotFound(_) => "PROJECT_NOT_FOUND",
            ProjectFileError::ReplaceFailed(_) => "SAVE_FAILED",
            ProjectFileError::Io(_)
            | ProjectFileError::Zip(_)
            | ProjectFileError::Json(_)
            | ProjectFileError::Tauri(_)
            | ProjectFileError::MissingParent => "FILE_OPERATION_FAILED",
        };
        Self {
            code,
            message: error.to_string(),
        }
    }
}

#[tauri::command]
pub fn create_project_workspace(
    app: AppHandle,
    name: String,
    path: String,
) -> Result<ProjectSession, ProjectCommandError> {
    create_workspace(&app, name, normalize_project_path(path)).map_err(Into::into)
}

#[tauri::command]
pub fn open_project_archive(
    app: AppHandle,
    path: String,
) -> Result<ProjectSession, ProjectCommandError> {
    open_archive(&app, PathBuf::from(path), false).map_err(Into::into)
}

#[tauri::command]
pub fn import_project_archive(
    app: AppHandle,
    path: String,
) -> Result<ProjectSession, ProjectCommandError> {
    open_archive(&app, PathBuf::from(path), true).map_err(Into::into)
}

#[tauri::command]
pub fn mark_project_dirty(app: AppHandle) -> Result<(), ProjectCommandError> {
    let workspace = active_workspace(&app).map_err(ProjectCommandError::from)?;
    let mut marker = read_session_marker(&workspace).map_err(ProjectCommandError::from)?;
    marker.dirty = true;
    write_json(&workspace.join(SESSION_FILE), &marker).map_err(Into::into)
}

#[tauri::command]
pub fn save_project_archive(
    app: AppHandle,
    path: Option<String>,
) -> Result<ProjectSession, ProjectCommandError> {
    save_workspace(&app, path.map(normalize_project_path)).map_err(Into::into)
}

#[tauri::command]
pub fn inspect_project_recovery(
    app: AppHandle,
) -> Result<Option<RecoveryCandidate>, ProjectCommandError> {
    let workspace = active_workspace(&app).map_err(ProjectCommandError::from)?;
    if !workspace.exists() {
        return Ok(None);
    }
    let marker = match read_session_marker(&workspace) {
        Ok(marker) if marker.dirty => marker,
        _ => return Ok(None),
    };
    let manifest = read_manifest(&workspace).map_err(ProjectCommandError::from)?;
    Ok(Some(RecoveryCandidate {
        manifest,
        source_path: marker.source_path.map(path_to_string),
    }))
}

#[tauri::command]
pub fn recover_project_workspace(app: AppHandle) -> Result<ProjectSession, ProjectCommandError> {
    let workspace = active_workspace(&app).map_err(ProjectCommandError::from)?;
    let mut marker = read_session_marker(&workspace).map_err(ProjectCommandError::from)?;
    let manifest = read_manifest(&workspace).map_err(ProjectCommandError::from)?;
    marker.requires_save_as = true;
    marker.dirty = true;
    write_json(&workspace.join(SESSION_FILE), &marker).map_err(ProjectCommandError::from)?;
    Ok(session_from(manifest, marker, true))
}

#[tauri::command]
pub fn discard_project_workspace(app: AppHandle) -> Result<(), ProjectCommandError> {
    let workspace = active_workspace(&app).map_err(ProjectCommandError::from)?;
    if workspace.exists() {
        fs::remove_dir_all(workspace).map_err(ProjectFileError::from)?;
    }
    Ok(())
}

fn create_workspace(
    app: &AppHandle,
    name: String,
    target_path: PathBuf,
) -> Result<ProjectSession, ProjectFileError> {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return Err(ProjectFileError::EmptyProjectName);
    }
    require_project_extension(&target_path)?;
    let workspace = active_workspace(app)?;
    replace_with_empty_workspace(&workspace)?;
    create_container_directories(&workspace)?;

    let now = Utc::now().to_rfc3339();
    let manifest = ProjectManifest {
        format_version: FORMAT_VERSION,
        database_schema_version: DATABASE_SCHEMA_VERSION,
        project_id: Uuid::new_v4().to_string(),
        name,
        created_at: now.clone(),
        updated_at: now,
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
    };
    write_json(&workspace.join(MANIFEST_FILE), &manifest)?;
    let marker = SessionMarker {
        source_path: Some(target_path),
        dirty: true,
        requires_save_as: false,
    };
    write_json(&workspace.join(SESSION_FILE), &marker)?;
    Ok(session_from(manifest, marker, false))
}

fn open_archive(
    app: &AppHandle,
    source_path: PathBuf,
    imported: bool,
) -> Result<ProjectSession, ProjectFileError> {
    require_project_extension(&source_path)?;
    if !source_path.is_file() {
        return Err(ProjectFileError::ProjectNotFound(path_to_string(
            source_path,
        )));
    }

    let app_config = app.path().app_config_dir()?;
    fs::create_dir_all(&app_config)?;
    let staging = TempBuilder::new()
        .prefix("project-open-")
        .tempdir_in(&app_config)?;
    let manifest = extract_archive(&source_path, staging.path())?;
    validate_database_file(&staging.path().join(DATABASE_FILE))?;
    create_container_directories(staging.path())?;

    let workspace = active_workspace(app)?;
    replace_workspace(&workspace, staging.path())?;
    let marker = SessionMarker {
        source_path: Some(source_path),
        dirty: imported,
        requires_save_as: imported,
    };
    write_json(&workspace.join(SESSION_FILE), &marker)?;
    Ok(session_from(manifest, marker, false))
}

fn save_workspace(
    app: &AppHandle,
    requested_path: Option<PathBuf>,
) -> Result<ProjectSession, ProjectFileError> {
    let workspace = active_workspace(app)?;
    let mut marker = read_session_marker(&workspace)?;
    let target_path = match requested_path {
        Some(path) => path,
        None if marker.requires_save_as => return Err(ProjectFileError::SavePathRequired),
        None => marker
            .source_path
            .clone()
            .ok_or(ProjectFileError::SavePathRequired)?,
    };
    require_project_extension(&target_path)?;
    validate_database_file(&workspace.join(DATABASE_FILE))?;

    let mut manifest = read_manifest(&workspace)?;
    manifest.updated_at = Utc::now().to_rfc3339();
    manifest.app_version = env!("CARGO_PKG_VERSION").to_owned();
    manifest.database_schema_version = DATABASE_SCHEMA_VERSION;
    write_json(&workspace.join(MANIFEST_FILE), &manifest)?;

    if target_path.exists() {
        maybe_create_backup(app, &target_path, &manifest.project_id)?;
    }
    write_archive_safely(&workspace, &target_path)?;

    marker.source_path = Some(target_path);
    marker.dirty = false;
    marker.requires_save_as = false;
    write_json(&workspace.join(SESSION_FILE), &marker)?;
    Ok(session_from(manifest, marker, false))
}

fn active_workspace(app: &AppHandle) -> Result<PathBuf, ProjectFileError> {
    Ok(app.path().app_config_dir()?.join("active-project"))
}

fn normalize_project_path(path: String) -> PathBuf {
    let mut path = PathBuf::from(path);
    if path.extension().and_then(|extension| extension.to_str()) != Some("fishtongue") {
        path.set_extension("fishtongue");
    }
    path
}

fn require_project_extension(path: &Path) -> Result<(), ProjectFileError> {
    if path.extension().and_then(|extension| extension.to_str()) == Some("fishtongue") {
        Ok(())
    } else {
        Err(ProjectFileError::InvalidExtension)
    }
}

fn replace_with_empty_workspace(workspace: &Path) -> Result<(), ProjectFileError> {
    if workspace.exists() {
        fs::remove_dir_all(workspace)?;
    }
    fs::create_dir_all(workspace)?;
    Ok(())
}

fn replace_workspace(workspace: &Path, staging: &Path) -> Result<(), ProjectFileError> {
    let previous = workspace.with_extension("previous");
    if previous.exists() {
        fs::remove_dir_all(&previous)?;
    }
    if workspace.exists() {
        fs::rename(workspace, &previous)?;
    }
    if let Err(error) = copy_directory(staging, workspace) {
        if workspace.exists() {
            let _ = fs::remove_dir_all(workspace);
        }
        if previous.exists() {
            let _ = fs::rename(&previous, workspace);
        }
        return Err(error);
    }
    if previous.exists() {
        fs::remove_dir_all(previous)?;
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), ProjectFileError> {
    fs::create_dir_all(destination)?;
    for entry in WalkDir::new(source).min_depth(1) {
        let entry = entry.map_err(io::Error::other)?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(io::Error::other)?;
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(target)?;
        } else if entry.file_type().is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn create_container_directories(workspace: &Path) -> Result<(), ProjectFileError> {
    for directory in ["assets", "exports", "history"] {
        fs::create_dir_all(workspace.join(directory))?;
    }
    Ok(())
}

fn extract_archive(
    archive_path: &Path,
    destination: &Path,
) -> Result<ProjectManifest, ProjectFileError> {
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(ProjectFileError::TooManyEntries);
    }

    let mut total_size = 0_u64;
    let mut manifest_count = 0;
    let mut database_count = 0;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let name = entry.name().replace('\\', "/");
        let relative_path = safe_archive_path(&name)?;
        if is_symlink(&entry) {
            return Err(ProjectFileError::SymlinkEntry(name));
        }
        total_size = total_size
            .checked_add(entry.size())
            .ok_or(ProjectFileError::ArchiveTooLarge)?;
        if total_size > MAX_UNCOMPRESSED_SIZE {
            return Err(ProjectFileError::ArchiveTooLarge);
        }
        if relative_path == Path::new(MANIFEST_FILE) {
            manifest_count += 1;
        }
        if relative_path == Path::new(DATABASE_FILE) {
            database_count += 1;
        }
        let output_path = destination.join(&relative_path);
        if entry.is_dir() {
            fs::create_dir_all(output_path)?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(output_path)?;
            io::copy(&mut entry, &mut output)?;
            output.sync_all()?;
        }
    }
    match manifest_count {
        0 => return Err(ProjectFileError::MissingEntry(MANIFEST_FILE)),
        1 => {}
        _ => return Err(ProjectFileError::DuplicateEntry(MANIFEST_FILE)),
    }
    match database_count {
        0 => return Err(ProjectFileError::MissingEntry(DATABASE_FILE)),
        1 => {}
        _ => return Err(ProjectFileError::DuplicateEntry(DATABASE_FILE)),
    }
    read_manifest(destination)
}

fn safe_archive_path(name: &str) -> Result<PathBuf, ProjectFileError> {
    let path = Path::new(name);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(ProjectFileError::UnsafeArchivePath(name.to_owned()));
    }
    let mut components = path.components();
    let root = components
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .ok_or_else(|| ProjectFileError::UnsafeArchivePath(name.to_owned()))?;
    if !matches!(
        root,
        MANIFEST_FILE | DATABASE_FILE | "assets" | "exports" | "history"
    ) {
        return Err(ProjectFileError::UnsafeArchivePath(name.to_owned()));
    }
    Ok(path.to_path_buf())
}

fn is_symlink<R: Read>(entry: &zip::read::ZipFile<'_, R>) -> bool {
    entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
}

fn read_manifest(workspace: &Path) -> Result<ProjectManifest, ProjectFileError> {
    let path = workspace.join(MANIFEST_FILE);
    if !path.is_file() {
        return Err(ProjectFileError::MissingEntry(MANIFEST_FILE));
    }
    let manifest: ProjectManifest = serde_json::from_reader(File::open(path)?)
        .map_err(|error| ProjectFileError::InvalidManifest(error.to_string()))?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

fn validate_manifest(manifest: &ProjectManifest) -> Result<(), ProjectFileError> {
    if manifest.format_version > FORMAT_VERSION {
        return Err(ProjectFileError::FutureFormat);
    }
    if manifest.format_version != FORMAT_VERSION {
        let _registered_migrator = registered_migrator(manifest.format_version);
        return Err(ProjectFileError::UnsupportedFormat(manifest.format_version));
    }
    if manifest.project_id.trim().is_empty() || manifest.name.trim().is_empty() {
        return Err(ProjectFileError::InvalidManifest(
            "projectId 和 name 不能为空".to_owned(),
        ));
    }
    DateTime::parse_from_rfc3339(&manifest.created_at)
        .map_err(|error| ProjectFileError::InvalidManifest(error.to_string()))?;
    DateTime::parse_from_rfc3339(&manifest.updated_at)
        .map_err(|error| ProjectFileError::InvalidManifest(error.to_string()))?;
    Ok(())
}

fn validate_database_file(path: &Path) -> Result<(), ProjectFileError> {
    let mut file = File::open(path).map_err(|_| ProjectFileError::InvalidDatabase)?;
    let mut header = [0_u8; 16];
    file.read_exact(&mut header)
        .map_err(|_| ProjectFileError::InvalidDatabase)?;
    if &header != b"SQLite format 3\0" {
        return Err(ProjectFileError::InvalidDatabase);
    }
    Ok(())
}

fn write_archive_safely(workspace: &Path, target_path: &Path) -> Result<(), ProjectFileError> {
    let parent = target_path
        .parent()
        .ok_or(ProjectFileError::MissingParent)?;
    fs::create_dir_all(parent)?;
    let mut temporary = TempBuilder::new()
        .prefix(".fishtongue-save-")
        .tempfile_in(parent)?;
    write_archive(workspace, temporary.as_file_mut())?;
    temporary.as_file().sync_all()?;

    let validation_dir = TempBuilder::new()
        .prefix("project-validate-")
        .tempdir_in(parent)?;
    let manifest = extract_archive(temporary.path(), validation_dir.path())?;
    validate_manifest(&manifest)?;
    validate_database_file(&validation_dir.path().join(DATABASE_FILE))?;

    replace_file(temporary, target_path)
}

fn write_archive<W: Write + Seek>(workspace: &Path, writer: W) -> Result<(), ProjectFileError> {
    let mut archive = ZipWriter::new(writer);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    for entry in WalkDir::new(workspace).min_depth(1) {
        let entry = entry.map_err(io::Error::other)?;
        let relative = entry
            .path()
            .strip_prefix(workspace)
            .map_err(io::Error::other)?;
        if matches!(
            relative.to_str(),
            Some(SESSION_FILE | DATABASE_WAL_FILE | DATABASE_SHM_FILE)
        ) {
            continue;
        }
        let archive_name = relative.to_string_lossy().replace('\\', "/");
        if entry.file_type().is_dir() {
            archive.add_directory(format!("{archive_name}/"), options)?;
        } else if entry.file_type().is_file() {
            archive.start_file(archive_name, options)?;
            let mut input = File::open(entry.path())?;
            io::copy(&mut input, &mut archive)?;
        }
    }
    archive.finish()?;
    Ok(())
}

fn replace_file(temporary: NamedTempFile, target_path: &Path) -> Result<(), ProjectFileError> {
    let previous = target_path.with_file_name(format!(
        "{}.previous",
        target_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("project")
    ));
    if previous.exists() {
        fs::remove_file(&previous)?;
    }
    let had_target = target_path.exists();
    if had_target {
        fs::rename(target_path, &previous)?;
    }
    match temporary.persist(target_path) {
        Ok(_) => {
            if previous.exists() {
                fs::remove_file(previous)?;
            }
            Ok(())
        }
        Err(error) => {
            if had_target && previous.exists() {
                let _ = fs::rename(&previous, target_path);
            }
            Err(ProjectFileError::ReplaceFailed(error.error.to_string()))
        }
    }
}

fn maybe_create_backup(
    app: &AppHandle,
    source: &Path,
    project_id: &str,
) -> Result<(), ProjectFileError> {
    let backup_directory = app.path().app_data_dir()?.join("backups").join(project_id);
    fs::create_dir_all(&backup_directory)?;
    let mut backups = backup_files(&backup_directory)?;
    let should_create = backups
        .first()
        .and_then(|path| path.metadata().ok())
        .and_then(|metadata| metadata.modified().ok())
        .map(|modified| {
            DateTime::<Utc>::from(modified)
                < Utc::now() - Duration::minutes(BACKUP_INTERVAL_MINUTES)
        })
        .unwrap_or(true);
    if should_create {
        let backup_name = format!("{}.fishtongue", Utc::now().format("%Y%m%dT%H%M%S%.3fZ"));
        fs::copy(source, backup_directory.join(backup_name))?;
        backups = backup_files(&backup_directory)?;
    }
    prune_backups(backups)?;
    Ok(())
}

fn prune_backups(backups: Vec<PathBuf>) -> Result<(), ProjectFileError> {
    for obsolete in backups.into_iter().skip(BACKUP_LIMIT) {
        fs::remove_file(obsolete)?;
    }
    Ok(())
}

fn backup_files(directory: &Path) -> Result<Vec<PathBuf>, ProjectFileError> {
    let mut backups = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("fishtongue"))
        .collect::<Vec<_>>();
    backups.sort_by(|left, right| right.file_name().cmp(&left.file_name()));
    Ok(backups)
}

fn read_session_marker(workspace: &Path) -> Result<SessionMarker, ProjectFileError> {
    Ok(serde_json::from_reader(File::open(
        workspace.join(SESSION_FILE),
    )?)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), ProjectFileError> {
    let parent = path.parent().ok_or(ProjectFileError::MissingParent)?;
    fs::create_dir_all(parent)?;
    let mut temporary = TempBuilder::new().prefix(".json-").tempfile_in(parent)?;
    serde_json::to_writer_pretty(temporary.as_file_mut(), value)?;
    temporary.as_file_mut().write_all(b"\n")?;
    temporary.as_file().sync_all()?;
    replace_file(temporary, path)
}

fn session_from(
    manifest: ProjectManifest,
    marker: SessionMarker,
    recovered: bool,
) -> ProjectSession {
    ProjectSession {
        manifest,
        source_path: marker.source_path.map(path_to_string),
        requires_save_as: marker.requires_save_as,
        recovered,
    }
}

fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn manifest(format_version: u32) -> ProjectManifest {
        ProjectManifest {
            format_version,
            database_schema_version: 1,
            project_id: Uuid::new_v4().to_string(),
            name: "测试项目".to_owned(),
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
            app_version: "test".to_owned(),
        }
    }

    fn write_fake_database(path: &Path) {
        let mut file = File::create(path).unwrap();
        file.write_all(b"SQLite format 3\0").unwrap();
        file.write_all(&[0_u8; 84]).unwrap();
    }

    #[test]
    fn rejects_future_project_versions() {
        assert!(matches!(
            validate_manifest(&manifest(FORMAT_VERSION + 1)),
            Err(ProjectFileError::FutureFormat)
        ));
    }

    #[test]
    fn rejects_unknown_old_project_versions() {
        assert!(matches!(
            validate_manifest(&manifest(0)),
            Err(ProjectFileError::UnsupportedFormat(0))
        ));
    }

    #[test]
    fn archive_round_trip_preserves_manifest_and_database() {
        let source = tempfile::tempdir().unwrap();
        create_container_directories(source.path()).unwrap();
        write_json(&source.path().join(MANIFEST_FILE), &manifest(1)).unwrap();
        write_fake_database(&source.path().join(DATABASE_FILE));
        fs::write(source.path().join(DATABASE_WAL_FILE), b"temporary").unwrap();
        fs::write(source.path().join(DATABASE_SHM_FILE), b"temporary").unwrap();

        let mut bytes = Cursor::new(Vec::new());
        write_archive(source.path(), &mut bytes).unwrap();
        bytes.set_position(0);
        let archive_file = source.path().join("roundtrip.fishtongue");
        fs::write(&archive_file, bytes.into_inner()).unwrap();

        let destination = tempfile::tempdir().unwrap();
        let extracted = extract_archive(&archive_file, destination.path()).unwrap();
        assert_eq!(extracted.name, "测试项目");
        validate_database_file(&destination.path().join(DATABASE_FILE)).unwrap();
        assert!(!destination.path().join(DATABASE_WAL_FILE).exists());
        assert!(!destination.path().join(DATABASE_SHM_FILE).exists());
    }

    #[test]
    fn rejects_zip_path_traversal() {
        assert!(matches!(
            safe_archive_path("../project.db"),
            Err(ProjectFileError::UnsafeArchivePath(_))
        ));
        assert!(matches!(
            safe_archive_path("C:/project.db"),
            Err(ProjectFileError::UnsafeArchivePath(_))
        ));
    }

    #[test]
    fn rejects_unexpected_root_entries() {
        assert!(matches!(
            safe_archive_path("secret.txt"),
            Err(ProjectFileError::UnsafeArchivePath(_))
        ));
    }

    #[test]
    fn repeated_json_writes_replace_the_marker_without_losing_it() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(SESSION_FILE);
        let mut marker = SessionMarker {
            source_path: None,
            dirty: true,
            requires_save_as: false,
        };
        write_json(&path, &marker).unwrap();
        marker.requires_save_as = true;
        write_json(&path, &marker).unwrap();
        let stored: SessionMarker = serde_json::from_reader(File::open(path).unwrap()).unwrap();
        assert!(stored.requires_save_as);
    }

    #[test]
    fn failed_archive_validation_preserves_the_last_good_project() {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().join("safe.fishtongue");
        fs::write(&target, b"last-good-project").unwrap();
        let invalid_workspace = directory.path().join("invalid-workspace");
        fs::create_dir_all(&invalid_workspace).unwrap();
        write_json(
            &invalid_workspace.join(MANIFEST_FILE),
            &manifest(FORMAT_VERSION),
        )
        .unwrap();
        fs::write(invalid_workspace.join(DATABASE_FILE), b"not sqlite").unwrap();

        assert!(write_archive_safely(&invalid_workspace, &target).is_err());
        assert_eq!(fs::read(target).unwrap(), b"last-good-project");
    }

    #[test]
    fn backup_retention_keeps_only_the_ten_newest_files() {
        let directory = tempfile::tempdir().unwrap();
        for index in 0..12 {
            fs::write(
                directory
                    .path()
                    .join(format!("20260101T0000{index:02}Z.fishtongue")),
                index.to_string(),
            )
            .unwrap();
        }
        let backups = backup_files(directory.path()).unwrap();
        prune_backups(backups).unwrap();
        let remaining = backup_files(directory.path()).unwrap();
        assert_eq!(remaining.len(), BACKUP_LIMIT);
        assert_eq!(
            remaining.first().unwrap().file_name().unwrap(),
            "20260101T000011Z.fishtongue"
        );
        assert_eq!(
            remaining.last().unwrap().file_name().unwrap(),
            "20260101T000002Z.fishtongue"
        );
    }
}
