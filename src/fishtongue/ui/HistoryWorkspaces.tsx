import { Phase5Application } from "@/fishtongue/application/ports/Phase5Application";
import { Phase6Application } from "@/fishtongue/application/ports/Phase6Application";
import { ProjectApplication } from "@/fishtongue/application/ports/ProjectApplication";
import { AiProposalDraft } from "@/fishtongue/application/ports/AiPorts";
import {
  EtymologyRelation,
  BorrowingBatch,
  BorrowingCandidate,
  BorrowingProfile,
  HistoricalEvent,
  Language,
  LanguageProfile,
  LanguageRelation,
  LanguageStage,
  Lexeme,
  StageContextRecord,
} from "@/fishtongue/domain/models";
import GenealogyCanvas from "@/fishtongue/ui/GenealogyCanvas";
import styles from "@/fishtongue/ui/HistoryWorkspaces.module.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CommonProps = {
  application: Phase5Application;
  languages: Language[];
  onChanged: () => void;
  onStatus: (message: string) => void;
};

type StageWorkspaceProps = CommonProps & {
  languageId: string;
  selectedStageId?: string;
  onSelectStage?: (stage?: LanguageStage) => void;
};

export function StagesWorkspace(props: StageWorkspaceProps) {
  return <StageManager {...props} kind="historical_stage" />;
}

export function DialectsWorkspace(props: CommonProps & { languageId: string }) {
  return <StageManager {...props} kind="lightweight_dialect" />;
}

function StageManager(
  props: StageWorkspaceProps & {
    kind: "historical_stage" | "lightweight_dialect";
  }
) {
  const [stages, setStages] = useState<LanguageStage[]>([]);
  const [selectedId, setSelectedId] = useState(props.selectedStageId);
  const [draft, setDraft] = useState<LanguageStage>();
  const [context, setContext] = useState<StageContextRecord>();
  const [saving, setSaving] = useState(false);
  const selectedIdRef = useRef(props.selectedStageId);
  const draftRef = useRef<LanguageStage>();
  const onSelectStageRef = useRef(props.onSelectStage);
  onSelectStageRef.current = props.onSelectStage;

  const values = useMemo(
    () => stages.filter((stage) => stage.visible && stage.kind === props.kind),
    [props.kind, stages]
  );
  const hasUnsavedDraft = Boolean(
    draft && !stages.some((stage) => stage.id === draft.id)
  );

  const load = useCallback(
    async (preferredId?: string) => {
      const nextStages = await props.application.listStages(props.languageId);
      setStages(nextStages);
      if (
        !preferredId &&
        draftRef.current &&
        !nextStages.some((stage) => stage.id === draftRef.current?.id)
      ) {
        return;
      }
      const nextId = preferredId ?? selectedIdRef.current;
      const selected =
        nextStages.find((stage) => stage.id === nextId) ??
        nextStages.find((stage) => stage.visible && stage.kind === props.kind);
      if (!selected) {
        setSelectedId(undefined);
        selectedIdRef.current = undefined;
        setDraft(undefined);
        draftRef.current = undefined;
        setContext(undefined);
        onSelectStageRef.current?.(undefined);
        return;
      }
      selectedIdRef.current = selected.id;
      setSelectedId(selected.id);
      setDraft(selected);
      draftRef.current = selected;
      onSelectStageRef.current?.(selected);
      setContext(await readStageContext(props.application, selected));
    },
    [props.application, props.kind, props.languageId]
  );

  useEffect(() => {
    void load().catch(report(props.onStatus));
  }, [load, props.onStatus]);

  const select = async (stage: LanguageStage) => {
    selectedIdRef.current = stage.id;
    setSelectedId(stage.id);
    setDraft(stage);
    draftRef.current = stage;
    setContext(await readStageContext(props.application, stage));
    props.onSelectStage?.(stage);
  };

  const create = () => {
    const now = new Date().toISOString();
    const base =
      stages.find(
        (stage) => stage.id === selectedId && stage.storageMode !== "no_data"
      ) ?? stages.find((stage) => stage.kind === "internal_default");
    const next: LanguageStage = {
      id: crypto.randomUUID(),
      languageId: props.languageId,
      name: props.kind === "historical_stage" ? "未命名阶段" : "未命名方言",
      kind: props.kind,
      documentationStatus: "partial",
      storageMode: "inherited_delta",
      chronologyParentId:
        props.kind === "historical_stage" ? base?.id : undefined,
      dataBaseStageId: base?.id,
      startLabel: "",
      endLabel: "",
      position: Math.max(0, ...stages.map((stage) => stage.position)) + 1,
      visible: true,
      createdAt: now,
      updatedAt: now,
    };
    selectedIdRef.current = next.id;
    setSelectedId(next.id);
    setDraft(next);
    draftRef.current = next;
    setContext(emptyStageContext(next.id));
  };

  const save = async () => {
    if (!draft || !context) return;
    setSaving(true);
    try {
      await props.application.saveStageWithContext(draft, context);
      await load(draft.id);
      props.onChanged();
      props.onStatus(
        `${props.kind === "historical_stage" ? "阶段" : "方言"}已保存。`
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft) return;
    await props.application.deleteStage(draft.id);
    selectedIdRef.current = undefined;
    draftRef.current = undefined;
    await load();
    props.onChanged();
    props.onStatus(
      `${props.kind === "historical_stage" ? "阶段" : "方言"}已删除。`
    );
  };

  const title = props.kind === "historical_stage" ? "历史阶段" : "轻量方言";
  return (
    <section className={styles.workspace}>
      <div className={styles.sectionToolbar}>
        <button
          className={styles.primaryButton}
          onClick={create}
          disabled={hasUnsavedDraft}
          title={hasUnsavedDraft ? "请先保存或删除当前草稿" : undefined}
        >
          {hasUnsavedDraft
            ? "请先处理当前草稿"
            : `新建${props.kind === "historical_stage" ? "阶段" : "方言"}`}
        </button>
      </div>
      <div className={styles.masterDetail}>
        <aside className={styles.masterPane} aria-label={`${title}列表`}>
          <div className={styles.masterSummary}>
            {values.length} 个{title}
          </div>
          {values.map((stage) => (
            <button
              key={stage.id}
              className={styles.stageItem}
              data-active={stage.id === selectedId}
              onClick={() => void select(stage).catch(report(props.onStatus))}
            >
              <i data-status={stage.documentationStatus} />
              <span>
                <strong>{stage.name}</strong>
                <small>{period(stage)}</small>
              </span>
              <em>{documentation(stage.documentationStatus)}</em>
            </button>
          ))}
          {draft && !stages.some((stage) => stage.id === draft.id) && (
            <button
              className={styles.stageItem}
              data-active="true"
              onClick={() => undefined}
            >
              <i data-status="partial" />
              <span>
                <strong>{draft.name}</strong>
                <small>尚未保存</small>
              </span>
              <em>草稿</em>
            </button>
          )}
          {!values.length && !draft && (
            <EmptyState
              title={`还没有${title}`}
              body={
                props.kind === "historical_stage"
                  ? "创建第一个阶段后，可单独设置年代、历史背景和数据继承。"
                  : "创建方言后，可在基础语言状态上维护差异。"
              }
            />
          )}
        </aside>
        <div className={styles.detailPane}>
          {draft && context ? (
            <StageEditor
              value={draft}
              context={context}
              stages={stages}
              saving={saving}
              onChange={(value) => {
                draftRef.current = value;
                setDraft(value);
              }}
              onContext={setContext}
              onSave={() => void save().catch(report(props.onStatus))}
              onDelete={
                stages.some((stage) => stage.id === draft.id)
                  ? () => void remove().catch(report(props.onStatus))
                  : undefined
              }
            />
          ) : (
            <EmptyState
              title={`选择一个${title}`}
              body="左侧用于浏览，右侧用于编辑；新建内容只有在明确保存后才会写入项目。"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function StageEditor(props: {
  value: LanguageStage;
  context: StageContextRecord;
  stages: LanguageStage[];
  saving: boolean;
  onChange: (value: LanguageStage) => void;
  onContext: (value: StageContextRecord) => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const value = props.value;
  const set = <K extends keyof LanguageStage>(key: K, next: LanguageStage[K]) =>
    props.onChange({ ...value, [key]: next });
  const candidates = props.stages.filter((stage) => stage.id !== value.id);
  const dataBases = candidates.filter(
    (stage) =>
      stage.storageMode !== "no_data" &&
      stage.documentationStatus !== "unrecorded"
  );
  const isNoData =
    value.documentationStatus === "unrecorded" ||
    value.storageMode === "no_data";

  return (
    <form
      className={styles.editorForm}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <header className={styles.editorHeader}>
        <div>
          <h2>{value.name || "未命名"}</h2>
          <span className={styles.badge}>{stageKind(value.kind)}</span>
        </div>
        <span>
          {props.stages.some((stage) => stage.id === value.id)
            ? "项目数据"
            : "未保存草稿"}
        </span>
      </header>
      <div className={styles.formGrid}>
        <Field label="名称">
          <input
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="资料状态">
          <select
            value={value.documentationStatus}
            onChange={(event) => {
              const next = event.target
                .value as LanguageStage["documentationStatus"];
              props.onChange({
                ...value,
                documentationStatus: next,
                storageMode:
                  next === "unrecorded"
                    ? "no_data"
                    : value.storageMode === "no_data"
                    ? "inherited_delta"
                    : value.storageMode,
                dataBaseStageId:
                  next === "unrecorded" ? undefined : value.dataBaseStageId,
              });
            }}
          >
            <option value="recorded">有记录</option>
            <option value="partial">部分记录</option>
            <option value="unrecorded">无记录</option>
            <option value="reconstructed">重构</option>
          </select>
        </Field>
        {value.kind === "historical_stage" && (
          <Field label="上一个时间阶段" hint="只表示先后顺序，不决定数据继承。">
            <select
              value={value.chronologyParentId ?? ""}
              onChange={(event) =>
                set("chronologyParentId", event.target.value || undefined)
              }
            >
              <option value="">无（时间线起点）</option>
              {stageOptions(candidates)}
            </select>
          </Field>
        )}
        <Field label="数据方式">
          <select
            value={value.storageMode}
            disabled={value.documentationStatus === "unrecorded"}
            onChange={(event) => {
              const next = event.target.value as LanguageStage["storageMode"];
              props.onChange({
                ...value,
                storageMode: next,
                dataBaseStageId:
                  next === "no_data" ? undefined : value.dataBaseStageId,
              });
            }}
          >
            <option value="inherited_delta">继承 + 差异</option>
            <option value="independent_snapshot">独立快照</option>
            <option value="no_data">无语言数据</option>
          </select>
        </Field>
        <Field label="数据基础" hint="无记录阶段不会出现在这里。">
          <select
            value={value.dataBaseStageId ?? ""}
            disabled={isNoData}
            onChange={(event) =>
              set("dataBaseStageId", event.target.value || undefined)
            }
          >
            <option value="">无</option>
            {stageOptions(dataBases)}
          </select>
        </Field>
        <div className={styles.periodFields}>
          <Field label="起始年代">
            <input
              value={value.startLabel}
              onChange={(event) => set("startLabel", event.target.value)}
              placeholder="例如：公元前 500"
            />
          </Field>
          <Field label="结束年代">
            <input
              value={value.endLabel}
              onChange={(event) => set("endLabel", event.target.value)}
              placeholder="例如：公元 200"
            />
          </Field>
        </div>
        <Field label="历史背景" wide>
          <textarea
            value={props.context.background}
            onChange={(event) =>
              props.onContext({
                ...props.context,
                background: event.target.value,
              })
            }
          />
        </Field>
        <Field label="证据与说明" wide>
          <textarea
            value={props.context.evidenceNotes}
            onChange={(event) =>
              props.onContext({
                ...props.context,
                evidenceNotes: event.target.value,
              })
            }
          />
        </Field>
      </div>
      {isNoData && (
        <div className={styles.inlineNotice}>
          无记录阶段只保存年代、背景与关系；不能作为其他阶段的数据基础，也不会伪造词典或规则。
        </div>
      )}
      <footer className={styles.formFooter}>
        {props.onDelete && (
          <ConfirmDeleteButton
            className={styles.dangerButton}
            onConfirm={props.onDelete}
          />
        )}
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={props.saving || !value.name.trim()}
        >
          {props.saving
            ? "正在保存…"
            : value.kind === "historical_stage"
            ? "保存阶段"
            : "保存方言"}
        </button>
      </footer>
    </form>
  );
}

export function GenealogyWorkspace(
  props: CommonProps & {
    onOpenLanguage?: (languageId: string) => void;
    onOpenStage?: (languageId: string, stageId: string) => void;
  }
) {
  const [relations, setRelations] = useState<LanguageRelation[]>([]);
  const [stagesByLanguage, setStagesByLanguage] = useState<
    Map<string, LanguageStage[]>
  >(new Map());
  const load = useCallback(async () => {
    const [nextRelations, stageGroups] = await Promise.all([
      props.application.listLanguageRelations(),
      Promise.all(
        props.languages.map(
          async (language) =>
            [
              language.id,
              await props.application.listStages(language.id),
            ] as const
        )
      ),
    ]);
    setRelations(nextRelations);
    setStagesByLanguage(new Map(stageGroups));
  }, [props.application, props.languages]);
  useEffect(() => {
    void load().catch(report(props.onStatus));
  }, [load, props.onStatus]);
  return (
    <GenealogyCanvas
      languages={props.languages}
      relations={relations}
      stagesByLanguage={stagesByLanguage}
      onOpenLanguage={props.onOpenLanguage}
      onOpenStage={props.onOpenStage}
    />
  );
}

export function LanguagePropertiesWorkspace(
  props: CommonProps & {
    project: ProjectApplication;
    language: Language;
  }
) {
  const [name, setName] = useState(props.language.name);
  const [profile, setProfile] = useState<LanguageProfile>(() =>
    normalizeLanguageProfile(props.language.profile)
  );
  const [relations, setRelations] = useState<LanguageRelation[]>([]);
  const [kind, setKind] = useState<LanguageRelation["kind"]>("genetic");
  const [role, setRole] = useState<"source" | "target">("target");
  const [otherLanguageId, setOtherLanguageId] = useState("");
  const [confidenceValue, setConfidenceValue] =
    useState<LanguageRelation["confidence"]>("confirmed");
  const [notes, setNotes] = useState("");
  const [relationEditorOpen, setRelationEditorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const load = useCallback(
    async () => setRelations(await props.application.listLanguageRelations()),
    [props.application]
  );
  useEffect(() => {
    setName(props.language.name);
    setProfile(normalizeLanguageProfile(props.language.profile));
  }, [props.language]);
  useEffect(() => {
    void load().catch(report(props.onStatus));
  }, [load, props.onStatus]);
  const names = useMemo(
    () =>
      new Map(props.languages.map((language) => [language.id, language.name])),
    [props.languages]
  );
  const currentRelations = relations.filter(
    (relation) =>
      relation.sourceLanguageId === props.language.id ||
      relation.targetLanguageId === props.language.id
  );
  const otherLanguages = props.languages.filter(
    (language) => language.id !== props.language.id
  );

  const saveProperties = async () => {
    const nextName = name.trim();
    if (!nextName) return;
    if (nextName !== props.language.name)
      await props.project.renameLanguage(props.language.id, nextName);
    if (props.project.saveLanguageProfile)
      await props.project.saveLanguageProfile(props.language.id, profile);
    props.onChanged();
    props.onStatus("基本属性已保存。");
  };
  const saveRelation = async () => {
    const now = new Date().toISOString();
    const currentIsSource = role === "source";
    await props.application.saveLanguageRelation({
      id: crypto.randomUUID(),
      projectId: props.language.projectId,
      sourceLanguageId: currentIsSource ? props.language.id : otherLanguageId,
      targetLanguageId: currentIsSource ? otherLanguageId : props.language.id,
      kind,
      isPrimary: kind === "genetic",
      confidence: confidenceValue,
      notes: notes.trim(),
      createdAt: now,
      updatedAt: now,
    });
    setNotes("");
    setOtherLanguageId("");
    setRelationEditorOpen(false);
    await load();
    props.onChanged();
    props.onStatus("语言关系已保存。");
  };

  const setProfileValue = <K extends keyof LanguageProfile>(
    key: K,
    value: LanguageProfile[K]
  ) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <form
      className={styles.propertiesWorkspace}
      onSubmit={(event) => {
        event.preventDefault();
        void saveProperties().catch(report(props.onStatus));
      }}
    >
      <div className={styles.propertiesHeading}>
        <div>
          <strong>基本属性</strong>
          <span>语言身份、使用情况、关系和书写信息</span>
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={!name.trim()}
        >
          保存基本属性
        </button>
        <button
          type="button"
          className={styles.helpButton}
          aria-label="查看语言关系说明"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((value) => !value)}
        >
          ?
        </button>
        {helpOpen && (
          <div className={styles.propertiesHelp} role="dialog">
            <strong>语言关系</strong>
            <span>
              继承关系决定谱系树；接触与方言作为独立图层显示。关系保存后可到“语言谱系”查看。
            </span>
          </div>
        )}
      </div>
      <section className={styles.propertiesPanel}>
        <header>
          <strong>语言身份</strong>
        </header>
        <div className={styles.propertiesGrid}>
          <Field label="语言名称">
            <input
              name="language-name"
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="本族名称">
            <input
              name="language-native-name"
              autoComplete="off"
              value={profile.nativeName}
              onChange={(event) =>
                setProfileValue("nativeName", event.target.value)
              }
            />
          </Field>
          <Field label="语言代码">
            <input
              name="language-code"
              autoComplete="off"
              spellCheck={false}
              value={profile.code}
              onChange={(event) => setProfileValue("code", event.target.value)}
            />
          </Field>
          <Field label="别名">
            <input
              name="language-aliases"
              autoComplete="off"
              value={profile.aliases}
              onChange={(event) =>
                setProfileValue("aliases", event.target.value)
              }
              placeholder="多个别名用顿号分隔"
            />
          </Field>
          <Field label="标签" wide>
            <input
              name="language-tags"
              autoComplete="off"
              value={profile.tags}
              onChange={(event) => setProfileValue("tags", event.target.value)}
              placeholder="例如：历史语言、礼仪语言"
            />
          </Field>
          <Field label="简介" wide>
            <textarea
              name="language-description"
              autoComplete="off"
              value={profile.description}
              onChange={(event) =>
                setProfileValue("description", event.target.value)
              }
            />
          </Field>
        </div>
      </section>
      <section className={styles.propertiesPanel}>
        <header>
          <strong>使用情况</strong>
        </header>
        <div className={styles.propertiesGrid}>
          <Field label="当前状态">
            <input
              name="language-status"
              autoComplete="off"
              value={profile.status}
              onChange={(event) =>
                setProfileValue("status", event.target.value)
              }
              placeholder="例如：活语言、历史语言"
            />
          </Field>
          <Field label="使用人数">
            <input
              name="language-speakers"
              autoComplete="off"
              inputMode="numeric"
              value={profile.speakers}
              onChange={(event) =>
                setProfileValue("speakers", event.target.value)
              }
            />
          </Field>
          <Field label="人口规模">
            <input
              name="language-population"
              autoComplete="off"
              inputMode="numeric"
              value={profile.population}
              onChange={(event) =>
                setProfileValue("population", event.target.value)
              }
            />
          </Field>
          <Field label="主要地区">
            <input
              name="language-region"
              autoComplete="off"
              value={profile.region}
              onChange={(event) =>
                setProfileValue("region", event.target.value)
              }
            />
          </Field>
          <div className={styles.periodFields}>
            <Field label="使用年代（起）">
              <input
                name="language-start-label"
                autoComplete="off"
                value={profile.startLabel}
                onChange={(event) =>
                  setProfileValue("startLabel", event.target.value)
                }
              />
            </Field>
            <Field label="使用年代（止）">
              <input
                name="language-end-label"
                autoComplete="off"
                value={profile.endLabel}
                onChange={(event) =>
                  setProfileValue("endLabel", event.target.value)
                }
              />
            </Field>
          </div>
          <Field label="社会地位">
            <input
              name="language-social-status"
              autoComplete="off"
              value={profile.socialStatus}
              onChange={(event) =>
                setProfileValue("socialStatus", event.target.value)
              }
            />
          </Field>
          <Field label="官方地位">
            <input
              name="language-official-status"
              autoComplete="off"
              value={profile.officialStatus}
              onChange={(event) =>
                setProfileValue("officialStatus", event.target.value)
              }
            />
          </Field>
        </div>
      </section>
      <section className={styles.propertiesPanel}>
        <header>
          <strong>语言关系</strong>
          <div className={styles.panelActions}>
            <span>{currentRelations.length} 条</span>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setRelationEditorOpen((value) => !value)}
            >
              {relationEditorOpen ? "收起" : "添加关系"}
            </button>
          </div>
        </header>
        {currentRelations.length > 0 ? (
          <div
            className={styles.relationshipTable}
            role="table"
            aria-label="当前语言关系"
          >
            <div role="row" className={styles.relationshipTableHead}>
              <span>关系</span>
              <span>另一门语言</span>
              <span>方向</span>
              <span>可信度</span>
              <span />
            </div>
            {currentRelations.map((relation) => {
              const currentIsSource =
                relation.sourceLanguageId === props.language.id;
              const otherId = currentIsSource
                ? relation.targetLanguageId
                : relation.sourceLanguageId;
              return (
                <div role="row" key={relation.id}>
                  <strong>{relationKind(relation.kind)}</strong>
                  <span>{names.get(otherId) ?? "语言已删除"}</span>
                  <span>
                    {relationshipDirection(relation.kind, currentIsSource)}
                  </span>
                  <small>{confidence(relation.confidence)}</small>
                  <ConfirmDeleteButton
                    className={styles.iconDanger}
                    label="删除关系"
                    onConfirm={() =>
                      void props.application
                        .deleteLanguageRelation(relation.id)
                        .then(load)
                        .then(props.onChanged)
                        .catch(report(props.onStatus))
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.inlineEmpty}>尚未建立关系</div>
        )}
        {relationEditorOpen && (
          <div className={styles.relationshipEditor}>
            <Field label="关系类型">
              <select
                name="relationship-kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as LanguageRelation["kind"])
                }
              >
                <option value="genetic">继承</option>
                <option value="contact">接触</option>
                <option value="dialect">方言</option>
              </select>
            </Field>
            <Field label="当前语言角色">
              <select
                name="relationship-role"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "source" | "target")
                }
              >
                {relationshipRoleOptions(kind)}
              </select>
            </Field>
            <Field label="另一门语言">
              <select
                name="relationship-language"
                value={otherLanguageId}
                onChange={(event) => setOtherLanguageId(event.target.value)}
              >
                <option value="">请选择</option>
                {languageOptions(otherLanguages)}
              </select>
            </Field>
            <Field label="可信度">
              <select
                name="relationship-confidence"
                value={confidenceValue}
                onChange={(event) =>
                  setConfidenceValue(
                    event.target.value as LanguageRelation["confidence"]
                  )
                }
              >
                {confidenceOptions()}
              </select>
            </Field>
            <Field label="备注" wide>
              <input
                name="relationship-notes"
                autoComplete="off"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <footer>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!otherLanguageId}
                onClick={() =>
                  void saveRelation().catch(report(props.onStatus))
                }
              >
                保存关系
              </button>
            </footer>
          </div>
        )}
      </section>
      <section className={styles.propertiesPanel}>
        <header>
          <strong>书写信息</strong>
        </header>
        <div className={styles.propertiesGrid}>
          <Field label="当前书写系统">
            <input
              name="language-current-writing-system"
              autoComplete="off"
              value={profile.currentWritingSystem}
              onChange={(event) =>
                setProfileValue("currentWritingSystem", event.target.value)
              }
            />
          </Field>
          <Field label="历史书写系统">
            <input
              name="language-historical-writing-systems"
              autoComplete="off"
              value={profile.historicalWritingSystems}
              onChange={(event) =>
                setProfileValue("historicalWritingSystems", event.target.value)
              }
            />
          </Field>
          <Field label="正字法与转写" wide>
            <textarea
              name="language-orthographies"
              autoComplete="off"
              value={profile.orthographies}
              onChange={(event) =>
                setProfileValue("orthographies", event.target.value)
              }
            />
          </Field>
        </div>
      </section>
      <section className={styles.propertiesPanel}>
        <header>
          <strong>备注</strong>
        </header>
        <div className={styles.propertiesGrid}>
          <Field label="项目备注" wide>
            <textarea
              name="language-notes"
              autoComplete="off"
              value={profile.notes}
              onChange={(event) => setProfileValue("notes", event.target.value)}
            />
          </Field>
        </div>
      </section>
    </form>
  );
}

export function EventsWorkspace(props: CommonProps) {
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<HistoricalEvent>();
  const selectedIdRef = useRef<string>();
  const draftRef = useRef<HistoricalEvent>();
  const hasUnsavedDraft = Boolean(
    draft && !events.some((event) => event.id === draft.id)
  );
  const load = useCallback(
    async (preferredId?: string) => {
      const values = await props.application.listHistoricalEvents();
      setEvents(values);
      if (
        !preferredId &&
        draftRef.current &&
        !values.some((event) => event.id === draftRef.current?.id)
      ) {
        return;
      }
      const selected =
        values.find(
          (event) => event.id === (preferredId ?? selectedIdRef.current)
        ) ?? values[0];
      selectedIdRef.current = selected?.id;
      draftRef.current = selected;
      setSelectedId(selected?.id);
      setDraft(selected);
    },
    [props.application]
  );
  useEffect(() => {
    void load().catch(report(props.onStatus));
  }, [load, props.onStatus]);

  const create = () => {
    const now = new Date().toISOString();
    const value: HistoricalEvent = {
      id: crypto.randomUUID(),
      projectId: "",
      name: "未命名事件",
      eventType: "migration",
      startLabel: "",
      endLabel: "",
      description: "",
      position: events.length,
      participants: [],
      createdAt: now,
      updatedAt: now,
    };
    selectedIdRef.current = value.id;
    draftRef.current = value;
    setSelectedId(value.id);
    setDraft(value);
  };
  const save = async () => {
    if (!draft) return;
    await props.application.saveHistoricalEvent(draft);
    await load(draft.id);
    props.onChanged();
    props.onStatus("历史事件已保存。");
  };
  const remove = async () => {
    if (!draft) return;
    await props.application.deleteHistoricalEvent(draft.id);
    selectedIdRef.current = undefined;
    draftRef.current = undefined;
    setSelectedId(undefined);
    setDraft(undefined);
    await load();
    props.onChanged();
  };

  return (
    <section className={styles.workspace}>
      <div className={styles.sectionToolbar}>
        <button
          className={styles.primaryButton}
          onClick={create}
          disabled={hasUnsavedDraft}
          title={hasUnsavedDraft ? "请先保存或删除当前草稿" : undefined}
        >
          {hasUnsavedDraft ? "请先处理当前草稿" : "新建事件"}
        </button>
      </div>
      <div className={styles.masterDetail}>
        <aside className={styles.timelinePane}>
          {events.map((event) => (
            <button
              key={event.id}
              data-active={event.id === selectedId}
              onClick={() => {
                selectedIdRef.current = event.id;
                draftRef.current = event;
                setSelectedId(event.id);
                setDraft(event);
              }}
            >
              <i />
              <span>
                <strong>{event.name}</strong>
                <small>
                  {event.startLabel || "年代未设置"} ·{" "}
                  {eventType(event.eventType)}
                </small>
              </span>
            </button>
          ))}
          {draft && !events.some((event) => event.id === draft.id) && (
            <button data-active="true">
              <i />
              <span>
                <strong>{draft.name}</strong>
                <small>尚未保存</small>
              </span>
            </button>
          )}
          {!events.length && !draft && (
            <EmptyState
              title="还没有历史事件"
              body="使用页面右上角的“新建事件”，可把事件关联到语言、阶段和词源证据。"
            />
          )}
        </aside>
        <div className={styles.detailPane}>
          {draft ? (
            <EventEditor
              value={draft}
              languages={props.languages}
              onChange={(value) => {
                draftRef.current = value;
                setDraft(value);
              }}
              onSave={() => void save().catch(report(props.onStatus))}
              onDelete={
                events.some((event) => event.id === draft.id)
                  ? () => void remove().catch(report(props.onStatus))
                  : undefined
              }
            />
          ) : (
            <EmptyState
              title="选择一个事件"
              body="右侧将显示事件详情、年代和参与语言。"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function EventEditor(props: {
  value: HistoricalEvent;
  languages: Language[];
  onChange: (event: HistoricalEvent) => void;
  onSave: () => void;
  onDelete?: () => void;
}) {
  const value = props.value;
  const set = <K extends keyof HistoricalEvent>(
    key: K,
    next: HistoricalEvent[K]
  ) => props.onChange({ ...value, [key]: next });
  const selected = new Set(
    value.participants.map((participant) => participant.languageId)
  );
  return (
    <form
      className={styles.editorForm}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSave();
      }}
    >
      <header className={styles.editorHeader}>
        <div>
          <h2>{value.name}</h2>
          <span className={styles.badge}>{eventType(value.eventType)}</span>
        </div>
      </header>
      <div className={styles.formGrid}>
        <Field label="事件名称">
          <input
            value={value.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field label="类型">
          <select
            value={value.eventType}
            onChange={(event) =>
              set(
                "eventType",
                event.target.value as HistoricalEvent["eventType"]
              )
            }
          >
            {eventTypeOptions()}
          </select>
        </Field>
        <Field label="开始年代">
          <input
            value={value.startLabel}
            onChange={(event) => set("startLabel", event.target.value)}
          />
        </Field>
        <Field label="结束年代">
          <input
            value={value.endLabel}
            onChange={(event) => set("endLabel", event.target.value)}
          />
        </Field>
        <Field label="描述" wide>
          <textarea
            value={value.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <fieldset className={styles.participantField}>
          <legend>参与语言</legend>
          <div>
            {props.languages.map((language) => (
              <label key={language.id}>
                <input
                  type="checkbox"
                  checked={selected.has(language.id)}
                  onChange={(event) => {
                    const participants = event.target.checked
                      ? [
                          ...value.participants,
                          { languageId: language.id, role: "参与", notes: "" },
                        ]
                      : value.participants.filter(
                          (participant) =>
                            participant.languageId !== language.id
                        );
                    set("participants", participants);
                  }}
                />
                {language.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <footer className={styles.formFooter}>
        {props.onDelete && (
          <ConfirmDeleteButton
            className={styles.dangerButton}
            onConfirm={props.onDelete}
          />
        )}
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={!value.name.trim()}
        >
          保存事件
        </button>
      </footer>
    </form>
  );
}

type LexemeChoice = Lexeme & { languageName: string };

export interface EtymologyWorkspaceDraft {
  mode: "single" | "batch";
  sourceLanguageId: string;
  sourceSearch: string;
  targetSearch: string;
  sourceId: string;
  targetId: string;
  sourceForm: string;
  kind: EtymologyRelation["kind"];
  eventId: string;
  confidenceValue: EtymologyRelation["confidence"];
  notes: string;
  editing?: EtymologyRelation;
  createTarget: boolean;
  targetForm: string;
  targetMeaning: string;
  targetPartOfSpeech: string;
  batchSearch: string;
  batchPartOfSpeech: string;
  batchSelected: Record<string, boolean>;
  batchDrafts: Record<string, { form: string; meaning: string }>;
  borrowingBatch?: BorrowingBatch;
  borrowingProfileId: string;
  lexurgyStartStageId: string;
  lexurgyEndStageId: string;
  temporaryIpa: string;
  aiBorrowingAdjustments: string[];
}

export function EtymologyWorkspace(
  props: CommonProps & {
    project: ProjectApplication;
    phase6?: Phase6Application;
    languageId: string;
    onAskAi?: (prompt: string) => void;
    aiDrafts?: AiProposalDraft[];
    onAiDraftsConsumed?: () => void;
    draft?: EtymologyWorkspaceDraft;
    onDraftChange?: (draft: EtymologyWorkspaceDraft) => void;
  }
) {
  const remembered = props.draft;
  const [relations, setRelations] = useState<EtymologyRelation[]>([]);
  const [events, setEvents] = useState<HistoricalEvent[]>([]);
  const [lexemes, setLexemes] = useState<LexemeChoice[]>([]);
  const [mode, setMode] = useState<"single" | "batch">(remembered?.mode ?? "single");
  const [sourceLanguageId, setSourceLanguageId] = useState(remembered?.sourceLanguageId ?? "");
  const [sourceSearch, setSourceSearch] = useState(remembered?.sourceSearch ?? "");
  const [targetSearch, setTargetSearch] = useState(remembered?.targetSearch ?? "");
  const [sourceId, setSourceId] = useState(remembered?.sourceId ?? "");
  const [targetId, setTargetId] = useState(remembered?.targetId ?? "");
  const [sourceForm, setSourceForm] = useState(remembered?.sourceForm ?? "");
  const [kind, setKind] = useState<EtymologyRelation["kind"]>(remembered?.kind ?? "borrowing");
  const [eventId, setEventId] = useState(remembered?.eventId ?? "");
  const [confidenceValue, setConfidenceValue] =
    useState<EtymologyRelation["confidence"]>(remembered?.confidenceValue ?? "confirmed");
  const [notes, setNotes] = useState(remembered?.notes ?? "");
  const [editing, setEditing] = useState<EtymologyRelation | undefined>(remembered?.editing);
  const [createTarget, setCreateTarget] = useState(remembered?.createTarget ?? false);
  const [targetForm, setTargetForm] = useState(remembered?.targetForm ?? "");
  const [targetMeaning, setTargetMeaning] = useState(remembered?.targetMeaning ?? "");
  const [targetPartOfSpeech, setTargetPartOfSpeech] = useState(remembered?.targetPartOfSpeech ?? "");
  const [batchSearch, setBatchSearch] = useState(remembered?.batchSearch ?? "");
  const [batchPartOfSpeech, setBatchPartOfSpeech] = useState(remembered?.batchPartOfSpeech ?? "");
  const [batchSelected, setBatchSelected] = useState<Record<string, boolean>>(
    remembered?.batchSelected ?? {}
  );
  const [batchDrafts, setBatchDrafts] = useState<
    Record<string, { form: string; meaning: string }>
  >(remembered?.batchDrafts ?? {});
  const [borrowingBatch, setBorrowingBatch] = useState<BorrowingBatch | undefined>(remembered?.borrowingBatch);
  const [borrowingProfiles, setBorrowingProfiles] = useState<
    BorrowingProfile[]
  >([]);
  const [borrowingProfileId, setBorrowingProfileId] = useState(remembered?.borrowingProfileId ?? "");
  const [targetStages, setTargetStages] = useState<LanguageStage[]>([]);
  const [lexurgyStartStageId, setLexurgyStartStageId] = useState(remembered?.lexurgyStartStageId ?? "");
  const [lexurgyEndStageId, setLexurgyEndStageId] = useState(remembered?.lexurgyEndStageId ?? "");
  const [temporaryIpa, setTemporaryIpa] = useState(remembered?.temporaryIpa ?? "");
  const [aiBorrowingAdjustments, setAiBorrowingAdjustments] = useState<string[]>(
    remembered?.aiBorrowingAdjustments ?? []
  );
  const [borrowingBusy, setBorrowingBusy] = useState(false);
  const [borrowingError, setBorrowingError] = useState("");
  const pendingAiSourceIds = useRef<string[]>([]);
  const consumedAiRequest = useRef("");
  const { aiDrafts, onAiDraftsConsumed, onDraftChange, onStatus } = props;

  useEffect(() => {
    onDraftChange?.({
      mode,
      sourceLanguageId,
      sourceSearch,
      targetSearch,
      sourceId,
      targetId,
      sourceForm,
      kind,
      eventId,
      confidenceValue,
      notes,
      editing,
      createTarget,
      targetForm,
      targetMeaning,
      targetPartOfSpeech,
      batchSearch,
      batchPartOfSpeech,
      batchSelected,
      batchDrafts,
      borrowingBatch,
      borrowingProfileId,
      lexurgyStartStageId,
      lexurgyEndStageId,
      temporaryIpa,
      aiBorrowingAdjustments,
    });
  }, [
    mode,
    sourceLanguageId,
    sourceSearch,
    targetSearch,
    sourceId,
    targetId,
    sourceForm,
    kind,
    eventId,
    confidenceValue,
    notes,
    editing,
    createTarget,
    targetForm,
    targetMeaning,
    targetPartOfSpeech,
    batchSearch,
    batchPartOfSpeech,
    batchSelected,
    batchDrafts,
    borrowingBatch,
    borrowingProfileId,
    lexurgyStartStageId,
    lexurgyEndStageId,
    temporaryIpa,
    aiBorrowingAdjustments,
    onDraftChange,
  ]);

  const load = useCallback(async () => {
    const [nextRelations, nextEvents, groups] = await Promise.all([
      props.application.listEtymologyRelations(),
      props.application.listHistoricalEvents(),
      Promise.all(
        props.languages.map(async (language) => ({
          language,
          values: await props.project.listLexemes(language.id),
        }))
      ),
    ]);
    setRelations(nextRelations);
    setEvents(nextEvents);
    setLexemes(
      groups.flatMap(({ language, values }) =>
        values.map((lexeme) => ({ ...lexeme, languageName: language.name }))
      )
    );
  }, [props.application, props.languages, props.project]);
  useEffect(() => {
    void load().catch(report(props.onStatus));
  }, [load, props.onStatus]);
  useEffect(() => {
    void props.application
      .listStages(props.languageId)
      .then((values) =>
        setTargetStages(
          values
            .filter(
              (stage) => stage.visible && stage.kind === "historical_stage"
            )
            .sort((left, right) => left.position - right.position)
        )
      )
      .catch(report(props.onStatus));
  }, [props.application, props.languageId, props.onStatus]);
  useEffect(() => {
    if (!props.phase6 || !sourceLanguageId || kind !== "borrowing") {
      setBorrowingProfiles([]);
      setBorrowingProfileId("");
      return;
    }
    void props.phase6
      .listBorrowingProfiles(props.languageId, sourceLanguageId)
      .then((values) => {
        setBorrowingProfiles(values);
        setBorrowingProfileId((current) =>
          values.some((value) => value.id === current)
            ? current
            : values[0]?.id ?? ""
        );
      })
      .catch(report(props.onStatus));
  }, [kind, props.languageId, props.onStatus, props.phase6, sourceLanguageId]);

  useEffect(() => {
    const borrowingSuggestion = aiDrafts?.find(
      (draft) => draft.kind === "borrowing_adaptation.suggest"
    );
    if (borrowingSuggestion && borrowingBatch && props.phase6) {
      if (consumedAiRequest.current === borrowingSuggestion.requestId) return;
      consumedAiRequest.current = borrowingSuggestion.requestId;
      const recommendations = Array.isArray(
        borrowingSuggestion.patch.candidateRecommendations
      )
        ? borrowingSuggestion.patch.candidateRecommendations
        : [];
      const byId = new Map(
        recommendations
          .filter(
            (value): value is Record<string, unknown> =>
              Boolean(value) && typeof value === "object"
          )
          .map((value) => [String(value.candidateId ?? ""), value])
      );
      const nextCandidates = borrowingBatch.candidates.map((candidate) => {
        const recommendation = byId.get(candidate.id);
        if (!recommendation) return candidate;
        const action = String(recommendation.action ?? "keep");
        const explanation = String(recommendation.explanation ?? "").trim();
        const next: BorrowingCandidate = {
          ...candidate,
          status: action === "reject" ? "rejected" : "accepted",
          adaptedForm:
            action === "adjust" && recommendation.adaptedForm
              ? String(recommendation.adaptedForm)
              : candidate.adaptedForm,
          adaptedIpa:
            action === "adjust" && recommendation.adaptedIpa
              ? String(recommendation.adaptedIpa)
              : candidate.adaptedIpa,
          trace: [
            ...candidate.trace.filter((step) => step.step !== "ai_recommendation"),
            {
              step: "ai_recommendation",
              action,
              explanation,
              originalAdaptedForm: candidate.adaptedForm,
              originalAdaptedIpa: candidate.adaptedIpa,
            },
          ],
        };
        return next;
      });
      const temporaryAdjustments = Array.isArray(
        borrowingSuggestion.patch.temporaryRuleAdjustments
      )
        ? borrowingSuggestion.patch.temporaryRuleAdjustments.map(String)
        : [];
      void Promise.all(
        nextCandidates
          .filter((candidate) => byId.has(candidate.id))
          .map((candidate) => props.phase6!.saveBorrowingCandidate(candidate))
      ).then(() => {
        setBorrowingBatch({
          ...borrowingBatch,
          candidates: nextCandidates,
          llmModelLabel: "AI 建议已应用到草稿",
        });
        setAiBorrowingAdjustments(temporaryAdjustments);
        onStatus(
          "AI 建议已应用到候选表；已自动勾选保留项并填入调整，尚未写入词典。"
        );
        onAiDraftsConsumed?.();
      }).catch((error) => {
        consumedAiRequest.current = "";
        onStatus(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    const drafts =
      aiDrafts?.filter((draft) => draft.kind === "lexeme.upsert") ?? [];
    if (!drafts.length) return;
    const requestKey = drafts.map((draft) => draft.requestId).join(":");
    if (requestKey === consumedAiRequest.current) return;
    consumedAiRequest.current = requestKey;
    if (mode === "batch") {
      const sourceIds = pendingAiSourceIds.current;
      setBatchDrafts((current) => {
        const next = { ...current };
        drafts.forEach((draft, index) => {
          const sourceId = sourceIds[index];
          if (!sourceId) return;
          const value = lexemeProposalValue(draft.patch);
          next[sourceId] = { form: value.romanized, meaning: value.meaning };
        });
        return next;
      });
      onStatus(
        `AI 已填入 ${Math.min(
          drafts.length,
          sourceIds.length
        )} 条批量草稿，请检查后创建关系。`
      );
    } else {
      const value = lexemeProposalValue(drafts[0].patch);
      const source = sourceId
        ? lexemes.find((lexeme) => lexeme.id === sourceId)
        : undefined;
      setTargetForm(value.romanized);
      setTargetMeaning(value.meaning);
      setTargetPartOfSpeech(
        kind === "derivation"
          ? value.partOfSpeech
          : source?.partOfSpeech ?? value.partOfSpeech
      );
      setCreateTarget(true);
      onStatus("AI 词条提案已填入当前关系编辑器，请检查后创建并保存关系。");
    }
    onAiDraftsConsumed?.();
  }, [
    aiDrafts,
    borrowingBatch,
    kind,
    lexemes,
    mode,
    onAiDraftsConsumed,
    onStatus,
    props.phase6,
    sourceId,
  ]);

  const targetLexemes = lexemes.filter(
    (lexeme) =>
      lexeme.languageId === props.languageId &&
      matchesLexeme(lexeme, targetSearch)
  );
  const sourceLexemes = lexemes.filter(
    (lexeme) =>
      lexeme.languageId === sourceLanguageId &&
      matchesLexeme(lexeme, sourceSearch)
  );
  const lexemeById = new Map(lexemes.map((lexeme) => [lexeme.id, lexeme]));
  const currentRelations = relations.filter(
    (relation) =>
      lexemeById.get(relation.targetLexemeId)?.languageId === props.languageId
  );
  const labels = new Map(
    lexemes.map((lexeme) => [lexeme.id, lexemeLabel(lexeme)])
  );
  const eventNames = new Map(events.map((event) => [event.id, event.name]));
  const sourceLanguage = props.languages.find(
    (language) => language.id === sourceLanguageId
  );
  const sourceLanguages =
    kind === "borrowing"
      ? props.languages.filter((language) => language.id !== props.languageId)
      : props.languages;
  const batchCandidates = lexemes
    .filter((lexeme) => lexeme.languageId === sourceLanguageId)
    .filter((lexeme) => matchesLexeme(lexeme, batchSearch))
    .filter(
      (lexeme) =>
        !batchPartOfSpeech || lexeme.partOfSpeech === batchPartOfSpeech
    );
  const batchParts = [
    ...new Set(
      lexemes
        .filter((value) => value.languageId === sourceLanguageId)
        .map((value) => value.partOfSpeech)
        .filter(Boolean)
    ),
  ];
  const lexurgySelection = resolveChronologySelection(
    targetStages,
    lexurgyStartStageId,
    lexurgyEndStageId
  );
  const selectedSourceLexeme = sourceId ? lexemeById.get(sourceId) : undefined;
  const singleBorrowingBlocker =
    kind !== "borrowing"
      ? ""
      : !sourceId
        ? "请选择来源词。"
        : !selectedSourceLexeme?.ipa && !temporaryIpa.trim()
          ? `来源词“${selectedSourceLexeme?.romanized ?? ""}”缺少 IPA，请填写临时来源 IPA。`
          : lexurgySelection.error ?? "";
  const selectedBatchSources = batchCandidates.filter(
    (value) => batchSelected[value.id]
  );
  const batchSourcesMissingIpa = selectedBatchSources.filter(
    (value) => !value.ipa.trim()
  );
  const batchBorrowingBlocker =
    kind !== "borrowing"
      ? ""
      : !selectedBatchSources.length
        ? "请至少选择一个来源词。"
        : batchSourcesMissingIpa.length
          ? `所选来源词中有 ${batchSourcesMissingIpa.length} 条缺少 IPA：${batchSourcesMissingIpa
              .slice(0, 5)
              .map((value) => value.romanized)
              .join("、")}${batchSourcesMissingIpa.length > 5 ? "等" : ""}。`
          : lexurgySelection.error ?? "";

  const reset = () => {
    setEditing(undefined);
    setSourceLanguageId("");
    setSourceId("");
    setTargetId("");
    setSourceSearch("");
    setTargetSearch("");
    setSourceForm("");
    setKind("borrowing");
    setEventId("");
    setConfidenceValue("confirmed");
    setNotes("");
    setCreateTarget(false);
    setTargetForm("");
    setTargetMeaning("");
    setTargetPartOfSpeech("");
    setBorrowingBatch(undefined);
    setBorrowingError("");
    setTemporaryIpa("");
    setLexurgyStartStageId("");
    setLexurgyEndStageId("");
  };

  const ensureBorrowingProfile = async () => {
    if (!props.phase6 || !sourceLanguageId)
      throw new Error("请先选择来源语言。");
    const selected = borrowingProfiles.find(
      (value) => value.id === borrowingProfileId
    );
    if (selected) return selected;
    const now = new Date().toISOString();
    const profile: BorrowingProfile = {
      id: crypto.randomUUID(),
      projectId: props.project.getSnapshot()?.project.id ?? "",
      sourceLanguageId,
      targetLanguageId: props.languageId,
      name: "默认借词方案",
      structureVersion: "borrowing-profile-v1",
      isDefault: true,
      config: defaultBorrowingConfig(),
      createdAt: now,
      updatedAt: now,
    };
    await props.phase6.saveBorrowingProfile(profile);
    setBorrowingProfiles([profile]);
    setBorrowingProfileId(profile.id);
    return profile;
  };

  const previewBorrowingSources = async (
    sources: LexemeChoice[],
    temporary?: Record<string, string>
  ) => {
    if (!props.phase6 || !sources.length || !sourceLanguageId) return;
    if (lexurgySelection.error) {
      setBorrowingError(lexurgySelection.error);
      return;
    }
    setBorrowingError("");
    setBorrowingBusy(true);
    try {
      const phonology = await props.phase6.getPhonology(props.languageId);
      const profile = await ensureBorrowingProfile();
      const batch = await props.phase6.previewBorrowing({
        profile,
        phonology,
        sourceLexemes: sources,
        temporaryIpa: temporary,
        lexurgyStageIds: lexurgySelection.ids,
      });
      setBorrowingBatch(batch);
      props.onStatus(
        `已生成 ${batch.candidates.length} 个基础借词候选，请审核后写入词典。`
      );
    } catch (error) {
      const message = borrowingErrorMessage(error);
      setBorrowingError(message);
      props.onStatus(message);
    } finally {
      setBorrowingBusy(false);
    }
  };

  const previewBorrowing = async () => {
    if (!sourceId) return;
    const source = lexemeById.get(sourceId);
    if (!source) return;
    await previewBorrowingSources(
      [source],
      temporaryIpa.trim() ? { [source.id]: temporaryIpa.trim() } : undefined
    );
  };

  const commitBorrowing = async () => {
    if (!props.phase6 || !borrowingBatch) return;
    const accepted = borrowingBatch.candidates
      .filter((value) => value.status === "accepted")
      .map((value) => value.id);
    await props.phase6.commitBorrowing(borrowingBatch.id, accepted);
    await load();
    props.onChanged();
    reset();
    props.onStatus(`已写入 ${accepted.length} 个借词及其词源关系。`);
  };

  const askBorrowingSuggestion = () => {
    if (!props.onAskAi || !borrowingBatch) return;
    props.onAskAi(
      [
        "任务：比较当前确定性借词候选并生成一项 borrowing_adaptation.suggest 提案。",
        "借入不是派生：不得改变来源核心释义和词性，不得添加语素，不得创建 lexeme.upsert，不得修改已保存借词方案。",
        "只能推荐保留、拒绝或调整当前候选草稿。候选 ID 必须原样返回。",
        "输出一个 fishtongue-proposals JSON 代码块，patch 结构为 candidateRecommendations 与 temporaryRuleAdjustments。",
        JSON.stringify(
          borrowingBatch.candidates.map((value) => ({
            candidateId: value.id,
            source: value.sourceForm,
            sourceIpa: value.sourceIpa,
            adaptedForm: value.adaptedForm,
            adaptedIpa: value.adaptedIpa,
            partOfSpeech: value.partOfSpeech,
            senses: value.senses,
            distance: value.distance,
            warnings: value.warnings,
            trace: value.trace,
          }))
        ),
      ].join("\n")
    );
  };

  const beginEdit = (relation: EtymologyRelation) => {
    const source = relation.sourceLexemeId
      ? lexemeById.get(relation.sourceLexemeId)
      : undefined;
    setMode("single");
    setEditing(relation);
    setSourceLanguageId(source?.languageId ?? "");
    setSourceId(relation.sourceLexemeId ?? "");
    setTargetId(relation.targetLexemeId);
    setSourceForm(relation.sourceForm);
    setKind(relation.kind);
    setEventId(relation.historicalEventId ?? "");
    setConfidenceValue(relation.confidence);
    setNotes(relation.notes);
    setSourceSearch("");
    setTargetSearch("");
  };

  const save = async () => {
    const now = new Date().toISOString();
    await props.application.saveEtymologyRelation({
      id: editing?.id ?? crypto.randomUUID(),
      projectId: "",
      sourceLexemeId: sourceId || undefined,
      targetLexemeId: targetId,
      historicalEventId: eventId || undefined,
      kind,
      sourceForm,
      confidence: confidenceValue,
      notes,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    });
    reset();
    await load();
    props.onChanged();
    props.onStatus("词源关系已保存。");
  };

  const createCurrentLexeme = async () => {
    if (!targetForm.trim() || !targetMeaning.trim()) return;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await props.project.saveLexeme({
      id,
      languageId: props.languageId,
      romanized: targetForm.trim(),
      ipa: "",
      partOfSpeech: targetPartOfSpeech.trim(),
      status: "draft",
      sourceType: lexemeSourceType(kind),
      notes: "",
      createdAt: now,
      updatedAt: now,
      morphemes: [],
      senses: [
        {
          id: crypto.randomUUID(),
          definition: targetMeaning.trim(),
          position: 0,
        },
      ],
    });
    await load();
    setTargetId(id);
    setCreateTarget(false);
    setTargetForm("");
    setTargetMeaning("");
    props.onChanged();
    props.onStatus("词条已创建并选中。");
  };

  const toggleBatch = (lexeme: LexemeChoice, checked: boolean) => {
    setBatchSelected((value) => ({ ...value, [lexeme.id]: checked }));
    if (checked)
      setBatchDrafts((value) =>
        value[lexeme.id]
          ? value
          : {
              ...value,
              [lexeme.id]: {
                form: "",
                meaning: lexeme.senses[0]?.definition ?? "",
              },
            }
      );
  };

  const askAi = (
    sources: Array<
      Pick<LexemeChoice, "id" | "romanized" | "senses" | "partOfSpeech">
    >
  ) => {
    pendingAiSourceIds.current = sources.map((value) => value.id);
    props.onAskAi?.(
      [
        `任务：为当前语言按“${etymologyKind(kind)}”关系生成恰好 ${
          sources.length
        } 个 lexeme.upsert 词条提案。`,
        relationshipAiConstraint(kind),
        "这是语言接触/词源对应任务，不是普通造词任务。除非关系类型明确为“派生”，不得改变来源词的词性；借入必须保留核心释义和词性，只允许按目标语言音系调整词形。",
        "按下列来源词顺序逐项生成，不得遗漏、合并或增加。只输出一个 ```fishtongue-proposals JSON 代码块；不能只给说明文字。",
        '每项格式：{"kind":"lexeme.upsert","targetId":null,"summary":"...","patch":{"romanized":"...","ipa":"","partOfSpeech":"与来源一致","status":"draft","senses":[{"definition":"保留核心释义"}]}}',
        ...sources.map(
          (value, index) =>
            `${index + 1}. ${value.romanized}｜词性：${
              value.partOfSpeech || "未分类"
            }｜释义：${value.senses[0]?.definition ?? "无释义"}`
        ),
      ].join("\n")
    );
  };

  const saveBatch = async () => {
    const selected = batchCandidates.filter((value) => batchSelected[value.id]);
    for (const source of selected) {
      const draft = batchDrafts[source.id];
      if (!draft?.form.trim() || !draft.meaning.trim())
        throw new Error(`请补全 ${source.romanized} 的目标词形和释义。`);
    }
    const createdLexemeIds: string[] = [];
    const createdRelationIds: string[] = [];
    try {
      for (const source of selected) {
        const draft = batchDrafts[source.id];
        const now = new Date().toISOString();
        const targetLexemeId = crypto.randomUUID();
        const relationId = crypto.randomUUID();
        await props.project.saveLexeme({
          id: targetLexemeId,
          languageId: props.languageId,
          romanized: draft.form.trim(),
          ipa: "",
          partOfSpeech: source.partOfSpeech,
          status: "draft",
          sourceType: lexemeSourceType(kind),
          notes: "",
          createdAt: now,
          updatedAt: now,
          morphemes: [],
          senses: [
            {
              id: crypto.randomUUID(),
              definition: draft.meaning.trim(),
              position: 0,
            },
          ],
        });
        createdLexemeIds.push(targetLexemeId);
        await props.application.saveEtymologyRelation({
          id: relationId,
          projectId: "",
          sourceLexemeId: source.id,
          targetLexemeId,
          kind,
          sourceForm: "",
          confidence: confidenceValue,
          notes: "",
          createdAt: now,
          updatedAt: now,
        });
        createdRelationIds.push(relationId);
      }
    } catch (error) {
      for (const relationId of createdRelationIds.reverse()) {
        await props.application
          .deleteEtymologyRelation(relationId)
          .catch(() => undefined);
      }
      for (const lexemeId of createdLexemeIds.reverse()) {
        await props.project.deleteLexeme(lexemeId).catch(() => undefined);
      }
      throw error;
    }
    setBatchSelected({});
    setBatchDrafts({});
    await load();
    props.onChanged();
    props.onStatus(`已创建 ${selected.length} 个目标词条和关系。`);
  };

  const saveBorrowingProfile = async (profile: BorrowingProfile) => {
    if (!props.phase6) return;
    const next = { ...profile, updatedAt: new Date().toISOString() };
    await props.phase6.saveBorrowingProfile(next);
    const values = await props.phase6.listBorrowingProfiles(
      props.languageId,
      sourceLanguageId
    );
    setBorrowingProfiles(values);
    setBorrowingProfileId(next.id);
    props.onChanged();
    props.onStatus(`借词方案“${next.name}”已保存。`);
  };

  const copyBorrowingProfile = async () => {
    const source =
      borrowingProfiles.find((value) => value.id === borrowingProfileId) ??
      (await ensureBorrowingProfile());
    const now = new Date().toISOString();
    await saveBorrowingProfile({
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} 副本`,
      isDefault: false,
      config: structuredClone(source.config),
      createdAt: now,
      updatedAt: now,
    });
  };

  const focusBorrowingBatch = mode === "batch" && kind === "borrowing";

  return (
    <section className={styles.workspace}>
      <div
        className={styles.etymologyLayout}
        data-mode={mode}
        data-focus-borrowing={focusBorrowingBatch ? "true" : undefined}
      >
        {!focusBorrowingBatch && (
        <section className={styles.compactSection}>
          <header>
            <strong>已记录关系</strong>
            <span>{currentRelations.length} 条</span>
          </header>
          {currentRelations.length ? (
            <div className={styles.etymologyList}>
              {currentRelations.map((relation) => (
                <div
                  key={relation.id}
                  data-active={editing?.id === relation.id}
                >
                  <span>
                    <strong>
                      {relation.sourceLexemeId
                        ? labels.get(relation.sourceLexemeId)
                        : relation.sourceForm || "未知来源"}
                    </strong>
                    <small>
                      {relation.historicalEventId
                        ? eventNames.get(relation.historicalEventId)
                        : "未关联事件"}
                    </small>
                  </span>
                  <b>{etymologyKind(relation.kind)}</b>
                  <span>
                    <strong>
                      {labels.get(relation.targetLexemeId) ?? "词条已删除"}
                    </strong>
                    <small>{confidence(relation.confidence)}</small>
                  </span>
                  <span className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => beginEdit(relation)}
                    >
                      编辑
                    </button>
                    <ConfirmDeleteButton
                      className={styles.iconDanger}
                      label="删除词源关系"
                      onConfirm={() =>
                        void props.application
                          .deleteEtymologyRelation(relation.id)
                          .then(load)
                          .then(props.onChanged)
                          .catch(report(props.onStatus))
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="尚未建立关系"
              body="可在右侧创建当前语言的词源或接触关系。"
            />
          )}
        </section>
        )}
        {mode === "single" ? (
          <aside className={styles.etymologyEditor}>
            <header>
              <strong>{editing ? "编辑关系" : "新建关系"}</strong>
              <span className={styles.editorHeaderActions}>
                {editing && (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={reset}
                  >
                    取消
                  </button>
                )}
                <ModeSwitch
                  mode={mode}
                  onMode={(value) => {
                    reset();
                    setMode(value);
                  }}
                />
              </span>
            </header>
            <Field label="关系类型">
              <select
                value={kind}
                onChange={(event) => {
                  const nextKind = event.target
                    .value as EtymologyRelation["kind"];
                  setKind(nextKind);
                  if (
                    nextKind === "borrowing" &&
                    sourceLanguageId === props.languageId
                  ) {
                    setSourceLanguageId("");
                    setSourceId("");
                    setSourceSearch("");
                  }
                }}
              >
                {etymologyTypeOptions()}
              </select>
            </Field>
            <Field label="来源语言">
              <select
                value={sourceLanguageId}
                onChange={(event) => {
                  setSourceLanguageId(event.target.value);
                  setSourceId("");
                  setSourceSearch("");
                }}
              >
                <option value="">项目外或未知来源</option>
                {languageOptions(sourceLanguages)}
              </select>
            </Field>
            {sourceLanguageId ? (
              <LexemeCombobox
                label={`检索${sourceLanguage?.name ?? "来源语言"}词条`}
                query={sourceSearch}
                onQuery={setSourceSearch}
                values={sourceLexemes}
                selectedId={sourceId}
                onSelect={(id) => {
                  setSourceId(id);
                  if (kind !== "derivation") {
                    setTargetPartOfSpeech(
                      lexemeById.get(id)?.partOfSpeech ?? ""
                    );
                  }
                }}
              />
            ) : (
              <Field label="来源形式" hint="来源不在项目中时填写。">
                <input
                  value={sourceForm}
                  onChange={(event) => setSourceForm(event.target.value)}
                />
              </Field>
            )}
            {kind === "borrowing" && sourceId && props.phase6 && (
              <section className={styles.borrowingFlow}>
                <header>
                  <strong>借词适配</strong>
                  <span>来源 → 音系映射 → 规则修复 → 候选审核</span>
                </header>
                <BorrowingProfileControls
                  profiles={borrowingProfiles}
                  selectedId={borrowingProfileId}
                  onSelect={setBorrowingProfileId}
                  onCopy={() =>
                    void copyBorrowingProfile().catch(report(props.onStatus))
                  }
                  onSave={(value) =>
                    void saveBorrowingProfile(value).catch(
                      report(props.onStatus)
                    )
                  }
                />
                <BorrowingLexurgyControls
                  stages={targetStages}
                  startId={lexurgyStartStageId}
                  endId={lexurgyEndStageId}
                  selection={lexurgySelection}
                  onStart={(id) => {
                    setLexurgyStartStageId(id);
                    setLexurgyEndStageId(id);
                  }}
                  onEnd={setLexurgyEndStageId}
                />
                {!lexemeById.get(sourceId)?.ipa && (
                  <Field
                    label="临时来源 IPA"
                    hint="只用于本次分析，不覆盖来源词条。"
                  >
                    <input
                      value={temporaryIpa}
                      onChange={(event) => setTemporaryIpa(event.target.value)}
                      placeholder="例如：tʰaŋ"
                    />
                  </Field>
                )}
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    borrowingBusy || Boolean(singleBorrowingBlocker)
                  }
                  onClick={() => void previewBorrowing()}
                >
                  {borrowingBusy ? "正在分析…" : "生成借词候选"}
                </button>
                {singleBorrowingBlocker && (
                  <div className={styles.borrowingBlocker} role="status">
                    {singleBorrowingBlocker}
                  </div>
                )}
                {borrowingError && (
                  <div className={styles.borrowingError} role="alert">
                    {borrowingError}
                  </div>
                )}
                {borrowingBatch && (
                  <BorrowingCandidateReview
                    batch={borrowingBatch}
                    aiAdjustments={aiBorrowingAdjustments}
                    onAskAi={props.onAskAi ? askBorrowingSuggestion : undefined}
                    onChange={(candidate) => {
                      setBorrowingBatch({
                        ...borrowingBatch,
                        candidates: borrowingBatch.candidates.map((value) =>
                          value.id === candidate.id ? candidate : value
                        ),
                      });
                      void props.phase6!.saveBorrowingCandidate(candidate);
                    }}
                    onCommit={() =>
                      void commitBorrowing().catch(report(props.onStatus))
                    }
                  />
                )}
              </section>
            )}
            <LexemeCombobox
              label="检索当前语言词条"
              query={targetSearch}
              onQuery={setTargetSearch}
              values={targetLexemes}
              selectedId={targetId}
              onSelect={setTargetId}
            />
            <div className={styles.targetActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setCreateTarget((value) => !value)}
              >
                新建当前语言词条
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!props.onAskAi || (!sourceId && !sourceForm.trim())}
                onClick={() =>
                  askAi(
                    sourceId
                      ? [lexemeById.get(sourceId)!]
                      : [
                          {
                            id: "",
                            romanized: sourceForm,
                            senses: [],
                            partOfSpeech: "",
                          },
                        ]
                  )
                }
              >
                用 AI 生成提案
              </button>
            </div>
            {createTarget && (
              <div className={styles.inlineLexemeForm}>
                <Field label="词形">
                  <input
                    value={targetForm}
                    onChange={(event) => setTargetForm(event.target.value)}
                  />
                </Field>
                <Field label="释义">
                  <input
                    value={targetMeaning}
                    onChange={(event) => setTargetMeaning(event.target.value)}
                  />
                </Field>
                <Field label="词性">
                  <input
                    value={targetPartOfSpeech}
                    onChange={(event) =>
                      setTargetPartOfSpeech(event.target.value)
                    }
                  />
                </Field>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!targetForm.trim() || !targetMeaning.trim()}
                  onClick={() =>
                    void createCurrentLexeme().catch(report(props.onStatus))
                  }
                >
                  创建并选中
                </button>
              </div>
            )}
            <Field label="关联历史事件">
              <select
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
              >
                <option value="">不关联</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name} · {event.startLabel || "年代未设置"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="可信度">
              <select
                value={confidenceValue}
                onChange={(event) =>
                  setConfidenceValue(
                    event.target.value as EtymologyRelation["confidence"]
                  )
                }
              >
                {confidenceOptions()}
              </select>
            </Field>
            <Field label="证据与备注">
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <button
              className={styles.primaryButton}
              disabled={
                !targetId ||
                (!sourceId && !sourceForm.trim()) ||
                sourceId === targetId
              }
              onClick={() => void save().catch(report(props.onStatus))}
            >
              {editing ? "保存修改" : "保存关系"}
            </button>
          </aside>
        ) : (
          <aside className={styles.batchEditor}>
            <header>
              <strong>新建关系</strong>
              <span className={styles.editorHeaderActions}>
                <small>
                  {Object.values(batchSelected).filter(Boolean).length} 项已选择
                </small>
                <ModeSwitch
                  mode={mode}
                  onMode={(value) => {
                    reset();
                    setMode(value);
                  }}
                />
              </span>
            </header>
            <div className={styles.batchFilters}>
              <Field label="关系类型">
                <select
                  value={kind}
                  onChange={(event) => {
                    const nextKind = event.target
                      .value as EtymologyRelation["kind"];
                    setKind(nextKind);
                    if (
                      nextKind === "borrowing" &&
                      sourceLanguageId === props.languageId
                    ) {
                      setSourceLanguageId("");
                      setBatchSelected({});
                      setBatchDrafts({});
                    }
                  }}
                >
                  {etymologyTypeOptions()}
                </select>
              </Field>
              <Field label="来源语言">
                <select
                  value={sourceLanguageId}
                  onChange={(event) => {
                    setSourceLanguageId(event.target.value);
                    setBatchSelected({});
                    setBatchDrafts({});
                  }}
                >
                  <option value="">请选择</option>
                  {languageOptions(sourceLanguages)}
                </select>
              </Field>
              <Field label="搜索">
                <input
                  value={batchSearch}
                  onChange={(event) => setBatchSearch(event.target.value)}
                  placeholder="词形、释义或备注"
                />
              </Field>
              <Field label="词性">
                <select
                  value={batchPartOfSpeech}
                  onChange={(event) => setBatchPartOfSpeech(event.target.value)}
                >
                  <option value="">全部</option>
                  {batchParts.map((part) => (
                    <option key={part}>{part}</option>
                  ))}
                </select>
              </Field>
              <Field label="可信度">
                <select
                  value={confidenceValue}
                  onChange={(event) =>
                    setConfidenceValue(
                      event.target.value as EtymologyRelation["confidence"]
                    )
                  }
                >
                  {confidenceOptions()}
                </select>
              </Field>
            </div>
            <div className={styles.batchTable}>
              <div className={styles.batchHead}>
                <span>选择</span>
                <span>来源词</span>
                <span>目标词形</span>
                <span>目标释义</span>
              </div>
              {batchCandidates.slice(0, 50).map((source) => (
                <div key={source.id}>
                  <input
                    type="checkbox"
                    checked={Boolean(batchSelected[source.id])}
                    onChange={(event) =>
                      toggleBatch(source, event.target.checked)
                    }
                    aria-label={`选择 ${source.romanized}`}
                  />
                  <span>
                    <strong>{source.romanized}</strong>
                    <small>{source.senses[0]?.definition ?? "无释义"}</small>
                  </span>
                  <input
                    disabled={!batchSelected[source.id]}
                    value={batchDrafts[source.id]?.form ?? ""}
                    onChange={(event) =>
                      setBatchDrafts((value) => ({
                        ...value,
                        [source.id]: {
                          form: event.target.value,
                          meaning: value[source.id]?.meaning ?? "",
                        },
                      }))
                    }
                  />
                  <input
                    disabled={!batchSelected[source.id]}
                    value={batchDrafts[source.id]?.meaning ?? ""}
                    onChange={(event) =>
                      setBatchDrafts((value) => ({
                        ...value,
                        [source.id]: {
                          form: value[source.id]?.form ?? "",
                          meaning: event.target.value,
                        },
                      }))
                    }
                  />
                </div>
              ))}
              {sourceLanguageId && !batchCandidates.length && (
                <div className={styles.batchEmpty}>没有匹配词条</div>
              )}
            </div>
            {kind === "borrowing" && sourceLanguageId && props.phase6 && (
              <>
                <BorrowingProfileControls
                  profiles={borrowingProfiles}
                  selectedId={borrowingProfileId}
                  onSelect={setBorrowingProfileId}
                  onCopy={() =>
                    void copyBorrowingProfile().catch(report(props.onStatus))
                  }
                  onSave={(value) =>
                    void saveBorrowingProfile(value).catch(
                      report(props.onStatus)
                    )
                  }
                />
                <BorrowingLexurgyControls
                  stages={targetStages}
                  startId={lexurgyStartStageId}
                  endId={lexurgyEndStageId}
                  selection={lexurgySelection}
                  onStart={(id) => {
                    setLexurgyStartStageId(id);
                    setLexurgyEndStageId(id);
                  }}
                  onEnd={setLexurgyEndStageId}
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={
                    borrowingBusy || Boolean(batchBorrowingBlocker)
                  }
                  onClick={() =>
                    void previewBorrowingSources(
                      batchCandidates.filter((value) => batchSelected[value.id])
                    )
                  }
                >
                  {borrowingBusy ? "正在分析…" : "生成借词候选"}
                </button>
                {batchBorrowingBlocker && (
                  <div className={styles.borrowingBlocker} role="status">
                    {batchBorrowingBlocker}
                  </div>
                )}
                {borrowingError && (
                  <div className={styles.borrowingError} role="alert">
                    {borrowingError}
                  </div>
                )}
                {borrowingBatch && (
                  <BorrowingCandidateReview
                    batch={borrowingBatch}
                    aiAdjustments={aiBorrowingAdjustments}
                    onAskAi={props.onAskAi ? askBorrowingSuggestion : undefined}
                    onChange={(candidate) => {
                      setBorrowingBatch({
                        ...borrowingBatch,
                        candidates: borrowingBatch.candidates.map((value) =>
                          value.id === candidate.id ? candidate : value
                        ),
                      });
                      void props.phase6!.saveBorrowingCandidate(candidate);
                    }}
                    onCommit={() =>
                      void commitBorrowing().catch(report(props.onStatus))
                    }
                  />
                )}
              </>
            )}
            <footer className={styles.batchFooter}>
              {kind !== "borrowing" && (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={
                    !props.onAskAi ||
                    !Object.values(batchSelected).some(Boolean)
                  }
                  onClick={() =>
                    askAi(
                      batchCandidates.filter((value) => batchSelected[value.id])
                    )
                  }
                >
                  用 AI 生成目标词提案
                </button>
              )}
              {kind !== "borrowing" && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={!Object.values(batchSelected).some(Boolean)}
                  onClick={() => void saveBatch().catch(report(props.onStatus))}
                >
                  创建所选关系
                </button>
              )}
            </footer>
          </aside>
        )}
      </div>
    </section>
  );
}

type ChronologySelection = { ids: string[]; names: string[]; error?: string };

function resolveChronologySelection(
  stages: LanguageStage[],
  startId: string,
  endId: string
): ChronologySelection {
  if (!startId && !endId) return { ids: [], names: [] };
  if (!startId || !endId) {
    return { ids: [], names: [], error: "请同时选择借入阶段和演化终点。" };
  }
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const reversed: LanguageStage[] = [];
  const visited = new Set<string>();
  let current = byId.get(endId);
  while (current && !visited.has(current.id)) {
    reversed.push(current);
    if (current.id === startId) {
      const chain = reversed.reverse();
      return {
        ids: chain.map((stage) => stage.id),
        names: chain.map((stage) => stage.name),
      };
    }
    visited.add(current.id);
    current = current.chronologyParentId
      ? byId.get(current.chronologyParentId)
      : undefined;
  }
  return {
    ids: [],
    names: [],
    error: "两个阶段之间没有唯一、连续的时间父链。请调整选择。",
  };
}

function BorrowingLexurgyControls(props: {
  stages: LanguageStage[];
  startId: string;
  endId: string;
  selection: ChronologySelection;
  onStart: (id: string) => void;
  onEnd: (id: string) => void;
}) {
  return (
    <details className={styles.lexurgyOptions}>
      <summary>
        历史演化（可选）
        <span
          className={styles.inlineHelp}
          title="仅当借入阶段与演化终点属于目标语言的同一条连续时间链，且链上每个阶段都已有可运行的 Lexurgy 演化规则时可用。"
          aria-label="查看历史演化可用条件"
        >
          ？
        </span>
      </summary>
      <div className={styles.lexurgyFields}>
        <Field label="借入阶段">
          <select
            value={props.startId}
            onChange={(event) => props.onStart(event.target.value)}
          >
            <option value="">不运行 Lexurgy</option>
            {props.stages.map((stage) => (
              <option
                key={stage.id}
                value={stage.id}
                disabled={stage.storageMode === "no_data"}
              >
                {stage.name}
                {stage.storageMode === "no_data" ? "（无记录）" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="演化终点">
          <select
            value={props.endId}
            disabled={!props.startId}
            onChange={(event) => props.onEnd(event.target.value)}
          >
            <option value="">请选择</option>
            {props.stages.map((stage) => (
              <option
                key={stage.id}
                value={stage.id}
                disabled={stage.storageMode === "no_data"}
              >
                {stage.name}
                {stage.storageMode === "no_data" ? "（无记录）" : ""}
              </option>
            ))}
          </select>
        </Field>
        {props.selection.error ? (
          <span className={styles.inlineError}>{props.selection.error}</span>
        ) : props.selection.names.length > 0 ? (
          <span className={styles.chainPreview}>
            {props.selection.names.join(" → ")}
          </span>
        ) : null}
      </div>
    </details>
  );
}

function BorrowingProfileControls(props: {
  profiles: BorrowingProfile[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCopy: () => void;
  onSave: (profile: BorrowingProfile) => void;
}) {
  const selected = props.profiles.find(
    (value) => value.id === props.selectedId
  );
  const [draft, setDraft] = useState<BorrowingProfile>();
  const [mappingText, setMappingText] = useState("");
  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : undefined);
    setMappingText(
      selected?.config.explicitMappings
        .map((value) => `${value.source}=${value.targets.join(",")}`)
        .join("\n") ?? ""
    );
  }, [selected]);
  return (
    <div className={styles.profileToolbar}>
      <div className={styles.profilePickerRow}>
        <label>
          <span>借词方案</span>
          <select
            value={props.selectedId}
            onChange={(event) => props.onSelect(event.target.value)}
          >
            {!props.profiles.length && (
              <option value="">首次生成时建立默认方案</option>
            )}
            {props.profiles.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
                {value.isDefault ? " · 默认" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={props.onCopy}
        >
          复制方案
        </button>
      </div>
      {draft && (
        <details>
          <summary>编辑当前方案</summary>
          <div className={styles.profileEditor}>
            <Field label="方案名称">
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>
            <Field label="候选数（1–10）">
              <input
                type="number"
                min={1}
                max={10}
                value={draft.config.candidateCount}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    config: {
                      ...draft.config,
                      candidateCount: Math.max(
                        1,
                        Math.min(10, Number(event.target.value) || 1)
                      ),
                    },
                  })
                }
              />
            </Field>
            <div className={styles.mappingField}>
              <Field
                label="显式映射"
                hint="每行一条：来源=目标1,目标2。显式映射优先于 PanPhon。"
              >
                <textarea
                  value={mappingText}
                  onChange={(event) => setMappingText(event.target.value)}
                />
              </Field>
            </div>
            <div className={styles.profileActions}>
              <label className={styles.profileDefault}>
                <input
                  type="checkbox"
                  checked={draft.isDefault}
                  onChange={(event) =>
                    setDraft({ ...draft, isDefault: event.target.checked })
                  }
                />
                设为此语言对的默认方案
              </label>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!draft.name.trim()}
                onClick={() =>
                  props.onSave({
                    ...draft,
                    config: {
                      ...draft.config,
                      explicitMappings: parseExplicitMappings(mappingText),
                    },
                  })
                }
              >
                保存方案
              </button>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function borrowingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ANALYSIS_MISSING")) {
    return "没有找到 PanPhon 分析组件。请安装本次修复后的安装包后重试。";
  }
  if (message.includes("ANALYSIS_START")) {
    return "PanPhon 分析组件启动失败。请关闭应用后重试；若仍失败，请保留此提示用于排查。";
  }
  if (message.includes("ANALYSIS_TIMEOUT")) {
    return "PanPhon 分析超时，本次没有写入任何词条。";
  }
  return message || "借词候选生成失败，本次没有写入任何词条。";
}

function BorrowingCandidateReview(props: {
  batch: BorrowingBatch;
  onChange: (candidate: BorrowingCandidate) => void;
  onCommit: () => void;
  onAskAi?: () => void;
  aiAdjustments?: string[];
}) {
  const update = (
    candidate: BorrowingCandidate,
    patch: Partial<BorrowingCandidate>
  ) => props.onChange({ ...candidate, ...patch });
  return (
    <div className={styles.borrowingCandidates}>
      {Boolean(props.aiAdjustments?.length) && (
        <details className={styles.aiBorrowingAdjustments}>
          <summary>AI 建议的当前批次调整（{props.aiAdjustments!.length}）</summary>
          <p>这些调整只作为本次审核参考，不会修改已保存的借词方案。</p>
          <ul>
            {props.aiAdjustments!.map((adjustment, index) => (
              <li key={`${index}:${adjustment}`}>{adjustment}</li>
            ))}
          </ul>
        </details>
      )}
      <div className={styles.borrowingHead}>
        <span>保留</span>
        <span>来源 / IPA</span>
        <span>适配词形 / IPA</span>
        <span>词性 / 释义</span>
        <span>距离</span>
        <span>配列警告</span>
        <span>形态</span>
        <span>历史演化</span>
        <span>AI</span>
        <span>轨迹</span>
      </div>
      {props.batch.candidates.map((candidate) => {
        const aiRecommendation = [...candidate.trace]
          .reverse()
          .find((step) => step.step === "ai_recommendation");
        const aiAction = String(aiRecommendation?.action ?? "");
        return (
          <div key={candidate.id}>
          <input
            type="checkbox"
            checked={candidate.status === "accepted"}
            onChange={(event) =>
              update(candidate, {
                status: event.target.checked ? "accepted" : "pending",
              })
            }
            aria-label={`保留 ${candidate.adaptedForm}`}
          />
          <span>
            <strong>{candidate.sourceForm}</strong>
            <small>{candidate.sourceIpa}</small>
          </span>
          <label>
            <input
              value={candidate.adaptedForm}
              onChange={(event) =>
                update(candidate, { adaptedForm: event.target.value })
              }
            />
            <input
              value={candidate.adaptedIpa}
              aria-label={`${candidate.adaptedForm} 的 IPA`}
              onChange={(event) =>
                update(candidate, { adaptedIpa: event.target.value })
              }
            />
          </label>
          <label>
            <input
              value={candidate.partOfSpeech}
              onChange={(event) =>
                update(candidate, { partOfSpeech: event.target.value })
              }
            />
            <input
              value={candidate.senses[0]?.definition ?? ""}
              aria-label={`${candidate.adaptedForm} 的核心释义`}
              onChange={(event) =>
                update(candidate, {
                  senses: [
                    { definition: event.target.value, position: 0 },
                    ...candidate.senses.slice(1),
                  ],
                })
              }
            />
          </label>
          <span>{candidate.distance?.toFixed(2) ?? "—"}</span>
          <span>{candidate.warnings.join("；") || "无"}</span>
          <span>
            {candidate.morphemeIds.length
              ? `${candidate.morphemeIds.length} 个语素`
              : "未启用"}
          </span>
          <span>
            {candidate.evolvedForm ? candidate.evolvedForm : "未运行"}
          </span>
          <span className={aiRecommendation ? styles.aiBorrowingStatus : undefined}>
            {aiAction === "reject"
              ? "AI 拒绝"
              : aiAction === "adjust"
                ? "AI 已调整"
                : aiAction === "keep"
                  ? "AI 保留"
                  : props.batch.llmModelLabel
                    ? "未推荐"
                    : "未使用"}
          </span>
          <details>
            <summary>查看</summary>
            <pre>{JSON.stringify(candidate.trace, null, 2)}</pre>
          </details>
          </div>
        );
      })}
      <footer>
        <span>
          {
            props.batch.candidates.filter(
              (value) => value.status === "accepted"
            ).length
          }{" "}
          项待写入
        </span>
        {props.onAskAi && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={props.onAskAi}
          >
            请 AI 比较候选
          </button>
        )}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={
            !props.batch.candidates.some((value) => value.status === "accepted")
          }
          onClick={props.onCommit}
        >
          写入所选借词
        </button>
      </footer>
    </div>
  );
}

function parseExplicitMappings(
  value: string
): BorrowingProfile["config"]["explicitMappings"] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [source, targets = ""] = line.split("=");
      if (!source?.trim() || !targets.trim())
        throw new Error(`显式映射第 ${index + 1} 行格式无效。`);
      return {
        source: source.trim(),
        targets: targets
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        priority: index,
      };
    });
}

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: "single" | "batch";
  onMode: (mode: "single" | "batch") => void;
}) {
  return (
    <span className={styles.modeSwitch} role="group" aria-label="新建关系方式">
      <button
        type="button"
        aria-pressed={mode === "single"}
        onClick={() => onMode("single")}
      >
        单条
      </button>
      <button
        type="button"
        aria-pressed={mode === "batch"}
        onClick={() => onMode("batch")}
      >
        批量
      </button>
    </span>
  );
}

function lexemeProposalValue(patch: Record<string, unknown>) {
  const senses = Array.isArray(patch.senses) ? patch.senses : [];
  const firstSense = senses[0];
  const meaning =
    firstSense && typeof firstSense === "object"
      ? String((firstSense as Record<string, unknown>).definition ?? "")
      : String(patch.meaning ?? "");
  return {
    romanized: String(patch.romanized ?? "").trim(),
    meaning: meaning.trim(),
    partOfSpeech: String(patch.partOfSpeech ?? "").trim(),
  };
}

function lexemeSourceType(
  kind: EtymologyRelation["kind"]
): Lexeme["sourceType"] {
  if (kind === "borrowing" || kind === "calque") return "imported";
  if (kind === "derivation") return "derived";
  return "manual";
}

function defaultBorrowingConfig(): BorrowingProfile["config"] {
  return {
    explicitMappings: [],
    distanceWeights: {},
    epenthesis: [],
    deletionRules: [],
    replacementRules: [],
    repairOrder: ["replace", "insert", "delete", "resyllabify"],
    stressStrategy: "target_default",
    toneStrategy: "target_default",
    candidateCount: 3,
    maxSearchAttempts: 100,
  };
}

function relationshipAiConstraint(kind: EtymologyRelation["kind"]): string {
  switch (kind) {
    case "borrowing":
      return "借入：将来源词适配到目标语言的音系/正字法；保留核心释义与词性。不得添加派生词缀，不得把名词改成动词等。";
    case "calque":
      return "仿译：翻译来源词的语义或构词结构，保留核心释义与词性；不要音译，也不要无依据改变词类。";
    case "inheritance":
      return "继承：生成来源词的历史延续形式，保留核心释义与词性，只做可解释的历时音变。";
    case "cognate":
      return "同源：生成来自共同祖形的对应词，保持同一核心概念与词性，不要写成借入或派生。";
    case "derivation":
      return "派生：使用目标语言的形态规则形成新词；只有用户要求或构词规则必然导致时才改变词性。";
    default:
      return "关系未确定：采取保守策略，保留来源词核心释义与词性，不假定借入、派生或继承。";
  }
}

function LexemeCombobox(props: {
  label: string;
  query: string;
  onQuery: (value: string) => void;
  values: LexemeChoice[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = props.values.find((value) => value.id === props.selectedId);
  const visible =
    !selected && props.query.trim().length > 0 ? props.values.slice(0, 20) : [];
  return (
    <div className={styles.lexemeCombobox}>
      <label>
        <span>{props.label}</span>
        <input
          value={props.query}
          onChange={(event) => {
            props.onQuery(event.target.value);
            props.onSelect("");
          }}
          placeholder="输入词形或释义…"
          role="combobox"
          aria-expanded={visible.length > 0}
          aria-controls={`${props.label}-results`}
          name={props.label + "-search"}
          autoComplete="off"
        />
      </label>
      {selected && (
        <div className={styles.lexemeSelection}>
          <span>
            <strong>{selected.romanized}</strong>
            <small>{selected.senses[0]?.definition ?? "无释义"}</small>
          </span>
          <button
            type="button"
            onClick={() => {
              props.onSelect("");
              props.onQuery("");
            }}
          >
            更换
          </button>
        </div>
      )}
      {visible.length > 0 && (
        <div
          id={`${props.label}-results`}
          className={styles.lexemeResults}
          role="listbox"
        >
          {visible.map((value) => (
            <button
              key={value.id}
              type="button"
              role="option"
              aria-selected={value.id === props.selectedId}
              onClick={() => {
                props.onSelect(value.id);
                props.onQuery("");
              }}
            >
              <strong>{value.romanized}</strong>
              <span>{value.senses[0]?.definition ?? "无释义"}</span>
            </button>
          ))}
        </div>
      )}
      {!selected && props.query.trim() && !visible.length && (
        <small className={styles.lexemeNoResults}>没有匹配词条</small>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field} data-wide={wide || undefined}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className={styles.emptyState}>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && onAction && (
        <button className={styles.secondaryButton} onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function ConfirmDeleteButton({
  className,
  label = "删除",
  onConfirm,
}: {
  className: string;
  label?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      className={className}
      aria-label={armed ? `确认${label}` : label}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? "确认删除" : "删除"}
    </button>
  );
}

async function readStageContext(
  application: Phase5Application,
  stage: LanguageStage
) {
  return (
    (await application.getStageContext(stage.id)) ?? emptyStageContext(stage.id)
  );
}
function emptyStageContext(stageId: string): StageContextRecord {
  return {
    stageId,
    background: "",
    evidenceNotes: "",
    sources: [],
    updatedAt: new Date().toISOString(),
  };
}
function stageOptions(stages: LanguageStage[]) {
  return stages.map((stage) => (
    <option value={stage.id} key={stage.id}>
      {stage.kind === "internal_default" ? "默认状态" : stage.name} ·{" "}
      {period(stage)}
    </option>
  ));
}
function languageOptions(languages: Language[]) {
  return languages.map((language) => (
    <option key={language.id} value={language.id}>
      {language.name}
    </option>
  ));
}
function lexemeOption(value: LexemeChoice) {
  return (
    <option key={value.id} value={value.id}>
      {lexemeLabel(value)}
    </option>
  );
}
function lexemeLabel(value: LexemeChoice) {
  return `${value.romanized} · ${value.senses[0]?.definition ?? "无释义"}（${
    value.languageName
  }）`;
}
function matchesLexeme(value: LexemeChoice, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return (
    value.romanized.toLocaleLowerCase().includes(normalized) ||
    value.partOfSpeech.toLocaleLowerCase().includes(normalized) ||
    value.notes.toLocaleLowerCase().includes(normalized) ||
    value.senses.some((sense) =>
      sense.definition.toLocaleLowerCase().includes(normalized)
    )
  );
}
function period(stage: LanguageStage) {
  return (
    [stage.startLabel, stage.endLabel].filter(Boolean).join("—") || "年代未设置"
  );
}
function stageKind(value: LanguageStage["kind"]) {
  return value === "historical_stage"
    ? "历史阶段"
    : value === "lightweight_dialect"
    ? "轻量方言"
    : "默认状态";
}
function documentation(value: LanguageStage["documentationStatus"]) {
  return value === "recorded"
    ? "有记录"
    : value === "partial"
    ? "部分记录"
    : value === "unrecorded"
    ? "无记录"
    : "重构";
}
function relationKind(value: LanguageRelation["kind"]) {
  return value === "genetic" ? "继承" : value === "contact" ? "接触" : "方言";
}
function relationshipDirection(
  kind: LanguageRelation["kind"],
  currentIsSource: boolean
) {
  if (kind === "genetic") return currentIsSource ? "后代" : "祖先";
  if (kind === "dialect") return currentIsSource ? "方言分支" : "基础语言";
  return currentIsSource ? "由当前语言发起" : "指向当前语言";
}
function relationshipRoleOptions(kind: LanguageRelation["kind"]) {
  if (kind === "genetic")
    return (
      <>
        <option value="target">当前语言是后代</option>
        <option value="source">当前语言是祖先</option>
      </>
    );
  if (kind === "dialect")
    return (
      <>
        <option value="target">当前语言是方言</option>
        <option value="source">当前语言是基础语言</option>
      </>
    );
  return (
    <>
      <option value="source">当前语言 → 对方</option>
      <option value="target">对方 → 当前语言</option>
    </>
  );
}
function eventType(value: HistoricalEvent["eventType"]) {
  return value === "migration"
    ? "迁徙"
    : value === "contact"
    ? "语言接触"
    : value === "split"
    ? "分化"
    : value === "standardization"
    ? "标准化"
    : value === "political"
    ? "政治"
    : value === "cultural"
    ? "文化"
    : "其他";
}
function eventTypeOptions() {
  return (
    <>
      <option value="migration">迁徙</option>
      <option value="contact">语言接触</option>
      <option value="split">分化</option>
      <option value="standardization">标准化</option>
      <option value="political">政治</option>
      <option value="cultural">文化</option>
      <option value="other">其他</option>
    </>
  );
}
function etymologyKind(value: EtymologyRelation["kind"]) {
  return value === "inheritance"
    ? "继承"
    : value === "borrowing"
    ? "借入"
    : value === "cognate"
    ? "同源"
    : value === "derivation"
    ? "派生"
    : value === "calque"
    ? "仿译"
    : "未知";
}
function etymologyTypeOptions() {
  return (
    <>
      <option value="inheritance">继承</option>
      <option value="borrowing">借入</option>
      <option value="cognate">同源</option>
      <option value="derivation">派生</option>
      <option value="calque">仿译</option>
      <option value="unknown">未知</option>
    </>
  );
}
function confidence(
  value: EtymologyRelation["confidence"] | LanguageRelation["confidence"]
) {
  return value === "confirmed"
    ? "已确认"
    : value === "probable"
    ? "较可能"
    : value === "possible"
    ? "可能"
    : "有争议";
}
function confidenceOptions() {
  return (
    <>
      <option value="confirmed">已确认</option>
      <option value="probable">较可能</option>
      <option value="possible">可能</option>
      <option value="disputed">有争议</option>
    </>
  );
}
function normalizeLanguageProfile(
  value?: Partial<LanguageProfile>
): LanguageProfile {
  return {
    nativeName: value?.nativeName ?? "",
    code: value?.code ?? "",
    aliases: value?.aliases ?? "",
    description: value?.description ?? "",
    tags: value?.tags ?? "",
    status: value?.status ?? "",
    speakers: value?.speakers ?? "",
    population: value?.population ?? "",
    region: value?.region ?? "",
    startLabel: value?.startLabel ?? "",
    endLabel: value?.endLabel ?? "",
    socialStatus: value?.socialStatus ?? "",
    officialStatus: value?.officialStatus ?? "",
    currentWritingSystem: value?.currentWritingSystem ?? "",
    historicalWritingSystems: value?.historicalWritingSystems ?? "",
    orthographies: value?.orthographies ?? "",
    notes: value?.notes ?? "",
  };
}
function report(onStatus: (message: string) => void) {
  return (reason: unknown) =>
    onStatus(reason instanceof Error ? reason.message : String(reason));
}
