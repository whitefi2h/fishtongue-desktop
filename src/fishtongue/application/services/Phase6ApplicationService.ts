import {
  BorrowingBatchDuplicateCheck,
  CommitBorrowingOptions,
  Phase6Application,
} from "@/fishtongue/application/ports/Phase6Application";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import {
  BorrowingBatchRepository,
  BorrowingProfileRepository,
  PhonologyRepository,
} from "@/fishtongue/application/ports/Phase6Ports";
import { LanguageStageRepository } from "@/fishtongue/application/ports/ProjectPorts";
import {
  BorrowingCandidate,
  BorrowingProfile,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import { PhonologyAnalysisEngine } from "@/fishtongue/application/ports/PhonologyAnalysisEngine";
import BorrowingAdaptationService, {
  BorrowingPreviewInput,
} from "@/fishtongue/application/services/BorrowingAdaptationService";
import StageStateResolver from "@/fishtongue/application/services/StageStateResolver";
import { validatePhonotactics } from "@/fishtongue/application/services/PhonotacticsService";
import { normalizeIpaForAnalysis } from "@/fishtongue/application/services/IpaNormalization";

export default class Phase6ApplicationService implements Phase6Application {
  constructor(
    private readonly phonology: PhonologyRepository,
    private readonly profiles: BorrowingProfileRepository,
    private readonly batches: BorrowingBatchRepository,
    private readonly stages: LanguageStageRepository,
    private readonly changed: () => Promise<void>,
    private readonly analysis: PhonologyAnalysisEngine,
    private readonly adaptation: BorrowingAdaptationService,
    private readonly stageResolver: StageStateResolver,
    private readonly history: Phase5Application
  ) {}

  async getPhonology(languageId: string, stageId?: string) {
    if (!stageId) return this.phonology.getOrCreate(languageId);
    const state = await this.stageResolver.resolve(stageId);
    const resolved = state.components.phonology;
    if (!resolved) return this.phonology.getOrCreate(languageId);
    return resolved as unknown as PhonologyProfile;
  }

  async savePhonology(profile: PhonologyProfile, stageId?: string) {
    const now = new Date().toISOString();
    if (stageId) {
      const stage = await this.stages.get(stageId);
      if (!stage) throw new Error("历史阶段不存在。");
      if (stage.storageMode === "no_data") {
        throw new Error("无记录阶段不能保存音系数据。");
      }
      await this.stages.saveOverride({
        id: `${stageId}:phonology`,
        stageId,
        componentType: "phonology",
        operation:
          stage.storageMode === "independent_snapshot" ? "replace" : "merge",
        targetId: "phonology",
        payload: {
          ...profile,
          languageId: stage.languageId,
          updatedAt: now,
        } as unknown as Record<string, unknown>,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await this.phonology.save({ ...profile, updatedAt: now });
    }
    await this.changed();
  }

  listBorrowingProfiles(targetLanguageId: string, sourceLanguageId?: string) {
    return this.profiles.list(targetLanguageId, sourceLanguageId);
  }

  async saveBorrowingProfile(value: BorrowingProfile) {
    if (value.sourceLanguageId === value.targetLanguageId) {
      throw new Error("来源语言与目标语言不能相同。");
    }
    await this.profiles.save(value);
    await this.changed();
  }

  listBorrowingBatches(targetLanguageId: string) {
    return this.batches.list(targetLanguageId);
  }

  async saveBorrowingCandidate(value: BorrowingCandidate) {
    await this.batches.saveCandidate(value);
    await this.changed();
  }

  validateIpa(ipa: string) {
    return this.analysis.validateIpa({ ipa: normalizeIpaForAnalysis(ipa) });
  }

  validatePhonotactics(form: string, profile: PhonologyProfile) {
    return validatePhonotactics(form, profile);
  }

  async previewBorrowing(
    input: BorrowingPreviewInput & { lexurgyStageIds?: string[] },
    signal?: AbortSignal
  ) {
    const lexurgyStages = [];
    let previousId: string | undefined;
    for (const stageId of input.lexurgyStageIds ?? []) {
      const stage = await this.stages.get(stageId);
      if (!stage || stage.languageId !== input.profile.targetLanguageId) {
        throw new Error("所选历史阶段不属于当前目标语言。");
      }
      if (stage.storageMode === "no_data") {
        throw new Error(`无记录阶段“${stage.name}”不能运行 Lexurgy。`);
      }
      if (previousId && stage.chronologyParentId !== previousId) {
        throw new Error(
          "所选历史阶段不是一条连续的时间父链，系统不会自动猜测路径。"
        );
      }
      const resolved = await this.stageResolver.resolve(stage.id);
      const evolution = resolved.components.evolution as
        | { soundChanges?: unknown }
        | undefined;
      lexurgyStages.push({
        id: stage.id,
        name: stage.name,
        soundChanges:
          typeof evolution?.soundChanges === "string"
            ? evolution.soundChanges
            : "",
      });
      previousId = stage.id;
    }
    return this.adaptation.preview({ ...input, lexurgyStages }, signal);
  }

  async checkBorrowingDuplicates(
    batchId: string,
    candidateIds: string[]
  ): Promise<BorrowingBatchDuplicateCheck> {
    const batch = await this.batches.get(batchId);
    if (!batch) throw new Error("借词审核批次不存在。");
    const selected = candidateIds.map((id) => {
      const candidate = batch.candidates.find((value) => value.id === id);
      if (!candidate) throw new Error("所选借词候选不属于当前审核批次。");
      return candidate;
    });
    const conflicts: BorrowingBatchDuplicateCheck["conflicts"] = [];

    for (const candidate of selected) {
      const targetForm = borrowingCandidateForm(candidate);
      const existing = await this.history.checkBorrowingDuplicate({
        sourceLexemeId: candidate.sourceLexemeId,
        sourceForm: candidate.sourceForm,
        targetForm,
      });
      if (existing.kind !== "none") {
        conflicts.push({
          candidateId: candidate.id,
          sourceLexemeId: candidate.sourceLexemeId,
          sourceForm: candidate.sourceForm,
          targetForm,
          conflictingTargetForm: existing.conflictingTargetForm ?? "",
          kind: existing.kind,
        });
      }

      const earlier = selected.find(
        (value) =>
          value.id !== candidate.id &&
          selected.indexOf(value) < selected.indexOf(candidate) &&
          sameBorrowingSource(value, candidate)
      );
      if (earlier) {
        const earlierForm = borrowingCandidateForm(earlier);
        conflicts.push({
          candidateId: candidate.id,
          sourceLexemeId: candidate.sourceLexemeId,
          sourceForm: candidate.sourceForm,
          targetForm,
          conflictingTargetForm: earlierForm,
          kind: sameWrittenForm(earlierForm, targetForm)
            ? "same_source_same_target_form"
            : "same_source_different_target",
        });
      }
    }

    return {
      kind: conflicts.some(
        (value) => value.kind === "same_source_same_target_form"
      )
        ? "same_source_same_target_form"
        : conflicts.length
          ? "same_source_different_target"
          : "none",
      conflicts,
    };
  }

  async commitBorrowing(
    batchId: string,
    candidateIds: string[],
    options: CommitBorrowingOptions = {}
  ) {
    const duplicate = await this.checkBorrowingDuplicates(batchId, candidateIds);
    if (duplicate.kind === "same_source_same_target_form") {
      throw new Error("批量借词中存在来源词和借词词形都相同的重复项，不能保存。");
    }
    if (
      duplicate.kind === "same_source_different_target" &&
      !options.confirmSameSource
    ) {
      throw new Error("批量借词中有来源词已建立过借词关系，请确认后再保存。");
    }
    const result = await this.adaptation.commit(batchId, candidateIds);
    await this.changed();
    return result;
  }

  async discardBorrowing(batchId: string) {
    await this.batches.discard(batchId, new Date().toISOString());
    await this.changed();
  }
}

function borrowingCandidateForm(candidate: BorrowingCandidate): string {
  return (candidate.evolvedForm || candidate.adaptedForm).trim();
}

function sameBorrowingSource(
  left: BorrowingCandidate,
  right: BorrowingCandidate
): boolean {
  if (left.sourceLexemeId || right.sourceLexemeId) {
    return Boolean(
      left.sourceLexemeId &&
        right.sourceLexemeId &&
        left.sourceLexemeId === right.sourceLexemeId
    );
  }
  return sameWrittenForm(left.sourceForm, right.sourceForm);
}

function sameWrittenForm(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.trim().normalize("NFC").toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}
