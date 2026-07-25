import { ProjectFilePort } from "@/fishtongue/application/ports/ProjectPorts";
import {
  ProjectSession,
  RecoveryCandidate,
} from "@/fishtongue/domain/models";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

const PROJECT_FILTER = [{ name: "FishTongue 项目", extensions: ["fishtongue"] }];

export default class TauriProjectFileAdapter implements ProjectFilePort {
  async createProject(
    name: string,
    selectedPath?: string
  ): Promise<ProjectSession | null> {
    const path =
      selectedPath ??
      (await save({
        title: "新建 FishTongue 项目",
        defaultPath: `${safeFileName(name)}.fishtongue`,
        filters: PROJECT_FILTER,
      }));
    return path
      ? invoke<ProjectSession>("create_project_workspace", { name, path })
      : null;
  }

  async openProject(selectedPath?: string): Promise<ProjectSession | null> {
    const path = selectedPath ?? (await this.chooseProject("打开 FishTongue 项目"));
    return path
      ? invoke<ProjectSession>("open_project_archive", { path })
      : null;
  }

  async importProject(selectedPath?: string): Promise<ProjectSession | null> {
    const path =
      selectedPath ?? (await this.chooseProject("导入受支持的 FishTongue 项目"));
    return path
      ? invoke<ProjectSession>("import_project_archive", { path })
      : null;
  }

  async saveProject(selectedPath?: string): Promise<ProjectSession | null> {
    return invoke<ProjectSession>("save_project_archive", {
      path: selectedPath ?? null,
    });
  }

  async chooseSavePath(name: string): Promise<string | null> {
    return save({
      title: "项目另存为",
      defaultPath: `${safeFileName(name)}.fishtongue`,
      filters: PROJECT_FILTER,
    });
  }

  async markDirty(): Promise<void> {
    await invoke("mark_project_dirty");
  }

  inspectRecovery(): Promise<RecoveryCandidate | null> {
    return invoke("inspect_project_recovery");
  }

  recoverProject(): Promise<ProjectSession> {
    return invoke("recover_project_workspace");
  }

  async discardWorkspace(): Promise<void> {
    await invoke("discard_project_workspace");
  }

  private async chooseProject(title: string): Promise<string | null> {
    const selected = await open({
      title,
      multiple: false,
      directory: false,
      filters: PROJECT_FILTER,
    });
    return typeof selected === "string" ? selected : null;
  }
}

function safeFileName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*]/g, "_") || "未命名项目";
}

