export type FishTongueErrorCode =
  | "VALIDATION_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "FUTURE_FORMAT"
  | "CORRUPT_PROJECT"
  | "MIGRATION_FAILED"
  | "READ_ONLY"
  | "SAVE_FAILED"
  | "SAVE_PATH_REQUIRED"
  | "RECOVERY_AVAILABLE"
  | "PROJECT_NOT_FOUND"
  | "FILE_OPERATION_FAILED"
  | "DATABASE_FAILED";

export class FishTongueError extends Error {
  constructor(
    public readonly code: FishTongueErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "FishTongueError";
  }
}

export function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new FishTongueError("VALIDATION_FAILED", `${label}不能为空。`);
  }
  return normalized;
}

