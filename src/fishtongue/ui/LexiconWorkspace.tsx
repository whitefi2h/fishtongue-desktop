import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { AiProposalDraft } from "@/fishtongue/application/ports/AiPorts";
import { EtymologyRelation, Language, Lexeme, Morpheme, StageComponentOverride } from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import {
  Cross2Icon,
  DotsHorizontalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

interface LexemeDraft {
  id?: string;
  createdAt?: string;
  romanized: string;
  ipa: string;
  partOfSpeech: string;
  status: Lexeme["status"];
  sourceType: Lexeme["sourceType"];
  notes: string;
  senses: string;
  morphemes: string[];
}

interface LexemeTrace {
  id: string;
  relation: EtymologyRelation["kind"];
  direction: "source" | "target";
  label: string;
  languageName: string;
  lexeme?: Lexeme;
}

const emptyDraft: LexemeDraft = {
  romanized: "",
  ipa: "",
  partOfSpeech: "未分类",
  status: "draft",
  sourceType: "manual",
  notes: "",
  senses: "",
  morphemes: [],
};

export default function LexiconWorkspace({
  application,
  languageId,
  createRequest,
  onProjectChanged,
  onStatus,
  aiDraft,
  onAiDraftConsumed,
  refreshRequest = 0,
  historyApplication,
  languages = [],
  stageId,
  focusRequest,
  onOpenRelatedLexeme,
  viewStateKey,
  viewState,
  onViewStateChange,
}: {
  application: ProjectApplication;
  languageId: string;
  createRequest: number;
  onProjectChanged: (snapshot: ProjectSnapshot) => void;
  onStatus: (message: string) => void;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
  refreshRequest?: number;
  historyApplication?: Phase5Application;
  languages?: Language[];
  stageId?: string;
  focusRequest?: { lexemeId: string; requestId: string };
  onOpenRelatedLexeme?: (
    languageId: string,
    lexemeId: string,
    originLexemeId: string
  ) => void;
  viewStateKey?: string;
  viewState?: { search: string; selectedId?: string };
  onViewStateChange?: (key: string, state: { search: string; selectedId?: string }) => void;
}) {
  const [lexemes, setLexemes] = useState<Lexeme[]>([]);
  const [morphemeLibrary, setMorphemeLibrary] = useState<Morpheme[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<LexemeDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [morphemeSearch, setMorphemeSearch] = useState("");
  const [morphemeType, setMorphemeType] = useState<Morpheme["type"] | "all">("all");
  const [morphemePickerOpen, setMorphemePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [stageView, setStageView] = useState<string>();
  const [stageNoData, setStageNoData] = useState(false);
  const [stageOrigins, setStageOrigins] = useState<Map<string, string>>(new Map());
  const [traces, setTraces] = useState<LexemeTrace[]>([]);
  const handledRefreshRequest = useRef(0);
  const stageReadOnlyRef = useRef(false);
  const stageOverridesRef = useRef<Map<string, StageComponentOverride>>(new Map());
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;

  const selectLexeme = useCallback((lexeme: Lexeme) => {
    setSelectedId(lexeme.id);
    setDraft({
      id: lexeme.id,
      createdAt: lexeme.createdAt,
      romanized: lexeme.romanized,
      ipa: lexeme.ipa,
      partOfSpeech: lexeme.partOfSpeech,
      status: lexeme.status,
      sourceType: lexeme.sourceType,
      notes: lexeme.notes,
      senses: [...lexeme.senses]
        .sort((left, right) => left.position - right.position)
        .map((sense) => sense.definition)
        .join("\n"),
      morphemes: [...lexeme.morphemes]
        .sort((left, right) => left.position - right.position)
        .map((item) => item.morphemeId),
    });
    setMorphemeSearch("");
    setMorphemePickerOpen(false);
    setError(undefined);
  }, []);

  const startCreating = useCallback(() => {
    if (stageReadOnlyRef.current) {
      onStatus("无记录阶段只保存历史背景与关系，不能新建词条。");
      return;
    }
    setSelectedId(undefined);
    setDraft(emptyDraft);
    setMorphemeSearch("");
    setMorphemePickerOpen(false);
    setError(undefined);
  }, [onStatus]);

  const reload = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      let [next, nextMorphemes] = await Promise.all([
        application.listLexemes(languageId),
        application.listMorphemes(languageId),
      ]);
      if (historyApplication && stageId) {
        const resolved = await historyApplication.resolveStage(stageId);
        const isStageView = resolved.stage.kind !== "internal_default";
        const noData = resolved.stage.storageMode === "no_data";
        stageReadOnlyRef.current = noData;
        setStageView(isStageView ? resolved.stage.name : undefined);
        setStageNoData(noData);
        if (isStageView) {
          next = Object.values(resolved.components.lexicon) as unknown as Lexeme[];
          nextMorphemes = Object.values(resolved.components.morphemes) as unknown as Morpheme[];
          const stages = await historyApplication.listStages(languageId);
          const stageNames = new Map(stages.map((value) => [value.id, value.name]));
          const lineageOverrides = historyApplication.listStageOverrides
            ? await Promise.all(resolved.lineage.map((id) => historyApplication.listStageOverrides!(id)))
            : resolved.lineage.map(() => [] as StageComponentOverride[]);
          const origins = new Map(next.map((value) => [value.id, "继承自当前语言数据"]));
          for (const [index, overrides] of lineageOverrides.entries()) {
            const lineageStageId = resolved.lineage[index];
            for (const override of overrides.filter((value) => value.componentType === "lexicon")) {
              if (override.operation === "remove") origins.delete(override.targetId);
              else origins.set(
                override.targetId,
                lineageStageId === stageId
                  ? "本阶段"
                  : `继承自${stageNames.get(lineageStageId) ?? "来源阶段"}`
              );
            }
          }
          const overrides = lineageOverrides[resolved.lineage.indexOf(stageId)] ?? [];
          const lexiconOverrides = overrides.filter((value) => value.componentType === "lexicon");
          stageOverridesRef.current = new Map(lexiconOverrides.map((value) => [value.targetId, value]));
          setStageOrigins(origins);
        }
      } else {
        stageReadOnlyRef.current = false;
        setStageView(undefined);
        setStageNoData(false);
        stageOverridesRef.current = new Map();
        setStageOrigins(new Map());
      }
      setLexemes(next);
      setMorphemeLibrary(nextMorphemes);
      const preferred = next.find((lexeme) => lexeme.id === preferredId);
      if (preferred) {
        selectLexeme(preferred);
      } else if (!preferredId && next[0]) {
        selectLexeme(next[0]);
      } else if (!next.length) {
        startCreating();
      }
      setError(undefined);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [application, historyApplication, languageId, selectLexeme, stageId, startCreating]);

  useEffect(() => {
    const remembered = viewStateRef.current;
    if (remembered) setSearch(remembered.search);
    void reload(focusRequest?.lexemeId ?? remembered?.selectedId);
  }, [focusRequest, reload, viewStateKey]);

  useEffect(() => {
    if (viewStateKey) onViewStateChange?.(viewStateKey, { search, selectedId });
  }, [onViewStateChange, search, selectedId, viewStateKey]);

  useEffect(() => {
    if (refreshRequest <= handledRefreshRequest.current) return;
    handledRefreshRequest.current = refreshRequest;
    void reload(selectedId);
  }, [refreshRequest, reload, selectedId]);

  useEffect(() => {
    if (createRequest > 0) startCreating();
  }, [createRequest, startCreating]);

  useEffect(() => {
    if (!selectedId || !historyApplication || stageView) {
      setTraces([]);
      return;
    }
    let cancelled = false;
    void Promise.all([
      historyApplication.listEtymologyForLexeme(selectedId),
      Promise.all(languages.map(async (language) => ({
        language,
        lexemes: await application.listLexemes(language.id),
      }))),
      application.listGenerationBatches(languageId),
    ]).then(([relations, groups, batches]) => {
      if (cancelled) return;
      const entries = groups.flatMap(({ language, lexemes: values }) =>
        values.map((lexeme) => ({ language, lexeme }))
      );
      const byId = new Map(entries.map((entry) => [entry.lexeme.id, entry]));
      const values: LexemeTrace[] = relations.map((relation) => {
        const direction = relation.targetLexemeId === selectedId ? "target" : "source";
        const otherId = direction === "target" ? relation.sourceLexemeId : relation.targetLexemeId;
        const other = otherId ? byId.get(otherId) : undefined;
        return {
          id: relation.id,
          relation: relation.kind,
          direction,
          label: other?.lexeme.romanized || relation.sourceForm || "未知形式",
          languageName: other?.language.name || "项目外来源",
          lexeme: other?.lexeme,
        };
      });
      for (const batch of batches) {
        if (batch.type !== "derivation" || batch.status !== "committed") continue;
        for (const candidate of batch.candidates) {
          if (candidate.status !== "committed" || !candidate.committedLexemeId || !candidate.sourceLexemeId) continue;
          const selectedIsTarget = candidate.committedLexemeId === selectedId;
          const selectedIsSource = candidate.sourceLexemeId === selectedId;
          if (!selectedIsTarget && !selectedIsSource) continue;
          const otherId = selectedIsTarget ? candidate.sourceLexemeId : candidate.committedLexemeId;
          if (values.some((value) => value.relation === "derivation" && value.lexeme?.id === otherId)) continue;
          const other = byId.get(otherId);
          values.push({
            id: `generation:${candidate.id}`,
            relation: "derivation",
            direction: selectedIsTarget ? "target" : "source",
            label: other?.lexeme.romanized ?? "关联词已删除",
            languageName: other?.language.name ?? "当前语言",
            lexeme: other?.lexeme,
          });
        }
      }
      setTraces(values);
    }).catch(() => {
      if (!cancelled) setTraces([]);
    });
    return () => { cancelled = true; };
  }, [application, historyApplication, languageId, languages, selectedId, stageView, refreshRequest]);

  useEffect(() => {
    if (loading || !aiDraft || aiDraft.kind !== "lexeme.upsert") return;
    const patch = aiDraft.patch;
    const senses = Array.isArray(patch.senses)
      ? patch.senses.map((value) =>
          value && typeof value === "object"
            ? String((value as Record<string, unknown>).definition ?? "")
            : String(value)
        ).filter(Boolean).join("\n")
      : String(patch.meaning ?? "");
    setSelectedId(undefined);
    setDraft({
      ...emptyDraft,
      romanized: String(patch.romanized ?? ""),
      ipa: String(patch.ipa ?? ""),
      partOfSpeech: String(patch.partOfSpeech ?? "未分类"),
      status: ["draft", "confirmed", "deprecated"].includes(String(patch.status))
        ? patch.status as Lexeme["status"]
        : "draft",
      sourceType: "manual",
      notes: String(patch.notes ?? ""),
      senses,
    });
    setError(undefined);
    onAiDraftConsumed?.(aiDraft.requestId);
    onStatus("AI 词条提案已填入编辑器；请检查后手动保存。");
  }, [aiDraft, loading, onAiDraftConsumed, onStatus]);

  const filteredLexemes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return lexemes;
    return lexemes.filter((lexeme) =>
      lexeme.romanized.toLocaleLowerCase().includes(query) ||
      lexeme.senses.some((sense) =>
        sense.definition.toLocaleLowerCase().includes(query)
      )
    );
  }, [lexemes, search]);
  const filteredMorphemes = useMemo(() => {
    const query = morphemeSearch.trim().toLocaleLowerCase();
    return morphemeLibrary.filter((morpheme) =>
      (morphemeType === "all" || morpheme.type === morphemeType) &&
      (!query ||
        morpheme.form.toLocaleLowerCase().includes(query) ||
        morpheme.meaning.toLocaleLowerCase().includes(query))
    );
  }, [morphemeLibrary, morphemeSearch, morphemeType]);
  const selectedMorphemes = useMemo(() =>
    draft.morphemes
      .map((id) => morphemeLibrary.find((morpheme) => morpheme.id === id))
      .filter((morpheme): morpheme is Morpheme => Boolean(morpheme)),
  [draft.morphemes, morphemeLibrary]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (stageReadOnlyRef.current) {
      setError("无记录阶段只保存历史背景与关系，不能保存词典数据。");
      return;
    }
    const definitions = draft.senses
      .split(/\r?\n/)
      .map((definition) => definition.trim())
      .filter(Boolean);
    if (!draft.romanized.trim() || !definitions.length) {
      setError("请填写词形，并至少填写一个词义。");
      return;
    }

    const existing = lexemes.find((lexeme) => lexeme.id === draft.id);
    const now = new Date().toISOString();
    const id = draft.id ?? uuid();
    setSaving(true);
    setError(undefined);
    try {
      const lexeme: Lexeme = {
        id,
        languageId,
        romanized: draft.romanized,
        ipa: draft.ipa,
        partOfSpeech: draft.partOfSpeech,
        status: draft.status,
        sourceType: draft.sourceType,
        notes: draft.notes,
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
        senses: definitions.map((definition, position) => ({
          id: existing?.senses[position]?.id ?? uuid(),
          definition,
          position,
        })),
        morphemes: draft.morphemes.map((morphemeId, position) => ({
          morphemeId,
          position,
          role: "composition",
        })),
      };
      if (stageView && stageId && historyApplication) {
        const previous = stageOverridesRef.current.get(id);
        await historyApplication.saveStageOverride({
          id: previous?.id ?? `${stageId}:lexicon:${id}`,
          stageId,
          componentType: "lexicon",
          operation: "replace",
          targetId: id,
          payload: lexeme as unknown as Record<string, unknown>,
          position: previous?.position ?? Math.max(0, lexemes.findIndex((value) => value.id === id)),
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        });
      } else {
        await application.saveLexeme(lexeme);
      }
      const snapshot = application.getSnapshot();
      if (snapshot) onProjectChanged(snapshot);
      await reload(id);
      onStatus(stageView
        ? `${stageView}的词条差异已保存；来源阶段未改变。`
        : existing ? "词条修改已保存到项目。" : "新词条已保存到项目。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (stageReadOnlyRef.current) return;
    if (!draft.id) return;
    setSaving(true);
    setError(undefined);
    try {
      if (stageView && stageId && historyApplication) {
        const previous = stageOverridesRef.current.get(draft.id);
        const now = new Date().toISOString();
        await historyApplication.saveStageOverride({
          id: previous?.id ?? `${stageId}:lexicon:${draft.id}`,
          stageId,
          componentType: "lexicon",
          operation: "remove",
          targetId: draft.id,
          payload: {},
          position: previous?.position ?? 0,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        });
      } else {
        await application.deleteLexeme(draft.id);
      }
      const snapshot = application.getSnapshot();
      if (snapshot) onProjectChanged(snapshot);
      await reload();
      onStatus(stageView
        ? `词条已从${stageView}隐藏；来源阶段未删除。`
        : "词条已从项目中删除。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return <div className={styles.lexiconLayout}>
    <aside className={styles.filterPane}>
      <h2>筛选与分类</h2>
      <label className={styles.searchField}>
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          aria-label="搜索词形或释义"
          name="lexicon-search"
          autoComplete="off"
          placeholder="搜索词形或释义…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className={styles.filterGroup}>
        <strong>数据范围</strong>
        <span>{stageView
          ? stageNoData ? `${stageView} · 无记录，只读` : `${stageView} · 继承加阶段差异`
          : "当前语言 · 正式项目"}</span>
      </div>
      <div className={styles.filterGroup}>
        <strong>词义规则</strong>
        <span>每行保存为一个独立词义。</span>
      </div>
    </aside>

    <section className={styles.lexemeList}>
      <div className={styles.paneHeader}>
        <strong>{lexemes.length} 个词条</strong>
        <button data-create-lexeme onClick={startCreating} disabled={stageNoData}>
          <PlusIcon aria-hidden="true" />新建词条
        </button>
      </div>
      {loading
        ? <p className={styles.lexiconMessage}>正在读取词典…</p>
        : filteredLexemes.length
          ? <table className={styles.dataTable}>
              <thead><tr><th>词形</th><th>IPA</th><th>核心释义</th><th>词性</th><th>状态</th></tr></thead>
              <tbody>{filteredLexemes.map((lexeme) =>
                <tr
                  key={lexeme.id}
                  data-active={lexeme.id === selectedId}
                  data-selectable
                  tabIndex={0}
                  aria-label={`选择词条 ${lexeme.romanized}`}
                  onClick={() => selectLexeme(lexeme)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectLexeme(lexeme);
                    }
                  }}
                >
                  <td><strong>{lexeme.romanized}</strong>{stageView && <small>{stageOrigins.get(lexeme.id) ?? "继承"}</small>}</td>
                  <td>{lexeme.ipa || "—"}</td>
                  <td>{lexeme.senses[0]?.definition}</td>
                  <td>{lexeme.partOfSpeech}</td>
                  <td>{lexeme.status === "confirmed" ? "已确认" : lexeme.status === "deprecated" ? "已弃用" : "草稿"}</td>
                </tr>
              )}</tbody>
            </table>
          : <div className={styles.lexiconEmpty}>
              <strong>{search ? "没有匹配的词条" : "当前语言还没有词条"}</strong>
              <p>{search ? "清除搜索条件或新建词条。" : "创建词条后，即可在演化系统中使用“当前词典”作为输入源。"}</p>
              {!search && <button onClick={startCreating}><PlusIcon aria-hidden="true" />新建第一个词条</button>}
            </div>}
    </section>

    <aside className={styles.lexemeDetail}>
      <div className={styles.paneHeader}>
        <span><strong>{draft.id ? draft.romanized || "未命名词条" : "新建词条"}</strong><small>{stageView ? stageNoData ? `${stageView} · 无记录，只读` : `${stageView} · 保存为阶段差异` : draft.id ? "编辑正式项目数据" : "至少填写一个词义"}</small></span>
        <span className={styles.lexemeHeaderActions}>
          <button aria-label="更多词条操作" disabled><DotsHorizontalIcon aria-hidden="true" /></button>
          <button className={styles.primaryButton} type="submit" form="lexeme-editor-form" disabled={saving || stageNoData}>{saving ? "保存中…" : "保存"}</button>
        </span>
      </div>
      <form id="lexeme-editor-form" className={styles.lexemeForm} onSubmit={(event) => void save(event)}>
        <fieldset className={styles.lexemeFormFields} disabled={stageNoData}>
        <label><span>词形</span><input name="lexeme-romanized" autoComplete="off" value={draft.romanized} onChange={(event) => setDraft((value) => ({ ...value, romanized: event.target.value }))} /></label>
        <label><span>IPA</span><input name="lexeme-ipa" autoComplete="off" value={draft.ipa} onChange={(event) => setDraft((value) => ({ ...value, ipa: event.target.value }))} placeholder="/a.ka/" /></label>
        <label><span>词性</span><input name="lexeme-part-of-speech" autoComplete="off" value={draft.partOfSpeech} onChange={(event) => setDraft((value) => ({ ...value, partOfSpeech: event.target.value }))} /></label>
        <label><span>状态</span><select name="lexeme-status" value={draft.status} onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value as Lexeme["status"] }))}><option value="draft">草稿</option><option value="confirmed">已确认</option><option value="deprecated">已弃用</option></select></label>
        <label><span>来源</span><select name="lexeme-source" value={draft.sourceType} onChange={(event) => setDraft((value) => ({ ...value, sourceType: event.target.value as Lexeme["sourceType"] }))}><option value="manual">人工</option><option value="generated">生成</option><option value="derived">派生</option><option value="imported">导入</option></select></label>
        <label><span>词义</span><textarea name="lexeme-senses" value={draft.senses} onChange={(event) => setDraft((value) => ({ ...value, senses: event.target.value }))} placeholder={"每行一个独立词义\n例如：海\n外海"} /></label>
        <label><span>备注</span><textarea name="lexeme-notes" value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} placeholder="用法、资料状态或其他说明" /></label>
        <fieldset className={styles.compactPickerFieldset}>
          <legend>形态组成（按选择顺序保存）</legend>
          <p className={styles.fieldHint}>派生功能创建的词条会自动关联所用语素；手工词条可从语素库搜索并选择。</p>
          <div className={styles.compactPickerSummary}>
            <span>{selectedMorphemes.length ? `已关联 ${selectedMorphemes.length} 个语素` : "尚未关联语素"}</span>
            <button
              type="button"
              aria-expanded={morphemePickerOpen}
              aria-controls="lexeme-morpheme-picker"
              onClick={() => setMorphemePickerOpen((open) => !open)}
            >
              {morphemePickerOpen ? <Cross2Icon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
              {morphemePickerOpen ? "收起" : "添加语素"}
            </button>
          </div>
          {selectedMorphemes.length > 0 && <div className={styles.morphemeOrder}>
            {selectedMorphemes.map((item, position) => <span key={item.id}>
              <strong>{position + 1}. {item.form}</strong>
              <small>{item.meaning}</small>
              <span className={styles.orderActions}>
                <button type="button" disabled={position === 0} onClick={() => setDraft((value) => ({ ...value, morphemes: move(value.morphemes, position, position - 1) }))}>上移</button>
                <button type="button" disabled={position === draft.morphemes.length - 1} onClick={() => setDraft((value) => ({ ...value, morphemes: move(value.morphemes, position, position + 1) }))}>下移</button>
                <button type="button" aria-label={`移除语素 ${item.form}`} onClick={() => setDraft((value) => ({ ...value, morphemes: value.morphemes.filter((id) => id !== item.id) }))}>
                  <Cross2Icon aria-hidden="true" />
                </button>
              </span>
            </span>)}
          </div>}
          {morphemePickerOpen && <div id="lexeme-morpheme-picker" className={styles.compactPickerPanel}>
            <div className={styles.morphemePickerToolbar}>
              <label className={styles.searchField}>
                <MagnifyingGlassIcon aria-hidden="true" />
                <input
                  aria-label="搜索语素"
                  autoComplete="off"
                  placeholder="输入形式或含义查找…"
                  value={morphemeSearch}
                  onChange={(event) => setMorphemeSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="按语素类型筛选"
                value={morphemeType}
                onChange={(event) => setMorphemeType(event.target.value as Morpheme["type"] | "all")}
              >
                <option value="all">全部类型</option>
                <option value="root">词根</option>
                <option value="prefix">前缀</option>
                <option value="suffix">后缀</option>
                <option value="infix">中缀</option>
                <option value="circumfix">环缀</option>
                <option value="clitic">黏着语素</option>
                <option value="inflectional_ending">屈折词尾</option>
              </select>
            </div>
            <div className={styles.compactPickerResults}>
              {!morphemeLibrary.length
                ? <span>请先在“形态学 → 语素库”创建语素。</span>
                : !morphemeSearch.trim()
                  ? <span>输入关键词后显示匹配语素。</span>
                  : filteredMorphemes.filter((morpheme) => !draft.morphemes.includes(morpheme.id)).length
                    ? filteredMorphemes
                        .filter((morpheme) => !draft.morphemes.includes(morpheme.id))
                        .map((morpheme) => <button
                          type="button"
                          key={morpheme.id}
                          onClick={() => {
                            setDraft((value) => ({ ...value, morphemes: [...value.morphemes, morpheme.id] }));
                            setMorphemeSearch("");
                          }}
                        >
                          <span><strong>{morpheme.form}</strong><small>{morpheme.meaning}</small></span>
                          <PlusIcon aria-hidden="true" />
                        </button>)
                    : <span>没有可添加的匹配语素。</span>}
            </div>
          </div>}
        </fieldset>
        {draft.id && <fieldset className={styles.compactPickerFieldset}>
          <legend>词源与关联</legend>
          {traces.length ? <div className={styles.lexemeRelations}>{traces.map((trace) => <button
            type="button"
            key={trace.id}
            disabled={!trace.lexeme}
            onClick={() => {
              if (!trace.lexeme) return;
              if (trace.lexeme.languageId === languageId) {
                selectLexeme(trace.lexeme);
                return;
              }
              const originLexemeId = selectedId ?? draft.id;
              if (!originLexemeId) return;
              onOpenRelatedLexeme?.(
                trace.lexeme.languageId,
                trace.lexeme.id,
                originLexemeId
              );
            }}
          >
            <span><strong>{traceDirectionLabel(trace.relation, trace.direction)}</strong><small>{trace.languageName}</small></span>
            <span>{trace.label}</span>
          </button>)}</div> : <p className={styles.fieldHint}>尚无词源或派生关联</p>}
        </fieldset>}
        {error && <p className={styles.lexemeError} role="alert">{error}</p>}
        </fieldset>
        <div className={styles.lexemeFormActions}>
          <button type="button" onClick={startCreating} disabled={stageNoData}>清空</button>
          {draft.id && <button type="button" onClick={() => void remove()} disabled={saving || stageNoData}>删除</button>}
          <button className={styles.primaryButton} type="submit" disabled={saving || stageNoData}>{saving ? "保存中…" : "保存词条"}</button>
        </div>
      </form>
    </aside>
  </div>;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function move<T>(values: T[], from: number, to: number): T[] {
  const next = [...values];
  const [value] = next.splice(from, 1);
  next.splice(to, 0, value);
  return next;
}

function traceDirectionLabel(kind: EtymologyRelation["kind"], direction: "source" | "target"): string {
  const labels: Record<EtymologyRelation["kind"], [string, string]> = {
    inheritance: ["继承自", "延续为"],
    borrowing: ["借入自", "借出至"],
    cognate: ["同源于", "同源于"],
    derivation: ["派生自", "派生出"],
    calque: ["仿译自", "被仿译为"],
    unknown: ["关联自", "关联到"],
  };
  return labels[kind][direction === "target" ? 0 : 1];
}
