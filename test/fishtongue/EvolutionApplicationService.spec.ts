import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import EvolutionApplicationService from "@/fishtongue/application/services/EvolutionApplicationService";
import {
  EvolutionDelivery,
  EvolutionPlan,
  EvolutionPlanVersion,
  EvolutionRun,
  EvolutionRunItem,
  Lexeme,
  PhonologyProfile,
} from "@/fishtongue/domain/models";

describe("EvolutionApplicationService", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      configurable: true,
    });
    Object.defineProperty(globalThis, "TextEncoder", {
      value: TextEncoder,
      configurable: true,
    });
  });

  it("runs IPA snapshots without rewriting stored values or substituting display forms", async () => {
    const plan = samplePlan();
    const versions: EvolutionPlanVersion[] = [];
    const runs: Array<EvolutionRun & { items: EvolutionRunItem[] }> = [];
    const refreshLanguages = jest.fn().mockResolvedValue([]);
    let committedPayload: Record<string, unknown> | undefined;
    const deliveryRepository = deliveryRepositoryMock(undefined, (command) => {
      committedPayload = command.payload;
    });
    const phase6 = phase6Mock(true);
    const validateIpas = jest.spyOn(phase6 as never, "validateIpas");
    const engine = {
      validate: jest
        .fn()
        .mockResolvedValue({ valid: true, ruleNames: ["raising"], issues: [] }),
      run: jest.fn().mockResolvedValue({
        outputWords: ["tʃe.ˈna", "pata"],
        intermediateWords: { raising: ["tʃe.ˈna", "pata"] },
        traces: {
          kena: [{ rule: "raising", output: "tʃe.ˈna" }],
          pata: [],
        },
        errors: [],
      }),
    };
    const service = new EvolutionApplicationService(
      projectMock(refreshLanguages),
      historyMock(),
      phase6,
      engine as never,
      {
        list: async () => [plan],
        get: async () => plan,
        save: async () => undefined,
        delete: async () => undefined,
        listVersions: async () => versions,
        getVersion: async (id) =>
          versions.find((item) => item.id === id) ?? null,
        createVersion: async (value) => {
          versions.push(value);
        },
      },
      {
        list: async () => runs,
        get: async (id) => runs.find((item) => item.id === id) ?? null,
        create: async (value) => {
          runs.push(value);
        },
        listItems: async (id) =>
          runs.find((item) => item.id === id)?.items ?? [],
      },
      deliveryRepository,
      { version: "test", hash: "engine-hash", protocolVersion: "v2" }
    );

    const run = await service.runPreview({
      planId: plan.id,
      sourceStageId: "stage",
      selectedLexemeIds: ["stored", "temporary", "missing"],
      temporaryPhonologicalForms: { temporary: "[pata]" },
    });

    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputWords: ["kena", "pata"] }),
      expect.any(Function),
      undefined
    );
    expect(run.status).toBe("succeeded");
    expect(
      runs[0].items.map((item) => [
        item.sourcePhonologicalForm,
        item.engineInput,
        item.inputOrigin,
      ])
    ).toEqual([
      ["/kena/", "kena", "stored"],
      ["", "pata", "temporary"],
      ["", "", "missing"],
    ]);
    expect(runs[0].items[0].targetPhonologicalForm).toBe("/tʃe.ˈna/");
    expect(runs[0].items[2].status).toBe("not_run");
    expect(run.errors).toEqual([]);
    expect(
      runs[0].items
        .filter((item) => item.status !== "not_run")
        .every((item) => item.issues.length === 0)
    ).toBe(true);

    const draft = await service.createDeliveryDraft(run.id);
    const prepared = {
      ...draft,
      targetType: "new_descendant" as const,
      targetConfig: { languageName: "Daughter" },
      items: draft.items.map((item) => {
        const runItem = runs[0].items.find(
          (candidate) => candidate.id === item.runItemId
        );
        return item.decision === "skip"
          ? item
          : {
              ...item,
              targetDisplayForm: runItem?.sourceDisplayForm ?? "",
              orthographyResolution: "preserved" as const,
            };
      }),
    };
    const checked = await service.validateDelivery(prepared);
    const checkedCodes = checked.items.flatMap((item) =>
      item.conflicts.map((issue) => issue.code)
    );
    expect(checkedCodes).not.toContain("INVALID_IPA");
    expect(checkedCodes).not.toContain("TARGET_PHONOLOGY_EMPTY");
    expect(checkedCodes).toContain("NEW_PHONEME:t");
    expect(checkedCodes).not.toContain("NEW_PHONEME:ˈ");
    expect(checkedCodes).not.toContain("NEW_PHONEME:.");
    expect(checked.targetConfig.newPhonemeCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ipa: "t",
          role: "phoneme",
          distribution: expect.stringContaining("raising"),
          sourceRule: "raising",
        }),
      ])
    );

    const resolutions = (
      checked.targetConfig.newPhonemeCandidates as Array<
        Record<string, unknown>
      >
    ).map((candidate) =>
      candidate.ipa === "t"
        ? {
            ...candidate,
            role: "allophone",
            parentPhonemeId: "phoneme-k",
            distribution: "_ e（来自规则“raising”）",
          }
        : candidate
    );
    const rechecked = await service.validateDelivery({
      ...checked,
      targetConfig: {
        ...checked.targetConfig,
        newPhonemeResolutions: resolutions,
      },
    });
    expect(validateIpas).toHaveBeenCalledTimes(1);
    expect(validateIpas).toHaveBeenCalledWith(expect.any(Array));
    expect(
      rechecked.items
        .flatMap((item) => item.conflicts)
        .filter((issue) => issue.severity === "error")
    ).toEqual([]);
    expect(rechecked.targetConfig.newPhonemeResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ipa: "t", distribution: expect.any(String) }),
      ])
    );
    await service.saveDeliveryDraft(rechecked);
    await service.commitDelivery(rechecked.id);
    expect(refreshLanguages).toHaveBeenCalledTimes(1);
    const phonologyOverride = committedPayload?.phonologyOverride as
      | PhonologyProfile
      | undefined;
    expect(phonologyOverride?.languageId).not.toBe("language");
    expect(phonologyOverride?.phonemes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ipa: "t",
          role: "allophone",
          distribution: expect.stringContaining("raising"),
          source: "evolution-confirmed",
        }),
      ])
    );
    const copiedParent = phonologyOverride?.phonemes.find(
      (phoneme) => phoneme.ipa === "k"
    );
    const newAllophone = phonologyOverride?.phonemes.find(
      (phoneme) => phoneme.ipa === "t"
    );
    expect(copiedParent?.id).not.toBe("phoneme-k");
    expect(newAllophone?.parentPhonemeId).toBe(copiedParent?.id);
  });

  it("previews test words without creating versions or formal runs", async () => {
    const plan = {
      ...samplePlan(),
      testWords: [
        { id: "test-1", word: "/kena/", position: 0 },
        { id: "test-2", word: "[pata]", position: 1 },
      ],
    };
    const createVersion = jest.fn().mockResolvedValue(undefined);
    const createRun = jest.fn().mockResolvedValue(undefined);
    const engine = {
      validate: jest.fn().mockResolvedValue({
        valid: true,
        ruleNames: ["palatalization"],
        issues: [],
      }),
      run: jest.fn().mockResolvedValue({
        ruleNames: ["palatalization"],
        outputWords: ["tʃena", "pata"],
        intermediateWords: {},
        traces: {},
        errors: [],
      }),
    };
    const service = new EvolutionApplicationService(
      projectMock(),
      historyMock(),
      phase6Mock(),
      engine as never,
      {
        list: async () => [plan],
        get: async () => plan,
        save: async () => undefined,
        delete: async () => undefined,
        listVersions: async () => [],
        getVersion: async () => null,
        createVersion,
      },
      {
        list: async () => [],
        get: async () => null,
        create: createRun,
        listItems: async () => [],
      },
      deliveryRepositoryMock(),
      { version: "test", hash: "engine-hash", protocolVersion: "v2" }
    );

    const preview = await service.previewTestWords(plan);

    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({ inputWords: ["kena", "pata"] }),
      expect.any(Function),
      undefined
    );
    expect(preview.items).toEqual([
      expect.objectContaining({
        source: "/kena/",
        engineInput: "kena",
        engineOutput: "tʃena",
        displayOutput: "/tʃena/",
        changed: true,
      }),
      expect.objectContaining({
        source: "[pata]",
        displayOutput: "[pata]",
        changed: false,
      }),
    ]);
    expect(createVersion).not.toHaveBeenCalled();
    expect(createRun).not.toHaveBeenCalled();
  });

  it("repairs an internal default source to the latest visible data stage", async () => {
    let plan = samplePlan();
    plan = { ...plan, sourceStageId: "default" };
    const saved: EvolutionPlan[] = [];
    const service = new EvolutionApplicationService(
      projectMock(),
      {
        ...historyMock(),
        listStages: async () => [
          {
            id: "default",
            languageId: "language",
            name: "Default state",
            kind: "internal_default",
            documentationStatus: "recorded",
            storageMode: "independent_snapshot",
            startLabel: "",
            endLabel: "",
            position: 0,
            visible: false,
            createdAt: "",
            updatedAt: "",
          },
          {
            id: "historical",
            languageId: "language",
            name: "新阶段",
            kind: "historical_stage",
            documentationStatus: "recorded",
            storageMode: "inherited_delta",
            startLabel: "",
            endLabel: "",
            position: 1,
            visible: true,
            createdAt: "",
            updatedAt: "",
          },
        ],
      } as never,
      phase6Mock(),
      {} as never,
      {
        list: async () => [plan],
        get: async () => plan,
        save: async (value) => {
          plan = value;
          saved.push(value);
        },
        delete: async () => undefined,
        listVersions: async () => [],
        getVersion: async () => null,
        createVersion: async () => undefined,
      },
      {
        list: async () => [],
        get: async () => null,
        create: async () => undefined,
        listItems: async () => [],
      },
      deliveryRepositoryMock(),
      { version: "test", hash: "hash", protocolVersion: "v2" }
    );

    const [repaired] = await service.listPlans("language");
    expect(repaired.sourceStageId).toBe("historical");
    expect(saved).toHaveLength(1);
  });

  it("creates IPA delivery items with pending orthography", async () => {
    const plan = samplePlan();
    const run: EvolutionRun = {
      id: "run",
      planVersionId: "version",
      sourceLanguageId: "language",
      sourceStageId: "stage",
      inputMode: "phonological",
      status: "succeeded",
      engineVersion: "test",
      engineHash: "hash",
      protocolVersion: "v2",
      rulesHash: "rules",
      inputHash: "input",
      sourceStateHash: "state",
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
      createdAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:01Z",
    };
    const item: EvolutionRunItem = {
      id: "item",
      runId: run.id,
      sourceLexemeId: "stored",
      sourceDisplayForm: "cena",
      sourcePhonologicalForm: "/kena/",
      engineInput: "kena",
      engineOutput: "tʃena",
      targetPhonologicalForm: "/tʃena/",
      inputOrigin: "stored",
      status: "changed",
      intermediate: {},
      trace: [],
      issues: [],
      position: 0,
    };
    let saved: EvolutionDelivery | undefined;
    const repository = deliveryRepositoryMock((value) => {
      saved = value;
    });
    const service = new EvolutionApplicationService(
      projectMock(),
      historyMock(),
      phase6Mock(),
      {} as never,
      {
        list: async () => [plan],
        get: async () => plan,
        save: async () => undefined,
        delete: async () => undefined,
        listVersions: async () => [],
        getVersion: async () => null,
        createVersion: async () => undefined,
      },
      {
        list: async () => [run],
        get: async () => run,
        create: async () => undefined,
        listItems: async () => [item],
      },
      repository,
      { version: "test", hash: "hash", protocolVersion: "v2" }
    );

    const delivery = await service.createDeliveryDraft(run.id);
    expect(delivery.items[0]).toEqual(
      expect.objectContaining({
        targetDisplayForm: "",
        orthographyResolution: "pending",
        decision: "include",
      })
    );
    expect(saved?.id).toBe(delivery.id);
  });

  it("classifies borrowing relations separately from manual entry", async () => {
    const service = new EvolutionApplicationService(
      projectMock(),
      historyMock(["stored"]),
      phase6Mock(),
      {} as never,
      {
        list: async () => [],
        get: async () => null,
        save: async () => undefined,
        delete: async () => undefined,
        listVersions: async () => [],
        getVersion: async () => null,
        createVersion: async () => undefined,
      },
      {
        list: async () => [],
        get: async () => null,
        create: async () => undefined,
        listItems: async () => [],
      },
      deliveryRepositoryMock(),
      { version: "test", hash: "hash", protocolVersion: "v2" }
    );

    const inputs = await service.resolveInputs("language", "stage");
    expect(
      inputs.find((item) => item.id === "stored")?.evolutionSourceType
    ).toBe("borrowing");
    expect(
      inputs.find((item) => item.id === "temporary")?.evolutionSourceType
    ).toBe("manual");
  });
});

function samplePlan(): EvolutionPlan {
  return {
    id: "plan",
    languageId: "language",
    name: "Plan",
    description: "",
    sourceStageId: "stage",
    inputMode: "phonological",
    rulesDraft: "raising:\nk => tʃ / _e",
    testWords: [],
    scope: {
      query: "",
      partOfSpeech: "",
      lexicalStatus: "all",
      sourceType: "all",
    },
    archived: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function lexemes(): Lexeme[] {
  const base = {
    languageId: "language",
    ipa: "",
    partOfSpeech: "noun",
    status: "confirmed" as const,
    sourceType: "manual" as const,
    notes: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    senses: [{ id: "sense", definition: "word", position: 0 }],
    morphemes: [],
  };
  return [
    { ...base, id: "stored", romanized: "cena", ipa: "/kena/" },
    { ...base, id: "temporary", romanized: "pata" },
    { ...base, id: "missing", romanized: "maka" },
  ];
}

function historyMock(borrowedLexemeIds: string[] = []) {
  return {
    listStages: async () => [
      {
        id: "stage",
        languageId: "language",
        name: "Stage",
        kind: "internal_default",
        documentationStatus: "recorded",
        storageMode: "independent_snapshot",
        startLabel: "",
        endLabel: "",
        position: 0,
        visible: false,
        createdAt: "",
        updatedAt: "",
      },
    ],
    resolveStage: async () => ({
      stage: {
        id: "stage",
        languageId: "language",
        name: "Stage",
        kind: "internal_default",
        documentationStatus: "recorded",
        storageMode: "independent_snapshot",
        startLabel: "",
        endLabel: "",
        position: 0,
        visible: false,
        createdAt: "",
        updatedAt: "",
      },
      lineage: ["stage"],
      components: {
        lexicon: Object.fromEntries(lexemes().map((item) => [item.id, item])),
        morphemes: {},
        wordgen: {},
      },
      warnings: [],
    }),
    listLanguageRelations: async () => [],
    listEtymologyRelations: async () =>
      borrowedLexemeIds.map((targetLexemeId) => ({
        id: `borrowing:${targetLexemeId}`,
        targetLexemeId,
        kind: "borrowing",
      })),
  } as never;
}

function phase6Mock(withBasePhoneme = false) {
  const profile: PhonologyProfile = {
    id: "phonology",
    languageId: "language",
    structureVersion: "phonology-profile-v1",
    syllableTemplates: [],
    legalOnsets: [],
    legalNuclei: [],
    legalCodas: [],
    legalClusters: [],
    forbiddenPatterns: [],
    stressRules: {},
    toneRules: {},
    phonemes: withBasePhoneme
      ? [
          {
            id: "phoneme-k",
            profileId: "phonology",
            ipa: "k",
            displaySymbol: "k",
            category: "consonant",
            role: "phoneme",
            distribution: "",
            source: "manual",
            notes: "",
            position: 0,
          },
        ]
      : [],
    createdAt: "",
    updatedAt: "",
  };
  return {
    getPhonology: async () => profile,
    validatePhonotactics: () => ({ valid: true, warnings: [] }),
    validateIpa: async (ipa: string) => ({
      valid: ![...ipa].some((symbol) => symbol === "." || symbol === "ˈ"),
      segments: [...ipa],
      unknown: [...ipa]
        .map((symbol, position) => ({ symbol, position }))
        .filter(({ symbol }) => symbol === "." || symbol === "ˈ"),
    }),
    validateIpas: async (ipas: string[]) =>
      Promise.all(
        ipas.map(async (ipa) => ({
          valid: ![...ipa].some((symbol) => symbol === "." || symbol === "ˈ"),
          segments: [...ipa],
          unknown: [...ipa]
            .map((symbol, position) => ({ symbol, position }))
            .filter(({ symbol }) => symbol === "." || symbol === "ˈ"),
        }))
      ),
  } as never;
}

function projectMock(listLanguages = jest.fn().mockResolvedValue([])) {
  return {
    runProjectOperation: async (
      _kind: string,
      _summary: string,
      action: () => Promise<unknown>
    ) => action(),
    markProjectChanged: async () => undefined,
    listLanguages,
    getSnapshot: () => ({ project: { id: "project" }, languages: [] }),
  } as never;
}

function deliveryRepositoryMock(
  onSave?: (value: EvolutionDelivery) => void,
  onCommit?: (value: {
    payload: Record<string, unknown>;
    targetLanguageId: string;
    targetStageId: string;
    committedAt: string;
  }) => void
) {
  let current: EvolutionDelivery | undefined;
  return {
    list: async () => (current ? [current] : []),
    get: async () => current ?? null,
    saveDraft: async (value: EvolutionDelivery) => {
      current = value;
      onSave?.(value);
    },
    commit: async (value: {
      payload: Record<string, unknown>;
      targetLanguageId: string;
      targetStageId: string;
      committedAt: string;
    }) => {
      onCommit?.(value);
      if (current)
        current = {
          ...current,
          status: "committed",
          targetLanguageId: value.targetLanguageId,
          targetStageId: value.targetStageId,
          committedAt: value.committedAt,
        };
    },
    listGraphMarkers: async () => [],
  };
}
