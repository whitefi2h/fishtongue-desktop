import {
  EvolutionApplication,
  EvolutionInputCandidate,
  EvolutionTestWordPreview,
} from "@/fishtongue/application/ports/EvolutionApplication";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { AiProposalDraft } from "@/fishtongue/application/ports/AiPorts";
import {
  EvolutionDelivery,
  EvolutionGraphData,
  EvolutionGraphMarker,
  EvolutionIssue,
  EvolutionPhonemeOption,
  EvolutionPhonemeResolution,
  EvolutionPlan,
  EvolutionPlanVersion,
  EvolutionRun,
  EvolutionRunItem,
  LanguageStage,
} from "@/fishtongue/domain/models";
import ScCodeEditor from "@/sc/ScCodeEditor";
import {
  ArchiveIcon,
  CheckCircledIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  ReloadIcon,
  ResumeIcon,
} from "@radix-ui/react-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import styles from "@/fishtongue/ui/EvolutionWorkbench.module.css";
import GenealogyCanvas from "@/fishtongue/ui/GenealogyCanvas";

type Selection =
  | { kind: "draft" }
  | { kind: "version"; id: string }
  | { kind: "run"; id: string }
  | { kind: "delivery"; id: string };

type DeliveryAction = "saving" | "validating" | "committing" | null;

interface Props {
  application: ProjectApplication;
  evolution: EvolutionApplication;
  history: Phase5Application;
  languageId: string;
  selectedStageId?: string;
  live: boolean;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
  onStageDataChanged?: () => void;
  onOpenLanguage?: (languageId: string) => void;
  onOpenStage?: (languageId: string, stageId: string) => void;
}

export default function EvolutionWorkbench(props: Props) {
  const [plans, setPlans] = useState<EvolutionPlan[]>([]);
  const [activePlan, setActivePlan] = useState<EvolutionPlan>();
  const [versions, setVersions] = useState<EvolutionPlanVersion[]>([]);
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [deliveries, setDeliveries] = useState<EvolutionDelivery[]>([]);
  const [stages, setStages] = useState<LanguageStage[]>([]);
  const [lexemes, setLexemes] = useState<EvolutionInputCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [temporaryIpa, setTemporaryIpa] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<Selection>({ kind: "draft" });
  const [runItems, setRunItems] = useState<EvolutionRunItem[]>([]);
  const [activeRun, setActiveRun] = useState<EvolutionRun>();
  const [activeDelivery, setActiveDelivery] = useState<EvolutionDelivery>();
  const [selectedRunItemId, setSelectedRunItemId] = useState("");
  const [query, setQuery] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState("");
  const [lexicalStatus, setLexicalStatus] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [saveState, setSaveState] = useState<
    "saved" | "dirty" | "saving" | "failed"
  >("saved");
  const [status, setStatus] = useState("正在读取演化工作台…");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [testingWords, setTestingWords] = useState(false);
  const [testPreview, setTestPreview] = useState<EvolutionTestWordPreview>();
  const [view, setView] = useState<"workbench" | "graph">("workbench");
  const [graphData, setGraphData] = useState<EvolutionGraphData>();
  const [selectedMarker, setSelectedMarker] = useState<EvolutionGraphMarker>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deliveryAction, setDeliveryAction] = useState<DeliveryAction>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactLayoutRef = useRef<boolean>();
  const abortRef = useRef<AbortController>();
  const aiDraftRef = useRef("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const updateLayout = (width: number) => {
      const compact = width < 1360;
      if (compactLayoutRef.current === compact) return;
      compactLayoutRef.current = compact;
      setSidebarCollapsed(compact);
    };
    const updateFromWindow = () =>
      updateLayout(
        Math.min(root.getBoundingClientRect().width || Infinity, window.innerWidth)
      );
    updateFromWindow();
    window.addEventListener("resize", updateFromWindow);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", updateFromWindow);
    }
    const observer = new ResizeObserver(([entry]) =>
      updateLayout(entry.contentRect.width)
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFromWindow);
    };
  }, []);

  const reloadPlans = useCallback(
    async (preferredId?: string) => {
      const next = await props.evolution.listPlans(props.languageId, true);
      setPlans(next);
      const chosen =
        next.find((plan) => plan.id === (preferredId ?? activePlan?.id)) ??
        next.find((plan) => !plan.archived) ??
        next[0];
      setActivePlan(chosen);
      return chosen;
    },
    [activePlan?.id, props.evolution, props.languageId]
  );

  useEffect(() => {
    if (!props.live) return;
    setStatus("正在读取演化工作台…");
    void Promise.all([
      props.evolution.listPlans(props.languageId, true),
      props.history.listStages(props.languageId),
    ])
      .then(([nextPlans, nextStages]) => {
        setPlans(nextPlans);
        setStages(nextStages);
        const chosen =
          nextPlans.find(
            (plan) =>
              plan.sourceStageId === props.selectedStageId && !plan.archived
          ) ??
          nextPlans.find((plan) => !plan.archived) ??
          nextPlans[0];
        setActivePlan(chosen);
        setStatus("演化工作台已就绪");
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [
    props.evolution,
    props.history,
    props.languageId,
    props.live,
    props.selectedStageId,
  ]);

  useEffect(() => {
    const planId = activePlan?.id;
    if (!planId) return;
    let cancelled = false;
    setSelection({ kind: "draft" });
    setActiveRun(undefined);
    setActiveDelivery(undefined);
    setRunItems([]);
    setTestPreview(undefined);
    setSelectedIds(new Set());
    setSaveState("saved");
    void props.evolution
      .getPlan(planId)
      .then(async (storedPlan) => {
        if (!storedPlan || cancelled) return;
        setQuery(storedPlan.scope.query);
        setPartOfSpeech(storedPlan.scope.partOfSpeech);
        setLexicalStatus(storedPlan.scope.lexicalStatus);
        setSourceType(storedPlan.scope.sourceType);
        const values = await Promise.all([
          props.evolution.listVersions(planId),
          props.evolution.listRuns(planId),
          props.evolution.resolveInputs(
            props.languageId,
            storedPlan.sourceStageId ?? ""
          ),
        ]);
        if (cancelled) return;
        const [nextVersions, nextRuns, nextLexemes] = values;
        setVersions(nextVersions);
        setRuns(nextRuns);
        setLexemes(nextLexemes);
      })
      .catch((reason) => setError(errorMessage(reason)));
    return () => {
      cancelled = true;
      props.evolution.endPlanEditSession(planId);
    };
  }, [activePlan?.id, props.evolution, props.languageId]);

  useEffect(() => {
    if (!activePlan || saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void props.evolution
        .savePlan(activePlan)
        .then(async () => {
          setSaveState("saved");
          setPlans(await props.evolution.listPlans(props.languageId, true));
        })
        .catch((reason) => {
          setSaveState("failed");
          setError(`自动保存失败：${errorMessage(reason)}`);
        });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activePlan, props.evolution, props.languageId, saveState]);

  const aiDraft = props.aiDraft;
  const onAiDraftConsumed = props.onAiDraftConsumed;
  useEffect(() => {
    if (
      !activePlan ||
      !aiDraft ||
      aiDraft.kind !== "evolution.update_draft" ||
      aiDraftRef.current === aiDraft.requestId
    )
      return;
    aiDraftRef.current = aiDraft.requestId;
    const patch = aiDraft.patch;
    const words = Array.isArray(patch.testWords)
      ? patch.testWords
      : activePlan.testWords;
    setActivePlan({
      ...activePlan,
      rulesDraft: String(patch.soundChanges ?? activePlan.rulesDraft),
      testWords: words.map((word, position) => ({
        id:
          typeof word === "object" && word && "id" in word
            ? String(word.id)
            : uuid(),
        word:
          typeof word === "object" && word
            ? String((word as Record<string, unknown>).word ?? "")
            : String(word),
        position,
      })),
    });
    setSaveState("dirty");
    onAiDraftConsumed?.(aiDraft.requestId);
    setStatus("AI 草稿已填入；仍需人工检查、运行和提交。");
  }, [activePlan, aiDraft, onAiDraftConsumed]);

  const updatePlan = (patch: Partial<EvolutionPlan>) => {
    setActivePlan((current) => (current ? { ...current, ...patch } : current));
    if ("rulesDraft" in patch || "testWords" in patch || "inputMode" in patch)
      setTestPreview(undefined);
    setSaveState("dirty");
  };

  const saveNow = async (): Promise<boolean> => {
    if (!activePlan) return false;
    setSaveState("saving");
    try {
      await props.evolution.savePlan(activePlan);
      setSaveState("saved");
      setPlans(await props.evolution.listPlans(props.languageId, true));
      return true;
    } catch (reason) {
      setSaveState("failed");
      setError(errorMessage(reason));
      return false;
    }
  };

  const selectPlan = async (plan: EvolutionPlan) => {
    if (!activePlan) return;
    if (plan.id === activePlan.id) {
      setSelection({ kind: "draft" });
      setActiveRun(undefined);
      setActiveDelivery(undefined);
      setRunItems([]);
      setSelectedRunItemId("");
      setStatus("已返回当前方案草稿。");
      return;
    }
    if (saveState !== "saved" && !(await saveNow())) return;
    props.evolution.endPlanEditSession(activePlan.id);
    setActivePlan(plan);
  };

  const previewTestWords = async () => {
    if (!activePlan) return;
    setError("");
    setTestingWords(true);
    setTestPreview(undefined);
    abortRef.current = new AbortController();
    try {
      const preview = await props.evolution.previewTestWords(
        activePlan,
        abortRef.current.signal,
        setStatus
      );
      setTestPreview(preview);
      setStatus(
        `测试词试跑完成：${preview.items.length} 个输入，${
          preview.items.filter((item) => item.changed).length
        } 个发生变化；未建立正式运行记录。`
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setTestingWords(false);
      abortRef.current = undefined;
    }
  };

  const filtered = useMemo(() => {
    const folded = query.trim().normalize("NFC").toLocaleLowerCase();
    return lexemes.filter((lexeme) => {
      const searchable = `${lexeme.romanized} ${lexeme.senses
        .map((sense) => sense.definition)
        .join(" ")}`
        .normalize("NFC")
        .toLocaleLowerCase();
      return (
        (!folded || searchable.includes(folded)) &&
        (!partOfSpeech || lexeme.partOfSpeech === partOfSpeech) &&
        (lexicalStatus === "all" || lexeme.status === lexicalStatus) &&
        (sourceType === "all" || lexeme.evolutionSourceType === sourceType)
      );
    });
  }, [lexemes, lexicalStatus, partOfSpeech, query, sourceType]);

  const openRun = async (run: EvolutionRun) => {
    setSelection({ kind: "run", id: run.id });
    setActiveRun(run);
    setActiveDelivery(undefined);
    const items = await props.evolution.listRunItems(run.id, 0, 100_000);
    setRunItems(items);
    setSelectedRunItemId(items[0]?.id ?? "");
    setDeliveries(await props.evolution.listDeliveries(run.id));
  };

  const openDelivery = async (delivery: EvolutionDelivery) => {
    const fresh = await props.evolution.getDelivery(delivery.id);
    if (!fresh) return;
    const run = await props.evolution.getRun(fresh.runId);
    if (!run) return;
    setSelection({ kind: "delivery", id: fresh.id });
    setActiveRun(run);
    setActiveDelivery(fresh);
    const items = await props.evolution.listRunItems(run.id, 0, 100_000);
    setRunItems(items);
    setSelectedRunItemId(items[0]?.id ?? "");
  };

  const runPreview = async () => {
    if (!activePlan || !activePlan.sourceStageId || !selectedIds.size) return;
    if (saveState !== "saved" && !(await saveNow())) return;
    setError("");
    setRunning(true);
    abortRef.current = new AbortController();
    try {
      const run = await props.evolution.runPreview({
        planId: activePlan.id,
        sourceStageId: activePlan.sourceStageId,
        selectedLexemeIds: [...selectedIds],
        temporaryPhonologicalForms: temporaryIpa,
        signal: abortRef.current.signal,
        onProgress: setStatus,
      });
      setRuns(await props.evolution.listRuns(activePlan.id));
      await openRun(run);
      setStatus(
        run.status === "succeeded"
          ? "运行完成；正式词典尚未修改。"
          : "运行未成功，已保存诊断记录。"
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setRunning(false);
      abortRef.current = undefined;
    }
  };

  const createDelivery = async () => {
    if (!activeRun) return;
    const next = await props.evolution.createDeliveryDraft(activeRun.id);
    setDeliveries(await props.evolution.listDeliveries(activeRun.id));
    await openDelivery(next);
  };

  const changeDelivery = (patch: Partial<EvolutionDelivery>) => {
    setActiveDelivery((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      return {
        ...next,
        summary: { ...next.summary, validationStatus: "stale" },
      };
    });
  };

  const saveDelivery = async (validate = false) => {
    if (!activeDelivery) return;
    setDeliveryAction(validate ? "validating" : "saving");
    setError("");
    setStatus(validate ? "正在重新检查提交草稿…" : "正在保存提交草稿…");
    try {
      const next = validate
        ? await props.evolution.validateDelivery(activeDelivery)
        : activeDelivery;
      await props.evolution.saveDeliveryDraft(next);
      setActiveDelivery(next);
      const blocking = deliveryBlockingCount(next);
      setStatus(
        validate
          ? blocking
            ? `检查完成：还有 ${blocking} 个阻断问题。`
            : "检查完成：可以正式提交。"
          : "提交草稿已保存。"
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setDeliveryAction(null);
    }
  };

  const confirmDeliveryPhonemes = async (
    resolutions: EvolutionPhonemeResolution[]
  ): Promise<boolean> => {
    if (!activeDelivery) return false;
    const next: EvolutionDelivery = {
      ...activeDelivery,
      targetConfig: {
        ...activeDelivery.targetConfig,
        newPhonemeResolutions: resolutions,
        confirmedNewPhonemes: undefined,
      },
      summary: { ...activeDelivery.summary, validationStatus: "stale" },
    };
    setDeliveryAction("validating");
    setError("");
    setStatus("正在保存新增音系配置并重新检查…");
    try {
      const checked = await props.evolution.validateDelivery(next);
      await props.evolution.saveDeliveryDraft(checked);
      setActiveDelivery(checked);
      const blocking = deliveryBlockingCount(checked);
      setStatus(
        blocking
          ? "新增音系配置已保存；还有 " + blocking + " 个阻断问题。"
          : "新增音系配置已保存；检查通过，可以正式提交。"
      );
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setDeliveryAction(null);
    }
  };

  const commitDelivery = async () => {
    if (!activeDelivery) return;
    setDeliveryAction("committing");
    setError("");
    setStatus("正在保存决定并执行最终检查…");
    try {
      await props.evolution.saveDeliveryDraft(activeDelivery);
      const committed = await props.evolution.commitDelivery(activeDelivery.id);
      setActiveDelivery(committed);
      setDeliveries(await props.evolution.listDeliveries(committed.runId));
      props.onStageDataChanged?.();
      setGraphData(await props.evolution.getGraphData());
      setStatus("演化结果已作为一个项目操作提交；可使用全局撤销和重做。");
    } catch (reason) {
      const fresh = await props.evolution.getDelivery(activeDelivery.id);
      if (fresh) setActiveDelivery(fresh);
      setError(errorMessage(reason));
    } finally {
      setDeliveryAction(null);
    }
  };

  useEffect(() => {
    if (view !== "graph") return;
    void props.evolution
      .getGraphData()
      .then(setGraphData)
      .catch((reason) => setError(errorMessage(reason)));
  }, [props.evolution, view]);

  if (!props.live || !activePlan)
    return <div className={styles.loading}>正在读取演化工作台…</div>;
  const selectedRunItem = runItems.find(
    (item) => item.id === selectedRunItemId
  );

  return (
    <div className={styles.root} ref={rootRef}>
      <header className={styles.topbar}>
        <div
          className={styles.viewSwitch}
          aria-label="演化视图 / Evolution view"
        >
          <button
            data-active={view === "workbench"}
            onClick={() => setView("workbench")}
          >
            工作台
          </button>
          <button
            data-active={view === "graph"}
            onClick={() => setView("graph")}
          >
            演化图
          </button>
        </div>
        {view === "workbench" && (
          <button
            className={styles.sidebarToggle}
            aria-label={sidebarCollapsed ? "展开方案侧栏" : "收起方案侧栏"}
            title={sidebarCollapsed ? "展开方案侧栏" : "收起方案侧栏"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? (
              <DoubleArrowRightIcon aria-hidden="true" />
            ) : (
              <DoubleArrowLeftIcon aria-hidden="true" />
            )}
          </button>
        )}
        <strong>{activePlan.name}</strong>
        <span>
          {stageName(stages, activePlan.sourceStageId)} ·{" "}
          {activePlan.inputMode === "phonological"
            ? "IPA 音系模式"
            : "正字法高级模式"}
        </span>
        {saveState === "failed" ? (
          <button className={styles.saveRetry} onClick={() => void saveNow()}>
            保存失败 · 重试
          </button>
        ) : (
          <span
            className={styles.saveState}
            data-state={saveState}
            aria-live="polite"
          >
            {saveLabel(saveState)}
          </span>
        )}
      </header>

      {view === "graph" ? (
        <EvolutionGraph
          data={graphData}
          selected={selectedMarker}
          onSelect={setSelectedMarker}
          onOpenLanguage={props.onOpenLanguage}
          onOpenStage={props.onOpenStage}
          onOpenRecord={(marker) => {
            void props.evolution
              .getDelivery(marker.deliveryId)
              .then((delivery) => {
                if (!delivery) return;
                setView("workbench");
                void openDelivery(delivery);
              });
          }}
        />
      ) : (
        <div
          className={styles.columns}
          data-sidebar-collapsed={sidebarCollapsed}
        >
          <aside
            className={styles.historyPane}
            aria-label="方案与历史 / Plans and history"
          >
            <div className={styles.paneHeading}>
              <strong>方案与历史</strong>
              <button
                aria-label="新建演化方案"
                title="新建演化方案"
                onClick={() =>
                  void props.evolution
                    .createPlan(props.languageId, props.selectedStageId)
                    .then((plan) => reloadPlans(plan.id))
                }
              >
                <PlusIcon aria-hidden="true" />
              </button>
            </div>
            <div className={styles.planList}>
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  data-active={
                    plan.id === activePlan.id && selection.kind === "draft"
                  }
                  data-archived={plan.archived}
                  onClick={() => void selectPlan(plan)}
                >
                  <span>{plan.name}</span>
                  <small>
                    {plan.archived
                      ? "已归档"
                      : `${stageName(stages, plan.sourceStageId)} · 草稿`}
                  </small>
                </button>
              ))}
            </div>
            <div className={styles.treeHeading}>
              <span>版本</span>
              <button
                onClick={() => {
                  void (async () => {
                    if (!(await saveNow())) return;
                    await props.evolution.createVersion(activePlan.id);
                    setVersions(
                      await props.evolution.listVersions(activePlan.id)
                    );
                  })();
                }}
              >
                固定当前版本
              </button>
            </div>
            <div className={styles.recordList}>
              {versions.map((version) => (
                <button
                  key={version.id}
                  data-active={
                    selection.kind === "version" && selection.id === version.id
                  }
                  onClick={() =>
                    setSelection({ kind: "version", id: version.id })
                  }
                >
                  <span>版本 {version.versionNumber}</span>
                  <small>{shortDate(version.createdAt)}</small>
                </button>
              ))}
            </div>
            <div className={styles.treeHeading}>
              <span>运行</span>
              <small>{runs.length}</small>
            </div>
            <div className={styles.recordList}>
              {runs.map((run) => (
                <button
                  key={run.id}
                  data-active={
                    selection.kind === "run" && selection.id === run.id
                  }
                  onClick={() => void openRun(run)}
                >
                  <span>
                    <RunIcon status={run.status} />
                    {shortDate(run.createdAt)}
                  </span>
                  <small>
                    {run.summary.changed} 变化 ·{" "}
                    {run.summary.warnings + run.summary.errors} 问题
                  </small>
                </button>
              ))}
            </div>
            {deliveries.length > 0 && (
              <>
                <div className={styles.treeHeading}>
                  <span>提交</span>
                  <small>{deliveries.length}</small>
                </div>
                <div className={styles.recordList}>
                  {deliveries.map((delivery) => (
                    <button
                      key={delivery.id}
                      data-active={
                        selection.kind === "delivery" &&
                        selection.id === delivery.id
                      }
                      onClick={() => void openDelivery(delivery)}
                    >
                      <span>{deliveryTargetLabel(delivery.targetType)}</span>
                      <small>
                        {delivery.status === "draft"
                          ? "草稿"
                          : delivery.status === "committed"
                          ? "已提交"
                          : "已撤销"}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className={styles.treeHeading}>
              <span>上下文检查器</span>
            </div>
            {selection.kind === "draft" && (
              <InputInspector
                plan={activePlan}
                lexemes={lexemes}
                selectedIds={selectedIds}
                temporaryIpa={temporaryIpa}
              />
            )}
            {selection.kind === "run" && (
              <TraceInspector item={selectedRunItem} />
            )}
            {selection.kind === "delivery" && activeDelivery && (
              <DeliveryInspector delivery={activeDelivery} />
            )}
            {selection.kind === "version" && (
              <div className={styles.inspectorBody}>
                <strong>不可变版本</strong>
                <p>恢复会把这份快照复制为新的可编辑草稿，不会改写历史。</p>
              </div>
            )}
          </aside>

          <main className={styles.mainPane}>
            {selection.kind === "draft" && (
              <DraftEditor
                plan={activePlan}
                stages={stages}
                lexemes={filtered}
                allLexemes={lexemes}
                selectedIds={selectedIds}
                temporaryIpa={temporaryIpa}
                query={query}
                partOfSpeech={partOfSpeech}
                lexicalStatus={lexicalStatus}
                sourceType={sourceType}
                running={running}
                testingWords={testingWords}
                testPreview={testPreview}
                onPlan={updatePlan}
                onQuery={(value) => {
                  setQuery(value);
                  updatePlan({ scope: { ...activePlan.scope, query: value } });
                }}
                onPartOfSpeech={(value) => {
                  setPartOfSpeech(value);
                  updatePlan({
                    scope: { ...activePlan.scope, partOfSpeech: value },
                  });
                }}
                onLexicalStatus={(value) => {
                  setLexicalStatus(value);
                  updatePlan({
                    scope: {
                      ...activePlan.scope,
                      lexicalStatus:
                        value as EvolutionPlan["scope"]["lexicalStatus"],
                    },
                  });
                }}
                onSourceType={(value) => {
                  setSourceType(value);
                  updatePlan({
                    scope: {
                      ...activePlan.scope,
                      sourceType: value as EvolutionPlan["scope"]["sourceType"],
                    },
                  });
                }}
                onSelected={setSelectedIds}
                onTemporaryIpa={setTemporaryIpa}
                onRun={() => void runPreview()}
                onPreviewTestWords={() => void previewTestWords()}
                onCancel={() => abortRef.current?.abort()}
                onDuplicate={() =>
                  void props.evolution
                    .duplicatePlan(activePlan.id)
                    .then((plan) => reloadPlans(plan.id))
                }
                onArchive={() =>
                  void props.evolution
                    .archivePlan(activePlan.id, !activePlan.archived)
                    .then(() => reloadPlans(activePlan.id))
                }
                onDelete={() =>
                  void props.evolution
                    .deletePlan(activePlan.id)
                    .then(() => reloadPlans())
                }
              />
            )}
            {selection.kind === "version" && (
              <VersionDetail
                version={versions.find((item) => item.id === selection.id)}
                onRestore={(id) =>
                  void props.evolution.restoreVersion(id).then((plan) => {
                    setActivePlan(plan);
                    setSelection({ kind: "draft" });
                  })
                }
              />
            )}
            {selection.kind === "run" && activeRun && (
              <RunResults
                run={activeRun}
                items={runItems}
                selectedId={selectedRunItemId}
                onSelect={setSelectedRunItemId}
                onCreateDelivery={() => void createDelivery()}
                onReproduce={() =>
                  void props.evolution
                    .reproduceRun(activeRun.id)
                    .then(async (run) => {
                      setRuns(await props.evolution.listRuns(activePlan.id));
                      await openRun(run);
                    })
                    .catch((reason) => setError(errorMessage(reason)))
                }
                onRerun={() =>
                  void props.evolution
                    .rerunCurrent(activeRun.id)
                    .then(async (run) => {
                      setRuns(await props.evolution.listRuns(activePlan.id));
                      await openRun(run);
                    })
                    .catch((reason) => setError(errorMessage(reason)))
                }
              />
            )}
            {selection.kind === "delivery" && activeDelivery && (
              <DeliveryEditor
                delivery={activeDelivery}
                run={activeRun}
                runItems={runItems}
                stages={stages}
                action={deliveryAction}
                onChange={changeDelivery}
                onSave={() => void saveDelivery()}
                onValidate={() => void saveDelivery(true)}
                onConfirmPhonemes={confirmDeliveryPhonemes}
                onCommit={() => void commitDelivery()}
              />
            )}
          </main>
        </div>
      )}

      <footer className={styles.statusbar} aria-live="polite">
        {error ? (
          <span data-error>
            <ExclamationTriangleIcon aria-hidden="true" />
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </span>
        ) : (
          <span>{status}</span>
        )}
      </footer>
    </div>
  );
}

function DraftEditor(props: {
  plan: EvolutionPlan;
  stages: LanguageStage[];
  lexemes: EvolutionInputCandidate[];
  allLexemes: EvolutionInputCandidate[];
  selectedIds: Set<string>;
  temporaryIpa: Record<string, string>;
  query: string;
  partOfSpeech: string;
  lexicalStatus: string;
  sourceType: string;
  running: boolean;
  testingWords: boolean;
  testPreview?: EvolutionTestWordPreview;
  onPlan: (patch: Partial<EvolutionPlan>) => void;
  onQuery: (value: string) => void;
  onPartOfSpeech: (value: string) => void;
  onLexicalStatus: (value: string) => void;
  onSourceType: (value: string) => void;
  onSelected: (value: Set<string>) => void;
  onTemporaryIpa: (value: Record<string, string>) => void;
  onRun: () => void;
  onPreviewTestWords: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [confirmingRun, setConfirmingRun] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const posValues = [
    ...new Set(
      props.allLexemes.map((item) => item.partOfSpeech).filter(Boolean)
    ),
  ];
  const selectFiltered = () =>
    props.onSelected(
      new Set([...props.selectedIds, ...props.lexemes.map((item) => item.id)])
    );
  const invertFiltered = () => {
    const next = new Set(props.selectedIds);
    props.lexemes.forEach((item) =>
      next.has(item.id) ? next.delete(item.id) : next.add(item.id)
    );
    props.onSelected(next);
  };
  return (
    <div className={styles.draft}>
      <div className={styles.actionHeader}>
        <div>
          <strong>演化方案草稿</strong>
          <small>规则、来源阶段与正式词典范围</small>
        </div>
        <div>
          <button onClick={props.onDuplicate} title="复制当前方案">
            复制
          </button>
          <button onClick={props.onArchive}>
            {props.plan.archived ? "恢复" : "归档"}
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            title="删除无历史引用的方案；有历史引用时将安全归档"
          >
            删除
          </button>
          <button onClick={props.onCancel} disabled={!props.running}>
            取消
          </button>
          <button
            className={styles.primary}
            onClick={() => setConfirmingRun(true)}
            title={
              !props.selectedIds.size
                ? "正式运行需要至少选择一个词典词条；只想检查规则时，请使用“试跑测试词”。"
                : undefined
            }
            disabled={
              props.running ||
              !props.selectedIds.size ||
              !props.plan.rulesDraft.trim()
            }
          >
            <ResumeIcon aria-hidden="true" />
            {props.running ? "运行中…" : "运行"}
          </button>
        </div>
      </div>
      <section className={styles.planSettings}>
        <label>
          方案名称
          <input
            name="evolution-plan-name"
            autoComplete="off"
            value={props.plan.name}
            onChange={(event) => props.onPlan({ name: event.target.value })}
          />
        </label>
        <label>
          来源阶段
          <select
            name="evolution-source-stage"
            value={props.plan.sourceStageId}
            onChange={(event) =>
              props.onPlan({ sourceStageId: event.target.value })
            }
          >
            {availableSourceStages(props.stages).map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>演化输入</legend>
          <label>
            <input
              name="evolution-input-mode"
              type="radio"
              checked={props.plan.inputMode === "phonological"}
              onChange={() => props.onPlan({ inputMode: "phonological" })}
            />
            音系形式 / IPA（推荐）
          </label>
          <label>
            <input
              name="evolution-input-mode"
              type="radio"
              checked={props.plan.inputMode === "orthographic"}
              onChange={() => props.onPlan({ inputMode: "orthographic" })}
            />
            显示词形 / 正字法（高级）
          </label>
        </fieldset>
        <div className={styles.testWordsField}>
          <div className={styles.testWordsHeader}>
            <label htmlFor="evolution-test-words">
              测试词
              <small>只检查规则效果，不读取词典，也不会进入正式提交。</small>
            </label>
            <button
              type="button"
              onClick={props.onPreviewTestWords}
              disabled={
                props.testingWords ||
                !props.plan.rulesDraft.trim() ||
                !props.plan.testWords.some((item) => item.word.trim())
              }
            >
              <ResumeIcon aria-hidden="true" />
              {props.testingWords ? "正在试跑…" : "试跑测试词"}
            </button>
          </div>
          <textarea
            id="evolution-test-words"
            name="evolution-test-words"
            aria-label="测试词，每行一个"
            autoComplete="off"
            value={props.plan.testWords.map((item) => item.word).join("\n")}
            onChange={(event) =>
              props.onPlan({
                testWords: event.target.value
                  .split(/\r?\n/)
                  .map((word, position) => ({
                    id: props.plan.testWords[position]?.id ?? uuid(),
                    word,
                    position,
                  })),
              })
            }
          />
          {props.testPreview && (
            <section
              className={styles.testPreview}
              aria-label="测试词临时结果"
              aria-live="polite"
            >
              <header>
                <strong>临时试跑结果</strong>
                <small>不保存为版本、运行或提交记录</small>
              </header>
              <div role="list">
                {props.testPreview.items.map((item, position) => (
                  <div key={`${item.engineInput}-${position}`} role="listitem">
                    <code>{item.source}</code>
                    <span aria-hidden="true">→</span>
                    <code>{item.displayOutput}</code>
                    <small data-changed={item.changed}>
                      {item.error
                        ? item.error
                        : item.changed
                        ? "已变化"
                        : "无变化"}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </section>
      {confirmingRun && (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            className={styles.confirmDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-confirm-title"
          >
            <header>
              <strong id="run-confirm-title">确认正式词典输入</strong>
            </header>
            <dl>
              <div>
                <dt>准备运行</dt>
                <dd>{props.selectedIds.size}</dd>
              </div>
              <div>
                <dt>临时 IPA</dt>
                <dd>
                  {
                    props.allLexemes.filter(
                      (item) =>
                        props.selectedIds.has(item.id) &&
                        !item.ipa &&
                        props.temporaryIpa[item.id]?.trim()
                    ).length
                  }
                </dd>
              </div>
              <div>
                <dt>缺少 IPA、未参与</dt>
                <dd>
                  {
                    props.allLexemes.filter(
                      (item) =>
                        props.selectedIds.has(item.id) &&
                        !item.ipa &&
                        !props.temporaryIpa[item.id]?.trim()
                    ).length
                  }
                </dd>
              </div>
            </dl>
            <p>
              测试词不会进入本次正式运行。运行只保存不可变预览，不会修改词典。
            </p>
            <footer>
              <button onClick={() => setConfirmingRun(false)}>返回检查</button>
              <button
                className={styles.primary}
                onClick={() => {
                  setConfirmingRun(false);
                  props.onRun();
                }}
              >
                确认并运行
              </button>
            </footer>
          </section>
        </div>
      )}
      {confirmingDelete && (
        <div className={styles.dialogBackdrop} role="presentation">
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-plan-title"
          >
            <header>
              <strong id="delete-plan-title">删除或归档方案？</strong>
            </header>
            <p>
              无历史引用的方案会删除；已有版本、运行或提交的方案只会安全归档。
            </p>
            <footer>
              <button onClick={() => setConfirmingDelete(false)}>取消</button>
              <button
                onClick={() => {
                  setConfirmingDelete(false);
                  props.onDelete();
                }}
              >
                确认处理
              </button>
            </footer>
          </section>
        </div>
      )}
      <section className={styles.rulesPanel}>
        <header>
          <strong>Lexurgy 规则</strong>
          <span>音变只产生目标音系；IPA 模式下拼写需另行确认。</span>
        </header>
        <div className={styles.editor}>
          <ScCodeEditor
            key={props.plan.id}
            initialCode={props.plan.rulesDraft}
            onUpdateCode={(rulesDraft) => props.onPlan({ rulesDraft })}
            height="100%"
          />
        </div>
      </section>
      <section className={styles.inputPanel}>
        <header>
          <div>
            <strong>正式词典输入</strong>
            <span>
              当前结果已选{" "}
              {
                props.lexemes.filter((item) => props.selectedIds.has(item.id))
                  .length
              }{" "}
              / 总已选 {props.selectedIds.size}
            </span>
          </div>
          <div>
            <button onClick={selectFiltered} title="全选当前筛选结果">
              全选
            </button>
            <button onClick={invertFiltered} title="反选当前筛选结果">
              反选
            </button>
            <button onClick={() => props.onSelected(new Set())}>
              取消全选
            </button>
          </div>
        </header>
        <div className={styles.filters}>
          <input
            name="evolution-search"
            autoComplete="off"
            aria-label="搜索显示词形和释义"
            placeholder="搜索词形或释义…"
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
          />
          <select
            name="evolution-pos-filter"
            aria-label="词性筛选"
            value={props.partOfSpeech}
            onChange={(event) => props.onPartOfSpeech(event.target.value)}
          >
            <option value="">全部词性</option>
            {posValues.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            name="evolution-status-filter"
            aria-label="词条状态筛选"
            value={props.lexicalStatus}
            onChange={(event) => props.onLexicalStatus(event.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="draft">草稿</option>
            <option value="confirmed">已确认</option>
            <option value="deprecated">已停用</option>
          </select>
          <select
            name="evolution-source-filter"
            aria-label="来源类型筛选"
            value={props.sourceType}
            onChange={(event) => props.onSourceType(event.target.value)}
          >
            <option value="all">全部来源</option>
            <option value="manual">手工录入</option>
            <option value="borrowing">借词</option>
            <option value="generated">生成</option>
            <option value="derived">派生</option>
            <option value="imported">导入</option>
          </select>
        </div>
        <div
          className={styles.lexemeTable}
          role="table"
          aria-label="演化输入词条"
        >
          <div role="row" className={styles.tableHead}>
            <span></span>
            <span>显示词形</span>
            <span>来源 IPA</span>
            <span>释义</span>
            <span>临时 IPA</span>
          </div>
          {props.lexemes.map((lexeme) => (
            <label
              role="row"
              key={lexeme.id}
              data-selected={props.selectedIds.has(lexeme.id)}
            >
              <input
                type="checkbox"
                checked={props.selectedIds.has(lexeme.id)}
                onChange={(event) => {
                  const next = new Set(props.selectedIds);
                  event.target.checked
                    ? next.add(lexeme.id)
                    : next.delete(lexeme.id);
                  props.onSelected(next);
                }}
              />
              <strong>{lexeme.romanized}</strong>
              <span>{lexeme.ipa || <em>缺少 IPA</em>}</span>
              <span>
                {lexeme.senses.map((sense) => sense.definition).join("；")}
              </span>
              {!lexeme.ipa && props.plan.inputMode === "phonological" ? (
                <input
                  name={`temporary-ipa-${lexeme.id}`}
                  autoComplete="off"
                  aria-label={`${lexeme.romanized} 的临时 IPA`}
                  value={props.temporaryIpa[lexeme.id] ?? ""}
                  onChange={(event) =>
                    props.onTemporaryIpa({
                      ...props.temporaryIpa,
                      [lexeme.id]: event.target.value,
                    })
                  }
                />
              ) : (
                <span>—</span>
              )}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function RunResults(props: {
  run: EvolutionRun;
  items: EvolutionRunItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateDelivery: () => void;
  onReproduce: () => void;
  onRerun: () => void;
}) {
  return (
    <div className={styles.results}>
      <div className={styles.actionHeader}>
        <div>
          <strong>不可变运行结果</strong>
          <small>
            {shortDate(props.run.completedAt)} · 引擎 {props.run.engineVersion}
          </small>
        </div>
        <div>
          <button onClick={props.onReproduce}>按原输入复现</button>
          <button onClick={props.onRerun}>按当前内容重跑</button>
          <button
            className={styles.primary}
            disabled={props.run.status !== "succeeded"}
            onClick={props.onCreateDelivery}
          >
            保存为阶段或分支
          </button>
        </div>
      </div>
      {props.run.errors.length > 0 && (
        <div className={styles.runNotices} role="status">
          {props.run.errors.map((issue) => (
            <p key={issue.code}>
              <ExclamationTriangleIcon aria-hidden="true" />
              <span>
                {issue.message}
                {issue.recovery ? ` ${issue.recovery}` : ""}
              </span>
            </p>
          ))}
        </div>
      )}
      <div className={styles.summary}>
        <span>
          <strong>{props.run.summary.total}</strong>输入
        </span>
        <span>
          <strong>{props.run.summary.changed}</strong>变化
        </span>
        <span>
          <strong>{props.run.summary.warnings}</strong>警告
        </span>
        <span>
          <strong>{props.run.summary.notRun}</strong>未参与
        </span>
      </div>
      <div className={styles.resultTable} role="table">
        <div role="row" className={styles.tableHead}>
          <span>来源词形</span>
          <span>来源 IPA</span>
          <span>引擎输入</span>
          <span>引擎输出</span>
          <span>目标 IPA</span>
          <span>状态</span>
        </div>
        {props.items.map((item) => (
          <button
            role="row"
            key={item.id}
            data-active={item.id === props.selectedId}
            onClick={() => props.onSelect(item.id)}
          >
            <strong>{item.sourceDisplayForm}</strong>
            <span>{item.sourcePhonologicalForm || "—"}</span>
            <code>{item.engineInput || "—"}</code>
            <code>{item.engineOutput || "—"}</code>
            <span>{item.targetPhonologicalForm || "—"}</span>
            <StatusLabel value={item.status} />
          </button>
        ))}
      </div>
    </div>
  );
}

function DeliveryEditor(props: {
  delivery: EvolutionDelivery;
  run?: EvolutionRun;
  runItems: EvolutionRunItem[];
  stages: LanguageStage[];
  action: DeliveryAction;
  onChange: (patch: Partial<EvolutionDelivery>) => void;
  onSave: () => void;
  onValidate: () => void;
  onConfirmPhonemes: (
    resolutions: EvolutionPhonemeResolution[]
  ) => Promise<boolean>;
  onCommit: () => void;
}) {
  const runById = new Map(props.runItems.map((item) => [item.id, item]));
  const editable = props.delivery.status === "draft";
  const validationChecked =
    props.delivery.summary.validationStatus === "checked";
  const blockingIssues = props.delivery.items.flatMap((item) =>
    item.decision === "skip"
      ? []
      : item.conflicts.filter((issue) => issue.severity === "error")
  );
  const issueGroups = groupDeliveryIssues(blockingIssues);
  const readyToCommit = validationChecked && blockingIssues.length === 0;
  const pendingOrthographyCount = props.delivery.items.filter(
    (item) =>
      item.decision !== "skip" && item.orthographyResolution === "pending"
  ).length;
  const phonemeCandidates = readDeliveryPhonemeResolutions(
    props.delivery.targetConfig.newPhonemeCandidates
  );
  const savedPhonemeResolutions = readDeliveryPhonemeResolutions(
    props.delivery.targetConfig.newPhonemeResolutions
  );
  const targetPhonemeOptions = readDeliveryPhonemeOptions(
    props.delivery.targetConfig.targetPhonemeOptions
  );
  const [phonemePanelOpen, setPhonemePanelOpen] = useState(false);
  const [phonemeSaveError, setPhonemeSaveError] = useState("");
  const phonemeDialogRef = useRef<HTMLElement>(null);
  const [phonemeDrafts, setPhonemeDrafts] = useState<
    EvolutionPhonemeResolution[]
  >([]);
  const openPhonemePanel = () => {
    setPhonemeDrafts(
      phonemeCandidates.map(
        (candidate) =>
          savedPhonemeResolutions.find(
            (saved) => saved.ipa === candidate.ipa
          ) ?? candidate
      )
    );
    setPhonemeSaveError("");
    setPhonemePanelOpen(true);
  };
  useEffect(() => {
    if (!phonemePanelOpen) return;
    const frame = requestAnimationFrame(() => phonemeDialogRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [phonemePanelOpen]);
  const updatePhonemeDraft = (
    ipa: string,
    patch: Partial<EvolutionPhonemeResolution>
  ) =>
    setPhonemeDrafts((current) =>
      current.map((item) =>
        item.ipa === ipa
          ? {
              ...item,
              ...patch,
              parentPhonemeId:
                patch.role === "phoneme"
                  ? undefined
                  : Object.prototype.hasOwnProperty.call(
                      patch,
                      "parentPhonemeId"
                    )
                  ? patch.parentPhonemeId
                  : item.parentPhonemeId,
            }
          : item
      )
    );
  const updateItem = (
    id: string,
    patch: Partial<EvolutionDelivery["items"][number]>
  ) =>
    props.onChange({
      items: props.delivery.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    });
  const preservePending = () =>
    props.onChange({
      items: props.delivery.items.map((item) => {
        const runItem = runById.get(item.runItemId);
        return item.decision !== "skip" &&
          item.orthographyResolution === "pending"
          ? {
              ...item,
              targetDisplayForm: runItem?.sourceDisplayForm ?? "",
              orthographyResolution: "preserved" as const,
            }
          : item;
      }),
    });
  const skipPending = () =>
    props.onChange({
      items: props.delivery.items.map((item) =>
        item.orthographyResolution === "pending"
          ? { ...item, decision: "skip" as const }
          : item
      ),
    });
  return (
    <div className={styles.delivery}>
      <div className={styles.actionHeader}>
        <div>
          <strong>{editable ? "演化提交草稿" : "演化提交记录"}</strong>
          <small>原始 Lexurgy 输出保持不变；这里保存目标与人工决定。</small>
        </div>
        <div>
          {editable && (
            <>
              <button
                type="button"
                disabled={props.action !== null}
                onClick={props.onSave}
              >
                {props.action === "saving" ? "正在保存…" : "保存草稿"}
              </button>
              <button
                type="button"
                disabled={props.action !== null}
                onClick={props.onValidate}
              >
                {props.action === "validating" ? "正在检查…" : "重新检查"}
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={props.action !== null || !readyToCommit}
                title={
                  readyToCommit
                    ? "正式写入目标阶段或语言"
                    : validationChecked
                    ? "请先处理下方阻断问题"
                    : "草稿有修改，请先重新检查"
                }
                onClick={props.onCommit}
              >
                {props.action === "committing" ? "正在提交…" : "正式提交"}
              </button>
            </>
          )}
        </div>
      </div>
      {props.action && (
        <div className={styles.deliveryProgress} role="status" aria-live="polite">
          {props.action === "validating"
            ? "正在批量检查来源、目标、音系与冲突…"
            : props.action === "committing"
            ? "正在执行最终检查并原子写入…"
            : "正在保存提交草稿…"}
        </div>
      )}
      <section
        className={styles.deliveryReadiness}
        data-state={
          props.delivery.status === "committed"
            ? "committed"
            : props.delivery.status === "undone"
            ? "undone"
            : !validationChecked
            ? "stale"
            : blockingIssues.length
            ? "blocked"
            : "ready"
        }
        aria-live="polite"
      >
        {props.delivery.status === "committed" ? (
          <>
            <CheckCircledIcon aria-hidden="true" />
            <strong>已正式提交</strong>
            <span>这是一份不可修改的提交记录，可通过全局撤销撤回整次操作。</span>
          </>
        ) : props.delivery.status === "undone" ? (
          <>
            <strong>提交已撤销</strong>
            <span>目标数据已由全局撤销移除；此历史记录仅供追踪。</span>
          </>
        ) : !validationChecked ? (
          <>
            <strong>需要重新检查</strong>
            <span>草稿尚未检查，或检查后又有修改。</span>
          </>
        ) : blockingIssues.length ? (
          <>
            <strong>{blockingIssues.length} 个问题阻止提交</strong>
            <ul>
              {issueGroups.slice(0, 5).map((group) => (
                <li key={group.key}>
                  <b>{group.count} 项</b>
                  <span>{group.message}</span>
                  {group.recovery && <small>{group.recovery}</small>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <CheckCircledIcon aria-hidden="true" />
            <strong>检查通过，可以正式提交</strong>
          </>
        )}
      </section>
      <section className={styles.targetPanel}>
        <label>
          目标类型
          <select
            name="evolution-target-type"
            disabled={!editable}
            value={props.delivery.targetType}
            onChange={(event) =>
              props.onChange({
                targetType: event.target
                  .value as EvolutionDelivery["targetType"],
                targetLanguageId: undefined,
                targetStageId: undefined,
              })
            }
          >
            <option value="new_stage">当前语言的新历史阶段</option>
            <option value="existing_stage">当前语言的已有阶段</option>
            <option value="existing_dialect">已有轻量方言</option>
            <option value="new_descendant">新的后代语言</option>
          </select>
        </label>
        {props.delivery.targetType === "new_stage" && (
          <label>
            新阶段名称
            <input
              name="evolution-new-stage-name"
              autoComplete="off"
              disabled={!editable}
              value={String(props.delivery.targetConfig.name ?? "演化后阶段")}
              onChange={(event) =>
                props.onChange({
                  targetConfig: {
                    ...props.delivery.targetConfig,
                    name: event.target.value,
                  },
                })
              }
            />
          </label>
        )}
        {props.delivery.targetType === "new_descendant" && (
          <label>
            后代语言名称
            <input
              name="evolution-descendant-name"
              autoComplete="off"
              disabled={!editable}
              value={String(
                props.delivery.targetConfig.languageName ?? "后代语言"
              )}
              onChange={(event) =>
                props.onChange({
                  targetConfig: {
                    ...props.delivery.targetConfig,
                    languageName: event.target.value,
                  },
                })
              }
            />
          </label>
        )}
        {(props.delivery.targetType === "existing_stage" ||
          props.delivery.targetType === "existing_dialect") && (
          <label>
            已有目标
            <select
              name="evolution-existing-target"
              disabled={!editable}
              value={props.delivery.targetStageId ?? ""}
              onChange={(event) =>
                props.onChange({ targetStageId: event.target.value })
              }
            >
              <option value="">请选择</option>
              {props.stages
                .filter(
                  (stage) =>
                    stage.storageMode !== "no_data" &&
                    (props.delivery.targetType === "existing_stage"
                      ? stage.kind === "historical_stage"
                      : stage.kind === "lightweight_dialect")
                )
                .map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
            </select>
          </label>
        )}
      </section>
      {editable && (
        <div className={styles.batchActions}>
          <button
            type="button"
            disabled={!pendingOrthographyCount}
            onClick={preservePending}
          >
            批量保留来源拼写
          </button>
          <button
            type="button"
            disabled={!pendingOrthographyCount}
            onClick={skipPending}
          >
            批量跳过待确认项
          </button>
          <button
            type="button"
            disabled={!phonemeCandidates.length || props.action !== null}
            onClick={openPhonemePanel}
            aria-expanded={phonemePanelOpen}
            aria-haspopup="dialog"
          >
            {phonemeCandidates.length
              ? (savedPhonemeResolutions.length ? "编辑 " : "配置 ") +
                phonemeCandidates.length +
                " 个新增音"
              : "没有待配置的新增音"}
          </button>
        </div>
      )}
      {editable && phonemePanelOpen && phonemeDrafts.length > 0 && (
        <div
          className={styles.dialogBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && props.action === null) {
              setPhonemePanelOpen(false);
            }
          }}
        >
        <section
          ref={phonemeDialogRef}
          className={`${styles.phonemeConfig} ${styles.phonemeDialog}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="phoneme-config-title"
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === "Escape" && props.action === null) {
              setPhonemePanelOpen(false);
            }
            if (event.key === "Tab") {
              const controls = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), input:not([disabled]), select:not([disabled])'
                )
              );
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <header>
            <div>
              <strong id="phoneme-config-title">
                配置 {phonemeDrafts.length} 个新增音
              </strong>
              <small>
                分布条件已根据 Lexurgy
                规则与实际结果预填；保存后会自动重新检查。
              </small>
            </div>
            <button
              type="button"
              disabled={props.action !== null}
              onClick={() => setPhonemePanelOpen(false)}
            >
              关闭
            </button>
          </header>
          <div className={styles.phonemeDialogBody}>
          {phonemeSaveError && (
            <p className={styles.phonemeSaveError} role="alert">
              {phonemeSaveError}
            </p>
          )}
          <div className={styles.phonemeConfigRows}>
            {phonemeDrafts.map((resolution) => (
              <fieldset key={resolution.ipa}>
                <legend>新增音 {resolution.ipa}</legend>
                <label>
                  记号
                  <input
                     name={"evolution-phoneme-symbol-" + resolution.ipa}
                      value={resolution.displaySymbol}
                      aria-invalid={!resolution.displaySymbol.trim()}
                    onChange={(event) =>
                      updatePhonemeDraft(resolution.ipa, {
                        displaySymbol: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  类型
                  <select
                    name={"evolution-phoneme-role-" + resolution.ipa}
                    value={resolution.role}
                    onChange={(event) =>
                      updatePhonemeDraft(resolution.ipa, {
                        role: event.target
                          .value as EvolutionPhonemeResolution["role"],
                      })
                    }
                  >
                    <option value="phoneme">独立音位</option>
                    <option value="allophone">音位变体</option>
                  </select>
                </label>
                {resolution.role === "allophone" ? (
                  <label>
                    所属音位
                    <select
                      name={"evolution-phoneme-parent-" + resolution.ipa}
                      value={resolution.parentPhonemeId ?? ""}
                      aria-invalid={!resolution.parentPhonemeId}
                      onChange={(event) =>
                        updatePhonemeDraft(resolution.ipa, {
                          parentPhonemeId: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">请选择所属音位</option>
                      {targetPhonemeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.displaySymbol || option.ipa} /{option.ipa}/
                        </option>
                      ))}
                    </select>
                    {!resolution.parentPhonemeId && (
                      <small className={styles.fieldError}>
                        请选择该变体所属的正式音位。
                      </small>
                    )}
                  </label>
                ) : (
                  <label>
                    音位类别
                    <select
                      name={"evolution-phoneme-category-" + resolution.ipa}
                      value={resolution.category}
                      onChange={(event) =>
                        updatePhonemeDraft(resolution.ipa, {
                          category: event.target
                            .value as EvolutionPhonemeResolution["category"],
                        })
                      }
                    >
                      <option value="consonant">辅音</option>
                      <option value="vowel">元音</option>
                      <option value="suprasegmental">超音段</option>
                      <option value="other">其他</option>
                    </select>
                  </label>
                )}
                <label className={styles.distributionField}>
                  分布 / 条件规则
                  <input
                    name={"evolution-phoneme-distribution-" + resolution.ipa}
                    value={resolution.distribution}
                    aria-invalid={!resolution.distribution.trim()}
                    placeholder="例如：@vowel _ @vowel…"
                    onChange={(event) =>
                      updatePhonemeDraft(resolution.ipa, {
                        distribution: event.target.value,
                      })
                    }
                  />
                  {resolution.sourceRule && (
                    <small>依据规则：{resolution.sourceRule}</small>
                  )}
                  {!resolution.distribution.trim() && (
                    <small className={styles.fieldError}>
                      请填写分布或条件规则。
                    </small>
                  )}
                </label>
              </fieldset>
            ))}
          </div>
          </div>
          <footer>
            <span>
              正式提交时，这些决定会与目标词典和阶段变更作为同一个项目操作写入。
            </span>
            <button
              type="button"
              className={styles.primary}
              disabled={props.action !== null}
              onClick={async () => {
                const invalid = phonemeDrafts.find(
                  (item) =>
                    !item.displaySymbol.trim() ||
                    !item.distribution.trim() ||
                    (item.role === "allophone" && !item.parentPhonemeId)
                );
                if (invalid) {
                  setPhonemeSaveError(
                    `请补全新增音 ${invalid.ipa} 的记号、类型与分布条件。`
                  );
                  requestAnimationFrame(() =>
                    phonemeDialogRef.current
                      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
                      ?.focus()
                  );
                  return;
                }
                setPhonemeSaveError("");
                if (await props.onConfirmPhonemes(phonemeDrafts)) {
                  setPhonemePanelOpen(false);
                }
              }}
            >
              {props.action === "validating"
                ? "正在保存并检查…"
                : "保存配置并重新检查"}
            </button>
          </footer>
        </section>
        </div>
      )}
      <div className={styles.deliveryList}>
        {props.delivery.items.map((item) => {
          const runItem = runById.get(item.runItemId);
          const blocking = item.conflicts.filter(
            (issue) => issue.severity === "error"
          ).length;
          const hasHomophoneConflict = item.conflicts.some(
            (issue) =>
              issue.code === "HOMOPHONE_IN_DELIVERY" ||
              issue.code === "TARGET_HOMOPHONE"
          );
          return (
            <article key={item.id} data-skipped={item.decision === "skip"}>
              <div>
                <strong>{runItem?.sourceDisplayForm ?? "来源词条"}</strong>
                <small>
                  {runItem?.sourcePhonologicalForm || "无来源 IPA"} →{" "}
                  {item.targetPhonologicalForm || "—"}
                </small>
              </div>
              <select
                name={`delivery-decision-${item.id}`}
                aria-label="提交决定"
                disabled={!editable}
                value={item.decision}
                onChange={(event) =>
                  updateItem(item.id, {
                    decision: event.target.value as typeof item.decision,
                  })
                }
              >
                <option value="include">使用演化结果</option>
                <option value="skip">跳过</option>
                <option value="create_homograph">建立同形异义词</option>
                <option value="merge_senses">合并到目标词条</option>
              </select>
              <input
                name={`delivery-ipa-${item.id}`}
                autoComplete="off"
                aria-label="目标 IPA"
                disabled={!editable || item.decision === "skip"}
                value={item.targetPhonologicalForm}
                onChange={(event) =>
                  updateItem(item.id, {
                    targetPhonologicalForm: event.target.value,
                  })
                }
              />
              <input
                name={`delivery-form-${item.id}`}
                autoComplete="off"
                aria-label="目标显示词形"
                disabled={!editable || item.decision === "skip"}
                value={item.targetDisplayForm}
                placeholder="待确认拼写…"
                onChange={(event) =>
                  updateItem(item.id, {
                    targetDisplayForm: event.target.value,
                    orthographyResolution: "manual",
                  })
                }
              />
              {hasHomophoneConflict || item.homophoneAcknowledged ? (
                <label
                  className={styles.check}
                  title="勾选表示你有意保留这个与其他词读音相同的词条"
                >
                  <input
                    name={`delivery-homophone-${item.id}`}
                    type="checkbox"
                    disabled={!editable || item.decision === "skip"}
                    checked={item.homophoneAcknowledged}
                    onChange={(event) => {
                      const acknowledged = event.target.checked;
                      updateItem(item.id, {
                        homophoneAcknowledged: acknowledged,
                        conflicts: acknowledged
                          ? item.conflicts.filter(
                              (issue) =>
                                issue.code !== "HOMOPHONE_IN_DELIVERY" &&
                                issue.code !== "TARGET_HOMOPHONE"
                            )
                          : item.conflicts,
                      });
                    }}
                  />
                  允许该词与其他词同音
                </label>
              ) : (
                <span>{validationChecked ? "无同音冲突" : "同音尚未检查"}</span>
              )}
              <span data-blocking={blocking > 0}>
                {blocking
                  ? `${blocking} 个阻断问题`
                  : item.orthographyResolution === "pending"
                  ? "拼写待确认"
                  : "可检查"}
              </span>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function InputInspector(props: {
  plan: EvolutionPlan;
  lexemes: EvolutionInputCandidate[];
  selectedIds: Set<string>;
  temporaryIpa: Record<string, string>;
}) {
  const selected = props.lexemes.filter((item) =>
    props.selectedIds.has(item.id)
  );
  const missing = selected.filter(
    (item) => props.plan.inputMode === "phonological" && !item.ipa.trim()
  );
  const temporary = missing.filter((item) =>
    props.temporaryIpa[item.id]?.trim()
  );
  return (
    <div className={styles.inspectorBody}>
      <strong>输入预检</strong>
      <dl>
        <div>
          <dt>正式词条</dt>
          <dd>{selected.length}</dd>
        </div>
        <div>
          <dt>临时 IPA</dt>
          <dd>{temporary.length}</dd>
        </div>
        <div>
          <dt>未参与</dt>
          <dd>{missing.length - temporary.length}</dd>
        </div>
      </dl>
      <p>测试词不会进入正式提交。缺少 IPA 的词不会静默使用显示词形。</p>
    </div>
  );
}

function TraceInspector({ item }: { item?: EvolutionRunItem }) {
  if (!item)
    return (
      <div className={styles.inspectorBody}>
        <p>选择一个运行结果查看逐规则追踪。</p>
      </div>
    );
  return (
    <div className={styles.inspectorBody}>
      <strong>逐规则追踪</strong>
      <p>
        <b>{item.sourceDisplayForm}</b> · {item.engineInput || "未参与"} →{" "}
        {item.engineOutput || "—"}
      </p>
      {item.trace.length ? (
        <ol className={styles.trace}>
          {item.trace.map((step, index) => (
            <li key={`${step.rule}-${index}`}>
              <span>{step.rule}</span>
              <code>{step.output}</code>
            </li>
          ))}
        </ol>
      ) : (
        <p>该词没有逐规则变化记录。</p>
      )}
      <strong>中间阶段</strong>
      {Object.entries(item.intermediate).map(([name, value]) => (
        <div className={styles.intermediate} key={name}>
          <span>{name}</span>
          <code>{value}</code>
        </div>
      ))}
      {item.issues.map((issue) => (
        <p className={styles.issue} key={`${issue.code}-${issue.message}`}>
          <ExclamationTriangleIcon aria-hidden="true" />
          {issue.message}
        </p>
      ))}
    </div>
  );
}

function DeliveryInspector({ delivery }: { delivery: EvolutionDelivery }) {
  const blocking = delivery.items
    .flatMap((item) => item.conflicts)
    .filter((issue) => issue.severity === "error");
  return (
    <div className={styles.inspectorBody}>
      <strong>提交检查</strong>
      <dl>
        <div>
          <dt>准备写入</dt>
          <dd>
            {delivery.items.filter((item) => item.decision !== "skip").length}
          </dd>
        </div>
        <div>
          <dt>跳过</dt>
          <dd>
            {delivery.items.filter((item) => item.decision === "skip").length}
          </dd>
        </div>
        <div>
          <dt>阻断问题</dt>
          <dd>{blocking.length}</dd>
        </div>
      </dl>
      {blocking.slice(0, 12).map((issue, index) => (
        <p className={styles.issue} key={`${issue.code}-${index}`}>
          <ExclamationTriangleIcon aria-hidden="true" />
          {issue.message}
        </p>
      ))}
      {!blocking.length && (
        <p>
          <CheckCircledIcon aria-hidden="true" />{" "}
          当前没有已知阻断问题；正式提交时仍会重新计算来源和目标状态。
        </p>
      )}
    </div>
  );
}

function VersionDetail({
  version,
  onRestore,
}: {
  version?: EvolutionPlanVersion;
  onRestore: (id: string) => void;
}) {
  if (!version) return null;
  return (
    <div className={styles.version}>
      <div className={styles.actionHeader}>
        <div>
          <strong>版本 {version.versionNumber}</strong>
          <small>
            {shortDate(version.createdAt)} · 内容校验{" "}
            {version.contentHash.slice(0, 12)}
          </small>
        </div>
        <button onClick={() => onRestore(version.id)}>
          <ReloadIcon aria-hidden="true" />
          恢复为新草稿
        </button>
      </div>
      <pre>{version.rulesSnapshot || "（空规则）"}</pre>
    </div>
  );
}

function EvolutionGraph(props: {
  data?: EvolutionGraphData;
  selected?: EvolutionGraphMarker;
  onSelect: (marker: EvolutionGraphMarker) => void;
  onOpenRecord: (marker: EvolutionGraphMarker) => void;
  onOpenLanguage?: (languageId: string) => void;
  onOpenStage?: (languageId: string, stageId: string) => void;
}) {
  if (!props.data)
    return <div className={styles.graphLoading}>正在读取演化图…</div>;
  return (
    <div className={styles.graphLayout}>
      <div className={styles.graphCanvas}>
        <div className={styles.graphLegend}>
          <span>实线：主要遗传</span>
          <span>虚线：接触/方言图层</span>
          <span>●：演化提交</span>
          <span>年代原文显示，不按比例定位</span>
        </div>
        <GenealogyCanvas
          languages={props.data.languages}
          relations={props.data.relations}
          stagesByLanguage={props.data.stagesByLanguage}
          evolutionMarkers={props.data.markers}
          onOpenEvolutionMarker={props.onSelect}
          onOpenLanguage={props.onOpenLanguage}
          onOpenStage={props.onOpenStage}
        />
      </div>
      <aside className={styles.graphInspector}>
        <strong>演化提交</strong>
        {props.selected ? (
          <>
            <dl>
              <div>
                <dt>方案</dt>
                <dd>{props.selected.planName}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{props.selected.versionNumber}</dd>
              </div>
              <div>
                <dt>参与词数</dt>
                <dd>{props.selected.total}</dd>
              </div>
              <div>
                <dt>变化数</dt>
                <dd>{props.selected.changed}</dd>
              </div>
              <div>
                <dt>警告</dt>
                <dd>{props.selected.warnings}</dd>
              </div>
            </dl>
            <button
              className={styles.primary}
              onClick={() => props.onOpenRecord(props.selected!)}
            >
              打开运行与提交记录
            </button>
          </>
        ) : (
          <p>选择图上的演化标记查看不可变运行和提交摘要。</p>
        )}
      </aside>
    </div>
  );
}

function RunIcon({ status }: { status: EvolutionRun["status"] }) {
  return status === "succeeded" ? (
    <CheckCircledIcon aria-hidden="true" />
  ) : status === "cancelled" ? (
    <ArchiveIcon aria-hidden="true" />
  ) : (
    <ExclamationTriangleIcon aria-hidden="true" />
  );
}
function StatusLabel({ value }: { value: EvolutionRunItem["status"] }) {
  const labels = {
    changed: "已变化",
    unchanged: "无变化",
    warning: "有警告",
    error: "错误",
    not_run: "未参与",
  };
  return <span data-status={value}>{labels[value]}</span>;
}
function stageName(stages: LanguageStage[], id?: string) {
  return stages.find((stage) => stage.id === id)?.name ?? "未选择阶段";
}
function availableSourceStages(stages: LanguageStage[]) {
  const visible = stages.filter(
    (stage) =>
      stage.visible &&
      stage.kind !== "internal_default" &&
      stage.storageMode !== "no_data"
  );
  return visible.length
    ? visible
    : stages.filter((stage) => stage.storageMode !== "no_data");
}
function deliveryBlockingCount(delivery: EvolutionDelivery) {
  return delivery.items.reduce(
    (sum, item) =>
      sum +
      (item.decision === "skip"
        ? 0
        : item.conflicts.filter((issue) => issue.severity === "error").length),
    0
  );
}
function readDeliveryPhonemeResolutions(
  value: unknown
): EvolutionPhonemeResolution[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EvolutionPhonemeResolution =>
    Boolean(
      item &&
        typeof item === "object" &&
        typeof (item as EvolutionPhonemeResolution).ipa === "string"
    )
  );
}
function readDeliveryPhonemeOptions(value: unknown): EvolutionPhonemeOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is EvolutionPhonemeOption =>
    Boolean(
      item &&
        typeof item === "object" &&
        typeof (item as EvolutionPhonemeOption).id === "string" &&
        typeof (item as EvolutionPhonemeOption).ipa === "string"
    )
  );
}
function groupDeliveryIssues(issues: EvolutionIssue[]) {
  const groups = new Map<
    string,
    {
      key: string;
      count: number;
      message: string;
      recovery?: string;
    }
  >();
  for (const issue of issues) {
    const key = issue.code.startsWith("NEW_PHONEME:")
      ? "NEW_PHONEME"
      : issue.code.startsWith("NEW_PHONEME_CONFIG:")
      ? "NEW_PHONEME_CONFIG"
      : issue.code;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else
      groups.set(key, {
        key,
        count: 1,
        message:
          key === "NEW_PHONEME"
            ? "检测到目标音系尚未登记的音位。"
            : key === "NEW_PHONEME_CONFIG"
            ? "新增音的音系配置尚未完成。"
            : issue.message,
        recovery:
          key === "NEW_PHONEME"
            ? "配置检查出的新增音、修改目标 IPA，或跳过相应词条。"
            : issue.recovery,
      });
  }
  return [...groups.values()];
}
function saveLabel(value: "saved" | "dirty" | "saving" | "failed") {
  return {
    saved: "已保存",
    dirty: "有未保存修改",
    saving: "正在保存…",
    failed: "保存失败 · 点击重试",
  }[value];
}
function shortDate(value: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
function deliveryTargetLabel(value: EvolutionDelivery["targetType"]) {
  return {
    new_stage: "新历史阶段",
    existing_stage: "已有阶段",
    existing_dialect: "已有方言",
    new_descendant: "后代语言",
  }[value];
}
function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
