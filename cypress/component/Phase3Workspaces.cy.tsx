import { WordGenerationEngine } from "@/fishtongue/application/ports/WordGenerationEngine";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import { GenerationBatch, Lexeme, Morpheme, ProjectSession } from "@/fishtongue/domain/models";
import LexiconWorkspace from "@/fishtongue/ui/LexiconWorkspace";
import { MorphemeWorkspace, WordGenerationWorkspace } from "@/fishtongue/ui/Phase3Workspaces";

const projectSession: ProjectSession = {
  manifest: {
    formatVersion: 1, databaseSchemaVersion: 5, projectId: "p1", name: "测试项目",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", appVersion: "0.3.0-phase.3.2",
  },
  sourcePath: "C:\\test.fishtongue", requiresSaveAs: false, recovered: false,
};

function fakeApplication() {
  const state: {
    morphemes: Morpheme[];
    lexemes: Lexeme[];
    batches: GenerationBatch[];
    committed: number;
    profileSaves: number;
  } = {
    morphemes: [], lexemes: [], batches: [], committed: 0, profileSaves: 0,
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
    saveWordGenerationProfile: async () => { state.profileSaves += 1; },
    deleteWordGenerationProfile: async () => {},
    listGenerationBatches: async () => structuredClone(state.batches),
    createGenerationBatch: async (value: GenerationBatch) => { state.batches.push(structuredClone(value)); },
    saveGenerationCandidate: async (batchId: string, candidate: GenerationBatch["candidates"][number]) => {
      const batch = state.batches.find((item) => item.id === batchId)!;
      batch.candidates = batch.candidates.map((item) => item.id === candidate.id ? structuredClone(candidate) : item);
    },
    saveGenerationCandidates: async (batchId: string, candidates: GenerationBatch["candidates"]) => {
      const batch = state.batches.find((item) => item.id === batchId)!;
      const replacements = new Map(candidates.map((candidate) => [candidate.id, structuredClone(candidate)]));
      batch.candidates = batch.candidates.map((candidate) => replacements.get(candidate.id) ?? candidate);
    },
    commitGenerationBatch: async (batchId: string) => {
      const batch = state.batches.find((item) => item.id === batchId)!;
      batch.candidates = batch.candidates.map((candidate) =>
        candidate.status === "accepted"
          ? { ...candidate, status: "committed" }
          : candidate
      );
      batch.status = batch.candidates.every((candidate) => candidate.status === "committed")
        ? "committed"
        : "draft";
      state.committed += 1;
    },
    dismissGenerationBatch: async (batchId: string) => {
      state.batches = state.batches.filter((item) => item.id !== batchId);
    },
    listLexiconBatchOperations: async () => [],
    undoLexiconBatchOperation: async () => {},
    listLexemes: async () => structuredClone(state.lexemes),
    saveLexeme: async (value: Lexeme) => {
      state.lexemes = [...state.lexemes.filter((item) => item.id !== value.id), structuredClone(value)];
    },
    deleteLexeme: async (id: string) => {
      state.lexemes = state.lexemes.filter((item) => item.id !== id);
    },
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
        romanized: `${concept.conceptKey.replaceAll(":", "")}${candidateIndex}`, candidateIndex,
      }))
    ),
  });
}

class SlowWordEngine extends TestWordEngine {
  generate = async (
    _input: Parameters<WordGenerationEngine["generate"]>[0],
    signal?: AbortSignal
  ): ReturnType<WordGenerationEngine["generate"]> =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("任务已取消。")), {
        once: true,
      });
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

  it("keeps lexeme morphemes compact until the user searches for another one", () => {
    const { app, state } = fakeApplication();
    cy.viewport(1440, 900);
    state.morphemes = [
      morpheme("m1", "mar", "海洋"),
      morpheme("m2", "in", "形容词词缀", "suffix"),
    ];
    state.lexemes = [lexeme("l1", "marin", "海洋的", ["m1"])];

    cy.mount(<div style={{ containerName: "workspace", containerType: "inline-size", width: "100%" }}>
      <LexiconWorkspace application={app} languageId="l1" createRequest={0} onProjectChanged={() => {}} onStatus={() => {}} />
    </div>);
    cy.contains("已关联 1 个语素").scrollIntoView().should("be.visible");
    cy.contains("形容词词缀").should("not.exist");
    cy.contains("button", "添加语素").click();
    cy.get("input[aria-label='搜索语素']")
      .should("have.css", "border-top-width", "0px")
      .parent()
      .should("have.css", "display", "flex");
    cy.get("input[aria-label='搜索语素']").type("in");
    cy.contains("button", "in").click();
    cy.contains("已关联 2 个语素").should("be.visible");
    cy.get("button[aria-label='移除语素 in']").should("be.visible");
  });

  it("shows only selected source words until the user searches", () => {
    const { app, state } = fakeApplication();
    state.morphemes = [morpheme("m1", "in", "形容词词缀", "suffix")];
    state.lexemes = [
      lexeme("l1", "mar", "海洋"),
      lexeme("l2", "tal", "土地"),
    ];

    cy.mount(<MorphemeWorkspace application={app} languageId="l1" live onProjectChanged={() => {}} onStatus={() => {}} />);
    cy.contains("批量派生").click();
    cy.contains("尚未选择源词").should("be.visible");
    cy.contains("土地").should("not.exist");
    cy.contains("button", "添加源词").click();
    cy.get("input[aria-label='搜索源词']")
      .should("have.css", "border-top-width", "0px")
      .parent()
      .should("have.css", "display", "flex");
    cy.get("input[aria-label='搜索源词']").type("土地");
    cy.contains("button", "tal").click();
    cy.contains("已选择 1 个源词").should("be.visible");
    cy.get("button[aria-label='移除源词 tal']").should("be.visible");
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

  it("keeps unsubmitted candidates visible after committing accepted items", () => {
    const { app, state } = fakeApplication();
    const service = new WordGenerationService(new TestWordEngine());
    cy.mount(<WordGenerationWorkspace application={app} service={service} languageId="l1" dictionary={<p>词典正文</p>} onProjectChanged={() => {}} onStatus={() => {}} />);
    cy.contains("造词配置").click();
    cy.contains("生成新审核批次").click();
    cy.contains("候选审核").click();
    cy.get("button[aria-pressed]").contains("接受").first().click();
    cy.contains("button", "提交本次已接受项").click();
    cy.contains("已提交项已经进入词典").should("be.visible");
    cy.contains("button", "删除候选列表").should("be.visible");
    cy.wrap(null).then(() => {
      expect(state.committed).to.equal(1);
      expect(state.batches[0].candidates.some((candidate) => candidate.status === "pending")).to.equal(true);
    });

    cy.contains("button", "全部接受").click();
    cy.contains("button", "取消全选").should("be.visible").click();
    cy.contains("button", "全部接受").should("be.visible");
    cy.contains("button:not(:disabled)", "接受").first().click();
    cy.contains("button", "提交本次已接受项").click();
    cy.wrap(null).then(() => expect(state.committed).to.equal(2));
  });

  it("cancels a long generation without creating a partial review batch", () => {
    const { app, state } = fakeApplication();
    const service = new WordGenerationService(new SlowWordEngine());
    cy.mount(<WordGenerationWorkspace application={app} service={service} languageId="l1" dictionary={<p>词典正文</p>} onProjectChanged={() => {}} onStatus={() => {}} />);
    cy.contains("造词配置").click();
    cy.contains("生成新审核批次").click();
    cy.contains("button", "取消生成").should("be.visible").click();
    cy.contains("任务已取消").should("be.visible");
    cy.wrap(null).then(() => expect(state.batches).to.have.length(0));
  });

  it("fills a single AI lexeme proposal into the normal editor before saving", () => {
    const { app, state } = fakeApplication();
    cy.mount(<LexiconWorkspace
      application={app}
      languageId="l1"
      createRequest={0}
      onProjectChanged={() => {}}
      onStatus={() => {}}
      aiDraft={{
        requestId: "request-lexeme",
        proposalId: "proposal-lexeme",
        messageId: "message",
        kind: "lexeme.upsert",
        patch: {
          romanized: "kavira",
          ipa: "/ka.vi.ra/",
          partOfSpeech: "名词",
          senses: [{ definition: "星星" }],
        },
      }}
      onAiDraftConsumed={() => {}}
    />);
    cy.contains("label", "词形").find("input").should("have.value", "kavira");
    cy.contains("label", "IPA").find("input").should("have.value", "/ka.vi.ra/");
    cy.contains("label", "词义").find("textarea").should("have.value", "星星");
    cy.wrap(null).then(() => expect(state.lexemes).to.have.length(0));
    cy.get("button[form='lexeme-editor-form']").click();
    cy.get("body").then(($body) => {
      const alert = $body.find("[role='alert']");
      if (alert.length) throw new Error(alert.text());
    });
    cy.wait(100).then(() => {
      expect(state.lexemes).to.have.length(1);
      expect(state.lexemes[0].romanized).to.equal("kavira");
    });
  });

  it("fills AI morpheme and word-generation proposals into their normal forms", () => {
    const morphemeCase = fakeApplication();
    cy.mount(<MorphemeWorkspace
      application={morphemeCase.app}
      languageId="l1"
      live
      onProjectChanged={() => {}}
      onStatus={() => {}}
      aiDraft={{
        requestId: "request-morpheme",
        proposalId: "proposal-morpheme",
        messageId: "message",
        kind: "morpheme.upsert",
        patch: { form: "na", meaning: "施事者", type: "suffix" },
      }}
      onAiDraftConsumed={() => {}}
    />);
    cy.contains("label", "形式").find("input").should("have.value", "na");
    cy.wrap(null).then(() => expect(morphemeCase.state.morphemes).to.have.length(0));

    const profileCase = fakeApplication();
    cy.mount(<WordGenerationWorkspace
      application={profileCase.app}
      service={new WordGenerationService(new TestWordEngine())}
      languageId="l1"
      dictionary={<p>词典正文</p>}
      initialTab="profile"
      onProjectChanged={() => {}}
      onStatus={() => {}}
      aiDraft={{
        requestId: "request-profile",
        proposalId: "proposal-profile",
        messageId: "message",
        kind: "wordgen_profile.upsert",
        patch: {
          name: "AI 基础配置",
          config: {
            categories: [
              { name: "C", members: ["p", "t"] },
              { name: "V", members: ["a", "i"] },
            ],
            templates: [{ template: "C? V C?", weight: 1 }],
            syllableCounts: [{ min: 2, max: 2, weight: 1 }],
            forbiddenPatterns: [],
            rewriteRules: [],
            maxAttemptsPerCandidate: 100,
          },
        },
      }}
      onAiDraftConsumed={() => {}}
    />);
    cy.contains("label", "配置名称").find("input").should("have.value", "AI 基础配置");
    cy.wrap(null).then(() => expect(profileCase.state.profileSaves).to.equal(0));
    cy.contains("button", "验证并保存").click().then(() => {
      expect(profileCase.state.profileSaves).to.equal(1);
    });
  });
});

function morpheme(
  id: string,
  form: string,
  meaning: string,
  type: Morpheme["type"] = "root"
): Morpheme {
  return {
    id,
    languageId: "l1",
    form,
    type,
    meaning,
    applicablePartOfSpeech: "",
    status: "confirmed",
    compositionRule: { mode: "template", template: "{stem}{morpheme}" },
    notes: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function lexeme(id: string, romanized: string, definition: string, morphemeIds: string[] = []): Lexeme {
  return {
    id,
    languageId: "l1",
    romanized,
    ipa: "",
    partOfSpeech: "未分类",
    status: "draft",
    sourceType: "manual",
    notes: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    senses: [{ id: `${id}-sense`, definition, position: 0 }],
    morphemes: morphemeIds.map((morphemeId, position) => ({
      morphemeId,
      position,
      role: "composition",
    })),
  };
}
