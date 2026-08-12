import { syncWordGenerationConfigFromPhonology } from "@/fishtongue/application/services/PhonologyWordGenerationSync";
import { PhonologyProfile, WordGenerationConfig } from "@/fishtongue/domain/models";

const current: WordGenerationConfig = {
  categories: [],
  templates: [],
  syllableCounts: [{ count: 2, weight: 3 }],
  forbiddenPatterns: ["old"],
  rewriteRules: [{ pattern: "aa", replacement: "a" }],
  maxAttemptsPerCandidate: 321,
};

const phonology: PhonologyProfile = {
  id: "phonology-1",
  languageId: "language-1",
  structureVersion: "phonology-profile-v1",
  syllableTemplates: ["CV", "CVN"],
  legalOnsets: ["p", "t"],
  legalNuclei: ["a"],
  legalCodas: ["n"],
  legalClusters: [],
  forbiddenPatterns: ["nn$"],
  stressRules: {},
  toneRules: {},
  phonemes: [
    { id: "p", profileId: "phonology-1", ipa: "p", displaySymbol: "p", category: "consonant", role: "phoneme", distribution: "", source: "manual", notes: "", position: 0 },
    { id: "a", profileId: "phonology-1", ipa: "a", displaySymbol: "a", category: "vowel", role: "phoneme", distribution: "", source: "manual", notes: "", position: 1 },
    { id: "p-asp", profileId: "phonology-1", ipa: "pʰ", displaySymbol: "ph", category: "consonant", role: "allophone", parentPhonemeId: "p", distribution: "", source: "manual", notes: "", position: 2 },
  ],
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
};

describe("formal phonology to word-generation draft", () => {
  it("imports phonemes, templates and forbidden patterns without importing allophones", () => {
    const result = syncWordGenerationConfigFromPhonology(phonology, current);

    expect(result.categories).toEqual([
      { name: "C", symbols: [{ value: "p", weight: 1 }] },
      { name: "V", symbols: [{ value: "a", weight: 1 }] },
      { name: "N", symbols: [{ value: "n", weight: 1 }] },
    ]);
    expect(result.templates).toEqual([
      { pattern: "{C}{V}", weight: 1 },
      { pattern: "{C}{V}{N}", weight: 1 },
    ]);
    expect(result.forbiddenPatterns).toEqual(["nn$"]);
  });

  it("preserves generation-only settings", () => {
    const result = syncWordGenerationConfigFromPhonology(phonology, current);

    expect(result.syllableCounts).toEqual(current.syllableCounts);
    expect(result.rewriteRules).toEqual(current.rewriteRules);
    expect(result.maxAttemptsPerCandidate).toBe(321);
  });
});
