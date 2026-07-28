import {
  AiApplication,
  AiContextBroker,
  AiProviderConfigStore,
  AiProviderPort,
  AiStreamEvent,
} from "@/fishtongue/application/ports/AiPorts";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  AiConversation,
  AiConversationDetail,
  AiMessage,
  AiProposal,
  AiProposalKind,
  AiProviderConfig,
} from "@/fishtongue/domain/models";
import AiProposalService, { canonicalHash } from "./AiProposalService";
import { v4 as uuid } from "uuid";

const PRIVACY_CONSENT_VERSION = 1;
const ALLOWED_KINDS = new Set<AiProposalKind>([
  "lexeme.upsert", "morpheme.upsert", "wordgen_profile.upsert",
  "evolution.update_draft", "inflection_system.update_draft",
]);

export default class AiAssistantService implements AiApplication {
  constructor(
    private readonly providers: AiProviderPort,
    private readonly configs: AiProviderConfigStore,
    private readonly conversations: import("@/fishtongue/application/ports/AiPorts").AiConversationRepository,
    private readonly context: AiContextBroker,
    private readonly project: ProjectApplication,
    private readonly proposalService: AiProposalService
  ) {}

  listProviderConfigs() { return this.configs.list(); }
  providerHasSecret(id: string) { return this.providers.secretStatus(id); }
  listModels(config: AiProviderConfig) { return this.providers.listModels(config); }
  testConnection(config: AiProviderConfig, modelId: string) {
    return this.providers.testConnection(config, modelId);
  }
  listConversations(projectId: string) { return this.conversations.list(projectId); }
  loadConversation(id: string) { return this.conversations.load(id); }

  async saveProviderConfig(config: AiProviderConfig, secret?: string): Promise<void> {
    validateConfig(config);
    await this.configs.save(config);
    if (secret?.trim()) await this.providers.setSecret(config.id, secret);
  }

  async deleteProviderConfig(id: string): Promise<void> {
    await this.providers.deleteSecret(id);
    await this.configs.delete(id);
  }

  async createConversation(input: {
    projectId: string; languageId?: string; provider: AiProviderConfig; modelId: string;
    scope: AiConversation["contextScope"]; allowExpansion: boolean;
  }): Promise<AiConversation> {
    const now = new Date().toISOString();
    const value: AiConversation = {
      id: uuid(), projectId: input.projectId, languageId: input.languageId,
      title: "新对话", providerKind: input.provider.kind, providerLabel: input.provider.name,
      modelId: input.modelId, contextScope: input.scope,
      allowExpansion: input.allowExpansion, createdAt: now, updatedAt: now,
    };
    await this.conversations.create(value);
    await this.project.markProjectChanged();
    return value;
  }

  async deleteConversation(id: string): Promise<void> {
    await this.conversations.delete(id);
    await this.project.markProjectChanged();
  }

  async clearConversations(projectId: string): Promise<void> {
    await this.conversations.clear(projectId);
    await this.project.markProjectChanged();
  }

  async send(input: {
    conversation: AiConversation; prompt: string;
    ui: import("@/fishtongue/application/ports/AiPorts").AiUiContext;
    onEvent: (event: AiStreamEvent) => void; signal?: AbortSignal;
  }): Promise<AiConversationDetail> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("请输入问题。");
    const provider = (await this.configs.list()).find(
      (item) => item.name === input.conversation.providerLabel && item.enabled
    );
    if (!provider) throw new Error("当前 AI 服务未启用。");
    if (provider.privacyConsentVersion !== PRIVACY_CONSENT_VERSION) {
      throw new Error("使用前请在 AI 设置中确认联网隐私说明。");
    }
    if (!(await this.providers.secretStatus(provider.id))) {
      throw new Error("当前 AI 服务尚未设置 API Key。");
    }
    const context = await this.context.buildContext({
      ui: input.ui, scope: input.conversation.contextScope,
      allowExpansion: input.conversation.allowExpansion,
    });
    const now = new Date().toISOString();
    const updatedConversation: AiConversation = {
      ...input.conversation,
      title: input.conversation.title === "新对话" ? prompt.slice(0, 32) : input.conversation.title,
      contextScope: input.conversation.contextScope,
      allowExpansion: input.conversation.allowExpansion,
      updatedAt: now,
    };
    await this.conversations.update(updatedConversation);
    const userMessage: AiMessage = {
      id: uuid(), conversationId: input.conversation.id, role: "user",
      content: prompt, status: "complete", providerKind: provider.kind,
      providerLabel: provider.name, modelId: input.conversation.modelId,
      usage: {}, createdAt: now,
    };
    await this.conversations.saveUserMessage(userMessage);
    const existing = await this.conversations.load(input.conversation.id);
    const history: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      existing.messages.slice(-20).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    history.unshift({ role: "system", content: proposalInstructions(input.ui.languageId) });
    try {
      const result = await this.providers.streamTurn({
        provider,
        modelId: input.conversation.modelId,
        messages: history,
        context: context.content,
      }, input.onEvent, input.signal);
      const parsed = await parseResponse(result.content, input.ui.languageId, this.project);
      const message: AiMessage = {
        id: uuid(), conversationId: input.conversation.id, role: "assistant",
        content: parsed.content, status: "complete", providerKind: provider.kind,
        providerLabel: provider.name, modelId: input.conversation.modelId,
        usage: result.usage, createdAt: new Date().toISOString(),
      };
      const proposals = parsed.proposals.map((proposal) => ({
        ...proposal, messageId: message.id, createdAt: message.createdAt, updatedAt: message.createdAt,
      }));
      await this.conversations.saveCompletedTurn({
        conversationId: input.conversation.id,
        message,
        proposals,
        audit: {
          id: uuid(), messageId: message.id, providerKind: provider.kind,
          providerLabel: provider.name, modelId: input.conversation.modelId,
          endpointLabel: new URL(provider.baseUrl).origin,
          contextScope: context.scope, context: context.content,
          references: context.references, toolCalls: [],
          contextBytes: context.bytes, outcome: "complete", createdAt: message.createdAt,
        },
      });
      await this.project.markProjectChanged();
      return this.conversations.load(input.conversation.id);
    } catch (error) {
      await this.project.markProjectChanged();
      throw error;
    }
  }

  cancel() { return this.providers.cancel(); }
  rejectProposal(id: string) { return this.proposalService.reject(id); }
  applyProposal(id: string) { return this.proposalService.apply(id); }
}

function validateConfig(config: AiProviderConfig): void {
  if (!config.name.trim()) throw new Error("服务名称不能为空。");
  if (!config.defaultModel.trim()) throw new Error("请填写默认模型。");
  const url = new URL(config.baseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.username || url.password || url.search || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
    throw new Error("服务地址必须使用 HTTPS；只有本机地址可以使用 HTTP，且不能包含凭据或查询参数。");
  }
}

function proposalInstructions(languageId?: string): string {
  return `You are read-only. Never claim changes were saved. If the user explicitly asks for an editable change,
append one JSON block exactly as:
\`\`\`fishtongue-proposals
[{"kind":"lexeme.upsert","targetId":null,"summary":"...","patch":{}}]
\`\`\`
Allowed kinds: lexeme.upsert, morpheme.upsert, wordgen_profile.upsert,
evolution.update_draft, inflection_system.update_draft. Maximum 5. Never propose deletion,
batch acceptance, execution, or project/language changes. Current language id: ${languageId ?? "none"}.`;
}

async function parseResponse(
  raw: string,
  languageId: string | undefined,
  project: ProjectApplication
): Promise<{ content: string; proposals: Omit<AiProposal, "messageId" | "createdAt" | "updatedAt">[] }> {
  const match = raw.match(/```fishtongue-proposals\s*([\s\S]*?)```/i);
  if (!match || !languageId) return { content: raw.trim(), proposals: [] };
  let values: unknown;
  try { values = JSON.parse(match[1]); } catch { return { content: raw.trim(), proposals: [] }; }
  if (!Array.isArray(values)) return { content: raw.trim(), proposals: [] };
  const proposals = [];
  for (const value of values.slice(0, 5)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (!ALLOWED_KINDS.has(item.kind as AiProposalKind) || !item.patch || typeof item.patch !== "object") continue;
    const targetId = typeof item.targetId === "string" ? item.targetId : undefined;
    const current = await targetFor(project, item.kind as AiProposalKind, languageId, targetId);
    proposals.push({
      id: uuid(), kind: item.kind as AiProposalKind, languageId, targetId,
      baseSnapshotHash: current ? await canonicalHash(current) : "new",
      patch: item.patch as Record<string, unknown>,
      summary: String(item.summary ?? "AI 修改提案"), status: "pending" as const,
    });
  }
  return { content: raw.replace(match[0], "").trim(), proposals };
}

async function targetFor(project: ProjectApplication, kind: AiProposalKind, languageId: string, id?: string) {
  if (!id) return null;
  if (kind === "lexeme.upsert") return (await project.listLexemes(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "morpheme.upsert") return (await project.listMorphemes(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "wordgen_profile.upsert") return (await project.listWordGenerationProfiles(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "evolution.update_draft") return project.getEvolution(languageId);
  return project.getInflectionSystem(languageId);
}
