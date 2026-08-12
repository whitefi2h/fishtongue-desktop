import {
  BorrowingBatch,
  BorrowingCandidate,
  BorrowingProfile,
  Lexeme,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import { BorrowingBatchRepository } from "@/fishtongue/application/ports/Phase6Ports";
import {
  PhonologyAnalysisEngine,
  RankedSegmentMapping,
} from "@/fishtongue/application/ports/PhonologyAnalysisEngine";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import { validatePhonotactics } from "@/fishtongue/application/services/PhonotacticsService";
import { normalizeIpaForAnalysis } from "@/fishtongue/application/services/IpaNormalization";

export interface BorrowingLexurgyStage {
  id: string;
  name: string;
  soundChanges: string;
}

export interface BorrowingPreviewInput {
  profile: BorrowingProfile;
  phonology: PhonologyProfile;
  sourceLexemes: Lexeme[];
  temporaryIpa?: Record<string, string>;
  lexurgyStages?: BorrowingLexurgyStage[];
}

interface AdaptationVariant {
  form: string;
  distance: number;
  trace: Array<Record<string, unknown>>;
  warnings: string[];
}

export default class BorrowingAdaptationService {
  constructor(
    private readonly analysis: PhonologyAnalysisEngine,
    private readonly batches: BorrowingBatchRepository,
    private readonly soundChanges?: SoundChangeService
  ) {}

  async preview(
    input: BorrowingPreviewInput,
    signal?: AbortSignal
  ): Promise<BorrowingBatch> {
    if (input.profile.sourceLanguageId === input.profile.targetLanguageId) {
      throw new Error("借入的来源语言必须与当前目标语言不同。");
    }
    if (input.sourceLexemes.length === 0 || input.sourceLexemes.length > 500) {
      throw new Error("一次请选择 1 至 500 个来源词。");
    }
    const savedTargetPhonemes = input.phonology.phonemes
      .filter((value) => value.role === "phoneme")
      .sort((left, right) => left.position - right.position)
      .map((value) => value.ipa);
    if (savedTargetPhonemes.length === 0) {
      throw new Error("目标语言还没有正式音位表，请先在语音学中建立音位。");
    }
    const savedTargetByAnalysisIpa = new Map<string, string>();
    for (const ipa of savedTargetPhonemes) {
      const analysisIpa = normalizeIpaForAnalysis(ipa);
      if (!savedTargetByAnalysisIpa.has(analysisIpa)) {
        savedTargetByAnalysisIpa.set(analysisIpa, ipa);
      }
    }
    const targetPhonemes = [...savedTargetByAnalysisIpa.keys()];

    const now = new Date().toISOString();
    const batchId = crypto.randomUUID();
    const candidates: BorrowingCandidate[] = [];
    let position = 0;

    const validatedSources = new Map<
      string,
      { sourceIpa: string; analysisIpa: string; segments: string[] }
    >();
    const sourceProblems: string[] = [];
    for (const lexeme of input.sourceLexemes) {
      this.throwIfCancelled(signal);
      const sourceIpa = (input.temporaryIpa?.[lexeme.id] ?? lexeme.ipa).trim();
      if (!sourceIpa) {
        sourceProblems.push(`${lexeme.romanized}：缺少 IPA`);
        continue;
      }
      const analysisIpa = normalizeIpaForAnalysis(sourceIpa);
      const validation = await this.analysis.validateIpa({ ipa: analysisIpa });
      if (!validation.valid) {
        const symbols = validation.unknown.map((value) => value.symbol).join("、");
        sourceProblems.push(
          `${lexeme.romanized}：${symbols ? `无法识别 ${symbols}` : "IPA 无效"}`
        );
        continue;
      }
      validatedSources.set(lexeme.id, {
        sourceIpa,
        analysisIpa,
        segments: validation.segments,
      });
    }
    if (sourceProblems.length) {
      throw new Error(`无法生成借词候选：${sourceProblems.join("；")}`);
    }

    for (const lexeme of input.sourceLexemes) {
      this.throwIfCancelled(signal);
      const validated = validatedSources.get(lexeme.id)!;
      const sourceIpa = validated.sourceIpa;
      const mappings = await this.analysis.rankMappings(
        {
          sourceIpa: validated.analysisIpa,
          targetPhonemes,
          distanceWeights: input.profile.config.distanceWeights,
          limit: input.profile.config.candidateCount,
        },
        signal
      );
      const variants = this.buildVariants(
        validated.segments,
        mappings.map((mapping) => ({
          ...mapping,
          target:
            savedTargetByAnalysisIpa.get(
              normalizeIpaForAnalysis(mapping.target)
            ) ?? mapping.target,
        })),
        input.profile,
        input.phonology
      );
      for (const variant of variants) {
        candidates.push({
          id: crypto.randomUUID(),
          batchId,
          sourceLexemeId: lexeme.id,
          sourceForm: lexeme.romanized,
          sourceIpa,
          adaptedForm: variant.form,
          adaptedIpa: variant.form,
          partOfSpeech:
            input.profile.config.morphology?.partOfSpeech ??
            lexeme.partOfSpeech,
          senses: lexeme.senses.map((sense) => ({
            definition: sense.definition,
            position: sense.position,
          })),
          morphemeIds: input.profile.config.morphology?.morphemeIds ?? [],
          trace: variant.trace,
          distance: variant.distance,
          warnings: variant.warnings,
          explanation: "由显式映射、PanPhon 相似度和借词修复规则确定。",
          status: "pending",
          position: position++,
        });
      }
    }

    if (input.lexurgyStages?.length) {
      if (!this.soundChanges)
        throw new Error("Lexurgy 当前不可用，无法预览历史演化。");
      let currentForms = candidates.map((candidate) => candidate.adaptedForm);
      for (const stage of input.lexurgyStages) {
        this.throwIfCancelled(signal);
        if (!stage.soundChanges.trim()) {
          throw new Error(`阶段“${stage.name}”没有可运行的 Lexurgy 规则。`);
        }
        const result = await this.soundChanges.run(
          {
            changes: stage.soundChanges,
            inputWords: currentForms,
            traceWords: currentForms,
          },
          () => undefined,
          signal
        );
        if (result.outputWords.length !== candidates.length) {
          throw new Error(
            `阶段“${stage.name}”返回的结果数量与候选数量不一致。`
          );
        }
        candidates.forEach((candidate, index) => {
          const before = currentForms[index];
          const after = result.outputWords[index] ?? before;
          candidate.evolvedForm = after;
          candidate.trace.push({
            step: "lexurgy",
            stageId: stage.id,
            stageName: stage.name,
            before,
            after,
            rules: result.ruleNames,
            intermediateWords: Object.fromEntries(
              Object.entries(result.intermediateWords).map(([name, values]) => [
                name,
                values[index],
              ])
            ),
            trace: result.traces[before] ?? [],
          });
          for (const error of result.errors.filter(
            (value) => !value.originalWord || value.originalWord === before
          )) {
            candidate.warnings.push(`Lexurgy ${stage.name}：${error.message}`);
          }
        });
        currentForms = result.outputWords;
      }
    }

    const batch: BorrowingBatch = {
      id: batchId,
      profileId: input.profile.id,
      sourceLanguageId: input.profile.sourceLanguageId,
      sourceStageId: input.profile.sourceStageId,
      targetLanguageId: input.profile.targetLanguageId,
      targetStageId: input.profile.targetStageId,
      sourceSnapshot: input.sourceLexemes.map((value) => ({
        id: value.id,
        form: value.romanized,
        ipa: input.temporaryIpa?.[value.id] ?? value.ipa,
        partOfSpeech: value.partOfSpeech,
        senses: value.senses,
      })),
      phonologySnapshot: input.phonology as unknown as Record<string, unknown>,
      profileSnapshot: JSON.parse(JSON.stringify(input.profile.config)),
      snapshotHash: await stableHash({
        profile: input.profile.config,
        phonology: input.phonology,
        sources: input.sourceLexemes.map((value) => value.id),
      }),
      panphonVersion: "0.22.2",
      algorithmVersion: "borrowing-adaptation-v1",
      lexurgyStageChain: input.lexurgyStages?.map((stage) => stage.id) ?? [],
      status: "draft",
      candidates,
      createdAt: now,
      updatedAt: now,
    };
    await this.batches.create(batch);
    return batch;
  }

  commit(batchId: string, candidateIds: string[]) {
    if (candidateIds.length === 0)
      throw new Error("请至少选择一个已接受候选。");
    return this.batches.commitAtomic({
      batchId,
      candidateIds,
      committedAt: new Date().toISOString(),
    });
  }

  private buildVariants(
    segments: string[],
    mappings: RankedSegmentMapping[],
    profile: BorrowingProfile,
    phonology: PhonologyProfile
  ): AdaptationVariant[] {
    const mappingBySource = new Map<string, RankedSegmentMapping[]>();
    for (const mapping of mappings) {
      const values = mappingBySource.get(mapping.source) ?? [];
      if (!values.some((value) => value.target === mapping.target))
        values.push(mapping);
      mappingBySource.set(mapping.source, values);
    }
    const explicitBySource = new Map(
      profile.config.explicitMappings.map((value) => [
        normalizeIpaForAnalysis(value.source),
        value.targets,
      ])
    );
    const count = Math.max(1, Math.min(profile.config.candidateCount, 10));
    const maxAttempts = Math.max(
      count,
      Math.min(profile.config.maxSearchAttempts, 10_000)
    );
    const variants: AdaptationVariant[] = [];

    for (
      let variantIndex = 0;
      variantIndex < maxAttempts && variants.length < count;
      variantIndex += 1
    ) {
      const trace: Array<Record<string, unknown>> = [];
      let distance = 0;
      let choiceIndex = variantIndex;
      const mapped = segments.map((segment) => {
        const explicit = explicitBySource.get(segment);
        const ranked = mappingBySource.get(segment) ?? [];
        const choices = explicit?.length
          ? explicit.map((target) => ({ target, distance: 0, explicit: true }))
          : ranked.map((value) => ({ ...value, explicit: false }));
        const selectedIndex = choices.length ? choiceIndex % choices.length : 0;
        choiceIndex = choices.length
          ? Math.floor(choiceIndex / choices.length)
          : choiceIndex;
        const choice = choices[selectedIndex];
        const selected: {
          target: string;
          distance: number;
          explicit: boolean;
        } = choice
          ? choice
          : {
              target: segment,
              distance: Number.POSITIVE_INFINITY,
              explicit: false,
            };
        distance += selected.distance;
        trace.push({
          step: selected.explicit ? "explicit_mapping" : "panphon_mapping",
          source: segment,
          target: selected.target,
          distance: selected.distance,
        });
        return selected.target;
      });
      let form = mapped.join("");

      for (const step of profile.config.repairOrder) {
        const before = form;
        if (step === "replace") {
          for (const rule of profile.config.replacementRules) {
            form = form.replace(this.safeRegex(rule.pattern), rule.replacement);
          }
        } else if (step === "delete") {
          for (const pattern of profile.config.deletionRules) {
            form = form.replace(this.safeRegex(pattern), "");
          }
        } else if (step === "insert") {
          form = this.repairIllegalClusters(form, profile, phonology);
        } else if (step === "resyllabify") {
          // Resyllabification is represented by the deterministic cluster repair
          // above; this marker keeps the execution trace explicit.
          trace.push({ step, before, after: form, strategy: "target_phonotactics" });
        }
        if (form !== before) trace.push({ step, before, after: form });
      }
      trace.push({ step: "stress", strategy: profile.config.stressStrategy });
      trace.push({ step: "tone", strategy: profile.config.toneStrategy });
      if (profile.config.morphology) {
        trace.push({
          step: "morphology",
          morphemeIds: profile.config.morphology.morphemeIds,
          partOfSpeech: profile.config.morphology.partOfSpeech,
        });
      }
      if (!form) continue;
      variants.push({
        form,
        distance,
        trace,
        warnings: validatePhonotactics(form, phonology).warnings,
      });
    }

    const unique = new Map<string, AdaptationVariant>();
    for (const variant of variants.sort((a, b) =>
      a.distance - b.distance || compareCodePoints(a.form, b.form)
    )) {
      if (!unique.has(variant.form)) unique.set(variant.form, variant);
    }
    return [...unique.values()].slice(0, count);
  }

  private repairIllegalClusters(
    form: string,
    profile: BorrowingProfile,
    phonology: PhonologyProfile
  ): string {
    const insertion = profile.config.epenthesis[0]?.phoneme;
    if (!insertion) return form;
    const inventory = phonology.phonemes
      .filter((value) => value.role === "phoneme")
      .sort((left, right) => right.ipa.length - left.ipa.length);
    const symbols = this.tokenize(form, inventory.map((value) => value.ipa));
    if (!symbols) return form;
    const category = new Map(inventory.map((value) => [value.ipa, value.category]));
    const repaired: string[] = [];
    for (const symbol of symbols) {
      const previous = repaired.at(-1);
      if (
        previous &&
        category.get(previous) === "consonant" &&
        category.get(symbol) === "consonant" &&
        !phonology.legalClusters.includes(`${previous}${symbol}`)
      ) {
        repaired.push(insertion);
      }
      repaired.push(symbol);
    }
    return repaired.join("");
  }

  private tokenize(form: string, inventory: string[]): string[] | undefined {
    const normalized = form.normalize("NFC");
    const result: string[] = [];
    let offset = 0;
    while (offset < normalized.length) {
      const match = inventory.find((symbol) => normalized.startsWith(symbol, offset));
      if (!match) return undefined;
      result.push(match);
      offset += match.length;
    }
    return result;
  }

  private safeRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern, "gu");
    } catch {
      throw new Error(`借词方案包含无效正则表达式：${pattern}`);
    }
  }

  private throwIfCancelled(signal?: AbortSignal) {
    if (signal?.aborted)
      throw new DOMException("借词分析已取消。", "AbortError");
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left.normalize("NFC"), (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right.normalize("NFC"), (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

async function stableHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) =>
    item.toString(16).padStart(2, "0")
  ).join("");
}
