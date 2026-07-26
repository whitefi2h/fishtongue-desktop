import {
  WordGenerationEngine,
  WordGenerationInput,
  WordGenerationValidationResult,
} from "@/fishtongue/application/ports/WordGenerationEngine";
import {
  Concept,
  GenerationBatch,
  GenerationCandidate,
  Lexeme,
  Morpheme,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import { v4 as uuid } from "uuid";

const MAX_UINT64 = "18446744073709551615";

export default class WordGenerationService {
  constructor(private readonly engine: WordGenerationEngine) {}

  validateProfile(profile: WordGenerationProfile): Promise<WordGenerationValidationResult> {
    return this.engine.validateProfile(profile.config);
  }

  async generate(
    languageId: string,
    profile: WordGenerationProfile,
    seed: string,
    concepts: Concept[],
    candidatesPerConcept: number,
    lexemes: Lexeme[],
    signal?: AbortSignal
  ): Promise<GenerationBatch> {
    const normalizedSeed = validateSeed(seed);
    if (!concepts.length || concepts.length > 500) {
      throw new Error("一次请选择 1 到 500 个概念。");
    }
    if (candidatesPerConcept < 1 || candidatesPerConcept > 10) {
      throw new Error("每个概念可生成 1 到 10 个候选。");
    }
    const input: WordGenerationInput = {
      profile,
      seed: normalizedSeed,
      concepts,
      candidatesPerConcept,
    };
    const result = await this.engine.generate(input, signal);
    const existingForms = new Set(lexemes.map((value) => fold(value.romanized)));
    const batchForms = new Map<string, number>();
    result.candidates.forEach((value) => {
      const key = fold(value.romanized);
      batchForms.set(key, (batchForms.get(key) ?? 0) + 1);
    });
    const candidates: GenerationCandidate[] = result.candidates.map((value, position) => {
      const conflicts: GenerationCandidate["conflicts"] = [];
      const form = fold(value.romanized);
      if (existingForms.has(form)) {
        conflicts.push({ code: "DUPLICATE_LEXEME", message: "词典中已有相同词形。" });
      }
      if ((batchForms.get(form) ?? 0) > 1) {
        conflicts.push({ code: "DUPLICATE_CANDIDATE", message: "本批次中存在相同词形。" });
      }
      return {
        id: uuid(),
        position,
        conceptKey: value.conceptKey,
        gloss: value.gloss,
        romanized: value.romanized,
        ipa: "",
        partOfSpeech: "",
        status: "pending",
        conflicts,
        committedLexemeId: uuid(),
        committedSenseId: uuid(),
      };
    });
    return {
      id: uuid(),
      languageId,
      type: "basic",
      profileSnapshot: profile.config,
      profileVersion: result.profileVersion,
      algorithmVersion: result.algorithmVersion,
      seed: normalizedSeed,
      inputSnapshot: concepts,
      status: "draft",
      createdAt: new Date().toISOString(),
      candidates,
    };
  }

  derive(
    languageId: string,
    sourceLexemes: Lexeme[],
    morpheme: Morpheme,
    targetPartOfSpeech: string,
    existingLexemes: Lexeme[]
  ): GenerationBatch {
    const apply = compositionFunction(morpheme);
    const existing = new Set(existingLexemes.map((value) => fold(value.romanized)));
    const candidates = sourceLexemes.map<GenerationCandidate>((lexeme, position) => {
      const romanized = apply(lexeme.romanized);
      const conflicts: GenerationCandidate["conflicts"] = existing.has(fold(romanized))
        ? [{ code: "DUPLICATE_LEXEME", message: "词典中已有相同词形。" }]
        : [];
      return {
        id: uuid(),
        position,
        conceptKey: "",
        gloss: `${morpheme.meaning} · ${lexeme.senses[0]?.definition ?? lexeme.romanized}`,
        romanized,
        ipa: "",
        partOfSpeech: targetPartOfSpeech,
        status: "pending",
        conflicts,
        sourceLexemeId: lexeme.id,
        morphemeId: morpheme.id,
        committedLexemeId: uuid(),
        committedSenseId: uuid(),
      };
    });
    return {
      id: uuid(),
      languageId,
      type: "derivation",
      profileSnapshot: {
        categories: [],
        templates: [],
        syllableCounts: [],
        forbiddenPatterns: [],
        rewriteRules: [],
        maxAttemptsPerCandidate: 1,
      },
      profileVersion: "derivation-v1",
      algorithmVersion: "template-v1",
      seed: "0",
      inputSnapshot: [],
      status: "draft",
      createdAt: new Date().toISOString(),
      candidates,
    };
  }
}

function validateSeed(value: string): string {
  const normalized = value.trim().replace(/^0+(?=\d)/, "");
  if (!/^\d+$/.test(normalized)) throw new Error("随机种子必须是十进制非负整数。");
  if (
    normalized.length > MAX_UINT64.length ||
    (normalized.length === MAX_UINT64.length && normalized > MAX_UINT64)
  ) {
    throw new Error("随机种子超出 64 位范围。");
  }
  return normalized;
}

function fold(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase();
}

function compositionFunction(morpheme: Morpheme): (stem: string) => string {
  const rule = morpheme.compositionRule;
  if (rule.mode === "template") {
    if (!rule.template || occurrences(rule.template, "{stem}") !== 1) {
      throw new Error("语素组合模板必须且只能包含一个 {stem}。");
    }
    return (stem) =>
      rule.template!.replace("{stem}", stem).replaceAll("{morpheme}", morpheme.form);
  }
  if (rule.mode === "regex") {
    if (!rule.stemPattern || rule.replacement == null) {
      throw new Error("正则组合规则缺少匹配式或替换式。");
    }
    const pattern = new RegExp(rule.stemPattern);
    return (stem) =>
      stem.replace(pattern, rule.replacement!.replaceAll("{morpheme}", morpheme.form));
  }
  throw new Error("该语素尚未配置可执行的组合规则。");
}

function occurrences(value: string, target: string): number {
  return value.split(target).length - 1;
}
