import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import {
  HistoricalEvent,
  Language,
  LanguageRelation,
  LanguageStage,
  StageContextRecord,
} from "@/fishtongue/domain/models";
import {
  EventsWorkspace,
  GenealogyWorkspace,
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
  } as unknown as Phase5Application;
  return { application, getStages: () => stages, getRelations: () => relations, getEvents: () => events };
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
  });

  it("keeps genetic relationships explicit and editable", () => {
    const fake = phase5();
    cy.mount(<GenealogyWorkspace
      application={fake.application}
      languages={languages}
      onChanged={() => {}}
      onStatus={() => {}}
    />);
    cy.contains("button", "建立主要继承关系").click().then(() => {
      expect(fake.getRelations()).to.have.length(1);
      expect(fake.getRelations()[0].kind).to.equal("genetic");
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
    cy.contains("label", "事件名称").find("input").type("北迁");
    cy.contains("button", "添加事件").click().then(() => {
      expect(fake.getEvents()[0].name).to.equal("北迁");
      expect(fake.getEvents()[0].participants.length).to.be.greaterThan(0);
    });
  });
});
