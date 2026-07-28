import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { AiConversationRepository } from "@/fishtongue/application/ports/AiPorts";
import {
  AiProposal,
  Evolution,
  InflectionSystem,
  Lexeme,
  Morpheme,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";

export default class AiProposalService {
  constructor(
    private readonly project: ProjectApplication,
    private readonly repository: AiConversationRepository,
    private readonly wordGeneration: WordGenerationService
  ) {}

  async reject(id: string): Promise<void> {
    const proposal = await this.requireProposal(id);
    if (proposal.status === "applied") throw new Error("已应用的提案不能拒绝。");
    await this.repository.updateProposal({
      ...proposal,
      status: "rejected",
      updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  async apply(id: string): Promise<void> {
    const proposal = await this.requireProposal(id);
    if (!["pending", "staged"].includes(proposal.status)) {
      throw new Error("该提案已经处理，不能再次应用。");
    }
    const current = await this.currentTarget(proposal);
    const currentHash = current ? await canonicalHash(current) : "new";
    if (currentHash !== proposal.baseSnapshotHash) {
      await this.repository.updateProposal({
        ...proposal, status: "stale", updatedAt: new Date().toISOString(),
      });
      await this.project.markProjectChanged();
      throw new Error("目标数据已经改变，旧提案已标记为过期。");
    }
    await this.commit(proposal, current);
    await this.repository.updateProposal({
      ...proposal, status: "applied", updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  private async commit(proposal: AiProposal, current: unknown): Promise<void> {
    const now = new Date().toISOString();
    const id = proposal.targetId ?? crypto.randomUUID();
    const patch = proposal.patch;
    switch (proposal.kind) {
      case "lexeme.upsert": {
        const value = mergeObject(current, patch) as Partial<Lexeme>;
        await this.project.saveLexeme({
          id, languageId: proposal.languageId,
          romanized: requireString(value.romanized, "词形"),
          ipa: String(value.ipa ?? ""), partOfSpeech: String(value.partOfSpeech ?? ""),
          status: value.status ?? "draft", sourceType: value.sourceType ?? "manual",
          notes: String(value.notes ?? ""), senses: Array.isArray(value.senses) ? value.senses : [],
          morphemes: Array.isArray(value.morphemes) ? value.morphemes : [],
          createdAt: value.createdAt ?? now, updatedAt: now,
        });
        return;
      }
      case "morpheme.upsert": {
        const value = mergeObject(current, patch) as Partial<Morpheme>;
        await this.project.saveMorpheme({
          id, languageId: proposal.languageId,
          form: requireString(value.form, "语素形式"),
          meaning: requireString(value.meaning, "语素含义"),
          type: value.type ?? "root", applicablePartOfSpeech: String(value.applicablePartOfSpeech ?? ""),
          status: value.status ?? "draft", compositionRule: value.compositionRule ?? { mode: "none" },
          notes: String(value.notes ?? ""), createdAt: value.createdAt ?? now, updatedAt: now,
        });
        return;
      }
      case "wordgen_profile.upsert": {
        const value = mergeObject(current, patch) as Partial<WordGenerationProfile>;
        if (!value.config) throw new Error("提案缺少造词配置。");
        const validation = await this.wordGeneration.validateProfile({
          id, languageId: proposal.languageId, name: String(value.name ?? "AI 提案"),
          config: value.config, configVersion: "wordgen-profile-v1",
          isDefault: Boolean(value.isDefault), createdAt: value.createdAt ?? now, updatedAt: now,
        });
        if (!validation.valid) throw new Error(validation.issues[0]?.message ?? "造词配置无效。");
        await this.project.saveWordGenerationProfile({
          id, languageId: proposal.languageId,
          name: requireString(value.name, "配置名称"),
          config: value.config, configVersion: "wordgen-profile-v1",
          isDefault: Boolean(value.isDefault), createdAt: value.createdAt ?? now, updatedAt: now,
        });
        return;
      }
      case "evolution.update_draft": {
        const value = mergeObject(current, patch) as unknown as Evolution;
        await this.project.saveEvolution({
          ...value, id, languageId: proposal.languageId, updatedAt: now,
          soundChanges: String(value.soundChanges ?? ""),
          testWords: Array.isArray(value.testWords) ? value.testWords : [],
        });
        return;
      }
      case "inflection_system.update_draft": {
        const value = mergeObject(current, patch) as unknown as InflectionSystem;
        if (!value.rules || typeof value.rules !== "object") {
          throw new Error("屈折规则结构无效。");
        }
        await this.project.saveInflectionSystem({
          ...value, id, languageId: proposal.languageId, updatedAt: now,
          testCases: Array.isArray(value.testCases) ? value.testCases : [],
        });
      }
    }
  }

  private async currentTarget(proposal: AiProposal): Promise<unknown> {
    if (!proposal.targetId) return null;
    switch (proposal.kind) {
      case "lexeme.upsert":
        return (await this.project.listLexemes(proposal.languageId))
          .find((item) => item.id === proposal.targetId) ?? null;
      case "morpheme.upsert":
        return (await this.project.listMorphemes(proposal.languageId))
          .find((item) => item.id === proposal.targetId) ?? null;
      case "wordgen_profile.upsert":
        return (await this.project.listWordGenerationProfiles(proposal.languageId))
          .find((item) => item.id === proposal.targetId) ?? null;
      case "evolution.update_draft":
        return this.project.getEvolution(proposal.languageId);
      case "inflection_system.update_draft":
        return this.project.getInflectionSystem(proposal.languageId);
    }
  }

  private async requireProposal(id: string): Promise<AiProposal> {
    const proposal = await this.repository.getProposal(id);
    if (!proposal) throw new Error("AI 提案不存在。");
    return proposal;
  }
}

export async function canonicalHash(value: unknown): Promise<string> {
  const text = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function mergeObject(current: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...(current && typeof current === "object" ? current : {}), ...patch };
}
function requireString(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label}不能为空。`);
  return text;
}
