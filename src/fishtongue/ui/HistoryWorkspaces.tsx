import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import {
  EtymologyRelation,
  HistoricalEvent,
  Language,
  LanguageRelation,
  LanguageStage,
  StageContextRecord,
} from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/HistoryWorkspaces.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommonProps = {
  application: Phase5Application;
  languages: Language[];
  onChanged: () => void;
  onStatus: (message: string) => void;
};

export function StagesWorkspace(props: CommonProps & {
  languageId: string;
  selectedStageId?: string;
  onSelectStage: (stage?: LanguageStage) => void;
}) {
  const [stages, setStages] = useState<LanguageStage[]>([]);
  const [selectedId, setSelectedId] = useState(props.selectedStageId);
  const [draft, setDraft] = useState<LanguageStage>();
  const [context, setContext] = useState<StageContextRecord>();
  const selectedIdRef = useRef(props.selectedStageId);
  const onSelectStageRef = useRef(props.onSelectStage);
  onSelectStageRef.current = props.onSelectStage;

  const load = useCallback(async () => {
    const values = await props.application.listStages(props.languageId);
    setStages(values);
    const selected = values.find((value) => value.id === selectedIdRef.current) ??
      values.find((value) => value.visible) ?? values[0];
    selectedIdRef.current = selected?.id;
    setSelectedId(selected?.id);
    setDraft(selected);
    onSelectStageRef.current(selected);
    if (selected) {
      setContext(await props.application.getStageContext(selected.id) ?? {
        stageId: selected.id,
        background: "",
        evidenceNotes: "",
        sources: [],
        updatedAt: new Date().toISOString(),
      });
    }
  }, [props.application, props.languageId]);

  useEffect(() => { void load().catch(report(props.onStatus)); }, [load, props.onStatus]);

  const select = async (value: LanguageStage) => {
    setSelectedId(value.id);
    selectedIdRef.current = value.id;
    setDraft(value);
    props.onSelectStage(value);
    setContext(await props.application.getStageContext(value.id) ?? {
      stageId: value.id,
      background: "",
      evidenceNotes: "",
      sources: [],
      updatedAt: new Date().toISOString(),
    });
  };

  const create = () => {
    const now = new Date().toISOString();
    const base = stages.find((value) => value.id === selectedId) ??
      stages.find((value) => value.kind === "internal_default");
    const value: LanguageStage = {
      id: crypto.randomUUID(),
      languageId: props.languageId,
      name: "新阶段",
      kind: "historical_stage",
      documentationStatus: "partial",
      storageMode: "inherited_delta",
      chronologyParentId: base?.id,
      dataBaseStageId: base?.id,
      startLabel: "",
      endLabel: "",
      position: Math.max(0, ...stages.map((stage) => stage.position)) + 1,
      visible: true,
      createdAt: now,
      updatedAt: now,
    };
    setDraft(value);
    setSelectedId(value.id);
    selectedIdRef.current = value.id;
    setContext({
      stageId: value.id, background: "", evidenceNotes: "", sources: [], updatedAt: now,
    });
  };

  return <section className={styles.workspace}>
    <div className={styles.toolbar}>
      <span className={styles.muted}>阶段顺序与数据继承分别管理；编辑不会覆盖来源阶段。</span>
      <button className={styles.primary} onClick={create}>新建阶段</button>
    </div>
    <div className={styles.split}>
      <aside className={styles.list}>
        {stages.filter((value) => value.visible).map((value) =>
          <button key={value.id} className={styles.listButton}
            data-active={value.id === selectedId} onClick={() => void select(value)}>
            <i className={styles.dot} data-status={value.documentationStatus} />
            <span><strong>{value.name}</strong><small>{period(value)}</small></span>
          </button>)}
        {!stages.some((value) => value.visible) &&
          <div className={styles.empty}>尚未启用可见阶段<br />语言仍使用内部默认状态</div>}
      </aside>
      {draft ? <StageEditor
        value={draft}
        context={context}
        stages={stages}
        onChange={setDraft}
        onContext={setContext}
        onError={props.onStatus}
        onSave={async () => {
          if (!context) throw new Error("阶段说明仍在载入，请稍后再保存。");
          await props.application.saveStageWithContext(draft, context);
          props.onStatus("阶段已保存；来源阶段保持不变。");
          props.onChanged();
          await load();
        }}
        onDelete={draft.kind === "internal_default" ? undefined : async () => {
          await props.application.deleteStage(draft.id);
          props.onStatus("阶段已删除。");
          props.onChanged();
          await load();
        }}
      /> : <div className={styles.empty}>选择或新建一个阶段</div>}
    </div>
  </section>;
}

function StageEditor(props: {
  value: LanguageStage;
  context?: StageContextRecord;
  stages: LanguageStage[];
  onChange: (value: LanguageStage) => void;
  onContext: (value: StageContextRecord) => void;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const value = props.value;
  const set = <K extends keyof LanguageStage>(key: K, next: LanguageStage[K]) =>
    props.onChange({ ...value, [key]: next });
  const context = props.context;
  return <div className={styles.detail}>
    <div><h2>{value.name}</h2><span className={styles.badge}>{stageKind(value.kind)}</span></div>
    <div className={styles.formGrid}>
      <label className={styles.field}>名称
        <input value={value.name} disabled={value.kind === "internal_default"}
          onChange={(event) => set("name", event.target.value)} />
      </label>
      <label className={styles.field}>类型
        <select value={value.kind} disabled={value.kind === "internal_default"}
          onChange={(event) => set("kind", event.target.value as LanguageStage["kind"])}>
          <option value="historical_stage">历史阶段</option>
          <option value="lightweight_dialect">轻量方言</option>
          {value.kind === "internal_default" && <option value="internal_default">内部默认状态</option>}
        </select>
      </label>
      <label className={styles.field}>资料状态
        <select value={value.documentationStatus}
          onChange={(event) => {
            const next = event.target.value as LanguageStage["documentationStatus"];
            props.onChange({
              ...value,
              documentationStatus: next,
              storageMode: next === "unrecorded" ? "no_data" :
                value.storageMode === "no_data" ? "inherited_delta" : value.storageMode,
            });
          }}>
          <option value="recorded">有记录</option>
          <option value="partial">部分记录</option>
          <option value="unrecorded">无记录</option>
          <option value="reconstructed">重构</option>
        </select>
      </label>
      <label className={styles.field}>数据方式
        <select value={value.storageMode} disabled={value.documentationStatus === "unrecorded"}
          onChange={(event) => set("storageMode", event.target.value as LanguageStage["storageMode"])}>
          <option value="inherited_delta">继承 + 差异</option>
          <option value="independent_snapshot">独立快照</option>
          <option value="no_data">无数据</option>
        </select>
      </label>
      <label className={styles.field}>上一个时间阶段
        <select value={value.chronologyParentId ?? ""}
          onChange={(event) => set("chronologyParentId", event.target.value || undefined)}>
          <option value="">无</option>{stageOptions(props.stages, value.id)}
        </select>
      </label>
      <label className={styles.field}>数据基础
        <select value={value.dataBaseStageId ?? ""} disabled={value.storageMode === "no_data"}
          onChange={(event) => set("dataBaseStageId", event.target.value || undefined)}>
          <option value="">无</option>{stageOptions(props.stages, value.id)}
        </select>
      </label>
      <label className={styles.field}>起始年代
        <input value={value.startLabel} onChange={(event) => set("startLabel", event.target.value)} />
      </label>
      <label className={styles.field}>结束年代
        <input value={value.endLabel} onChange={(event) => set("endLabel", event.target.value)} />
      </label>
      {context && <>
        <label className={styles.field} data-wide>历史背景
          <textarea value={context.background}
            onChange={(event) => props.onContext({ ...context, background: event.target.value })} />
        </label>
        <label className={styles.field} data-wide>证据与说明
          <textarea value={context.evidenceNotes}
            onChange={(event) => props.onContext({ ...context, evidenceNotes: event.target.value })} />
        </label>
      </>}
    </div>
    {value.documentationStatus === "unrecorded" &&
      <div className={styles.notice}>无记录阶段只保存背景和关系，不会生成词典、音系或形态数据。</div>}
    <footer className={styles.footer}>
      {props.onDelete && <button className={styles.danger}
        onClick={() => void props.onDelete?.().catch(report(props.onError))}>删除阶段</button>}
      <button className={styles.primary}
        disabled={!context}
        onClick={() => void props.onSave().catch(report(props.onError))}>保存阶段</button>
    </footer>
  </div>;
}

export function DialectsWorkspace(props: CommonProps & { languageId: string }) {
  const [values, setValues] = useState<LanguageStage[]>([]);
  const load = useCallback(() => props.application.listStages(props.languageId)
    .then((stages) => setValues(stages.filter((stage) => stage.kind === "lightweight_dialect"))),
  [props.application, props.languageId]);
  useEffect(() => { void load().catch(report(props.onStatus)); }, [load, props.onStatus]);
  return <section className={styles.workspace}>
    <div className={styles.toolbar}>
      <span className={styles.muted}>轻量方言继承基础阶段，只保存差异；不会自动变成独立语言。</span>
      <button className={styles.primary} onClick={() => {
        const now = new Date().toISOString();
        void props.application.listStages(props.languageId).then(async (stages) => {
          const base = stages.find((value) => value.kind === "internal_default");
          await props.application.saveStage({
            id: crypto.randomUUID(), languageId: props.languageId, name: "新方言",
            kind: "lightweight_dialect", documentationStatus: "partial",
            storageMode: "inherited_delta", chronologyParentId: base?.id,
            dataBaseStageId: base?.id, startLabel: "", endLabel: "",
            position: Math.max(0, ...stages.map((stage) => stage.position)) + 1,
            visible: true, createdAt: now, updatedAt: now,
          });
          props.onChanged(); await load();
        }).catch(report(props.onStatus));
      }}>新建轻量方言</button>
    </div>
    {values.length ? <table className={styles.dataTable}><thead><tr>
      <th>方言</th><th>资料状态</th><th>数据方式</th><th>年代</th>
    </tr></thead><tbody>{values.map((value) => <tr key={value.id}>
      <td><strong>{value.name}</strong></td><td>{documentation(value.documentationStatus)}</td>
      <td>继承 + 差异</td><td>{period(value)}</td>
    </tr>)}</tbody></table> : <div className={styles.empty}>尚未创建轻量方言</div>}
  </section>;
}

export function GenealogyWorkspace(props: CommonProps) {
  const [relations, setRelations] = useState<LanguageRelation[]>([]);
  const [source, setSource] = useState(props.languages[0]?.id ?? "");
  const [target, setTarget] = useState(props.languages[1]?.id ?? "");
  const load = useCallback(
    () => props.application.listLanguageRelations().then(setRelations),
    [props.application]
  );
  useEffect(() => { void load().catch(report(props.onStatus)); }, [load, props.onStatus]);
  const names = useMemo(() => new Map(props.languages.map((value) => [value.id, value.name])), [props.languages]);
  return <section className={styles.workspace}>
    <div className={styles.notice}>项目允许多个根语言。遗传父级最多一个；接触和借词关系不会被误画成继承。</div>
    <div className={styles.tree}>
      {relations.length ? relations.map((value) => <div className={styles.treeRow} key={value.id}>
        <div className={styles.treeNode}>{names.get(value.sourceLanguageId) ?? "已删除语言"}</div>
        <span>→</span>
        <div className={styles.treeNode}>{names.get(value.targetLanguageId) ?? "已删除语言"}</div>
        <span className={styles.badge}>{relationKind(value.kind)}</span>
        <button className={styles.danger} onClick={() => {
          void props.application.deleteLanguageRelation(value.id)
            .then(() => { props.onChanged(); return load(); })
            .catch(report(props.onStatus));
        }}>删除</button>
      </div>) : <div className={styles.empty}>尚未建立语言关系；所有语言目前都是根节点。</div>}
    </div>
    <div className={styles.formGrid}>
      <label className={styles.field}>来源语言<select value={source} onChange={(event) => setSource(event.target.value)}>
        {languageOptions(props.languages)}
      </select></label>
      <label className={styles.field}>目标语言<select value={target} onChange={(event) => setTarget(event.target.value)}>
        {languageOptions(props.languages)}
      </select></label>
    </div>
    <footer className={styles.footer}><button className={styles.primary} disabled={!source || !target}
      onClick={() => {
        const now = new Date().toISOString();
        void props.application.saveLanguageRelation({
          id: crypto.randomUUID(), projectId: "", sourceLanguageId: source,
          targetLanguageId: target, kind: "genetic", isPrimary: true,
          confidence: "confirmed", notes: "", createdAt: now, updatedAt: now,
        }).then(() => { props.onChanged(); return load(); })
          .catch(report(props.onStatus));
      }}>建立主要继承关系</button></footer>
  </section>;
}

export function EventsWorkspace(props: CommonProps) {
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<HistoricalEvent["eventType"]>("migration");
  const load = useCallback(
    () => props.application.listHistoricalEvents().then(setEvents),
    [props.application]
  );
  useEffect(() => { void load().catch(report(props.onStatus)); }, [load, props.onStatus]);
  return <section className={styles.workspace}>
    <table className={styles.dataTable}><thead><tr>
      <th>事件</th><th>类型</th><th>年代</th><th>参与语言</th><th />
    </tr></thead><tbody>{events.map((value) => <tr key={value.id}>
      <td><strong>{value.name}</strong></td><td>{eventType(value.eventType)}</td>
      <td>{value.startLabel || "未设置"}</td><td>{value.participants.length}</td>
      <td><button className={styles.danger} onClick={() => {
        void props.application.deleteHistoricalEvent(value.id)
          .then(() => { props.onChanged(); return load(); })
          .catch(report(props.onStatus));
      }}>删除</button></td>
    </tr>)}</tbody></table>
    <div className={styles.formGrid}>
      <label className={styles.field}>事件名称<input value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className={styles.field}>类型<select value={type}
        onChange={(event) => setType(event.target.value as HistoricalEvent["eventType"])}>
        <option value="migration">迁徙</option><option value="contact">语言接触</option>
        <option value="split">分化</option><option value="standardization">标准化</option>
        <option value="political">政治</option><option value="cultural">文化</option>
        <option value="other">其他</option>
      </select></label>
    </div>
    <footer className={styles.footer}><button className={styles.primary} disabled={!name.trim()}
      onClick={() => {
        const snapshot = props.languages;
        const now = new Date().toISOString();
        void props.application.saveHistoricalEvent({
          id: crypto.randomUUID(), projectId: "", name, eventType: type,
          startLabel: "", endLabel: "", description: "",
          position: events.length, createdAt: now, updatedAt: now,
          participants: snapshot[0] ? [{ languageId: snapshot[0].id, role: "", notes: "" }] : [],
        }).then(() => { setName(""); props.onChanged(); return load(); })
          .catch(report(props.onStatus));
      }}>添加事件</button></footer>
  </section>;
}

export function EtymologyWorkspace(props: CommonProps & {
  project: ProjectApplication;
}) {
  const [relations, setRelations] = useState<EtymologyRelation[]>([]);
  const [lexemes, setLexemes] = useState<Array<{
    id: string; label: string; languageId: string;
  }>>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [sourceForm, setSourceForm] = useState("");
  const [kind, setKind] = useState<EtymologyRelation["kind"]>("inheritance");
  const load = useCallback(async () => {
    const [nextRelations, languageLexemes] = await Promise.all([
      props.application.listEtymologyRelations(),
      Promise.all(props.languages.map(async (language) => ({
        language,
        values: await props.project.listLexemes(language.id),
      }))),
    ]);
    setRelations(nextRelations);
    const flat = languageLexemes.flatMap(({ language, values }) =>
      values.map((value) => ({
        id: value.id,
        languageId: language.id,
        label: `${value.romanized} · ${value.senses[0]?.definition ?? "无释义"} (${language.name})`,
      }))
    );
    setLexemes(flat);
    setTargetId((current) => current || flat[0]?.id || "");
  }, [props.application, props.languages, props.project]);
  useEffect(() => { void load().catch(report(props.onStatus)); }, [load, props.onStatus]);
  const labels = useMemo(() => new Map(lexemes.map((value) => [value.id, value.label])), [lexemes]);

  return <section className={styles.workspace}>
    <div className={styles.notice}>
      词源关系只记录可追踪证据，不会自动改写词形。未知来源可以只填写来源形式。
    </div>
    <table className={styles.dataTable}><thead><tr>
      <th>来源</th><th>关系</th><th>目标</th><th>可信度</th><th />
    </tr></thead><tbody>{relations.map((value) => <tr key={value.id}>
      <td>{value.sourceLexemeId ? labels.get(value.sourceLexemeId) : value.sourceForm || "未知来源"}</td>
      <td>{etymologyKind(value.kind)}</td>
      <td>{labels.get(value.targetLexemeId) ?? "已删除词条"}</td>
      <td>{confidence(value.confidence)}</td>
      <td><button className={styles.danger} onClick={() => {
        void props.application.deleteEtymologyRelation(value.id)
          .then(() => { props.onChanged(); return load(); })
          .catch(report(props.onStatus));
      }}>删除</button></td>
    </tr>)}</tbody></table>
    <div className={styles.formGrid}>
      <label className={styles.field}>来源词条（可选）
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          <option value="">未知或项目外来源</option>
          {lexemes.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>目标词条
        <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
          {lexemes.map((value) => <option key={value.id} value={value.id}>{value.label}</option>)}
        </select>
      </label>
      <label className={styles.field}>关系类型
        <select value={kind}
          onChange={(event) => setKind(event.target.value as EtymologyRelation["kind"])}>
          <option value="inheritance">继承</option><option value="borrowing">借入</option>
          <option value="cognate">同源</option><option value="derivation">派生</option>
          <option value="calque">仿译</option><option value="unknown">未知</option>
        </select>
      </label>
      <label className={styles.field}>来源形式
        <input value={sourceForm} onChange={(event) => setSourceForm(event.target.value)}
          placeholder="来源词不在项目中时填写" />
      </label>
    </div>
    <footer className={styles.footer}><button className={styles.primary}
      disabled={!targetId || sourceId === targetId}
      onClick={() => {
        const now = new Date().toISOString();
        void props.application.saveEtymologyRelation({
          id: crypto.randomUUID(), projectId: "",
          sourceLexemeId: sourceId || undefined, targetLexemeId: targetId,
          kind, sourceForm, confidence: "confirmed", notes: "",
          createdAt: now, updatedAt: now,
        }).then(() => {
          setSourceId(""); setSourceForm(""); props.onChanged(); return load();
        }).catch(report(props.onStatus));
      }}>保存词源关系</button></footer>
  </section>;
}

function stageOptions(stages: LanguageStage[], excludedId: string) {
  return stages.filter((stage) => stage.id !== excludedId)
    .map((stage) => <option value={stage.id} key={stage.id}>{stage.name}</option>);
}
function languageOptions(languages: Language[]) {
  return languages.map((value) => <option key={value.id} value={value.id}>{value.name}</option>);
}
function period(stage: LanguageStage) {
  return [stage.startLabel, stage.endLabel].filter(Boolean).join("—") || "年代未设置";
}
function stageKind(value: LanguageStage["kind"]) {
  return value === "historical_stage" ? "历史阶段" :
    value === "lightweight_dialect" ? "轻量方言" : "内部默认状态";
}
function documentation(value: LanguageStage["documentationStatus"]) {
  return value === "recorded" ? "有记录" : value === "partial" ? "部分记录" :
    value === "unrecorded" ? "无记录" : "重构";
}
function relationKind(value: LanguageRelation["kind"]) {
  return value === "genetic" ? "继承" : value === "contact" ? "接触" : "方言";
}
function eventType(value: HistoricalEvent["eventType"]) {
  return value === "migration" ? "迁徙" : value === "contact" ? "接触" :
    value === "split" ? "分化" : value === "standardization" ? "标准化" :
    value === "political" ? "政治" : value === "cultural" ? "文化" : "其他";
}
function etymologyKind(value: EtymologyRelation["kind"]) {
  return value === "inheritance" ? "继承" : value === "borrowing" ? "借入" :
    value === "cognate" ? "同源" : value === "derivation" ? "派生" :
    value === "calque" ? "仿译" : "未知";
}
function confidence(value: EtymologyRelation["confidence"]) {
  return value === "confirmed" ? "已确认" : value === "probable" ? "较可能" :
    value === "possible" ? "可能" : "有争议";
}
function report(onStatus: (message: string) => void) {
  return (reason: unknown) => onStatus(
    reason instanceof Error ? reason.message : String(reason)
  );
}
