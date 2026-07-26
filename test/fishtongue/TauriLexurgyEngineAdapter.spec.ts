import { normalizeSoundChangeRunResult } from "@/fishtongue/infrastructure/TauriLexurgyEngineAdapter";

describe("TauriLexurgyEngineAdapter", () => {
  it("normalizes collections omitted by a successful Lexurgy response", () => {
    expect(normalizeSoundChangeRunResult({
      ruleNames: ["Raise"],
      outputWords: ["eme"],
      traces: {
        ama: [{ rule: "Raise", output: "eme" }],
      },
    })).toEqual({
      ruleNames: ["Raise"],
      outputWords: ["eme"],
      intermediateWords: {},
      traces: {
        ama: [{ rule: "Raise", output: "eme" }],
      },
      errors: [],
    });
  });
});
