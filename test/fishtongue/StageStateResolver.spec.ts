import StageStateResolver from "@/fishtongue/application/services/StageStateResolver";
import { LanguageStage, StageComponentOverride } from "@/fishtongue/domain/models";

const now = "2026-07-30T00:00:00Z";

function stage(
  id: string,
  values: Partial<LanguageStage> = {}
): LanguageStage {
  return {
    id,
    languageId: "language",
    name: id,
    kind: "historical_stage",
    documentationStatus: "partial",
    storageMode: "inherited_delta",
    position: 1,
    visible: true,
    createdAt: now,
    updatedAt: now,
    ...values,
  };
}

function resolverFor(
  stages: LanguageStage[],
  overrides: Record<string, StageComponentOverride[]> = {}
) {
  const stageRepository = {
    list: async () => stages,
    get: async (id: string) => stages.find((value) => value.id === id) ?? null,
    listOverrides: async (id: string) => overrides[id] ?? [],
  };
  return new StageStateResolver(
    stageRepository as never,
    { list: async () => [{
      id: "lexeme", languageId: "language", romanized: "ama", ipa: "",
      partOfSpeech: "noun", status: "confirmed", sourceType: "manual", notes: "",
      createdAt: now, updatedAt: now, senses: [], morphemes: [],
    }] } as never,
    { list: async () => [] } as never,
    { getOrCreate: async () => ({ id: "evolution", soundChanges: "" }) } as never,
    { getOrCreate: async () => ({ id: "inflection", rules: {} }) } as never,
    { list: async () => [] } as never
  );
}

describe("StageStateResolver", () => {
  it("inherits the internal language state and applies stage deltas", async () => {
    const base = stage("default", {
      kind: "internal_default",
      storageMode: "independent_snapshot",
      visible: false,
      position: 0,
    });
    const child = stage("child", { dataBaseStageId: base.id });
    const resolver = resolverFor([base, child], {
      child: [{
        id: "override", stageId: child.id, componentType: "lexicon",
        operation: "merge", targetId: "lexeme", payload: { romanized: "eme" },
        position: 0, createdAt: now, updatedAt: now,
      }],
    });

    const result = await resolver.resolve(child.id);

    expect(result.lineage).toEqual(["default", "child"]);
    expect(result.components.lexicon.lexeme.romanized).toBe("eme");
  });

  it("returns no fabricated components for an unrecorded stage", async () => {
    const unknown = stage("unknown", {
      documentationStatus: "unrecorded",
      storageMode: "no_data",
    });
    const result = await resolverFor([unknown]).resolve(unknown.id);
    expect(result.components.lexicon).toEqual({});
    expect(result.warnings[0]).toContain("无记录");
  });

  it("rejects cyclic data inheritance", async () => {
    const first = stage("first", { dataBaseStageId: "second" });
    const second = stage("second", { dataBaseStageId: "first" });
    await expect(resolverFor([first, second]).resolve(first.id))
      .rejects.toThrow("循环");
  });
});
