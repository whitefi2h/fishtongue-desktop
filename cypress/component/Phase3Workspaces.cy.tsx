import { WordGenerationEngine } from "@/fishtongue/application/ports/WordGenerationEngine";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import { GenerationBatch, Morpheme, ProjectSession } from "@/fishtongue/domain/models";
import { MorphemeWorkspace, WordGenerationWorkspace } from "@/fishtongue/ui/Phase3Workspaces";

const projectSession: ProjectSession = {
  manifest: {
    formatVersion: 1, databaseSchemaVersion: 3, projectId: "p1", name: "测试项目",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", appVersion: "0.3.0-phase.3",
  },
  sourcePath: "C:\\test.fishtongue", requiresSaveAs: false, recovered: false,
};

function fakeApplication() {
  const state: { morphemes: Morpheme[]; batches: GenerationBatch[]; committed: number } = {
    morphemes: [], batches: [], committed: 0,
  };
  const snapshot = {
    session: projectSession,
    project: { id: "p1", name: "测试项目", createdAt: "", updatedAt: "" },
    languages: [],
    dirty: false,
  };
  const app = {
    getSnapshot: () => snapshot,
    listMorphemes: async () => structuredClone(state.morphemes),
    saveMorpheme: async (value: Morpheme) => { state.morphemes = [structuredClone(value)]; },
    deleteMorpheme: async () => { state.morphemes = []; },
    listWordGenerationProfiles: async () => [],
    saveWordGenerationProfile: async () => {},
    deleteWordGenerationProfile: async () => {},
    listGenerationBatches: async () => structuredClone(state.batches),
    createGenerationBatch: async (value: GenerationBatch) => { state.batches.push(structuredClone(value)); },
    saveGenerationCandidate: async (batchId: string, candidate: GenerationBatch["candidates"][number]) => {
      const batch = state.batches.find((item) => item.id === batchId)!;
      batch.candidates = batch.candidates.map((item) => item.id === candidate.id ? structuredClone(candidate) : item);
    },
    commitGenerationBatch: async () => { state.committed += 1; },
    listLexiconBatchOperations: async () => [],
    undoLexiconBatchOperation: async () => {},
    listLexemes: async () => [],
    listConceptLists: async () => [],
    saveConceptList: async () => {},
    getInflectionSystem: async () => ({
      id: "i", languageId: "l1", rules: "", rulesVersion: 1, updatedAt: "", testCases: [],
    }),
    saveInflectionSystem: async () => {},
  } as unknown as ProjectApplication;
  return { app, state };
}

class TestWordEngine implements WordGenerationEngine {
  getStatus = async () => ({ state: "ready" as const, message: "ready" });
  ensureReady = this.getStatus;
  validateProfile = async () => ({ valid: true, issues: [] });
  generate = async (input: Parameters<WordGenerationEngine["generate"]>[0]) => ({
    algorithmVersion: "splitmix64-v1" as const,
    profileVersion: "wordgen-profile-v1" as const,
    seed: input.seed,
    candidates: input.concepts.flatMap((concept) =>
      Array.from({ length: input.candidatesPerConcept }, (_, candidateIndex) => ({
        conceptKey: concept.conceptKey, gloss: concept.gloss,
        romanized: `ka${candidateIndex}`, candidateIndex,
      }))
    ),
  });
}

describe("Phase 3 workspaces", () => {
  it("creates a real morpheme in the project application", () => {
    const { app, state } = fakeApplication();
    cy.mount(<MorphemeWorkspace application={app} languageId="l1" live onProjectChanged={() => {}} onStatus={() => {}} />);
    cy.contains("新建").click();
    cy.contains("label", "形式").find("input").type("na");
    cy.contains("label", "含义").find("input").type("施事者");
    cy.contains("保存语素").click().then(() => {
      expect(state.morphemes).to.have.length(1);
      expect(state.morphemes[0].form).to.equal("na");
    });
  });

  it("keeps generated candidates outside the dictionary until review", () => {
    const { app, state } = fakeApplication();
    const service = new WordGenerationService(new TestWordEngine());
    cy.mount(<WordGenerationWorkspace application={app} service={service} languageId="l1" dictionary={<p>词典正文</p>} onProjectChanged={() => {}} onStatus={() => {}} />);
    cy.contains("造词配置").click();
    cy.contains("生成新审核批次").click();
    cy.contains("候选审核").should("be.visible").then(() => {
      expect(state.batches).to.have.length(1);
      expect(state.committed).to.equal(0);
      expect(state.batches[0].status).to.equal("draft");
    });
  });
});
