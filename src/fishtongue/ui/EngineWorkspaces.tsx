import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { AiProposalDraft } from "@/fishtongue/application/ports/AiPorts";
import { normalizeInflectionRules } from "@/fishtongue/application/services/AiProposalService";
import {
  SoundChangeRunResult,
  ValidationResult,
} from "@/fishtongue/application/ports/SoundChangeEngine";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import {
  Evolution,
  InflectionSystem,
  LanguageStage,
  StageEvolutionBatch,
  StageEvolutionOperation,
} from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import ScCodeEditor from "@/sc/ScCodeEditor";
import {
  CheckCircledIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

export function EvolutionWorkspace({
  application,
  service,
  languageId,
  live,
  aiDraft,
  onAiDraftConsumed,
  historyApplication,
  selectedStageId,
  onStageDataChanged,
}: {
  application: ProjectApplication;
  service?: SoundChangeService;
  languageId: string;
  live: boolean;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
  historyApplication?: Phase5Application;
  selectedStageId?: string;
  onStageDataChanged?: () => void;
}) {
  const enabled = live && Boolean(service);
  const [evolution, setEvolution] = useState<Evolution | null>(null);
  const [lexiconWords, setLexiconWords] = useState<string[]>([]);
  const [source, setSource] = useState<"tests" | "lexicon">("tests");
  const [validation, setValidation] = useState<ValidationResult>();
  const [result, setResult] = useState<SoundChangeRunResult>();
  const [status, setStatus] = useState("引擎尚未启动");
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [stages, setStages] = useState<LanguageStage[]>([]);
  const [sourceStageId, setSourceStageId] = useState(selectedStageId ?? "");
  const [targetStageId, setTargetStageId] = useState("");
  const [stageBatches, setStageBatches] = useState<StageEvolutionBatch[]>([]);
  const [stageOperations, setStageOperations] = useState<StageEvolutionOperation[]>([]);
  const controller = useRef<AbortController>();
  const processedDraft = useRef<string>();

  useEffect(() => {
    setEvolution(null);
    setResult(undefined);
    setValidation(undefined);
    setError(undefined);
    setDirty(false);
    setAiPending(false);
    if (!enabled || !service) return;
    void Promise.all([
      application.getEvolution(languageId),
      application.listLexemes(languageId),
      service.getEngineStatus(),
    ])
      .then(([nextEvolution, lexemes, engine]) => {
        // A duplicate/late load must not overwrite an AI draft or a user edit
        // that was already applied after the first load completed.
        setEvolution((current) => current ?? nextEvolution);
        setLexiconWords(lexemes.map((lexeme) => lexeme.romanized));
        setStatus(engine.message);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [application, enabled, languageId, service]);

  useEffect(() => {
    if (!historyApplication || !live) return;
    void Promise.all([
      historyApplication.listStages(languageId),
      historyApplication.listStageEvolutionBatches(languageId),
      historyApplication.listStageEvolutionOperations(languageId),
    ]).then(([nextStages, batches, operations]) => {
      setStages(nextStages);
      setStageBatches(batches);
      setStageOperations(operations);
      const defaultStage = nextStages.find((stage) => stage.kind === "internal_default");
      const sourceId = nextStages.some((stage) => stage.id === selectedStageId)
        ? selectedStageId!
        : defaultStage?.id ?? "";
      setSourceStageId(sourceId);
      setTargetStageId((current) => current &&
        nextStages.some((stage) => stage.id === current && current !== sourceId)
        ? current
        : nextStages.find((stage) =>
          stage.id !== sourceId && stage.storageMode !== "no_data"
        )?.id ?? "");
    }).catch((reason) => setError(errorMessage(reason)));
  }, [historyApplication, languageId, live, selectedStageId]);

  useEffect(() => {
    if (
      !evolution
      || !aiDraft
      || aiDraft.kind !== "evolution.update_draft"
      || processedDraft.current === aiDraft.requestId
    ) return;
    processedDraft.current = aiDraft.requestId;
    const patch = aiDraft.patch;
    const testWords = Array.isArray(patch.testWords)
      ? patch.testWords.map((value, position) => ({
          id: uuid(),
          word: typeof value === "object" && value
            ? String((value as Record<string, unknown>).word ?? "")
            : String(value),
          position,
        })).filter((item) => item.word)
      : evolution.testWords;
    setEvolution({
      ...evolution,
      soundChanges: String(patch.soundChanges ?? ""),
      testWords,
    });
    setValidation(undefined);
    setResult(undefined);
    setDirty(true);
    setAiPending(true);
    onAiDraftConsumed?.(aiDraft.requestId);
    setStatus("AI 演化草稿已填入编辑器；请验证后手动确认内容。");
  }, [aiDraft, evolution, onAiDraftConsumed]);

  useEffect(() => {
    if (!live || !dirty || !evolution || aiPending) return;
    const timer = window.setTimeout(() => {
      void application
        .saveEvolution(evolution)
        .then(() => {
          setDirty(false);
          setStatus("规则与测试词已保存到项目");
        })
        .catch((reason) => setError(errorMessage(reason)));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [aiPending, application, dirty, evolution, live]);

  const saveAiDraft = async () => {
    if (!evolution || !validation?.valid) return;
    try {
      await application.saveEvolution(evolution);
      setAiPending(false);
      setDirty(false);
      setStatus("AI 演化草稿已经验证并保存到项目。");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };

  const inputWords = useMemo(
    () =>
      source === "lexicon"
        ? lexiconWords
        : evolution?.testWords.map((item) => item.word).filter(Boolean) ?? [],
    [evolution, lexiconWords, source]
  );

  if (!enabled || !service) {
    return <EngineUnavailable kind="音变" />;
  }
  if (!evolution) {
    return <div className={styles.engineEmpty}>正在加载当前语言的演化方案…</div>;
  }

  const updateWords = (text: string) => {
    const words = text.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
    setEvolution({
      ...evolution,
      testWords: words.map((word, position) => ({
        id: evolution.testWords[position]?.id ?? uuid(),
        word,
        position,
      })),
    });
    setValidation(undefined);
    setDirty(true);
  };

  const validate = async () => {
    setError(undefined);
    setResult(undefined);
    setStatus("正在验证规则…");
    try {
      const ready = await service.ensureReady();
      setStatus(`${ready.message}${ready.engineVersion ? ` · ${ready.engineVersion}` : ""}`);
      const next = await service.validate({ changes: evolution.soundChanges });
      setValidation(next);
      setStatus(next.valid ? `验证通过：${next.ruleNames.length} 条规则` : "规则存在问题");
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("验证失败");
    }
  };

  const run = async () => {
    setError(undefined);
    setResult(undefined);
    controller.current = new AbortController();
    try {
      const next = await service.run(
        {
          changes: evolution.soundChanges,
          inputWords,
          traceWords: inputWords.slice(0, 3),
        },
        (event) => setStatus(event.message),
        controller.current.signal
      );
      setResult(next);
      setStatus(
        next.errors.length
          ? `完成，但有 ${next.errors.length} 个单词错误`
          : `预览完成：${next.outputWords.length} 个结果`
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("运行未完成");
    } finally {
      controller.current = undefined;
    }
  };

  const createStageReview = async () => {
    if (!historyApplication || !service || !sourceStageId || !targetStageId) return;
    setError(undefined);
    setStatus("正在生成阶段演化审核…");
    try {
      const [sourceState, targetState] = await Promise.all([
        historyApplication.resolveStage(sourceStageId),
        historyApplication.resolveStage(targetStageId),
      ]);
      const entries = Object.values(sourceState.components.lexicon);
      const words = entries.map((entry) => String(entry.romanized ?? "")).filter(Boolean);
      if (!words.length) throw new Error("来源阶段没有可演化的词条。");
      const preview = await service.run(
        { changes: evolution.soundChanges, inputWords: words, traceWords: [] },
        (event) => setStatus(event.message)
      );
      const targetForms = new Map(
        Object.entries(targetState.components.lexicon).map(([id, entry]) => [
          String(entry.romanized ?? "").normalize("NFC").toLocaleLowerCase(),
          id,
        ])
      );
      const now = new Date().toISOString();
      const batch: StageEvolutionBatch = {
        id: uuid(),
        languageId,
        sourceStageId,
        targetStageId,
        rulesSnapshot: evolution.soundChanges,
        inputSnapshot: entries.map((entry, index) => ({
          lexemeId: String(entry.id ?? `source-${index}`),
          form: words[index],
        })),
        status: "draft",
        createdAt: now,
        candidates: entries.map((entry, index) => {
          const sourceId = String(entry.id ?? `source-${index}`);
          const resultForm = preview.outputWords[index] ?? words[index];
          const occupiedBy = targetForms.get(
            resultForm.normalize("NFC").toLocaleLowerCase()
          );
          return {
            id: uuid(),
            sourceLexemeId: sourceId,
            sourceForm: words[index],
            resultForm,
            payload: { ...entry, romanized: resultForm },
            status: "pending",
            conflicts: occupiedBy && occupiedBy !== sourceId ? [{
              code: "DUPLICATE_LEXEME" as const,
              message: "目标阶段已有相同词形。",
            }] : [],
            position: index,
          };
        }),
      };
      await historyApplication.createStageEvolutionBatch(batch);
      setStageBatches(await historyApplication.listStageEvolutionBatches(languageId));
      setStatus(`已创建 ${batch.candidates.length} 项阶段演化审核；尚未写入目标阶段。`);
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("阶段演化审核未创建");
    }
  };

  const firstIssue = validation && !validation.valid ? validation.issues[0] : undefined;
  return <div className={styles.pageGrid}>
    <div className={styles.tabStrip}>
      <button data-active>演化方案</button><button>预览与追踪</button>
      <button disabled>阶段与分支</button><button disabled>历史记录</button>
    </div>
    <section className={styles.evolutionLayout}>
      <div className={styles.editorPanel}>
        <div className={styles.paneHeader}>
          <span><strong>Lexurgy 音变规则</strong><small>{dirty ? "正在等待自动保存" : status}</small></span>
          <div className={styles.engineActions}>
            <button onClick={() => void validate()}>验证</button>
            {aiPending && <button
              className={styles.primaryButton}
              disabled={!validation?.valid}
              onClick={() => void saveAiDraft()}
            >验证后保存</button>}
            <button className={styles.primaryButton} disabled={!inputWords.length} onClick={() => void run()}>运行预览</button>
            <button disabled={!controller.current} onClick={() => controller.current?.abort()}>取消</button>
          </div>
        </div>
        <div className={styles.codeEditor}>
          <ScCodeEditor
            initialCode={evolution.soundChanges}
            errorLocation={firstIssue?.lineNumber
              ? {
                  line: firstIssue.lineNumber,
                  column: firstIssue.columnNumber,
                }
              : undefined}
            onUpdateCode={(soundChanges) => {
              setEvolution((current) => current ? { ...current, soundChanges } : current);
              setValidation(undefined);
              setDirty(true);
            }}
            height="100%"
          />
        </div>
        {firstIssue && <button className={styles.engineIssue} type="button">
          <ExclamationTriangleIcon aria-hidden="true" />
          <span><strong>{firstIssue.message}</strong>
          <small>{firstIssue.lineNumber ? `第 ${firstIssue.lineNumber} 行，第 ${firstIssue.columnNumber ?? 1} 列` : firstIssue.rule ?? "规则分析错误"}</small></span>
        </button>}
      </div>
      <aside className={styles.conflictPane}>
        <h2>输入来源</h2>
        <div className={styles.segmentedControl}>
          <button data-active={source === "tests"} onClick={() => setSource("tests")}>测试词</button>
          <button data-active={source === "lexicon"} onClick={() => setSource("lexicon")}>当前词典</button>
        </div>
        {source === "tests"
          ? <label className={styles.engineField}>每行一个测试词
              <textarea value={evolution.testWords.map((item) => item.word).join("\n")} onChange={(event) => updateWords(event.target.value)} />
            </label>
          : <div className={styles.engineWordList}>{lexiconWords.length
              ? lexiconWords.slice(0, 40).map((word) => <span key={word}>{word}</span>)
              : <p>当前语言的词典中还没有词条。</p>}
            </div>}
        <div className={styles.warningPanel}><InfoCircledIcon aria-hidden="true" /><div>
          <strong>结果只作预览</strong><p>不会修改词典，也不会创建语言阶段。</p>
        </div></div>
      </aside>
    </section>
    {error && <EngineError message={error} />}
    {result && <SoundChangeResults inputWords={inputWords} result={result} />}
    {historyApplication && stages.length > 1 && <section className={styles.surfacePanel}>
      <div className={styles.panelHeading}><h2>创建下一阶段</h2>
        <span>先审核，后写入目标阶段</span></div>
      <div className={styles.stageEvolutionToolbar}>
        <label>来源阶段<select value={sourceStageId}
          onChange={(event) => setSourceStageId(event.target.value)}>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select></label>
        <label>目标阶段<select value={targetStageId}
          onChange={(event) => setTargetStageId(event.target.value)}>
          <option value="">请选择</option>
          {stages.filter((stage) =>
            stage.id !== sourceStageId && stage.storageMode !== "no_data"
          ).map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select></label>
        <button className={styles.primaryButton} disabled={!targetStageId}
          onClick={() => void createStageReview()}>生成审核批次</button>
      </div>
      <StageEvolutionReview
        application={historyApplication}
        batches={stageBatches}
        operations={stageOperations}
        onChanged={async () => {
          const [batches, operations] = await Promise.all([
            historyApplication.listStageEvolutionBatches(languageId),
            historyApplication.listStageEvolutionOperations(languageId),
          ]);
          setStageBatches(batches);
          setStageOperations(operations);
        }}
        onError={(reason) => setError(errorMessage(reason))}
        onCommitted={onStageDataChanged}
      />
    </section>}
  </div>;
}

function StageEvolutionReview({
  application,
  batches,
  operations,
  onChanged,
  onError,
  onCommitted,
}: {
  application: Phase5Application;
  batches: StageEvolutionBatch[];
  operations: StageEvolutionOperation[];
  onChanged: () => Promise<void>;
  onError: (reason: unknown) => void;
  onCommitted?: () => void;
}) {
  const batch = batches.find((value) => value.status === "draft");
  const activeOperation = operations.find((value) => !value.undoneAt);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => setSelectedIds(new Set()), [batch?.id]);
  const updateSelected = async (status: "accepted" | "rejected") => {
    if (!batch || !selectedIds.size) return;
    for (const candidate of batch.candidates.filter((value) => selectedIds.has(value.id))) {
      await application.saveStageEvolutionCandidate(batch.id, { ...candidate, status });
    }
    setSelectedIds(new Set());
    await onChanged();
  };
  if (!batch) return <div className={styles.stageEvolutionEmpty}>
    <p className={styles.engineEmpty}>没有待审核的阶段演化批次。</p>
    {activeOperation && <button
      onClick={() => {
        void application.undoStageEvolutionOperation(activeOperation.id)
          .then(onChanged).then(onCommitted).catch(onError);
      }}>撤销最近的阶段提交</button>}
  </div>;
  return <div className={styles.stageEvolutionReview}>
    <div className={styles.stageReviewActions}>
      <span>已选择 {selectedIds.size} 项</span>
      <button disabled={!selectedIds.size} onClick={() => void updateSelected("accepted").catch(onError)}>接受所选</button>
      <button disabled={!selectedIds.size} onClick={() => void updateSelected("rejected").catch(onError)}>拒绝所选</button>
    </div>
    <table className={styles.dataTable}><thead><tr>
      <th><input type="checkbox" aria-label="选择全部候选"
        checked={batch.candidates.length > 0 && selectedIds.size === batch.candidates.length}
        onChange={(event) => setSelectedIds(event.target.checked
          ? new Set(batch.candidates.map((candidate) => candidate.id))
          : new Set())} /></th><th>来源</th><th>结果</th><th>状态</th>
    </tr></thead><tbody>{batch.candidates.map((candidate) => <tr key={candidate.id}>
      <td><input type="checkbox" aria-label={`选择 ${candidate.sourceForm}`}
        checked={selectedIds.has(candidate.id)} disabled={candidate.status === "committed"}
        onChange={(event) => setSelectedIds((current) => {
          const next = new Set(current);
          if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id);
          return next;
        })} /></td>
      <td>{candidate.sourceForm}</td>
      <td><input value={candidate.resultForm}
        onChange={(event) => {
          void application.saveStageEvolutionCandidate(batch.id, {
            ...candidate, resultForm: event.target.value,
          }).then(onChanged).catch(onError);
        }} /></td>
      <td>{candidate.conflicts.length ? candidate.conflicts[0].message :
        candidate.status === "accepted" ? "已接受" :
        candidate.status === "rejected" ? "已拒绝" : "待审核"}</td>
    </tr>)}</tbody></table>
    <div className={styles.engineActions}>
      <button className={styles.primaryButton}
        disabled={!batch.candidates.some((value) =>
          value.status === "accepted" && !value.conflicts.length
        )}
        onClick={() => {
          void application.commitStageEvolutionBatch(batch.id)
            .then(onChanged).then(onCommitted).catch(onError);
        }}>提交到目标阶段</button>
    </div>
  </div>;
}

function SoundChangeResults({
  inputWords,
  result,
}: {
  inputWords: string[];
  result: SoundChangeRunResult;
}) {
  return <section className={styles.surfacePanel}>
    <div className={styles.panelHeading}><h2>只读预览结果</h2><span>{result.ruleNames.length} 条规则</span></div>
    <table className={styles.dataTable}><thead><tr><th>输入</th><th>输出</th><th>状态</th></tr></thead>
      <tbody>{inputWords.map((word, index) => {
        const wordError = result.errors.find((item) => item.originalWord === word);
        return <tr key={`${word}-${index}`}><td>{word}</td><td>{result.outputWords[index] ?? "—"}</td>
          <td>{wordError ? <span className={styles.warningText}>{wordError.message}</span> : "完成"}</td></tr>;
      })}</tbody>
    </table>
    {(Object.keys(result.intermediateWords).length > 0 || Object.keys(result.traces).length > 0) &&
      <details className={styles.engineDetails}><summary>中间阶段与逐规则追踪</summary>
        <pre>{JSON.stringify({ intermediateWords: result.intermediateWords, traces: result.traces }, null, 2)}</pre>
      </details>}
  </section>;
}

export function InflectionWorkspace({
  application,
  service,
  languageId,
  live,
  aiDraft,
  onAiDraftConsumed,
}: {
  application: ProjectApplication;
  service?: InflectionService;
  languageId: string;
  live: boolean;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
}) {
  const enabled = live && Boolean(service);
  const [system, setSystem] = useState<InflectionSystem | null>(null);
  const [mode, setMode] = useState<"fixed" | "stem" | "prefix" | "suffix" | "branch">("suffix");
  const [form, setForm] = useState("");
  const [category, setCategory] = useState("plural");
  const [testText, setTestText] = useState("");
  const [outputs, setOutputs] = useState<string[]>([]);
  const [status, setStatus] = useState("引擎尚未启动");
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [aiRulesText, setAiRulesText] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const [aiPreviewed, setAiPreviewed] = useState(false);
  const controller = useRef<AbortController>();
  const processedDraft = useRef<string>();

  useEffect(() => {
    setSystem(null);
    setOutputs([]);
    setDirty(false);
    setAiPending(false);
    setAiPreviewed(false);
    if (!enabled || !service) return;
    void Promise.all([application.getInflectionSystem(languageId), service.getEngineStatus()])
      .then(([next, engine]) => {
        setSystem(next);
        setTestText(next.testCases.map((item) =>
          `${item.stem}${Object.values(item.categories).length ? ` | ${Object.values(item.categories).join(", ")}` : ""}`
        ).join("\n"));
        setStatus(engine.message);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [application, enabled, languageId, service]);

  useEffect(() => {
    if (
      !system
      || !aiDraft
      || aiDraft.kind !== "inflection_system.update_draft"
      || processedDraft.current === aiDraft.requestId
    ) return;
    processedDraft.current = aiDraft.requestId;
    const patch = aiDraft.patch;
    let rules: unknown;
    try {
      rules = normalizeInflectionRules(patch.rules ?? system.rules);
    } catch (reason) {
      setError(errorMessage(reason));
      onAiDraftConsumed?.(aiDraft.requestId);
      return;
    }
    const testCases = Array.isArray(patch.testCases)
      ? patch.testCases.map((value, position) => {
          const item = value && typeof value === "object"
            ? value as Record<string, unknown>
            : {};
          return {
            id: uuid(),
            stem: String(item.stem ?? ""),
            categories: item.categories && typeof item.categories === "object"
              ? item.categories as Record<string, string>
              : {},
            position,
          };
        }).filter((item) => item.stem)
      : system.testCases;
    setSystem({ ...system, rules, testCases });
    setAiRulesText(JSON.stringify(rules, null, 2));
    setTestText(testCases.map((item) =>
      `${item.stem}${Object.values(item.categories).length ? ` | ${Object.values(item.categories).join(", ")}` : ""}`
    ).join("\n"));
    setDirty(true);
    setAiPending(true);
    setAiPreviewed(false);
    setError(undefined);
    onAiDraftConsumed?.(aiDraft.requestId);
    setStatus("AI 屈折草稿已填入编辑器；请检查并运行预览。");
  }, [aiDraft, onAiDraftConsumed, system]);

  useEffect(() => {
    if (!dirty || !system || !live || aiPending) return;
    const timer = window.setTimeout(() => {
      void application.saveInflectionSystem(system)
        .then(() => {
          setDirty(false);
          setStatus("规则与测试词干已保存到项目");
        })
        .catch((reason) => setError(errorMessage(reason)));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [aiPending, application, dirty, live, system]);

  if (!enabled || !service) return <EngineUnavailable kind="屈折" />;
  if (!system) return <div className={styles.engineEmpty}>正在加载屈折系统…</div>;

  const rules = aiRulesText ? parseJsonRules(aiRulesText, system.rules) : createRules(mode, form, category);
  const testCases = parseTestCases(testText, system);
  const saveAiDraft = async () => {
    if (!aiPending || !aiPreviewed) return;
    try {
      const next = { ...system, rules, testCases };
      await application.saveInflectionSystem(next);
      setSystem(next);
      setAiPending(false);
      setDirty(false);
      setStatus("AI 屈折草稿已经预览并保存到项目。");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const updateDraft = (
    nextMode = mode,
    nextForm = form,
    nextCategory = category,
    nextText = testText
  ) => {
    const nextRules = createRules(nextMode, nextForm, nextCategory);
    const nextCases = parseTestCases(nextText, system);
    setSystem({ ...system, rules: nextRules, testCases: nextCases });
    setDirty(true);
  };

  const run = async () => {
    setError(undefined);
    setOutputs([]);
    controller.current = new AbortController();
    try {
      await service.ensureReady();
      const result = await service.inflect({
        rules,
        stems: testCases.map((item) => ({
          id: item.id,
          value: item.stem,
          categories: item.categories,
        })),
      }, controller.current.signal);
      const values = Array.isArray(result.inflectedForms)
        ? result.inflectedForms.map(String)
        : [];
      setOutputs(values);
      if (aiPending) setAiPreviewed(true);
      setStatus(`屈折预览完成：${values.length} 个结果`);
    } catch (reason) {
      setError(errorMessage(reason));
      setStatus("屈折运行未完成");
    } finally {
      controller.current = undefined;
    }
  };

  return <div className={styles.pageGrid}>
    <div className={styles.tabStrip}><button disabled>语素库</button><button disabled>派生构词</button>
      <button data-active>屈折系统</button><button disabled>词形范式</button><button disabled>形态音系</button><button disabled>特殊规则</button></div>
    <section className={styles.inflectionLayout}>
      <div className={styles.surfacePanel}>
        <div className={styles.panelHeading}><h2>规则结构</h2><span>{dirty ? "等待自动保存" : status}</span></div>
        <div className={styles.ruleComposer}>
          <label>规则类型<select value={mode} onChange={(event) => {
            const next = event.target.value as typeof mode;
            setAiRulesText(""); setMode(next); updateDraft(next);
          }}><option value="fixed">固定词形</option><option value="stem">仅词干</option>
            <option value="prefix">前缀 + 词干</option><option value="suffix">词干 + 后缀</option>
            <option value="branch">类别分支</option></select></label>
          {mode !== "stem" && <label>{mode === "fixed" ? "固定输出" : "拼接形式"}
            <input value={form} onChange={(event) => { setAiRulesText(""); setForm(event.target.value); updateDraft(mode, event.target.value); }} />
          </label>}
          {mode === "branch" && <label>分支类别
            <input value={category} onChange={(event) => { setAiRulesText(""); setCategory(event.target.value); updateDraft(mode, form, event.target.value); }} />
          </label>}
          {aiRulesText
            ? <label className={styles.aiRuleDraft}>AI 规则 JSON
                <textarea value={aiRulesText} onChange={(event) => {
                  const text = event.target.value;
                  setAiRulesText(text);
                  setAiPreviewed(false);
                  try {
                    const nextRules = JSON.parse(text);
                    setSystem((current) => current ? { ...current, rules: nextRules } : current);
                    setDirty(true);
                    setError(undefined);
                  } catch {
                    setError("AI 规则 JSON 尚未完整；修正后再运行预览。");
                  }
                }} />
              </label>
            : <pre className={styles.rulePreview}>{JSON.stringify(rules, null, 2)}</pre>}
        </div>
      </div>
      <aside className={styles.conflictPane}>
        <h2>测试词干</h2>
        <label className={styles.engineField}>每行：词干 | 类别
          <textarea value={testText} placeholder={"ama | plural\nnor"} onChange={(event) => {
            setTestText(event.target.value);
            setAiPreviewed(false);
            updateDraft(mode, form, category, event.target.value);
          }} />
        </label>
        <div className={styles.engineActions}><button className={styles.primaryButton} disabled={!testCases.length} onClick={() => void run()}>运行预览</button>
          {aiPending && <button disabled={!aiPreviewed} onClick={() => void saveAiDraft()}>预览后保存</button>}
          <button disabled={!controller.current} onClick={() => controller.current?.abort()}>取消</button></div>
        <div className={styles.warningPanel}><InfoCircledIcon aria-hidden="true" /><div><strong>生成结果不会保存</strong><p>规则和测试输入会保存；输出可随时重新计算。</p></div></div>
      </aside>
    </section>
    {error && <EngineError message={error} />}
    {outputs.length > 0 && <section className={styles.surfacePanel}>
      <div className={styles.panelHeading}><h2>屈折结果</h2><span>只读预览</span></div>
      <table className={styles.dataTable}><thead><tr><th>词干</th><th>类别</th><th>结果</th></tr></thead>
        <tbody>{testCases.map((item, index) => <tr key={item.id}><td>{item.stem}</td>
          <td>{Object.values(item.categories).join(", ") || "—"}</td><td>{outputs[index] ?? "—"}</td></tr>)}</tbody>
      </table>
    </section>}
  </div>;
}

function createRules(
  mode: "fixed" | "stem" | "prefix" | "suffix" | "branch",
  form: string,
  category: string
): unknown {
  const stem = { type: "stem" };
  const fixed = { type: "form", form };
  const concat = (parts: unknown[]) => ({ type: "formula", formula: { type: "concat", parts } });
  if (mode === "fixed") return fixed;
  if (mode === "stem") return { type: "formula", formula: stem };
  if (mode === "prefix") return concat([fixed, stem]);
  if (mode === "suffix") return concat([stem, fixed]);
  return {
    type: "split",
    branches: {
      [category || "marked"]: concat([stem, fixed]),
      default: { type: "formula", formula: stem },
    },
  };
}

function parseTestCases(text: string, system: InflectionSystem) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, position) => {
    const [stem, categories = ""] = line.split("|").map((part) => part.trim());
    const values = categories.split(",").map((part) => part.trim()).filter(Boolean);
    return {
      id: system.testCases[position]?.id ?? uuid(),
      stem,
      categories: Object.fromEntries(values.map((value, index) => [`category${index}`, value])),
      position,
    };
  });
}

function parseJsonRules(text: string, fallback: unknown): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function EngineUnavailable({ kind }: { kind: string }) {
  return <section className={styles.engineEmpty}>
    <InfoCircledIcon aria-hidden="true" /><h2>{kind}功能需要真实项目</h2>
    <p>当前是设计预览。打开或新建 .fishtongue 项目后，才会启动本地 Lexurgy。</p>
    <button disabled>引擎不会在原型模式启动</button>
  </section>;
}

function EngineError({ message }: { message: string }) {
  return <div className={styles.engineError} role="alert"><Cross2Icon aria-hidden="true" /><span><strong>任务未完成</strong><small>{message}</small></span></div>;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
