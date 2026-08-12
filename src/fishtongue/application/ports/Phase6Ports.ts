import { BorrowingBatch, BorrowingCandidate, BorrowingProfile, PhonologyProfile } from "@/fishtongue/domain/models";

export interface PhonologyRepository {
  getOrCreate(languageId: string): Promise<PhonologyProfile>;
  save(profile: PhonologyProfile): Promise<void>;
}

export interface BorrowingProfileRepository {
  list(targetLanguageId: string, sourceLanguageId?: string): Promise<BorrowingProfile[]>;
  save(profile: BorrowingProfile): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface BorrowingBatchRepository {
  list(targetLanguageId: string): Promise<BorrowingBatch[]>;
  get(id: string): Promise<BorrowingBatch | null>;
  create(batch: BorrowingBatch): Promise<void>;
  saveCandidate(candidate: BorrowingCandidate): Promise<void>;
  commitAtomic(input: {
    batchId: string;
    candidateIds: string[];
    committedAt: string;
  }): Promise<{ lexemeIds: string[]; relationIds: string[] }>;
  discard(id: string, updatedAt: string): Promise<void>;
}
