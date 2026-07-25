export type LexurgyEngineState =
  | "stopped"
  | "starting"
  | "ready"
  | "busy"
  | "unavailable"
  | "crashed";

export interface LexurgyEngineStatus {
  state: LexurgyEngineState;
  message: string;
  engineVersion?: string;
  protocolVersion?: number;
}

export interface ValidationIssue {
  type: "parseError" | "invalidExpression" | "analysisError";
  message: string;
  lineNumber?: number;
  columnNumber?: number;
  rule?: string;
  expression?: string;
  expressionNumber?: number;
}

export type ValidationResult =
  | { valid: true; ruleNames: string[] }
  | { valid: false; issues: ValidationIssue[] };

export interface SoundChangeValidationInput {
  changes: string;
}

export interface SoundChangeRunInput {
  changes: string;
  inputWords: string[];
  traceWords: string[];
  startAt?: string;
  stopBefore?: string;
}

export interface EngineProgressEvent {
  sequence: number;
  type: "started" | "polling" | "completed" | "cancelled";
  message: string;
}

export interface SoundChangeWordError {
  message: string;
  rule?: string;
  originalWord?: string;
  currentWord?: string;
}

export interface SoundChangeRunResult {
  ruleNames: string[];
  outputWords: string[];
  intermediateWords: Record<string, string[]>;
  traces: Record<string, Array<{ rule: string; output: string }>>;
  errors: SoundChangeWordError[];
}

export interface SoundChangeEngine {
  getStatus(): Promise<LexurgyEngineStatus>;
  ensureReady(): Promise<LexurgyEngineStatus>;
  validate(input: SoundChangeValidationInput): Promise<ValidationResult>;
  run(
    input: SoundChangeRunInput,
    onEvent: (event: EngineProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<SoundChangeRunResult>;
}

export type LexurgyEngineErrorCode =
  | "START_FAILED"
  | "START_TIMEOUT"
  | "PROTOCOL_MISMATCH"
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "RUN_TIMEOUT"
  | "CANCELLED"
  | "SIDECAR_CRASHED"
  | "SHUTDOWN_FAILED";

export class LexurgyEngineError extends Error {
  constructor(
    readonly code: LexurgyEngineErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LexurgyEngineError";
  }
}
