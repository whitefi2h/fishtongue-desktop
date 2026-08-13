import {
  BorrowingDuplicateInput,
  EtymologyDeletionMode,
  EtymologyDuplicateCheck,
  Phase5Application,
  SaveEtymologyOptions,
} from "@/fishtongue/application/ports/Phase5Application";
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

  runProjectOperation<T>(kind: string, summary: string, action: () => Promise<T>) {
    return this.project.runProjectOperation
      ? this.project.runProjectOperation(kind, summary, action)
      : action();
  }

  listStages(languageId: string) {
    this.requireProject();
    return this.stages.list(languageId);
  }

  async saveStage(value: LanguageStage): Promise<void> {
    this.requireProject();
    const existing = await this.stages.list(value.languageId);
    assertStageLinks(value, existing);
    await this.runProjectOperation("stage.save", `保存阶段“${value.name}”`, () =>
      this.stages.save(normalizeStage(value))
    );
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
    await this.runProjectOperation("stage.save", `保存阶段“${value.name}”及说明`, () =>
      this.stages.saveWithContext(
        normalizeStage(value),
        normalizeStageContext(context)
      )
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
    await this.runProjectOperation("stage.delete", `删除阶段“${value.name}”`, () =>
      this.stages.delete(id)
    );
    await this.project.markProjectChanged();
  }

  getStageContext(stageId: string) {
    this.requireProject();
    return this.stages.getContext(stageId);
  }

  async saveStageContext(value: StageContextRecord): Promise<void> {
    this.requireProject();
    await this.runProjectOperation("stage-context.save", "修改阶段说明", () =>
      this.stages.saveContext(normalizeStageContext(value))
    );
    await this.project.markProjectChanged();
  }

  async saveStageOverride(value: StageComponentOverride): Promise<void> {
    this.requireProject();
    const stage = await this.stages.get(value.stageId);
    if (!stage) throw new Error("阶段不存在。");
    if (stage.storageMode === "no_data") {
      throw new Error("无记录阶段不能保存词典、语素或规则数据。");
    }
    const normalized = {
      ...value,
      targetId: value.targetId.trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.runProjectOperation("stage-override.save", "修改阶段数据差异", () =>
      this.stages.saveOverride(normalized)
    );
    await this.project.markProjectChanged();
  }

  async deleteStageOverride(id: string): Promise<void> {
    this.requireProject();
    await this.runProjectOperation("stage-override.delete", "删除阶段数据差异", () =>
      this.stages.deleteOverride(id)
    );
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
    const normalized = {
      ...value,
      projectId: snapshot.project.id,
      isPrimary: value.kind === "genetic" && value.isPrimary,
      notes: value.notes.trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.runProjectOperation("language-relation.save", "保存语言关系", () =>
      this.relations.save(normalized)
    );
    await this.project.markProjectChanged();
  }

  async deleteLanguageRelation(id: string): Promise<void> {
    this.requireProject();
    await this.runProjectOperation("language-relation.delete", "删除语言关系", () =>
      this.relations.delete(id)
    );
    await this.project.markProjectChanged();
  }

  listHistoricalEvents() {
    return this.events.list(this.requireProject().project.id);
  }

  async saveHistoricalEvent(value: HistoricalEvent): Promise<void> {
    const snapshot = this.requireProject();
    const normalized = {
      ...value,
      projectId: snapshot.project.id,
      name: requiredText(value.name, "事件名称"),
      description: value.description.trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.runProjectOperation("historical-event.save", `保存历史事件“${normalized.name}”`, () =>
      this.events.save(normalized)
    );
    await this.project.markProjectChanged();
  }

  async deleteHistoricalEvent(id: string): Promise<void> {
    this.requireProject();
    await this.runProjectOperation("historical-event.delete", "删除历史事件", () =>
      this.events.delete(id)
    );
    await this.project.markProjectChanged();
  }

  listEtymologyRelations() {
    return this.etymology.list(this.requireProject().project.id);
  }

  listEtymologyForLexeme(lexemeId: string) {
    this.requireProject();
    return this.etymology.listForLexeme(lexemeId);
  }

  listStageOverrides(stageId: string) {
    this.requireProject();
    return this.stages.listOverrides(stageId);
  }

  async checkEtymologyDuplicate(
    value: EtymologyRelation
  ): Promise<EtymologyDuplicateCheck> {
    if (value.kind !== "borrowing") return { kind: "none" };
    const lexemes = await this.listProjectLexemes();
    return this.checkBorrowingDuplicate({
      sourceLexemeId: value.sourceLexemeId,
      sourceForm: value.sourceForm,
      targetForm:
        lexemes.find((lexeme) => lexeme.id === value.targetLexemeId)
          ?.romanized ?? "",
      excludeRelationId: value.id,
    });
  }

  async checkBorrowingDuplicate(
    input: BorrowingDuplicateInput
  ): Promise<EtymologyDuplicateCheck> {
    const snapshot = this.requireProject();
    const [relations, lexemes] = await Promise.all([
      this.etymology.list(snapshot.project.id),
      this.listProjectLexemes(),
    ]);
    const lexemesById = new Map(lexemes.map((lexeme) => [lexeme.id, lexeme]));
    const duplicates = relations.filter(
      (relation) =>
        relation.id !== input.excludeRelationId &&
        relation.kind === "borrowing" &&
        hasSameBorrowingSource(relation, input)
    );
    if (!duplicates.length) return { kind: "none", targetForm: input.targetForm };

    const exact = duplicates.find((relation) => {
      const existingForm = lexemesById.get(relation.targetLexemeId)?.romanized;
      return (
        existingForm && sameWrittenForm(existingForm, input.targetForm)
      );
    });
    const conflict = exact ?? duplicates[0];
    return {
      kind: exact
        ? "same_source_same_target_form"
        : "same_source_different_target",
      conflictingRelationId: conflict.id,
      conflictingTargetLexemeId: conflict.targetLexemeId,
      conflictingTargetForm:
        lexemesById.get(conflict.targetLexemeId)?.romanized ?? "",
      targetForm: input.targetForm,
    };
  }

  async saveEtymologyRelation(
    value: EtymologyRelation,
    options: SaveEtymologyOptions = {}
  ): Promise<void> {
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
    const duplicate = await this.checkEtymologyDuplicate(value);
    if (duplicate.kind === "same_source_same_target_form") {
      throw new Error("该来源词和借词词形已经存在，不能重复保存。");
    }
    if (
      duplicate.kind === "same_source_different_target" &&
      !options.confirmSameSource
    ) {
      throw new Error("该来源词已有其他借词词形，请确认后再保存。");
    }
    const normalized = {
      ...value,
      projectId: snapshot.project.id,
      sourceForm: value.sourceForm.trim(),
      notes: value.notes.trim(),
      updatedAt: new Date().toISOString(),
    };
    await this.runProjectOperation("etymology.save", "保存词源关系", () =>
      this.etymology.save(normalized)
    );
    await this.project.markProjectChanged();
  }

  async deleteEtymologyRelation(
    id: string,
    mode: EtymologyDeletionMode = "relation_only"
  ): Promise<void> {
    const snapshot = this.requireProject();
    if (mode === "relation_and_target_lexeme") {
      const relation = (await this.etymology.list(snapshot.project.id)).find(
        (value) => value.id === id
      );
      if (!relation) return;
      if (relation.kind !== "borrowing") {
        throw new Error("只有借词关系可以同时删除对应借词词条。");
      }
      await this.project.deleteLexeme(relation.targetLexemeId);
      return;
    }
    await this.runProjectOperation("etymology.delete", "删除词源关系", () =>
      this.etymology.delete(id)
    );
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
    const normalized: StageEvolutionBatch = {
      ...value,
      status: "draft",
      rulesSnapshot: value.rulesSnapshot.trim(),
      candidates: value.candidates.map((candidate, position) => ({
        ...candidate,
        position,
      })),
    };
    await this.runProjectOperation("stage-evolution-review.create", "创建跨阶段演化审核批次", () =>
      this.stageEvolutions.create(normalized)
    );
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
    const normalized: StageEvolutionCandidate = {
      ...value,
      resultForm,
      payload: { ...value.payload, romanized: resultForm },
      conflicts: duplicate ? [{
        code: "DUPLICATE_CANDIDATE",
        message: "本批次中存在相同的结果词形。",
      }] : [],
    };
    await this.runProjectOperation("stage-evolution-review.edit", "修改跨阶段演化候选", () =>
      this.stageEvolutions.saveCandidate(batchId, normalized)
    );
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
    await this.runProjectOperation("stage-evolution.commit", "提交跨阶段演化结果", () =>
      this.stageEvolutions.commit(batchId, crypto.randomUUID(), new Date().toISOString())
    );
    await this.project.markProjectChanged();
  }

  listStageEvolutionOperations(languageId: string) {
    this.requireProject();
    return this.stageEvolutions.listOperations(languageId);
  }

  async undoStageEvolutionOperation(operationId: string): Promise<void> {
    this.requireProject();
    await this.runProjectOperation("stage-evolution.undo", "撤销跨阶段演化提交", () =>
      this.stageEvolutions.undo(operationId, new Date().toISOString())
    );
    await this.project.markProjectChanged();
  }

  private requireProject() {
    const snapshot = this.project.getSnapshot();
    if (!snapshot) throw new Error("当前没有打开的项目。");
    return snapshot;
  }

  private async listProjectLexemes() {
    const snapshot = this.requireProject();
    return (
      await Promise.all(
        snapshot.languages.map((language) =>
          this.project.listLexemes(language.id)
        )
      )
    ).flat();
  }
}

function hasSameBorrowingSource(
  relation: EtymologyRelation,
  input: BorrowingDuplicateInput
): boolean {
  if (relation.sourceLexemeId || input.sourceLexemeId) {
    return Boolean(
      relation.sourceLexemeId &&
        input.sourceLexemeId &&
        relation.sourceLexemeId === input.sourceLexemeId
    );
  }
  return sameWrittenForm(relation.sourceForm, input.sourceForm);
}

function sameWrittenForm(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.trim().normalize("NFC").toLocaleLowerCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
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
