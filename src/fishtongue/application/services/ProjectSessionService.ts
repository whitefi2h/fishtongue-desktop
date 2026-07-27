import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import {
  DatabaseSessionPort,
  ConceptListRepository,
  EvolutionRepository,
  GenerationBatchRepository,
  InflectionRepository,
  LanguageRepository,
  LexemeRepository,
  MorphemeRepository,
  ProjectFilePort,
  ProjectRepository,
  RecentProjectStore,
  WordGenerationProfileRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import { requiredText } from "@/fishtongue/domain/errors";
import {
  Evolution,
  ConceptList,
  GenerationBatch,
  GenerationCandidate,
  InflectionSystem,
  Language,
  LexiconBatchOperation,
  Lexeme,
  Morpheme,
  Project,
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
  WordGenerationProfile,
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
    private readonly morphemes: MorphemeRepository,
    private readonly generationProfiles: WordGenerationProfileRepository,
    private readonly conceptLists: ConceptListRepository,
    private readonly generationBatches: GenerationBatchRepository,
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

  async abandonProject(): Promise<void> {
    this.cancelAutoSave();
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
      ipa: lexeme.ipa.trim(),
      status: lexeme.status ?? "draft",
      sourceType: lexeme.sourceType ?? "manual",
      notes: lexeme.notes.trim(),
      senses,
      morphemes: lexeme.morphemes.map((value, position) => ({ ...value, position })),
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

  listMorphemes(languageId: string): Promise<Morpheme[]> {
    this.requireSnapshot();
    return this.morphemes.list(languageId);
  }

  async saveMorpheme(value: Morpheme): Promise<void> {
    this.requireSnapshot();
    await this.morphemes.save({
      ...value,
      form: requiredText(value.form, "语素形式"),
      meaning: requiredText(value.meaning, "语素含义"),
      applicablePartOfSpeech: value.applicablePartOfSpeech.trim(),
      notes: value.notes.trim(),
      updatedAt: new Date().toISOString(),
    });
    await this.changed(this.requireSnapshot());
  }

  async deleteMorpheme(id: string): Promise<void> {
    this.requireSnapshot();
    await this.morphemes.delete(id);
    await this.changed(this.requireSnapshot());
  }

  listWordGenerationProfiles(languageId: string): Promise<WordGenerationProfile[]> {
    this.requireSnapshot();
    return this.generationProfiles.list(languageId);
  }

  async saveWordGenerationProfile(value: WordGenerationProfile): Promise<void> {
    this.requireSnapshot();
    await this.generationProfiles.save({
      ...value,
      name: requiredText(value.name, "造词配置名称"),
      configVersion: "wordgen-profile-v1",
      updatedAt: new Date().toISOString(),
    });
    await this.changed(this.requireSnapshot());
  }

  async deleteWordGenerationProfile(id: string): Promise<void> {
    this.requireSnapshot();
    await this.generationProfiles.delete(id);
    await this.changed(this.requireSnapshot());
  }

  listConceptLists(): Promise<ConceptList[]> {
    const current = this.requireSnapshot();
    return this.conceptLists.list(current.project.id);
  }

  async saveConceptList(value: ConceptList): Promise<void> {
    const current = this.requireSnapshot();
    if (value.readonly) throw new Error("内置概念表不能修改。");
    await this.conceptLists.save({
      ...value,
      projectId: current.project.id,
      name: requiredText(value.name, "概念表名称"),
      concepts: value.concepts.map((concept, position) => ({
        ...concept,
        gloss: requiredText(concept.gloss, "概念"),
        position,
      })),
      updatedAt: new Date().toISOString(),
    });
    await this.changed(this.requireSnapshot());
  }

  async deleteConceptList(id: string): Promise<void> {
    this.requireSnapshot();
    await this.conceptLists.delete(id);
    await this.changed(this.requireSnapshot());
  }

  listGenerationBatches(languageId: string): Promise<GenerationBatch[]> {
    this.requireSnapshot();
    return this.generationBatches.list(languageId);
  }

  async createGenerationBatch(value: GenerationBatch): Promise<void> {
    this.requireSnapshot();
    if (!value.candidates.length) throw new Error("没有可审核的候选。");
    await this.generationBatches.create(value);
    await this.changed(this.requireSnapshot());
  }

  async saveGenerationCandidate(
    batchId: string,
    value: GenerationCandidate
  ): Promise<void> {
    this.requireSnapshot();
    const batch = await this.generationBatches.get(batchId);
    if (!batch) throw new Error("审核批次不存在。");
    const lexemes = await this.lexemes.list(batch.languageId);
    const folded = value.romanized.trim().normalize("NFC").toLocaleLowerCase();
    const conflicts: GenerationCandidate["conflicts"] = [];
    if (lexemes.some((lexeme) =>
      lexeme.romanized.normalize("NFC").toLocaleLowerCase() === folded
    )) {
      conflicts.push({ code: "DUPLICATE_LEXEME", message: "词典中已有相同词形。" });
    }
    if (batch.candidates.some((candidate) =>
      candidate.id !== value.id &&
      candidate.romanized.normalize("NFC").toLocaleLowerCase() === folded
    )) {
      conflicts.push({ code: "DUPLICATE_CANDIDATE", message: "本批次中存在相同词形。" });
    }
    await this.generationBatches.saveCandidate(batchId, {
      ...value,
      conflicts,
      gloss: requiredText(value.gloss, "候选释义"),
      romanized: requiredText(value.romanized, "候选词形"),
    });
    await this.changed(this.requireSnapshot());
  }

  async commitGenerationBatch(batchId: string): Promise<void> {
    this.requireSnapshot();
    const batch = await this.generationBatches.get(batchId);
    if (!batch) throw new Error("审核批次不存在。");
    const accepted = batch.candidates.filter((candidate) => candidate.status === "accepted");
    if (!accepted.length) throw new Error("至少接受一个候选后才能提交。");
    if (accepted.some((candidate) => candidate.conflicts.length > 0)) {
      throw new Error("已接受候选中仍有冲突，请先修改词形或取消接受。");
    }
    await this.generationBatches.commit(batchId, uuid(), new Date().toISOString());
    await this.changed(this.requireSnapshot());
  }

  async dismissGenerationBatch(batchId: string): Promise<void> {
    this.requireSnapshot();
    const batch = await this.generationBatches.get(batchId);
    if (!batch) throw new Error("审核批次不存在。");
    await this.generationBatches.dismiss(batchId, new Date().toISOString());
    await this.changed(this.requireSnapshot());
  }

  listLexiconBatchOperations(languageId: string): Promise<LexiconBatchOperation[]> {
    this.requireSnapshot();
    return this.generationBatches.listOperations(languageId);
  }

  async undoLexiconBatchOperation(operationId: string): Promise<void> {
    this.requireSnapshot();
    await this.generationBatches.undo(operationId, new Date().toISOString());
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
