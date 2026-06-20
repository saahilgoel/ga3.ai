"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Pencil,
  Pin,
  Archive,
  Trash2,
  MoreHorizontal,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { MobileNavSheet } from "@/components/mobile-nav-sheet";
import { ChatMessage } from "@/components/chat-message";
import { AgentComputer, type ToolCallItem } from "@/components/agent-computer";
import { type SiteProfile } from "@/components/site-profile-card";
import {
  AGENT_MAP,
  AGENT_PHRASES,
  AGENTS,
  EASTER_EGG_LINES,
  EASTER_EGG_QUERY,
  detectSummon,
} from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";
import { Monogram } from "@/components/monogram";
import { BriefingModal } from "@/components/briefing-modal";
import { loadStalkerScore, saveStalkerScore } from "@/lib/polish";
import {
  FindingContextCard,
  type SeedFinding,
} from "@/components/finding-context-card";

type ActiveProperty = {
  id: number;
  display_name: string;
  website_url: string | null;
  ga4_property_id: string;
  profile: SiteProfile | null;
};

export function ChatClient({
  activeProperties,
  initialMessages = [],
  initialMsgAgent = [],
  seedInput,
  conversationId,
  conversationTitle: initialTitle,
  primaryAgentId,
  pinned: initialPinned = false,
  archived: initialArchived = false,
  seedFinding,
}: {
  activeProperties: ActiveProperty[];
  initialMessages?: UIMessage[];
  initialMsgAgent?: Array<[string, string]>;
  seedInput?: string;
  conversationId: number;
  conversationTitle?: string | null;
  primaryAgentId?: string | null;
  pinned?: boolean;
  archived?: boolean;
  seedFinding?: SeedFinding | null;
}) {
  const router = useRouter();
  const [activeAgentId, setActiveAgentId] = useState<string | null>(
    primaryAgentId ?? null
  );
  const activeAgentRef = useRef<string | null>(activeAgentId);
  activeAgentRef.current = activeAgentId;
  const conversationIdRef = useRef<number>(conversationId);
  conversationIdRef.current = conversationId;

  const [title, setTitle] = useState<string | null>(initialTitle ?? null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialTitle ?? "");
  const [pinned, setPinned] = useState(initialPinned);
  const [archived, setArchived] = useState(initialArchived);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            agent_id: activeAgentRef.current,
            conversation_id: conversationIdRef.current,
            ...(body ?? {}),
          },
        }),
      }),
    []
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({ transport });
  const [input, setInput] = useState(seedInput ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openToolId, setOpenToolId] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(false);

  const [msgAgent, setMsgAgent] = useState<Map<string, string>>(new Map());
  const lastSentAgentRef = useRef<string | null>(null);

  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (initialMessages.length > 0) setMessages(initialMessages);
    if (initialMsgAgent.length > 0) setMsgAgent(new Map(initialMsgAgent));
  }, [initialMessages, initialMsgAgent, setMessages]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!seedInput) return;
    if (initialMessages.length > 0) return;
    seededRef.current = true;
    const timer = setTimeout(() => {
      lastSentAgentRef.current = activeAgentId;
      sendMessage({ text: seedInput });
      setInput("");
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedInput]);

  const [stalker, setStalker] = useState(0);
  useEffect(() => setStalker(loadStalkerScore()), []);
  function bump(n: number) {
    setStalker((s) => {
      const next = s + n;
      saveStalkerScore(next);
      return next;
    });
  }
  void stalker;

  const titledRef = useRef(false);
  useEffect(() => {
    if (titledRef.current || title) return;
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return;
    const text = (firstUser.parts || [])
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    if (!text) return;
    titledRef.current = true;
    fetch(`/api/conversations/${conversationId}/title`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ first_message: text }),
    })
      .then((r) => r.json())
      .then((data: { title?: string }) => {
        if (data.title) setTitle(data.title);
      })
      .catch(() => {});
  }, [messages, title, conversationId]);

  useEffect(() => {
    let changed = false;
    const next = new Map(msgAgent);
    for (const m of messages) {
      if (m.role === "assistant" && !next.has(m.id)) {
        next.set(m.id, lastSentAgentRef.current || primaryAgentId || "");
        changed = true;
      }
    }
    if (changed) setMsgAgent(next);
  }, [messages, msgAgent, primaryAgentId]);

  const persistedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (status !== "ready") return;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      if (persistedRef.current.has(m.id)) continue;
      persistedRef.current.add(m.id);
      fetch("/api/threads/persist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          agent_id: msgAgent.get(m.id) || primaryAgentId,
          message: m,
        }),
      }).catch(() => {});
    }
  }, [status, messages, msgAgent, conversationId, primaryAgentId]);

  const autoSummonHandledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (primaryAgentId) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (autoSummonHandledRef.current.has(last.id)) return;
    const text = (last.parts || [])
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();
    const summonedId = detectSummon(text);
    if (!summonedId) return;
    const prevUser = [...messages].reverse().find((m) => m.role === "user");
    if (!prevUser) return;
    const userText = (prevUser.parts || [])
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("");
    if (!userText.trim()) return;
    autoSummonHandledRef.current.add(last.id);
    setActiveAgentId(summonedId);
    activeAgentRef.current = summonedId;
    setMessages((m) => m.filter((x) => x.id !== last.id && x.id !== prevUser.id));
    setTimeout(() => {
      lastSentAgentRef.current = summonedId;
      sendMessage({ text: userText });
    }, 50);
  }, [status, messages, sendMessage, setMessages, primaryAgentId]);

  // Auto-scroll only when user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleEasterEgg(userText: string) {
    const userMsg: UIMessage = {
      id: makeId(),
      role: "user",
      parts: [{ type: "text", text: userText }],
    };
    const eggMsgs: UIMessage[] = EASTER_EGG_LINES.map((l) => ({
      id: makeId(),
      role: "assistant" as const,
      parts: [{ type: "text", text: l.text }],
    }));
    const wink: UIMessage = {
      id: makeId(),
      role: "assistant" as const,
      parts: [{ type: "text", text: "…wink" }],
    };
    const next = new Map(msgAgent);
    eggMsgs.forEach((m, i) => next.set(m.id, EASTER_EGG_LINES[i].agent));
    next.set(wink.id, "");
    setMsgAgent(next);
    setMessages([...messages, userMsg, ...eggMsgs, wink]);
  }

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (t.toLowerCase() === EASTER_EGG_QUERY) {
      handleEasterEgg(t);
      setInput("");
      bump(1);
      return;
    }
    lastSentAgentRef.current = activeAgentId;
    sendMessage({ text: t });
    setInput("");
    bump(1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  async function commitTitle() {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === title) return;
    setTitle(next);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
  }

  async function toggleArchive() {
    const next = !archived;
    setArchived(next);
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: next }),
    });
    if (next) router.push("/feed");
  }

  async function deleteConv() {
    if (!confirm("Permanently delete this conversation? This cannot be undone.")) return;
    await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
    router.push("/feed");
  }

  async function switchAgent(newAgent: string | null) {
    setActiveAgentId(newAgent);
    activeAgentRef.current = newAgent;
    await fetch(`/api/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primary_agent_id: newAgent }),
    }).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  const busy = status === "submitted" || status === "streaming";
  const activeAgent = activeAgentId ? AGENT_MAP[activeAgentId] : null;
  const [busyPhraseIdx, setBusyPhraseIdx] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setBusyPhraseIdx((i) => i + 1), 2400);
    return () => clearInterval(t);
  }, [busy]);
  const busyPhrase = (() => {
    if (!busy) return "";
    if (activeAgent) {
      const arr = AGENT_PHRASES[activeAgent.id] ?? ["thinking…"];
      return arr[busyPhraseIdx % arr.length];
    }
    return "thinking…";
  })();

  const isEmptyChat = messages.length === 0;
  const isUnion = activeProperties.length > 1;
  const placeholder = activeAgent
    ? `Ask ${activeAgent.name}…`
    : isUnion
    ? `Ask anything — answers sum across ${activeProperties.length} properties…`
    : "Ask anything about your traffic…";

  const suggestedChips: Array<{ text: string; agent: string }> = useMemo(() => {
    if (activeAgent) {
      return activeAgent.signatureMoves.map((q) => ({ text: q, agent: activeAgent.id }));
    }
    return AGENTS.map((a) => ({ text: a.signatureMoves[0], agent: a.id }));
  }, [activeAgent]);

  // Flatten every tool call in the conversation for the "agent's computer" panel.
  const toolCalls: ToolCallItem[] = useMemo(() => {
    const out: ToolCallItem[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      const aid = msgAgent.get(m.id) || activeAgentId || null;
      (m.parts || []).forEach((p, i) => {
        const t = (p as { type?: string }).type;
        if (typeof t === "string" && t.startsWith("tool-")) {
          const tp = p as {
            input?: unknown;
            output?: unknown;
            errorText?: string;
            state?: string;
          };
          out.push({
            id: `${m.id}::${i}`,
            toolName: t.replace(/^tool-/, ""),
            input: tp.input,
            output: tp.output,
            errorText: tp.errorText,
            state: tp.state,
            agentId: aid,
          });
        }
      });
    }
    return out;
  }, [messages, msgAgent, activeAgentId]);

  useEffect(() => {
    if (openToolId && !toolCalls.some((c) => c.id === openToolId)) setOpenToolId(null);
  }, [openToolId, toolCalls]);

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <MobileNavSheet
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeAgentId={activeAgentId}
      />

        <div className="border-b border-[color:var(--border)] px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href="/feed"
              className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover inline-flex items-center gap-1.5 shrink-0"
            >
              <ArrowLeft strokeWidth={1.5} className="size-3.5" />
            </Link>
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTitle();
                  if (e.key === "Escape") {
                    setEditingTitle(false);
                    setTitleDraft(title ?? "");
                  }
                }}
                className="flex-1 font-mono text-[18px] font-medium tracking-tight bg-transparent focus:outline-none border-b border-[color:var(--border-strong)]"
              />
            ) : (
              <button
                onClick={() => {
                  setTitleDraft(title ?? "");
                  setEditingTitle(true);
                }}
                className="flex items-center gap-2 min-w-0 group"
                title="Click to rename"
              >
                <span className="font-mono text-[18px] font-medium tracking-tight truncate">
                  {title ?? "New chat"}
                </span>
                <Pencil
                  strokeWidth={1.5}
                  className="size-3.5 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 shrink-0"
                />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <AgentSwitcher activeAgentId={activeAgentId} onSwitch={switchAgent} />
            <button
              onClick={togglePin}
              title={pinned ? "Unpin" : "Pin"}
              className={`size-8 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center ${
                pinned
                  ? "text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-tertiary)]"
              }`}
            >
              <Pin
                strokeWidth={1.5}
                className="size-4"
                fill={pinned ? "currentColor" : "none"}
              />
            </button>
            <ChatMenu onArchive={toggleArchive} onDelete={deleteConv} archived={archived} />
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-0 max-w-full lg:max-w-[760px] py-6 space-y-5">
            {seedFinding && <FindingContextCard finding={seedFinding} />}

            {isEmptyChat && !seedFinding && activeAgent && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className="py-2 text-[15px] text-[color:var(--text-secondary)] font-mono italic"
              >
                {activeAgent.greeting}
              </motion.div>
            )}

            {isEmptyChat && !seedFinding && (
              <div className="flex flex-wrap gap-1.5 pb-2">
                {suggestedChips.slice(0, 5).map((chip) => (
                  <button
                    key={chip.text}
                    onClick={() => {
                      if (chip.agent !== activeAgentId && !activeAgent) {
                        switchAgent(chip.agent);
                      }
                      send(chip.text);
                    }}
                    className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] text-[color:var(--text-secondary)] tx-hover text-[12px]"
                  >
                    Try: {chip.text}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                >
                  <ChatMessage message={m} agentId={msgAgent.get(m.id) || null} onToolOpen={setOpenToolId} />
                </motion.div>
              ))}
            </AnimatePresence>

            {busy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] pl-9"
              >
                <span
                  className="inline-block size-1 rounded-full"
                  style={{
                    background: "var(--text-primary)",
                    animation: "softPulse 1.4s ease-in-out infinite",
                  }}
                />
                <span>
                  {activeAgent ? `${activeAgent.name} is ${busyPhrase}` : busyPhrase || "thinking…"}
                </span>
              </motion.div>
            )}

            {error && (
              <div className="text-[12px] text-[color:var(--severity-high)] pl-9">
                {error.message || "Something went wrong."}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-[color:var(--border)] bg-[color:var(--bg)]">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-0 max-w-full lg:max-w-[760px] py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                rows={1}
                placeholder={placeholder}
                disabled={busy}
                className="flex-1 min-h-[40px] max-h-32 resize-none rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] px-3 py-2.5 text-[14px] placeholder:text-[color:var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--border-focus)] focus-visible:border-[color:var(--border-focus)] tx-hover"
              />
              <button
                onClick={() => send(input)}
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="size-9 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white tx-hover flex items-center justify-center"
              >
                <ArrowUp strokeWidth={2} className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <BriefingModal
          open={briefingOpen}
          onClose={() => setBriefingOpen(false)}
          initialInsights={null}
          generatedAt={null}
          onGenerated={(cached) => {
            if (!cached) bump(10);
          }}
          onPinned={() => {
            bump(5);
          }}
        />
      </div>
      {openToolId && (
        <AgentComputer
          calls={toolCalls}
          selectedId={openToolId}
          onSelect={setOpenToolId}
          onClose={() => setOpenToolId(null)}
          agentId={activeAgentId}
        />
      )}
    </div>
  );
}

function AgentSwitcher({
  activeAgentId,
  onSwitch,
}: {
  activeAgentId: string | null;
  onSwitch: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = activeAgentId ? AGENT_MAP[activeAgentId] : null;
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover inline-flex items-center gap-2 text-[12px]"
      >
        {active ? (
          <>
            <span
              className="size-4 rounded-full bg-[color:var(--surface-elevated)] flex items-center justify-center text-[9px] font-mono font-semibold"
              style={{ border: `1px solid ${AGENT_HEX[active.color]}` }}
            >
              {active.monogram}
            </span>
            <span className="text-[color:var(--text-secondary)]">{active.name}</span>
          </>
        ) : (
          <span className="text-[color:var(--text-secondary)]">All Agents</span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 z-30 w-[180px] max-w-[calc(100vw-1.5rem)] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
        >
          <button
            onClick={() => {
              onSwitch(null);
              setOpen(false);
            }}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] ${
              activeAgentId === null
                ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]"
            }`}
          >
            <span className="size-4 rounded-full bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)]" />
            All Agents
          </button>
          {AGENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                onSwitch(a.id);
                setOpen(false);
              }}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] ${
                activeAgentId === a.id
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]"
              }`}
            >
              <Monogram agent={a} size={16} />
              {a.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMenu({
  onArchive,
  onDelete,
  archived,
}: {
  onArchive: () => void;
  onDelete: () => void;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center text-[color:var(--text-tertiary)]"
      >
        <MoreHorizontal strokeWidth={1.5} className="size-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 z-30 w-[160px] max-w-[calc(100vw-1.5rem)] rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-1"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45)" }}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            onClick={() => {
              setOpen(false);
              onArchive();
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px]"
          >
            <Archive strokeWidth={1.5} className="size-3.5" />
            {archived ? "Restore" : "Archive"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] text-[12px] text-[color:var(--severity-high)]"
          >
            <Trash2 strokeWidth={1.5} className="size-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function makeId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
