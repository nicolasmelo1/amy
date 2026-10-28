# amy has a window

Everything amy knows is reachable today through `amy status`, `amy budget`,
`amy brief`, the event log and a Slack thread. Nothing shows it in one place,
moving, and nothing lets a person look at a piece of work and the machine's
reasoning about it side by side.

The window that comes with an install is small on purpose. amy is a workflow
builder; the window that ships shows the work and lets a person talk to it, and
everything beyond that is a plugin.

## The shape

```
┌──────────────┬────────────────────────────────────────────┬─────────┐
│ ⌕ search     │  Work   Workflows   Settings               │         │  nav 1
│──────────────│────────────────────────────────────────────│  right  │
│ ◉ TKT-11  ⋯  │  TKT-11 · ticket-to-qa · ESCALATED         │  panel  │
│ ● TKT-22     │  DISCOVERED ─ … ─ ◉ESCALATED ─ QA_HANDOFF  │ (logs / │
│ ○ TKT-18     │  [Timeline] [Diff] [plugin tabs…]          │  thread)│
│ ── profile   │                                            │ opens & │
│ + groom      │  canvas                                    │ closes  │
└──────────────┴────────────────────────────────────────────┴─────────┘
                                           ⌘K  ask anything
```

- **Nav 1**: `Work`, `Workflows`, `Settings`. A person reorders them in
  `config.yaml`; they cannot be removed. Plugins may add sections after them
  (*the window takes plugins*).
- **Nav 2**: a search box and the list for the section. Under `Work`, every
  record of every profile, grouped by profile, with its state and the harness
  that last ran it. Under `Workflows`, the profiles. A `⋯` acts on its own row
  and nothing wider, through a command that already exists: a record's offers
  `poke`; a workflow's offers `remove <name>`, with the refusal `amy remove`
  already gives when the machine would not survive it. The handbrake —
  `pause` and `resume` — stops every workflow at once, so it is not on any
  row: it sits in the `Workflows` canvas, saying what it stops. Retiring one
  record waits for *work that is over goes away*, which adds the command.
- **Canvas**: the selected item. For a record, the state machine strip with
  the current state marked, and its timeline: the record's history joined to
  the events that mention it.
- **Right panel**, opened and closed by the person: the log, filtered to the
  selected record, or the work thread when the record is waiting on its
  owner.
- **Settings is `config.yaml`**, edited as text, the way an editor's settings
  are a JSON file. Saving runs the same `assemble` a boot runs, and a config
  that would not mount is not saved: every refusal is shown by name, as
  `mount()` already reports them. A form over it can come later.

## What runs it

**A desktop app, not a page.** A window served to a browser tab is a tab
among forty, has no place in the menu bar and cannot own a global shortcut. amy
is a machine that runs all day on a person's computer; its window should be an
app that does too. macOS first; Windows and Linux are the same app built for
them, not a second one.

**Electron, for the gate's sake.** The deciding question is not size. It is
whether the engine the gate measures is the engine that ships. Electron
carries its own Chromium on every platform, so the projection *the frame is
closed* reads in its pinned Chromium is the window a person gets on a Mac
today and on Windows and Linux later. Tauri draws with each system's own
webview — WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux — so a
gate green in one engine says nothing about the other two. Electron is also
JavaScript end to end, as amy is. The cost is a larger download, paid once,
named in the dependency lock like any package — and paid only by somebody who
installs this renderer, since *a renderer is chosen by name* keeps it out of
the bare install.

The app is `@amykit/ui-desktop`, contributing the renderer named `desktop`
(*a renderer is chosen by name*): `amy ui desktop` opens it, and so does
`amy ui` once `ui.default` says so. It is **a client and nothing else**
(*the window is served*): it connects to the local server, or to the one
`ui.server` names, and draws what the server sends, through the generated SDK. It reads no file under
amy's home, so the same app shows the work on this machine or on one reached
through a tunnel. `amy ui build desktop` packages it as a macOS app.

Closing the window does not quit the app: it stays resident for *amy lives in
the menu bar*. `mod+k` can be a **global** shortcut that brings the ask up
from anywhere, configurable in `config.yaml` and off by default, because a
global shortcut is a promise about every other app on the machine — and never
`⌘Space`, which is Spotlight's.

The window writes nothing the CLI cannot. Every intent resolves to a function
a command already calls, so the window is never a second road to the tracker.

## The gates

- **`ui-frame`** (from *the frame is closed*) gains the desktop renderer:
  `plugins/ui-desktop/src/**` joins its activation, and the conformance script
  runs against the packaged app's own Chromium.
- **`ui-window`**, new: the host's behaviour, observed. Its scenario installs
  amy, starts the daemon on the conformance world with fake tracker, forge and
  conversation, launches the packaged app and drives the script.
  Activation: `packages/cli/src/ui/**`, `packages/ui/**`, `plugins/ui-desktop/src/**`.
  Every `window.*` assertion below is one of its required assertions.

## What it delivers

The `machine`, `workflows` and `settings` domains — `getHandbrake`, `setHandbrake`, `removeWorkflow`, `getConfig` and `saveConfig` — and the views `workflows.list`, `workflows.handbrake` and `work.log` (`work.list` and `work.detail` arrived with *the window is served*), from *every endpoint is named before it is built*, flipped to
`delivered` in `surface.yaml` in the same pull request.

## Acceptance criteria

- [ ] What this row delivers is `delivered` in `surface.yaml`, and the surface
      gate is green (proof: deferred:test:packages/server/tests/surface.test.ts)

- [ ] The desktop renderer holds the frame on every step of the script
      (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] The desktop and the text renderer agree on every region
      (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] A record the daemon advances moves in the open window with no reload,
      within one second of its event (proof: deferred:assertion:window.a_record_moves_without_a_reload)
- [ ] The work list carries exactly the records `amy status --json` does, for
      every profile (proof: deferred:assertion:window.the_list_is_amy_status)
- [ ] Nav 1 reorders from `config.yaml`, and a section that does not exist is
      refused by name (proof: deferred:test:packages/cli/tests/ui-config.test.ts)
- [ ] Saving a config that would not mount keeps the old file and shows every
      refusal (proof: deferred:assertion:window.a_config_that_would_not_mount_is_not_saved)
- [ ] The app draws everything from the server and reads nothing under amy's
      home (proof: deferred:assertion:server.a_client_needs_nothing_but_the_server)
- [ ] `amy ui build desktop` produces a macOS app that opens against a server
      (proof: deferred:assertion:window.the_built_app_opens)
- [ ] The global shortcut is off unless configured, and a configured one that
      the system already owns is refused by name
      (proof: deferred:assertion:window.a_global_shortcut_is_asked_for_not_taken)
- [ ] Closing the window leaves the app running, and reopening it shows the
      record that was selected (proof: deferred:assertion:window.closing_is_not_quitting)
- [ ] Every `⋯` action leaves the same record, queue and log a run of its
      command leaves (proof: deferred:assertion:window.an_action_is_its_command)
- [ ] No row's `⋯` offers an action wider than its row: no record row pauses
      the machine or removes a plugin (proof: deferred:test:packages/cli/tests/ui-actions.test.ts)
- [ ] The fake tracker's and forge's call logs hold no write the window made
      (proof: deferred:assertion:window.the_window_writes_nothing_the_cli_cannot)

**Exit condition:** on a Mac, with the daemon running, a person runs
`amy plugin add @amykit/ui-desktop`, opens `amy ui desktop`, watches a
ticket go from `DISCOVERED` to `IMPLEMENTING` without touching anything, pokes
another from its `⋯`, and breaks `config.yaml` in Settings without breaking the
install — and `sf check` is green on `ui-frame` and `ui-window`.
