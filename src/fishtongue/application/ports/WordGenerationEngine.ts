import {
  Concept,
  WordGenerationConfig,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import { LexurgyEngineStatus } from "@/fishtongue/application/ports/SoundChangeEngine";

export interface WordGenerationValidationIssue {
  path: string;
  message: string;
}

export interface WordGenerationValidationResult {
  valid: boolean;
  issues: WordGenerationValidationIssue[];
}

export interface WordGenerationInput {
  profile: WordGenerationProfile;
  seed: string;
  concepts: Concept[];
  candidatesPerConcept: number;
}

export interface GeneratedWord {
  conceptKey: string;
  gloss: string;
  romanized: string;
  candidateIndex: number;
}

export interface WordGenerationResult {
  algorithmVersion: "splitmix64-v1";
  profileVersion: "wordgen-profile-v1";
  seed: string;
  candidates: GeneratedWord[];
}

export interface WordGenerationEngine {
  getStatus(): Promise<LexurgyEngineStatus>;
  ensureReady(): Promise<LexurgyEngineStatus>;
  validateProfile(
    profile: WordGenerationConfig
  ): Promise<WordGenerationValidationResult>;
  generate(
    input: WordGenerationInput,
    signal?: AbortSignal
  ): Promise<WordGenerationResult>;
}
