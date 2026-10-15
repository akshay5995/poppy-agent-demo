// A texting-style chat for a personal agent: bubbles only. The session hook, event reducer and transcript
// model are adapted from Cloudflare agents/examples/next/harnesses/pi via irvinebroque/poppy-demo
// (MIT, LICENSE-cloudflare-agents.txt).
import { ArrowUpIcon, CheckIcon, PlusIcon, StopIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Streamdown } from "streamdown";
import type { TranscriptMessage } from "./protocol";
import { usePiSession } from "./use-pi-session";
import "./styles.css";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** The agent's avatar: a four-point star on a light circle. */
function AgentMark({ size }: { size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#f2f2f7] text-[#0a84ff]" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="currentColor" aria-hidden>
        <path d="M12 1.5 L14.6 9.4 L22.5 12 L14.6 14.6 L12 22.5 L9.4 14.6 L1.5 12 L9.4 9.4 Z" />
      </svg>
    </span>
  );
}

/** An agent row. The avatar shows only on the last of consecutive agent rows (see styles.css). */
function AgentRow({ children, enter = true }: { children: ReactNode; enter?: boolean }) {
  return (
    <div className={`agent-row ${enter ? "bubble " : ""}flex items-end gap-2`}>
      <span className="avatar-slot">
        <AgentMark size={28} />
      </span>
      {children}
    </div>
  );
}

/**
 * `enter: false` skips the entrance animation: a finished reply replaces its streamed (live)
 * bubble, which already animated in, so replaying it would flash the reply.
 */
function Bubble({ from, children, enter = true }: { from: "me" | "agent"; children: ReactNode; enter?: boolean }) {
  if (from === "agent") return <AgentRow enter={enter}><div className="max-w-[78%] rounded-[22px] bg-[#262628] px-4 py-2.5 text-[15px] leading-6 text-[#f2f2f7]">{children}</div></AgentRow>;
  return (
    <div className="bubble flex justify-end">
      <div className="max-w-[78%] rounded-[22px] bg-[#0a84ff] px-4 py-2.5 text-[15px] leading-6 text-white">{children}</div>
    </div>
  );
}

const AgentText = ({ text }: { text: string }) => (
  <Streamdown className="sd-theme" controls={false}>
    {text}
  </Streamdown>
);

function Typing() {
  return (
    <AgentRow>
      <div className="flex gap-1 rounded-[22px] bg-[#262628] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="typing-dot size-2 rounded-full bg-[#8e8e93]" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </AgentRow>
  );
}

/** A chat message as a bubble: its text only. Tool calls live in the activity panel. */
function Message({ message }: { message: TranscriptMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
  if (!text || (message.role !== "user" && message.role !== "assistant")) return null;
  return message.role === "user" ? <Bubble from="me">{text}</Bubble> : <Bubble from="agent" enter={false}><AgentText text={text} /></Bubble>;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AgentRow>
      <div className="w-full max-w-[78%] space-y-3 rounded-[22px] bg-[#262628] p-4">
        <p className="text-[15px] leading-6 text-[#f2f2f7]">{title}</p>
        {children}
      </div>
    </AgentRow>
  );
}

const option = "flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left text-[15px] transition";

function App() {
  const [session, setSession] = useState(() => crypto.randomUUID());
  const [prompt, setPrompt] = useState("");
  const [answering, setAnswering] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { status, messages, live, running, error, submit, abort, reset, approval, config, company, statusLine, answer } = usePiSession(session);
  const connected = status === "open";
  const liveText = live?.parts.map((p) => (p.type === "text" ? p.text : "")).join("").trim();
  const startedAt = messages[0]?.timestamp ?? Date.now();
  const starting = !company && !statusLine.startsWith("poppy: ready");

  useEffect(() => {
    document.title = config.name;
  }, [config.name]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, liveText, running, approval.sign_in_url, approval.confirm]);

  const send = () => {
    const text = prompt.trim();
    if (!text || !connected) return;
    setPrompt("");
    void submit(text);
  };
  const decide = async (yes: boolean) => {
    setAnswering(true);
    try {
      await answer(yes);
    } finally {
      setAnswering(false);
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#151515] text-[#f2f2f7]">
      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex flex-col items-center gap-1 border-b border-[#2c2c2e] py-3">
          <AgentMark size={44} />
          <span className="text-[15px] font-semibold">{config.name}</span>
          <span className="text-xs text-[#8e8e93]">{company ? company : starting ? statusLine.replace(/^poppy: /, "") || "Starting…" : "Ready"}</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-2.5 px-5 pb-36 pt-4">
            <p className="py-3 text-center text-xs text-[#8e8e93]">
              {new Date(startedAt).toLocaleDateString([], { month: "short", day: "numeric" })}, {time(startedAt)}
            </p>
            <Bubble from="agent">Hey! I'm your personal agent. I can work with any company that supports the Personal Agent Protocol.</Bubble>
            <Bubble from="agent">Tell me a site and what you need, and I'll take it from there.</Bubble>

            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
            {liveText ? (
              <Bubble from="agent">
                <AgentText text={liveText} />
              </Bubble>
            ) : running && !approval.sign_in_url && !approval.confirm ? (
              <Typing />
            ) : null}

            {approval.sign_in_url ? (
              <Card title={`${company ?? "The company"} needs you to sign in. I never see your password.`}>
                <a href={approval.sign_in_url} target="_blank" rel="noreferrer" className={`${option} border-white bg-[#1c1c1e] text-white`}>
                  Sign in at {company ?? "the company"} <span className="text-[#0a84ff]">Open</span>
                </a>
                {approval.sign_in_code ? (
                  <p className="text-sm text-[#aeaeb2]">
                    Check the page shows <span className="font-mono font-semibold text-white">{approval.sign_in_code}</span>, then approve.
                  </p>
                ) : null}
              </Card>
            ) : null}
            {approval.confirm ? (
              <Card title={approval.confirm.message}>
                <button disabled={answering} onClick={() => decide(true)} className={`${option} border-white bg-[#1c1c1e] text-white`}>
                  Approve <CheckIcon size={18} weight="bold" />
                </button>
                <button disabled={answering} onClick={() => decide(false)} className={`${option} border-dashed border-[#3a3a3c] text-[#aeaeb2]`}>
                  Decline
                </button>
              </Card>
            ) : null}
            {error ? <p className="text-center text-sm text-[#ff453a]">{error}</p> : null}
            <div ref={endRef} />
          </div>
        </main>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#151515] via-[#151515] to-transparent px-5 pb-6 pt-10"
        >
          <div className="mx-auto flex max-w-[860px] items-center gap-3 rounded-full bg-[#2c2c2e] px-5 py-3.5">
            <button
              type="button"
              aria-label="New chat"
              onClick={async () => {
                if (await reset()) setSession(crypto.randomUUID());
              }}
              className="text-[#aeaeb2] hover:text-white"
            >
              <PlusIcon size={20} />
            </button>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Message"
              aria-label="Message"
              disabled={!connected}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-[#8e8e93]"
            />
            {running ? (
              <button type="button" aria-label="Stop" onClick={() => void abort()} className="flex size-8 items-center justify-center rounded-full bg-[#3a3a3c] text-white">
                <StopIcon size={14} weight="fill" />
              </button>
            ) : prompt.trim() ? (
              <button type="submit" aria-label="Send" className="flex size-8 items-center justify-center rounded-full bg-[#0a84ff] text-white">
                <ArrowUpIcon size={16} weight="bold" />
              </button>
            ) : null}
          </div>
        </form>
      </section>

    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(<App />);
