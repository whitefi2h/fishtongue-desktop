import {
  BorrowingBatch,
  BorrowingCandidate,
  BorrowingProfile,
  Lexeme,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import { IpaValidationResult } from "@/fishtongue/application/ports/PhonologyAnalysisEngine";
import { PhonotacticsValidationResult } from "@/fishtongue/application/services/PhonotacticsService";

export interface Phase6Application {
  getPhonology(languageId: string, stageId?: string): Promise<PhonologyProfile>;
  savePhonology(profile: PhonologyProfile, stageId?: string): Promise<void>;
  listBorrowingProfiles(
    targetLanguageId: string,
    sourceLanguageId?: string
  ): Promise<BorrowingProfile[]>;
  saveBorrowingProfile(profile: BorrowingProfile): Promise<void>;
  listBorrowingBatches(targetLanguageId: string): Promise<BorrowingBatch[]>;
  saveBorrowingCandidate(candidate: BorrowingCandidate): Promise<void>;
  validateIpa(ipa: string): Promise<IpaValidationResult>;
  validatePhonotactics(
    form: string,
    profile: PhonologyProfile
  ): PhonotacticsValidationResult;
  previewBorrowing(
    input: {
      profile: BorrowingProfile;
      phonology: PhonologyProfile;
      sourceLexemes: Lexeme[];
      temporaryIpa?: Record<string, string>;
      lexurgyStageIds?: string[];
    },
    signal?: AbortSignal
  ): Promise<BorrowingBatch>;
  commitBorrowing(
    batchId: string,
    candidateIds: string[]
  ): Promise<{ lexemeIds: string[]; relationIds: string[] }>;
  discardBorrowing(batchId: string): Promise<void>;
}
