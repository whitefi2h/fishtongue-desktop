import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  SoundChangeRunResult,
  ValidationResult,
} from "@/fishtongue/application/ports/SoundChangeEngine";
import InflectionService from "@/fishtongue/application/services/InflectionService";
import SoundChangeService from "@/fishtongue/application/services/SoundChangeService";
import {
  Evolution,
  InflectionSystem,
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
}: {
  application: ProjectApplication;
  service?: SoundChangeService;
  languageId: string;
  live: boolean;
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
  const controller = useRef<AbortController>();

  useEffect(() => {
    setEvolution(null);
    setResult(undefined);
    setValidation(undefined);
    setError(undefined);
    setDirty(false);
    if (!enabled || !service) return;
    void Promise.all([
      application.getEvolution(languageId),
      application.listLexemes(languageId),
      service.getEngineStatus(),
    ])
      .then(([nextEvolution, lexemes, engine]) => {
        setEvolution(nextEvolution);
        setLexiconWords(lexemes.map((lexeme) => lexeme.romanized));
        setStatus(engine.message);
      })
      .catch((reason) => setError(errorMessage(reason)));
  }, [application, enabled, languageId, service]);

  useEffect(() => {
    if (!live || !dirty || !evolution) return;
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
  }, [application, dirty, evolution, live]);

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
}: {
  application: ProjectApplication;
  service?: InflectionService;
  languageId: string;
  live: boolean;
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
  const controller = useRef<AbortController>();

  useEffect(() => {
    setSystem(null);
    setOutputs([]);
    setDirty(false);
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
    if (!dirty || !system || !live) return;
    const timer = window.setTimeout(() => {
      void application.saveInflectionSystem(system)
        .then(() => {
          setDirty(false);
          setStatus("规则与测试词干已保存到项目");
        })
        .catch((reason) => setError(errorMessage(reason)));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [application, dirty, live, system]);

  if (!enabled || !service) return <EngineUnavailable kind="屈折" />;
  if (!system) return <div className={styles.engineEmpty}>正在加载屈折系统…</div>;

  const rules = createRules(mode, form, category);
  const testCases = parseTestCases(testText, system);
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
            setMode(next); updateDraft(next);
          }}><option value="fixed">固定词形</option><option value="stem">仅词干</option>
            <option value="prefix">前缀 + 词干</option><option value="suffix">词干 + 后缀</option>
            <option value="branch">类别分支</option></select></label>
          {mode !== "stem" && <label>{mode === "fixed" ? "固定输出" : "拼接形式"}
            <input value={form} onChange={(event) => { setForm(event.target.value); updateDraft(mode, event.target.value); }} />
          </label>}
          {mode === "branch" && <label>分支类别
            <input value={category} onChange={(event) => { setCategory(event.target.value); updateDraft(mode, form, event.target.value); }} />
          </label>}
          <pre className={styles.rulePreview}>{JSON.stringify(rules, null, 2)}</pre>
        </div>
      </div>
      <aside className={styles.conflictPane}>
        <h2>测试词干</h2>
        <label className={styles.engineField}>每行：词干 | 类别
          <textarea value={testText} placeholder={"ama | plural\nnor"} onChange={(event) => {
            setTestText(event.target.value); updateDraft(mode, form, category, event.target.value);
          }} />
        </label>
        <div className={styles.engineActions}><button className={styles.primaryButton} disabled={!testCases.length} onClick={() => void run()}>运行预览</button>
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
