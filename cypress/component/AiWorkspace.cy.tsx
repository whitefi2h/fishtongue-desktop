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
    send: async ({ conversation, prompt, onEvent }) => {
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
    stageProposal: async () => {},
    rejectProposal: async () => {},
    applyProposal: async () => {},
  };
  return {
    application,
    seedConfig: () => {
      configs = [{
        id: "provider", name: "测试服务", kind: "openai_compatible",
        baseUrl: "http://127.0.0.1:11434/v1", defaultModel: "test-model",
        enabled: true, isDefault: true, privacyConsentVersion: 1,
      }];
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
    />);
    cy.get("textarea[aria-label='询问当前页面']").type("检查词典");
    cy.contains("button", "发送").click();
    cy.contains("只读建议").should("be.visible");
  });
});
