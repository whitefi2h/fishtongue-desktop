import { validatePhonotactics } from "@/fishtongue/application/services/PhonotacticsService";
import { PhonologyProfile } from "@/fishtongue/domain/models";

const profile: PhonologyProfile = {
  id: "phonology",
  languageId: "language",
  structureVersion: "phonology-profile-v1",
  syllableTemplates: ["V", "CV", "CVC", "CCV", "CCVC"],
  legalOnsets: ["p", "t", "k", "m", "n", "s", "l", "r"],
  legalNuclei: ["a", "e", "i", "o", "u"],
  legalCodas: ["m", "n", "s", "l", "r"],
  legalClusters: ["pl", "pr", "tr", "kr", "kl"],
  forbiddenPatterns: ["[aeiou]{2,}", "pp", "tt", "kk", "mm", "nn", "ss", "ll", "rr"],
  stressRules: {},
  toneRules: {},
  phonemes: [..."ptkmnslraeiou"].map((ipa, position) => ({
    id: ipa,
    profileId: "phonology",
    ipa,
    displaySymbol: ipa,
    category: "aeiou".includes(ipa) ? ("vowel" as const) : ("consonant" as const),
    role: "phoneme" as const,
    distribution: "",
    source: "manual",
    notes: "",
    position,
  })),
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

test.each(["tiia", "ppa", "ssoo", "rran", "tkal", "psa", "ae"])(
  "rejects %s using the saved language phonotactics",
  (input) => {
    const result = validatePhonotactics(input, profile);
    expect(result.valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  }
);

test.each(["a", "pa", "pal", "pra"])(
  "accepts %s when it matches the inventory and templates",
  (input) => {
    expect(validatePhonotactics(input, profile)).toEqual(
      expect.objectContaining({ valid: true })
    );
  }
);

test.each(["ham", "haŋ", "pan"])(
  "supports nasal codas in the N slot of CVN for %s",
  (input) => {
    const nasalProfile: PhonologyProfile = {
      ...profile,
      syllableTemplates: ["V", "CV", "CVN"],
      legalOnsets: [...profile.legalOnsets, "h"],
      legalCodas: ["m", "n", "ŋ"],
      phonemes: [
        ...profile.phonemes,
        ...["h", "ŋ"].map((ipa, index) => ({
          ...profile.phonemes[0],
          id: ipa,
          ipa,
          displaySymbol: ipa,
          position: profile.phonemes.length + index,
        })),
      ],
    };
    const result = validatePhonotactics(input, nasalProfile);
    expect(result).toEqual(
      expect.objectContaining({ valid: true, structure: "CVN" })
    );
  }
);

test("treats C as any consonant, including a nasal consonant", () => {
  expect(validatePhonotactics("pam", profile)).toEqual(
    expect.objectContaining({ valid: true, structure: "CVC" })
  );
});

test("resolves a saved allophone through its parent phoneme", () => {
  const allophoneProfile: PhonologyProfile = {
    ...profile,
    phonemes: [
      ...profile.phonemes,
      {
        ...profile.phonemes.find((phoneme) => phoneme.ipa === "a")!,
        id: "schwa",
        ipa: "ə",
        displaySymbol: "ə",
        role: "allophone",
        parentPhonemeId: "a",
        position: profile.phonemes.length,
      },
    ],
  };
  expect(validatePhonotactics("mə", allophoneProfile)).toEqual(
    expect.objectContaining({ valid: true, segments: ["m", "ə"], structure: "CV" })
  );
});

test("reports the exact symbol missing from the formal inventory", () => {
  expect(validatePhonotactics("jamu", profile).warnings).toContain(
    "包含本语言正式音位表之外的符号：j"
  );
});

test("rejects unsupported template symbols instead of silently deleting them", () => {
  const result = validatePhonotactics("pa", {
    ...profile,
    syllableTemplates: ["CVX"],
  });
  expect(result.valid).toBe(false);
  expect(result.warnings).toContain(
    "音节模板包含不支持的符号：CVX（仅支持 C、V、N）"
  );
});

test("tokenizes a saved multi-code-point phoneme as one segment", () => {
  const affricate = "t͡s";
  const affricateProfile: PhonologyProfile = {
    ...profile,
    legalOnsets: [...profile.legalOnsets, affricate],
    phonemes: [
      ...profile.phonemes,
      {
        ...profile.phonemes[0],
        id: "affricate",
        ipa: affricate,
        displaySymbol: affricate,
        position: profile.phonemes.length,
      },
    ],
  };
  expect(validatePhonotactics(`${affricate}a`, affricateProfile)).toEqual(
    expect.objectContaining({ valid: true, segments: [affricate, "a"], structure: "CV" })
  );
});

test.each([
  ["g", "ɡ"],
  ["ɡ", "g"],
])("treats a saved %s and input %s as the same g phoneme", (saved, input) => {
  const gProfile: PhonologyProfile = {
    ...profile,
    syllableTemplates: ["CV"],
    legalOnsets: [saved],
    phonemes: [
      ...profile.phonemes,
      {
        ...profile.phonemes[0],
        id: `g-${saved}`,
        ipa: saved,
        displaySymbol: saved,
        position: profile.phonemes.length,
      },
    ],
  };
  expect(validatePhonotactics(`${input}a`, gProfile)).toEqual(
    expect.objectContaining({ valid: true, structure: "CV" })
  );
});
