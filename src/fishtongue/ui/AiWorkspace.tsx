import {
  AI_PROVIDER_DEFAULTS,
  AiApplication,
  AiUiContext,
} from "@/fishtongue/application/ports/AiPorts";
import {
  AiContextScope,
  AiConversation,
  AiConversationDetail,
  AiProviderConfig,
  AiProviderKind,
} from "@/fishtongue/domain/models";
import styles from "@/fishtongue/ui/FishTongueDesktopApp.module.css";
import {
  ChatBubbleIcon,
  Cross2Icon,
  GearIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const PRIVACY_VERSION = 1;

export function AiSettingsPage({ ai, onStatus }: {
  ai: AiApplication;
  onStatus: (message: string) => void;
}) {
  const [configs, setConfigs] = useState<AiProviderConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<AiProviderConfig>(() => emptyConfig("openai"));
  const [secret, setSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const selected = configs.find((item) => item.id === selectedId);

  const refresh = useCallback(async () => {
    const values = await ai.listProviderConfigs();
    setConfigs(values);
    return values;
  }, [ai]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    setDraft(selected);
    setSecret("");
    setModels(selected.modelCache?.values.map((item) => item.id) ?? []);
    void ai.providerHasSecret(selected.id).then(setHasSecret);
  }, [ai, selected]);

  const chooseKind = (kind: AiProviderKind) => {
    setDraft((current) => ({
      ...current,
      kind,
      name: current.name || providerLabel(kind),
      baseUrl: kind === "openai_compatible"
        ? "http://127.0.0.1:11434/v1"
        : AI_PROVIDER_DEFAULTS[kind],
      privacyConsentVersion: undefined,
    }));
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await ai.saveProviderConfig(draft, secret || undefined);
      setHasSecret(hasSecret || Boolean(secret));
      setSecret("");
      setSelectedId(draft.id);
      await refresh();
      onStatus("AI 服务设置已保存；API Key 未写入项目。");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const loadModels = async () => {
    setBusy(true);
    try {
      const values = await ai.listModels(draft);
      setModels(values.map((item) => item.id));
      setDraft((current) => ({
        ...current,
        modelCache: {
          values,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }));
      onStatus(`读取到 ${values.length} 个模型。`);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      await ai.testConnection(draft, draft.defaultModel);
      onStatus("连接测试通过。该测试可能产生极少量模型用量。");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  return <div className={styles.aiSettingsLayout}>
    <aside className={styles.aiProviderList}>
      <div><strong>模型服务</strong><button aria-label="添加模型服务" onClick={() => {
        const next = emptyConfig("openai");
        setSelectedId(undefined);
        setDraft(next);
        setSecret("");
        setHasSecret(false);
      }}><PlusIcon /></button></div>
      {configs.map((config) => <button
        key={config.id}
        data-active={selectedId === config.id}
        onClick={() => setSelectedId(config.id)}
      ><span><strong>{config.name}</strong><small>{providerLabel(config.kind)} · {config.defaultModel}</small></span>
        <small>{config.enabled ? "已启用" : "已停用"}</small></button>)}
      {!configs.length && <p>还没有模型服务。右上角“＋”可以添加。</p>}
    </aside>
    <form className={styles.aiSettingsForm} onSubmit={save}>
      <div className={styles.aiSettingsHeading}><span><GearIcon /><strong>{selected ? "编辑模型服务" : "添加模型服务"}</strong></span>
        {selected && <button type="button" className={styles.dangerButton} onClick={async () => {
          await ai.deleteProviderConfig(selected.id);
          setSelectedId(undefined);
          setDraft(emptyConfig("openai"));
          await refresh();
          onStatus("模型服务和对应凭据已删除。");
        }}><TrashIcon />删除</button>}</div>
      <div className={styles.aiFormGrid}>
        <label><span>服务类型</span><select value={draft.kind} onChange={(event) => chooseKind(event.target.value as AiProviderKind)}>
          <option value="openai">OpenAI</option><option value="gemini">Gemini</option>
          <option value="deepseek">DeepSeek</option><option value="openai_compatible">OpenAI 兼容服务</option>
        </select></label>
        <label><span>显示名称</span><input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
        <label className={styles.aiWideField}><span>服务地址</span><input value={draft.baseUrl} readOnly={draft.kind !== "openai_compatible"} onChange={(event) => setDraft((value) => ({
          ...value, baseUrl: event.target.value, privacyConsentVersion: undefined,
        }))} /><small>官方服务地址固定；自定义远程地址必须使用 HTTPS，本机服务可使用 HTTP。</small></label>
        <label><span>API Key</span><input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={hasSecret ? "已安全保存；留空表示不更换" : "输入 API Key"} /></label>
        <label><span>默认模型</span><input list="ai-model-list" value={draft.defaultModel} onChange={(event) => setDraft((value) => ({ ...value, defaultModel: event.target.value }))} />
          <datalist id="ai-model-list">{models.map((model) => <option value={model} key={model} />)}</datalist></label>
      </div>
      <div className={styles.aiPrivacyPanel}>
        <strong>联网与项目数据</strong>
        <p>发送问题时，所选范围内的项目内容会传给该服务。对话和引用随项目保存；API Key 只保存在当前 Windows 用户的凭据管理器中。</p>
        <label><input type="checkbox" checked={draft.privacyConsentVersion === PRIVACY_VERSION} onChange={(event) => setDraft((value) => ({
          ...value, privacyConsentVersion: event.target.checked ? PRIVACY_VERSION : undefined,
        }))} />我了解并同意在使用该服务时发送所选项目上下文</label>
      </div>
      <div className={styles.aiSettingsActions}>
        <label><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((value) => ({ ...value, enabled: event.target.checked }))} />启用</label>
        <label><input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft((value) => ({ ...value, isDefault: event.target.checked }))} />设为默认</label>
        <span />
        <button type="button" disabled={busy || !hasSecret} onClick={() => void loadModels()}>刷新模型</button>
        <button type="button" disabled={busy || !hasSecret || !draft.defaultModel} onClick={() => void test()}>测试连接</button>
        <button className={styles.primaryButton} disabled={busy || !draft.privacyConsentVersion} type="submit">保存设置</button>
      </div>
    </form>
  </div>;
}

export function AiSidebar({ ai, context, live, onClose, onSettings, onStatus }: {
  ai: AiApplication;
  context: AiUiContext;
  live: boolean;
  onClose: () => void;
  onSettings: () => void;
  onStatus: (message: string) => void;
}) {
  const [configs, setConfigs] = useState<AiProviderConfig[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AiConversationDetail>();
  const [scope, setScope] = useState<AiContextScope>("page");
  const [allowExpansion, setAllowExpansion] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [streamed, setStreamed] = useState("");
  const [busy, setBusy] = useState(false);
  const activeConfig = useMemo(
    () => configs.find((item) => item.isDefault && item.enabled) ?? configs.find((item) => item.enabled),
    [configs]
  );
  const reload = useCallback(async () => {
    const [providerValues, conversationValues] = await Promise.all([
      ai.listProviderConfigs(),
      live ? ai.listConversations(context.projectId) : Promise.resolve([]),
    ]);
    setConfigs(providerValues);
    setConversations(conversationValues);
    if (!selectedId && conversationValues[0]) setSelectedId(conversationValues[0].id);
  }, [ai, context.projectId, live, selectedId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!selectedId) return setDetail(undefined);
    void ai.loadConversation(selectedId).then((value) => {
      setDetail(value);
      setScope(value.conversation.contextScope);
      setAllowExpansion(value.conversation.allowExpansion);
    });
  }, [ai, selectedId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!live || !activeConfig || !prompt.trim()) return;
    setBusy(true);
    setStreamed("");
    try {
      let conversation = detail?.conversation;
      if (!conversation) {
        conversation = await ai.createConversation({
          projectId: context.projectId, languageId: context.languageId,
          provider: activeConfig, modelId: activeConfig.defaultModel,
          scope, allowExpansion,
        });
        setSelectedId(conversation.id);
      }
      const next = await ai.send({
        conversation: { ...conversation, contextScope: scope, allowExpansion },
        prompt,
        ui: context,
        onEvent: (message) => {
          if (message.type === "text") setStreamed((value) => value + message.text);
        },
      });
      setDetail(next);
      setPrompt("");
      setStreamed("");
      await reload();
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };
  const latestAudit = detail?.audits.at(-1);
  return <aside className={styles.aiSidebar}>
    <div className={styles.aiHeader}><span><ChatBubbleIcon /><strong>AI 助手</strong></span>
      <span><button title="AI 设置" aria-label="AI 设置" onClick={onSettings}><GearIcon /></button>
      <button title="关闭 AI 侧栏" aria-label="关闭 AI 侧栏" onClick={onClose}><Cross2Icon /></button></span></div>
    <div className={styles.aiSessionBar}>
      <select aria-label="AI 会话" value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || undefined)}>
        <option value="">新对话</option>
        {conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
      <button title="新建对话" aria-label="新建对话" onClick={() => { setSelectedId(undefined); setDetail(undefined); }}><PlusIcon /></button>
      <button title="删除当前对话" aria-label="删除当前对话" disabled={!selectedId} onClick={async () => {
        if (!selectedId) return;
        await ai.deleteConversation(selectedId);
        setSelectedId(undefined); setDetail(undefined); await reload();
      }}><TrashIcon /></button>
    </div>
    <div className={styles.contextScope}><strong>发送范围</strong>
      {(["page", "language", "project"] as const).map((value) => <label key={value}><input type="radio" name="scope" checked={scope === value} onChange={() => setScope(value)} disabled={value === "language" && !context.languageId} />{value === "page" ? "当前页面" : value === "language" ? "当前语言" : "整个项目"}</label>)}
      <label className={styles.aiExpansion}><input type="checkbox" checked={allowExpansion} onChange={(event) => setAllowExpansion(event.target.checked)} />需要时扩大一层</label>
    </div>
    <div className={styles.aiConversation}>
      {!live && <div className={styles.emptyAi}><ChatBubbleIcon /><strong>请先打开真实项目</strong><p>设计原型不会作为 AI 上下文发送。</p></div>}
      {live && !activeConfig && <div className={styles.emptyAi}><GearIcon /><strong>尚未配置模型服务</strong><p>配置后才能发送项目上下文。</p><button onClick={onSettings}>打开 AI 设置</button></div>}
      {detail?.messages.map((message) => <article key={message.id} className={styles.aiMessage} data-role={message.role}>
        <small>{message.role === "user" ? "你" : `${message.providerLabel} · ${message.modelId}`}</small>
        <p>{message.content}</p>
      </article>)}
      {streamed && <article className={styles.aiMessage} data-role="assistant"><small>正在回答</small><p>{streamed}</p></article>}
      {latestAudit && <details className={styles.aiReferences}><summary>本次引用 {latestAudit.references.length} 项</summary>
        {latestAudit.references.map((reference) => <span key={`${reference.type}-${reference.id}`}><strong>{reference.label}</strong><small>{reference.detail}</small></span>)}</details>}
      {detail?.proposals.filter((proposal) => proposal.status !== "rejected").map((proposal) =>
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          onStage={(patch) => ai.stageProposal(proposal.id, patch)}
          onReject={() => ai.rejectProposal(proposal.id)}
          onApply={() => ai.applyProposal(proposal.id)}
          onReload={async () => setDetail(await ai.loadConversation(detail.conversation.id))}
          onStatus={onStatus}
        />)}
    </div>
    <form className={styles.aiComposer} onSubmit={send}><textarea aria-label="询问当前页面" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={live ? `将发送：${scope === "page" ? "当前页面" : scope === "language" ? "当前语言" : "整个项目"}` : "请先打开真实项目"} disabled={!live || !activeConfig || busy} />
      {busy ? <button type="button" aria-label="停止" onClick={() => void ai.cancel()}><StopIcon /></button> : <button disabled={!live || !activeConfig || !prompt.trim()}>发送</button>}</form>
  </aside>;
}

function ProposalCard({
  proposal, onStage, onReject, onApply, onReload, onStatus,
}: {
  proposal: import("@/fishtongue/domain/models").AiProposal;
  onStage: (patch: Record<string, unknown>) => Promise<void>;
  onReject: () => Promise<void>;
  onApply: () => Promise<void>;
  onReload: () => Promise<void>;
  onStatus: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(proposal.patch, null, 2));
  const reviewable = ["pending", "staged"].includes(proposal.status);
  const run = async (action: () => Promise<void>, success?: string) => {
    try {
      await action();
      await onReload();
      if (success) onStatus(success);
    } catch (error) {
      onStatus(error instanceof Error ? error.message : String(error));
      await onReload();
    }
  };
  return <article className={styles.proposalCard}>
    <span>{proposal.kind} · {proposal.status}</span><strong>{proposal.summary}</strong>
    <details open={editing}><summary>字段差异与编辑</summary>
      {editing
        ? <textarea aria-label="编辑提案字段" value={draft} onChange={(event) => setDraft(event.target.value)} />
        : <pre>{JSON.stringify(proposal.patch, null, 2)}</pre>}
    </details>
    <div>
      <button disabled={!reviewable} onClick={() => void run(onReject)}>拒绝</button>
      {editing
        ? <button disabled={!reviewable} onClick={() => void run(async () => {
            const value = JSON.parse(draft) as unknown;
            if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("提案字段必须是 JSON 对象。");
            await onStage(value as Record<string, unknown>);
            setEditing(false);
          }, "提案修改已暂存，尚未写入项目。")}>暂存修改</button>
        : <button disabled={!reviewable} onClick={() => setEditing(true)}>编辑</button>}
      <button className={styles.primaryButton} disabled={!reviewable} onClick={() => void run(onApply, "提案已通过验证并保存到项目。")}>验证并保存</button>
    </div>
  </article>;
}

function emptyConfig(kind: AiProviderKind): AiProviderConfig {
  return {
    id: crypto.randomUUID(), name: providerLabel(kind), kind,
    baseUrl: kind === "openai_compatible" ? "http://127.0.0.1:11434/v1" : AI_PROVIDER_DEFAULTS[kind],
    defaultModel: "", enabled: true, isDefault: false,
  };
}
function providerLabel(kind: AiProviderKind): string {
  return kind === "openai" ? "OpenAI" : kind === "gemini" ? "Gemini" : kind === "deepseek" ? "DeepSeek" : "自定义服务";
}
