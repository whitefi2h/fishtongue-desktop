import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import { AiProposalDraft } from "@/fishtongue/application/ports/AiPorts";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import { normalizeWordGenerationConfig } from "@/fishtongue/application/services/AiProposalService";
import WordGenerationService from "@/fishtongue/application/services/WordGenerationService";
import { syncWordGenerationConfigFromPhonology } from "@/fishtongue/application/services/PhonologyWordGenerationSync";
import { builtInConcepts } from "@/fishtongue/data/BuiltInConceptLists";
import {
  CandidateStatus,
  ConceptList,
  GenerationBatch,
  Lexeme,
  Morpheme,
  MorphemeType,
  WordGenerationConfig,
  WordGenerationProfile,
} from "@/fishtongue/domain/models";
import { InflectionWorkspace } from "@/fishtongue/ui/EngineWorkspaces";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import { CheckIcon, Cross2Icon, MagnifyingGlassIcon, PlusIcon, ReloadIcon } from "@radix-ui/react-icons";
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";

type MorphologyTab = "morphemes" | "derivation" | "inflection";
type LexiconTab = "dictionary" | "profile" | "review" | "operations";

const typeLabels: Record<MorphemeType, string> = {
  root: "词根",
  prefix: "前缀",
  suffix: "后缀",
  infix: "中缀",
  circumfix: "环缀",
  clitic: "黏着词素",
  inflectional_ending: "屈折词尾",
};

const blankConfig: WordGenerationConfig = {
  categories: [
    { name: "C", symbols: [{ value: "p", weight: 1 }, { value: "t", weight: 1 }, { value: "k", weight: 1 }, { value: "th", weight: 1 }] },
    { name: "V", symbols: [{ value: "a", weight: 1 }, { value: "i", weight: 1 }, { value: "u", weight: 1 }] },
  ],
  templates: [{ pattern: "{C}{V}", weight: 1 }, { pattern: "{C}{V}{C}", weight: 1 }],
  syllableCounts: [{ count: 2, weight: 1 }],
  forbiddenPatterns: [],
  rewriteRules: [],
  maxAttemptsPerCandidate: 100,
};

export function MorphemeWorkspace({
  application,
  inflectionService,
  languageId,
  live,
  onProjectChanged,
  onStatus,
  onOpenCandidateReview,
  aiDraft,
  onAiDraftConsumed,
  refreshRequest = 0,
}: {
  application: ProjectApplication;
  inflectionService?: InflectionService;
  languageId: string;
  live: boolean;
  onProjectChanged: (snapshot: ProjectSnapshot) => void;
  onStatus: (message: string) => void;
  onOpenCandidateReview?: () => void;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
  refreshRequest?: number;
}) {
  const [tab, setTab] = useState<MorphologyTab>("morphemes");
  const [morphemes, setMorphemes] = useState<Morpheme[]>([]);
  const [selected, setSelected] = useState<Morpheme>();
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setMorphemes(await application.listMorphemes(languageId));
  }, [application, languageId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (refreshRequest > 0) void reload();
  }, [refreshRequest, reload]);
  useEffect(() => {
    if (!aiDraft) return;
    if (aiDraft.kind === "morpheme.upsert") {
      const patch = aiDraft.patch;
      const base = newMorpheme(languageId);
      setTab("morphemes");
      setSelected({
        ...base,
        form: String(patch.form ?? ""),
        meaning: String(patch.meaning ?? ""),
        type: isMorphemeType(patch.type) ? patch.type : "root",
        applicablePartOfSpeech: String(patch.applicablePartOfSpeech ?? ""),
        notes: String(patch.notes ?? ""),
        compositionRule: patch.compositionRule && typeof patch.compositionRule === "object"
          ? patch.compositionRule as Morpheme["compositionRule"]
          : { mode: "none" },
      });
      onAiDraftConsumed?.(aiDraft.requestId);
      onStatus("AI 语素提案已填入编辑器；请检查后手动保存。");
    } else if (aiDraft.kind === "inflection_system.update_draft") {
      setTab("inflection");
    }
  }, [aiDraft, languageId, onAiDraftConsumed, onStatus]);

  const save = async (draft: Morpheme) => {
    try {
      await application.saveMorpheme(draft);
      await reload();
      setSelected(draft);
      notifyProject(application, onProjectChanged);
      onStatus("语素已保存到项目。");
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const remove = async (id: string) => {
    try {
      await application.deleteMorpheme(id);
      setSelected(undefined);
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus("语素已删除。");
    } catch (reason) {
      setError(messageOf(reason));
    }
  };

  return <div className={styles.phase3Workspace}>
    <WorkspaceTabs value={tab} onChange={(value) => setTab(value as MorphologyTab)} items={[
      ["morphemes", "语素库"],
      ["derivation", "批量派生"],
      ["inflection", "屈折系统"],
    ]} />
    {tab === "inflection"
      ? <InflectionWorkspace application={application} service={inflectionService} languageId={languageId} live={live} aiDraft={aiDraft} onAiDraftConsumed={onAiDraftConsumed} />
      : tab === "derivation"
        ? <DerivationPanel application={application} languageId={languageId} morphemes={morphemes} onProjectChanged={onProjectChanged} onStatus={onStatus} onOpenCandidateReview={onOpenCandidateReview} />
        : <div className={styles.phase3Split}>
            <section className={styles.surfacePanel}>
              <div className={styles.paneHeader}><strong>{morphemes.length} 个语素</strong><button onClick={() => setSelected(newMorpheme(languageId))}><PlusIcon />新建</button></div>
              <div className={styles.phase3List}>
                {morphemes.map((item) => <button key={item.id} data-active={selected?.id === item.id} onClick={() => setSelected(item)}>
                  <strong>{item.form}</strong><span>{typeLabels[item.type]} · {item.meaning}</span>
                </button>)}
                {!morphemes.length && <p>当前语言还没有语素。先建立词根或词缀，再关联词条或批量派生。</p>}
              </div>
            </section>
            <MorphemeEditor value={selected ?? newMorpheme(languageId)} isNew={!selected} error={error} onSave={save} onDelete={remove} />
          </div>}
  </div>;
}

function MorphemeEditor({
  value,
  isNew,
  error,
  onSave,
  onDelete,
}: {
  value: Morpheme;
  isNew: boolean;
  error: string;
  onSave: (value: Morpheme) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const field = (key: keyof Morpheme, next: string) => setDraft((current) => ({ ...current, [key]: next, updatedAt: new Date().toISOString() }));
  return <section className={styles.surfacePanel}>
    <div className={styles.paneHeader}><strong>{isNew ? "新建语素" : `编辑 ${value.form}`}</strong></div>
    <div className={styles.phase3Form}>
      <label><span>形式</span><input value={draft.form} onChange={(event) => field("form", event.target.value)} /></label>
      <label><span>类型</span><select value={draft.type} onChange={(event) => field("type", event.target.value)}>
        {Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label><span>含义</span><input value={draft.meaning} onChange={(event) => field("meaning", event.target.value)} /></label>
      <label><span>适用词类</span><input value={draft.applicablePartOfSpeech} onChange={(event) => field("applicablePartOfSpeech", event.target.value)} /></label>
      <label><span>组合方式</span><select value={draft.compositionRule.mode} onChange={(event) => setDraft((current) => ({ ...current, compositionRule: { ...current.compositionRule, mode: event.target.value as "none" | "template" | "regex" } }))}>
        <option value="none">不用于自动派生</option><option value="template">模板</option><option value="regex">正则插入</option>
      </select></label>
      {draft.compositionRule.mode === "template" && <label><span>组合模板</span><input value={draft.compositionRule.template ?? ""} placeholder="{morpheme}{stem}" onChange={(event) => setDraft((current) => ({ ...current, compositionRule: { ...current.compositionRule, template: event.target.value } }))} /></label>}
      {draft.compositionRule.mode === "regex" && <>
        <label><span>词干匹配式</span><input value={draft.compositionRule.stemPattern ?? ""} onChange={(event) => setDraft((current) => ({ ...current, compositionRule: { ...current.compositionRule, stemPattern: event.target.value } }))} /></label>
        <label><span>替换式</span><input value={draft.compositionRule.replacement ?? ""} placeholder="$1{morpheme}$2" onChange={(event) => setDraft((current) => ({ ...current, compositionRule: { ...current.compositionRule, replacement: event.target.value } }))} /></label>
      </>}
      <label className={styles.phase3Wide}><span>备注</span><textarea value={draft.notes} onChange={(event) => field("notes", event.target.value)} /></label>
      {error && <p className={styles.lexemeError} role="alert">{error}</p>}
      <div className={styles.phase3Actions}>
        {!isNew && <button onClick={() => void onDelete(draft.id)}>删除</button>}
        <button className={styles.primaryButton} onClick={() => void onSave(draft)} disabled={!draft.form.trim() || !draft.meaning.trim()}>保存语素</button>
      </div>
    </div>
  </section>;
}

function DerivationPanel({
  application,
  languageId,
  morphemes,
  onProjectChanged,
  onStatus,
  onOpenCandidateReview,
}: {
  application: ProjectApplication;
  languageId: string;
  morphemes: Morpheme[];
  onProjectChanged: (snapshot: ProjectSnapshot) => void;
  onStatus: (message: string) => void;
  onOpenCandidateReview?: () => void;
}) {
  const [lexemes, setLexemes] = useState<Lexeme[]>([]);
  const [morphemeId, setMorphemeId] = useState("");
  const [morphemeSearch, setMorphemeSearch] = useState("");
  const [morphemeType, setMorphemeType] = useState<MorphemeType | "all">("all");
  const [sourceSearch, setSourceSearch] = useState("");
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void application.listLexemes(languageId).then(setLexemes); }, [application, languageId]);
  const filteredMorphemes = useMemo(() => {
    const query = morphemeSearch.trim().toLocaleLowerCase();
    return morphemes.filter((morpheme) =>
      (morphemeType === "all" || morpheme.type === morphemeType) &&
      (!query ||
        morpheme.form.toLocaleLowerCase().includes(query) ||
        morpheme.meaning.toLocaleLowerCase().includes(query))
    );
  }, [morphemeSearch, morphemeType, morphemes]);
  const selectableMorphemes = useMemo(() => {
    const selectedMorpheme = morphemes.find((morpheme) => morpheme.id === morphemeId);
    return selectedMorpheme && !filteredMorphemes.some((morpheme) => morpheme.id === selectedMorpheme.id)
      ? [selectedMorpheme, ...filteredMorphemes]
      : filteredMorphemes;
  }, [filteredMorphemes, morphemeId, morphemes]);
  const filteredLexemes = useMemo(() => {
    const query = sourceSearch.trim().toLocaleLowerCase();
    return query
      ? lexemes.filter((lexeme) =>
          !selected.includes(lexeme.id) &&
          (lexeme.romanized.toLocaleLowerCase().includes(query) ||
          lexeme.senses.some((sense) => sense.definition.toLocaleLowerCase().includes(query)))
        )
      : [];
  }, [lexemes, selected, sourceSearch]);
  const selectedLexemes = useMemo(() =>
    selected
      .map((id) => lexemes.find((lexeme) => lexeme.id === id))
      .filter((lexeme): lexeme is Lexeme => Boolean(lexeme)),
  [lexemes, selected]);
  const create = async () => {
    const morpheme = morphemes.find((item) => item.id === morphemeId);
    if (!morpheme) return;
    try {
      const service = new WordGenerationService(new DisabledWordGenerationEngine());
      const batch = service.derive(languageId, lexemes.filter((item) => selected.includes(item.id)), morpheme, morpheme.applicablePartOfSpeech, lexemes);
      await application.createGenerationBatch(batch);
      notifyProject(application, onProjectChanged);
      onStatus("派生候选已创建，正在打开候选审核。");
      setError("");
      onOpenCandidateReview?.();
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  return <section className={styles.surfacePanel}>
    <div className={styles.paneHeader}><strong>批量派生预览</strong><span>候选不会直接写入词典</span></div>
    <div className={styles.phase3Form}>
      <label><span>搜索派生语素</span><input autoComplete="off" value={morphemeSearch} onChange={(event) => setMorphemeSearch(event.target.value)} placeholder="输入形式或含义…" /></label>
      <label><span>语素类型</span><select value={morphemeType} onChange={(event) => setMorphemeType(event.target.value as MorphemeType | "all")}>
        <option value="all">全部类型</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className={styles.phase3Wide}><span>派生语素</span><select value={morphemeId} onChange={(event) => setMorphemeId(event.target.value)}>
        <option value="">请选择</option>{selectableMorphemes.map((item) => <option key={item.id} value={item.id}>{item.form} · {typeLabels[item.type]} · {item.meaning}</option>)}
      </select></label>
      <fieldset className={`${styles.phase3Wide} ${styles.compactPickerFieldset}`}><legend>源词</legend>
        <div className={styles.compactPickerSummary}>
          <span>{selected.length ? `已选择 ${selected.length} 个源词` : "尚未选择源词"}</span>
          <button
            type="button"
            aria-expanded={sourcePickerOpen}
            aria-controls="derivation-source-picker"
            onClick={() => setSourcePickerOpen((open) => !open)}
          >
            {sourcePickerOpen ? <Cross2Icon aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
            {sourcePickerOpen ? "收起" : "添加源词"}
          </button>
        </div>
        {selectedLexemes.length > 0 && <div className={styles.selectedSourceList}>
          {selectedLexemes.map((item) => <span key={item.id}>
            <span><strong>{item.romanized}</strong><small>{item.senses[0]?.definition || "无释义"}</small></span>
            <button type="button" aria-label={`移除源词 ${item.romanized}`} onClick={() => setSelected((current) => current.filter((id) => id !== item.id))}>
              <Cross2Icon aria-hidden="true" />
            </button>
          </span>)}
        </div>}
        {sourcePickerOpen && <div id="derivation-source-picker" className={styles.compactPickerPanel}>
          <label className={styles.searchField}><MagnifyingGlassIcon aria-hidden="true" /><input aria-label="搜索源词" autoComplete="off" value={sourceSearch} onChange={(event) => setSourceSearch(event.target.value)} placeholder="输入词形或释义查找…" /></label>
          <div className={styles.compactPickerResults}>
            {!lexemes.length
              ? <span>当前语言还没有可用于派生的词条。</span>
              : !sourceSearch.trim()
                ? <span>输入关键词后显示匹配词条。</span>
                : filteredLexemes.length
                  ? filteredLexemes.map((item) => <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setSelected((current) => [...current, item.id]);
                        setSourceSearch("");
                      }}
                    >
                      <span><strong>{item.romanized}</strong><small>{item.senses[0]?.definition || "无释义"}</small></span>
                      <PlusIcon aria-hidden="true" />
                    </button>)
                  : <span>没有可添加的匹配词条。</span>}
          </div>
        </div>}
      </fieldset>
      {error && <p className={styles.lexemeError}>{error}</p>}
      <div className={styles.phase3Actions}><button className={styles.primaryButton} disabled={!morphemeId || !selected.length} onClick={() => void create()}>创建派生审核批次</button></div>
    </div>
  </section>;
}

export function WordGenerationWorkspace({
  application,
  phonologyApplication,
  service,
  languageId,
  stageId,
  dictionary,
  onProjectChanged,
  onStatus,
  initialTab = "dictionary",
  aiDraft,
  onAiDraftConsumed,
}: {
  application: ProjectApplication;
  phonologyApplication?: Phase6Application;
  service?: WordGenerationService;
  languageId: string;
  stageId?: string;
  dictionary: ReactNode;
  onProjectChanged: (snapshot: ProjectSnapshot) => void;
  onStatus: (message: string) => void;
  initialTab?: LexiconTab;
  aiDraft?: AiProposalDraft;
  onAiDraftConsumed?: (requestId: string) => void;
}) {
  const [tab, setTab] = useState<LexiconTab>(initialTab);
  const [profiles, setProfiles] = useState<WordGenerationProfile[]>([]);
  const [batches, setBatches] = useState<GenerationBatch[]>([]);
  const [lexemes, setLexemes] = useState<Lexeme[]>([]);
  useEffect(() => setTab(initialTab), [initialTab]);
  const reload = useCallback(async () => {
    const [nextProfiles, nextBatches, nextLexemes] = await Promise.all([
      application.listWordGenerationProfiles(languageId),
      application.listGenerationBatches(languageId),
      application.listLexemes(languageId),
    ]);
    setProfiles(nextProfiles);
    setBatches(nextBatches);
    setLexemes(nextLexemes);
  }, [application, languageId]);
  useEffect(() => {
    if (tab !== "dictionary") void reload();
  }, [reload, tab]);

  return <div className={styles.phase3Workspace}>
    <WorkspaceTabs value={tab} onChange={(value) => setTab(value as LexiconTab)} items={[
      ["dictionary", "词典"],
      ["profile", "造词配置"],
      ["review", `候选审核${batches.filter((item) => item.status === "draft").length ? ` (${batches.filter((item) => item.status === "draft").length})` : ""}`],
      ["operations", "批量记录"],
    ]} />
    {tab === "dictionary" && dictionary}
    {tab === "profile" && <ProfileAndGenerate application={application} phonologyApplication={phonologyApplication} service={service} languageId={languageId} stageId={stageId} profiles={profiles} lexemes={lexemes} reload={reload} onProjectChanged={onProjectChanged} onStatus={onStatus} onReview={() => setTab("review")} aiDraft={aiDraft} onAiDraftConsumed={onAiDraftConsumed} />}
    {tab === "review" && <CandidateReview application={application} batches={batches} reload={reload} onProjectChanged={onProjectChanged} onStatus={onStatus} />}
    {tab === "operations" && <OperationHistory application={application} languageId={languageId} reload={reload} onProjectChanged={onProjectChanged} onStatus={onStatus} />}
  </div>;
}

function ProfileAndGenerate({
  application, phonologyApplication, service, languageId, stageId, profiles, lexemes, reload, onProjectChanged, onStatus, onReview, aiDraft, onAiDraftConsumed,
}: {
  application: ProjectApplication; phonologyApplication?: Phase6Application; service?: WordGenerationService; languageId: string; stageId?: string; profiles: WordGenerationProfile[]; lexemes: Lexeme[];
  reload: () => Promise<void>; onProjectChanged: (snapshot: ProjectSnapshot) => void; onStatus: (message: string) => void; onReview: () => void;
  aiDraft?: AiProposalDraft; onAiDraftConsumed?: (requestId: string) => void;
}) {
  const [profileId, setProfileId] = useState("");
  const current = profiles.find((item) => item.id === profileId) ?? profiles.find((item) => item.isDefault) ?? profiles[0];
  const [name, setName] = useState("基础音系");
  const [categoriesText, setCategoriesText] = useState(formatCategories(blankConfig));
  const [templatesText, setTemplatesText] = useState(formatTemplates(blankConfig));
  const [syllableCountsText, setSyllableCountsText] = useState(formatSyllableCounts(blankConfig));
  const [forbiddenText, setForbiddenText] = useState("");
  const [rewritesText, setRewritesText] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(100);
  const [seed, setSeed] = useState("20260726");
  const [listKind, setListKind] = useState<"swadesh-100" | "swadesh-207" | "custom">("swadesh-100");
  const [custom, setCustom] = useState("water\nfire\nsun\nmoon");
  const [customName, setCustomName] = useState("我的概念表");
  const [customLists, setCustomLists] = useState<ConceptList[]>([]);
  const [customListId, setCustomListId] = useState("");
  const [count, setCount] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generationAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (current) {
      setName(current.name);
      setCategoriesText(formatCategories(current.config));
      setTemplatesText(formatTemplates(current.config));
      setSyllableCountsText(formatSyllableCounts(current.config));
      setForbiddenText(current.config.forbiddenPatterns.join("\n"));
      setRewritesText(current.config.rewriteRules.map((rule) => `${rule.pattern} => ${rule.replacement}`).join("\n"));
      setMaxAttempts(current.config.maxAttemptsPerCandidate);
    }
  }, [current]);
  useEffect(() => {
    if (!aiDraft || aiDraft.kind !== "wordgen_profile.upsert") return;
    const patch = aiDraft.patch;
    const config = normalizeWordGenerationConfig(patch.config);
    setProfileId("");
    setName(String(patch.name ?? "AI 造词配置"));
    setCategoriesText(formatCategories(config));
    setTemplatesText(formatTemplates(config));
    setSyllableCountsText(formatSyllableCounts(config));
    setForbiddenText(Array.isArray(config.forbiddenPatterns) ? config.forbiddenPatterns.join("\n") : "");
    setRewritesText(Array.isArray(config.rewriteRules)
      ? config.rewriteRules.map((rule) => `${rule.pattern} => ${rule.replacement}`).join("\n")
      : "");
    setMaxAttempts(Number(config.maxAttemptsPerCandidate) || 100);
    setError("");
    onAiDraftConsumed?.(aiDraft.requestId);
    onStatus("AI 造词配置已填入编辑器；请校验后手动保存。");
  }, [aiDraft, onAiDraftConsumed, onStatus]);
  useEffect(() => {
    void application.listConceptLists().then(setCustomLists);
  }, [application]);
  const parse = (): WordGenerationConfig => parseProfileFields({
    categoriesText, templatesText, syllableCountsText, forbiddenText, rewritesText, maxAttempts,
  });
  const saveProfile = async () => {
    try {
      const now = new Date().toISOString();
      const profile: WordGenerationProfile = {
        id: current?.id ?? uuid(), languageId, name: name.trim(), config: parse(), configVersion: "wordgen-profile-v1",
        isDefault: true, createdAt: current?.createdAt ?? now, updatedAt: now,
      };
      if (service) {
        const validation = await service.validateProfile(profile);
        if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      }
      await application.saveWordGenerationProfile(profile);
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus("造词配置已校验并保存。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  const copyProfile = async () => {
    try {
      const now = new Date().toISOString();
      const copy: WordGenerationProfile = {
        id: uuid(), languageId, name: `${name.trim()} 副本`, config: parse(),
        configVersion: "wordgen-profile-v1", isDefault: false, createdAt: now, updatedAt: now,
      };
      await application.saveWordGenerationProfile(copy);
      await reload();
      setProfileId(copy.id);
      notifyProject(application, onProjectChanged);
      onStatus("造词配置副本已创建。");
    } catch (reason) { setError(messageOf(reason)); }
  };
  const deleteProfile = async () => {
    if (!current) return;
    try {
      await application.deleteWordGenerationProfile(current.id);
      setProfileId("");
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus("造词配置已删除。");
    } catch (reason) { setError(messageOf(reason)); }
  };
  const syncFromPhonology = async () => {
    if (!phonologyApplication) {
      setError("正式音系尚未连接。");
      return;
    }
    try {
      const phonology = await phonologyApplication.getPhonology(languageId, stageId);
      const synced = syncWordGenerationConfigFromPhonology(phonology, parse());
      if (!synced.categories.length || !synced.templates.length) {
        throw new Error("正式音系至少需要辅音或元音，并设置一个音节模板。");
      }
      setCategoriesText(formatCategories(synced));
      setTemplatesText(formatTemplates(synced));
      setForbiddenText(synced.forbiddenPatterns.join("\n"));
      setError("");
      onStatus("已从正式音系填入草稿；请检查权重后验证并保存。");
    } catch (reason) {
      setError(messageOf(reason));
    }
  };
  const generate = async () => {
    if (!service) { setError("造词引擎尚未连接。"); return; }
    const controller = new AbortController();
    generationAbort.current = controller;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const profile: WordGenerationProfile = current ?? {
        id: uuid(), languageId, name: name.trim(), config: parse(), configVersion: "wordgen-profile-v1", isDefault: true, createdAt: now, updatedAt: now,
      };
      profile.config = parse();
      const storedList = customLists.find((item) => item.id === customListId);
      const concepts = listKind === "custom"
        ? storedList?.concepts ?? custom.split(/\r?\n/).map((gloss) => gloss.trim()).filter(Boolean).map((gloss, position) => ({ id: uuid(), conceptKey: `custom:${position + 1}`, gloss, position }))
        : builtInConcepts(listKind);
      const batch = await service.generate(
        languageId,
        profile,
        seed,
        concepts,
        count,
        lexemes,
        controller.signal
      );
      await application.createGenerationBatch(batch);
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus(`已生成 ${batch.candidates.length} 个候选，尚未写入词典。`);
      setError("");
      onReview();
    } catch (reason) { setError(messageOf(reason)); }
    finally {
      if (generationAbort.current === controller) generationAbort.current = null;
      setBusy(false);
    }
  };
  const saveCustomList = async () => {
    try {
      const now = new Date().toISOString();
      const snapshot = application.getSnapshot();
      if (!snapshot) return;
      const list: ConceptList = {
        id: customListId || uuid(),
        projectId: snapshot.project.id,
        name: customName,
        source: "custom",
        sourceVersion: "1",
        readonly: false,
        createdAt: customLists.find((item) => item.id === customListId)?.createdAt ?? now,
        updatedAt: now,
        concepts: custom.split(/\r?\n/).map((gloss) => gloss.trim()).filter(Boolean).map((gloss, position) => ({
          id: uuid(),
          conceptKey: `custom:${position + 1}`,
          gloss,
          position,
        })),
      };
      await application.saveConceptList(list);
      const next = await application.listConceptLists();
      setCustomLists(next);
      setCustomListId(list.id);
      notifyProject(application, onProjectChanged);
      onStatus("自定义概念表已保存。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  return <div className={styles.phase3Split}>
    <section className={styles.surfacePanel}>
      <div className={styles.paneHeader}><strong>造词配置</strong><span>配置版本 wordgen-profile-v1</span></div>
      <div className={styles.phase3Form}>
        <label><span>已有配置</span><select value={current?.id ?? ""} onChange={(event) => setProfileId(event.target.value)}><option value="">新建配置</option>{profiles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · 默认" : ""}</option>)}</select></label>
        <label><span>配置名称</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className={styles.phase3Wide}><span>音位类别（每行“类别: 符号:权重, 符号:权重”）</span><textarea value={categoriesText} onChange={(event) => setCategoriesText(event.target.value)} placeholder={"C: p:1, t:1, k:1, th:1\nV: a:1, i:1, u:1"} /></label>
        <label className={styles.phase3Wide}><span>音节模板（每行“模板: 权重”）</span><textarea value={templatesText} onChange={(event) => setTemplatesText(event.target.value)} placeholder={"{C}{V}: 3\n{C}{V}{C}: 1"} /></label>
        <label><span>音节数量与权重</span><input value={syllableCountsText} onChange={(event) => setSyllableCountsText(event.target.value)} placeholder="1:1, 2:3, 3:1" /></label>
        <label><span>每个候选最大尝试次数</span><input type="number" min={1} max={10000} value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value))} /></label>
        <label className={styles.phase3Wide}><span>禁配正则（每行一条，可留空）</span><textarea value={forbiddenText} onChange={(event) => setForbiddenText(event.target.value)} placeholder={"(.)\\1\\1\n^[aeiou]"} /></label>
        <label className={styles.phase3Wide}><span>有序改写（每行“匹配式 =&gt; 替换式”，可留空）</span><textarea value={rewritesText} onChange={(event) => setRewritesText(event.target.value)} placeholder="aa => ā" /></label>
        <p className={styles.phase3Hint}>正式音系提供音位、音节模板和禁配；权重、音节数量与改写仍由当前造词配置控制。</p>
        <div className={styles.phase3Actions}>
          <button disabled={!phonologyApplication} onClick={() => void syncFromPhonology()}>从正式音系同步</button>
          {current && <button onClick={() => void deleteProfile()}>删除</button>}
          {current && <button onClick={() => void copyProfile()}>复制</button>}
          <button onClick={() => void saveProfile()}>验证并保存</button>
        </div>
      </div>
    </section>
    <section className={styles.surfacePanel}>
      <div className={styles.paneHeader}><strong>生成候选</strong><span>SplitMix64 v1</span></div>
      <div className={styles.phase3Form}>
        <label><span>概念表</span><select value={listKind} onChange={(event) => setListKind(event.target.value as typeof listKind)}><option value="swadesh-100">Swadesh 100（内置只读）</option><option value="swadesh-207">Swadesh 207（内置只读）</option><option value="custom">自定义</option></select></label>
        {listKind === "custom" && <>
          <label><span>已保存的概念表</span><select value={customListId} onChange={(event) => {
            const id = event.target.value;
            setCustomListId(id);
            const list = customLists.find((item) => item.id === id);
            if (list) { setCustomName(list.name); setCustom(list.concepts.map((item) => item.gloss).join("\n")); }
          }}><option value="">新建概念表</option>{customLists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>概念表名称</span><input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label>
          <label className={styles.phase3Wide}><span>自定义概念（每行一项）</span><textarea value={custom} onChange={(event) => setCustom(event.target.value)} /></label>
          <div className={styles.phase3Actions}><button onClick={() => void saveCustomList()}>保存自定义概念表</button></div>
        </>}
        <label><span>固定随机种子</span><input value={seed} inputMode="numeric" onChange={(event) => setSeed(event.target.value)} /></label>
        <label><span>每个概念的候选数</span><input type="number" min={1} max={10} value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
        {error && <p className={styles.lexemeError} role="alert">{error}</p>}
        <div className={styles.phase3Actions}>
          {busy && <button onClick={() => generationAbort.current?.abort()}>取消生成</button>}
          <button className={styles.primaryButton} disabled={busy} onClick={() => void generate()}>{busy ? "生成中…" : "生成新审核批次"}</button>
        </div>
      </div>
    </section>
  </div>;
}

function CandidateReview({
  application, batches, reload, onProjectChanged, onStatus,
}: {
  application: ProjectApplication; batches: GenerationBatch[]; reload: () => Promise<void>;
  onProjectChanged: (snapshot: ProjectSnapshot) => void; onStatus: (message: string) => void;
}) {
  const reviewable = batches;
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");
  const batch = reviewable.find((item) => item.id === batchId) ?? reviewable[0];
  const editableCandidates = batch?.candidates.filter((candidate) => candidate.status !== "committed") ?? [];
  const editable = editableCandidates.length > 0;
  const allAccepted = editable && editableCandidates.every((candidate) => candidate.status === "accepted");
  const update = async (candidateId: string, patch: Partial<GenerationBatch["candidates"][number]>) => {
    if (!batch) return;
    const candidate = batch.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    try {
      await application.saveGenerationCandidate(batch.id, { ...candidate, ...patch });
      await reload();
      notifyProject(application, onProjectChanged);
    } catch (reason) { setError(messageOf(reason)); }
  };
  const commit = async () => {
    if (!batch) return;
    try {
      await application.commitGenerationBatch(batch.id);
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus("已接受的候选已在一个事务中写入词典。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  const toggleAcceptAll = async () => {
    if (!batch || !editable) return;
    try {
      await application.saveGenerationCandidates(
        batch.id,
        editableCandidates.map((candidate) => ({
          ...candidate,
          status: allAccepted ? "pending" : "accepted",
        }))
      );
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus(allAccepted ? "已取消本批次的全部选择。" : "已接受所有尚未提交的候选。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  const dismiss = async () => {
    if (!batch) return;
    try {
      await application.dismissGenerationBatch(batch.id);
      setBatchId("");
      await reload();
      notifyProject(application, onProjectChanged);
      onStatus("候选列表已移除；正式词条和撤销记录不受影响。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  if (!batch) return <div className={styles.emptyState}><div><CheckIcon /></div><h2>没有待审核批次</h2><p>生成或派生候选后，它们会先进入这里，不会自动写入词典。</p></div>;
  return <section className={styles.surfacePanel}>
    <div className={`${styles.paneHeader} ${styles.candidateReviewHeader}`}>
      <select value={batch.id} onChange={(event) => setBatchId(event.target.value)}>{reviewable.map((item) => <option key={item.id} value={item.id}>{item.type === "basic" ? "基础造词" : "批量派生"} · {batchStatusLabel(item.status)} · {new Date(item.createdAt).toLocaleString()} · {item.seed}</option>)}</select>
      <button disabled={!editable} onClick={() => void toggleAcceptAll()}>{allAccepted ? "取消全选" : "全部接受"}</button>
      <button onClick={() => void dismiss()}>删除候选列表</button>
      <button className={styles.primaryButton} disabled={!editable || !batch.candidates.some((item) => item.status === "accepted" && !item.conflicts.length)} onClick={() => void commit()}>提交本次已接受项</button>
    </div>
    {batch.candidates.some((candidate) => candidate.status === "committed") && <p className={styles.phase3Notice}>已提交项已经进入词典；其余候选仍可继续审核并再次提交。每次提交都可在“批量记录”中单独撤销。</p>}
    {batch.status === "undone" && <p className={styles.phase3Notice}>本批次已撤销，原已提交候选已经恢复为待审核，可以重新选择后提交。</p>}
    <div className={styles.phase3Review}>
      {batch.candidates.map((candidate) => <article key={candidate.id} data-status={candidate.status}>
        <div><strong>{candidate.gloss}</strong><small>{candidate.conflicts.map((conflict) => conflict.message).join("；") || "无冲突"}</small></div>
        <input disabled={!editable || candidate.status === "committed"} aria-label={`${candidate.gloss} 的候选词形`} value={candidate.romanized} onChange={(event) => void update(candidate.id, { romanized: event.target.value })} />
        <input disabled={!editable || candidate.status === "committed"} aria-label={`${candidate.gloss} 的词性`} placeholder="词性" value={candidate.partOfSpeech} onChange={(event) => void update(candidate.id, { partOfSpeech: event.target.value })} />
        <CandidateButton disabled={!editable || candidate.status === "committed"} status="accepted" current={candidate.status} onClick={() => void update(candidate.id, { status: "accepted" })} />
        <CandidateButton disabled={!editable || candidate.status === "committed"} status="rejected" current={candidate.status} onClick={() => void update(candidate.id, { status: "rejected" })} />
      </article>)}
    </div>
    {error && <p className={styles.engineError} role="alert">{error}</p>}
  </section>;
}

function CandidateButton({ status, current, disabled, onClick }: { status: CandidateStatus; current: CandidateStatus; disabled?: boolean; onClick: () => void }) {
  return <button disabled={disabled} aria-pressed={current === status} data-active={current === status} onClick={onClick}>
    {status === "accepted" ? <><CheckIcon />接受</> : <><Cross2Icon />拒绝</>}
  </button>;
}

function OperationHistory({
  application, languageId, reload, onProjectChanged, onStatus,
}: {
  application: ProjectApplication; languageId: string; reload: () => Promise<void>;
  onProjectChanged: (snapshot: ProjectSnapshot) => void; onStatus: (message: string) => void;
}) {
  const [operations, setOperations] = useState<Awaited<ReturnType<ProjectApplication["listLexiconBatchOperations"]>>>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => setOperations(await application.listLexiconBatchOperations(languageId)), [application, languageId]);
  useEffect(() => { void load(); }, [load]);
  const undo = async (id: string) => {
    try {
      await application.undoLexiconBatchOperation(id);
      await Promise.all([load(), reload()]);
      notifyProject(application, onProjectChanged);
      onStatus("批量提交已安全撤销，候选恢复为待审核。");
      setError("");
    } catch (reason) { setError(messageOf(reason)); }
  };
  return <section className={styles.surfacePanel}>
    <div className={styles.paneHeader}><strong>最近批量操作</strong><button onClick={() => void load()}><ReloadIcon />刷新</button></div>
    <div className={styles.phase3List}>
      {operations.map((item) => <div className={styles.phase3Operation} key={item.id}><span><strong>{item.kind === "generation_commit" ? "造词提交" : "派生提交"}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><button disabled={Boolean(item.undoneAt)} onClick={() => void undo(item.id)}>{item.undoneAt ? "已撤销" : "撤销"}</button></div>)}
      {!operations.length && <p>还没有 Phase 3 批量提交记录。</p>}
    </div>
    {error && <p className={styles.engineError} role="alert">{error}</p>}
  </section>;
}

function WorkspaceTabs({ value, onChange, items }: { value: string; onChange: (value: string) => void; items: Array<[string, string]> }) {
  return <div className={styles.tabStrip} role="tablist">{items.map(([id, label]) => <button role="tab" aria-selected={value === id} data-active={value === id} key={id} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

function isMorphemeType(value: unknown): value is MorphemeType {
  return typeof value === "string" && value in typeLabels;
}

function newMorpheme(languageId: string): Morpheme {
  const now = new Date().toISOString();
  return { id: uuid(), languageId, form: "", type: "root", meaning: "", applicablePartOfSpeech: "", status: "draft", compositionRule: { mode: "none" }, notes: "", createdAt: now, updatedAt: now };
}

function notifyProject(application: ProjectApplication, callback: (snapshot: ProjectSnapshot) => void) {
  const snapshot = application.getSnapshot();
  if (snapshot) callback(snapshot);
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function batchStatusLabel(status: GenerationBatch["status"]): string {
  if (status === "committed") return "已提交";
  if (status === "undone") return "已撤销";
  return "待审核";
}

function formatCategories(config: WordGenerationConfig): string {
  const normalized = normalizeWordGenerationConfig(config);
  return normalized.categories
    .map((category) => `${category.name}: ${category.symbols.map((symbol) => `${symbol.value}:${symbol.weight}`).join(", ")}`)
    .join("\n");
}

function formatTemplates(config: WordGenerationConfig): string {
  return normalizeWordGenerationConfig(config).templates
    .map((template) => `${template.pattern}: ${template.weight}`).join("\n");
}

function formatSyllableCounts(config: WordGenerationConfig): string {
  return normalizeWordGenerationConfig(config).syllableCounts
    .map((item) => `${item.count}:${item.weight}`).join(", ");
}

function parseProfileFields(fields: {
  categoriesText: string;
  templatesText: string;
  syllableCountsText: string;
  forbiddenText: string;
  rewritesText: string;
  maxAttempts: number;
}): WordGenerationConfig {
  const categories = nonEmptyLines(fields.categoriesText).map((line, lineIndex) => {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`音位类别第 ${lineIndex + 1} 行缺少冒号。`);
    const name = line.slice(0, separator).trim();
    const symbols = line.slice(separator + 1).split(",").map((entry) => {
      const weighted = parseWeighted(entry, `音位类别 ${name}`);
      return { value: weighted.name, weight: weighted.weight };
    });
    return { name, symbols };
  });
  const templates = nonEmptyLines(fields.templatesText).map((line) => {
    const weighted = parseWeighted(line, "音节模板");
    return { pattern: weighted.name, weight: weighted.weight };
  });
  const syllableCounts = fields.syllableCountsText.split(",").filter((entry) => entry.trim()).map((entry) => {
    const weighted = parseWeighted(entry, "音节数量");
    const count = Number(weighted.name);
    if (!Number.isInteger(count) || count < 1) throw new Error("音节数量必须是正整数。");
    return { count, weight: weighted.weight };
  });
  const rewriteRules = nonEmptyLines(fields.rewritesText).map((line, lineIndex) => {
    const separator = line.indexOf("=>");
    if (separator < 0) throw new Error(`改写规则第 ${lineIndex + 1} 行缺少“=>”。`);
    return { pattern: line.slice(0, separator).trim(), replacement: line.slice(separator + 2).trim() };
  });
  if (!Number.isInteger(fields.maxAttempts) || fields.maxAttempts < 1 || fields.maxAttempts > 10_000) {
    throw new Error("最大尝试次数必须是 1 到 10000 的整数。");
  }
  return {
    categories,
    templates,
    syllableCounts,
    forbiddenPatterns: nonEmptyLines(fields.forbiddenText),
    rewriteRules,
    maxAttemptsPerCandidate: fields.maxAttempts,
  };
}

function parseWeighted(value: string, label: string): { name: string; weight: number } {
  const separator = value.lastIndexOf(":");
  if (separator < 1) throw new Error(`${label}缺少“:权重”。`);
  const name = value.slice(0, separator).trim();
  const weight = Number(value.slice(separator + 1).trim());
  if (!name || !Number.isInteger(weight) || weight < 1) {
    throw new Error(`${label}的名称不能为空，权重必须是正整数。`);
  }
  return { name, weight };
}

function nonEmptyLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

class DisabledWordGenerationEngine {
  getStatus = async () => ({ state: "stopped" as const, message: "无需引擎" });
  ensureReady = this.getStatus;
  validateProfile = async () => ({ valid: false, issues: [] });
  generate = async () => { throw new Error("此操作不需要造词引擎。"); };
}
