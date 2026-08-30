import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  api,
  ApiError,
  DeniedRunApiError,
  isStaleDemoSessionError,
  setAuthToken,
  setDemoSession,
} from "./api";
import {
  buildSendMessageBody,
  type CapsuleProofContext,
  DecisionProofChain,
  ResourceAdvisor,
  ResourcePicker,
} from "./resource-capsule";
import {
  guidedDelegationReducer,
  initialGuidedDelegationState,
  ResourceAdvisorCoordinator,
} from "./resource-advisor-coordinator";
import {
  isNearMessageEnd,
  RunProgressBanner,
  scrollMessagePaneToEnd,
} from "./playground-feedback";
import { pollActiveRun } from "./run-polling";
import type {
  Agent,
  AgentRun,
  DecisionReceipt,
  DemoSessionValue,
  DeniedRunResponse,
  HumanPrincipalId,
  Message,
  ProtectedResource,
  SystemInfo,
} from "./types";

const starterPrompts = [
  "Create a small TypeScript CLI that prints a weather summary from sample JSON.",
  "Inspect this workspace and explain what you would improve first.",
  "Build a responsive single-page todo app with tests.",
];

const emptyForm = {
  name: "",
  description: "",
  instructions:
    "Help me build and test software in this workspace. Keep changes small and explain the result.",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusPill({ status }: { status: Agent["status"] }) {
  return (
    <span className={"status status-" + status}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [prompt, setPrompt] = useState("");
  const [guidedDelegation, dispatchGuidedDelegation] = useReducer(
    guidedDelegationReducer,
    initialGuidedDelegationState,
  );
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<DecisionReceipt | null>(null);
  const [deniedRun, setDeniedRun] = useState<DeniedRunResponse | null>(null);
  const [resources, setResources] = useState<ProtectedResource[]>([]);
  const [resourceUnavailable, setResourceUnavailable] = useState<string | null>(null);
  const [submittedCapsule, setSubmittedCapsule] =
    useState<CapsuleProofContext | null>(null);
  const [runSetupOpen, setRunSetupOpen] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [demoSessionValue, setDemoSessionValue] =
    useState<DemoSessionValue>("demo-session-a");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [authInput, setAuthInput] = useState("");
  const messagesPane = useRef<HTMLDivElement>(null);
  const followLatestMessagesRef = useRef(true);
  const selectedIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pollingRunIds = useRef(new Set<string>());
  const sessionEpochRef = useRef(0);
  const receiptRequestRef = useRef(0);
  const suggestionCoordinatorRef = useRef(new ResourceAdvisorCoordinator());
  const suggestionCoordinator = suggestionCoordinatorRef.current;
  const advisorState = guidedDelegation.advisor;
  const selectedResourceId = guidedDelegation.selectedResourceId;
  selectedIdRef.current = selectedId;

  const selected = useMemo(
    () => agents.find((agent) => agent.id === selectedId) ?? null,
    [agents, selectedId],
  );
  const runControlsDisabled =
    !selected ||
    selected.status === "stopped" ||
    selected.status === "busy" ||
    (activeRun != null && ["queued", "running"].includes(activeRun.status));
  const emptyPlayground = messages.length === 0 && !activeRun;
  const currentPrincipalId: HumanPrincipalId =
    demoSessionValue === "demo-session-a" ? "user-a" : "user-b";
  const selectedResourceLabel = useMemo(
    () =>
      resources.find((resource) => resource.id === selectedResourceId)?.displayName ??
      null,
    [resources, selectedResourceId],
  );
  const activeResourceId = activeReceipt?.resourceId ?? submittedCapsule?.resourceId;
  const activeResourceLabel = useMemo(
    () =>
      resources.find((resource) => resource.id === activeResourceId)?.displayName ??
      activeResourceId ??
      null,
    [activeResourceId, resources],
  );

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const pane = messagesPane.current;
    if (!pane) return;
    followLatestMessagesRef.current = true;
    setShowJumpToLatest(false);
    scrollMessagePaneToEnd(pane, behavior);
  }, []);

  const handleMessagesScroll = () => {
    const pane = messagesPane.current;
    if (!pane) return;
    const isFollowing = isNearMessageEnd(pane);
    followLatestMessagesRef.current = isFollowing;
    setShowJumpToLatest(!isFollowing && !emptyPlayground);
  };

  const updatePrompt = (value: string) => {
    if (value.trim()) setRunSetupOpen(true);
    suggestionCoordinator.setPrompt(value);
    setPrompt(value);
    dispatchGuidedDelegation({ type: "prompt_changed" });
  };

  const refreshAgents = useCallback(async () => {
    const sessionEpoch = sessionEpochRef.current;
    const { agents: next } = await api.listAgents();
    if (!mountedRef.current || sessionEpoch !== sessionEpochRef.current) return;
    setAgents(next);
    setSelectedId((current) =>
      current && next.some((agent) => agent.id === current)
        ? current
        : (next[0]?.id ?? null),
    );
  }, []);

  const refreshMessages = useCallback(async (agentId: string) => {
    const sessionEpoch = sessionEpochRef.current;
    const result = await api.messages(agentId);
    if (
      mountedRef.current &&
      sessionEpoch === sessionEpochRef.current &&
      selectedIdRef.current === agentId
    ) {
      setMessages(result.messages);
    }
  }, []);

  const refreshResources = useCallback(async () => {
    const sessionEpoch = sessionEpochRef.current;
    try {
      const result = await api.resources();
      if (!mountedRef.current || sessionEpoch !== sessionEpochRef.current) return;
      setResources(result.resources);
      setResourceUnavailable(null);
      dispatchGuidedDelegation({
        type: "eligible_resources_refreshed",
        resourceIds: result.resources.map((resource) => resource.id),
      });
    } catch (reason) {
      if (
        !mountedRef.current ||
        sessionEpoch !== sessionEpochRef.current ||
        isStaleDemoSessionError(reason)
      ) {
        return;
      }
      setResources([]);
      dispatchGuidedDelegation({
        type: "resource_selected",
        resourceId: null,
      });
      setResourceUnavailable(
        reason instanceof ApiError && reason.status === 404
          ? "Resource catalog is awaiting the P2 integration adapter. Baseline Runs remain available."
          : "Protected Resources are temporarily unavailable. Baseline Runs remain available.",
      );
    }
  }, []);

  const loadReceipt = useCallback(async (runId: string, agentId: string) => {
    const sessionEpoch = sessionEpochRef.current;
    const requestId = ++receiptRequestRef.current;
    try {
      const result = await api.receipts(runId);
      if (
        mountedRef.current &&
        sessionEpoch === sessionEpochRef.current &&
        requestId === receiptRequestRef.current &&
        selectedIdRef.current === agentId
      ) {
        const receipt = result.receipts[0] ?? null;
        if (receipt && receipt.agentId !== agentId) {
          setActiveReceipt(null);
          return;
        }
        setActiveReceipt(receipt);
        if (receipt) {
          // Keep the admitted request context immutable so a mismatched
          // Receipt cannot redefine which Resource the user delegated.
          setSubmittedCapsule((current) =>
            current ?? {
              runId: receipt.runId,
              principalId: receipt.humanPrincipalId,
              agentId: receipt.agentId,
              resourceId: receipt.resourceId,
            },
          );
        }
      }
    } catch (reason) {
      if (
        mountedRef.current &&
        sessionEpoch === sessionEpochRef.current &&
        requestId === receiptRequestRef.current &&
        selectedIdRef.current === agentId &&
        !isStaleDemoSessionError(reason)
      ) {
        setActiveReceipt(null);
      }
    }
  }, []);

  const bootstrap = useCallback(async () => {
    await Promise.all([refreshAgents(), api.system().then(setSystem)]);
    await refreshResources();
  }, [refreshAgents, refreshResources]);

  useEffect(() => {
    mountedRef.current = true;
    void api
      .auth()
      .then(async ({ required }) => {
        if (!mountedRef.current) return;
        setAuthRequired(required);
        if (!required) await bootstrap();
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => {
      mountedRef.current = false;
    };
  }, [bootstrap]);

  useEffect(() => {
    const sessionEpoch = sessionEpochRef.current;
    receiptRequestRef.current += 1;
    suggestionCoordinator.invalidate();
    dispatchGuidedDelegation({ type: "agent_changed" });
    setActiveRun(null);
    setActiveReceipt(null);
    setDeniedRun(null);
    setSubmittedCapsule(null);
    setRunSetupOpen(true);
    followLatestMessagesRef.current = true;
    setShowJumpToLatest(false);
    setShowSettings(false);
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void Promise.all([refreshMessages(selectedId), api.runs(selectedId)])
      .then(([, result]) => {
        if (
          !mountedRef.current ||
          sessionEpoch !== sessionEpochRef.current ||
          selectedIdRef.current !== selectedId
        ) {
          return;
        }
        const latest = result.runs[0] ?? null;
        setActiveRun(latest);
        if (latest && !["queued", "running"].includes(latest.status)) {
          void loadReceipt(latest.id, selectedId);
        }
        if (latest && ["queued", "running"].includes(latest.status)) {
          void pollRun(latest.id, selectedId).catch((reason) =>
            setError(reason instanceof Error ? reason.message : String(reason)),
          );
        }
      })
      .catch((reason) => {
        if (
          sessionEpoch !== sessionEpochRef.current ||
          isStaleDemoSessionError(reason)
        ) {
          return;
        }
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [loadReceipt, refreshMessages, selectedId]);

  useEffect(() => {
    if (selected) {
      setForm({
        name: selected.name,
        description: selected.description,
        instructions: selected.instructions,
      });
    }
  }, [selected]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const pane = messagesPane.current;
      if (!pane) return;
      if (followLatestMessagesRef.current) {
        scrollToLatest(messages.length === 0 ? "auto" : "smooth");
      } else {
        setShowJumpToLatest(!isNearMessageEnd(pane));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeReceipt?.runnerStarted,
    activeRun?.status,
    deniedRun?.receiptId,
    messages.length,
    scrollToLatest,
  ]);

  const createAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { agent } = await api.createAgent(form);
      await refreshAgents();
      setSelectedId(agent.id);
      setShowCreate(false);
      setForm(emptyForm);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const saveAgent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateAgent(selected.id, form);
      await refreshAgents();
      setShowSettings(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const toggleAgent = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (selected.status === "stopped") {
        await api.startAgent(selected.id);
      } else {
        await api.stopAgent(selected.id);
      }
      await refreshAgents();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const deleteAgent = async () => {
    if (!selected) return;
    if (!window.confirm("Delete " + selected.name + "? Its workspace will be archived.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.deleteAgent(selected.id);
      await refreshAgents();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const pollRun = async (runId: string, agentId: string) => {
    const sessionEpoch = sessionEpochRef.current;
    if (pollingRunIds.current.has(runId)) return;
    pollingRunIds.current.add(runId);
    try {
      await pollActiveRun({
        runId,
        wait: () =>
          new Promise((resolve) => window.setTimeout(resolve, 900)),
        shouldContinue: () =>
          mountedRef.current && sessionEpoch === sessionEpochRef.current,
        getRun: api.run,
        onRun: (run) => {
          if (
            selectedIdRef.current === agentId &&
            run.id === runId &&
            run.agentId === agentId
          ) {
            setActiveRun(run);
          }
        },
        refreshReceipt: async () => {
          if (selectedIdRef.current === agentId) {
            await loadReceipt(runId, agentId);
          }
        },
        onTerminal: async () => {
          await Promise.all([
            refreshMessages(agentId),
            refreshAgents(),
            selectedIdRef.current === agentId
              ? loadReceipt(runId, agentId)
              : Promise.resolve(),
          ]);
        },
      });
    } finally {
      pollingRunIds.current.delete(runId);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !prompt.trim()) return;
    const content = prompt.trim();
    const requestedResourceId = selectedResourceId;
    const body = buildSendMessageBody(content, requestedResourceId);
    const sessionEpoch = sessionEpochRef.current;
    receiptRequestRef.current += 1;
    setSubmittedCapsule(null);
    updatePrompt("");
    dispatchGuidedDelegation({ type: "run_submitted" });
    setRunSetupOpen(false);
    followLatestMessagesRef.current = true;
    setShowJumpToLatest(false);
    setError(null);
    setActiveRun(null);
    setActiveReceipt(null);
    setDeniedRun(null);
    try {
      const result = await api.sendMessage(selected.id, body);
      if (sessionEpoch !== sessionEpochRef.current) return;
      if (selectedIdRef.current === selected.id) {
        setMessages((current) => [...current, result.message]);
        setActiveRun(result.run);
        setSubmittedCapsule(
          requestedResourceId
            ? {
                runId: result.run.id,
                principalId: currentPrincipalId,
                agentId: selected.id,
                resourceId: requestedResourceId,
              }
            : null,
        );
      }
      setAgents((current) =>
        current.map((agent) =>
          agent.id === selected.id ? { ...agent, status: "busy" } : agent,
        ),
      );
      if (
        requestedResourceId &&
        selectedIdRef.current === selected.id
      ) {
        void loadReceipt(result.run.id, selected.id);
      }
      await pollRun(result.run.id, selected.id);
    } catch (reason) {
      if (
        sessionEpoch !== sessionEpochRef.current ||
        isStaleDemoSessionError(reason)
      ) {
        return;
      }
      if (reason instanceof DeniedRunApiError) {
        const denied = reason.denied;
        if (selectedIdRef.current === selected.id) {
          setDeniedRun(denied);
          setSubmittedCapsule(
            requestedResourceId
              ? {
                  runId: denied.runId,
                  principalId: currentPrincipalId,
                  agentId: selected.id,
                  resourceId: requestedResourceId,
                }
              : null,
          );
          setActiveRun({
            id: denied.runId,
            agentId: selected.id,
            status: "denied",
            prompt: content,
            output: null,
            error: denied.reason,
            usage: null,
            createdAt: new Date().toISOString(),
          });
        }
        await Promise.allSettled([
          api.run(denied.runId).then(({ run }) => {
            if (
              mountedRef.current &&
              sessionEpoch === sessionEpochRef.current &&
              selectedIdRef.current === selected.id &&
              run.id === denied.runId &&
              run.agentId === selected.id
            ) {
              setActiveRun(run);
            }
          }),
          selectedIdRef.current === selected.id
            ? loadReceipt(denied.runId, selected.id)
            : Promise.resolve(),
          refreshMessages(selected.id),
          refreshAgents(),
        ]);
        return;
      }
      if (selectedIdRef.current === selected.id) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setSubmittedCapsule(null);
        setActiveRun(null);
      }
      await refreshAgents();
    }
  };

  const suggestResource = async () => {
    if (!selected || !prompt.trim()) return;
    const content = prompt.trim();
    dispatchGuidedDelegation({ type: "suggestion_requested" });
    const state = await suggestionCoordinator.suggest(
      content,
      api.suggestResource,
    );
    if (mountedRef.current && state) {
      dispatchGuidedDelegation({ type: "suggestion_resolved", state });
    }
  };

  const changeDemoSession = async (value: DemoSessionValue) => {
    sessionEpochRef.current += 1;
    const sessionEpoch = sessionEpochRef.current;
    receiptRequestRef.current += 1;
    setDemoSession(value);
    setDemoSessionValue(value);
    setAgents([]);
    setSelectedId(null);
    selectedIdRef.current = null;
    setError(null);
    setActiveRun(null);
    setActiveReceipt(null);
    setDeniedRun(null);
    setMessages([]);
    setResources([]);
    setResourceUnavailable(null);
    dispatchGuidedDelegation({ type: "principal_changed" });
    setSubmittedCapsule(null);
    setRunSetupOpen(true);
    followLatestMessagesRef.current = true;
    setShowJumpToLatest(false);
    suggestionCoordinator.changePrincipal();
    updatePrompt("");
    setForm(emptyForm);
    setShowCreate(false);
    setShowSettings(false);
    await Promise.all([refreshAgents(), refreshResources()]).catch((reason) => {
      if (
        sessionEpoch !== sessionEpochRef.current ||
        isStaleDemoSessionError(reason)
      ) {
        return;
      }
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAuthToken(authInput);
    try {
      await bootstrap();
      setAuthRequired(false);
      setAuthInput("");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        setError("The access token is not valid.");
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      setBusy(false);
    }
  };

  if (authRequired === null) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-live="polite">
          <div className="brand-mark">A</div>
          <span className="eyebrow">Agent Launchpad</span>
          <h1>Connecting to the control plane</h1>
          {error ? <div className="error-banner" role="alert">{error}</div> : <Spinner />}
        </section>
      </main>
    );
  }

  if (authRequired) {
    return (
      <main className="auth-screen">
        <form className="auth-card" onSubmit={unlock}>
          <div className="brand-mark">A</div>
          <span className="eyebrow">Agent Launchpad</span>
          <h1>Enter the access token</h1>
          <p>This shared demo token is configured by the platform operator.</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <label>
            Access token
            <input
              autoFocus
              type="password"
              value={authInput}
              onChange={(event) => setAuthInput(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button button-primary" disabled={busy || !authInput.trim()}>
            {busy ? <Spinner /> : "Open Launchpad"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Agent Launchpad</strong>
            <span>
              {system?.runtimeProvider === "container"
                ? "Local container · Codex CLI"
                : "ECS / Docker · Codex CLI"}
            </span>
          </div>
        </div>

        <button
          className="button button-primary create-button"
          onClick={() => {
            setForm(emptyForm);
            setShowCreate(true);
          }}
        >
          <span>＋</span> Create Agent
        </button>

        <div className="sidebar-label">
          <span>Your Agents</span>
          <span>{agents.length}</span>
        </div>
        <nav className="agent-list">
          {agents.map((agent) => (
            <button
              className={"agent-card " + (agent.id === selectedId ? "selected" : "")}
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
            >
              <div className="agent-avatar">{agent.name.slice(0, 1).toUpperCase()}</div>
              <div className="agent-card-copy">
                <strong>{agent.name}</strong>
                <span>{agent.description || "Coding Agent"}</span>
              </div>
              <span className={"mini-dot mini-" + agent.status} />
            </button>
          ))}
          {agents.length === 0 && (
            <div className="empty-sidebar">
              <span>◇</span>
              Create your first coding Agent.
            </div>
          )}
        </nav>

        <div className="runtime-card">
          <span className="eyebrow">Runtime</span>
          <strong>{system?.runtime ?? "Checking…"}</strong>
          <span>
            {system?.arkModel ?? "Ark model not configured"}
            {system?.containerEngine ? " · " + system.containerEngine : ""}
          </span>
          <label className="demo-session-control">
            Mock principal
            <select
              value={demoSessionValue}
              onChange={(event) =>
                void changeDemoSession(event.target.value as DemoSessionValue)
              }
              disabled={busy || selected?.status === "busy"}
            >
              <option value="demo-session-a">Demo User A</option>
              <option value="demo-session-b">Demo User B</option>
            </select>
          </label>
          <small>Demo identity only — not authentication.</small>
        </div>
      </aside>

      <main className="main">
        {!system?.arkConfigured || !system?.codexAvailable ? (
          <div className="config-banner">
            <span>!</span>
            <div>
              <strong>Runtime configuration needed</strong>
              <p>
                {!system?.arkConfigured
                  ? "Set ARK_API_KEY and ARK_MODEL in the server process environment, then restart."
                  : system.runtimeProvider === "container"
                    ? "The local container engine or Agent Runtime image is unavailable. Rerun npm run poc."
                    : "Codex CLI was not found. Use the Docker image or install @openai/codex."}
              </p>
            </div>
          </div>
        ) : null}

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {selected ? (
          <>
            <header className="agent-header">
              <div>
                <div className="header-title-row">
                  <h1>{selected.name}</h1>
                  <StatusPill status={selected.status} />
                </div>
                <p>{selected.description || "A Codex coding Agent in an isolated workspace."}</p>
              </div>
              <div className="header-actions">
                <button
                  className="button button-ghost"
                  onClick={() => setShowSettings((value) => !value)}
                  disabled={busy || selected.status === "busy"}
                >
                  Settings
                </button>
                <button
                  className="button button-ghost"
                  onClick={toggleAgent}
                  disabled={busy}
                >
                  {selected.status === "stopped" ? "Start" : "Stop"}
                </button>
                <button
                  className="button button-danger"
                  onClick={deleteAgent}
                  disabled={busy || selected.status === "busy"}
                >
                  Delete
                </button>
              </div>
            </header>

            {showSettings && (
              <form className="settings-panel" onSubmit={saveAgent}>
                <div className="settings-title">
                  <div>
                    <span className="eyebrow">Agent configuration</span>
                    <h2>Instructions and identity</h2>
                  </div>
                  <button type="button" onClick={() => setShowSettings(false)}>×</button>
                </div>
                <div className="form-grid">
                  <label>
                    Name
                    <input
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Description
                    <input
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      maxLength={500}
                    />
                  </label>
                </div>
                <label>
                  System instructions
                  <textarea
                    value={form.instructions}
                    onChange={(event) =>
                      setForm({ ...form, instructions: event.target.value })
                    }
                    rows={5}
                    maxLength={10_000}
                  />
                </label>
                <div className="panel-footer">
                  <code>{selected.workspacePath}</code>
                  <button className="button button-primary" disabled={busy}>
                    {busy ? <Spinner /> : "Save changes"}
                  </button>
                </div>
              </form>
            )}

            <section className={"playground" + (emptyPlayground ? " playground-empty" : "")}>
              <div className="playground-topbar">
                <div>
                  <span className="eyebrow">Playground</span>
                  <h2>Build something with your Agent</h2>
                </div>
                <div className="playground-topbar-status">
                  {activeRun && (
                    <RunProgressBanner
                      run={activeRun}
                      receipt={activeReceipt}
                      resourceLabel={activeResourceLabel}
                    />
                  )}
                  <div className="session-info">
                    <span className="pulse" />
                    {selected.codexThreadId ? "Session connected" : "New session"}
                  </div>
                </div>
              </div>

              <div className="message-stage">
                <div
                  className="messages"
                  ref={messagesPane}
                  onScroll={handleMessagesScroll}
                  role="log"
                  aria-live="polite"
                  aria-relevant="additions text"
                >
                  {emptyPlayground ? (
                    <div className="welcome">
                      <div className="welcome-orbit">
                        <div>⌁</div>
                      </div>
                      <h3>What should {selected.name} build?</h3>
                      <p>
                        The Agent can inspect files, write code, run commands, and continue the
                        same Codex session across messages.
                      </p>
                      <div className="prompt-grid">
                        {starterPrompts.map((item) => (
                          <button key={item} onClick={() => updatePrompt(item)}>
                            <span>↗</span>
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <article className={"message message-" + message.role} key={message.id}>
                        <div className="message-meta">
                          <strong>{message.role === "user" ? "You" : selected.name}</strong>
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                        <div className="message-body">{message.content}</div>
                      </article>
                    ))
                  )}
                  {activeRun && ["queued", "running"].includes(activeRun.status) && (
                    <article className="message message-assistant thinking">
                      <div className="message-meta">
                        <strong>{selected.name}</strong>
                        <span>working in the Agent workspace</span>
                      </div>
                      <div className="thinking-row">
                        <Spinner />
                        Codex is reading, editing, or running commands…
                      </div>
                    </article>
                  )}
                  {activeRun?.status === "failed" && (
                    <article className="run-error">
                      <strong>Run failed</strong>
                      <span>{activeRun.error}</span>
                    </article>
                  )}
                  {(activeReceipt || deniedRun || submittedCapsule) && (
                    <DecisionProofChain
                      run={activeRun}
                      receipt={activeReceipt}
                      denied={deniedRun}
                      submittedContext={submittedCapsule}
                    />
                  )}
                </div>
                {showJumpToLatest && (
                  <button
                    type="button"
                    className="jump-to-latest"
                    onClick={() => scrollToLatest()}
                    aria-label="Jump to latest response"
                  >
                    ↓ Latest response
                  </button>
                )}
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <div className="composer-task">
                  <label htmlFor="task-prompt">Task</label>
                  <textarea
                    id="task-prompt"
                    value={prompt}
                    onChange={(event) => updatePrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={
                      selected.status === "stopped"
                        ? "Start this Agent to continue…"
                        : "Describe what you want the Agent to do…"
                    }
                    disabled={runControlsDisabled}
                    rows={3}
                  />
                </div>
                <details
                  className="run-setup"
                  open={runSetupOpen}
                  onToggle={(event) => setRunSetupOpen(event.currentTarget.open)}
                >
                  <summary className="run-setup-summary">
                    <div>
                      <span className="eyebrow">Run context</span>
                      <h3 id="run-setup-title">Prepare this Run</h3>
                    </div>
                    <span className="run-setup-selection">
                      {selectedResourceLabel
                        ? "Next Run · " + selectedResourceLabel
                        : "Next Run · No Resource"}
                      <span className="run-setup-chevron" aria-hidden="true">⌄</span>
                    </span>
                  </summary>
                  <div className="run-setup-body">
                    <p className="run-setup-description">
                      Review optional Resource guidance before you send. The picker applies
                      only to the next Run.
                    </p>
                    <div className="run-context-grid">
                      <ResourceAdvisor
                        state={advisorState}
                        onSuggest={() => void suggestResource()}
                        onUseSuggestion={(resourceId) =>
                          dispatchGuidedDelegation({
                            type: "resource_selected",
                            resourceId,
                          })
                        }
                        selectedResourceId={selectedResourceId}
                        disabled={runControlsDisabled || !prompt.trim()}
                      />
                      <ResourcePicker
                        resources={resources}
                        selectedResourceId={selectedResourceId}
                        onSelect={(resourceId) =>
                          dispatchGuidedDelegation({
                            type: "resource_selected",
                            resourceId,
                          })
                        }
                        unavailableMessage={resourceUnavailable}
                        disabled={runControlsDisabled}
                      />
                    </div>
                  </div>
                </details>
                <div className="composer-footer">
                  <span>
                    Enter to send · Shift + Enter for newline · {system?.codexSandboxMode ?? "checking sandbox"}
                  </span>
                  <button
                    type="submit"
                    className="send-button"
                    disabled={runControlsDisabled || !prompt.trim()}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </form>
            </section>
          </>
        ) : (
          <div className="no-agent">
            <div className="no-agent-art">A</div>
            <span className="eyebrow">Agent Launchpad</span>
            <h1>Your runtime is ready for an Agent.</h1>
            <p>Create a workspace, give Codex a job, and continue the conversation here.</p>
            <button
              className="button button-primary"
              onClick={() => {
                setForm(emptyForm);
                setShowCreate(true);
              }}
            >
              Create your first Agent
            </button>
          </div>
        )}
      </main>

      {showCreate && (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <form
            className="modal"
            onSubmit={createAgent}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">New workspace</span>
                <h2>Create an Agent</h2>
                <p>Each Agent gets a persistent folder and a resumable Codex session.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <label>
              Name
              <input
                autoFocus
                placeholder="Frontend Builder"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                maxLength={80}
              />
            </label>
            <label>
              Description
              <input
                placeholder="Builds polished React prototypes"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                maxLength={500}
              />
            </label>
            <label>
              Instructions
              <textarea
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
                rows={6}
                maxLength={10_000}
              />
            </label>
            <div className="modal-footer">
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button className="button button-primary" disabled={busy}>
                {busy ? <Spinner /> : "Create Agent"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
