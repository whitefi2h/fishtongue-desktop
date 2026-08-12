export interface IpaValidationResult {
  valid: boolean;
  segments: string[];
  unknown: Array<{ symbol: string; position: number }>;
}

export interface SegmentDescription {
  segment: string;
  features: Record<string, number | string>;
}

export interface RankedSegmentMapping {
  source: string;
  target: string;
  distance: number;
}

export interface PhonologyAnalysisEngine {
  validateIpa(input: { ipa: string }): Promise<IpaValidationResult>;
  describeSegments(input: { ipa: string }): Promise<SegmentDescription[]>;
  rankMappings(
    input: {
      sourceIpa: string;
      targetPhonemes: string[];
      distanceWeights?: Record<string, number>;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<RankedSegmentMapping[]>;
}
