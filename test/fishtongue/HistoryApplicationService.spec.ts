import HistoryApplicationService from "@/fishtongue/application/services/HistoryApplicationService";
import { LanguageStage, StageContextRecord } from "@/fishtongue/domain/models";

const now = "2026-07-30T00:00:00.000Z";

function createService() {
  const base: LanguageStage = {
    id: "language:default-stage",
    languageId: "language",
    name: "Default state",
    kind: "internal_default",
    documentationStatus: "recorded",
    storageMode: "independent_snapshot",
    position: 0,
    visible: false,
    createdAt: now,
    updatedAt: now,
  };
  const saveWithContext = jest.fn().mockResolvedValue(undefined);
  const markProjectChanged = jest.fn().mockResolvedValue(undefined);
  const stages = {
    list: jest.fn().mockResolvedValue([base]),
    saveWithContext,
  };
  const project = {
    getSnapshot: () => ({ project: { id: "project" } }),
    markProjectChanged,
  };
  const service = new HistoryApplicationService(
    project as never,
    stages as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
  return { service, saveWithContext, markProjectChanged, base };
}

function historicalStage(base: LanguageStage): LanguageStage {
  return {
    id: "stage",
    languageId: base.languageId,
    name: "  古典期  ",
    kind: "historical_stage",
    documentationStatus: "partial",
    storageMode: "inherited_delta",
    chronologyParentId: base.id,
    dataBaseStageId: base.id,
    startLabel: "  前 400  ",
    endLabel: "  前 100  ",
    position: 1,
    visible: true,
    createdAt: now,
    updatedAt: now,
  };
}

function stageContext(stageId = "stage"): StageContextRecord {
  return {
    stageId,
    background: "  城邦时代  ",
    evidenceNotes: "  资料不完整  ",
    sources: [" 碑铭 ", "", "手稿"],
    updatedAt: now,
  };
}

describe("HistoryApplicationService stage persistence", () => {
  it("saves a new stage and its context through one repository operation", async () => {
    const { service, saveWithContext, markProjectChanged, base } = createService();

    await service.saveStageWithContext(
      historicalStage(base),
      stageContext()
    );

    expect(saveWithContext).toHaveBeenCalledTimes(1);
    expect(saveWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "古典期",
        startLabel: "前 400",
        endLabel: "前 100",
      }),
      expect.objectContaining({
        background: "城邦时代",
        evidenceNotes: "资料不完整",
        sources: ["碑铭", "手稿"],
      })
    );
    expect(markProjectChanged).toHaveBeenCalledTimes(1);
  });

  it("refuses a context that belongs to another stage", async () => {
    const { service, saveWithContext, markProjectChanged, base } = createService();

    await expect(service.saveStageWithContext(
      historicalStage(base),
      stageContext("other-stage")
    )).rejects.toThrow("不一致");

    expect(saveWithContext).not.toHaveBeenCalled();
    expect(markProjectChanged).not.toHaveBeenCalled();
  });

  it("refuses an unrecorded stage as another stage's data base", async () => {
    const { service, saveWithContext, markProjectChanged, base } = createService();
    const unrecorded: LanguageStage = {
      ...historicalStage(base),
      id: "unrecorded",
      name: "无记录时期",
      documentationStatus: "unrecorded",
      storageMode: "no_data",
      dataBaseStageId: undefined,
    };
    const repository = (service as unknown as { stages: { list: jest.Mock } }).stages;
    repository.list.mockResolvedValue([base, unrecorded]);

    await expect(service.saveStageWithContext(
      { ...historicalStage(base), dataBaseStageId: unrecorded.id },
      stageContext()
    )).rejects.toThrow("不能作为数据基础");

    expect(saveWithContext).not.toHaveBeenCalled();
    expect(markProjectChanged).not.toHaveBeenCalled();
  });
});

describe("HistoryApplicationService etymology safety", () => {
  it("refuses borrowing between two lexemes in the same language", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const project = {
      getSnapshot: () => ({
        project: { id: "project" },
        languages: [{ id: "language" }],
      }),
      listLexemes: jest.fn().mockResolvedValue([
        { id: "source", languageId: "language" },
        { id: "target", languageId: "language" },
      ]),
      markProjectChanged: jest.fn().mockResolvedValue(undefined),
    };
    const service = new HistoryApplicationService(
      project as never,
      {} as never,
      {} as never,
      { list: jest.fn().mockResolvedValue([]) } as never,
      { save } as never,
      {} as never,
      {} as never
    );

    await expect(service.saveEtymologyRelation({
      id: "relation", projectId: "project", sourceLexemeId: "source",
      targetLexemeId: "target", kind: "borrowing", sourceForm: "",
      confidence: "confirmed", notes: "", createdAt: now, updatedAt: now,
    })).rejects.toThrow("不能从自身借入");
    expect(save).not.toHaveBeenCalled();
  });

  it("blocks the same source and borrowed form, even when the target is another lexeme", async () => {
    const existing = borrowingRelation("existing", "target-a");
    const { service, save } = etymologyService(
      [existing],
      [
        lexeme("source", "source-language", "pata"),
        lexeme("target-a", "target-language", "Báda"),
        lexeme("target-b", "target-language", "báda".normalize("NFC")),
      ]
    );
    const candidate = borrowingRelation("candidate", "target-b");

    await expect(service.checkEtymologyDuplicate(candidate)).resolves.toEqual(
      expect.objectContaining({ kind: "same_source_same_target_form" })
    );
    await expect(service.saveEtymologyRelation(candidate)).rejects.toThrow(
      "不能重复保存"
    );
    expect(save).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before saving another form from the same source", async () => {
    const existing = borrowingRelation("existing", "target-a");
    const { service, save } = etymologyService(
      [existing],
      [
        lexeme("source", "source-language", "pata"),
        lexeme("target-a", "target-language", "bada"),
        lexeme("target-b", "target-language", "pada"),
      ]
    );
    const candidate = borrowingRelation("candidate", "target-b");

    await expect(service.saveEtymologyRelation(candidate)).rejects.toThrow(
      "请确认后再保存"
    );
    await service.saveEtymologyRelation(candidate, {
      confirmSameSource: true,
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps relation-only deletion as the default", async () => {
    const existing = borrowingRelation("existing", "target-a");
    const { service, remove, deleteLexeme } = etymologyService(
      [existing],
      [
        lexeme("source", "source-language", "pata"),
        lexeme("target-a", "target-language", "bada"),
      ]
    );

    await service.deleteEtymologyRelation(existing.id);

    expect(remove).toHaveBeenCalledWith(existing.id);
    expect(deleteLexeme).not.toHaveBeenCalled();
  });

  it("can delete the borrowing target lexeme and let its relation cascade", async () => {
    const existing = borrowingRelation("existing", "target-a");
    const { service, remove, deleteLexeme } = etymologyService(
      [existing],
      [
        lexeme("source", "source-language", "pata"),
        lexeme("target-a", "target-language", "bada"),
      ]
    );

    await service.deleteEtymologyRelation(
      existing.id,
      "relation_and_target_lexeme"
    );

    expect(deleteLexeme).toHaveBeenCalledWith("target-a");
    expect(remove).not.toHaveBeenCalled();
  });
});

function borrowingRelation(id: string, targetLexemeId: string) {
  return {
    id,
    projectId: "project",
    sourceLexemeId: "source",
    targetLexemeId,
    kind: "borrowing" as const,
    sourceForm: "",
    confidence: "confirmed" as const,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

function lexeme(id: string, languageId: string, romanized: string) {
  return {
    id,
    languageId,
    romanized,
    ipa: "",
    partOfSpeech: "noun",
    status: "confirmed" as const,
    sourceType: "manual" as const,
    notes: "",
    senses: [],
    morphemes: [],
    createdAt: now,
    updatedAt: now,
  };
}

function etymologyService(
  relations: ReturnType<typeof borrowingRelation>[],
  lexemes: ReturnType<typeof lexeme>[]
) {
  const save = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const deleteLexeme = jest.fn().mockResolvedValue(undefined);
  const project = {
    getSnapshot: () => ({
      project: { id: "project" },
      languages: [{ id: "source-language" }, { id: "target-language" }],
    }),
    listLexemes: jest.fn(async (languageId: string) =>
      lexemes.filter((value) => value.languageId === languageId)
    ),
    deleteLexeme,
    markProjectChanged: jest.fn().mockResolvedValue(undefined),
  };
  const etymology = {
    list: jest.fn().mockResolvedValue(relations),
    save,
    delete: remove,
  };
  const service = new HistoryApplicationService(
    project as never,
    {} as never,
    {} as never,
    { list: jest.fn().mockResolvedValue([]) } as never,
    etymology as never,
    {} as never,
    {} as never
  );
  return { service, save, remove, deleteLexeme };
}
