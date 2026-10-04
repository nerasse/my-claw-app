# Settings

The index is grouped by what a setting is about, one page per subject (owner, 2026-10-04: fourteen
rows in one list, and "General" / "Other" holding a bit of everything, read as chaos).

```
Settings                                   search: "voix", "clé", "thème"...
├─ Get started (banner)                    while a step is left; then under Advanced
├─ THIS APP
│  ├─ Appearance       theme · message size · folding (tools, reasoning)
│  ├─ Notifications    permission (browser) · sounds (phone)
│  └─ Updates          server · app · download on mobile data
├─ THE AGENT
│  ├─ Models           default · fallback · context cap · retry · providers and plans (+) · tags
│  ├─ Agents           the orchestrator and every agent
│  └─ Services         speech-to-text · text-to-speech · location · search · embeddings · browser
├─ WHAT THE AGENT CAN USE
│  ├─ Workspaces       folders and their instructions
│  ├─ Skills
│  └─ Tools            on/off · ask before running · › MCP servers · › approval history
└─ SECURITY
   ├─ Devices          this device · its server · pair a browser · paired devices
   └─ Advanced         connection · diagnostics · raw config · get started
```

## One parent per page

`PARENT` in `src/app/settingsPages.ts` says where Back goes from a page whose parent never
changes; the page's own Back and the back cascade (`backCascade.ts`) both read it, so they cannot
disagree. The pages reached from more than one place keep their own rule in the cascade: the
model picker (`modelPickerFrom`), a workspace (`workspaceFrom`), an instruction
(`instructionBack`), and the setup (`setupFrom`: the index banner, or Advanced).

## The search

`src/core/settingsSearch.ts`: one entry per setting the owner may look for, with the page that
holds it and words in English and in French. Accents and case are ignored, a typed word matches
the start of a word, and the entries named by what was typed come first. Enter opens the first
result. What only the phone has (the APK update, its download on mobile data) is offered on the
phone only. A test walks every entry up to a row of the index: a setting cannot point at a page
nobody can reach.

## What moved, and what went

- General and Other are gone. Their settings each went to the page of their subject: the device
  credential and the server address to Devices, the connection state and the send queue to
  Advanced, the theme, the text size and the folding to Appearance, both updates to Updates, the
  notification permission to Notifications.
- The voice switch of General (Auto / Cloud / Local) wrote the same `voice.stt.mode` as the
  Speech-to-text card of Services: two controls for one setting. Services keeps it; the app no
  longer asks for `voice.mode`.
- The defaults (default model, fallback, retry) left Agents for Models, and the tags left their
  hidden row among the providers for a section of their own.
- The global context cap (`context.cap`) is a row of the Models defaults: it is the ceiling every
  agent, tag and conversation without its own falls back to, so it sits with the other fallbacks.
  Blank restores the server default (512k), 0 lifts it. The row says an agent or tag cap outranks
  it, because that is what made the value look ignored.
- MCP servers sit under Tools, the raw config under Advanced.
- The drawer's "Agents" (the shared workers) is "Sub-agents": the orchestrator is the conversation
  itself, and the Agents settings page is where every agent, the orchestrator included, is set.

## Second pass (owner, 2026-10-04)

- "AI" became "the agent": the whole app is AI; Models, Agents and Services are what the agent is
  made of.
- Tool approvals left Security for Tools. The index row was an history for a feature the app could
  not turn on; each tool now has its "ask" switch (`tools.confirm`, server docs/tool-approvals.md),
  and the history is a row of the Tools page.
- The ChatGPT and Claude plans are providers, listed with the keyed ones under Models, not a
  Subscriptions section apart: "subscription or API key, it is a provider". The `+` offers ChatGPT
  plan, Claude plan, Claude API key (beside the plan on purpose: same models, paid per use), Custom.
  A plan is named on the way in, several of a kind can exist, and each has its page: sign in or out,
  rename, its models (server docs/subscription-accounts.md).

