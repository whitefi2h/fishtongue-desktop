import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { AiConversationRepository } from "@/fishtongue/application/ports/AiPorts";
import {
  AiProposal,
  Evolution,
  InflectionSystem,
  Lexeme,
  Morpheme,
  WordGenerationConfig,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";

export default class AiProposalService {
  constructor(
    private readonly project: ProjectApplication,
    private readonly repository: AiConversationRepository,
    private readonly wordGeneration: WordGenerationService,
    private readonly soundChange: SoundChangeService
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

  async stage(id: string, patch: Record<string, unknown>): Promise<void> {
    const proposal = await this.requireProposal(id);
    if (!["pending", "staged", "rejected"].includes(proposal.status)) {
      throw new Error("该提案已经处理，不能再编辑。");
    }
    if (!patch || Array.isArray(patch) || typeof patch !== "object") {
      throw new Error("提案字段必须是 JSON 对象。");
    }
    if (proposal.kind === "evolution.update_draft") {
      const soundChanges = String(patch.soundChanges ?? "").trim();
      if (!soundChanges) throw new Error("演化提案缺少 Lexurgy 音变规则。");
      const validation = await this.soundChange.validate({ changes: soundChanges });
      if (!validation.valid) {
        const issue = validation.issues[0];
        const location = issue.lineNumber
          ? `第 ${issue.lineNumber} 行${issue.columnNumber ? `第 ${issue.columnNumber} 列` : ""}`
          : "规则中";
        throw new Error(`Lexurgy 校验未通过：${location}，${issue.message}`);
      }
    }
    await this.repository.updateProposal({
      ...proposal,
      patch,
      status: "staged",
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
        const senses = Array.isArray(value.senses)
          ? value.senses.map((sense, position) => ({
              id: sense.id ?? crypto.randomUUID(),
              definition: requireString(sense.definition, "词义"),
              position,
            }))
          : [];
        if (!senses.length) throw new Error("词条至少需要一个词义。");
        await this.project.saveLexeme({
          id, languageId: proposal.languageId,
          romanized: requireString(value.romanized, "词形"),
          ipa: String(value.ipa ?? ""), partOfSpeech: String(value.partOfSpeech ?? ""),
          status: value.status ?? "draft", sourceType: value.sourceType ?? "manual",
          notes: String(value.notes ?? ""), senses,
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

export function normalizeProposalPatch(
  kind: AiProposal["kind"],
  patch: Record<string, unknown>
): Record<string, unknown> {
  const nested = objectValue(patch.draft);
  const source = nested ? { ...patch, ...nested } : patch;
  if (kind === "lexeme.upsert") {
    const meanings = arrayValue(source.senses).length
      ? arrayValue(source.senses)
      : arrayValue(source.meanings).length
        ? arrayValue(source.meanings)
        : [source.meaning ?? source.gloss].filter(Boolean);
    return {
      romanized: source.romanized ?? source.word ?? source.form ?? "",
      ipa: source.ipa ?? source.phonetic ?? "",
      partOfSpeech: source.partOfSpeech ?? source.pos ?? "未分类",
      status: source.status ?? "draft",
      sourceType: source.sourceType ?? "manual",
      notes: source.notes ?? "",
      senses: meanings.map((value, position) =>
        typeof value === "object" && value
          ? { ...(value as Record<string, unknown>), position }
          : { definition: String(value), position }
      ),
    };
  }
  if (kind === "morpheme.upsert") {
    return {
      form: source.form ?? source.morpheme ?? source.word ?? "",
      meaning: source.meaning ?? source.gloss ?? "",
      type: source.type ?? "root",
      applicablePartOfSpeech: source.applicablePartOfSpeech ?? source.partOfSpeech ?? "",
      status: source.status ?? "draft",
      compositionRule: source.compositionRule ?? { mode: "none" },
      notes: source.notes ?? "",
    };
  }
  if (kind === "wordgen_profile.upsert") {
    const config = objectValue(source.config) ?? {
      categories: source.categories ?? [],
      templates: source.templates ?? source.syllableTemplates ?? [],
      syllableCounts: source.syllableCounts ?? [{ count: 2, weight: 1 }],
      forbiddenPatterns:
        source.forbiddenPatterns ?? objectValue(source.phonotactics)?.forbiddenPatterns ?? [],
      rewriteRules: source.rewriteRules ?? [],
      maxAttemptsPerCandidate: source.maxAttemptsPerCandidate ?? 100,
    };
    const normalizedConfig = normalizeWordGenerationConfig(config);
    if (
      !normalizedConfig.categories.length
      || !normalizedConfig.templates.length
      || !normalizedConfig.syllableCounts.length
    ) {
      throw new Error("AI 造词配置缺少可用的音位类别、音节模板或音节数量。");
    }
    return {
      name: source.name ?? source.profileName ?? "AI 造词配置",
      config: normalizedConfig,
      isDefault: Boolean(source.isDefault),
    };
  }
  if (kind === "evolution.update_draft") {
    const changes = source.soundChanges ?? source.changes ?? rulesToLexurgy(source.rules);
    return {
      soundChanges: typeof changes === "string" ? changes : "",
      testWords: arrayValue(source.testWords).map((value, position) =>
        typeof value === "object" && value
          ? { ...(value as Record<string, unknown>), position }
          : { word: String(value), position }
      ),
    };
  }
  return {
    rules: normalizeInflectionRules(source.rules ?? source.paradigms ?? patch),
    testCases: source.testCases ?? source.tests ?? [],
  };
}

export function normalizeWordGenerationConfig(value: unknown): WordGenerationConfig {
  const source = objectValue(value) ?? {};
  const categories = arrayValue(source.categories).flatMap((value) => {
    const category = objectValue(value);
    if (!category) return [];
    const name = String(category.name ?? "").trim();
    const rawSymbols = arrayValue(category.symbols).length
      ? arrayValue(category.symbols)
      : arrayValue(category.members);
    const symbols = rawSymbols.flatMap((value) => {
      const symbol = objectValue(value);
      const text = String(symbol?.value ?? symbol?.symbol ?? value ?? "").trim();
      if (!text) return [];
      return [{ value: text, weight: positiveNumber(symbol?.weight, 1) }];
    });
    return name && symbols.length ? [{ name, symbols }] : [];
  });

  const categoryNames = new Set(categories.map((category) => category.name));
  const templates = arrayValue(source.templates).flatMap((value) => {
    const template = objectValue(value);
    if (!template) return [];
    const pattern = String(template.pattern ?? template.template ?? "").trim();
    if (!pattern) return [];
    return expandTemplatePattern(pattern, categoryNames).map((normalized) => ({
      pattern: normalized,
      weight: positiveNumber(template.weight, 1),
    }));
  });

  const syllableCounts = arrayValue(source.syllableCounts).flatMap((value) => {
    const item = objectValue(value);
    if (!item) return [];
    const weight = positiveNumber(item.weight, 1);
    if (positiveInteger(item.count)) {
      return [{ count: Number(item.count), weight }];
    }
    const minimum = positiveInteger(item.min) ? Number(item.min) : undefined;
    const maximum = positiveInteger(item.max) ? Number(item.max) : minimum;
    if (!minimum || !maximum || maximum < minimum || maximum - minimum > 20) return [];
    return Array.from({ length: maximum - minimum + 1 }, (_, index) => ({
      count: minimum + index,
      weight,
    }));
  });

  const forbiddenPatterns = arrayValue(source.forbiddenPatterns)
    .map(String)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  const rewriteRules = arrayValue(source.rewriteRules).flatMap((value) => {
    const rule = objectValue(value);
    if (!rule) return [];
    const pattern = String(rule.pattern ?? "").trim();
    if (!pattern) return [];
    return [{ pattern, replacement: String(rule.replacement ?? "") }];
  });

  return {
    categories,
    templates,
    syllableCounts,
    forbiddenPatterns,
    rewriteRules,
    maxAttemptsPerCandidate: Math.min(
      10_000,
      Math.max(
        1,
        positiveInteger(source.maxAttemptsPerCandidate)
          ? Number(source.maxAttemptsPerCandidate)
          : 100
      )
    ),
  };
}

export function normalizeInflectionRules(value: unknown): unknown {
  const rule = objectValue(value);
  if (!rule) throw new Error("AI 屈折提案缺少有效的 rules 对象。");
  const type = String(rule.type ?? "").trim();
  const rawForm = String(rule.form ?? "");
  if (type === "suffix" || type === "prefix") {
    const affix = rawForm.replaceAll("{stem}", "");
    if (!affix) throw new Error("AI 屈折提案的词缀不能为空。");
    const stem = { type: "stem" };
    const form = { type: "form", form: affix };
    return {
      type: "formula",
      formula: {
        type: "concat",
        parts: type === "prefix" ? [form, stem] : [stem, form],
      },
    };
  }
  if (type === "fixed") return { type: "form", form: rawForm };
  if (type === "stem") return { type: "formula", formula: { type: "stem" } };
  if (type === "form") return { type: "form", form: rawForm };
  if (type === "formula") {
    return { type: "formula", formula: normalizeInflectionFormula(rule.formula) };
  }
  if (type === "split") {
    const branches = objectValue(rule.branches);
    if (!branches || !Object.keys(branches).length) {
      throw new Error("AI 屈折提案的类别分支不能为空。");
    }
    return {
      type: "split",
      branches: Object.fromEntries(
        Object.entries(branches).map(([key, branch]) => [
          key,
          normalizeInflectionRules(branch),
        ])
      ),
    };
  }
  throw new Error(`AI 屈折提案使用了不支持的规则类型“${type || "空"}”。`);
}

function normalizeInflectionFormula(value: unknown): unknown {
  const formula = objectValue(value);
  if (!formula) throw new Error("AI 屈折提案缺少有效的 formula 对象。");
  const type = String(formula.type ?? "");
  if (type === "stem") return { type: "stem" };
  if (type === "form") return { type: "form", form: String(formula.form ?? "") };
  if (type === "concat") {
    const parts = arrayValue(formula.parts).map(normalizeInflectionFormula);
    if (!parts.length) throw new Error("AI 屈折提案的拼接规则不能为空。");
    return { type: "concat", parts };
  }
  throw new Error(`AI 屈折提案使用了不支持的公式类型“${type || "空"}”。`);
}

function expandTemplatePattern(pattern: string, categoryNames: Set<string>): string[] {
  if (pattern.includes("{")) return [pattern.replace(/\s+/g, "")];
  const tokens = pattern.split(/\s+/).filter(Boolean);
  let values = [""];
  for (const token of tokens) {
    const optional = token.endsWith("?");
    const name = optional ? token.slice(0, -1) : token;
    const normalized = categoryNames.has(name) ? `{${name}}` : name;
    values = optional
      ? values.flatMap((prefix) => [prefix, `${prefix}${normalized}`])
      : values.map((prefix) => `${prefix}${normalized}`);
  }
  return [...new Set(values.filter(Boolean))];
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function rulesToLexurgy(value: unknown): string {
  return arrayValue(value).map((item, index) => {
    const rule = objectValue(item);
    if (!rule) return "";
    const body = rule.soundChange ?? rule.change ?? rule.rule ?? "";
    if (!body) return "";
    const name = String(rule.name ?? rule.id ?? `rule-${index + 1}`).replace(/[:\s]+$/g, "");
    return `${name}:\n  ${String(body)}`;
  }).filter(Boolean).join("\n\n");
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
