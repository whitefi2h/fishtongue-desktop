import {
  AiConversationRepository,
} from "@/fishtongue/application/ports/AiPorts";
import { DatabaseSessionPort } from "@/fishtongue/application/ports/ProjectPorts";
import {
  AiContextAudit,
  AiConversation,
  AiConversationDetail,
  AiMessage,
  AiProposal,
} from "@/fishtongue/domain/models";

type ConversationRow = {
  id: string; project_id: string; language_id: string | null; title: string;
  provider_kind: AiConversation["providerKind"]; provider_label: string; model_id: string;
  context_scope: AiConversation["contextScope"]; allow_expansion: number;
  created_at: string; updated_at: string;
};
type MessageRow = {
  id: string; conversation_id: string; role: AiMessage["role"]; content: string;
  status: AiMessage["status"]; provider_kind: AiMessage["providerKind"];
  provider_label: string; model_id: string; usage_json: string; created_at: string;
};
type ProposalRow = {
  id: string; message_id: string; kind: AiProposal["kind"]; language_id: string;
  target_id: string | null; base_snapshot_hash: string; patch_json: string;
  summary: string; status: AiProposal["status"]; created_at: string; updated_at: string;
};
type AuditRow = {
  id: string; message_id: string; provider_kind: AiContextAudit["providerKind"];
  provider_label: string; model_id: string; endpoint_label: string;
  context_scope: AiContextAudit["contextScope"]; context_json: string;
  references_json: string; tool_calls_json: string; context_bytes: number;
  outcome: AiContextAudit["outcome"]; error_code: string | null; created_at: string;
};

export default class SqliteAiConversationRepository implements AiConversationRepository {
  constructor(private readonly database: DatabaseSessionPort) {}

  async list(projectId: string): Promise<AiConversation[]> {
    return (await this.database.select<ConversationRow>(
      "SELECT * FROM ai_conversations WHERE project_id=$1 ORDER BY updated_at DESC",
      [projectId]
    )).map(mapConversation);
  }

  async load(conversationId: string): Promise<AiConversationDetail> {
    const conversations = await this.database.select<ConversationRow>(
      "SELECT * FROM ai_conversations WHERE id=$1",
      [conversationId]
    );
    if (!conversations[0]) throw new Error("AI 会话不存在。");
    const messages = (await this.database.select<MessageRow>(
      "SELECT * FROM ai_messages WHERE conversation_id=$1 ORDER BY created_at",
      [conversationId]
    )).map(mapMessage);
    const messageIds = messages.map((message) => message.id);
    const proposals: AiProposal[] = [];
    const audits: AiContextAudit[] = [];
    for (const messageId of messageIds) {
      proposals.push(...(await this.database.select<ProposalRow>(
        "SELECT * FROM ai_proposals WHERE message_id=$1 ORDER BY created_at",
        [messageId]
      )).map(mapProposal));
      audits.push(...(await this.database.select<AuditRow>(
        "SELECT * FROM ai_context_audits WHERE message_id=$1 ORDER BY created_at",
        [messageId]
      )).map(mapAudit));
    }
    return {
      conversation: mapConversation(conversations[0]),
      messages,
      proposals,
      audits,
    };
  }

  async create(value: AiConversation): Promise<void> {
    await this.database.execute(
      `INSERT INTO ai_conversations
       (id,project_id,language_id,title,provider_kind,provider_label,model_id,
        context_scope,allow_expansion,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [value.id, value.projectId, value.languageId ?? null, value.title,
       value.providerKind, value.providerLabel, value.modelId, value.contextScope,
       value.allowExpansion ? 1 : 0, value.createdAt, value.updatedAt]
    );
  }

  async update(value: AiConversation): Promise<void> {
    await this.database.execute(
      `UPDATE ai_conversations SET title=$1,language_id=$2,provider_kind=$3,
       provider_label=$4,model_id=$5,context_scope=$6,allow_expansion=$7,updated_at=$8
       WHERE id=$9`,
      [value.title, value.languageId ?? null, value.providerKind, value.providerLabel,
       value.modelId, value.contextScope, value.allowExpansion ? 1 : 0,
       value.updatedAt, value.id]
    );
  }

  async delete(conversationId: string): Promise<void> {
    await this.database.execute("DELETE FROM ai_conversations WHERE id=$1", [conversationId]);
  }

  async clear(projectId: string): Promise<void> {
    await this.database.execute("DELETE FROM ai_conversations WHERE project_id=$1", [projectId]);
  }

  async saveUserMessage(value: AiMessage): Promise<void> {
    await this.database.execute(
      `INSERT INTO ai_messages
       (id,conversation_id,role,content,status,provider_kind,provider_label,model_id,usage_json,created_at)
       VALUES ($1,$2,'user',$3,$4,$5,$6,$7,$8,$9)`,
      [value.id, value.conversationId, value.content, value.status, value.providerKind,
       value.providerLabel, value.modelId, JSON.stringify(value.usage), value.createdAt]
    );
  }

  async saveCompletedTurn(input: {
    conversationId: string; message: AiMessage; proposals: AiProposal[]; audit: AiContextAudit;
  }): Promise<void> {
    const message = input.message;
    await this.database.execute(
      `INSERT INTO ai_turn_write_commands
       (id,conversation_id,message_json,proposals_json,audit_json)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        crypto.randomUUID(),
        input.conversationId,
        JSON.stringify({
          id: message.id, content: message.content, status: message.status,
          providerKind: message.providerKind, providerLabel: message.providerLabel,
          modelId: message.modelId, usageJson: JSON.stringify(message.usage),
          createdAt: message.createdAt,
        }),
        JSON.stringify(input.proposals.map((proposal) => ({
          id: proposal.id, kind: proposal.kind, languageId: proposal.languageId,
          targetId: proposal.targetId ?? null, baseSnapshotHash: proposal.baseSnapshotHash,
          patchJson: JSON.stringify(proposal.patch), summary: proposal.summary,
        }))),
        JSON.stringify({
          id: input.audit.id, providerKind: input.audit.providerKind,
          providerLabel: input.audit.providerLabel, modelId: input.audit.modelId,
          endpointLabel: input.audit.endpointLabel, contextScope: input.audit.contextScope,
          contextJson: JSON.stringify(input.audit.context),
          referencesJson: JSON.stringify(input.audit.references),
          toolCallsJson: JSON.stringify(input.audit.toolCalls),
          contextBytes: input.audit.contextBytes, outcome: input.audit.outcome,
          errorCode: input.audit.errorCode ?? null,
        }),
      ]
    );
  }

  async updateProposal(value: AiProposal): Promise<void> {
    await this.database.execute(
      `UPDATE ai_proposals SET patch_json=$1,summary=$2,status=$3,updated_at=$4 WHERE id=$5`,
      [JSON.stringify(value.patch), value.summary, value.status, value.updatedAt, value.id]
    );
  }

  async getProposal(id: string): Promise<AiProposal | null> {
    const rows = await this.database.select<ProposalRow>(
      "SELECT * FROM ai_proposals WHERE id=$1",
      [id]
    );
    return rows[0] ? mapProposal(rows[0]) : null;
  }
}

function mapConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id, projectId: row.project_id, languageId: row.language_id ?? undefined,
    title: row.title, providerKind: row.provider_kind, providerLabel: row.provider_label,
    modelId: row.model_id, contextScope: row.context_scope,
    allowExpansion: row.allow_expansion === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapMessage(row: MessageRow): AiMessage {
  return {
    id: row.id, conversationId: row.conversation_id, role: row.role, content: row.content,
    status: row.status, providerKind: row.provider_kind, providerLabel: row.provider_label,
    modelId: row.model_id, usage: JSON.parse(row.usage_json), createdAt: row.created_at,
  };
}
function mapProposal(row: ProposalRow): AiProposal {
  return {
    id: row.id, messageId: row.message_id, kind: row.kind, languageId: row.language_id,
    targetId: row.target_id ?? undefined, baseSnapshotHash: row.base_snapshot_hash,
    patch: JSON.parse(row.patch_json), summary: row.summary, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function mapAudit(row: AuditRow): AiContextAudit {
  return {
    id: row.id, messageId: row.message_id, providerKind: row.provider_kind,
    providerLabel: row.provider_label, modelId: row.model_id, endpointLabel: row.endpoint_label,
    contextScope: row.context_scope, context: JSON.parse(row.context_json),
    references: JSON.parse(row.references_json), toolCalls: JSON.parse(row.tool_calls_json),
    contextBytes: row.context_bytes, outcome: row.outcome,
    errorCode: row.error_code ?? undefined, createdAt: row.created_at,
  };
}
