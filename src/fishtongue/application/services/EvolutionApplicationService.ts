import {
  EvolutionApplication,
  EvolutionInputCandidate,
  EvolutionTestWordPreview,
  RunEvolutionInput,
} from "@/fishtongue/application/ports/EvolutionApplication";
import {
  EvolutionDeliveryRepository,
  EvolutionPlanRepository,
  EvolutionRunRepository,
} from "@/fishtongue/application/ports/EvolutionPorts";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import { IpaValidationResult } from "@/fishtongue/application/ports/PhonologyAnalysisEngine";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import { SoundChangeRunResult } from "@/fishtongue/application/ports/SoundChangeEngine";
import {
  EvolutionDelivery,
  EvolutionDeliveryItem,
  EvolutionInputMode,
  EvolutionIssue,
  EvolutionPlan,
  EvolutionPlanScope,
  EvolutionPlanVersion,
  EvolutionPhonemeOption,
  EvolutionPhonemeResolution,
  EvolutionRun,
  EvolutionRunItem,
  Lexeme,
  Morpheme,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import { v4 as uuid } from "uuid";

interface EngineIdentity {
  version: string;
  hash: string;
  protocolVersion: string;
}

const defaultScope = (): EvolutionPlanScope => ({
  query: "",
  partOfSpeech: "",
  lexicalStatus: "all",
  sourceType: "all",
});

export default class EvolutionApplicationService
  implements EvolutionApplication
{
  private readonly editSessions = new Map<string, string>();
  private readonly ipaValidationCache = new Map<
    string,
    Promise<IpaValidationResult>
  >();
  constructor(
    private readonly project: ProjectApplication,
    private readonly history: Phase5Application,
    private readonly phase6: Phase6Application,
    private readonly engine: SoundChangeService,
    private readonly plans: EvolutionPlanRepository,
    private readonly runs: EvolutionRunRepository,
    private readonly deliveries: EvolutionDeliveryRepository,
    private readonly engineIdentity: EngineIdentity
  ) {}

  async listPlans(languageId: string, includeArchived = false) {
    let values = await this.plans.list(languageId, includeArchived);
    if (!values.length) {
      await this.createPlan(languageId);
      values = await this.plans.list(languageId, includeArchived);
    }
    const stages = await this.history.listStages(languageId);
    const visibleDataStages = stages.filter(
      (stage) =>
        stage.visible &&
        stage.kind !== "internal_default" &&
        stage.storageMode !== "no_data"
    );
    const fallback = visibleDataStages.at(-1);
    if (fallback) {
      const stageById = new Map(stages.map((stage) => [stage.id, stage]));
      for (const plan of values) {
        const current = plan.sourceStageId
          ? stageById.get(plan.sourceStageId)
          : undefined;
        if (
          current &&
          current.visible &&
          current.kind !== "internal_default" &&
          current.storageMode !== "no_data"
        )
          continue;
        const corrected = {
          ...plan,
          sourceStageId: fallback.id,
          updatedAt: new Date().toISOString(),
        };
        await this.write(
          "evolution-plan.source-stage.repair",
          `将演化方案“${plan.name}”切换到可见阶段`,
          () => this.plans.save(corrected)
        );
      }
      values = await this.plans.list(languageId, includeArchived);
    }
    return values;
  }

  getPlan(id: string) {
    return this.plans.get(id);
  }

  async createPlan(
    languageId: string,
    sourceStageId?: string
  ): Promise<EvolutionPlan> {
    const stages = await this.history.listStages(languageId);
    const visibleDataStages = stages.filter(
      (stage) =>
        stage.visible &&
        stage.kind !== "internal_default" &&
        stage.storageMode !== "no_data"
    );
    const requestedSource = sourceStageId
      ? stages.find(
          (stage) =>
            stage.id === sourceStageId && stage.storageMode !== "no_data"
        )
      : undefined;
    const source =
      (requestedSource &&
      (!visibleDataStages.length ||
        (requestedSource.visible &&
          requestedSource.kind !== "internal_default"))
        ? requestedSource
        : undefined) ??
      visibleDataStages.at(-1) ??
      stages.find((stage) => stage.kind === "internal_default") ??
      stages[0];
    if (!source || source.storageMode === "no_data") {
      throw new Error("当前语言没有可承载演化数据的来源状态。");
    }
    const existing = await this.plans.list(languageId, true);
    const now = new Date().toISOString();
    const plan: EvolutionPlan = {
      id: uuid(),
      languageId,
      name: uniquePlanName(existing.map((item) => item.name)),
      description: "",
      sourceStageId: source.id,
      inputMode: "phonological",
      rulesDraft: "",
      testWords: [],
      scope: defaultScope(),
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.write(
      "evolution-plan.create",
      `创建演化方案“${plan.name}”`,
      () => this.plans.save(plan)
    );
    return plan;
  }

  async duplicatePlan(planId: string): Promise<EvolutionPlan> {
    const source = await this.requirePlan(planId);
    const existing = await this.plans.list(source.languageId, true);
    const now = new Date().toISOString();
    const copy: EvolutionPlan = {
      ...source,
      id: uuid(),
      legacyEvolutionId: undefined,
      name: uniquePlanName(
        existing.map((item) => item.name),
        `${source.name} 副本`
      ),
      archived: false,
      createdAt: now,
      updatedAt: now,
      testWords: source.testWords.map((word) => ({ ...word, id: uuid() })),
    };
    await this.write(
      "evolution-plan.copy",
      `复制演化方案“${source.name}”`,
      () => this.plans.save(copy)
    );
    return copy;
  }

  async savePlan(plan: EvolutionPlan): Promise<void> {
    const name = plan.name.trim();
    if (!name) throw new Error("演化方案名称不能为空。");
    const normalized: EvolutionPlan = {
      ...plan,
      name,
      description: plan.description.trim(),
      updatedAt: new Date().toISOString(),
      testWords: plan.testWords
        .map((word, position) => ({
          ...word,
          word: word.word.trim(),
          position,
        }))
        .filter((word) => word.word),
      scope: { ...defaultScope(), ...plan.scope },
    };
    const sessionId = this.editSessions.get(plan.id) ?? uuid();
    this.editSessions.set(plan.id, sessionId);
    await this.write(
      "evolution-plan.save",
      `保存演化方案“${name}”`,
      () => this.plans.save(normalized),
      { coalesceKey: `evolution-plan:${plan.id}`, coalesceSessionId: sessionId }
    );
  }

  endPlanEditSession(planId: string): void {
    this.editSessions.delete(planId);
  }

  async archivePlan(planId: string, archived: boolean): Promise<void> {
    const plan = await this.requirePlan(planId);
    await this.write(
      archived ? "evolution-plan.archive" : "evolution-plan.restore",
      `${archived ? "归档" : "恢复"}演化方案“${plan.name}”`,
      () =>
        this.plans.save({
          ...plan,
          archived,
          updatedAt: new Date().toISOString(),
        })
    );
  }

  async deletePlan(planId: string): Promise<void> {
    const plan = await this.requirePlan(planId);
    const versions = await this.plans.listVersions(planId);
    if (versions.length) {
      await this.archivePlan(planId, true);
      return;
    }
    await this.write(
      "evolution-plan.delete",
      `删除演化方案“${plan.name}”`,
      () => this.plans.delete(planId)
    );
  }

  listVersions(planId: string) {
    return this.plans.listVersions(planId);
  }

  async createVersion(
    planId: string,
    note = ""
  ): Promise<EvolutionPlanVersion> {
    this.endPlanEditSession(planId);
    const plan = await this.requirePlan(planId);
    const versions = await this.plans.listVersions(planId);
    const contentHash = await hashValue(versionContent(plan));
    const existing = versions.find(
      (version) => version.contentHash === contentHash
    );
    if (existing) return existing;
    const version: EvolutionPlanVersion = {
      id: uuid(),
      planId,
      versionNumber:
        Math.max(0, ...versions.map((item) => item.versionNumber)) + 1,
      rulesSnapshot: plan.rulesDraft,
      testWords: plan.testWords.map((word) => ({ ...word })),
      inputMode: plan.inputMode,
      scope: { ...plan.scope },
      note: note.trim(),
      contentHash,
      createdAt: new Date().toISOString(),
    };
    await this.write(
      "evolution-version.create",
      `保存“${plan.name}”版本 ${version.versionNumber}`,
      () => this.plans.createVersion(version)
    );
    return version;
  }

  async restoreVersion(versionId: string): Promise<EvolutionPlan> {
    const version = await this.plans.getVersion(versionId);
    if (!version) throw new Error("演化方案版本不存在。");
    const plan = await this.requirePlan(version.planId);
    const restored: EvolutionPlan = {
      ...plan,
      rulesDraft: version.rulesSnapshot,
      inputMode: version.inputMode,
      scope: { ...version.scope },
      testWords: version.testWords.map((word, position) => ({
        ...word,
        id: uuid(),
        position,
      })),
      updatedAt: new Date().toISOString(),
    };
    await this.write(
      "evolution-version.restore",
      `从版本 ${version.versionNumber} 恢复“${plan.name}”草稿`,
      () => this.plans.save(restored)
    );
    return restored;
  }

  async resolveInputs(
    languageId: string,
    stageId: string
  ): Promise<EvolutionInputCandidate[]> {
    const state = await this.history.resolveStage(stageId);
    if (state.stage.languageId !== languageId)
      throw new Error("来源阶段不属于当前语言。");
    if (state.stage.storageMode === "no_data")
      throw new Error("无记录阶段不能作为演化来源。");
    const borrowedLexemeIds = new Set(
      (await this.history.listEtymologyRelations())
        .filter((relation) => relation.kind === "borrowing")
        .map((relation) => relation.targetLexemeId)
    );
    return Object.values(state.components.lexicon)
      .map(toLexeme)
      .map((lexeme) => ({
        ...lexeme,
        selected: false,
        evolutionSourceType: borrowedLexemeIds.has(lexeme.id)
          ? ("borrowing" as const)
          : lexeme.sourceType,
      }))
      .sort((left, right) => left.romanized.localeCompare(right.romanized));
  }

  async previewTestWords(
    plan: EvolutionPlan,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<EvolutionTestWordPreview> {
    if (!plan.rulesDraft.trim()) throw new Error("请先填写 Lexurgy 音变规则。");
    const words = plan.testWords
      .map((item) => item.word.trim())
      .filter(Boolean);
    if (!words.length) throw new Error("请先填写至少一个测试词。");
    const validation = await this.engine.validate({ changes: plan.rulesDraft });
    if (!validation.valid)
      throw new Error(
        validation.issues[0]?.message ?? "Lexurgy 规则验证失败。"
      );
    const engineInputs = words.map((word) =>
      this.normalizeEngineInput(word, plan.inputMode)
    );
    const result = await this.engine.run(
      {
        changes: plan.rulesDraft,
        inputWords: engineInputs,
        traceWords: [...new Set(engineInputs)],
      },
      (event) => onProgress?.(event.message),
      signal
    );
    if (result.outputWords.length !== engineInputs.length)
      throw new Error("Lexurgy 返回的测试词数量与输入不一致，请重试。");
    return {
      ruleNames: result.ruleNames,
      items: words.map((source, position) => {
        const engineInput = engineInputs[position];
        const engineOutput = result.outputWords[position] ?? "";
        return {
          source,
          engineInput,
          engineOutput,
          displayOutput:
            plan.inputMode === "phonological"
              ? wrapLikeSource(engineOutput, source)
              : engineOutput,
          changed: engineOutput !== engineInput,
          error: result.errors.find((item) => item.originalWord === engineInput)
            ?.message,
        };
      }),
    };
  }

  async runPreview(input: RunEvolutionInput): Promise<EvolutionRun> {
    const plan = await this.requirePlan(input.planId);
    if (!plan.rulesDraft.trim()) throw new Error("请先填写 Lexurgy 音变规则。");
    const validation = await this.engine.validate({ changes: plan.rulesDraft });
    if (!validation.valid)
      throw new Error(
        validation.issues[0]?.message ?? "Lexurgy 规则验证失败。"
      );
    const lexemes = await this.resolveInputs(
      plan.languageId,
      input.sourceStageId
    );
    const byId = new Map(lexemes.map((lexeme) => [lexeme.id, lexeme]));
    const selected = input.selectedLexemeIds
      .map((id) => byId.get(id))
      .filter((value): value is EvolutionInputCandidate => Boolean(value));
    if (!selected.length) throw new Error("请至少选择一个正式词条。");
    const phonology = await this.phase6.getPhonology(
      plan.languageId,
      input.sourceStageId
    );
    const prepared = selected.map((lexeme, position) =>
      prepareInput(
        lexeme,
        plan.inputMode,
        input.temporaryPhonologicalForms?.[lexeme.id],
        position
      )
    );
    const runnable = prepared.filter((item) => item.inputOrigin !== "missing");
    if (!runnable.length)
      throw new Error("所选词条都缺少 IPA；请补充临时 IPA 或返回词典完善。");
    const createdAt = new Date().toISOString();
    const version = await this.createVersion(plan.id);
    let result: SoundChangeRunResult;
    try {
      result = await this.engine.run(
        {
          changes: plan.rulesDraft,
          inputWords: runnable.map((item) => item.engineInput),
          traceWords: [...new Set(runnable.map((item) => item.engineInput))],
        },
        (event) => input.onProgress?.(event.message),
        input.signal
      );
    } catch (reason) {
      const message = errorMessage(reason);
      const cancelled = input.signal?.aborted || /cancel/i.test(message);
      return this.persistTerminalRun({
        plan,
        version,
        input,
        phonology,
        prepared,
        createdAt,
        status: cancelled ? "cancelled" : "failed",
        errors: [
          {
            code: cancelled ? "RUN_CANCELLED" : "ENGINE_FAILURE",
            severity: "error",
            message,
          },
        ],
      });
    }
    if (result.outputWords.length !== runnable.length) {
      return this.persistTerminalRun({
        plan,
        version,
        input,
        phonology,
        prepared,
        createdAt,
        status: "failed",
        errors: [
          {
            code: "OUTPUT_COUNT_MISMATCH",
            severity: "error",
            message: "Lexurgy 返回的结果数量与输入不一致。",
            recovery: "请重试；若问题持续出现，请保留日志。",
          },
        ],
      });
    }
    let runnableIndex = 0;
    const items = prepared.map((item): EvolutionRunItem => {
      if (item.inputOrigin === "missing") return item;
      const output = result.outputWords[runnableIndex] ?? "";
      const intermediate = Object.fromEntries(
        Object.entries(result.intermediateWords).map(([name, values]) => [
          name,
          values[runnableIndex] ?? "",
        ])
      );
      const issues = validateOutput(output, phonology, this.phase6);
      const wordError = result.errors.find(
        (error) => error.originalWord === item.engineInput
      );
      if (wordError)
        issues.push({
          code: "ENGINE_WORD_ERROR",
          severity: "error",
          message: wordError.message,
        });
      const engineOutput = output;
      runnableIndex += 1;
      return {
        ...item,
        engineOutput,
        targetPhonologicalForm:
          plan.inputMode === "phonological"
            ? wrapLikeSource(engineOutput, item.sourcePhonologicalForm)
            : item.sourcePhonologicalForm,
        intermediate,
        trace: result.traces[item.engineInput] ?? [],
        issues,
        status: issues.some((issue) => issue.severity === "error")
          ? "error"
          : issues.length
          ? "warning"
          : engineOutput === item.engineInput
          ? "unchanged"
          : "changed",
      };
    });
    return this.persistTerminalRun({
      plan,
      version,
      input,
      phonology,
      prepared: items,
      createdAt,
      status: "succeeded",
      errors:
        plan.inputMode !== "phonological" ||
        phonology.phonemes.some((item) => item.role === "phoneme")
          ? []
          : [
              {
                code: "PHONOLOGY_INVENTORY_EMPTY",
                severity: "warning",
                message:
                  "来源阶段尚未配置正式音位表，本次已跳过音位表和音位配列检查。",
                recovery: "可先到“音系学”补充正式音位，再重新运行。",
              },
            ],
    });
  }

  async reproduceRun(
    runId: string,
    signal?: AbortSignal
  ): Promise<EvolutionRun> {
    const original = await this.runs.get(runId);
    if (!original) throw new Error("历史运行不存在。");
    if (
      original.engineVersion !== this.engineIdentity.version ||
      original.engineHash !== this.engineIdentity.hash
    ) {
      throw new Error(
        "原版本不可用；可以改用“按当前内容重跑”并比较，但不能称为完全复现。"
      );
    }
    const version = await this.plans.getVersion(original.planVersionId);
    if (!version) throw new Error("历史方案版本不存在。");
    const plan = await this.requirePlan(version.planId);
    const historical = await this.runs.listItems(original.id, 0, 100_000);
    const runnable = historical.filter(
      (item) => item.inputOrigin !== "missing"
    );
    const createdAt = new Date().toISOString();
    let result: SoundChangeRunResult;
    try {
      result = await this.engine.run(
        {
          changes: version.rulesSnapshot,
          inputWords: runnable.map((item) => item.engineInput),
          traceWords: [...new Set(runnable.map((item) => item.engineInput))],
        },
        () => undefined,
        signal
      );
    } catch (reason) {
      throw new Error(`按原输入复现失败：${errorMessage(reason)}`);
    }
    if (result.outputWords.length !== runnable.length)
      throw new Error("复现返回数量与历史输入不一致。");
    let index = 0;
    const items = historical.map((item) => {
      if (item.inputOrigin === "missing")
        return { ...item, id: uuid(), runId: "" };
      const engineOutput = result.outputWords[index] ?? "";
      const intermediate = Object.fromEntries(
        Object.entries(result.intermediateWords).map(([name, values]) => [
          name,
          values[index] ?? "",
        ])
      );
      index += 1;
      return {
        ...item,
        id: uuid(),
        runId: "",
        engineOutput,
        intermediate,
        trace: result.traces[item.engineInput] ?? [],
        targetPhonologicalForm:
          original.inputMode === "phonological"
            ? wrapLikeSource(engineOutput, item.sourcePhonologicalForm)
            : item.sourcePhonologicalForm,
        status:
          engineOutput === item.engineInput
            ? ("unchanged" as const)
            : ("changed" as const),
      };
    });
    const reproduced: EvolutionRun & { items: EvolutionRunItem[] } = {
      ...original,
      id: uuid(),
      status: "succeeded",
      summary: summarize(items),
      errors: [],
      createdAt,
      completedAt: new Date().toISOString(),
      items: [],
    };
    reproduced.items = items.map((item) => ({ ...item, runId: reproduced.id }));
    const outputHash = await hashValue(
      reproduced.items.map((item) => item.engineOutput)
    );
    const originalHash = await hashValue(
      historical.map((item) => item.engineOutput)
    );
    if (outputHash !== originalHash)
      reproduced.errors = [
        {
          code: "REPRODUCTION_MISMATCH",
          severity: "warning",
          message: "相同版本和输入产生了不同输出；已保留本次结果供比较。",
        },
      ];
    await this.write(
      "evolution-run.reproduce",
      `按原输入复现“${plan.name}”`,
      () => this.runs.create(reproduced)
    );
    return reproduced;
  }

  async rerunCurrent(
    runId: string,
    signal?: AbortSignal
  ): Promise<EvolutionRun> {
    const original = await this.runs.get(runId);
    if (!original) throw new Error("历史运行不存在。");
    const version = await this.plans.getVersion(original.planVersionId);
    if (!version) throw new Error("历史方案版本不存在。");
    const items = await this.runs.listItems(runId, 0, 100_000);
    return this.runPreview({
      planId: version.planId,
      sourceStageId: original.sourceStageId,
      selectedLexemeIds: items.flatMap((item) =>
        item.sourceLexemeId ? [item.sourceLexemeId] : []
      ),
      temporaryPhonologicalForms: Object.fromEntries(
        items
          .filter(
            (item) => item.inputOrigin === "temporary" && item.sourceLexemeId
          )
          .map((item) => [item.sourceLexemeId!, item.engineInput])
      ),
      signal,
    });
  }

  listRuns(planId: string) {
    return this.runs.list(planId);
  }
  getRun(id: string) {
    return this.runs.get(id);
  }
  listRunItems(runId: string, offset = 0, limit = 100) {
    return this.runs.listItems(runId, offset, limit);
  }

  async createDeliveryDraft(runId: string): Promise<EvolutionDelivery> {
    const run = await this.runs.get(runId);
    if (!run || run.status !== "succeeded")
      throw new Error("只有成功运行可以建立提交草稿。");
    const runItems = await this.runs.listItems(runId, 0, 100_000);
    const now = new Date().toISOString();
    const deliveryId = uuid();
    const deliveryItems: EvolutionDeliveryItem[] = runItems.map(
      (item, position) => ({
        id: uuid(),
        deliveryId,
        runItemId: item.id,
        decision:
          item.status === "not_run" || item.status === "error"
            ? "skip"
            : "include",
        targetPhonologicalForm: item.targetPhonologicalForm,
        targetDisplayForm:
          run.inputMode === "orthographic" ? item.engineOutput : "",
        orthographyResolution:
          run.inputMode === "orthographic" ? "manual" : "pending",
        homophoneAcknowledged: false,
        conflicts: [...item.issues],
        notes: "",
        position,
      })
    );
    const delivery: EvolutionDelivery = {
      id: deliveryId,
      runId,
      targetType: "new_stage",
      targetLanguageId: run.sourceLanguageId,
      targetConfig: {},
      targetStateHash: "",
      status: "draft",
      summary: { validationStatus: "stale" },
      createdAt: now,
      updatedAt: now,
      items: deliveryItems,
    };
    await this.saveDeliveryDraft(delivery);
    return delivery;
  }

  async saveDeliveryDraft(delivery: EvolutionDelivery): Promise<void> {
    if (delivery.status !== "draft")
      throw new Error("已提交的演化记录不能修改。");
    await this.write("evolution-delivery.save", "保存演化提交草稿", () =>
      this.deliveries.saveDraft({
        ...delivery,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  listDeliveries(runId: string) {
    return this.deliveries.list(runId);
  }
  getDelivery(id: string) {
    return this.deliveries.get(id);
  }

  async validateDelivery(value: EvolutionDelivery): Promise<EvolutionDelivery> {
    if (value.status !== "draft") return value;
    const run = await this.runs.get(value.runId);
    if (!run || run.status !== "succeeded")
      throw new Error("提交草稿对应的运行不可用。");
    const runItems = await this.runs.listItems(run.id, 0, 100_000);
    const runItemById = new Map(runItems.map((item) => [item.id, item]));
    const sourceState = await this.history.resolveStage(run.sourceStageId);
    const sourceLexemes = Object.values(sourceState.components.lexicon).map(
      toLexeme
    );
    const sourceById = new Map(sourceLexemes.map((item) => [item.id, item]));
    const currentPhonology = await this.phase6.getPhonology(
      run.sourceLanguageId,
      run.sourceStageId
    );
    const currentSourceHash = await hashValue({
      items: runItems.map((item) =>
        currentInputSnapshot(item, sourceById, run.inputMode)
      ),
      phonology: currentPhonology,
    });
    const sourceStale = currentSourceHash !== run.sourceStateHash;

    let targetLexemes: Lexeme[] = [];
    let targetPhonology = currentPhonology;
    let targetHash = "";
    if (
      value.targetType === "existing_stage" ||
      value.targetType === "existing_dialect"
    ) {
      if (!value.targetStageId) throw new Error("请选择提交目标。");
      const targetState = await this.history.resolveStage(value.targetStageId);
      if (targetState.stage.storageMode === "no_data")
        throw new Error("无记录阶段不能接收演化数据。");
      if (targetState.stage.languageId !== run.sourceLanguageId)
        throw new Error("已有阶段或方言必须属于来源语言。");
      if (
        value.targetType === "existing_stage" &&
        targetState.stage.kind !== "historical_stage"
      ) {
        throw new Error("所选目标不是历史阶段。");
      }
      if (
        value.targetType === "existing_dialect" &&
        targetState.stage.kind !== "lightweight_dialect"
      ) {
        throw new Error("所选目标不是轻量方言。");
      }
      targetLexemes = Object.values(targetState.components.lexicon).map(
        toLexeme
      );
      targetPhonology = await this.phase6.getPhonology(
        targetState.stage.languageId,
        targetState.stage.id
      );
      targetHash = await hashValue({
        stage: targetState.stage,
        lexicon: targetState.components.lexicon,
      });
    } else if (value.targetType === "new_stage") {
      targetLexemes = sourceLexemes;
      targetHash = await hashValue({
        stage: sourceState.stage,
        lexicon: sourceState.components.lexicon,
      });
    } else {
      targetHash = await hashValue({
        stage: sourceState.stage,
        lexicon: sourceState.components.lexicon,
        morphemes: sourceState.components.morphemes,
      });
    }

    const included = value.items.filter((item) => item.decision !== "skip");
    const targetStale = Boolean(
      value.targetStateHash && value.targetStateHash !== targetHash
    );
    const savedResolutions = readPhonemeResolutions(
      value.targetConfig.newPhonemeResolutions
    );
    const legacyConfirmed = new Set(
      Array.isArray(value.targetConfig.confirmedNewPhonemes)
        ? value.targetConfig.confirmedNewPhonemes.map(String)
        : []
    );
    const confirmedNewPhonemes = new Set([
      ...savedResolutions.map((item) => item.ipa),
      ...legacyConfirmed,
    ]);
    const registeredPhonemes = new Set(
      targetPhonology.phonemes.map((item) => item.ipa.normalize("NFC"))
    );
    const formGroups = groupByNormalized(
      included,
      (item) => item.targetDisplayForm
    );
    const ipaGroups = groupByNormalized(included, (item) =>
      normalizeEngineInput(item.targetPhonologicalForm, "phonological")
    );
    const validationCandidates =
      run.inputMode === "phonological"
        ? value.items.filter((item) => item.decision !== "skip")
        : [];
    const validationResults = await this.validateIpasCached(
      validationCandidates.map((item) =>
        normalizeEngineInput(item.targetPhonologicalForm, "phonological")
      )
    );
    const validationByItem = new Map(
      validationCandidates.map((item, index) => [
        item.id,
        validationResults[index],
      ])
    );
    const newPhonemeOwner = new Map<string, string>();
    const detectedNewPhonemes = new Set<string>();
    for (const item of validationCandidates) {
      for (const segment of validationByItem.get(item.id)?.segments ?? []) {
        if (!isProsodicSeparator(segment) && !registeredPhonemes.has(segment)) {
          detectedNewPhonemes.add(segment);
          if (!newPhonemeOwner.has(segment))
            newPhonemeOwner.set(segment, item.id);
        }
      }
    }
    const version = await this.plans.getVersion(run.planVersionId);
    const candidateResolutions = [...detectedNewPhonemes].map((ipa) => {
      const saved = savedResolutions.find((item) => item.ipa === ipa);
      if (saved) return saved;
      const evidence = inferPhonemeEvidence(
        ipa,
        runItems,
        version?.rulesSnapshot ?? ""
      );
      return {
        ipa,
        displaySymbol: ipa,
        category: inferPhonemeClass(ipa),
        role: "phoneme" as const,
        distribution: evidence.distribution,
        sourceRule: evidence.sourceRule,
      };
    });
    const effectiveResolutions = [
      ...savedResolutions,
      ...candidateResolutions.filter(
        (candidate) =>
          legacyConfirmed.has(candidate.ipa) &&
          !savedResolutions.some((saved) => saved.ipa === candidate.ipa)
      ),
    ];
    const targetPhonemeOptions: EvolutionPhonemeOption[] =
      targetPhonology.phonemes
        .filter((item) => item.role === "phoneme")
        .map((item) => ({
          id: item.id,
          ipa: item.ipa,
          displaySymbol: item.displaySymbol,
          category: item.category,
        }));
    const invalidResolutionByIpa = new Map<string, string>();
    for (const resolution of effectiveResolutions) {
      if (!resolution.distribution.trim())
        invalidResolutionByIpa.set(resolution.ipa, "请填写分布或条件规则。");
      if (
        resolution.role === "allophone" &&
        (!resolution.parentPhonemeId ||
          !targetPhonemeOptions.some(
            (option) => option.id === resolution.parentPhonemeId
          ))
      )
        invalidResolutionByIpa.set(
          resolution.ipa,
          "音位变体必须选择目标音系中的所属音位。"
        );
    }
    const updatedItems = value.items.map((item) => {
      const runItem = runItemById.get(item.runItemId);
      const conflicts = runItem
        ? [...runItem.issues]
        : [
            {
              code: "RUN_ITEM_MISSING",
              severity: "error" as const,
              message: "运行结果项不存在。",
            },
          ];
      if (item.decision === "skip")
        return {
          ...item,
          conflicts: conflicts.filter(
            (issue) => issue.severity === "information"
          ),
        };
      if (sourceStale)
        conflicts.push({
          code: "SOURCE_STALE",
          severity: "error",
          message: "运行后来源词典或来源音系已变化。",
          recovery: "请按当前内容重新运行。",
        });
      if (targetStale)
        conflicts.push({
          code: "TARGET_STALE",
          severity: "error",
          message: "上次检查后目标阶段、词典或音系已变化。",
          recovery: "请重新检查冲突；确认新结果后再提交。",
        });
      if (
        item.orthographyResolution === "pending" ||
        !item.targetDisplayForm.trim()
      )
        conflicts.push({
          code: "ORTHOGRAPHY_PENDING",
          severity: "error",
          message: "目标拼写尚未确认。",
          recovery: "手工填写目标拼写，或明确保留来源拼写。",
        });
      if (run.inputMode === "phonological") {
        const validation = validationByItem.get(item.id);
        if (!validation) throw new Error("目标 IPA 检查结果不存在。");
        const invalidSymbols = validation.unknown.filter(
          (issue) => !isProsodicSeparator(issue.symbol)
        );
        if (invalidSymbols.length)
          conflicts.push(
            ...invalidSymbols.map((issue) => ({
              code: "INVALID_IPA",
              severity: "error" as const,
              message: `无法识别 IPA 符号“${issue.symbol}”（位置 ${
                issue.position + 1
              }）。`,
              recovery: "手工修订目标 IPA，或跳过该词。",
            }))
          );
        for (const segment of validation.segments) {
          if (
            !isProsodicSeparator(segment) &&
            !registeredPhonemes.has(segment) &&
            !confirmedNewPhonemes.has(segment) &&
            newPhonemeOwner.get(segment) === item.id
          )
            conflicts.push({
              code: `NEW_PHONEME:${segment}`,
              severity: "error",
              message: `目标音系尚未登记音位“${segment}”。`,
              recovery:
                "确认把该音位加入目标阶段音系差异、手工修改 IPA，或跳过该词。",
            });
          const resolutionError = invalidResolutionByIpa.get(segment);
          if (
            resolutionError &&
            newPhonemeOwner.get(segment) === item.id &&
            !conflicts.some(
              (issue) => issue.code === `NEW_PHONEME_CONFIG:${segment}`
            )
          )
            conflicts.push({
              code: `NEW_PHONEME_CONFIG:${segment}`,
              severity: "error",
              message: `新增音“${segment}”的音系配置不完整。`,
              recovery: resolutionError,
            });
        }
      }
      const foldedForm = fold(item.targetDisplayForm);
      const foldedIpa = fold(
        normalizeEngineInput(item.targetPhonologicalForm, "phonological")
      );
      if ((formGroups.get(foldedForm)?.length ?? 0) > 1)
        conflicts.push({
          code: "HOMOGRAPH_IN_DELIVERY",
          severity: item.decision === "create_homograph" ? "warning" : "error",
          message: "本次提交中存在相同目标拼写。",
        });
      if (
        (ipaGroups.get(foldedIpa)?.length ?? 0) > 1 &&
        !item.homophoneAcknowledged
      )
        conflicts.push({
          code: "HOMOPHONE_IN_DELIVERY",
          severity: "error",
          message: "本次提交中存在同音结果，请明确确认。",
        });
      const existingForm = targetLexemes.find(
        (candidate) =>
          fold(candidate.romanized) === foldedForm &&
          candidate.id !== runItem?.sourceLexemeId
      );
      if (
        existingForm &&
        item.decision !== "create_homograph" &&
        item.decision !== "merge_senses"
      )
        conflicts.push({
          code: "TARGET_LEXEME_COLLISION",
          severity: "error",
          message: `目标中已有词条“${existingForm.romanized}”。`,
          recovery: "选择建立同形异义词、合并义项、修改拼写或跳过。",
        });
      const existingHomophone = targetLexemes.find(
        (candidate) =>
          fold(normalizeEngineInput(candidate.ipa, "phonological")) ===
            foldedIpa && candidate.id !== runItem?.sourceLexemeId
      );
      if (existingHomophone && !item.homophoneAcknowledged)
        conflicts.push({
          code: "TARGET_HOMOPHONE",
          severity: "error",
          message: `目标词典中已有同音词“${existingHomophone.romanized}”，请明确确认。`,
        });
      const mergeTargetId =
        item.decision === "merge_senses" && existingForm
          ? existingForm.id
          : item.targetLexemeId;
      if (item.decision === "merge_senses" && !mergeTargetId)
        conflicts.push({
          code: "MERGE_TARGET_REQUIRED",
          severity: "error",
          message: "合并义项前必须选择目标词条。",
        });
      return {
        ...item,
        targetLexemeId: mergeTargetId,
        conflicts: dedupeIssues(conflicts),
      };
    });
    const blocking = updatedItems.reduce(
      (sum, item) =>
        sum +
        item.conflicts.filter((issue) => issue.severity === "error").length,
      0
    );
    return {
      ...value,
      targetStateHash: targetHash,
      targetConfig: {
        ...value.targetConfig,
        newPhonemeCandidates: candidateResolutions,
        newPhonemeResolutions: effectiveResolutions,
        targetPhonemeOptions,
      },
      updatedAt: new Date().toISOString(),
      items: updatedItems,
      summary: {
        included: included.length,
        skipped: value.items.length - included.length,
        blocking,
        validationStatus: "checked",
        checkedAt: new Date().toISOString(),
      },
    };
  }

  async commitDelivery(deliveryId: string): Promise<EvolutionDelivery> {
    const current = await this.deliveries.get(deliveryId);
    if (!current || current.status !== "draft")
      throw new Error("演化提交草稿不存在或已经提交。");
    const delivery = await this.validateDelivery(current);
    if (
      delivery.items.some(
        (item) =>
          item.decision !== "skip" &&
          item.conflicts.some((issue) => issue.severity === "error")
      )
    ) {
      await this.saveDeliveryDraft(delivery);
      throw new Error("提交仍有阻断问题，请根据检查结果处理后重试。");
    }
    const run = await this.runs.get(delivery.runId);
    if (!run) throw new Error("运行记录不存在。");
    const runItems = await this.runs.listItems(run.id, 0, 100_000);
    const sourceState = await this.history.resolveStage(run.sourceStageId);
    const sourceLexemes = Object.values(sourceState.components.lexicon).map(
      toLexeme
    );
    const sourceById = new Map(sourceLexemes.map((item) => [item.id, item]));
    const runById = new Map(runItems.map((item) => [item.id, item]));
    const stages = await this.history.listStages(run.sourceLanguageId);
    const now = new Date().toISOString();
    const snapshot = this.project.getSnapshot();
    if (!snapshot) throw new Error("当前没有打开项目。");
    const operationId = uuid();
    let targetLanguageId = run.sourceLanguageId;
    let targetStageId = delivery.targetStageId ?? "";
    const payload: Record<string, unknown> = { overrides: [], itemTargets: [] };
    const phonemeResolutions = readPhonemeResolutions(
      delivery.targetConfig.newPhonemeResolutions
    );

    if (delivery.targetType === "new_stage") {
      targetStageId = targetStageId || uuid();
      payload.stage = stagePayload(delivery, run.sourceStageId, stages);
    } else if (delivery.targetType === "new_descendant") {
      targetLanguageId =
        delivery.targetLanguageId &&
        delivery.targetLanguageId !== run.sourceLanguageId
          ? delivery.targetLanguageId
          : uuid();
      targetStageId = targetStageId || uuid();
      const copied = buildDescendantPayload(
        sourceState.components.morphemes,
        sourceLexemes,
        delivery,
        runById,
        snapshot.project.id,
        run,
        targetLanguageId,
        targetStageId
      );
      payload.stage = stagePayload(delivery, undefined, []);
      payload.descendant = copied.descendant;
      payload.itemTargets = copied.itemTargets;
    } else {
      if (!targetStageId) throw new Error("请选择已有目标阶段或方言。");
    }

    if (delivery.targetType !== "new_descendant") {
      const overrides: Array<Record<string, unknown>> = [];
      const itemTargets: Array<Record<string, unknown>> = [];
      for (const item of delivery.items.filter(
        (candidate) => candidate.decision !== "skip"
      )) {
        const runItem = runById.get(item.runItemId);
        const source = runItem?.sourceLexemeId
          ? sourceById.get(runItem.sourceLexemeId)
          : undefined;
        if (!runItem || !source)
          throw new Error("来源词条已不存在，不能提交旧运行。");
        let targetId = source.id;
        let lexeme = evolvedLexeme(source, item, targetId, now);
        if (item.decision === "create_homograph") {
          targetId = uuid();
          lexeme = evolvedLexeme(source, item, targetId, now, true);
        } else if (item.decision === "merge_senses") {
          if (!item.targetLexemeId) throw new Error("缺少合并目标词条。");
          const state = await this.history.resolveStage(targetStageId);
          const existing = Object.values(state.components.lexicon)
            .map(toLexeme)
            .find((candidate) => candidate.id === item.targetLexemeId);
          if (!existing) throw new Error("合并目标词条已不存在。");
          targetId = existing.id;
          lexeme = {
            ...existing,
            senses: mergeSenses(existing, source),
            updatedAt: now,
          };
        }
        overrides.push({
          id: `${delivery.id}:${item.id}`,
          targetId,
          payloadJson: JSON.stringify(lexeme),
        });
        itemTargets.push({ itemId: item.id, targetLexemeId: targetId });
      }
      payload.overrides = overrides;
      payload.itemTargets = itemTargets;
    }

    if (phonemeResolutions.length) {
      const sourceProfile = await this.phase6.getPhonology(
        run.sourceLanguageId,
        delivery.targetType === "new_stage" ||
          delivery.targetType === "new_descendant"
          ? run.sourceStageId
          : targetStageId
      );
      payload.phonologyOverride = buildEvolutionPhonologyOverride(
        sourceProfile,
        phonemeResolutions,
        targetLanguageId,
        delivery.id,
        now,
        delivery.targetType === "new_descendant"
      );
    }

    await this.write(
      "evolution-delivery.commit",
      "提交演化结果",
      () =>
        this.deliveries.commit({
          operationId,
          deliveryId: delivery.id,
          targetLanguageId,
          targetStageId,
          committedAt: now,
          payload,
        }),
      { operationId }
    );
    if (delivery.targetType === "new_descendant") {
      await this.project.listLanguages();
    }
    const committed = await this.deliveries.get(delivery.id);
    if (!committed) throw new Error("提交完成后无法读取记录。");
    return committed;
  }

  private validateIpaCached(ipa: string): Promise<IpaValidationResult> {
    const key = ipa.normalize("NFC");
    const cached = this.ipaValidationCache.get(key);
    if (cached) return cached;
    const pending = this.phase6.validateIpa(key).catch((reason) => {
      this.ipaValidationCache.delete(key);
      throw reason;
    });
    if (this.ipaValidationCache.size >= 500) {
      const oldest = this.ipaValidationCache.keys().next().value;
      if (oldest) this.ipaValidationCache.delete(oldest);
    }
    this.ipaValidationCache.set(key, pending);
    return pending;
  }

  private async validateIpasCached(
    ipas: string[]
  ): Promise<IpaValidationResult[]> {
    const keys = ipas.map((ipa) => ipa.normalize("NFC"));
    const pendingByKey = new Map(
      keys.flatMap((key) => {
        const cached = this.ipaValidationCache.get(key);
        return cached ? [[key, cached] as const] : [];
      })
    );
    const missing = [...new Set(keys.filter((key) => !this.ipaValidationCache.has(key)))];
    if (missing.length) {
      const results = await this.phase6.validateIpas(missing);
      if (results.length !== missing.length) {
        throw new Error("PanPhon 批量检查返回的结果数量不正确。");
      }
      missing.forEach((key, index) => {
        if (this.ipaValidationCache.size >= 500) {
          const oldest = this.ipaValidationCache.keys().next().value;
          if (oldest) this.ipaValidationCache.delete(oldest);
        }
        const pending = Promise.resolve(results[index]);
        this.ipaValidationCache.set(key, pending);
        pendingByKey.set(key, pending);
      });
    }
    return Promise.all(keys.map((key) => pendingByKey.get(key)!));
  }

  async getGraphData() {
    const snapshot = this.project.getSnapshot();
    if (!snapshot) throw new Error("当前没有打开项目。");
    const [relations, markers, stageGroups] = await Promise.all([
      this.history.listLanguageRelations(),
      this.deliveries.listGraphMarkers(snapshot.project.id),
      Promise.all(
        snapshot.languages.map(
          async (language) =>
            [language.id, await this.history.listStages(language.id)] as const
        )
      ),
    ]);
    return {
      languages: snapshot.languages,
      relations,
      stagesByLanguage: new Map(stageGroups),
      markers,
    };
  }

  normalizeEngineInput(value: string, mode: EvolutionInputMode): string {
    return normalizeEngineInput(value, mode);
  }

  private async persistTerminalRun(input: {
    plan: EvolutionPlan;
    version: EvolutionPlanVersion;
    input: RunEvolutionInput;
    phonology: PhonologyProfile;
    prepared: EvolutionRunItem[];
    createdAt: string;
    status: EvolutionRun["status"];
    errors: EvolutionIssue[];
  }): Promise<EvolutionRun> {
    const summary = summarize(input.prepared);
    const completedAt = new Date().toISOString();
    const run: EvolutionRun & { items: EvolutionRunItem[] } = {
      id: uuid(),
      planVersionId: input.version.id,
      sourceLanguageId: input.plan.languageId,
      sourceStageId: input.input.sourceStageId,
      inputMode: input.plan.inputMode,
      status: input.status,
      engineVersion: this.engineIdentity.version,
      engineHash: this.engineIdentity.hash,
      protocolVersion: this.engineIdentity.protocolVersion,
      rulesHash: await hashValue(input.plan.rulesDraft),
      inputHash: await hashValue(input.prepared.map(inputSnapshot)),
      sourceStateHash: await hashValue({
        items: input.prepared.map(inputSnapshot),
        phonology: input.phonology,
      }),
      sourcePhonology: input.phonology as unknown as Record<string, unknown>,
      summary,
      errors: input.errors,
      createdAt: input.createdAt,
      completedAt,
      items: input.prepared.map((item) => ({ ...item, runId: "" })),
    };
    run.items = run.items.map((item) => ({ ...item, runId: run.id }));
    await this.write(
      "evolution-run.create",
      `保存“${input.plan.name}”运行记录`,
      () => this.runs.create(run)
    );
    return run;
  }

  private async requirePlan(id: string): Promise<EvolutionPlan> {
    const plan = await this.plans.get(id);
    if (!plan) throw new Error("演化方案不存在。");
    return plan;
  }

  private async write<T>(
    kind: string,
    summary: string,
    action: () => Promise<T>,
    options?: {
      operationId?: string;
      coalesceKey?: string;
      coalesceSessionId?: string;
    }
  ): Promise<T> {
    const result = await this.project.runProjectOperation(
      kind,
      summary,
      action,
      options
    );
    await this.project.markProjectChanged();
    return result;
  }
}

function prepareInput(
  lexeme: Lexeme,
  mode: EvolutionInputMode,
  temporary: string | undefined,
  position: number
): EvolutionRunItem {
  const stored = mode === "phonological" ? lexeme.ipa : lexeme.romanized;
  const chosen =
    mode === "phonological" && !stored.trim()
      ? temporary?.trim() ?? ""
      : stored;
  const inputOrigin =
    mode === "phonological" && !stored.trim()
      ? chosen
        ? ("temporary" as const)
        : ("missing" as const)
      : ("stored" as const);
  return {
    id: uuid(),
    runId: "",
    sourceLexemeId: lexeme.id,
    sourceDisplayForm: lexeme.romanized,
    sourcePhonologicalForm: lexeme.ipa,
    engineInput: chosen ? normalizeEngineInput(chosen, mode) : "",
    engineOutput: "",
    targetPhonologicalForm: "",
    inputOrigin,
    status: inputOrigin === "missing" ? "not_run" : "unchanged",
    intermediate: {},
    trace: [],
    issues:
      inputOrigin === "missing"
        ? [
            {
              code: "MISSING_IPA",
              severity: "warning",
              message: "缺少 IPA，本词未参与运行。",
              recovery: "填写临时 IPA，或返回词典补充正式 IPA。",
            },
          ]
        : [],
    position,
  };
}

function normalizeEngineInput(value: string, mode: EvolutionInputMode): string {
  const trimmed = value.trim();
  if (mode === "orthographic") return trimmed.normalize("NFC");
  const wrapped =
    (trimmed.startsWith("/") && trimmed.endsWith("/")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  return (wrapped ? trimmed.slice(1, -1) : trimmed).normalize("NFC");
}

function isProsodicSeparator(value: string): boolean {
  return /^[\s.·‧ˈˌ'’‿|‖#_-]+$/u.test(value);
}

function readPhonemeResolutions(value: unknown): EvolutionPhonemeResolution[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Record<string, unknown>;
    const ipa = String(raw.ipa ?? "")
      .normalize("NFC")
      .trim();
    if (!ipa) return [];
    const category = ["consonant", "vowel", "suprasegmental", "other"].includes(
      String(raw.category)
    )
      ? (String(raw.category) as EvolutionPhonemeResolution["category"])
      : inferPhonemeClass(ipa);
    const role = raw.role === "allophone" ? "allophone" : "phoneme";
    return [
      {
        ipa,
        displaySymbol: String(raw.displaySymbol ?? ipa).trim() || ipa,
        category,
        role,
        parentPhonemeId:
          role === "allophone" && raw.parentPhonemeId
            ? String(raw.parentPhonemeId)
            : undefined,
        distribution: String(raw.distribution ?? "").trim(),
        sourceRule: raw.sourceRule ? String(raw.sourceRule) : undefined,
      },
    ];
  });
}

function inferPhonemeClass(
  ipa: string
): EvolutionPhonemeResolution["category"] {
  return /^[aeiouyɑɐɒæɛɜəɞɘɤɨɪɔœɵøʉʊʌɯɶɚɝ]+$/u.test(ipa)
    ? "vowel"
    : "consonant";
}

function inferPhonemeEvidence(
  ipa: string,
  runItems: EvolutionRunItem[],
  rules: string
): { distribution: string; sourceRule?: string } {
  for (const item of runItems) {
    let before = item.engineInput;
    for (const step of item.trace) {
      if (!before.includes(ipa) && step.output.includes(ipa)) {
        const condition = ruleCondition(rules, step.rule);
        return {
          sourceRule: step.rule,
          distribution: condition
            ? condition + "（来自规则“" + step.rule + "”）"
            : "由规则“" + step.rule + "”产生",
        };
      }
      before = step.output;
    }
  }
  const observed = runItems
    .map((item) => observedEnvironment(item.engineOutput, ipa))
    .filter((value): value is string => Boolean(value));
  return {
    distribution: observed.length
      ? "观察到：" + [...new Set(observed)].slice(0, 4).join("；")
      : "所有已观察到的环境（请确认）",
  };
}

function ruleCondition(rules: string, ruleName: string): string {
  const lines = rules.split(/\r?\n/u);
  const start = lines.findIndex((line) => line.trim() === ruleName + ":");
  if (start < 0) return "";
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^[^\s].*:\s*$/u.test(lines[index])) break;
    const slash = line.lastIndexOf("/");
    if (slash >= 0) return line.slice(slash + 1).trim();
    if (line.includes("=>") || line.includes("→")) return "所有环境";
  }
  return "";
}

function observedEnvironment(output: string, ipa: string): string | undefined {
  const index = output.indexOf(ipa);
  if (index < 0) return undefined;
  const left = index === 0 ? "#" : [...output.slice(0, index)].at(-1) ?? "#";
  const right = output.slice(index + ipa.length)[0] ?? "#";
  return left + " _ " + right;
}

function buildEvolutionPhonologyOverride(
  source: PhonologyProfile,
  resolutions: EvolutionPhonemeResolution[],
  targetLanguageId: string,
  deliveryId: string,
  now: string,
  remapProfile: boolean
): PhonologyProfile {
  const profileId = remapProfile ? uuid() : source.id;
  const idMap = new Map(
    source.phonemes.map((phoneme) => [
      phoneme.id,
      remapProfile ? uuid() : phoneme.id,
    ])
  );
  const basePhonemes = source.phonemes.map((phoneme) => ({
    ...phoneme,
    id: idMap.get(phoneme.id)!,
    profileId,
    parentPhonemeId: phoneme.parentPhonemeId
      ? idMap.get(phoneme.parentPhonemeId)
      : undefined,
  }));
  const known = new Set(
    basePhonemes.map((phoneme) => phoneme.ipa.normalize("NFC"))
  );
  const additions = resolutions
    .filter((resolution) => !known.has(resolution.ipa.normalize("NFC")))
    .map((resolution, position) => {
      const parent = resolution.parentPhonemeId
        ? idMap.get(resolution.parentPhonemeId) ?? resolution.parentPhonemeId
        : undefined;
      const parentPhoneme = basePhonemes.find(
        (phoneme) => phoneme.id === parent
      );
      return {
        id: uuid(),
        profileId,
        ipa: resolution.ipa,
        displaySymbol: resolution.displaySymbol,
        category: parentPhoneme?.category ?? resolution.category,
        role: resolution.role,
        parentPhonemeId: resolution.role === "allophone" ? parent : undefined,
        distribution: resolution.distribution,
        source: "evolution-confirmed",
        notes:
          "由演化提交 " +
          deliveryId +
          " 人工确认" +
          (resolution.sourceRule ? "；来源规则：" + resolution.sourceRule : ""),
        position: basePhonemes.length + position,
      };
    });
  return {
    ...source,
    id: profileId,
    languageId: targetLanguageId,
    phonemes: [...basePhonemes, ...additions],
    createdAt: remapProfile ? now : source.createdAt,
    updatedAt: now,
  };
}

function wrapLikeSource(output: string, source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith("/") && trimmed.endsWith("/")) return `/${output}/`;
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return `[${output}]`;
  return output;
}

function validateOutput(
  output: string,
  phonology: PhonologyProfile,
  phase6: Phase6Application
): EvolutionIssue[] {
  if (!output.trim())
    return [
      {
        code: "EMPTY_OUTPUT",
        severity: "error",
        message: "Lexurgy 生成了空音系形式。",
        recovery: "修改规则或跳过该词。",
      },
    ];
  if (!phonology.phonemes.some((item) => item.role === "phoneme")) return [];
  return phase6
    .validatePhonotactics(output, phonology)
    .warnings.map((message) => ({
      code: "PHONOTACTICS_WARNING",
      severity: "warning" as const,
      message,
      recovery: "检查目标音系；新音位必须在提交前确认。",
    }));
}

function summarize(items: EvolutionRunItem[]) {
  return {
    total: items.length,
    changed: items.filter((item) => item.status === "changed").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    warnings: items.filter((item) => item.status === "warning").length,
    errors: items.filter((item) => item.status === "error").length,
    notRun: items.filter((item) => item.status === "not_run").length,
  };
}

function inputSnapshot(item: EvolutionRunItem) {
  return {
    sourceLexemeId: item.sourceLexemeId,
    sourceDisplayForm: item.sourceDisplayForm,
    sourcePhonologicalForm: item.sourcePhonologicalForm,
    engineInput: item.engineInput,
    inputOrigin: item.inputOrigin,
    position: item.position,
  };
}

function currentInputSnapshot(
  item: EvolutionRunItem,
  lexemes: Map<string, Lexeme>,
  mode: EvolutionInputMode
) {
  const current = item.sourceLexemeId
    ? lexemes.get(item.sourceLexemeId)
    : undefined;
  if (!current) return { ...inputSnapshot(item), missingSource: true };
  const stored = mode === "phonological" ? current.ipa : current.romanized;
  const engineInput =
    item.inputOrigin === "temporary"
      ? item.engineInput
      : normalizeEngineInput(stored, mode);
  return {
    sourceLexemeId: current.id,
    sourceDisplayForm: current.romanized,
    sourcePhonologicalForm: current.ipa,
    engineInput,
    inputOrigin: item.inputOrigin,
    position: item.position,
  };
}

function fold(value: string) {
  return value.trim().normalize("NFC").toLocaleLowerCase();
}

function groupByNormalized<T>(
  items: T[],
  value: (item: T) => string
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = fold(value(item));
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function dedupeIssues(issues: EvolutionIssue[]): EvolutionIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stagePayload(
  delivery: EvolutionDelivery,
  chronologyParentId: string | undefined,
  stages: Array<{ position: number }>
) {
  return {
    name:
      String(delivery.targetConfig.name ?? "演化后阶段").trim() || "演化后阶段",
    chronologyParentId: chronologyParentId ?? null,
    dataBaseStageId: chronologyParentId ?? null,
    startLabel: String(delivery.targetConfig.startLabel ?? ""),
    endLabel: String(delivery.targetConfig.endLabel ?? ""),
    position: Math.max(0, ...stages.map((stage) => stage.position)) + 1,
  };
}

function evolvedLexeme(
  source: Lexeme,
  item: EvolutionDeliveryItem,
  id: string,
  now: string,
  remapSenses = false
): Lexeme {
  return {
    ...source,
    id,
    romanized: item.targetDisplayForm.trim(),
    ipa: item.targetPhonologicalForm.trim(),
    updatedAt: now,
    senses: source.senses.map((sense, position) => ({
      ...sense,
      id: remapSenses ? uuid() : sense.id,
      position,
    })),
  };
}

function mergeSenses(target: Lexeme, source: Lexeme) {
  const definitions = new Set(
    target.senses.map((sense) => fold(sense.definition))
  );
  return [
    ...target.senses.map((sense, position) => ({ ...sense, position })),
    ...source.senses
      .filter((sense) => !definitions.has(fold(sense.definition)))
      .map((sense, offset) => ({
        id: uuid(),
        definition: sense.definition,
        position: target.senses.length + offset,
      })),
  ];
}

function buildDescendantPayload(
  morphemeRecords: Record<string, Record<string, unknown>>,
  sourceLexemes: Lexeme[],
  delivery: EvolutionDelivery,
  runById: Map<string, EvolutionRunItem>,
  projectId: string,
  run: EvolutionRun,
  targetLanguageId: string,
  targetStageId: string
) {
  const morphemes = Object.values(morphemeRecords).map(toMorpheme);
  const morphemeIds = new Map(morphemes.map((item) => [item.id, uuid()]));
  const itemBySource = new Map<string, EvolutionDeliveryItem>();
  for (const item of delivery.items) {
    const sourceId = runById.get(item.runItemId)?.sourceLexemeId;
    if (sourceId) itemBySource.set(sourceId, item);
  }
  const lexemeIds = new Map(sourceLexemes.map((item) => [item.id, uuid()]));
  const itemTargets: Array<Record<string, unknown>> = [];
  const lexemes = sourceLexemes.map((source) => {
    const decision = itemBySource.get(source.id);
    const targetId = lexemeIds.get(source.id)!;
    if (decision && decision.decision !== "skip")
      itemTargets.push({ itemId: decision.id, targetLexemeId: targetId });
    return {
      id: targetId,
      romanized:
        decision && decision.decision !== "skip"
          ? decision.targetDisplayForm.trim()
          : source.romanized,
      ipa:
        decision && decision.decision !== "skip"
          ? decision.targetPhonologicalForm.trim()
          : source.ipa,
      partOfSpeech: source.partOfSpeech,
      status: source.status,
      sourceType: "imported",
      notes: source.notes,
      senses: source.senses.map((sense, position) => ({
        id: uuid(),
        definition: sense.definition,
        position,
      })),
      morphemes: source.morphemes.flatMap((link) => {
        const mapped = morphemeIds.get(link.morphemeId);
        return mapped ? [{ morphemeId: mapped, role: link.role }] : [];
      }),
    };
  });
  const languageName =
    String(delivery.targetConfig.languageName ?? "后代语言").trim() ||
    "后代语言";
  return {
    descendant: {
      projectId,
      languageName,
      profile: {},
      sourceLanguageId: run.sourceLanguageId,
      sourceStageId: run.sourceStageId,
      relationId: uuid(),
      notes: `由演化运行 ${run.id} 创建`,
      morphemes: morphemes.map((item) => ({
        ...item,
        id: morphemeIds.get(item.id),
        compositionRule: item.compositionRule ?? { mode: "none" },
      })),
      lexemes,
      etymologies: sourceLexemes.map((item) => ({
        id: uuid(),
        sourceLexemeId: item.id,
        targetLexemeId: lexemeIds.get(item.id),
        sourceForm: item.romanized,
      })),
      targetStageId,
    },
    itemTargets,
  };
}

function toMorpheme(value: Record<string, unknown>): Morpheme {
  return {
    id: String(value.id ?? ""),
    languageId: String(value.languageId ?? ""),
    form: String(value.form ?? ""),
    type: (value.type ?? "root") as Morpheme["type"],
    meaning: String(value.meaning ?? ""),
    applicablePartOfSpeech: String(value.applicablePartOfSpeech ?? ""),
    status: (value.status ?? "draft") as Morpheme["status"],
    compositionRule: (value.compositionRule ?? {
      mode: "none",
    }) as Morpheme["compositionRule"],
    notes: String(value.notes ?? ""),
    createdAt: String(value.createdAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
  };
}

function versionContent(plan: EvolutionPlan) {
  return {
    rules: plan.rulesDraft,
    testWords: plan.testWords,
    inputMode: plan.inputMode,
    scope: plan.scope,
  };
}

async function hashValue(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function toLexeme(value: Record<string, unknown>): Lexeme {
  return {
    id: String(value.id ?? ""),
    languageId: String(value.languageId ?? ""),
    romanized: String(value.romanized ?? ""),
    ipa: String(value.ipa ?? ""),
    partOfSpeech: String(value.partOfSpeech ?? ""),
    status:
      value.status === "confirmed" || value.status === "deprecated"
        ? value.status
        : "draft",
    sourceType:
      value.sourceType === "generated" ||
      value.sourceType === "derived" ||
      value.sourceType === "imported"
        ? value.sourceType
        : "manual",
    notes: String(value.notes ?? ""),
    createdAt: String(value.createdAt ?? ""),
    updatedAt: String(value.updatedAt ?? ""),
    senses: Array.isArray(value.senses)
      ? (value.senses as Lexeme["senses"])
      : [],
    morphemes: Array.isArray(value.morphemes)
      ? (value.morphemes as Lexeme["morphemes"])
      : [],
  };
}

function uniquePlanName(existing: string[], preferred = "新演化方案"): string {
  if (!existing.includes(preferred)) return preferred;
  let suffix = 2;
  while (existing.includes(`${preferred} ${suffix}`)) suffix += 1;
  return `${preferred} ${suffix}`;
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
