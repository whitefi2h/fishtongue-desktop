import ProjectSessionService from "@/fishtongue/application/services/ProjectSessionService";
import {
  DatabaseSessionPort,
  ProjectFilePort,
  RecentProjectStore,
} from "@/fishtongue/application/ports/ProjectPorts";
import {
  ProjectSession,
  RecentProject,
  RecoveryCandidate,
} from "@/fishtongue/domain/models";
import {
  MemoryEvolutionRepository,
  MemoryLanguageRepository,
  MemoryLexemeRepository,
  MemoryProjectRepository,
} from "@/fishtongue/testing/MemoryRepositories";

const session: ProjectSession = {
  manifest: {
    formatVersion: 1,
    databaseSchemaVersion: 1,
    projectId: "project-1",
    name: "测试项目",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    appVersion: "0.1.0-phase.1",
  },
  sourcePath: "C:\\projects\\test.fishtongue",
  requiresSaveAs: false,
  recovered: false,
};

class FakeFiles implements ProjectFilePort {
  dirtyMarks = 0;
  saves = 0;
  recovery: RecoveryCandidate | null = null;
  createProject = async () => clone(session);
  openProject = async () => clone(session);
  importProject = async () => ({ ...clone(session), requiresSaveAs: true });
  saveProject = async (path?: string) => {
    this.saves += 1;
    return { ...clone(session), sourcePath: path ?? session.sourcePath };
  };
  chooseSavePath = async () => "C:\\projects\\copy.fishtongue";
  markDirty = async () => { this.dirtyMarks += 1; };
  inspectRecovery = async () => this.recovery;
  recoverProject = async () => ({ ...clone(session), requiresSaveAs: true, recovered: true });
  discardWorkspace = async () => {};
}

class FakeDatabase implements DatabaseSessionPort {
  opened = false;
  open = async () => { this.opened = true; };
  close = async () => { this.opened = false; };
  select = async <T,>(query: string): Promise<T[]> =>
    (query.includes("integrity_check") ? [{ integrity_check: "ok" }] : []) as T[];
  execute = async () => 0;
}

class MemoryRecent implements RecentProjectStore {
  values: RecentProject[] = [];
  list = async () => this.values;
  remember = async (project: RecentProject) => { this.values = [project]; };
  remove = async (path: string) => { this.values = this.values.filter((item) => item.path !== path); };
}

function createService() {
  const files = new FakeFiles();
  const database = new FakeDatabase();
  const projects = new MemoryProjectRepository();
  const service = new ProjectSessionService(
    files,
    database,
    projects,
    new MemoryLanguageRepository(),
    new MemoryLexemeRepository(),
    new MemoryEvolutionRepository(),
    new MemoryRecent()
  );
  return { service, files, database, projects };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("ProjectSessionService", () => {
  it("creates, initializes and immediately saves a project", async () => {
    const { service, files, projects } = createService();
    const snapshot = await service.createProject("  测试项目  ");
    expect(snapshot?.dirty).toBe(false);
    expect(files.saves).toBe(1);
    expect(await projects.get("project-1")).toMatchObject({ name: "测试项目" });
  });

  it("allows unlimited languages without assigning language types", async () => {
    const { service } = createService();
    await service.createProject("测试项目");
    for (const name of ["祖语甲", "祖语乙", "后续语言甲", "后续语言乙"]) {
      await service.createLanguage(name);
    }
    const languages = await service.listLanguages();
    expect(languages.map((language) => language.name)).toEqual([
      "祖语甲", "祖语乙", "后续语言甲", "后续语言乙",
    ]);
    expect(languages.every((language) => !("type" in language))).toBe(true);
  });

  it("rejects a lexeme without a non-empty Sense", async () => {
    const { service } = createService();
    await service.createProject("测试项目");
    await expect(service.saveLexeme({
      id: "lexeme-1",
      languageId: "language-1",
      romanized: "ama",
      partOfSpeech: "名词",
      createdAt: session.manifest.createdAt,
      updatedAt: session.manifest.updatedAt,
      senses: [],
    })).rejects.toThrow("至少需要一个词义");
  });

  it("does not overwrite a recoverable workspace by opening another project", async () => {
    const { service, files } = createService();
    files.recovery = { manifest: session.manifest, sourcePath: session.sourcePath };
    await expect(service.openProject()).rejects.toThrow("请先选择");
  });
});
