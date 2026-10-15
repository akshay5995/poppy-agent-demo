# poppy-agent-demo

A personal agent for any company that implements the [Personal Agent Protocol](https://personalagentprotocol.org) (Poppy). It's an extension for the [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) coding agent, plus a texting-style web chat that drives Pi.

Give it a company's site and what you need. It discovers the company, calls its tools, asks you to sign in when needed, and asks you to approve anything that changes your account.

## Demo

Connecting to [www.withpoppyseed.dev](https://www.withpoppyseed.dev), the public Poppyseed demo company (Poppy Travel):

![The agent connects to Poppy Travel and lists what it offers](docs/connect.png)

Searching flights with the company's own tool, no sign-in needed:

![The agent searches Poppy Travel for flights from San Francisco to Lisbon](docs/search.png)

## Quick start

Requirements:

- Node 22+
- Pi, installed globally and logged in: `npm install -g @earendil-works/pi-coding-agent`, then `pi` → `/login`
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) on your `PATH`

```sh
npm install
npm start          # web chat at http://localhost:8787
npm run terminal   # or: Pi's terminal UI
```

Then try:

> Connect to www.withpoppyseed.dev and tell me what it offers.

## Configuration

| Variable      | Default              | Purpose                                                    |
| ------------- | -------------------- | ---------------------------------------------------------- |
| `AGENT_NAME`  | `Personal agent`     | Name shown on companies' consent pages and the chat title. |
| `POPPY_SITE`  | unset                | Company to connect to when you don't name one.             |
| `AGENT_MODEL` | `openai/gpt-6.1-sol` | Pi model (`provider/id`).                                  |
| `PORT`        | `8787`               | Web UI port.                                               |
| `POPPY_LOG`   | unset                | File to append a JSONL request log to (no tokens/bodies).  |

## How it works

![run.sh and server.mjs both run Pi with the extension](docs/run-modes.png)

- **Tools.** `extension/poppy.ts` gives Pi five tools: `poppy_connect`, `poppy_call`, `poppy_sign_in`, `poppy_message`, `poppy_sign_out`.
- **Discovery.** `poppy_connect` reads the company's Poppy metadata, opens a signed-out session, and lists the company's MCP tools. `poppy_call` calls any of them, so the agent needs no company-specific code.
- **Identity.** On start, the extension serves its client metadata and keys behind a Cloudflare quick tunnel; companies fetch them from there.
- **Sign-in.** Device flow: you approve at the company in your own browser. The agent never sees your password.
- **Approvals.** Purchases, bookings, and cancellations wait for you to press Approve. Declining cancels.
- **Secrets.** Keys and tokens stay in the extension; the model only sees tool results.
- **Web UI.** `server.mjs` runs Pi in RPC mode and serves the chat UI from `web/`.

The extension also works on its own: `pi -e ./extension` (after `npm install`).

## Limitations

- Device sign-in only; companies without it work signed-out only.
- Quick tunnels change each run, so companies see a new agent and sign-ins don't carry over.
- The web server runs one Pi session, shared by all tabs.

## Credits & license

MIT © Akshay Ram. Adapted from [irvinebroque/poppy-demo](https://github.com/irvinebroque/poppy-demo); the chat UI is from [Cloudflare's Pi harness example](https://github.com/cloudflare/agents/tree/main/examples/next/harnesses/pi) (MIT, see `web/LICENSE-cloudflare-agents.txt`).
