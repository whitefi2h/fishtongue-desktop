import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  EtymologyRelation,
  HistoricalEvent,
  Language,
  LanguageRelation,
  LanguageStage,
  Lexeme,
  StageContextRecord,
} from "@/fishtongue/domain/models";
import {
  EtymologyWorkspace,
  EventsWorkspace,
  GenealogyWorkspace,
  LanguagePropertiesWorkspace,
  StagesWorkspace,
} from "@/fishtongue/ui/HistoryWorkspaces";

const now = "2026-07-30T00:00:00Z";
const languages: Language[] = [
  { id: "l1", name: "阿兰语", projectId: "p1", createdAt: now, updatedAt: now },
  { id: "l2", name: "诺尔语", projectId: "p1", createdAt: now, updatedAt: now },
];

function phase5() {
  let stages: LanguageStage[] = [{
    id: "l1:default-stage", languageId: "l1", name: "默认状态",
    kind: "internal_default", documentationStatus: "recorded",
    storageMode: "independent_snapshot", position: 0, visible: false,
    createdAt: now, updatedAt: now,
  }];
  const contexts = new Map<string, StageContextRecord>();
  let relations: LanguageRelation[] = [];
  let events: HistoricalEvent[] = [];
  let etymologies: EtymologyRelation[] = [];
  const application = {
    listStages: async () => structuredClone(stages),
    saveStage: async (value: LanguageStage) => {
      stages = [...stages.filter((item) => item.id !== value.id), structuredClone(value)];
    },
    saveStageWithContext: async (
      value: LanguageStage,
      context: StageContextRecord
    ) => {
      stages = [...stages.filter((item) => item.id !== value.id), structuredClone(value)];
      contexts.set(context.stageId, structuredClone(context));
    },
    deleteStage: async (id: string) => { stages = stages.filter((item) => item.id !== id); },
    getStageContext: async (id: string) => structuredClone(contexts.get(id) ?? null),
    saveStageContext: async (value: StageContextRecord) => {
      contexts.set(value.stageId, structuredClone(value));
    },
    listLanguageRelations: async () => structuredClone(relations),
    saveLanguageRelation: async (value: LanguageRelation) => {
      relations = [...relations.filter((item) => item.id !== value.id), structuredClone(value)];
    },
    deleteLanguageRelation: async (id: string) => {
      relations = relations.filter((item) => item.id !== id);
    },
    listHistoricalEvents: async () => structuredClone(events),
    saveHistoricalEvent: async (value: HistoricalEvent) => {
      events = [...events.filter((item) => item.id !== value.id), structuredClone(value)];
    },
    deleteHistoricalEvent: async (id: string) => {
      events = events.filter((item) => item.id !== id);
    },
    listEtymologyRelations: async () => structuredClone(etymologies),
    saveEtymologyRelation: async (value: EtymologyRelation) => {
      etymologies = [...etymologies.filter((item) => item.id !== value.id), structuredClone(value)];
    },
    deleteEtymologyRelation: async (id: string) => {
      etymologies = etymologies.filter((item) => item.id !== id);
    },
  } as unknown as Phase5Application;
  return {
    application,
    getStages: () => stages,
    getRelations: () => relations,
    getEvents: () => events,
    getEtymologies: () => etymologies,
  };
}

describe("Phase 5 history workspaces", () => {
  it("creates a visible stage without replacing the internal default state", () => {
    const fake = phase5();
    cy.mount(<StagesWorkspace
      application={fake.application}
      languages={languages}
      languageId="l1"
      onChanged={() => {}}
      onStatus={() => {}}
      onSelectStage={() => {}}
    />);
    cy.contains("button", "新建阶段").click();
    cy.contains("label", "名称").find("input").clear().type("古典期");
    cy.contains("button", "保存阶段").click().then(() => {
      expect(fake.getStages().some((stage) => stage.name === "古典期")).to.equal(true);
      expect(fake.getStages().some((stage) => stage.kind === "internal_default")).to.equal(true);
    });
    cy.contains("button", "新建阶段").click();
    cy.contains("label", "上一个时间阶段").find("select").should("contain.text", "古典期");
  });

  it("renders genealogy as a view-only zoomable canvas", () => {
    const fake = phase5();
    const relation: LanguageRelation = {
      id: "r1", projectId: "p1", sourceLanguageId: "l1", targetLanguageId: "l2",
      kind: "genetic", isPrimary: true, confidence: "confirmed", notes: "",
      createdAt: now, updatedAt: now,
    };
    const contact: LanguageRelation = {
      ...relation, id: "r2", kind: "contact", isPrimary: false,
    };
    cy.then(async () => {
      await fake.application.saveLanguageRelation(relation);
      await fake.application.saveLanguageRelation(contact);
    });
    cy.mount(<GenealogyWorkspace
      application={fake.application}
      languages={languages}
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.get('[role="img"][aria-label="语言继承树"]').should("exist");
    cy.contains("button", "保存关系").should("not.exist");
    cy.contains("button", "接触 1").click();
    cy.get('path[data-kind="contact"]').should("exist");
    cy.contains("button", "方言").should("not.exist");
    cy.get('[aria-label="当前缩放比例"]').invoke("text").then((before) => {
      cy.get('[aria-label="放大谱系图"]').click();
      cy.get('[aria-label="当前缩放比例"]').should(($output) => {
        expect($output.text()).not.to.equal(before);
      });
    });
  });

  it("edits relationships from language basic properties", () => {
    cy.viewport(1360, 860);
    const fake = phase5();
    let savedProfile: Language["profile"];
    const project = {
      renameLanguage: async () => undefined,
      saveLanguageProfile: async (_id: string, profile: NonNullable<Language["profile"]>) => { savedProfile = profile; },
    } as unknown as ProjectApplication;
    cy.mount(<LanguagePropertiesWorkspace
      application={fake.application}
      project={project}
      language={languages[0]}
      languages={languages}
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("label", "本族名称").find("input").type("Árana");
    cy.contains("button", "保存基本属性").click().then(() => {
      expect(savedProfile?.nativeName).to.equal("Árana");
    });
    cy.contains("button", "添加关系").click();
    cy.contains("label", "另一门语言").find("select").select("l2");
    cy.contains("button", "保存关系").click().then(() => {
      expect(fake.getRelations()).to.have.length(1);
      expect(fake.getRelations()[0].sourceLanguageId).to.equal("l2");
      expect(fake.getRelations()[0].targetLanguageId).to.equal("l1");
    });
  });

  it("stores an event together with its participants", () => {
    const fake = phase5();
    cy.mount(<EventsWorkspace
      application={fake.application}
      languages={languages}
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("button", "新建事件").click();
    cy.contains("label", "事件名称").find("input").clear().type("北迁");
    cy.contains("fieldset", "参与语言").find("input[type='checkbox']").first().check();
    cy.contains("button", "保存事件").click().then(() => {
      expect(fake.getEvents()[0].name).to.equal("北迁");
      expect(fake.getEvents()[0].participants.length).to.be.greaterThan(0);
    });
  });

  it("filters etymology lexemes by language and links a historical event", () => {
    const fake = phase5();
    const event: HistoricalEvent = {
      id: "event-1", projectId: "p1", name: "北方接触", eventType: "contact",
      startLabel: "500", endLabel: "540", description: "", position: 0,
      participants: [], createdAt: now, updatedAt: now,
    };
    const lexemes: Lexeme[] = [
      {
        id: "target", languageId: "l1", romanized: "taros", ipa: "", partOfSpeech: "名词",
        status: "confirmed", sourceType: "manual", notes: "", createdAt: now, updatedAt: now,
        senses: [{ id: "sense-target", lexemeId: "target", definition: "鸟", position: 0 }],
      },
      {
        id: "source", languageId: "l2", romanized: "talo", ipa: "", partOfSpeech: "名词",
        status: "confirmed", sourceType: "manual", notes: "", createdAt: now, updatedAt: now,
        senses: [{ id: "sense-source", lexemeId: "source", definition: "天空", position: 0 }],
      },
    ];
    const project = {
      listLexemes: async (languageId: string) => lexemes.filter((lexeme) => lexeme.languageId === languageId),
    } as unknown as ProjectApplication;

    cy.then(() => fake.application.saveHistoricalEvent(event));
    cy.mount(<EtymologyWorkspace
      application={fake.application}
      project={project}
      languages={languages}
      languageId="l1"
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("label", "来源语言").find("select").should("not.contain.text", "阿兰语");
    cy.contains("label", "关系类型").find("select").select("derivation");
    cy.contains("label", "来源语言").find("select").should("contain.text", "阿兰语");
    cy.contains("label", "关系类型").find("select").select("borrowing");
    cy.contains("label", "来源语言").find("select").select("l2");
    cy.contains("label", "检索诺尔语词条").find("input").type("talo");
    cy.get('button[role="option"]').contains("talo").click();
    cy.get('button[role="option"]').should("not.exist");
    cy.contains("label", "检索当前语言词条").find("input").type("taros");
    cy.get('button[role="option"]').contains("taros").click();
    cy.contains("label", "关联历史事件").find("select").select("event-1");
    cy.contains("button", "保存关系").click().then(() => {
      expect(fake.getEtymologies()).to.have.length(1);
      expect(fake.getEtymologies()[0].sourceLexemeId).to.equal("source");
      expect(fake.getEtymologies()[0].targetLexemeId).to.equal("target");
      expect(fake.getEtymologies()[0].historicalEventId).to.equal("event-1");
    });
    cy.contains("button", "编辑").click();
    cy.contains("label", "可信度").find("select").select("possible");
    cy.contains("button", "保存修改").click().then(() => {
      expect(fake.getEtymologies()).to.have.length(1);
      expect(fake.getEtymologies()[0].confidence).to.equal("possible");
    });
  });

  it("creates a current-language lexeme while building a relation", () => {
    const fake = phase5();
    const lexemes: Lexeme[] = [{
      id: "source", languageId: "l2", romanized: "talo", ipa: "", partOfSpeech: "名词",
      status: "confirmed", sourceType: "manual", notes: "", createdAt: now, updatedAt: now,
      senses: [{ id: "sense-source", lexemeId: "source", definition: "天空", position: 0 }],
    }];
    const project = {
      listLexemes: async (languageId: string) => structuredClone(lexemes.filter((lexeme) => lexeme.languageId === languageId)),
      saveLexeme: async (lexeme: Lexeme) => { lexemes.push(structuredClone(lexeme)); },
    } as unknown as ProjectApplication;

    cy.mount(<EtymologyWorkspace
      application={fake.application}
      project={project}
      languages={languages}
      languageId="l1"
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("label", "来源语言").find("select").select("l2");
    cy.contains("label", "检索诺尔语词条").find("input").type("talo");
    cy.get('button[role="option"]').contains("talo").click();
    cy.contains("button", "新建当前语言词条").click();
    cy.contains("label", "词形").find("input").type("taros");
    cy.contains("label", "释义").find("input").type("鸟");
    cy.contains("button", "创建并选中").click();
    cy.contains("button", "保存关系").click().then(() => {
      expect(lexemes.some((lexeme) => lexeme.languageId === "l1" && lexeme.romanized === "taros")).to.equal(true);
      expect(fake.getEtymologies()).to.have.length(1);
    });
  });

  it("batch creates selected target lexemes and relations", () => {
    const fake = phase5();
    const lexemes: Lexeme[] = [{
      id: "source", languageId: "l2", romanized: "talo", ipa: "", partOfSpeech: "名词",
      status: "confirmed", sourceType: "manual", notes: "", createdAt: now, updatedAt: now,
      senses: [{ id: "sense-source", lexemeId: "source", definition: "天空", position: 0 }],
    }];
    const project = {
      listLexemes: async (languageId: string) => structuredClone(lexemes.filter((lexeme) => lexeme.languageId === languageId)),
      saveLexeme: async (lexeme: Lexeme) => { lexemes.push(structuredClone(lexeme)); },
      deleteLexeme: async (id: string) => {
        const index = lexemes.findIndex((lexeme) => lexeme.id === id);
        if (index >= 0) lexemes.splice(index, 1);
      },
    } as unknown as ProjectApplication;

    cy.mount(<EtymologyWorkspace
      application={fake.application}
      project={project}
      languages={languages}
      languageId="l1"
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("button", "批量").click();
    cy.contains("label", "关系类型").find("select").select("cognate");
    cy.contains("label", "来源语言").find("select").select("l2");
    cy.get('input[aria-label="选择 talo"]').check().parent().within(() => {
      cy.get('input:not([type="checkbox"])').eq(0).type("taros");
      cy.get('input:not([type="checkbox"])').eq(1).clear().type("鸟");
    });
    cy.contains("button", "创建所选关系").click().then(() => {
      expect(lexemes.some((lexeme) => lexeme.languageId === "l1" && lexeme.romanized === "taros")).to.equal(true);
      expect(fake.getEtymologies()).to.have.length(1);
    });
  });
});
