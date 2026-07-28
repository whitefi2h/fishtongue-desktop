import ProjectAiContextBroker from "@/fishtongue/application/services/ProjectAiContextBroker";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { canonicalHash } from "@/fishtongue/application/services/AiProposalService";

describe("Phase 4 AI safety boundaries", () => {
  it("keeps page scope small and marks project data as untrusted", async () => {
    const application = {
      getSnapshot: () => ({
        project: { id: "p", name: "项目" },
        languages: [{ id: "l", projectId: "p", name: "语言" }],
      }),
    } as unknown as ProjectApplication;
    const result = await new ProjectAiContextBroker(application).buildContext({
      ui: {
        route: "lexicon", pageTitle: "词典", projectId: "p",
        projectName: "项目", languageId: "l", languageName: "语言",
      },
      scope: "page",
      allowExpansion: false,
    });
    expect(result.content.notice).toContain("untrusted");
    expect(result.content).not.toHaveProperty("lexemes");
    expect(result.references.map((item) => item.type)).toEqual(["page", "language"]);
  });

  it("uses stable canonical hashes for stale-proposal detection", async () => {
    await expect(canonicalHash({ b: 2, a: 1 })).resolves.toEqual(
      await canonicalHash({ a: 1, b: 2 })
    );
    await expect(canonicalHash({ a: 2 })).resolves.not.toEqual(
      await canonicalHash({ a: 1 })
    );
  });
});
