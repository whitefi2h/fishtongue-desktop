import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
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
    private readonly stageResolver: StageStateResolver
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

  async commitBorrowing(batchId: string, candidateIds: string[]) {
    const result = await this.adaptation.commit(batchId, candidateIds);
    await this.changed();
    return result;
  }

  async discardBorrowing(batchId: string) {
    await this.batches.discard(batchId, new Date().toISOString());
    await this.changed();
  }
}
