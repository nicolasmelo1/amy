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
  that last ran it. Under `Workflows`, the profiles. A `⋯` on each row runs the
  operator commands that already exist — `poke`, `pause`, `resume`, `remove` —
  and nothing else.
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

`amy ui` starts a local host that mounts the profiles read-only, watches the
event log (*the event log can be watched*), recomputes the views whose inputs
changed (*a view is data*) and streams patches to a browser renderer over a
socket. It binds to the loopback interface, prints a URL carrying a random
token once, and refuses a request without it.

The window writes nothing the CLI cannot. Every intent resolves to a function
a command already calls, so the window is never a second road to the tracker.

## The gates

- **`ui-frame`** (from *the frame is closed*) gains the browser renderer:
  `plugins/ui-web/src/**` joins its activation, and the conformance script
  runs against the installed bundle.
- **`ui-window`**, new: the host's behaviour, observed. Its scenario installs
  amy, starts the daemon on the conformance world with fake tracker, forge and
  conversation, opens the window in the pinned browser and drives the script.
  Activation: `packages/cli/src/ui/**`, `packages/ui/**`, `plugins/ui-web/src/**`.
  Every `window.*` assertion below is one of its required assertions.

## Acceptance criteria

- [ ] The browser renderer holds the frame on every step of the script
      (proof: deferred:assertion:frame.every_region_sits_where_declared)
- [ ] The browser and the text renderer agree on every region
      (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] A record the daemon advances moves in the open window with no reload,
      within one second of its event (proof: deferred:assertion:window.a_record_moves_without_a_reload)
- [ ] The work list carries exactly the records `amy status --json` does, for
      every profile (proof: deferred:assertion:window.the_list_is_amy_status)
- [ ] Nav 1 reorders from `config.yaml`, and a section that does not exist is
      refused by name (proof: deferred:test:packages/cli/tests/ui-config.test.ts)
- [ ] Saving a config that would not mount keeps the old file and shows every
      refusal (proof: deferred:assertion:window.a_config_that_would_not_mount_is_not_saved)
- [ ] A request without the token is refused
      (proof: deferred:assertion:window.nothing_answers_without_the_token)
- [ ] The host listens on loopback and nowhere else
      (proof: deferred:assertion:window.it_listens_only_on_loopback)
- [ ] Every `⋯` action leaves the same record, queue and log a run of its
      command leaves (proof: deferred:assertion:window.an_action_is_its_command)
- [ ] The fake tracker's and forge's call logs hold no write the window made
      (proof: deferred:assertion:window.the_window_writes_nothing_the_cli_cannot)

**Exit condition:** with the daemon running, a person opens `amy ui`, watches a
ticket go from `DISCOVERED` to `IMPLEMENTING` without touching anything, pokes
another from its `⋯`, and breaks `config.yaml` in Settings without breaking the
install — and `sf check` is green on `ui-frame` and `ui-window`.
