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
import AiProposalService, {
  canonicalHash,
  normalizeProposalPatch,
} from "./AiProposalService";
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
  async updateConversationModel(
    id: string,
    provider: AiProviderConfig,
    modelId: string
  ): Promise<AiConversation> {
    const detail = await this.conversations.load(id);
    const next: AiConversation = {
      ...detail.conversation,
      providerKind: provider.kind,
      providerLabel: provider.name,
      modelId,
      updatedAt: new Date().toISOString(),
    };
    await this.conversations.update(next);
    await this.project.markProjectChanged();
    return next;
  }

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
    const history = buildConversationHistory(existing);
    history.unshift({ role: "system", content: proposalInstructions(input.ui.languageId) });
    try {
      const result = await this.providers.streamTurn({
        provider,
        modelId: input.conversation.modelId,
        messages: history,
        context: context.content,
      }, input.onEvent, input.signal);
      const parsed = await parseResponse(
        result.content,
        input.ui.languageId,
        this.project,
        existing
      );
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
  stageProposal(id: string, patch: Record<string, unknown>) {
    return this.proposalService.stage(id, patch);
  }
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
evolution.update_draft, inflection_system.update_draft. Maximum 50. Never propose deletion,
batch acceptance, execution, or project/language changes.
Use these patch shapes:
lexeme: {"romanized":"","ipa":"","partOfSpeech":"","senses":[{"definition":""}]};
morpheme: {"form":"","meaning":"","type":"root","compositionRule":{"mode":"none"}};
wordgen: {"name":"","config":{"categories":[{"name":"C","symbols":[{"value":"p","weight":1}]}],"templates":[{"pattern":"{C}{V}","weight":1}],"syllableCounts":[{"count":2,"weight":1}],"forbiddenPatterns":[],"rewriteRules":[{"pattern":"","replacement":""}],"maxAttemptsPerCandidate":100}}. Use symbols/value, pattern and count exactly; do not use members, template, min or max;
evolution: {"soundChanges":"Lexurgy rule text","testWords":[{"word":""}]};
inflection: {"rules":{"type":"formula","formula":{"type":"concat","parts":[{"type":"stem"},{"type":"form","form":"n"}]}},"testCases":[{"stem":"","categories":{}}]}. Valid rule types are form, formula and split. Valid formula types are stem, form and concat. Do not use shorthand rule types such as prefix or suffix.
For evolution soundChanges, output valid Lexurgy syntax, not linguistic pseudocode:
- Lexurgy keywords are lowercase and case-sensitive. Write "feature voiced", never "Feature voiced(+, -)".
- Prefer explicit symbol mappings unless every feature, value and symbol matrix is fully declared.
- Every named change rule has a unique name followed by a colon. Comments start with #.
- Do not use V, C or @name unless that class is declared in the same soundChanges string.
- A safe example is:
  class vowel {a, e, i, o, u}

  final-devoicing:
    {b, d, g} => {p, t, k} / _ $
  intervocalic-voicing:
    {p, t, k} => {b, d, g} / @vowel _ @vowel
Previous FishTongue proposals embedded in assistant history are authoritative conversation memory.
When the user asks for another, new or different proposal, compare against them and produce a materially different patch.
Current language id: ${languageId ?? "none"}.`;
}

const PROPOSAL_HISTORY_LIMIT = 18_000;

export function buildConversationHistory(
  detail: AiConversationDetail
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const messages = detail.messages.slice(-20);
  const included = new Map<string, Array<Pick<AiProposal, "kind" | "summary" | "status" | "patch">>>();
  let remaining = PROPOSAL_HISTORY_LIMIT;

  for (const message of [...messages].reverse()) {
    if (message.role !== "assistant" || remaining <= 0) continue;
    const proposals = detail.proposals
      .filter((proposal) => proposal.messageId === message.id)
      .slice(-50)
      .reverse();
    const values: Array<Pick<AiProposal, "kind" | "summary" | "status" | "patch">> = [];
    for (const proposal of proposals) {
      const value = {
        kind: proposal.kind,
        summary: proposal.summary,
        status: proposal.status,
        patch: proposal.patch,
      };
      const size = JSON.stringify(value).length;
      if (size > remaining) continue;
      values.unshift(value);
      remaining -= size;
    }
    if (values.length) included.set(message.id, values);
  }

  return messages.map((message) => {
    const proposals = included.get(message.id);
    return {
      role: message.role,
      content: proposals?.length
        ? `${message.content}\n\n<previous-fishtongue-proposals>\n${JSON.stringify(proposals)}\n</previous-fishtongue-proposals>`
        : message.content,
    };
  });
}

async function parseResponse(
  raw: string,
  languageId: string | undefined,
  project: ProjectApplication,
  conversation: AiConversationDetail
): Promise<{ content: string; proposals: Omit<AiProposal, "messageId" | "createdAt" | "updatedAt">[] }> {
  const match = raw.match(/```fishtongue-proposals\s*([\s\S]*?)```/i);
  if (!match || !languageId) return { content: raw.trim(), proposals: [] };
  let values: unknown;
  try { values = JSON.parse(match[1]); } catch { return { content: raw.trim(), proposals: [] }; }
  if (!Array.isArray(values)) return { content: raw.trim(), proposals: [] };
  const proposals = [];
  const proposalIssues: string[] = [];
  const existingFingerprints = new Set(
    await Promise.all(conversation.proposals.map((proposal) =>
      proposalFingerprint(proposal.kind, proposal.patch)
    ))
  );
  for (const value of values.slice(0, 50)) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    if (!ALLOWED_KINDS.has(item.kind as AiProposalKind) || !item.patch || typeof item.patch !== "object") continue;
    const targetId = typeof item.targetId === "string" ? item.targetId : undefined;
    const current = await targetFor(project, item.kind as AiProposalKind, languageId, targetId);
    try {
      const normalizedPatch = normalizeProposalPatch(
        item.kind as AiProposalKind,
        item.patch as Record<string, unknown>
      );
      const fingerprint = await proposalFingerprint(
        item.kind as AiProposalKind,
        normalizedPatch
      );
      if (existingFingerprints.has(fingerprint)) {
        proposalIssues.push("AI 返回了与本会话先前提案完全相同的内容。");
        continue;
      }
      existingFingerprints.add(fingerprint);
      proposals.push({
        id: uuid(), kind: item.kind as AiProposalKind, languageId, targetId,
        baseSnapshotHash: current ? await canonicalHash(current) : "new",
        patch: normalizedPatch,
        summary: String(item.summary ?? "AI 修改提案"), status: "pending" as const,
      });
    } catch (error) {
      proposalIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const content = raw.replace(match[0], "").trim();
  return {
    content: proposalIssues.length
      ? `${content}\n\n${proposalIssues.length} 项提案因格式不符合 FishTongue 规则而未进入审核。`
      : content,
    proposals,
  };
}

export async function proposalFingerprint(
  kind: AiProposalKind,
  patch: Record<string, unknown>
): Promise<string> {
  return `${kind}:${await canonicalHash(patch)}`;
}

async function targetFor(project: ProjectApplication, kind: AiProposalKind, languageId: string, id?: string) {
  if (!id) return null;
  if (kind === "lexeme.upsert") return (await project.listLexemes(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "morpheme.upsert") return (await project.listMorphemes(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "wordgen_profile.upsert") return (await project.listWordGenerationProfiles(languageId)).find((item) => item.id === id) ?? null;
  if (kind === "evolution.update_draft") return project.getEvolution(languageId);
  return project.getInflectionSystem(languageId);
}
