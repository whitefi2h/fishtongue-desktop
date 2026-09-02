import { invoke } from "@tauri-apps/api/core";
import { PhonologyAnalysisEngine, IpaValidationResult, RankedSegmentMapping, SegmentDescription } from "@/fishtongue/application/ports/PhonologyAnalysisEngine";

export default class TauriPhonologyAnalysisAdapter implements PhonologyAnalysisEngine {
  validateIpa(input: { ipa: string }): Promise<IpaValidationResult> {
    return this.invokeAnalysis("analysis_validate_ipa", input);
  }
  validateIpas(input: { ipas: string[] }): Promise<IpaValidationResult[]> {
    return this.invokeAnalysis("analysis_validate_ipas", input);
  }
  describeSegments(input: { ipa: string }): Promise<SegmentDescription[]> {
    return this.invokeAnalysis("analysis_describe_segments", input);
  }
  rankMappings(
    input: {
      sourceIpa: string;
      targetPhonemes: string[];
      distanceWeights?: Record<string, number>;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<RankedSegmentMapping[]> {
    return this.invokeAnalysis("analysis_rank_segment_mappings", input, signal);
  }

  private async invokeAnalysis<T>(
    command: string,
    input: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void invoke("analysis_cancel", { requestId }).catch(() => undefined);
    };
    if (signal?.aborted) throw new DOMException("PanPhon 分析已取消。", "AbortError");
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await invoke<T>(command, { requestId, input });
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
}
