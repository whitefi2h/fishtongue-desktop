import {
  AiContextAudit,
  AiContextReference,
  AiContextScope,
  AiConversation,
  AiConversationDetail,
  AiMessage,
  AiModel,
  AiProposal,
  AiProviderConfig,
  AiProviderKind,
} from "@/fishtongue/domain/models";

export type AiErrorCode =
  | "NO_PROVIDER"
  | "MISSING_CREDENTIAL"
  | "INVALID_ENDPOINT"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "MODEL_NOT_FOUND"
  | "CONTEXT_LIMIT"
  | "NETWORK_UNAVAILABLE"
  | "TIMEOUT"
  | "CANCELLED"
  | "PROVIDER_RESPONSE_INVALID"
  | "TOOL_CALL_INVALID"
  | "PROPOSAL_STALE"
  | "VALIDATION_FAILED";

export interface AiTurnInput {
  provider: AiProviderConfig;
  modelId: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  context: Record<string, unknown>;
}

export type AiStreamEvent =
  | { type: "started" }
  | { type: "text"; text: string }
  | { type: "completed"; usage?: Record<string, unknown> }
  | { type: "error"; code: AiErrorCode; message: string };

export interface AiTurnResult {
  content: string;
  usage: Record<string, unknown>;
}

export interface AiProviderPort {
  secretStatus(configId: string): Promise<boolean>;
  setSecret(configId: string, secret: string): Promise<void>;
  deleteSecret(configId: string): Promise<void>;
  listModels(config: AiProviderConfig): Promise<AiModel[]>;
  testConnection(config: AiProviderConfig, modelId: string): Promise<void>;
  streamTurn(
    input: AiTurnInput,
    onEvent: (event: AiStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AiTurnResult>;
  cancel(): Promise<void>;
}

export interface AiProviderConfigStore {
  list(): Promise<AiProviderConfig[]>;
  save(config: AiProviderConfig): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface AiConversationRepository {
  list(projectId: string): Promise<AiConversation[]>;
  load(conversationId: string): Promise<AiConversationDetail>;
  create(value: AiConversation): Promise<void>;
  update(value: AiConversation): Promise<void>;
  delete(conversationId: string): Promise<void>;
  clear(projectId: string): Promise<void>;
  saveUserMessage(value: AiMessage): Promise<void>;
  saveCompletedTurn(input: {
    conversationId: string;
    message: AiMessage;
    proposals: AiProposal[];
    audit: AiContextAudit;
  }): Promise<void>;
  updateProposal(value: AiProposal): Promise<void>;
  getProposal(id: string): Promise<AiProposal | null>;
}

export interface AiUiContext {
  route: string;
  pageTitle: string;
  projectId: string;
  projectName: string;
  languageId?: string;
  languageName?: string;
  selectedEntityId?: string;
}

export interface AiContextPackage {
  scope: AiContextScope;
  content: Record<string, unknown>;
  references: AiContextReference[];
  bytes: number;
  truncated: boolean;
}

export interface AiContextBroker {
  buildContext(input: {
    ui: AiUiContext;
    scope: AiContextScope;
    allowExpansion: boolean;
  }): Promise<AiContextPackage>;
}

export interface AiApplication {
  listProviderConfigs(): Promise<AiProviderConfig[]>;
  saveProviderConfig(config: AiProviderConfig, secret?: string): Promise<void>;
  deleteProviderConfig(id: string): Promise<void>;
  providerHasSecret(id: string): Promise<boolean>;
  listModels(config: AiProviderConfig): Promise<AiModel[]>;
  testConnection(config: AiProviderConfig, modelId: string): Promise<void>;
  listConversations(projectId: string): Promise<AiConversation[]>;
  loadConversation(id: string): Promise<AiConversationDetail>;
  createConversation(input: {
    projectId: string;
    languageId?: string;
    provider: AiProviderConfig;
    modelId: string;
    scope: AiContextScope;
    allowExpansion: boolean;
  }): Promise<AiConversation>;
  deleteConversation(id: string): Promise<void>;
  clearConversations(projectId: string): Promise<void>;
  send(input: {
    conversation: AiConversation;
    prompt: string;
    ui: AiUiContext;
    onEvent: (event: AiStreamEvent) => void;
    signal?: AbortSignal;
  }): Promise<AiConversationDetail>;
  cancel(): Promise<void>;
  rejectProposal(id: string): Promise<void>;
  applyProposal(id: string): Promise<void>;
}

export const AI_PROVIDER_DEFAULTS: Record<Exclude<AiProviderKind, "openai_compatible">, string> = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  deepseek: "https://api.deepseek.com",
};
