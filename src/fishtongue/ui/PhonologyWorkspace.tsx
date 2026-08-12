import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import {
  Phoneme,
  PhonemeClass,
  PhonologyProfile,
} from "@/fishtongue/domain/models";
import {
  PlusIcon,
  QuestionMarkCircledIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./PhonologyWorkspace.module.css";

type Tab = "inventory" | "phonotactics" | "prosody" | "check";
type SaveState = "saved" | "dirty" | "saving" | "invalid" | "error";
type IpaCheckRow = {
  input: string;
  ipaValid?: boolean;
  phonotacticsValid?: boolean;
  segments?: string[];
  unknown?: string[];
  phonotacticsWarnings?: string[];
  error?: string;
};

export default function PhonologyWorkspace({
  application,
  languageId,
  stageId,
  onStatus,
}: {
  application: Phase6Application;
  languageId: string;
  stageId?: string;
  onStatus: (message: string) => void;
}) {
  const [profile, setProfile] = useState<PhonologyProfile | null>(null);
  const [tab, setTab] = useState<Tab>("inventory");
  const [testIpa, setTestIpa] = useState("");
  const [checkResults, setCheckResults] = useState<IpaCheckRow[]>([]);
  const [checkBusy, setCheckBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [help, setHelp] = useState(false);
  const [activePhonemeId, setActivePhonemeId] = useState<string>();

  useEffect(() => {
    let active = true;
    void application
      .getPhonology(languageId, stageId)
      .then((value) => {
        if (!active) return;
        revisionRef.current = 0;
        setRevision(0);
        setSaveState("saved");
        setProfile(value);
      });
    return () => {
      active = false;
    };
  }, [application, languageId, stageId]);

  useEffect(() => {
    if (!profile || revision === 0) return;
    const currentRevision = revision;
    setSaveState("dirty");
    const timer = window.setTimeout(() => {
      if (profile.phonemes.some((value) => !value.ipa.trim())) {
        setSaveState("invalid");
        return;
      }
      if (
        profile.phonemes.some(
          (value) => value.role === "allophone" && !value.parentPhonemeId
        )
      ) {
        setSaveState("invalid");
        return;
      }
      setSaveState("saving");
      void application
        .savePhonology(profile, stageId)
        .then(() => {
          if (revisionRef.current === currentRevision) setSaveState("saved");
        })
        .catch((error) => {
          setSaveState("error");
          onStatus(error instanceof Error ? error.message : "音系自动保存失败。");
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [application, onStatus, profile, revision, stageId]);

  const grouped = useMemo(() => {
    const values = profile?.phonemes ?? [];
    return {
      consonant: values.filter((value) => value.category === "consonant"),
      vowel: values.filter((value) => value.category === "vowel"),
      other: values.filter(
        (value) => !["consonant", "vowel"].includes(value.category)
      ),
    };
  }, [profile]);

  if (!profile) return <div className={styles.loading}>正在加载正式音系…</div>;

  const update = (patch: Partial<PhonologyProfile>) => {
    setProfile((current) => (current ? { ...current, ...patch } : current));
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  };
  const addPhoneme = () => {
    const phoneme: Phoneme = {
      id: crypto.randomUUID(),
      profileId: profile.id,
      ipa: "",
      displaySymbol: "",
      category: "consonant",
      role: "phoneme",
      distribution: "",
      source: "manual",
      notes: "",
      position: profile.phonemes.length,
    };
    update({ phonemes: [...profile.phonemes, phoneme] });
  };
  const updatePhoneme = (id: string, patch: Partial<Phoneme>) =>
    update({
      phonemes: profile.phonemes.map((value) =>
        value.id === id ? { ...value, ...patch } : value
      ),
    });
  const check = async () => {
    const inputs = testIpa
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 500);
    if (!inputs.length) return;
    setCheckBusy(true);
    setCheckResults([]);
    const rows: IpaCheckRow[] = [];
    for (const input of inputs) {
      try {
        const result = await application.validateIpa(input);
        const phonotactics = result.valid
          ? application.validatePhonotactics(input, profile)
          : undefined;
        rows.push({
          input,
          ipaValid: result.valid,
          phonotacticsValid: phonotactics?.valid,
          segments: result.segments,
          unknown: result.unknown.map((value) => value.symbol),
          phonotacticsWarnings: phonotactics?.warnings,
        });
      } catch (error) {
        rows.push({
          input,
          error: error instanceof Error ? error.message : "IPA 检查失败。",
        });
      }
      setCheckResults([...rows]);
    }
    setCheckBusy(false);
  };

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <strong>正式音系</strong>
          <span>{profile.phonemes.length} 个音位</span>
          <span className={styles.saveState} data-state={saveState}>
            {saveState === "saved" && "已自动保存"}
            {saveState === "dirty" && "等待自动保存"}
            {saveState === "saving" && "正在保存…"}
            {saveState === "invalid" && "请补全必填项"}
            {saveState === "error" && "自动保存失败"}
          </span>
        </div>
        <button
          className={styles.helpButton}
          aria-label="音系帮助"
          onClick={() => setHelp((value) => !value)}
        >
          <QuestionMarkCircledIcon />
        </button>
        {help && (
          <aside className={styles.help}>
            这里保存语言的正式音位、音位变体、音位配列及韵律规则。借词分析只读取已经保存的音系。
          </aside>
        )}
      </header>
      <nav className={styles.tabs} aria-label="音系工作区" role="tablist">
        {(
          [
            ["inventory", "音位表"],
            ["phonotactics", "音节与音位配列"],
            ["prosody", "重音与声调"],
            ["check", "检查"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "inventory" && (
        <section className={styles.panel}>
          <header>
            <strong>音位</strong>
            <span className={styles.inventoryActions}>
              <IpaPicker
                onSelect={(symbol) => {
                  if (!activePhonemeId) {
                    onStatus("请先点选一个 IPA 输入框。");
                    return;
                  }
                  const current = profile.phonemes.find(
                    (value) => value.id === activePhonemeId
                  );
                  if (current)
                    updatePhoneme(current.id, {
                      ipa: `${current.ipa}${symbol}`,
                    });
                }}
              />
              <button className={styles.secondaryButton} onClick={addPhoneme}>
                <PlusIcon />
                添加音位
              </button>
            </span>
          </header>
          <div className={styles.table} role="table">
            <div className={styles.tableHead} role="row">
              <span>IPA</span>
              <span>显示符号</span>
              <span>类别</span>
              <span>角色</span>
              <span>所属音位</span>
              <span>分布 / 条件</span>
              <span>备注</span>
              <span />
            </div>
            {profile.phonemes.map((phoneme) => (
              <div key={phoneme.id} role="row">
                <input
                  aria-label="IPA"
                  value={phoneme.ipa}
                  onFocus={() => setActivePhonemeId(phoneme.id)}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, { ipa: event.target.value })
                  }
                />
                <input
                  aria-label="显示符号"
                  value={phoneme.displaySymbol}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, {
                      displaySymbol: event.target.value,
                    })
                  }
                />
                <select
                  aria-label="类别"
                  value={phoneme.category}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, {
                      category: event.target.value as PhonemeClass,
                    })
                  }
                >
                  <option value="consonant">辅音</option>
                  <option value="vowel">元音</option>
                  <option value="suprasegmental">超音段</option>
                  <option value="other">其他</option>
                </select>
                <select
                  aria-label="角色"
                  value={phoneme.role}
                  onChange={(event) => {
                    const role = event.target.value as Phoneme["role"];
                    updatePhoneme(phoneme.id, {
                      role,
                      parentPhonemeId:
                        role === "phoneme"
                          ? undefined
                          : phoneme.parentPhonemeId,
                    });
                  }}
                >
                  <option value="phoneme">音位</option>
                  <option value="allophone">音位变体</option>
                </select>
                <select
                  aria-label="所属音位"
                  disabled={phoneme.role !== "allophone"}
                  value={phoneme.parentPhonemeId ?? ""}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, {
                      parentPhonemeId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">请选择</option>
                  {profile.phonemes
                    .filter(
                      (value) =>
                        value.role === "phoneme" && value.id !== phoneme.id
                    )
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.ipa || value.displaySymbol || "未命名音位"}
                      </option>
                    ))}
                </select>
                <input
                  aria-label="分布"
                  value={phoneme.distribution}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, {
                      distribution: event.target.value,
                    })
                  }
                />
                <input
                  aria-label="备注"
                  value={phoneme.notes}
                  onChange={(event) =>
                    updatePhoneme(phoneme.id, { notes: event.target.value })
                  }
                />
                <button
                  className={styles.iconButton}
                  aria-label="删除音位"
                  onClick={() =>
                    update({
                      phonemes: profile.phonemes.filter(
                        (value) =>
                          value.id !== phoneme.id &&
                          value.parentPhonemeId !== phoneme.id
                      ),
                    })
                  }
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
            {profile.phonemes.length === 0 && (
              <p className={styles.empty}>
                尚未建立音位。添加后才能运行正式借词分析。
              </p>
            )}
          </div>
          <footer className={styles.summary}>
            <span>辅音 {grouped.consonant.length}</span>
            <span>元音 {grouped.vowel.length}</span>
            <span>其他 {grouped.other.length}</span>
          </footer>
        </section>
      )}

      {tab === "phonotactics" && (
        <section className={styles.formPanel}>
          <TextList
            key={`${profile.id}-syllable-templates`}
            label="音节模板"
            value={profile.syllableTemplates}
            onChange={(value) => update({ syllableTemplates: value })}
            placeholder="例如：CV、CVC"
          />
          <TextList
            key={`${profile.id}-legal-onsets`}
            label="合法声母"
            value={profile.legalOnsets}
            onChange={(value) => update({ legalOnsets: value })}
          />
          <TextList
            key={`${profile.id}-legal-nuclei`}
            label="合法韵核"
            value={profile.legalNuclei}
            onChange={(value) => update({ legalNuclei: value })}
          />
          <TextList
            key={`${profile.id}-legal-codas`}
            label="合法韵尾"
            value={profile.legalCodas}
            onChange={(value) => update({ legalCodas: value })}
          />
          <TextList
            key={`${profile.id}-legal-clusters`}
            label="合法音丛"
            value={profile.legalClusters}
            onChange={(value) => update({ legalClusters: value })}
          />
          <TextList
            key={`${profile.id}-forbidden-patterns`}
            label="禁配（每行一个正则表达式）"
            value={profile.forbiddenPatterns}
            onChange={(value) => update({ forbiddenPatterns: value })}
            wide
          />
        </section>
      )}

      {tab === "prosody" && (
        <section className={styles.formPanel}>
          <JsonField
            label="重音规则 JSON"
            value={profile.stressRules}
            onChange={(value) => update({ stressRules: value })}
          />
          <JsonField
            label="声调规则 JSON"
            value={profile.toneRules}
            onChange={(value) => update({ toneRules: value })}
          />
        </section>
      )}

      {tab === "check" && (
        <section className={styles.checkPanel}>
          <label>
            <span>IPA 列表（每行一项，最多 500 项）</span>
            <textarea
              value={testIpa}
              onChange={(event) => setTestIpa(event.target.value)}
              placeholder={"例如：\ntʰaŋ\nsal\npitoka"}
            />
          </label>
          <button
            className={styles.primaryButton}
            disabled={checkBusy || !testIpa.trim()}
            onClick={() => void check()}
          >
            {checkBusy ? "正在检查…" : "检查列表"}
          </button>
          {checkResults.length > 0 && (
            <div className={styles.checkResults} role="table" aria-label="IPA 检查结果">
              <div className={styles.checkResultHead} role="row">
                <span>输入</span>
                <span>IPA 识别</span>
                <span>本语言配列</span>
                <span>音段 / 问题</span>
              </div>
              {checkResults.map((result, index) => (
                <div key={`${result.input}-${index}`} role="row">
                  <strong>{result.input}</strong>
                  <span data-valid={result.ipaValid === true}>
                    {result.error ? "失败" : result.ipaValid ? "已识别" : "含未知符号"}
                  </span>
                  <span data-valid={result.phonotacticsValid === true}>
                    {result.error
                      ? "未检查"
                      : !result.ipaValid
                        ? "未检查"
                        : result.phonotacticsValid
                          ? "符合"
                          : "不符合"}
                  </span>
                  <span>
                    {result.error ??
                      (!result.ipaValid
                        ? result.unknown?.join("、")
                        : [
                            result.segments?.join(" · "),
                            ...(result.phonotacticsWarnings ?? []),
                          ]
                            .filter(Boolean)
                            .join("；"))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TextList({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <label className={styles.field} data-wide={wide}>
      <span>{label}</span>
      <textarea
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          onChange(
            next
              .split(/\r?\n/)
              .map((item) => item.trim())
              .filter(Boolean)
          );
        }}
      />
    </label>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value));
          } catch {}
        }}
      />
    </label>
  );
}

function IpaPicker({ onSelect }: { onSelect: (symbol: string) => void }) {
  const symbols = [
    "p",
    "b",
    "t",
    "d",
    "k",
    "g",
    "m",
    "n",
    "ŋ",
    "f",
    "v",
    "s",
    "z",
    "ʃ",
    "ʒ",
    "x",
    "h",
    "l",
    "r",
    "ɾ",
    "j",
    "w",
    "i",
    "ɪ",
    "e",
    "ɛ",
    "a",
    "ɑ",
    "ɔ",
    "o",
    "ʊ",
    "u",
    "ə",
    "ʌ",
    "y",
    "ø",
    "œ",
    "ɯ",
    "ɨ",
    "ʔ",
    "ː",
    "ˈ",
    "ˌ",
    "ʰ",
    "ʲ",
    "ʷ",
    "̃",
  ];
  return (
    <details className={styles.ipaPicker}>
      <summary>IPA 选择器</summary>
      <div>
        {symbols.map((symbol) => (
          <button key={symbol} type="button" onClick={() => onSelect(symbol)}>
            {symbol}
          </button>
        ))}
      </div>
    </details>
  );
}
