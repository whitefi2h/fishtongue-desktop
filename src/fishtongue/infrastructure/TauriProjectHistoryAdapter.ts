import { ProjectHistoryPort } from "@/fishtongue/application/ports/ProjectPorts";
import { ProjectOperationResult } from "@/fishtongue/domain/models";
import { invoke } from "@tauri-apps/api/core";

export default class TauriProjectHistoryAdapter implements ProjectHistoryPort {
  begin(input: {
    id: string;
    projectId: string;
    kind: string;
    summary: string;
    createdAt: string;
    coalesceKey?: string;
    coalesceSessionId?: string;
  }): Promise<void> {
    return invoke("begin_project_operation", { input });
  }

  complete(operationId: string): Promise<boolean> {
    return invoke("complete_project_operation", { operationId });
  }

  abort(operationId: string): Promise<void> {
    return invoke("abort_project_operation", { operationId });
  }

  undo(projectId: string, changedAt: string): Promise<ProjectOperationResult | null> {
    return invoke("undo_project_operation", { projectId, changedAt });
  }

  redo(projectId: string, changedAt: string): Promise<ProjectOperationResult | null> {
    return invoke("redo_project_operation", { projectId, changedAt });
  }

  recoverPending(): Promise<number> {
    return invoke("recover_pending_project_operations");
  }
}
