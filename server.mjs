/**
 * Serves the chat UI (web/, built to web/dist by `npm run build`) against local Pi: a personal
 * agent for any company that supports the Personal Agent Protocol.
 *
 *   node server.mjs        → http://localhost:8787
 *
 *   AGENT_NAME, POPPY_SITE  see extension/poppy.ts; AGENT_MODEL  Pi model (default openai/gpt-6.1-sol); PORT  default 8787
 *
 * Pi runs as a child in RPC mode with the Poppy extension. This file turns Pi's
 * RPC events into the snapshot the UI polls at /api/pi/view, and the UI's
 * Approve / Decline buttons into answers to the extension's confirm dialogs.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 8787);
// gpt-5.5 is refused for ChatGPT-account logins since Pi 1.2.0; this one is accepted.
const MODEL = process.env.AGENT_MODEL ?? "openai/gpt-6.1-sol";
const CONFIG = { name: process.env.AGENT_NAME ?? "Personal agent", site: process.env.POPPY_SITE ?? null };
const DIST = fileURLToPath(new URL("./web/dist/", import.meta.url));
const TOOLS = [
	{ name: "poppy_connect", description: "Discover a Poppy site and start a signed-out session." },
	{ name: "poppy_call", description: "Call one of the company's tools. Operations wait for your approval." },
	{ name: "poppy_sign_in", description: "Ask you to sign in at the company in your browser." },
	{ name: "poppy_message", description: "Talk to the company's own agent." },
	{ name: "poppy_sign_out", description: "Revoke the agent's access to your account." },
];

let pi;
let state;
let nextEntry = 0;
let requestId = 0;
const waiting = new Map();

function fresh() {
	return { session: crypto.randomUUID().slice(0, 8), entries: [], live: null, running: false, tools: new Map(), signIn: null, confirm: null, status: "", company: null, model: null };
}

function send(command) {
	const id = `r${++requestId}`;
	pi.stdin.write(`${JSON.stringify({ id, ...command })}\n`);
	return new Promise((resolve) => waiting.set(id, resolve));
}

function onEvent(e) {
	if (e.type === "response") return waiting.get(e.id)?.(e), waiting.delete(e.id);
	switch (e.type) {
		case "agent_start":
			state.running = true;
			break;
		case "agent_settled":
			state.running = false;
			state.live = null;
			state.tools.clear();
			break;
		case "message_start":
			if (e.message.role === "assistant") state.live = { ...e.message, content: [] };
			break;
		case "message_update": {
			const u = e.assistantMessageEvent;
			const live = state.live;
			if (!live || u.contentIndex === undefined) break;
			const content = live.content;
			if (u.type === "text_start") content[u.contentIndex] = { type: "text", text: "" };
			if (u.type === "text_delta") content[u.contentIndex] = { type: "text", text: (content[u.contentIndex]?.text ?? "") + u.delta };
			if (u.type === "thinking_start") content[u.contentIndex] = { type: "thinking", thinking: "" };
			if (u.type === "thinking_delta") content[u.contentIndex] = { type: "thinking", thinking: (content[u.contentIndex]?.thinking ?? "") + u.delta };
			if (u.type === "toolcall_end" && u.toolCall) content[u.contentIndex] = u.toolCall;
			break;
		}
		case "message_end":
			if (e.message.role !== "system") state.entries.push({ id: `e${++nextEntry}`, kind: "pi.message", model: [e.message] });
			if (e.message.role === "assistant") state.live = null;
			break;
		case "tool_execution_start":
			state.tools.set(e.toolCallId, { callId: e.toolCallId, name: e.toolName, status: "running", output: "" });
			break;
		case "tool_execution_update": {
			const text = e.partialResult?.content?.map((c) => c.text ?? "").join("") ?? "";
			const url = /https:\/\/\S+/.exec(text)?.[0];
			if (e.toolName === "poppy_sign_in" && url) state.signIn = { url, code: /Code: (\S+)/.exec(text)?.[1] };
			break;
		}
		case "tool_execution_end":
			state.tools.delete(e.toolCallId);
			if (e.toolName === "poppy_sign_in") state.signIn = null;
			break;
		case "extension_ui_request":
			if (e.method === "confirm") state.confirm = { id: e.id, title: e.title, message: e.message };
			else if (e.method === "setStatus" && e.statusKey === "poppy") state.status = e.statusText ?? "";
			else if (e.method === "setStatus" && e.statusKey === "poppy-company") state.company = e.statusText ?? null;
			else if (["select", "input", "editor"].includes(e.method)) pi.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: e.id, cancelled: true })}\n`);
			break;
	}
}

function start() {
	state = fresh();
	pi = spawn("pi", ["--mode", "rpc", "--no-session", "--model", MODEL, "-e", "./extension", "--tools", "poppy_*", "--no-context-files", "--no-skills"], {
		cwd: fileURLToPath(new URL(".", import.meta.url)),
		env: { ...process.env, POPPY_UI: "web" },
		stdio: ["pipe", "pipe", "inherit"],
	});
	let buffer = "";
	pi.stdout.on("data", (chunk) => {
		buffer += chunk.toString();
		let newline;
		while ((newline = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newline).replace(/\r$/, "");
			buffer = buffer.slice(newline + 1);
			if (line) onEvent(JSON.parse(line));
		}
	});
	pi.on("exit", (code) => console.error(`pi exited (${code})`));
	send({ type: "get_state" }).then((r) => {
		const m = r.data?.model;
		if (m) state.model = { provider: m.provider, modelId: m.id };
	});
}

function view() {
	const snapshot = {
		type: "snapshot",
		entries: state.entries,
		...(state.live ? { generation: { message: state.live } } : {}),
		...(state.running ? { run: {} } : {}),
		tools: [...state.tools.values()],
		inbox: [],
		agent: { model: state.model },
	};
	return {
		session: state.session,
		events: [snapshot],
		tools: TOOLS,
		status: state.status,
		config: CONFIG,
		company: state.company,
		approval: { sign_in_url: state.signIn?.url, sign_in_code: state.signIn?.code, confirm: state.confirm ? { title: state.confirm.title, message: state.confirm.message } : undefined },
	};
}

async function body(req) {
	let text = "";
	for await (const chunk of req) text += chunk;
	return text ? JSON.parse(text) : {};
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

createServer(async (req, res) => {
	const json = (value, status = 200) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(value));
	const { pathname } = new URL(req.url, "http://localhost");
	try {
		if (req.method === "GET" && pathname === "/api/pi/view") return json(view());
		if (req.method === "POST" && pathname === "/api/agent/prompt") {
			const { prompt, when_busy } = await body(req);
			if (!prompt?.trim()) return json({ error: "empty prompt" }, 400);
			const r = await send(state.running ? { type: when_busy === "steer" ? "steer" : "follow_up", message: prompt } : { type: "prompt", message: prompt });
			return json(r.success ? { ok: true } : { error: r.error }, r.success ? 202 : 400);
		}
		if (req.method === "POST" && pathname === "/api/pi/abort") return json({ aborted: (await send({ type: "abort" })).success });
		if (req.method === "POST" && pathname === "/api/pi/new") {
			await send({ type: "abort" });
			pi.stdin.end();
			start();
			return json({ session: state.session });
		}
		if (req.method === "POST" && pathname === "/api/approval") {
			const { confirmed } = await body(req);
			if (!state.confirm) return json({ error: "nothing to approve" }, 409);
			pi.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: state.confirm.id, confirmed: confirmed === true })}\n`);
			state.confirm = null;
			return json({ ok: true });
		}
		if (req.method === "GET") {
			const file = join(DIST, pathname === "/" ? "index.html" : pathname);
			if (!file.startsWith(DIST)) return res.writeHead(404).end();
			const data = await readFile(file).catch(() => null);
			if (!data) return res.writeHead(404).end();
			return res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(data);
		}
		res.writeHead(404).end();
	} catch (error) {
		json({ error: String(error) }, 500);
	}
}).listen(PORT, "127.0.0.1", () => {
	start();
	console.log(`${CONFIG.name}: http://localhost:${PORT}`);
});
