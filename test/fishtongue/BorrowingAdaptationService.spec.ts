import BorrowingAdaptationService from "@/fishtongue/application/services/BorrowingAdaptationService";
import {
  BorrowingBatch,
  BorrowingProfile,
  Lexeme,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import { webcrypto, randomUUID } from "node:crypto";
import { TextEncoder } from "node:util";

const now = "2026-08-09T00:00:00.000Z";

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: { ...webcrypto, subtle: webcrypto.subtle, randomUUID },
    configurable: true,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    value: TextEncoder,
    configurable: true,
  });
});

function fixtures() {
  const created: BorrowingBatch[] = [];
  const analysis = {
    validateIpa: jest
      .fn()
      .mockResolvedValue({ valid: true, segments: ["p", "a"], unknown: [] }),
    rankMappings: jest.fn().mockResolvedValue([
      { source: "p", target: "b", distance: 0.2 },
      { source: "p", target: "m", distance: 0.5 },
      { source: "a", target: "a", distance: 0 },
      { source: "a", target: "e", distance: 0.3 },
    ]),
  };
  const batches = {
    create: jest.fn(async (batch: BorrowingBatch) => {
      created.push(batch);
    }),
    commitAtomic: jest.fn(),
  };
  const profile: BorrowingProfile = {
    id: "profile",
    projectId: "project",
    sourceLanguageId: "source",
    targetLanguageId: "target",
    name: "Default",
    structureVersion: "borrowing-profile-v1",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
    config: {
      explicitMappings: [],
      distanceWeights: {},
      epenthesis: [],
      deletionRules: [],
      replacementRules: [],
      repairOrder: ["replace", "insert", "delete", "resyllabify"],
      stressStrategy: "target_default",
      toneStrategy: "target_default",
      candidateCount: 2,
      maxSearchAttempts: 100,
    },
  };
  const phonology: PhonologyProfile = {
    id: "phonology",
    languageId: "target",
    structureVersion: "phonology-profile-v1",
    syllableTemplates: ["CV"],
    legalOnsets: ["b", "m"],
    legalNuclei: ["a", "e"],
    legalCodas: [],
    legalClusters: [],
    forbiddenPatterns: [],
    stressRules: {},
    toneRules: {},
    phonemes: ["b", "m", "a", "e"].map((ipa, position) => ({
      id: ipa,
      profileId: "phonology",
      ipa,
      displaySymbol: ipa,
      category: ["a", "e"].includes(ipa)
        ? ("vowel" as const)
        : ("consonant" as const),
      role: "phoneme" as const,
      distribution: "",
      source: "manual",
      notes: "",
      position,
    })),
    createdAt: now,
    updatedAt: now,
  };
  const source: Lexeme = {
    id: "source-word",
    languageId: "source",
    romanized: "pa",
    ipa: "pa",
    partOfSpeech: "noun",
    status: "confirmed",
    sourceType: "manual",
    notes: "",
    createdAt: now,
    updatedAt: now,
    morphemes: [],
    senses: [{ id: "sense", definition: "stone", position: 0 }],
  };
  return {
    service: new BorrowingAdaptationService(
      analysis as never,
      batches as never
    ),
    analysis,
    batches,
    created,
    profile,
    phonology,
    source,
  };
}

test("generates stable PanPhon candidates without changing meaning or part of speech", async () => {
  const { service, analysis, created, profile, phonology, source } = fixtures();
  const batch = await service.preview({
    profile,
    phonology,
    sourceLexemes: [source],
  });

  expect(batch.candidates.map((value) => value.adaptedForm)).toEqual([
    "ba",
    "ma",
  ]);
  expect(analysis.rankMappings).toHaveBeenCalledWith(
    expect.objectContaining({ distanceWeights: {} }),
    undefined
  );
  expect(batch.candidates[0].partOfSpeech).toBe("noun");
  expect(batch.candidates[0].senses).toEqual([
    { definition: "stone", position: 0 },
  ]);
  expect(batch.candidates[0].morphemeIds).toEqual([]);
  expect(created).toHaveLength(1);
});

test("sends Latin g to PanPhon as IPA ɡ without rewriting the saved source IPA", async () => {
  const { service, analysis, profile, phonology, source } = fixtures();
  analysis.validateIpa.mockResolvedValueOnce({
    valid: true,
    segments: ["ɡ", "a"],
    unknown: [],
  });
  analysis.rankMappings.mockResolvedValueOnce([
    { source: "ɡ", target: "b", distance: 0.2 },
    { source: "a", target: "a", distance: 0 },
    { source: "u", target: "e", distance: 0.3 },
  ]);

  const batch = await service.preview({
    profile,
    phonology,
    sourceLexemes: [{ ...source, romanized: "gagu", ipa: "gagu" }],
  });

  expect(analysis.validateIpa).toHaveBeenCalledWith({ ipa: "ɡaɡu" });
  expect(analysis.rankMappings).toHaveBeenCalledWith(
    expect.objectContaining({ sourceIpa: "ɡaɡu" }),
    undefined
  );
  expect(batch.candidates[0].sourceIpa).toBe("gagu");
});

test("requires a different source language and a formal target inventory", async () => {
  const { service, profile, phonology, source } = fixtures();
  await expect(
    service.preview({
      profile: { ...profile, sourceLanguageId: "target" },
      phonology,
      sourceLexemes: [source],
    })
  ).rejects.toThrow("来源语言必须与当前目标语言不同");
  await expect(
    service.preview({
      profile,
      phonology: { ...phonology, phonemes: [] },
      sourceLexemes: [source],
    })
  ).rejects.toThrow("正式音位表");
});

test("explicit morphology is the only path that changes part of speech", async () => {
  const { service, profile, phonology, source } = fixtures();
  const batch = await service.preview({
    profile: {
      ...profile,
      config: {
        ...profile.config,
        morphology: { morphemeIds: ["suffix"], partOfSpeech: "verb" },
      },
    },
    phonology,
    sourceLexemes: [source],
  });
  expect(batch.candidates[0].partOfSpeech).toBe("verb");
  expect(batch.candidates[0].morphemeIds).toEqual(["suffix"]);
});

test("runs only the explicitly supplied Lexurgy stage chain and keeps results in candidates", async () => {
  const { analysis, batches, profile, phonology, source } = fixtures();
  const run = jest
    .fn()
    .mockResolvedValueOnce({
      ruleNames: ["stage-one"],
      outputWords: ["bo", "mo"],
      intermediateWords: {},
      traces: {},
      errors: [],
    })
    .mockResolvedValueOnce({
      ruleNames: ["stage-two"],
      outputWords: ["bu", "mu"],
      intermediateWords: {},
      traces: {},
      errors: [],
    });
  const service = new BorrowingAdaptationService(
    analysis as never,
    batches as never,
    { run } as never
  );
  const batch = await service.preview({
    profile,
    phonology,
    sourceLexemes: [source],
    lexurgyStages: [
      { id: "stage-1", name: "Early", soundChanges: "one: a => o" },
      { id: "stage-2", name: "Late", soundChanges: "two: o => u" },
    ],
  });

  expect(run).toHaveBeenCalledTimes(2);
  expect(batch.lexurgyStageChain).toEqual(["stage-1", "stage-2"]);
  expect(batch.candidates.map((value) => value.evolvedForm)).toEqual([
    "bu",
    "mu",
  ]);
  expect(
    batch.candidates[0].trace.filter((value) => value.step === "lexurgy")
  ).toHaveLength(2);
  expect(source.romanized).toBe("pa");
});
