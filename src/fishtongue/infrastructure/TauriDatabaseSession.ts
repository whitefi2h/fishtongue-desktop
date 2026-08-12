import { DatabaseSessionPort } from "@/fishtongue/application/ports/ProjectPorts";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

const ACTIVE_DATABASE_URL = "sqlite:active-project/project.db";

export default class TauriDatabaseSession implements DatabaseSessionPort {
  private database: Database | null = null;

  async open(): Promise<void> {
    await this.close();
    await invoke<number>("migrate_active_project_database");
    this.database = await Database.load(ACTIVE_DATABASE_URL);
    await this.database.execute("PRAGMA foreign_keys = ON");
  }

  async close(): Promise<void> {
    if (this.database) {
      await this.database.close();
      this.database = null;
    }
  }

  async select<T>(query: string, bindValues: unknown[] = []): Promise<T[]> {
    return this.requireDatabase().select<T[]>(query, bindValues);
  }

  async execute(query: string, bindValues: unknown[] = []): Promise<number> {
    const result = await this.requireDatabase().execute(query, bindValues);
    return result.rowsAffected;
  }

  private requireDatabase(): Database {
    if (!this.database) {
      throw new Error("项目数据库尚未打开。");
    }
    return this.database;
  }
}

