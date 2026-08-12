import {
  InflectionEngine,
  InflectionRunInput,
} from "@/fishtongue/application/ports/InflectionEngine";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import {
  EngineProgressEvent,
  LexurgyEngineStatus,
  SoundChangeEngine,
  SoundChangeRunInput,
  SoundChangeValidationInput,
} from "@/fishtongue/application/ports/SoundChangeEngine";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import { Evolution, InflectionSystem } from "@/fishtongue/domain/models";
import {
  EvolutionWorkspace,
  InflectionWorkspace,
} from "@/fishtongue/ui/EngineWorkspaces";

const evolution: Evolution = {
  id: "e1",
  languageId: "l1",
  soundChanges: "Raise:\na => e",
  updatedAt: "2026-01-01T00:00:00Z",
  testWords: [{ id: "w1", word: "ama", position: 0 }],
};

const inflection: InflectionSystem = {
  id: "i1",
  languageId: "l1",
  rules: "",
  rulesVersion: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  testCases: [{ id: "t1", stem: "ama", categories: {}, position: 0 }],
};

function application() {
  const state = { evolutionSaves: 0, inflectionSaves: 0 };
  const app = {
    getEvolution: async () => structuredClone(evolution),
    saveEvolution: async () => { state.evolutionSaves += 1; },
    listLexemes: async () => [{
      id: "x1", languageId: "l1", romanized: "nor", partOfSpeech: "noun",
      createdAt: "", updatedAt: "", senses: [{ id: "s1", definition: "sea", position: 0 }],
    }],
    getInflectionSystem: async () => structuredClone(inflection),
    saveInflectionSystem: async () => { state.inflectionSaves += 1; },
  } as unknown as ProjectApplication;
  return { app, state };
}

class TestSoundEngine implements SoundChangeEngine {
  getStatus = async (): Promise<LexurgyEngineStatus> => ({ state: "stopped", message: "尚未启动" });
  ensureReady = async (): Promise<LexurgyEngineStatus> => ({ state: "ready", message: "已就绪", engineVersion: "test" });
  validate = async (_: SoundChangeValidationInput) => ({ valid: true as const, ruleNames: ["Raise"] });
  run = async (
    input: SoundChangeRunInput,
    onEvent: (event: EngineProgressEvent) => void
  ) => {
    onEvent({ sequence: 1, type: "completed", message: "音变预览完成。" });
    return {
      ruleNames: ["Raise"],
      outputWords: input.inputWords.map(() => "eme"),
      intermediateWords: { Raise: ["eme"] },
      traces: { ama: [{ rule: "Raise", output: "eme" }] },
      errors: [],
    };
  };
}

class TestInflectionEngine implements InflectionEngine {
  getStatus = async (): Promise<LexurgyEngineStatus> => ({ state: "stopped", message: "尚未启动" });
  ensureReady = async (): Promise<LexurgyEngineStatus> => ({ state: "ready", message: "已就绪" });
  inflect = async (input: InflectionRunInput) => ({
    inflectedForms: input.stems.map((stem) => `${stem.value}s`),
  });
}

describe("Phase 2 engine workspaces", () => {
  it("validates and runs a read-only sound-change preview", () => {
    const { app } = application();
    cy.mount(<EvolutionWorkspace
      application={app}
      service={new SoundChangeService(new TestSoundEngine())}
      languageId="l1"
      live
    />);
    cy.contains("Lexurgy 音变规则").should("be.visible");
    cy.contains("button", "验证").click();
    cy.contains("验证通过：1 条规则", { timeout: 10_000 }).should("be.visible");
    cy.contains("button", "运行预览").click();
    cy.contains("只读预览结果").should("be.visible");
    cy.contains("td", "eme").should("be.visible");
    cy.contains("不会修改词典，也不会创建语言阶段").should("be.visible");
  });

  it("saves inflection inputs but keeps generated forms transient", () => {
    const { app, state } = application();
    cy.mount(<InflectionWorkspace
      application={app}
      service={new InflectionService(new TestInflectionEngine())}
      languageId="l1"
      live
    />);
    cy.contains("规则结构").should("be.visible");
    cy.get("textarea").clear().type("ama");
    cy.wait(700).then(() => expect(state.inflectionSaves).to.be.greaterThan(0));
    cy.contains("button", "运行预览").click();
    cy.contains("屈折结果").should("be.visible");
    cy.contains("td", "amas").should("be.visible");
    cy.contains("生成结果不会保存").should("be.visible");
  });

  it("does not access project data or start an engine in prototype mode", () => {
    const app = {
      getEvolution: () => { throw new Error("must not read"); },
      listLexemes: () => { throw new Error("must not read"); },
    } as unknown as ProjectApplication;
    cy.mount(<EvolutionWorkspace application={app} languageId="preview" live={false} />);
    cy.contains("音变功能需要真实项目").should("be.visible");
    cy.contains("引擎不会在原型模式启动").should("be.disabled");
  });

  it("fills an AI evolution proposal and waits for manual validation and save", () => {
    const { app, state } = application();
    cy.mount(<EvolutionWorkspace
      application={app}
      service={new SoundChangeService(new TestSoundEngine())}
      languageId="l1"
      live
      aiDraft={{
        requestId: "request-evolution",
        proposalId: "proposal-evolution",
        messageId: "message",
        kind: "evolution.update_draft",
        patch: { soundChanges: "Voicing:\np => b", testWords: [{ word: "apa" }] },
      }}
      onAiDraftConsumed={() => {}}
    />);
    cy.get(".cm-content").should("contain.text", "Voicing");
    cy.wait(700).then(() => expect(state.evolutionSaves).to.equal(0));
    cy.contains("button", "验证").click();
    cy.contains("button", "验证后保存").click().then(() => {
      expect(state.evolutionSaves).to.equal(1);
    });
  });

  it("fills an AI inflection proposal and waits for preview and manual save", () => {
    const { app, state } = application();
    cy.mount(<InflectionWorkspace
      application={app}
      service={new InflectionService(new TestInflectionEngine())}
      languageId="l1"
      live
      aiDraft={{
        requestId: "request-inflection",
        proposalId: "proposal-inflection",
        messageId: "message",
        kind: "inflection_system.update_draft",
        patch: {
          rules: { type: "suffix", form: "{stem}n" },
          testCases: [{ stem: "ama", categories: {} }],
        },
      }}
      onAiDraftConsumed={() => {}}
    />);
    cy.contains("AI 规则 JSON").should("be.visible");
    cy.wait(700).then(() => expect(state.inflectionSaves).to.equal(0));
    cy.contains("button", "运行预览").click();
    cy.contains("button", "预览后保存").should("not.be.disabled").click().then(() => {
      expect(state.inflectionSaves).to.equal(1);
    });
  });

  it("reviews forward evolution before writing only to the target stage", () => {
    const { app } = application();
    const now = "2026-07-30T00:00:00Z";
    let batch: import("@/fishtongue/domain/models").StageEvolutionBatch | undefined;
    let committed = false;
    const history = {
      listStages: async () => [
        {
          id: "source", languageId: "l1", name: "古典期", kind: "historical_stage",
          documentationStatus: "recorded", storageMode: "independent_snapshot",
          position: 1, visible: true, createdAt: now, updatedAt: now,
        },
        {
          id: "target", languageId: "l1", name: "后期", kind: "historical_stage",
          documentationStatus: "partial", storageMode: "inherited_delta",
          dataBaseStageId: "source", position: 2, visible: true,
          createdAt: now, updatedAt: now,
        },
      ],
      listStageEvolutionBatches: async () => batch ? [structuredClone(batch)] : [],
      listStageEvolutionOperations: async () => [],
      resolveStage: async (id: string) => ({
        stage: { id },
        lineage: [id],
        components: {
          lexicon: id === "source" ? {
            lexeme: {
              id: "lexeme", languageId: "l1", romanized: "ama",
              senses: [{ id: "sense", definition: "mother", position: 0 }],
            },
          } : {},
          morphemes: {},
          wordgen: {},
        },
        warnings: [],
      }),
      createStageEvolutionBatch: async (value: typeof batch) => { batch = structuredClone(value!); },
      saveStageEvolutionCandidate: async (_batchId: string, candidate: NonNullable<typeof batch>["candidates"][number]) => {
        batch!.candidates = batch!.candidates.map((item) =>
          item.id === candidate.id ? structuredClone(candidate) : item);
      },
      commitStageEvolutionBatch: async () => { committed = true; batch!.status = "committed"; },
    } as unknown as Phase5Application;

    cy.mount(<EvolutionWorkspace
      application={app}
      service={new SoundChangeService(new TestSoundEngine())}
      historyApplication={history}
      languageId="l1"
      selectedStageId="source"
      live
    />);
    cy.contains("button", "生成审核批次").click();
    cy.contains("td", "ama").should("be.visible");
    cy.get('input[aria-label="选择全部候选"]').check();
    cy.contains("button", "接受所选").click();
    cy.contains("td", "已接受").should("be.visible");
    cy.contains("button", "提交到目标阶段").click().then(() => {
      expect(committed).to.equal(true);
      expect(batch?.sourceStageId).to.equal("source");
      expect(batch?.targetStageId).to.equal("target");
    });
  });
});
