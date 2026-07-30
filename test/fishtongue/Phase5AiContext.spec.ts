import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import ProjectAiContextBroker from "@/fishtongue/application/services/ProjectAiContextBroker";

const now = "2026-07-30T00:00:00Z";

describe("Phase 5 AI read-only context", () => {
  const project = {
    getSnapshot: () => ({
      project: { id: "project", name: "语言史项目" },
      languages: [
        { id: "source", projectId: "project", name: "祖语" },
        { id: "target", projectId: "project", name: "后代语" },
      ],
    }),
    listLexemes: async () => [],
  } as unknown as ProjectApplication;

  const history = {
    listStages: async () => [{
      id: "stage", languageId: "source", name: "古典期",
      kind: "historical_stage", documentationStatus: "recorded",
      storageMode: "inherited_delta", position: 1, visible: true,
      createdAt: now, updatedAt: now,
    }],
    resolveStage: async () => ({
      stage: { id: "stage", name: "古典期" },
      lineage: ["stage"],
      components: { lexicon: {}, morphemes: {}, wordgen: {} },
      warnings: [],
    }),
    listLanguageRelations: async () => [{
      id: "relation", projectId: "project", sourceLanguageId: "source",
      targetLanguageId: "target", kind: "genetic", isPrimary: true,
      confidence: "confirmed", notes: "", createdAt: now, updatedAt: now,
    }],
    listHistoricalEvents: async () => [{
      id: "event", projectId: "project", name: "迁徙",
      eventType: "migration", startLabel: "前 300", endLabel: "",
      description: "", position: 0, participants: [],
      createdAt: now, updatedAt: now,
    }],
    listEtymologyRelations: async () => [{
      id: "etymology", projectId: "project", targetLexemeId: "lexeme",
      kind: "borrowing", sourceForm: "ama", confidence: "probable",
      notes: "", createdAt: now, updatedAt: now,
    }],
  } as unknown as Phase5Application;

  it("includes stage data for a stage page without granting write access", async () => {
    const result = await new ProjectAiContextBroker(project, history).buildContext({
      ui: {
        route: "stages", pageTitle: "阶段管理", projectId: "project",
        projectName: "语言史项目", languageId: "source", languageName: "祖语",
      },
      scope: "page",
      allowExpansion: false,
    });

    expect(result.content.languageStages).toHaveLength(1);
    expect(result.content.selectedStageState).toBeDefined();
    expect(result.references.some((item) => item.type === "language_stage")).toBe(true);
  });

  it("includes genealogy, events, and etymology at project scope", async () => {
    const result = await new ProjectAiContextBroker(project, history).buildContext({
      ui: {
        route: "genealogy", pageTitle: "语言谱系", projectId: "project",
        projectName: "语言史项目",
      },
      scope: "project",
      allowExpansion: false,
    });

    expect(result.content.languageRelations).toHaveLength(1);
    expect(result.content.historicalEvents).toHaveLength(1);
    expect(result.content.etymologyRelations).toHaveLength(1);
    expect(result.references.map((item) => item.type)).toEqual(
      expect.arrayContaining(["language_relation", "historical_event", "etymology"])
    );
  });
});
