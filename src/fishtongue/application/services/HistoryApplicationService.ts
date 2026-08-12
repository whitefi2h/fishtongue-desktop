import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  EtymologyRepository,
  HistoricalEventRepository,
  LanguageRelationRepository,
  LanguageStageRepository,
  StageEvolutionRepository,
} from "@/fishtongue/application/ports/ProjectPorts";
import StageStateResolver from "@/fishtongue/application/services/StageStateResolver";
import { requiredText } from "@/fishtongue/domain/errors";
import {
  EtymologyRelation,
  HistoricalEvent,
  LanguageRelation,
  LanguageStage,
  StageComponentOverride,
  StageContextRecord,
  StageEvolutionBatch,
  StageEvolutionCandidate,
} from "@/fishtongue/domain/models";

export default class HistoryApplicationService implements Phase5Application {
  constructor(
    private readonly project: ProjectApplication,
    private readonly stages: LanguageStageRepository,
    private readonly relations: LanguageRelationRepository,
    private readonly events: HistoricalEventRepository,
    private readonly etymology: EtymologyRepository,
    private readonly stageEvolutions: StageEvolutionRepository,
    private readonly resolver: StageStateResolver
  ) {}

  listStages(languageId: string) {
    this.requireProject();
    return this.stages.list(languageId);
  }

  async saveStage(value: LanguageStage): Promise<void> {
    this.requireProject();
    const existing = await this.stages.list(value.languageId);
    assertStageLinks(value, existing);
    await this.stages.save(normalizeStage(value));
    await this.project.markProjectChanged();
  }

  async saveStageWithContext(
    value: LanguageStage,
    context: StageContextRecord
  ): Promise<void> {
    this.requireProject();
    if (context.stageId !== value.id) {
      throw new Error("阶段说明与当前阶段不一致，已停止保存。");
    }
    const existing = await this.stages.list(value.languageId);
    assertStageLinks(value, existing);
    await this.stages.saveWithContext(
      normalizeStage(value),
      normalizeStageContext(context)
    );
    await this.project.markProjectChanged();
  }

  async deleteStage(id: string): Promise<void> {
    this.requireProject();
    const value = await this.stages.get(id);
    if (!value) return;
    if (value.kind === "internal_default") {
      throw new Error("内部默认状态是语言数据的安全锚点，不能删除。");
    }
    await this.stages.delete(id);
    await this.project.markProjectChanged();
  }

  getStageContext(stageId: string) {
    this.requireProject();
    return this.stages.getContext(stageId);
  }

  async saveStageContext(value: StageContextRecord): Promise<void> {
    this.requireProject();
    await this.stages.saveContext(normalizeStageContext(value));
    await this.project.markProjectChanged();
  }

  async saveStageOverride(value: StageComponentOverride): Promise<void> {
    this.requireProject();
    const stage = await this.stages.get(value.stageId);
    if (!stage) throw new Error("阶段不存在。");
    if (stage.storageMode === "no_data") {
      throw new Error("无记录阶段不能保存词典、语素或规则数据。");
    }
    await this.stages.saveOverride({
      ...value,
      targetId: value.targetId.trim(),
      updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  async deleteStageOverride(id: string): Promise<void> {
    this.requireProject();
    await this.stages.deleteOverride(id);
    await this.project.markProjectChanged();
  }

  resolveStage(stageId: string) {
    this.requireProject();
    return this.resolver.resolve(stageId);
  }

  listLanguageRelations() {
    return this.relations.list(this.requireProject().project.id);
  }

  async saveLanguageRelation(value: LanguageRelation): Promise<void> {
    const snapshot = this.requireProject();
    if (value.sourceLanguageId === value.targetLanguageId) {
      throw new Error("语言不能与自身建立关系。");
    }
    const all = await this.relations.list(snapshot.project.id);
    if (value.kind === "genetic" &&
        createsGeneticCycle(value, all.filter((item) => item.id !== value.id))) {
      throw new Error("该继承关系会形成循环，无法保存。");
    }
    if (value.kind === "genetic" && value.isPrimary && all.some((item) =>
      item.id !== value.id && item.kind === "genetic" && item.isPrimary &&
      item.targetLanguageId === value.targetLanguageId
    )) {
      throw new Error("目标语言已经有一个主要继承来源。请先删除或调整原关系。");
    }
    await this.relations.save({
      ...value,
      projectId: snapshot.project.id,
      isPrimary: value.kind === "genetic" && value.isPrimary,
      notes: value.notes.trim(),
      updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  async deleteLanguageRelation(id: string): Promise<void> {
    this.requireProject();
    await this.relations.delete(id);
    await this.project.markProjectChanged();
  }

  listHistoricalEvents() {
    return this.events.list(this.requireProject().project.id);
  }

  async saveHistoricalEvent(value: HistoricalEvent): Promise<void> {
    const snapshot = this.requireProject();
    await this.events.save({
      ...value,
      projectId: snapshot.project.id,
      name: requiredText(value.name, "事件名称"),
      description: value.description.trim(),
      updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  async deleteHistoricalEvent(id: string): Promise<void> {
    this.requireProject();
    await this.events.delete(id);
    await this.project.markProjectChanged();
  }

  listEtymologyRelations() {
    return this.etymology.list(this.requireProject().project.id);
  }

  listEtymologyForLexeme(lexemeId: string) {
    this.requireProject();
    return this.etymology.listForLexeme(lexemeId);
  }

  async saveEtymologyRelation(value: EtymologyRelation): Promise<void> {
    const snapshot = this.requireProject();
    if (value.sourceLexemeId && value.sourceLexemeId === value.targetLexemeId) {
      throw new Error("来源词条和目标词条不能相同。");
    }
    if (!value.sourceLexemeId && !value.sourceForm.trim()) {
      throw new Error("请选择来源词条，或填写项目外来源形式。");
    }
    if (value.kind === "borrowing" && value.sourceLexemeId) {
      const lexemes = (await Promise.all(
        snapshot.languages.map((language) => this.project.listLexemes(language.id))
      )).flat();
      const source = lexemes.find((lexeme) => lexeme.id === value.sourceLexemeId);
      const target = lexemes.find((lexeme) => lexeme.id === value.targetLexemeId);
      if (source && target && source.languageId === target.languageId) {
        throw new Error("语言不能从自身借入词汇，请选择另一门来源语言。");
      }
    }
    if (value.historicalEventId) {
      const events = await this.events.list(snapshot.project.id);
      if (!events.some((event) => event.id === value.historicalEventId)) {
        throw new Error("关联的历史事件不存在或已被删除。");
      }
    }
    await this.etymology.save({
      ...value,
      projectId: snapshot.project.id,
      sourceForm: value.sourceForm.trim(),
      notes: value.notes.trim(),
      updatedAt: new Date().toISOString(),
    });
    await this.project.markProjectChanged();
  }

  async deleteEtymologyRelation(id: string): Promise<void> {
    this.requireProject();
    await this.etymology.delete(id);
    await this.project.markProjectChanged();
  }

  listStageEvolutionBatches(languageId: string) {
    this.requireProject();
    return this.stageEvolutions.list(languageId);
  }

  async createStageEvolutionBatch(value: StageEvolutionBatch): Promise<void> {
    this.requireProject();
    if (value.sourceStageId === value.targetStageId) {
      throw new Error("正向演化的来源阶段和目标阶段不能相同。");
    }
    const [source, target] = await Promise.all([
      this.stages.get(value.sourceStageId),
      this.stages.get(value.targetStageId),
    ]);
    if (!source || !target || source.languageId !== value.languageId ||
        target.languageId !== value.languageId) {
      throw new Error("正向演化只能连接当前语言中已有的两个阶段。");
    }
    if (target.storageMode === "no_data") {
      throw new Error("无记录阶段不能接收音变结果。");
    }
    if (!value.candidates.length) throw new Error("没有可审核的音变结果。");
    await this.stageEvolutions.create({
      ...value,
      status: "draft",
      rulesSnapshot: value.rulesSnapshot.trim(),
      candidates: value.candidates.map((candidate, position) => ({
        ...candidate,
        position,
      })),
    });
    await this.project.markProjectChanged();
  }

  async saveStageEvolutionCandidate(
    batchId: string,
    value: StageEvolutionCandidate
  ): Promise<void> {
    this.requireProject();
    const batch = await this.stageEvolutions.get(batchId);
    if (!batch || batch.status !== "draft") {
      throw new Error("音变审核批次不存在或已提交。");
    }
    const resultForm = requiredText(value.resultForm, "音变结果词形");
    const duplicate = batch.candidates.some((candidate) =>
      candidate.id !== value.id &&
      candidate.status !== "rejected" &&
      candidate.resultForm.normalize("NFC").toLocaleLowerCase() ===
        resultForm.normalize("NFC").toLocaleLowerCase()
    );
    await this.stageEvolutions.saveCandidate(batchId, {
      ...value,
      resultForm,
      payload: { ...value.payload, romanized: resultForm },
      conflicts: duplicate ? [{
        code: "DUPLICATE_CANDIDATE",
        message: "本批次中存在相同的结果词形。",
      }] : [],
    });
    await this.project.markProjectChanged();
  }

  async commitStageEvolutionBatch(batchId: string): Promise<void> {
    this.requireProject();
    const batch = await this.stageEvolutions.get(batchId);
    if (!batch) throw new Error("音变审核批次不存在。");
    const accepted = batch.candidates.filter((value) => value.status === "accepted");
    if (!accepted.length) throw new Error("至少接受一项结果后才能提交。");
    if (accepted.some((value) => value.conflicts.length)) {
      throw new Error("已接受的结果仍有冲突，请先处理。");
    }
    await this.stageEvolutions.commit(batchId, crypto.randomUUID(), new Date().toISOString());
    await this.project.markProjectChanged();
  }

  listStageEvolutionOperations(languageId: string) {
    this.requireProject();
    return this.stageEvolutions.listOperations(languageId);
  }

  async undoStageEvolutionOperation(operationId: string): Promise<void> {
    this.requireProject();
    await this.stageEvolutions.undo(operationId, new Date().toISOString());
    await this.project.markProjectChanged();
  }

  private requireProject() {
    const snapshot = this.project.getSnapshot();
    if (!snapshot) throw new Error("当前没有打开的项目。");
    return snapshot;
  }
}

function assertStageLinks(value: LanguageStage, stages: LanguageStage[]): void {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const linkedId of [value.chronologyParentId, value.dataBaseStageId]) {
    if (!linkedId) continue;
    if (linkedId === value.id) throw new Error("阶段不能以自身作为上级或数据基础。");
    const linked = byId.get(linkedId);
    if (!linked || linked.languageId !== value.languageId) {
      throw new Error("阶段链接必须指向同一语言中的已有阶段。");
    }
  }
  if (value.documentationStatus === "unrecorded" &&
      value.storageMode !== "no_data") {
    throw new Error("无记录阶段只能保存背景与关系，不能包含语言数据。");
  }
  if (value.storageMode === "no_data" && value.dataBaseStageId) {
    throw new Error("无数据阶段不能设置数据基础。它只保存历史背景与关系。");
  }
  if (value.dataBaseStageId) {
    const dataBase = byId.get(value.dataBaseStageId);
    if (dataBase?.storageMode === "no_data" ||
        dataBase?.documentationStatus === "unrecorded") {
      throw new Error("无记录阶段不能作为数据基础。请选择包含语言数据的阶段。");
    }
  }
  const parents = new Map(stages.map((stage) => [stage.id, stage.dataBaseStageId]));
  parents.set(value.id, value.dataBaseStageId);
  let cursor = value.dataBaseStageId;
  const seen = new Set([value.id]);
  while (cursor) {
    if (seen.has(cursor)) throw new Error("数据继承形成了循环。");
    seen.add(cursor);
    cursor = parents.get(cursor);
  }
}

function normalizeStage(value: LanguageStage): LanguageStage {
  return {
    ...value,
    name: requiredText(value.name, "阶段名称"),
    startLabel: value.startLabel.trim(),
    endLabel: value.endLabel.trim(),
    dataBaseStageId: value.storageMode === "no_data"
      ? undefined
      : value.dataBaseStageId,
    visible: value.kind !== "internal_default",
    updatedAt: new Date().toISOString(),
  };
}

function normalizeStageContext(value: StageContextRecord): StageContextRecord {
  return {
    ...value,
    background: value.background.trim(),
    evidenceNotes: value.evidenceNotes.trim(),
    sources: value.sources.map((source) => source.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
}

function createsGeneticCycle(
  candidate: LanguageRelation,
  relations: LanguageRelation[]
): boolean {
  const edges = relations
    .filter((value) => value.kind === "genetic")
    .concat(candidate)
    .map((value) => [value.sourceLanguageId, value.targetLanguageId] as const);
  const children = new Map<string, string[]>();
  for (const [source, target] of edges) {
    children.set(source, [...(children.get(source) ?? []), target]);
  }
  const visit = (node: string, path: Set<string>): boolean => {
    if (path.has(node)) return true;
    const nextPath = new Set(path).add(node);
    return (children.get(node) ?? []).some((child) => visit(child, nextPath));
  };
  return [...children.keys()].some((node) => visit(node, new Set()));
}
