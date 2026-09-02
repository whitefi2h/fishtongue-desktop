use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::{self, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const MAX_READY_BYTES: usize = 16 * 1024;
const ANALYSIS_STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const ANALYSIS_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct AnalysisRuntime {
    processes: Mutex<HashMap<String, u32>>,
    cancelled: Mutex<HashSet<String>>,
}

impl AnalysisRuntime {
    fn register(&self, request_id: &str, process_id: u32) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|_| "ANALYSIS_STATE")?;
        if processes.contains_key(request_id) {
            return Err("ANALYSIS_REQUEST_ALREADY_RUNNING".into());
        }
        processes.insert(request_id.to_owned(), process_id);
        Ok(())
    }

    fn finish(&self, request_id: &str) -> bool {
        if let Ok(mut processes) = self.processes.lock() {
            processes.remove(request_id);
        }
        self.cancelled
            .lock()
            .map(|mut values| values.remove(request_id))
            .unwrap_or(false)
    }

    fn cancel(&self, request_id: &str) -> Result<bool, String> {
        let process_id = self
            .processes
            .lock()
            .map_err(|_| "ANALYSIS_STATE")?
            .get(request_id)
            .copied();
        let Some(process_id) = process_id else {
            return Ok(false);
        };
        self.cancelled
            .lock()
            .map_err(|_| "ANALYSIS_STATE")?
            .insert(request_id.to_owned());
        terminate_process_tree(process_id);
        Ok(true)
    }

    fn shutdown(&self) {
        let process_ids = self
            .processes
            .lock()
            .map(|values| values.values().copied().collect::<Vec<_>>())
            .unwrap_or_default();
        for process_id in process_ids {
            terminate_process_tree(process_id);
        }
    }
}

fn run_analysis(
    app: &AppHandle,
    runtime: &AnalysisRuntime,
    request_id: String,
    method: &str,
    payload: Value,
) -> Result<Value, String> {
    let resource = app
        .path()
        .resource_dir()
        .map_err(|error| format!("ANALYSIS_PATH: {error}"))?;
    let executable = resolve_analysis_executable(&resource)?;

    let nonce = Uuid::new_v4().to_string();
    let mut child = Command::new(&executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|error| format!("ANALYSIS_START_FAILED: {error}"))?;
    if let Err(error) = runtime.register(&request_id, child.id()) {
        terminate_child(&mut child);
        return Err(error);
    }

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_child(&mut child);
            runtime.finish(&request_id);
            return Err("ANALYSIS_STDOUT".into());
        }
    };
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let ready = read_bounded_line(&mut reader, MAX_READY_BYTES);
        let ready_ok = ready.is_ok();
        let _ = sender.send(ready);
        if ready_ok {
            let _ = sender.send(read_bounded_line(&mut reader, MAX_RESPONSE_BYTES));
        }
    });

    let ready_line = match receiver.recv_timeout(ANALYSIS_STARTUP_TIMEOUT) {
        Ok(Ok(line)) => line,
        Ok(Err(error)) => {
            terminate_child(&mut child);
            let cancelled = runtime.finish(&request_id);
            return Err(if cancelled {
                "ANALYSIS_CANCELLED".into()
            } else {
                map_read_error("ANALYSIS_START_FAILED", error)
            });
        }
        Err(_) => {
            terminate_child(&mut child);
            let cancelled = runtime.finish(&request_id);
            return Err(if cancelled {
                "ANALYSIS_CANCELLED".into()
            } else {
                "ANALYSIS_START_TIMEOUT: PanPhon 分析组件启动超过 10 秒。".into()
            });
        }
    };
    if let Err(error) = validate_ready(&ready_line) {
        terminate_child(&mut child);
        runtime.finish(&request_id);
        return Err(error);
    }

    let request = json!({
        "protocolVersion": 1,
        "nonce": nonce,
        "method": method,
        "payload": payload
    });
    let write_result = child
        .stdin
        .as_mut()
        .ok_or("ANALYSIS_STDIN")
        .and_then(|stdin| writeln!(stdin, "{request}").map_err(|_| "ANALYSIS_WRITE_FAILED"));
    drop(child.stdin.take());
    if let Err(error) = write_result {
        terminate_child(&mut child);
        runtime.finish(&request_id);
        return Err(error.into());
    }

    let received = receiver.recv_timeout(ANALYSIS_TIMEOUT);
    let cancelled = runtime.finish(&request_id);
    if cancelled {
        let _ = child.wait();
        return Err("ANALYSIS_CANCELLED".into());
    }
    let line = match received {
        Ok(Ok(line)) => line,
        Ok(Err(error)) => {
            terminate_child(&mut child);
            return Err(map_read_error("ANALYSIS_READ_FAILED", error));
        }
        Err(_) => {
            terminate_child(&mut child);
            return Err("ANALYSIS_TIMEOUT: PanPhon 分析超过 60 秒。".into());
        }
    };
    let _ = child.wait();
    let response: Value = serde_json::from_str(&line).map_err(|_| "ANALYSIS_PROTOCOL_INVALID")?;
    if response.get("protocolVersion").and_then(Value::as_u64) != Some(1) {
        return Err("ANALYSIS_PROTOCOL_MISMATCH".into());
    }
    if response.get("nonce").and_then(Value::as_str) != Some(&nonce) {
        return Err("ANALYSIS_NONCE_MISMATCH".into());
    }
    if response.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(response
            .pointer("/error/code")
            .and_then(Value::as_str)
            .unwrap_or("ANALYSIS_FAILED")
            .to_owned());
    }
    response
        .get("result")
        .cloned()
        .ok_or_else(|| "ANALYSIS_RESULT_MISSING".into())
}

fn resolve_analysis_executable(resource_dir: &Path) -> Result<PathBuf, String> {
    [
        resource_dir
            .join("fishtongue-analysis")
            .join("fishtongue-analysis.exe"),
        resource_dir
            .join("resources")
            .join("fishtongue-analysis")
            .join("fishtongue-analysis.exe"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .ok_or_else(|| "ANALYSIS_MISSING: 安装包中缺少 PanPhon 分析组件。".into())
}

fn read_bounded_line<R: BufRead>(reader: &mut R, max_bytes: usize) -> io::Result<String> {
    let mut bytes = Vec::new();
    {
        let mut limited = reader.take(max_bytes as u64 + 1);
        limited.read_until(b'\n', &mut bytes)?;
    }
    if bytes.len() > max_bytes {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "ANALYSIS_OUTPUT_TOO_LARGE",
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "ANALYSIS_PROTOCOL_INVALID"))
}

fn map_read_error(prefix: &str, error: io::Error) -> String {
    match error.to_string().as_str() {
        "ANALYSIS_OUTPUT_TOO_LARGE" => "ANALYSIS_OUTPUT_TOO_LARGE".into(),
        "ANALYSIS_PROTOCOL_INVALID" => "ANALYSIS_PROTOCOL_INVALID".into(),
        _ => format!("{prefix}: {error}"),
    }
}

fn validate_ready(line: &str) -> Result<(), String> {
    let ready: Value = serde_json::from_str(line).map_err(|_| "ANALYSIS_HANDSHAKE_INVALID")?;
    if ready.get("event").and_then(Value::as_str) != Some("ready") {
        return Err("ANALYSIS_HANDSHAKE_INVALID".into());
    }
    if ready.get("protocolVersion").and_then(Value::as_u64) != Some(1) {
        return Err("ANALYSIS_PROTOCOL_MISMATCH".into());
    }
    Ok(())
}

fn terminate_child(child: &mut Child) {
    terminate_process_tree(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(windows)]
fn terminate_process_tree(process_id: u32) {
    let _ = Command::new("taskkill")
        .args(["/PID", &process_id.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn terminate_process_tree(_process_id: u32) {}

#[cfg(windows)]
trait HiddenProcess {
    fn creation_flags(&mut self, flags: u32) -> &mut Self;
}
#[cfg(windows)]
impl HiddenProcess for Command {
    fn creation_flags(&mut self, flags: u32) -> &mut Self {
        use std::os::windows::process::CommandExt;
        CommandExt::creation_flags(self, flags);
        self
    }
}
#[cfg(not(windows))]
trait HiddenProcess {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self;
}
#[cfg(not(windows))]
impl HiddenProcess for Command {
    fn creation_flags(&mut self, _flags: u32) -> &mut Self {
        self
    }
}

#[tauri::command]
pub fn analysis_validate_ipa(
    app: AppHandle,
    runtime: State<'_, AnalysisRuntime>,
    request_id: String,
    input: Value,
) -> Result<Value, String> {
    run_analysis(&app, runtime.inner(), request_id, "validate_ipa", input)
}

#[tauri::command]
pub fn analysis_validate_ipas(
    app: AppHandle,
    runtime: State<'_, AnalysisRuntime>,
    request_id: String,
    input: Value,
) -> Result<Value, String> {
    run_analysis(&app, runtime.inner(), request_id, "validate_ipas", input)
}

#[tauri::command]
pub fn analysis_describe_segments(
    app: AppHandle,
    runtime: State<'_, AnalysisRuntime>,
    request_id: String,
    input: Value,
) -> Result<Value, String> {
    run_analysis(
        &app,
        runtime.inner(),
        request_id,
        "describe_segments",
        input,
    )
}

#[tauri::command]
pub fn analysis_rank_segment_mappings(
    app: AppHandle,
    runtime: State<'_, AnalysisRuntime>,
    request_id: String,
    input: Value,
) -> Result<Value, String> {
    run_analysis(
        &app,
        runtime.inner(),
        request_id,
        "rank_segment_mappings",
        input,
    )
}

#[tauri::command]
pub fn analysis_cancel(
    runtime: State<'_, AnalysisRuntime>,
    request_id: String,
) -> Result<bool, String> {
    runtime.cancel(&request_id)
}

pub fn shutdown_analysis(runtime: &AnalysisRuntime) {
    runtime.shutdown();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn unknown_request_is_not_reported_as_cancelled() {
        let runtime = AnalysisRuntime::default();
        assert!(!runtime.cancel("missing").unwrap());
    }

    #[test]
    fn finish_removes_process_and_cancel_marker() {
        let runtime = AnalysisRuntime::default();
        runtime.register("request", 42).unwrap();
        runtime.cancelled.lock().unwrap().insert("request".into());
        assert!(runtime.finish("request"));
        assert!(runtime.processes.lock().unwrap().is_empty());
    }

    #[test]
    fn duplicate_registration_does_not_replace_running_process() {
        let runtime = AnalysisRuntime::default();
        runtime.register("request", 42).unwrap();
        assert_eq!(
            runtime.register("request", 99).unwrap_err(),
            "ANALYSIS_REQUEST_ALREADY_RUNNING"
        );
        assert_eq!(runtime.processes.lock().unwrap().get("request"), Some(&42));
    }

    #[test]
    fn validates_ready_handshake() {
        assert!(validate_ready(r#"{"event":"ready","protocolVersion":1}"#).is_ok());
        assert_eq!(
            validate_ready(r#"{"event":"ready","protocolVersion":2}"#).unwrap_err(),
            "ANALYSIS_PROTOCOL_MISMATCH"
        );
        assert_eq!(
            validate_ready(r#"{"event":"log","protocolVersion":1}"#).unwrap_err(),
            "ANALYSIS_HANDSHAKE_INVALID"
        );
    }

    #[test]
    fn resolves_tauri_nested_resource_layout() {
        let root = std::env::temp_dir().join(format!("fishtongue-analysis-{}", Uuid::new_v4()));
        let nested = root
            .join("resources")
            .join("fishtongue-analysis")
            .join("fishtongue-analysis.exe");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();
        fs::write(&nested, b"test").unwrap();
        assert_eq!(resolve_analysis_executable(&root).unwrap(), nested);
        fs::remove_dir_all(root).unwrap();
    }
}
