use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::blocking::{Client, Response};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, AppHandle, Manager, State};

const PROTOCOL_VERSION: u32 = 2;
const START_TIMEOUT: Duration = Duration::from_secs(10);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(2);
const VALIDATE_TIMEOUT: Duration = Duration::from_secs(5);
const RUN_TIMEOUT: Duration = Duration::from_secs(120);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexurgyStatus {
    state: EngineState,
    message: String,
    engine_version: Option<String>,
    protocol_version: Option<u32>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum EngineState {
    Stopped,
    Starting,
    Ready,
    Busy,
    Unavailable,
    Crashed,
}

#[derive(Debug, Serialize)]
pub struct LexurgyCommandError {
    code: &'static str,
    message: String,
}

impl LexurgyCommandError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadyHandshake {
    event: String,
    protocol_version: u32,
    port: u16,
    engine_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationInput {
    changes: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundChangeInput {
    changes: String,
    input_words: Vec<String>,
    trace_words: Vec<String>,
    start_at: Option<String>,
    stop_before: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InflectionInput {
    rules: Value,
    stems_and_categories: Vec<Value>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WordGenerationInput {
    profile_version: String,
    profile: Value,
    seed: Option<String>,
    concepts: Option<Vec<Value>>,
    candidates_per_concept: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EngineProgressEvent {
    sequence: u32,
    #[serde(rename = "type")]
    kind: &'static str,
    message: String,
}

struct EngineProcess {
    child: Child,
    endpoint: String,
    token: String,
    engine_version: String,
}

struct SupervisorInner {
    state: EngineState,
    process: Option<EngineProcess>,
    current_job_url: Option<String>,
}

pub struct LexurgySupervisor {
    inner: Mutex<SupervisorInner>,
    cancelled: AtomicBool,
}

impl Default for LexurgySupervisor {
    fn default() -> Self {
        Self {
            inner: Mutex::new(SupervisorInner {
                state: EngineState::Stopped,
                process: None,
                current_job_url: None,
            }),
            cancelled: AtomicBool::new(false),
        }
    }
}

impl LexurgySupervisor {
    fn status(&self) -> LexurgyStatus {
        let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
        if let Some(process) = inner.process.as_mut() {
            if process.child.try_wait().ok().flatten().is_some() {
                inner.process = None;
                inner.state = EngineState::Crashed;
            }
        }
        status_from(&inner)
    }

    fn ensure_ready(&self, app: &AppHandle) -> Result<LexurgyStatus, LexurgyCommandError> {
        {
            let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
            if matches!(inner.state, EngineState::Ready | EngineState::Busy)
                && inner.process.is_some()
            {
                return Ok(status_from(&inner));
            }
            inner.state = EngineState::Starting;
        }

        match start_engine_process(app) {
            Ok(process) => {
                let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
                inner.process = Some(process);
                inner.state = EngineState::Ready;
                Ok(status_from(&inner))
            }
            Err(error) => {
                let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
                inner.state = EngineState::Unavailable;
                Err(error)
            }
        }
    }

    fn connection(&self) -> Result<(String, String), LexurgyCommandError> {
        let inner = self.inner.lock().expect("lexurgy supervisor lock");
        inner
            .process
            .as_ref()
            .map(|process| (process.endpoint.clone(), process.token.clone()))
            .ok_or_else(|| LexurgyCommandError::new("START_FAILED", "Lexurgy 引擎尚未启动。"))
    }

    fn mark_busy(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
        self.inner.lock().expect("lexurgy supervisor lock").state = EngineState::Busy;
    }

    fn mark_ready(&self) {
        let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
        inner.state = if inner.process.is_some() {
            EngineState::Ready
        } else {
            EngineState::Crashed
        };
        inner.current_job_url = None;
    }

    fn terminate(&self) {
        let process = self
            .inner
            .lock()
            .expect("lexurgy supervisor lock")
            .process
            .take();
        if let Some(mut process) = process {
            let client = Client::builder().timeout(SHUTDOWN_TIMEOUT).build();
            if let Ok(client) = client {
                let _ = client
                    .post(format!("{}/shutdown", process.endpoint))
                    .bearer_auth(&process.token)
                    .send();
            }
            let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
            while Instant::now() < deadline {
                if process.child.try_wait().ok().flatten().is_some() {
                    break;
                }
                thread::sleep(Duration::from_millis(50));
            }
            if process.child.try_wait().ok().flatten().is_none() {
                kill_process_tree(process.child.id());
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
        let mut inner = self.inner.lock().expect("lexurgy supervisor lock");
        inner.state = EngineState::Stopped;
        inner.current_job_url = None;
    }

    fn cancel(&self) -> Result<(), LexurgyCommandError> {
        self.cancelled.store(true, Ordering::SeqCst);
        let (endpoint, token, job_url) = {
            let inner = self.inner.lock().expect("lexurgy supervisor lock");
            let process = inner.process.as_ref();
            (
                process.map(|value| value.endpoint.clone()),
                process.map(|value| value.token.clone()),
                inner.current_job_url.clone(),
            )
        };
        if let (Some(endpoint), Some(token), Some(job_url)) = (endpoint, token, job_url) {
            let client = Client::builder()
                .timeout(Duration::from_secs(2))
                .build()
                .map_err(|error| LexurgyCommandError::new("CANCELLED", error.to_string()))?;
            let url = absolute_job_url(&endpoint, &job_url);
            let _ = client.delete(url).bearer_auth(token).send();
        }
        // Lexurgy Core cannot prove that every rule stopped cooperatively.
        // Restarting after cancellation guarantees that no computation thread
        // survives and no cancelled task can affect a later preview.
        self.terminate();
        Ok(())
    }
}

fn status_from(inner: &SupervisorInner) -> LexurgyStatus {
    let process = inner.process.as_ref();
    LexurgyStatus {
        state: inner.state,
        message: match inner.state {
            EngineState::Stopped => "Lexurgy 将在首次使用时启动。",
            EngineState::Starting => "正在启动 Lexurgy…",
            EngineState::Ready => "Lexurgy 已就绪。",
            EngineState::Busy => "Lexurgy 正在处理预览任务。",
            EngineState::Unavailable => "Lexurgy 运行文件不可用。",
            EngineState::Crashed => "Lexurgy 意外退出，可以重新启动。",
        }
        .to_string(),
        engine_version: process.map(|value| value.engine_version.clone()),
        protocol_version: process.map(|_| PROTOCOL_VERSION),
    }
}

fn start_engine_process(app: &AppHandle) -> Result<EngineProcess, LexurgyCommandError> {
    let (java, jar) = resolve_engine_paths(app)?;
    let token = generate_token();
    let mut command = Command::new(&java);
    command
        .arg("-jar")
        .arg(&jar)
        .arg("host=127.0.0.1")
        .arg("port=0")
        .arg(format!("protocolVersion={PROTOCOL_VERSION}"))
        .arg(format!("authToken={token}"))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command.spawn().map_err(|error| {
        LexurgyCommandError::new(
            "START_FAILED",
            format!("无法启动 Lexurgy：{error}"),
        )
    })?;

    if let Some(stderr) = child.stderr.take() {
        let log_dir = app
            .path()
            .app_log_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("FishTongue/logs"));
        thread::spawn(move || write_rotating_log(stderr, &log_dir));
    }

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            terminate_child_immediately(&mut child);
            return Err(LexurgyCommandError::new(
                "START_FAILED",
                "无法读取 Lexurgy 启动握手。",
            ));
        }
    };
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout)
            .read_line(&mut line)
            .map(|_| line);
        let _ = sender.send(result);
    });
    let line = match receiver.recv_timeout(START_TIMEOUT) {
        Ok(Ok(line)) => line,
        Ok(Err(error)) => {
            terminate_child_immediately(&mut child);
            return Err(LexurgyCommandError::new("START_FAILED", error.to_string()));
        }
        Err(_) => {
            terminate_child_immediately(&mut child);
            return Err(LexurgyCommandError::new(
                "START_TIMEOUT",
                "Lexurgy 启动超时。",
            ));
        }
    };
    let handshake: ReadyHandshake = match serde_json::from_str(line.trim()) {
        Ok(handshake) => handshake,
        Err(_) => {
            terminate_child_immediately(&mut child);
            return Err(LexurgyCommandError::new(
                "START_FAILED",
                "Lexurgy 启动握手格式无效。",
            ));
        }
    };
    if handshake.event != "ready" || handshake.protocol_version != PROTOCOL_VERSION {
        terminate_child_immediately(&mut child);
        return Err(LexurgyCommandError::new(
            "PROTOCOL_MISMATCH",
            "Lexurgy 协议版本与 FishTongue 不兼容。",
        ));
    }
    let endpoint = format!("http://127.0.0.1:{}", handshake.port);
    if let Err(error) = health_check(&endpoint, &token) {
        terminate_child_immediately(&mut child);
        return Err(error);
    }
    Ok(EngineProcess {
        child,
        endpoint,
        token,
        engine_version: handshake.engine_version,
    })
}

fn terminate_child_immediately(child: &mut Child) {
    kill_process_tree(child.id());
    let _ = child.kill();
    let _ = child.wait();
}

fn resolve_engine_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf), LexurgyCommandError> {
    if let (Ok(java), Ok(jar)) = (
        std::env::var("FISHTONGUE_JAVA"),
        std::env::var("FISHTONGUE_ENGINE_JAR"),
    ) {
        return validate_engine_paths(PathBuf::from(java), PathBuf::from(jar));
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| LexurgyCommandError::new("START_FAILED", error.to_string()))?;
    let root = [
        resource_dir.join("lexurgy"),
        resource_dir.join("resources").join("lexurgy"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_dir())
    .unwrap_or_else(|| resource_dir.join("lexurgy"));
    let java = root.join("runtime").join("bin").join("javaw.exe");
    let jar = root.join("fishtongue-engine.jar");
    validate_engine_paths(java, jar)
}

fn validate_engine_paths(
    java: PathBuf,
    jar: PathBuf,
) -> Result<(PathBuf, PathBuf), LexurgyCommandError> {
    if !java.is_file() || !jar.is_file() {
        return Err(LexurgyCommandError::new(
            "START_FAILED",
            "安装包中的 Lexurgy 或 Java 运行文件缺失。",
        ));
    }
    // Tauri can return verbatim Windows paths (`\\?\C:\...`). The Java
    // launcher can open the JAR manifest through that path, but its class
    // loader then fails to resolve the manifest's Main-Class. Convert the
    // existing, validated paths to the regular Windows representation before
    // passing them across the process boundary.
    Ok((
        java_launcher_compatible_path(java),
        java_launcher_compatible_path(jar),
    ))
}

#[cfg(windows)]
fn java_launcher_compatible_path(path: PathBuf) -> PathBuf {
    let value = path.to_string_lossy();
    if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{unc}"));
    }
    if let Some(local) = value.strip_prefix(r"\\?\") {
        return PathBuf::from(local);
    }
    path
}

#[cfg(not(windows))]
fn java_launcher_compatible_path(path: PathBuf) -> PathBuf {
    path
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn health_check(endpoint: &str, token: &str) -> Result<(), LexurgyCommandError> {
    let response = Client::builder()
        .timeout(HEALTH_TIMEOUT)
        .build()
        .and_then(|client| {
            client
                .get(format!("{endpoint}/health"))
                .bearer_auth(token)
                .send()
        })
        .map_err(|error| LexurgyCommandError::new("START_FAILED", error.to_string()))?;
    if !response.status().is_success() {
        return Err(LexurgyCommandError::new(
            "UNAUTHORIZED",
            "Lexurgy 健康检查未通过。",
        ));
    }
    Ok(())
}

fn send_json(
    endpoint: &str,
    token: &str,
    path: &str,
    body: &Value,
    timeout: Duration,
) -> Result<Response, LexurgyCommandError> {
    Client::builder()
        .timeout(timeout)
        .build()
        .and_then(|client| {
            client
                .post(format!("{endpoint}{path}"))
                .bearer_auth(token)
                .json(body)
                .send()
        })
        .map_err(|error| {
            if error.is_timeout() {
                LexurgyCommandError::new("RUN_TIMEOUT", "Lexurgy 任务超时。")
            } else {
                LexurgyCommandError::new("SIDECAR_CRASHED", error.to_string())
            }
        })
}

fn response_json(response: Response) -> Result<Value, LexurgyCommandError> {
    let status = response.status();
    let body = response.text().map_err(|_| {
        LexurgyCommandError::new("SIDECAR_CRASHED", "Lexurgy 返回内容无法读取。")
    })?;
    serde_json::from_str(&body).map_err(|_| {
        let detail: String = body.trim().chars().take(200).collect();
        let message = if detail.is_empty() {
            "Lexurgy 返回了空响应。".to_string()
        } else {
            format!("Lexurgy 返回了无法解析的响应（HTTP {status}）：{detail}")
        };
        LexurgyCommandError::new(
            if status.is_client_error() {
                "INVALID_REQUEST"
            } else {
                "SIDECAR_CRASHED"
            },
            message,
        )
    })
}

fn absolute_job_url(endpoint: &str, job_url: &str) -> String {
    if job_url.starts_with("http://") {
        job_url.to_string()
    } else {
        format!("{endpoint}{job_url}")
    }
}

fn write_rotating_log(mut stderr: impl Read, log_dir: &Path) {
    let _ = fs::create_dir_all(log_dir);
    let current = log_dir.join("lexurgy.log");
    if current.metadata().map(|value| value.len()).unwrap_or(0) >= 2 * 1024 * 1024 {
        for index in (1..=4).rev() {
            let source = log_dir.join(format!("lexurgy.{index}.log"));
            let target = log_dir.join(format!("lexurgy.{}.log", index + 1));
            if source.exists() {
                let _ = fs::rename(source, target);
            }
        }
        let _ = fs::rename(&current, log_dir.join("lexurgy.1.log"));
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(current) {
        let _ = std::io::copy(&mut stderr, &mut file);
    }
}

#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x08000000)
        .status();
}

#[cfg(not(windows))]
fn kill_process_tree(_pid: u32) {}

#[tauri::command]
pub fn lexurgy_status(supervisor: State<'_, LexurgySupervisor>) -> LexurgyStatus {
    supervisor.status()
}

#[tauri::command]
pub fn lexurgy_ensure_ready(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
) -> Result<LexurgyStatus, LexurgyCommandError> {
    supervisor.ensure_ready(&app)
}

#[tauri::command]
pub fn lexurgy_validate(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
    input: ValidationInput,
) -> Result<Value, LexurgyCommandError> {
    supervisor.ensure_ready(&app)?;
    let (endpoint, token) = supervisor.connection()?;
    let response = send_json(
        &endpoint,
        &token,
        "/scv1/validate",
        &json!({ "changes": input.changes }),
        VALIDATE_TIMEOUT,
    )?;
    let success = response.status().is_success();
    let body = response_json(response)?;
    if success {
        Ok(json!({ "valid": true, "ruleNames": body["ruleNames"] }))
    } else {
        Ok(json!({ "valid": false, "issues": [body] }))
    }
}

#[tauri::command]
pub fn lexurgy_run(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
    input: SoundChangeInput,
    events: Channel<EngineProgressEvent>,
) -> Result<Value, LexurgyCommandError> {
    supervisor.ensure_ready(&app)?;
    supervisor.mark_busy();
    let result = run_sound_change(&supervisor, input, &events);
    supervisor.mark_ready();
    result
}

fn run_sound_change(
    supervisor: &LexurgySupervisor,
    input: SoundChangeInput,
    events: &Channel<EngineProgressEvent>,
) -> Result<Value, LexurgyCommandError> {
    let _ = events.send(EngineProgressEvent {
        sequence: 1,
        kind: "started",
        message: "Lexurgy 已开始处理。".into(),
    });
    let (endpoint, token) = supervisor.connection()?;
    let body = json!({
        "changes": input.changes,
        "inputWords": input.input_words,
        "traceWords": input.trace_words,
        "startAt": input.start_at,
        "stopBefore": input.stop_before,
        "allowPolling": true
    });
    let response = send_json(&endpoint, &token, "/scv1", &body, RUN_TIMEOUT)?;
    let status = response.status();
    let accepted = status.as_u16() == 202;
    let success = status.is_success();
    let mut result = response_json(response)?;
    if !success {
        return Err(LexurgyCommandError::new(
            "INVALID_REQUEST",
            result["message"]
                .as_str()
                .or_else(|| result["error"].as_str())
                .unwrap_or("Lexurgy 无法执行这组规则。"),
        ));
    }
    if accepted {
        let job_url = result["url"]
            .as_str()
            .ok_or_else(|| {
                LexurgyCommandError::new("SIDECAR_CRASHED", "Lexurgy 未返回任务地址。")
            })?
            .to_string();
        supervisor
            .inner
            .lock()
            .expect("lexurgy supervisor lock")
            .current_job_url = Some(job_url.clone());
        let _ = events.send(EngineProgressEvent {
            sequence: 2,
            kind: "polling",
            message: "任务仍在运行，可以取消。".into(),
        });
        let client = Client::builder()
            .timeout(HEALTH_TIMEOUT)
            .build()
            .map_err(|error| LexurgyCommandError::new("SIDECAR_CRASHED", error.to_string()))?;
        let deadline = Instant::now() + RUN_TIMEOUT;
        loop {
            if supervisor.cancelled.load(Ordering::SeqCst) {
                let _ = events.send(EngineProgressEvent {
                    sequence: 3,
                    kind: "cancelled",
                    message: "任务已取消。".into(),
                });
                return Err(LexurgyCommandError::new("CANCELLED", "任务已取消。"));
            }
            if Instant::now() >= deadline {
                return Err(LexurgyCommandError::new("RUN_TIMEOUT", "Lexurgy 任务超时。"));
            }
            thread::sleep(Duration::from_millis(100));
            let response = client
                .get(absolute_job_url(&endpoint, &job_url))
                .bearer_auth(&token)
                .send()
                .map_err(|error| {
                    LexurgyCommandError::new("SIDECAR_CRASHED", error.to_string())
                })?;
            result = response_json(response)?;
            match result["status"].as_str() {
                Some("working") => continue,
                Some("done") => {
                    result = result["result"].clone();
                    break;
                }
                Some("error") => {
                    return Err(LexurgyCommandError::new(
                        "INVALID_REQUEST",
                        result["result"]["message"]
                            .as_str()
                            .unwrap_or("Lexurgy 运行失败。"),
                    ));
                }
                _ => {
                    return Err(LexurgyCommandError::new(
                        "SIDECAR_CRASHED",
                        "Lexurgy 返回了未知任务状态。",
                    ));
                }
            }
        }
    }
    let _ = events.send(EngineProgressEvent {
        sequence: 3,
        kind: "completed",
        message: "音变预览完成。".into(),
    });
    Ok(normalize_sound_change_result(result))
}

fn normalize_sound_change_result(mut result: Value) -> Value {
    let Some(fields) = result.as_object_mut() else {
        return json!({
            "ruleNames": [],
            "outputWords": [],
            "intermediateWords": {},
            "traces": {},
            "errors": []
        });
    };
    fields
        .entry("ruleNames")
        .or_insert_with(|| json!([]));
    fields
        .entry("outputWords")
        .or_insert_with(|| json!([]));
    fields
        .entry("intermediateWords")
        .or_insert_with(|| json!({}));
    fields
        .entry("traces")
        .or_insert_with(|| json!({}));
    fields
        .entry("errors")
        .or_insert_with(|| json!([]));
    result
}

#[tauri::command]
pub fn lexurgy_inflect(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
    input: InflectionInput,
) -> Result<Value, LexurgyCommandError> {
    supervisor.ensure_ready(&app)?;
    supervisor.mark_busy();
    let result = (|| {
        let (endpoint, token) = supervisor.connection()?;
        let response = send_json(
            &endpoint,
            &token,
            "/inflectv1",
            &serde_json::to_value(input).map_err(|error| {
                LexurgyCommandError::new("INVALID_REQUEST", error.to_string())
            })?,
            RUN_TIMEOUT,
        )?;
        let success = response.status().is_success();
        let body = response_json(response)?;
        if success {
            Ok(body)
        } else {
            Err(LexurgyCommandError::new(
                "INVALID_REQUEST",
                body["message"].as_str().unwrap_or("屈折规则无效。"),
            ))
        }
    })();
    supervisor.mark_ready();
    result
}

#[tauri::command]
pub fn lexurgy_validate_wordgen(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
    input: WordGenerationInput,
) -> Result<Value, LexurgyCommandError> {
    supervisor.ensure_ready(&app)?;
    request_wordgen(
        &supervisor,
        "/wordgenv1/validate",
        json!({
            "profileVersion": input.profile_version,
            "profile": input.profile,
        }),
        VALIDATE_TIMEOUT,
    )
}

#[tauri::command]
pub fn lexurgy_generate_words(
    app: AppHandle,
    supervisor: State<'_, LexurgySupervisor>,
    input: WordGenerationInput,
) -> Result<Value, LexurgyCommandError> {
    supervisor.ensure_ready(&app)?;
    supervisor.mark_busy();
    let result = request_wordgen(
        &supervisor,
        "/wordgenv1/generate",
        json!({
            "profileVersion": input.profile_version,
            "profile": input.profile,
            "seed": input.seed,
            "concepts": input.concepts,
            "candidatesPerConcept": input.candidates_per_concept,
        }),
        RUN_TIMEOUT,
    );
    supervisor.mark_ready();
    result
}

fn request_wordgen(
    supervisor: &LexurgySupervisor,
    path: &str,
    body: Value,
    timeout: Duration,
) -> Result<Value, LexurgyCommandError> {
    let (endpoint, token) = supervisor.connection()?;
    let response = send_json(&endpoint, &token, path, &body, timeout)?;
    let success = response.status().is_success();
    let result = response_json(response)?;
    if success {
        Ok(result)
    } else {
        Err(LexurgyCommandError::new(
            "INVALID_REQUEST",
            result["error"]
                .as_str()
                .or_else(|| result["message"].as_str())
                .or_else(|| result["issues"][0]["message"].as_str())
                .unwrap_or("造词配置或输入无效。"),
        ))
    }
}

#[tauri::command]
pub fn lexurgy_cancel(
    supervisor: State<'_, LexurgySupervisor>,
) -> Result<(), LexurgyCommandError> {
    supervisor.cancel()
}

pub fn shutdown_lexurgy(supervisor: &LexurgySupervisor) {
    supervisor.terminate();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_has_256_bits_of_random_input() {
        assert_eq!(generate_token().len(), 43);
        assert_ne!(generate_token(), generate_token());
    }

    #[test]
    fn packaged_paths_must_both_exist() {
        let result = validate_engine_paths(
            PathBuf::from("missing-java.exe"),
            PathBuf::from("missing-engine.jar"),
        );
        assert_eq!(result.unwrap_err().code, "START_FAILED");
    }

    #[test]
    fn relative_poll_urls_are_forced_to_loopback_endpoint() {
        assert_eq!(
            absolute_job_url("http://127.0.0.1:49152", "/scv1/poll/test"),
            "http://127.0.0.1:49152/scv1/poll/test"
        );
    }

    #[test]
    fn sound_change_results_fill_optional_collections_before_ipc() {
        let result = normalize_sound_change_result(json!({
            "ruleNames": ["Raise"],
            "outputWords": ["eme"],
            "traces": { "ama": [{ "rule": "Raise", "output": "eme" }] }
        }));
        assert_eq!(result["ruleNames"], json!(["Raise"]));
        assert_eq!(result["outputWords"], json!(["eme"]));
        assert_eq!(result["intermediateWords"], json!({}));
        assert_eq!(result["errors"], json!([]));
    }

    #[cfg(windows)]
    #[test]
    fn java_launcher_paths_remove_verbatim_prefix_without_losing_unicode_or_spaces() {
        assert_eq!(
            java_launcher_compatible_path(PathBuf::from(
                r"\\?\C:\用户目录\Fish Tongue\fishtongue-engine.jar"
            )),
            PathBuf::from(r"C:\用户目录\Fish Tongue\fishtongue-engine.jar")
        );
        assert_eq!(
            java_launcher_compatible_path(PathBuf::from(
                r"\\?\UNC\server\共享目录\Fish Tongue\fishtongue-engine.jar"
            )),
            PathBuf::from(r"\\server\共享目录\Fish Tongue\fishtongue-engine.jar")
        );
    }
}
