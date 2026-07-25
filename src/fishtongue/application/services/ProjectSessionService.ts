import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import {
  DatabaseSessionPort,
  EvolutionRepository,
  InflectionRepository,
  LanguageRepository,
  LexemeRepository,
  ProjectFilePort,
  ProjectRepository,
  RecentProjectStore,
} from "@/fishtongue/application/ports/ProjectPorts";
import { requiredText } from "@/fishtongue/domain/errors";
import {
  Evolution,
  InflectionSystem,
  Language,
  Lexeme,
  Project,
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
} from "@/fishtongue/domain/models";
import { v4 as uuid } from "uuid";

const AUTO_SAVE_DELAY_MS = 3_000;

export default class ProjectSessionService implements ProjectApplication {
  private snapshot: ProjectSnapshot | null = null;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: ProjectFilePort,
    private readonly database: DatabaseSessionPort,
    private readonly projects: ProjectRepository,
    private readonly languages: LanguageRepository,
    private readonly lexemes: LexemeRepository,
    private readonly evolutions: EvolutionRepository,
    private readonly inflections: InflectionRepository,
    private readonly recentProjects: RecentProjectStore
  ) {}

  getSnapshot(): ProjectSnapshot | null {
    return this.snapshot;
  }

  async createProject(name: string): Promise<ProjectSnapshot | null> {
    const normalizedName = requiredText(name, "项目名称");
    await this.prepareForProjectSwitch();
    const session = await this.files.createProject(normalizedName);
    if (!session) return null;
    await this.database.open();
    const project: Project = {
      id: session.manifest.projectId,
      name: normalizedName,
      createdAt: session.manifest.createdAt,
      updatedAt: session.manifest.updatedAt,
    };
    await this.projects.upsert(project);
    this.snapshot = { session, project, languages: [], dirty: true };
    await this.files.markDirty();
    return this.saveProject();
  }

  async openProject(path?: string): Promise<ProjectSnapshot | null> {
    await this.prepareForProjectSwitch();
    const session = await this.files.openProject(path);
    return session ? this.loadSession(session) : null;
  }

  async importProject(path?: string): Promise<ProjectSnapshot | null> {
    await this.prepareForProjectSwitch();
    const session = await this.files.importProject(path);
    return session ? this.loadSession(session) : null;
  }

  async saveProject(): Promise<ProjectSnapshot> {
    const current = this.requireSnapshot();
    if (current.session.requiresSaveAs) {
      const saved = await this.saveProjectAs();
      return saved ?? current;
    }
    return this.enqueueSave(undefined);
  }

  async saveProjectAs(): Promise<ProjectSnapshot | null> {
    const current = this.requireSnapshot();
    const path = await this.files.chooseSavePath(current.project.name);
    return path ? this.enqueueSave(path) : null;
  }

  async closeProject(): Promise<void> {
    this.cancelAutoSave();
    if (this.snapshot?.dirty) {
      await this.saveProject();
      if (this.snapshot?.dirty) {
        throw new Error("项目尚未保存，已取消关闭。");
      }
    }
    await this.saveQueue;
    await this.database.close();
    await this.files.discardWorkspace();
    this.snapshot = null;
  }

  async recoverProject(): Promise<ProjectSnapshot> {
    if (this.snapshot) await this.closeProject();
    await this.database.close();
    return this.loadSession(await this.files.recoverProject());
  }

  async discardRecovery(): Promise<void> {
    await this.database.close();
    await this.files.discardWorkspace();
  }

  inspectRecovery(): Promise<RecoveryCandidate | null> {
    return this.files.inspectRecovery();
  }

  listRecentProjects(): Promise<RecentProject[]> {
    return this.recentProjects.list();
  }

  async listLanguages(): Promise<Language[]> {
    const current = this.requireSnapshot();
    const languages = await this.languages.list(current.project.id);
    this.snapshot = { ...current, languages };
    return languages;
  }

  async createLanguage(name: string): Promise<Language> {
    const current = this.requireSnapshot();
    const now = new Date().toISOString();
    const language: Language = {
      id: uuid(),
      projectId: current.project.id,
      name: requiredText(name, "语言名称"),
      createdAt: now,
      updatedAt: now,
    };
    await this.languages.create(language);
    await this.changed({
      ...current,
      languages: [...current.languages, language],
    });
    return language;
  }

  async renameLanguage(id: string, name: string): Promise<void> {
    const current = this.requireSnapshot();
    const normalizedName = requiredText(name, "语言名称");
    const updatedAt = new Date().toISOString();
    await this.languages.rename(id, normalizedName, updatedAt);
    await this.changed({
      ...current,
      languages: current.languages.map((language) =>
        language.id === id
          ? { ...language, name: normalizedName, updatedAt }
          : language
      ),
    });
  }

  async deleteLanguage(id: string): Promise<void> {
    const current = this.requireSnapshot();
    await this.languages.delete(id);
    await this.changed({
      ...current,
      languages: current.languages.filter((language) => language.id !== id),
    });
  }

  listLexemes(languageId: string): Promise<Lexeme[]> {
    this.requireSnapshot();
    return this.lexemes.list(languageId);
  }

  async saveLexeme(lexeme: Lexeme): Promise<void> {
    this.requireSnapshot();
    const romanized = requiredText(lexeme.romanized, "词形");
    if (!lexeme.senses.length) {
      throw new Error("词条至少需要一个词义。");
    }
    const senses = lexeme.senses.map((sense, position) => ({
      ...sense,
      definition: requiredText(sense.definition, "词义"),
      position,
    }));
    await this.lexemes.save({
      ...lexeme,
      romanized,
      senses,
      updatedAt: new Date().toISOString(),
    });
    await this.changed(this.requireSnapshot());
  }

  async deleteLexeme(id: string): Promise<void> {
    this.requireSnapshot();
    await this.lexemes.delete(id);
    await this.changed(this.requireSnapshot());
  }

  getEvolution(languageId: string): Promise<Evolution> {
    this.requireSnapshot();
    return this.evolutions.getOrCreate(languageId);
  }

  async saveEvolution(evolution: Evolution): Promise<void> {
    this.requireSnapshot();
    await this.evolutions.save({
      ...evolution,
      updatedAt: new Date().toISOString(),
      testWords: evolution.testWords.map((word, position) => ({
        ...word,
        word: word.word.trim(),
        position,
      })),
    });
    await this.changed(this.requireSnapshot());
  }

  getInflectionSystem(languageId: string): Promise<InflectionSystem> {
    this.requireSnapshot();
    return this.inflections.getOrCreate(languageId);
  }

  async saveInflectionSystem(system: InflectionSystem): Promise<void> {
    this.requireSnapshot();
    await this.inflections.save({
      ...system,
      rulesVersion: 1,
      updatedAt: new Date().toISOString(),
      testCases: system.testCases.map((testCase, position) => ({
        ...testCase,
        stem: requiredText(testCase.stem, "词干"),
        position,
      })),
    });
    await this.changed(this.requireSnapshot());
  }

  private async loadSession(session: ProjectSession): Promise<ProjectSnapshot> {
    await this.database.open();
    const project = await this.projects.get(session.manifest.projectId);
    if (!project) {
      await this.database.close();
      throw new Error("项目数据库缺少项目元数据，无法安全打开。");
    }
    const languages = await this.languages.list(project.id);
    this.snapshot = {
      session,
      project,
      languages,
      dirty: session.requiresSaveAs,
    };
    await this.rememberCurrent();
    return this.snapshot;
  }

  private async changed(next: ProjectSnapshot): Promise<void> {
    this.snapshot = { ...next, dirty: true, saveError: undefined };
    await this.files.markDirty();
    this.scheduleAutoSave();
  }

  private scheduleAutoSave(): void {
    this.cancelAutoSave();
    if (this.snapshot?.session.requiresSaveAs) return;
    this.autoSaveTimer = setTimeout(() => {
      void this.enqueueSave(undefined).catch((error) => {
        if (this.snapshot) {
          this.snapshot = {
            ...this.snapshot,
            dirty: true,
            saveError: error instanceof Error ? error.message : String(error),
          };
        }
      });
    }, AUTO_SAVE_DELAY_MS);
  }

  private enqueueSave(path?: string): Promise<ProjectSnapshot> {
    this.cancelAutoSave();
    const operation = this.saveQueue.then(async () => {
      await this.database.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      const [integrity] = await this.database.select<{ integrity_check: string }>(
        "PRAGMA integrity_check"
      );
      if (!integrity || integrity.integrity_check !== "ok") {
        throw new Error("SQLite 完整性检查失败，项目文件未被替换。");
      }
      const savedSession = await this.files.saveProject(path);
      if (!savedSession) throw new Error("保存操作已取消。");
      const current = this.requireSnapshot();
      this.snapshot = {
        ...current,
        session: savedSession,
        dirty: false,
        saveError: undefined,
      };
      await this.rememberCurrent();
      return this.snapshot;
    });
    this.saveQueue = operation.catch(() => undefined);
    return operation;
  }

  private async rememberCurrent(): Promise<void> {
    const current = this.requireSnapshot();
    if (!current.session.sourcePath) return;
    await this.recentProjects.remember({
      projectId: current.project.id,
      name: current.project.name,
      path: current.session.sourcePath,
      lastOpenedAt: new Date().toISOString(),
    });
  }

  private async prepareForProjectSwitch(): Promise<void> {
    if (!this.snapshot) {
      if (await this.files.inspectRecovery()) {
        throw new Error("发现可恢复项目，请先选择“恢复项目”或“丢弃”。");
      }
      return;
    }
    await this.closeProject();
  }

  private cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private requireSnapshot(): ProjectSnapshot {
    if (!this.snapshot) throw new Error("当前没有打开的项目。");
    return this.snapshot;
  }
}
