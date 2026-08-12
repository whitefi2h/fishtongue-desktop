import {
  AI_PROVIDER_DEFAULTS,
  AiApplication,
  AiProposalDraft,
  AiUiContext,
} from "@/fishtongue/application/ports/AiPorts";
import {
  AiContextScope,
  AiConversation,
  AiConversationDetail,
  AiProviderConfig,
  AiProviderKind,
  AiProposal,
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
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";

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

export function AiSidebar({ ai, context, live, promptRequest, onClose, onSettings, onStatus, onDeliver, onDeliverMany, onProjectDataChanged = () => {} }: {
  ai: AiApplication;
  context: AiUiContext;
  live: boolean;
  promptRequest?: { id: string; prompt: string };
  onClose: () => void;
  onSettings: () => void;
  onStatus: (message: string) => void;
  onDeliver: (draft: AiProposalDraft) => void;
  onDeliverMany?: (drafts: AiProposalDraft[]) => void;
  onProjectDataChanged?: () => void;
}) {
  const [configs, setConfigs] = useState<AiProviderConfig[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<AiConversationDetail>();
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [scope, setScope] = useState<AiContextScope>("page");
  const [allowExpansion, setAllowExpansion] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [streamed, setStreamed] = useState("");
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkMessageId, setBulkMessageId] = useState<string>();
  useEffect(() => {
    if (!promptRequest) return;
    setPrompt(promptRequest.prompt);
    setScope("language");
  }, [promptRequest]);
  const activeConfig = useMemo(
    () => configs.find((item) => item.id === providerId && item.enabled)
      ?? configs.find((item) => item.isDefault && item.enabled)
      ?? configs.find((item) => item.enabled),
    [configs, providerId]
  );
  const modelOptions = useMemo(() => {
    const values = activeConfig?.modelCache?.values.map((item) => item.id) ?? [];
    return [...new Set([modelId, activeConfig?.defaultModel, ...values].filter(Boolean) as string[])];
  }, [activeConfig, modelId]);
  const reload = useCallback(async () => {
    const [providerValues, conversationValues] = await Promise.all([
      ai.listProviderConfigs(),
      live ? ai.listConversations(context.projectId) : Promise.resolve([]),
    ]);
    setConfigs(providerValues);
    setConversations(conversationValues);
    if (!providerId) {
      const preferred = providerValues.find((item) => item.isDefault && item.enabled)
        ?? providerValues.find((item) => item.enabled);
      if (preferred) {
        setProviderId(preferred.id);
        setModelId(preferred.defaultModel);
      }
    }
    if (!selectedId && conversationValues[0]) setSelectedId(conversationValues[0].id);
  }, [ai, context.projectId, live, providerId, selectedId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!selectedId) return setDetail(undefined);
    void ai.loadConversation(selectedId).then((value) => {
      setDetail(value);
      setScope(value.conversation.contextScope);
      setAllowExpansion(value.conversation.allowExpansion);
      const provider = configs.find((item) =>
        item.name === value.conversation.providerLabel && item.enabled
      );
      if (provider) setProviderId(provider.id);
      setModelId(value.conversation.modelId);
    });
  }, [ai, configs, selectedId]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!live || !activeConfig || !modelId.trim() || !prompt.trim()) return;
    const submittedPrompt = prompt.trim();
    let conversation = detail?.conversation;
    setBusy(true);
    setStreamed("");
    setPendingUserMessage(submittedPrompt);
    try {
      if (!conversation) {
        conversation = await ai.createConversation({
          projectId: context.projectId, languageId: context.languageId,
          provider: activeConfig, modelId,
          scope, allowExpansion,
        });
        setSelectedId(conversation.id);
      } else if (
        conversation.providerLabel !== activeConfig.name
        || conversation.modelId !== modelId
      ) {
        conversation = await ai.updateConversationModel(
          conversation.id,
          activeConfig,
          modelId
        );
      }
      const next = await ai.send({
        conversation: { ...conversation, contextScope: scope, allowExpansion },
        prompt: submittedPrompt,
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
      setStreamed("");
      if (conversation) {
        try {
          const refreshed = await ai.loadConversation(conversation.id);
          setDetail(refreshed);
          const userMessageWasSaved = refreshed.messages.some((message) =>
            message.role === "user" && message.content === submittedPrompt
          );
          if (userMessageWasSaved) setPrompt("");
        } catch {
          // Keep the original prompt available when the conversation could not be reloaded.
        }
      }
      onStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingUserMessage("");
      setBusy(false);
    }
  };
  const streamedPreview = visibleStreamingText(streamed);
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
    <div className={styles.aiControlBar}>
      <label><span>服务</span><select aria-label="AI 服务" value={activeConfig?.id ?? ""} onChange={(event) => {
        const provider = configs.find((item) => item.id === event.target.value);
        setProviderId(event.target.value);
        setModelId(provider?.defaultModel ?? "");
      }}>
        {configs.filter((item) => item.enabled).map((item) =>
          <option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <label><span>模型</span><select aria-label="AI 模型" value={modelId} onChange={(event) => setModelId(event.target.value)}>
        {modelOptions.map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label>
    </div>
    <div className={styles.contextScope}>
      <label><span>发送范围</span><select aria-label="发送范围" value={scope} onChange={(event) => setScope(event.target.value as AiContextScope)}>
        <option value="page">当前页面</option>
        <option value="language" disabled={!context.languageId}>当前语言</option>
        <option value="project">整个项目</option>
      </select></label>
      <label className={styles.aiExpansion}><input type="checkbox" checked={allowExpansion} onChange={(event) => setAllowExpansion(event.target.checked)} />需要时扩大一层</label>
    </div>
    <div className={styles.aiConversation}>
      {!live && <div className={styles.emptyAi}><ChatBubbleIcon /><strong>请先打开真实项目</strong><p>设计原型不会作为 AI 上下文发送。</p></div>}
      {live && !activeConfig && <div className={styles.emptyAi}><GearIcon /><strong>尚未配置模型服务</strong><p>配置后才能发送项目上下文。</p><button onClick={onSettings}>打开 AI 设置</button></div>}
      {detail?.messages.map((message) => {
        const messageProposals = detail.proposals.filter((proposal) =>
          proposal.messageId === message.id
        );
        const proposals = messageProposals.filter((proposal) => proposal.status !== "rejected");
        const audit = detail.audits.find((item) => item.messageId === message.id);
        const multiEditable = messageProposals.length > 1 && messageProposals.every((proposal) =>
          ["lexeme.upsert", "morpheme.upsert"].includes(proposal.kind)
        );
        return <Fragment key={message.id}>
          <article className={styles.aiMessage} data-role={message.role}>
            <small>{message.role === "user" ? "你" : `${message.providerLabel} · ${message.modelId}`}</small>
            <p>{message.content}</p>
          </article>
          {message.role === "assistant" && audit && <details className={styles.aiReferences}><summary>本次引用 {audit.references.length} 项</summary>
            {audit.references.map((reference) => <span key={`${reference.type}-${reference.id}`}><strong>{reference.label}</strong><small>{reference.detail}</small></span>)}</details>}
          {message.role === "assistant" && multiEditable
            ? <button className={styles.aiBatchReviewButton} onClick={() => {
                if (!onDeliverMany) {
                  setBulkMessageId(message.id);
                  return;
                }
                void Promise.all(messageProposals.map((proposal) =>
                  ai.stageProposal(proposal.id, proposal.patch)
                )).then(() => {
                  onDeliverMany(messageProposals.map((proposal) => ({
                    requestId: crypto.randomUUID(),
                    proposalId: proposal.id,
                    messageId: proposal.messageId,
                    kind: proposal.kind,
                    patch: proposal.patch,
                  })));
                  onStatus(`已将 ${messageProposals.length} 项提案填入语言接触批量表，尚未保存。`);
                }).catch((error) => onStatus(error instanceof Error ? error.message : String(error)));
              }}>{onDeliverMany ? `填入语言接触批量表（${messageProposals.length}）` : `审核这次生成的 ${messageProposals.length} 项提案`}</button>
            : proposals.map((proposal) => <ProposalCard
                key={proposal.id}
                proposal={proposal}
                onStage={(patch) => ai.stageProposal(proposal.id, patch)}
                onReject={() => ai.rejectProposal(proposal.id)}
                onApply={() => ai.applyProposal(proposal.id)}
                onDeliver={async () => {
                  await ai.stageProposal(proposal.id, proposal.patch);
                  onDeliver({
                    requestId: crypto.randomUUID(),
                    proposalId: proposal.id,
                    messageId: proposal.messageId,
                    kind: proposal.kind,
                    patch: proposal.patch,
                  });
                }}
                onReload={async () => setDetail(await ai.loadConversation(detail.conversation.id))}
                onStatus={onStatus}
              />)}
        </Fragment>;
      })}
      {pendingUserMessage && <article className={styles.aiMessage} data-role="user">
        <small>你</small><p>{pendingUserMessage}</p>
      </article>}
      {busy && <article className={styles.aiMessage} data-role="assistant">
        <small>正在回答</small>
        <p>{streamedPreview || "正在整理回答与提案…"}</p>
      </article>}
    </div>
    <form className={styles.aiComposer} onSubmit={send}><textarea aria-label="询问当前页面" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={live ? `将发送：${scope === "page" ? "当前页面" : scope === "language" ? "当前语言" : "整个项目"}` : "请先打开真实项目"} disabled={!live || !activeConfig || busy} />
      {busy ? <button className={styles.aiStopButton} type="button" aria-label="停止生成" onClick={() => void ai.cancel()}><StopIcon /><span>停止</span></button> : <button disabled={!live || !activeConfig || !modelId || !prompt.trim()}>发送</button>}</form>
    {bulkMessageId && detail && <BatchProposalDialog
      proposals={detail.proposals.filter((proposal) => proposal.messageId === bulkMessageId)}
      ai={ai}
      onClose={() => setBulkMessageId(undefined)}
      onReload={async () => setDetail(await ai.loadConversation(detail.conversation.id))}
      onStatus={onStatus}
      onProjectDataChanged={onProjectDataChanged}
    />}
  </aside>;
}

function visibleStreamingText(value: string): string {
  const proposalFence = value.search(/```fishtongue-proposals/i);
  const anyFence = value.indexOf("```");
  const unfencedProposal = value.search(/(?:^|\n)\s*\[\s*\{\s*"kind"\s*:/);
  const boundaries = [proposalFence, anyFence, unfencedProposal].filter(
    (index) => index >= 0
  );
  const boundary = boundaries.length ? Math.min(...boundaries) : value.length;
  return value.slice(0, boundary).trim();
}

function ProposalCard({
  proposal, onStage, onReject, onApply, onDeliver, onReload, onStatus, directCommit = false,
}: {
  proposal: AiProposal;
  onStage: (patch: Record<string, unknown>) => Promise<void>;
  onReject: () => Promise<void>;
  onApply: () => Promise<void>;
  onDeliver: () => Promise<void>;
  onReload: () => Promise<void>;
  onStatus: (message: string) => void;
  directCommit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => JSON.stringify(proposal.patch, null, 2));
  const reviewable = ["pending", "staged"].includes(proposal.status);
  const isBorrowingSuggestion = proposal.kind === "borrowing_adaptation.suggest";
  const deliverLabel = directCommit
    ? "确认并保存"
    : isBorrowingSuggestion
      ? "应用到候选表"
      : "填入编辑器";
  const deliverSuccess = directCommit
    ? "提案已确认并保存到项目。"
    : isBorrowingSuggestion
      ? "AI 建议已应用到当前候选表，尚未写入词典。"
      : "提案已填入对应编辑器，尚未保存。";
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
      <button className={styles.primaryButton} disabled={!reviewable} onClick={() => void run(
        directCommit ? onApply : onDeliver,
        deliverSuccess
      )}>{deliverLabel}</button>
    </div>
  </article>;
}

function BatchProposalDialog({ proposals, ai, onClose, onReload, onStatus, onProjectDataChanged }: {
  proposals: AiProposal[];
  ai: AiApplication;
  onClose: () => void;
  onReload: () => Promise<void>;
  onStatus: (message: string) => void;
  onProjectDataChanged: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>(() =>
    Object.fromEntries(proposals.map((proposal) => [proposal.id, proposal.patch]))
  );
  const [decisions, setDecisions] = useState<Record<string, "accept" | "reject">>(() =>
    Object.fromEntries(proposals.map((proposal) => [
      proposal.id,
      proposal.status === "rejected" ? "reject" : "accept",
    ]))
  );
  const [rowStatus, setRowStatus] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const reviewable = proposals.filter((proposal) =>
    ["pending", "staged", "rejected"].includes(proposal.status)
  );
  const acceptedCount = reviewable.filter((proposal) => decisions[proposal.id] === "accept").length;
  const rejectedCount = reviewable.length - acceptedCount;
  const saveDecisions = async () => {
    if (!reviewable.length || busy) return;
    setBusy(true);
    let saved = 0;
    let rejected = 0;
    for (const proposal of reviewable) {
      try {
        if (decisions[proposal.id] === "accept") {
          await ai.stageProposal(proposal.id, drafts[proposal.id]);
          await ai.applyProposal(proposal.id);
          saved += 1;
          setRowStatus((current) => ({ ...current, [proposal.id]: "已保存" }));
        } else {
          if (proposal.status !== "rejected") await ai.rejectProposal(proposal.id);
          rejected += 1;
          setRowStatus((current) => ({ ...current, [proposal.id]: "已拒绝" }));
        }
      } catch (error) {
        setRowStatus((current) => ({
          ...current,
          [proposal.id]: error instanceof Error ? error.message : String(error),
        }));
      }
    }
    await onReload();
    if (saved) onProjectDataChanged();
    onStatus(`批量审核完成：已保存 ${saved} 项，已拒绝 ${rejected} 项。`);
    setBusy(false);
  };
  return <div className={styles.aiBatchDialogBackdrop} role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={styles.aiBatchDialog} role="dialog" aria-modal="true" aria-label="批量审核 AI 提案">
      <div className={styles.aiBatchDialogHeader}><span><strong>批量审核提案</strong><small>直接修改表格，并在首列决定接受或拒绝；提交前可以随时改回</small></span>
        <button aria-label="关闭批量审核" onClick={onClose}><Cross2Icon /></button></div>
      <div className={styles.aiBatchDialogList}>
        <table className={styles.aiBatchTable}>
          <thead><tr>
            <th>决定</th>
            <th>{proposals[0]?.kind === "morpheme.upsert" ? "形式" : "词形"}</th>
            <th>{proposals[0]?.kind === "morpheme.upsert" ? "类型" : "IPA"}</th>
            <th>{proposals[0]?.kind === "morpheme.upsert" ? "含义" : "词性"}</th>
            <th>{proposals[0]?.kind === "morpheme.upsert" ? "适用词类" : "核心释义"}</th>
            <th>状态</th>
          </tr></thead>
          <tbody>{proposals.map((proposal) => <EditableBatchRow
            key={proposal.id}
            proposal={proposal}
            patch={drafts[proposal.id]}
            decision={decisions[proposal.id] ?? "accept"}
            status={rowStatus[proposal.id]}
            disabled={busy || ["applied", "stale"].includes(proposal.status)}
            onDecision={(value) => setDecisions((current) => ({
              ...current,
              [proposal.id]: value,
            }))}
            onChange={(patch) => setDrafts((current) => ({
              ...current,
              [proposal.id]: patch,
            }))}
          />)}</tbody>
        </table>
      </div>
      <div className={styles.aiBatchDialogFooter}>
        <span>共 {proposals.length} 项：接受 {acceptedCount} 项，拒绝 {rejectedCount} 项</span>
        <button onClick={onClose}>稍后处理</button>
        <button className={styles.primaryButton} disabled={!reviewable.length || busy} onClick={() => void saveDecisions()}>
          {busy ? "正在提交…" : `确认决定（${reviewable.length}）`}
        </button>
      </div>
    </section>
  </div>;
}

function EditableBatchRow({
  proposal, patch, decision, status, disabled, onDecision, onChange,
}: {
  proposal: AiProposal;
  patch: Record<string, unknown>;
  decision: "accept" | "reject";
  status?: string;
  disabled: boolean;
  onDecision: (value: "accept" | "reject") => void;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const morpheme = proposal.kind === "morpheme.upsert";
  const firstSense = Array.isArray(patch.senses) && patch.senses[0]
    && typeof patch.senses[0] === "object"
    ? patch.senses[0] as Record<string, unknown>
    : undefined;
  const definition = String(firstSense?.definition ?? patch.meaning ?? "");
  const set = (key: string, value: unknown) => onChange({ ...patch, [key]: value });
  const setDefinition = (value: string) => onChange({
    ...patch,
    senses: [{ definition: value, position: 0 }],
  });
  return <tr data-decision={decision}>
    <td><select
      className={styles.aiBatchDecision}
      aria-label={`决定 ${proposal.summary}`}
      value={decision}
      disabled={disabled}
      onChange={(event) => onDecision(event.target.value as "accept" | "reject")}
    ><option value="accept">接受</option><option value="reject">拒绝</option></select></td>
    <td><input aria-label={morpheme ? "语素形式" : "词形"} value={String(morpheme ? patch.form ?? "" : patch.romanized ?? "")} disabled={disabled} onChange={(event) => set(morpheme ? "form" : "romanized", event.target.value)} /></td>
    <td>{morpheme
      ? <select aria-label="语素类型" value={String(patch.type ?? "root")} disabled={disabled} onChange={(event) => set("type", event.target.value)}>
          <option value="root">词根</option><option value="prefix">前缀</option><option value="suffix">后缀</option>
          <option value="infix">中缀</option><option value="circumfix">环缀</option><option value="clitic">黏着词素</option>
          <option value="inflectional_ending">屈折词尾</option>
        </select>
      : <input aria-label="IPA" value={String(patch.ipa ?? "")} disabled={disabled} onChange={(event) => set("ipa", event.target.value)} />}</td>
    <td><input aria-label={morpheme ? "语素含义" : "词性"} value={String(morpheme ? patch.meaning ?? "" : patch.partOfSpeech ?? "")} disabled={disabled} onChange={(event) => set(morpheme ? "meaning" : "partOfSpeech", event.target.value)} /></td>
    <td><input aria-label={morpheme ? "适用词类" : "核心释义"} value={morpheme ? String(patch.applicablePartOfSpeech ?? "") : definition} disabled={disabled} onChange={(event) => morpheme ? set("applicablePartOfSpeech", event.target.value) : setDefinition(event.target.value)} /></td>
    <td><span>{status ?? proposal.status}</span></td>
  </tr>;
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
