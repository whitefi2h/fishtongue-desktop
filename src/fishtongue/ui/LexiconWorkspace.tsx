import { ProjectApplication, ProjectSnapshot } from "@/fishtongue/application/ports/ProjectApplication";
import { Lexeme } from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import {
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
  partOfSpeech: string;
  senses: string;
}

const emptyDraft: LexemeDraft = {
  romanized: "",
  partOfSpeech: "未分类",
  senses: "",
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
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<LexemeDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const selectLexeme = useCallback((lexeme: Lexeme) => {
    setSelectedId(lexeme.id);
    setDraft({
      id: lexeme.id,
      createdAt: lexeme.createdAt,
      romanized: lexeme.romanized,
      partOfSpeech: lexeme.partOfSpeech,
      senses: [...lexeme.senses]
        .sort((left, right) => left.position - right.position)
        .map((sense) => sense.definition)
        .join("\n"),
    });
    setError(undefined);
  }, []);

  const startCreating = useCallback(() => {
    setSelectedId(undefined);
    setDraft(emptyDraft);
    setError(undefined);
  }, []);

  const reload = useCallback(async (preferredId?: string) => {
    setLoading(true);
    try {
      const next = await application.listLexemes(languageId);
      setLexemes(next);
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
        partOfSpeech: draft.partOfSpeech,
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
        senses: definitions.map((definition, position) => ({
          id: existing?.senses[position]?.id ?? uuid(),
          definition,
          position,
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
              <thead><tr><th>词形</th><th>核心释义</th><th>词性</th><th>词义数</th></tr></thead>
              <tbody>{filteredLexemes.map((lexeme) =>
                <tr key={lexeme.id} data-active={lexeme.id === selectedId}>
                  <td><button className={styles.textButton} aria-label={`选择词条 ${lexeme.romanized}`} onClick={() => selectLexeme(lexeme)}><strong>{lexeme.romanized}</strong></button></td>
                  <td>{lexeme.senses[0]?.definition}</td>
                  <td>{lexeme.partOfSpeech}</td>
                  <td>{lexeme.senses.length}</td>
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
        <button aria-label="更多词条操作" disabled><DotsHorizontalIcon aria-hidden="true" /></button>
      </div>
      <form className={styles.lexemeForm} onSubmit={(event) => void save(event)}>
        <label><span>词形</span><input name="lexeme-romanized" autoComplete="off" value={draft.romanized} onChange={(event) => setDraft((value) => ({ ...value, romanized: event.target.value }))} /></label>
        <label><span>词性</span><input name="lexeme-part-of-speech" autoComplete="off" value={draft.partOfSpeech} onChange={(event) => setDraft((value) => ({ ...value, partOfSpeech: event.target.value }))} /></label>
        <label><span>词义</span><textarea name="lexeme-senses" value={draft.senses} onChange={(event) => setDraft((value) => ({ ...value, senses: event.target.value }))} placeholder={"每行一个独立词义\n例如：海\n外海"} /></label>
        {error && <p className={styles.lexemeError} role="alert">{error}</p>}
        <div className={styles.lexemeFormActions}>
          <button type="button" onClick={startCreating}>清空</button>
          <button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? "保存中…" : "保存词条"}</button>
        </div>
      </form>
    </aside>
  </div>;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
