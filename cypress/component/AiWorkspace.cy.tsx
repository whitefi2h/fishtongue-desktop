import { AiApplication, AiStreamEvent } from "@/fishtongue/application/ports/AiPorts";
import {
  AiConversation,
  AiConversationDetail,
  AiProviderConfig,
} from "@/fishtongue/domain/models";
import { AiSettingsPage, AiSidebar } from "@/fishtongue/ui/AiWorkspace";

function fakeAi() {
  let configs: AiProviderConfig[] = [];
  let conversations: AiConversation[] = [];
  let failNextTurn = false;
  const details = new Map<string, AiConversationDetail>();
  const application: AiApplication = {
    listProviderConfigs: async () => structuredClone(configs),
    saveProviderConfig: async (config) => { configs = [structuredClone(config)]; },
    deleteProviderConfig: async () => { configs = []; },
    providerHasSecret: async () => true,
    listModels: async () => [{ id: "test-model", label: "Test model" }],
    testConnection: async () => {},
    listConversations: async () => structuredClone(conversations),
    loadConversation: async (id) => structuredClone(details.get(id)!),
    createConversation: async (input) => {
      const conversation: AiConversation = {
        id: "conversation", projectId: input.projectId, languageId: input.languageId,
        title: "新对话", providerKind: input.provider.kind, providerLabel: input.provider.name,
        modelId: input.modelId, contextScope: input.scope, allowExpansion: input.allowExpansion,
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      };
      conversations = [conversation];
      details.set(conversation.id, { conversation, messages: [], proposals: [], audits: [] });
      return conversation;
    },
    deleteConversation: async (id) => { conversations = conversations.filter((item) => item.id !== id); },
    clearConversations: async () => { conversations = []; },
    updateConversationModel: async (id, provider, modelId) => {
      const conversation = conversations.find((item) => item.id === id)!;
      Object.assign(conversation, {
        providerKind: provider.kind,
        providerLabel: provider.name,
        modelId,
      });
      details.get(id)!.conversation = conversation;
      return structuredClone(conversation);
    },
    send: async ({ conversation, prompt, onEvent }) => {
      if (failNextTurn) {
        failNextTurn = false;
        onEvent({
          type: "text",
          text: "```fishtongue-proposals\n[{\"kind\":\"lexeme.upsert\"",
        } satisfies AiStreamEvent);
        details.set(conversation.id, {
          conversation,
          messages: [{
            id: "failed-user", conversationId: conversation.id, role: "user", content: prompt,
            status: "complete", providerKind: conversation.providerKind,
            providerLabel: conversation.providerLabel, modelId: conversation.modelId,
            usage: {}, createdAt: "2026-01-01T00:00:00Z",
          }],
          proposals: [],
          audits: [],
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error("TOO_MANY_AI_PROPOSALS");
      }
      onEvent({ type: "text", text: "只读建议" } satisfies AiStreamEvent);
      const detail: AiConversationDetail = {
        conversation,
        messages: [
          {
            id: "u", conversationId: conversation.id, role: "user", content: prompt,
            status: "complete", providerKind: conversation.providerKind,
            providerLabel: conversation.providerLabel, modelId: conversation.modelId,
            usage: {}, createdAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "a", conversationId: conversation.id, role: "assistant", content: "只读建议",
            status: "complete", providerKind: conversation.providerKind,
            providerLabel: conversation.providerLabel, modelId: conversation.modelId,
            usage: {}, createdAt: "2026-01-01T00:00:01Z",
          },
        ],
        proposals: [],
        audits: [],
      };
      details.set(conversation.id, detail);
      return structuredClone(detail);
    },
    cancel: async () => {},
    stageProposal: async (id, patch) => {
      for (const detail of details.values()) {
        const proposal = detail.proposals.find((item) => item.id === id);
        if (proposal) Object.assign(proposal, { patch: structuredClone(patch), status: "staged" });
      }
    },
    rejectProposal: async (id) => {
      for (const detail of details.values()) {
        const proposal = detail.proposals.find((item) => item.id === id);
        if (proposal) proposal.status = "rejected";
      }
    },
    applyProposal: async (id) => {
      for (const detail of details.values()) {
        const proposal = detail.proposals.find((item) => item.id === id);
        if (proposal) proposal.status = "applied";
      }
    },
  };
  return {
    application,
    failNextTurn: () => { failNextTurn = true; },
    seedConfig: () => {
      configs = [{
        id: "provider", name: "测试服务", kind: "openai_compatible",
        baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "test-model",
        enabled: true, isDefault: true, privacyConsentVersion: 1,
        modelCache: {
          fetchedAt: "2026-01-01T00:00:00Z",
          values: [
            { id: "test-model", label: "Test model" },
            { id: "test-model-2", label: "Test model 2" },
          ],
        },
      }, {
        id: "provider-2", name: "备用服务", kind: "deepseek",
        defaultModel: "deepseek-test", enabled: true, isDefault: false,
        privacyConsentVersion: 1,
      }];
    },
    seedBatch: () => {
      const conversation: AiConversation = {
        id: "conversation", projectId: "p", languageId: "l",
        title: "批量造词", providerKind: "openai_compatible", providerLabel: "测试服务",
        modelId: "test-model", contextScope: "page", allowExpansion: false,
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      };
      conversations = [conversation];
      details.set(conversation.id, {
        conversation,
        messages: [{
          id: "a", conversationId: conversation.id, role: "assistant", content: "生成两个词条",
          status: "complete", providerKind: conversation.providerKind,
          providerLabel: conversation.providerLabel, modelId: conversation.modelId,
          usage: {}, createdAt: "2026-01-01T00:00:00Z",
        }],
        proposals: ["luma", "sari"].map((romanized, index) => ({
          id: `proposal-${index}`, messageId: "a", kind: "lexeme.upsert",
          languageId: "l", baseSnapshotHash: "new",
          patch: {
            romanized, ipa: "", partOfSpeech: "名词",
            senses: [{ definition: index ? "河流" : "月亮", position: 0 }],
          },
          summary: `新增 ${romanized}`, status: "pending",
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
        })),
        audits: [],
      });
    },
  };
}

describe("Phase 4 AI workspace", () => {
  it("keeps credentials masked in model settings", () => {
    const { application } = fakeAi();
    cy.mount(<AiSettingsPage ai={application} onStatus={() => {}} />);
    cy.get("input[type=password]").should("have.value", "");
    cy.contains("API Key 只保存在当前 Windows 用户").should("be.visible");
  });

  it("does not send prototype data without a real project", () => {
    const { application, seedConfig } = fakeAi();
    seedConfig();
    cy.mount(<AiSidebar
      ai={application}
      live={false}
      context={{ route: "lexicon", pageTitle: "词典", projectId: "preview", projectName: "原型" }}
      onClose={() => {}}
      onSettings={() => {}}
      onStatus={() => {}}
      onDeliver={() => {}}
    />);
    cy.contains("请先打开真实项目").should("be.visible");
    cy.get("textarea[aria-label='询问当前页面']").should("be.disabled");
  });

  it("sends through the application service and renders a persisted answer", () => {
    const { application, seedConfig } = fakeAi();
    seedConfig();
    cy.mount(<AiSidebar
      ai={application}
      live
      context={{ route: "lexicon", pageTitle: "词典", projectId: "p", projectName: "项目", languageId: "l" }}
      onClose={() => {}}
      onSettings={() => {}}
      onStatus={() => {}}
      onDeliver={() => {}}
    />);
    cy.get("textarea[aria-label='询问当前页面']").type("检查词典");
    cy.contains("button", "发送").click();
    cy.contains("只读建议").should("be.visible");
  });

  it("keeps the user turn visible and hides proposal JSON when persistence fails", () => {
    const { application, seedConfig, failNextTurn } = fakeAi();
    seedConfig();
    failNextTurn();
    const status = cy.stub().as("status");
    cy.mount(<AiSidebar
      ai={application}
      live
      context={{ route: "lexicon", pageTitle: "词典", projectId: "p", projectName: "项目", languageId: "l" }}
      onClose={() => {}}
      onSettings={() => {}}
      onStatus={status}
      onDeliver={() => {}}
    />);
    cy.get("textarea[aria-label='询问当前页面']").type("生成 10 个词条");
    cy.contains("button", "发送").click();
    cy.contains("生成 10 个词条").should("be.visible");
    cy.contains("正在整理回答与提案…").should("be.visible");
    cy.contains("fishtongue-proposals").should("not.exist");
    cy.get("@status").should("have.been.calledWith", "TOO_MANY_AI_PROPOSALS");
    cy.contains("正在回答").should("not.exist");
    cy.get("textarea[aria-label='询问当前页面']").should("have.value", "");
  });

  it("switches provider and model inside the sidebar", () => {
    const { application, seedConfig } = fakeAi();
    seedConfig();
    cy.mount(<AiSidebar
      ai={application}
      live
      context={{ route: "lexicon", pageTitle: "词典", projectId: "p", projectName: "项目", languageId: "l" }}
      onClose={() => {}}
      onSettings={() => {}}
      onStatus={() => {}}
      onDeliver={() => {}}
    />);
    cy.get("select[aria-label='AI 模型']").select("test-model-2")
      .should("have.value", "test-model-2");
    cy.get("select[aria-label='AI 服务']").select("provider-2");
    cy.get("select[aria-label='AI 模型']").should("have.value", "deepseek-test");
  });

  it("reviews multiple proposals in an editable dense table and refreshes project data", () => {
    const { application, seedConfig, seedBatch } = fakeAi();
    seedConfig();
    seedBatch();
    const changed = cy.stub().as("projectChanged");
    cy.mount(<AiSidebar
      ai={application}
      live
      context={{ route: "lexicon", pageTitle: "词典", projectId: "p", projectName: "项目", languageId: "l" }}
      onClose={() => {}}
      onSettings={() => {}}
      onStatus={() => {}}
      onDeliver={() => {}}
      onProjectDataChanged={changed}
    />);
    cy.contains("button", "审核这次生成的 2 项提案").click();
    cy.get("table").within(() => {
      cy.get("input[aria-label='词形']").first().clear().type("lumai");
      cy.get("input[aria-label='核心释义']").first().should("have.value", "月亮");
      cy.get("select[aria-label^='决定']").first().select("reject").select("accept")
        .should("have.value", "accept");
      cy.get("select[aria-label^='决定']").eq(1).select("reject")
        .should("have.value", "reject");
      cy.contains("button", "拒绝").should("not.exist");
    });
    cy.contains("button", "确认决定（2）").click();
    cy.get("@projectChanged").should("have.been.calledOnce");
    cy.contains("已保存").should("exist");
    cy.contains("已拒绝").should("exist");
    cy.get("select[aria-label^='决定']").eq(1).select("accept");
    cy.contains("button", "确认决定（1）").click();
    cy.get("@projectChanged").should("have.been.calledTwice");
  });
});
