import { WordGenerationEngine } from "@/fishtongue/application/ports/WordGenerationEngine";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import { builtInConceptCount, builtInConcepts } from "@/fishtongue/data/BuiltInConceptLists";
import { Morpheme, WordGenerationProfile } from "@/fishtongue/domain/models";

const profile: WordGenerationProfile = {
  id: "profile",
  languageId: "language",
  name: "test",
  configVersion: "wordgen-profile-v1",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  config: {
    categories: [{ name: "C", symbols: [{ value: "th", weight: 1 }] }],
    templates: [{ pattern: "{C}", weight: 1 }],
    syllableCounts: [{ count: 1, weight: 1 }],
    forbiddenPatterns: [],
    rewriteRules: [],
    maxAttemptsPerCandidate: 100,
  },
};

class DeterministicFakeEngine implements WordGenerationEngine {
  getStatus = async () => ({ state: "ready" as const, message: "ready" });
  ensureReady = this.getStatus;
  validateProfile = async () => ({ valid: true, issues: [] });
  generate = async (input: Parameters<WordGenerationEngine["generate"]>[0]) => ({
    algorithmVersion: "splitmix64-v1" as const,
    profileVersion: "wordgen-profile-v1" as const,
    seed: input.seed,
    candidates: input.concepts.flatMap((concept) =>
      Array.from({ length: input.candidatesPerConcept }, (_, candidateIndex) => ({
        conceptKey: concept.conceptKey,
        gloss: concept.gloss,
        romanized: `${concept.gloss}-${input.seed}-${candidateIndex}`,
        candidateIndex,
      }))
    ),
  });
}

describe("WordGenerationService", () => {
  it("keeps the seed as an exact decimal string and creates an uncommitted review batch", async () => {
    const service = new WordGenerationService(new DeterministicFakeEngine());
    const batch = await service.generate(
      "language",
      profile,
      "0018446744073709551615",
      builtInConcepts("swadesh-100").slice(0, 2),
      3,
      []
    );
    expect(batch.seed).toBe("18446744073709551615");
    expect(batch.status).toBe("draft");
    expect(batch.candidates).toHaveLength(6);
    expect(batch.candidates.every((candidate) => candidate.status === "pending")).toBe(true);
  });

  it("marks an existing form as a conflict", async () => {
    const engine = new DeterministicFakeEngine();
    const service = new WordGenerationService(engine);
    const concepts = [{ id: "c", conceptKey: "c", gloss: "water", position: 0 }];
    const batch = await service.generate("language", profile, "7", concepts, 1, [{
      id: "lexeme", languageId: "language", romanized: "water-7-0", ipa: "",
      partOfSpeech: "", status: "draft", sourceType: "manual", notes: "",
      createdAt: "", updatedAt: "", senses: [{ id: "sense", definition: "water", position: 0 }],
      morphemes: [],
    }]);
    expect(batch.candidates[0].conflicts[0].code).toBe("DUPLICATE_LEXEME");
  });

  it("requires an explicit insertion rule for infixes", () => {
    const service = new WordGenerationService(new DeterministicFakeEngine());
    const morpheme: Morpheme = {
      id: "m", languageId: "language", form: "n", type: "infix", meaning: "agent",
      applicablePartOfSpeech: "noun", status: "draft", compositionRule: { mode: "none" },
      notes: "", createdAt: "", updatedAt: "",
    };
    expect(() => service.derive("language", [], morpheme, "noun", [])).toThrow();
  });
});

describe("built-in concept lists", () => {
  it("ships versioned 100 and 207 item lists in stable order", () => {
    expect(builtInConceptCount("swadesh-100")).toBe(100);
    expect(builtInConceptCount("swadesh-207")).toBe(207);
    expect(builtInConcepts("swadesh-100")[0].gloss).toBe("I");
  });
});
