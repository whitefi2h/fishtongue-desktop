import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  canonicalHash,
  normalizeInflectionRules,
  normalizeProposalPatch,
  normalizeWordGenerationConfig,
} from "@/fishtongue/application/services/AiProposalService";
import AiProposalService from "@/fishtongue/application/services/AiProposalService";
import ProjectAiContextBroker from "@/fishtongue/application/services/ProjectAiContextBroker";
import {
  buildConversationHistory,
  proposalFingerprint,
} from "@/fishtongue/application/services/AiAssistantService";
import { AiConversationDetail } from "@/fishtongue/domain/models";

describe("Phase 4 AI safety boundaries", () => {
  it("includes current-page data and marks project data as untrusted", async () => {
    const application = {
      getSnapshot: () => ({
        project: { id: "p", name: "项目" },
        languages: [{ id: "l", projectId: "p", name: "语言" }],
      }),
      listLexemes: async () => [{
        id: "x",
        languageId: "l",
        romanized: "ama",
        ipa: "/ama/",
        partOfSpeech: "noun",
        status: "confirmed",
        sourceType: "manual",
        notes: "",
        senses: [{ id: "s", lexemeId: "x", definition: "mother", order: 0 }],
        morphemes: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      }],
      listWordGenerationProfiles: async () => [],
      listGenerationBatches: async () => [],
    } as unknown as ProjectApplication;

    const result = await new ProjectAiContextBroker(application).buildContext({
      ui: {
        route: "lexicon",
        pageTitle: "词典",
        projectId: "p",
        projectName: "项目",
        languageId: "l",
        languageName: "语言",
      },
      scope: "page",
      allowExpansion: false,
    });

    expect(result.content.notice).toContain("untrusted");
    expect(result.content.lexemes).toHaveLength(1);
    expect(result.references.map((item) => item.type)).toEqual(
      expect.arrayContaining(["page", "language", "lexeme"])
    );
  });

  it("uses stable canonical hashes for stale-proposal detection", async () => {
    await expect(canonicalHash({ b: 2, a: 1 })).resolves.toEqual(
      await canonicalHash({ a: 1, b: 2 })
    );
    await expect(canonicalHash({ a: 2 })).resolves.not.toEqual(
      await canonicalHash({ a: 1 })
    );
  });

  it("normalizes provider-shaped proposals before they reach editors", () => {
    expect(normalizeProposalPatch("lexeme.upsert", {
      word: "kavira",
      meaning: "星星",
      phonetic: "/ka.vi.ra/",
      partOfSpeech: "noun",
    })).toMatchObject({
      romanized: "kavira",
      ipa: "/ka.vi.ra/",
      partOfSpeech: "noun",
      senses: [{ definition: "星星", position: 0 }],
    });

    expect(normalizeProposalPatch("evolution.update_draft", {
      rules: [{ name: "voicing", soundChange: "p t k => b d g / V_V" }],
    })).toMatchObject({
      soundChanges: "voicing:\n  p t k => b d g / V_V",
    });

    expect(normalizeProposalPatch("inflection_system.update_draft", {
      rules: {
        type: "formula",
        formula: {
          type: "concat",
          parts: [{ type: "stem" }, { type: "form", form: "n" }],
        },
      },
    })).toMatchObject({
      rules: {
        type: "formula",
        formula: {
          type: "concat",
          parts: [{ type: "stem" }, { type: "form", form: "n" }],
        },
      },
    });
  });

  it("converts provider aliases in word-generation proposals without crashing", () => {
    expect(normalizeWordGenerationConfig({
      categories: [
        { name: "C", members: ["m", "n"] },
        { name: "V", members: ["a", "e"] },
      ],
      templates: [{ template: "C? V C?", weight: 1 }],
      syllableCounts: [
        { min: 2, max: 2, weight: 2 },
        { min: 3, max: 3, weight: 1 },
      ],
      forbiddenPatterns: ["[mn][mn]"],
      rewriteRules: [],
      maxAttemptsPerCandidate: 100,
    })).toMatchObject({
      categories: [
        { name: "C", symbols: [{ value: "m", weight: 1 }, { value: "n", weight: 1 }] },
        { name: "V", symbols: [{ value: "a", weight: 1 }, { value: "e", weight: 1 }] },
      ],
      templates: [
        { pattern: "{V}", weight: 1 },
        { pattern: "{V}{C}", weight: 1 },
        { pattern: "{C}{V}", weight: 1 },
        { pattern: "{C}{V}{C}", weight: 1 },
      ],
      syllableCounts: [{ count: 2, weight: 2 }, { count: 3, weight: 1 }],
    });
  });

  it("converts readable inflection shorthand to the engine rule grammar", () => {
    expect(normalizeInflectionRules({ type: "suffix", form: "{stem}n" })).toEqual({
      type: "formula",
      formula: {
        type: "concat",
        parts: [{ type: "stem" }, { type: "form", form: "n" }],
      },
    });
  });

  it("returns prior structured proposals to the model as bounded conversation memory", () => {
    const detail = {
      conversation: { id: "c" },
      messages: [
        { id: "u1", role: "user", content: "生成一个屈折提案" },
        { id: "a1", role: "assistant", content: "这是第一个提案。" },
        { id: "u2", role: "user", content: "再生成一个不同的提案" },
      ],
      proposals: [{
        id: "p1",
        messageId: "a1",
        kind: "inflection_system.update_draft",
        summary: "添加复数后缀 -n",
        status: "pending",
        patch: {
          rules: {
            type: "formula",
            formula: {
              type: "concat",
              parts: [{ type: "stem" }, { type: "form", form: "n" }],
            },
          },
        },
      }],
      audits: [],
    } as unknown as AiConversationDetail;

    const history = buildConversationHistory(detail);
    expect(history).toHaveLength(3);
    expect(history[1].content).toContain("<previous-fishtongue-proposals>");
    expect(history[1].content).toContain("添加复数后缀 -n");
    expect(history[2].content).toBe("再生成一个不同的提案");
  });

  it("blocks invalid Lexurgy proposals before they are delivered to the editor", async () => {
    const proposal = {
      id: "evolution-proposal",
      messageId: "message",
      kind: "evolution.update_draft",
      languageId: "language",
      baseSnapshotHash: "new",
      summary: "错误规则",
      status: "pending",
      patch: { soundChanges: "Feature voiced(+, -)" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as const;
    const updateProposal = jest.fn();
    const service = new AiProposalService(
      { markProjectChanged: jest.fn() } as unknown as ProjectApplication,
      {
        getProposal: async () => proposal,
        updateProposal,
      } as unknown as ConstructorParameters<typeof AiProposalService>[1],
      {} as ConstructorParameters<typeof AiProposalService>[2],
      {
        validate: async () => ({
          valid: false,
          issues: [{
            type: "parseError",
            message: "\"+\" doesn't make sense",
            lineNumber: 1,
            columnNumber: 16,
          }],
        }),
      } as unknown as ConstructorParameters<typeof AiProposalService>[3]
    );

    await expect(service.stage(proposal.id, proposal.patch)).rejects.toThrow(
      "Lexurgy 校验未通过：第 1 行第 16 列"
    );
    expect(updateProposal).not.toHaveBeenCalled();
  });

  it("uses proposal kind and normalized patch as a stable duplicate fingerprint", async () => {
    const patch = {
      rules: {
        type: "formula",
        formula: {
          type: "concat",
          parts: [{ type: "stem" }, { type: "form", form: "n" }],
        },
      },
    };
    await expect(proposalFingerprint("inflection_system.update_draft", patch))
      .resolves.toBe(await proposalFingerprint("inflection_system.update_draft", {
        rules: patch.rules,
      }));
    await expect(proposalFingerprint("evolution.update_draft", patch))
      .resolves.not.toBe(await proposalFingerprint("inflection_system.update_draft", patch));
  });
});
