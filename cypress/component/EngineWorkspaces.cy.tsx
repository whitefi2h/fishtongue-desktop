import {
  InflectionEngine,
  InflectionRunInput,
} from "@/fishtongue/application/ports/InflectionEngine";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { EvolutionApplication } from "@/fishtongue/application/ports/EvolutionApplication";
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
    saveEvolution: async () => {
      state.evolutionSaves += 1;
    },
    listLexemes: async () => [
      {
        id: "x1",
        languageId: "l1",
        romanized: "nor",
        partOfSpeech: "noun",
        createdAt: "",
        updatedAt: "",
        senses: [{ id: "s1", definition: "sea", position: 0 }],
      },
    ],
    getInflectionSystem: async () => structuredClone(inflection),
    saveInflectionSystem: async () => {
      state.inflectionSaves += 1;
    },
  } as unknown as ProjectApplication;
  return { app, state };
}

class TestSoundEngine implements SoundChangeEngine {
  getStatus = async (): Promise<LexurgyEngineStatus> => ({
    state: "stopped",
    message: "尚未启动",
  });
  ensureReady = async (): Promise<LexurgyEngineStatus> => ({
    state: "ready",
    message: "已就绪",
    engineVersion: "test",
  });
  validate = async (_: SoundChangeValidationInput) => ({
    valid: true as const,
    ruleNames: ["Raise"],
  });
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
  getStatus = async (): Promise<LexurgyEngineStatus> => ({
    state: "stopped",
    message: "尚未启动",
  });
  ensureReady = async (): Promise<LexurgyEngineStatus> => ({
    state: "ready",
    message: "已就绪",
  });
  inflect = async (input: InflectionRunInput) => ({
    inflectedForms: input.stems.map((stem) => `${stem.value}s`),
  });
}

describe("Phase 2 engine workspaces", () => {
  it("validates and runs a read-only sound-change preview", () => {
    const { app } = application();
    cy.mount(
      <EvolutionWorkspace
        application={app}
        service={new SoundChangeService(new TestSoundEngine())}
        languageId="l1"
        live
      />
    );
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
    cy.mount(
      <InflectionWorkspace
        application={app}
        service={new InflectionService(new TestInflectionEngine())}
        languageId="l1"
        live
      />
    );
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
      getEvolution: () => {
        throw new Error("must not read");
      },
      listLexemes: () => {
        throw new Error("must not read");
      },
    } as unknown as ProjectApplication;
    cy.mount(
      <EvolutionWorkspace application={app} languageId="preview" live={false} />
    );
    cy.contains("音变功能需要真实项目").should("be.visible");
    cy.contains("引擎不会在原型模式启动").should("be.disabled");
  });

  it("opens the Phase 7.2 workbench with IPA input preflight", () => {
    cy.viewport(1280, 800);
    const plan = {
      id: "plan",
      languageId: "l1",
      name: "中古音变",
      description: "",
      sourceStageId: "source",
      inputMode: "phonological" as const,
      rulesDraft: "Raise:\na => e",
      testWords: [{ id: "test-word", word: "/kena/", position: 0 }],
      scope: {
        query: "",
        partOfSpeech: "",
        lexicalStatus: "all" as const,
        sourceType: "all" as const,
      },
      archived: false,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    const run = {
      id: "run",
      planVersionId: "version",
      sourceLanguageId: "l1",
      sourceStageId: "source",
      inputMode: "phonological" as const,
      status: "succeeded" as const,
      engineVersion: "test",
      engineHash: "hash",
      protocolVersion: "2",
      rulesHash: "rules",
      inputHash: "input",
      sourceStateHash: "source-state",
      sourcePhonology: {},
      summary: {
        total: 1,
        changed: 1,
        unchanged: 0,
        warnings: 0,
        errors: 0,
        notRun: 0,
      },
      errors: [],
      createdAt: "2026-01-02T00:00:00Z",
      completedAt: "2026-01-02T00:00:01Z",
    };
    const runItem = {
      id: "run-item",
      runId: run.id,
      sourceLexemeId: "with-ipa",
      sourceDisplayForm: "cena",
      sourcePhonologicalForm: "/kena/",
      engineInput: "kena",
      engineOutput: "tʃena",
      targetPhonologicalForm: "/tʃena/",
      inputOrigin: "stored" as const,
      status: "changed" as const,
      intermediate: {},
      trace: [],
      issues: [],
      position: 0,
    };
    let delivery = {
      id: "delivery",
      runId: run.id,
      targetType: "new_stage" as const,
      targetLanguageId: "l1",
      targetConfig: {
        name: "演化后阶段",
        newPhonemeCandidates: [
          {
            ipa: "tʃ",
            displaySymbol: "tʃ",
            category: "consonant",
            role: "phoneme",
            distribution: "_ e（来自规则“Raise”）",
            sourceRule: "Raise",
          },
        ],
        targetPhonemeOptions: [
          {
            id: "phoneme-k",
            ipa: "k",
            displaySymbol: "k",
            category: "consonant",
          },
        ],
      },
      targetStateHash: "target-state",
      status: "draft" as const,
      summary: { validationStatus: "checked", blocking: 1 },
      createdAt: "2026-01-02T00:01:00Z",
      updatedAt: "2026-01-02T00:01:00Z",
      items: [
        {
          id: "delivery-item",
          deliveryId: "delivery",
          runItemId: runItem.id,
          decision: "include" as const,
          targetPhonologicalForm: "/tʃena/",
          targetDisplayForm: "cena",
          orthographyResolution: "preserved" as const,
          homophoneAcknowledged: false,
          conflicts: [
            {
              code: "NEW_PHONEME:tʃ",
              severity: "error" as const,
              message: "目标音系尚未登记音位“tʃ”。",
              recovery: "配置新增音、修改目标 IPA，或跳过该词。",
            },
            {
              code: "TARGET_HOMOPHONE",
              severity: "error" as const,
              message: "目标词典中已有同音词，请明确确认。",
              recovery: "确认有意保留同音词，或修改目标 IPA。",
            },
          ],
          notes: "",
          position: 0,
        },
      ],
    };
    const phase72 = {
      listPlans: async () => [plan],
      getPlan: async () => plan,
      savePlan: async () => undefined,
      listVersions: async () => [],
      listRuns: async () => [run],
      getRun: async () => run,
      listRunItems: async () => [runItem],
      listDeliveries: async () => [delivery],
      getDelivery: async () => delivery,
      saveDeliveryDraft: async (value: typeof delivery) => {
        delivery = value;
      },
      commitDelivery: async () => {
        delivery = {
          ...delivery,
          status: "committed" as const,
          summary: { ...delivery.summary, validationStatus: "checked" as const },
        };
        return delivery;
      },
      getGraphData: async () => ({ nodes: [], edges: [], markers: [] }),
      validateDelivery: async (value: typeof delivery) => ({
        ...value,
        summary: {
          validationStatus: "checked",
          blocking: value.items[0].homophoneAcknowledged ? 0 : 1,
        },
        items: value.items.map((item) => ({
          ...item,
          conflicts: item.homophoneAcknowledged
            ? []
            : [
                {
                  code: "TARGET_HOMOPHONE",
                  severity: "error" as const,
                  message: "目标词典中已有同音词，请明确确认。",
                  recovery: "确认有意保留同音词，或修改目标 IPA。",
                },
              ],
        })),
      }),
      previewTestWords: async () => ({
        ruleNames: ["Raise"],
        items: [
          {
            source: "/kena/",
            engineInput: "kena",
            engineOutput: "tʃena",
            displayOutput: "/tʃena/",
            changed: true,
          },
        ],
      }),
      resolveInputs: async () => [
        {
          id: "with-ipa",
          languageId: "l1",
          romanized: "cena",
          ipa: "/kena/",
          partOfSpeech: "noun",
          status: "confirmed",
          sourceType: "manual",
          evolutionSourceType: "manual",
          selected: true,
          notes: "",
          createdAt: "",
          updatedAt: "",
          senses: [{ id: "sense-1", definition: "meal", position: 0 }],
          morphemes: [],
        },
        {
          id: "missing",
          languageId: "l1",
          romanized: "pata",
          ipa: "",
          partOfSpeech: "noun",
          status: "draft",
          sourceType: "manual",
          evolutionSourceType: "borrowing",
          selected: true,
          notes: "",
          createdAt: "",
          updatedAt: "",
          senses: [{ id: "sense-2", definition: "stone", position: 0 }],
          morphemes: [],
        },
      ],
      endPlanEditSession: () => {},
    } as unknown as EvolutionApplication;
    const history = {
      listStages: async () => [
        {
          id: "source",
          languageId: "l1",
          name: "古典期",
          kind: "historical_stage",
          documentationStatus: "recorded",
          storageMode: "independent_snapshot",
          startLabel: "",
          endLabel: "",
          position: 1,
          visible: true,
          createdAt: "",
          updatedAt: "",
        },
      ],
    } as unknown as Phase5Application;
    const app = {
      getSnapshot: () => ({ project: { id: "p" }, languages: [] }),
    } as unknown as ProjectApplication;
    cy.mount(
      <EvolutionWorkspace
        application={app}
        evolutionApplication={phase72}
        historyApplication={history}
        languageId="l1"
        live
      />
    );
    cy.contains("方案与历史").should("be.visible");
    cy.contains("IPA 音系模式").should("be.visible");
    cy.contains("button", "复制").should("be.visible");
    cy.contains("button", "归档").should("be.visible");
    cy.contains("button", "删除").should("be.visible");
    cy.contains("button", "运行").should("be.visible");
    cy.contains("正式词典输入").should("be.visible");
    cy.contains("button", "试跑测试词").click();
    cy.contains("临时试跑结果").should("be.visible");
    cy.contains("/tʃena/").should("be.visible");
    cy.contains("button", "全选").should("be.visible");
    cy.get('[aria-label="来源类型筛选"]').select("借词");
    cy.contains("pata").should("be.visible");
    cy.contains("cena").should("not.exist");
    cy.get('[aria-label="来源类型筛选"]').select("全部来源");
    cy.contains("缺少 IPA").should("be.visible");
    cy.get('[aria-label="收起方案侧栏"]')
      .click()
      .should("have.attr", "aria-label", "展开方案侧栏");
    cy.get('[aria-label="pata 的临时 IPA"]')
      .scrollIntoView()
      .should("be.visible");
    cy.get('[aria-label="展开方案侧栏"]').click();
    cy.contains("button", "1 变化").click();
    cy.get("main").should("have.css", "margin-top", "0px");
    cy.contains("button", "新历史阶段").click();
    cy.contains("2 个问题阻止提交").should("be.visible");
    cy.contains("button", "配置 1 个新增音").click();
    cy.get('[role="dialog"][aria-labelledby="phoneme-config-title"]')
      .should("be.visible")
      .and("have.focus");
    cy.contains("配置 1 个新增音").should("be.visible");
    cy.get('select[name="evolution-phoneme-role-tʃ"]').select("音位变体");
    cy.get('select[name="evolution-phoneme-parent-tʃ"]').select("k /k/");
    cy.get('input[name="evolution-phoneme-distribution-tʃ"]')
      .should("have.value", "_ e（来自规则“Raise”）")
      .clear()
      .type("_ e");
    cy.contains("button", "保存配置并重新检查").click();
    cy.get('[role="dialog"][aria-labelledby="phoneme-config-title"]').should(
      "not.exist"
    );
    cy.contains("1 个问题阻止提交").should("be.visible");
    cy.contains("允许该词与其他词同音").should("be.visible");
    cy.get('input[name="delivery-homophone-delivery-item"]')
      .should("have.css", "width", "14px")
      .check();
    cy.contains("需要重新检查").should("be.visible");
    cy.contains("button", "正式提交").should("be.disabled");
    cy.contains("button", "重新检查").click();
    cy.contains("检查通过，可以正式提交").should("be.visible");
    cy.contains("button", "正式提交").should("not.be.disabled");
    cy.contains("button", "正式提交").click();
    cy.contains("已正式提交").should("be.visible");
    cy.contains("检查通过，可以正式提交").should("not.exist");
    cy.contains("button", "中古音变").click();
    cy.contains("演化方案草稿").should("be.visible");
    cy.contains("临时试跑结果").should("be.visible");
  });

  it("fills an AI evolution proposal and waits for manual validation and save", () => {
    const { app, state } = application();
    cy.mount(
      <EvolutionWorkspace
        application={app}
        service={new SoundChangeService(new TestSoundEngine())}
        languageId="l1"
        live
        aiDraft={{
          requestId: "request-evolution",
          proposalId: "proposal-evolution",
          messageId: "message",
          kind: "evolution.update_draft",
          patch: {
            soundChanges: "Voicing:\np => b",
            testWords: [{ word: "apa" }],
          },
        }}
        onAiDraftConsumed={() => {}}
      />
    );
    cy.get(".cm-content").should("contain.text", "Voicing");
    cy.wait(700).then(() => expect(state.evolutionSaves).to.equal(0));
    cy.contains("button", "验证").click();
    cy.contains("button", "验证后保存")
      .click()
      .then(() => {
        expect(state.evolutionSaves).to.equal(1);
      });
  });

  it("fills an AI inflection proposal and waits for preview and manual save", () => {
    const { app, state } = application();
    cy.mount(
      <InflectionWorkspace
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
      />
    );
    cy.contains("AI 规则 JSON").should("be.visible");
    cy.wait(700).then(() => expect(state.inflectionSaves).to.equal(0));
    cy.contains("button", "运行预览").click();
    cy.contains("button", "预览后保存")
      .should("not.be.disabled")
      .click()
      .then(() => {
        expect(state.inflectionSaves).to.equal(1);
      });
  });

  it("reviews forward evolution before writing only to the target stage", () => {
    const { app } = application();
    const now = "2026-07-30T00:00:00Z";
    let batch:
      | import("@/fishtongue/domain/models").StageEvolutionBatch
      | undefined;
    let committed = false;
    const history = {
      listStages: async () => [
        {
          id: "source",
          languageId: "l1",
          name: "古典期",
          kind: "historical_stage",
          documentationStatus: "recorded",
          storageMode: "independent_snapshot",
          position: 1,
          visible: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "target",
          languageId: "l1",
          name: "后期",
          kind: "historical_stage",
          documentationStatus: "partial",
          storageMode: "inherited_delta",
          dataBaseStageId: "source",
          position: 2,
          visible: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      listStageEvolutionBatches: async () =>
        batch ? [structuredClone(batch)] : [],
      listStageEvolutionOperations: async () => [],
      resolveStage: async (id: string) => ({
        stage: { id },
        lineage: [id],
        components: {
          lexicon:
            id === "source"
              ? {
                  lexeme: {
                    id: "lexeme",
                    languageId: "l1",
                    romanized: "ama",
                    senses: [
                      { id: "sense", definition: "mother", position: 0 },
                    ],
                  },
                }
              : {},
          morphemes: {},
          wordgen: {},
        },
        warnings: [],
      }),
      createStageEvolutionBatch: async (value: typeof batch) => {
        batch = structuredClone(value!);
      },
      saveStageEvolutionCandidate: async (
        _batchId: string,
        candidate: NonNullable<typeof batch>["candidates"][number]
      ) => {
        batch!.candidates = batch!.candidates.map((item) =>
          item.id === candidate.id ? structuredClone(candidate) : item
        );
      },
      commitStageEvolutionBatch: async () => {
        committed = true;
        batch!.status = "committed";
      },
    } as unknown as Phase5Application;

    cy.mount(
      <EvolutionWorkspace
        application={app}
        service={new SoundChangeService(new TestSoundEngine())}
        historyApplication={history}
        languageId="l1"
        selectedStageId="source"
        live
      />
    );
    cy.contains("button", "生成审核批次").click();
    cy.contains("td", "ama").should("be.visible");
    cy.get('input[aria-label="选择全部候选"]').check();
    cy.contains("button", "接受所选").click();
    cy.contains("td", "已接受").should("be.visible");
    cy.contains("button", "提交到目标阶段")
      .click()
      .then(() => {
        expect(committed).to.equal(true);
        expect(batch?.sourceStageId).to.equal("source");
        expect(batch?.targetStageId).to.equal("target");
      });
  });
});
