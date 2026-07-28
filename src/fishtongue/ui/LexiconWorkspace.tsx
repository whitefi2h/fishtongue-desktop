import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import { Lexeme, Morpheme } from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import {
  Cross2Icon,
  DotsHorizontalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
}: {
  application: ProjectApplication;
  languageId: string;
  createRequest: number;
  onProjectChanged: (snapshot: ProjectSnapshot) => void;
  onStatus: (message: string) => void;
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
    setSelectedId(undefined);
    setDraft(emptyDraft);
    setMorphemeSearch("");
    setMorphemePickerOpen(false);
    setError(undefined);
  }, []);

  const reload = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const [next, nextMorphemes] = await Promise.all([
        application.listLexemes(languageId),
        application.listMorphemes(languageId),
      ]);
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
  }, [application, languageId, selectLexeme, startCreating]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (createRequest > 0) startCreating();
  }, [createRequest, startCreating]);

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
      await application.saveLexeme({
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
      });
      const snapshot = application.getSnapshot();
      if (snapshot) onProjectChanged(snapshot);
      await reload(id);
      onStatus(existing ? "词条修改已保存到项目。" : "新词条已保存到项目。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.id) return;
    setSaving(true);
    setError(undefined);
    try {
      await application.deleteLexeme(draft.id);
      const snapshot = application.getSnapshot();
      if (snapshot) onProjectChanged(snapshot);
      await reload();
      onStatus("词条已从项目中删除。");
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
        <span>当前语言 · 正式项目</span>
      </div>
      <div className={styles.filterGroup}>
        <strong>词义规则</strong>
        <span>每行保存为一个独立词义。</span>
      </div>
    </aside>

    <section className={styles.lexemeList}>
      <div className={styles.paneHeader}>
        <strong>{lexemes.length} 个词条</strong>
        <button data-create-lexeme onClick={startCreating}>
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
                  <td><strong>{lexeme.romanized}</strong></td>
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
        <span><strong>{draft.id ? draft.romanized || "未命名词条" : "新建词条"}</strong><small>{draft.id ? "编辑正式项目数据" : "至少填写一个词义"}</small></span>
        <span className={styles.lexemeHeaderActions}>
          <button aria-label="更多词条操作" disabled><DotsHorizontalIcon aria-hidden="true" /></button>
          <button className={styles.primaryButton} type="submit" form="lexeme-editor-form" disabled={saving}>{saving ? "保存中…" : "保存"}</button>
        </span>
      </div>
      <form id="lexeme-editor-form" className={styles.lexemeForm} onSubmit={(event) => void save(event)}>
        <div className={styles.lexemeFormFields}>
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
        {error && <p className={styles.lexemeError} role="alert">{error}</p>}
        </div>
        <div className={styles.lexemeFormActions}>
          <button type="button" onClick={startCreating}>清空</button>
          {draft.id && <button type="button" onClick={() => void remove()} disabled={saving}>删除</button>}
          <button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? "保存中…" : "保存词条"}</button>
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
