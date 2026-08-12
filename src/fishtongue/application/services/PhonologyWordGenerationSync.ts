import {
  PhonologyProfile,
  WeightedSymbol,
  WordGenerationConfig,
} from "@/fishtongue/domain/models";

function uniqueSymbols(values: string[]): WeightedSymbol[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].map(
    (value) => ({ value, weight: 1 })
  );
}

function generationTemplate(template: string): string {
  return template
    .trim()
    .replace(/C/g, "{C}")
    .replace(/V/g, "{V}")
    .replace(/N/g, "{N}");
}

/**
 * Creates an editable word-generation draft from the language's formal phonology.
 * Generation-only choices stay intact so synchronising does not silently change
 * randomness, rewrite behaviour, or the number of syllables produced.
 */
export function syncWordGenerationConfigFromPhonology(
  phonology: PhonologyProfile,
  current: WordGenerationConfig
): WordGenerationConfig {
  const phonemes = phonology.phonemes
    .filter((phoneme) => phoneme.role === "phoneme")
    .sort((left, right) => left.position - right.position);
  const consonants = uniqueSymbols(
    phonemes
      .filter((phoneme) => phoneme.category === "consonant")
      .map((phoneme) => phoneme.displaySymbol || phoneme.ipa)
  );
  const vowels = uniqueSymbols(
    phonemes
      .filter((phoneme) => phoneme.category === "vowel")
      .map((phoneme) => phoneme.displaySymbol || phoneme.ipa)
  );
  const templates = phonology.syllableTemplates
    .map(generationTemplate)
    .filter(Boolean);
  const needsNucleusEnding = templates.some((template) => template.includes("{N}"));

  return {
    categories: [
      ...(consonants.length ? [{ name: "C", symbols: consonants }] : []),
      ...(vowels.length ? [{ name: "V", symbols: vowels }] : []),
      ...(needsNucleusEnding && phonology.legalCodas.length
        ? [{ name: "N", symbols: uniqueSymbols(phonology.legalCodas) }]
        : []),
    ],
    templates: [...new Set(templates)].map((pattern) => ({ pattern, weight: 1 })),
    syllableCounts: current.syllableCounts,
    forbiddenPatterns: [...phonology.forbiddenPatterns],
    rewriteRules: current.rewriteRules,
    maxAttemptsPerCandidate: current.maxAttemptsPerCandidate,
  };
}
