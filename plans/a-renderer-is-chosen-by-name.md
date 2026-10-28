# A renderer is chosen by name

A window that only one renderer can open is a window with a flag per renderer
— `amy ui --terminal`, then `--desktop`, then `--phone` — and a renderer
somebody else writes has no flag at all. Every other part of amy is a plugin
found by the name it registers. A renderer should be too.

## What changes

**A renderer is a plugin that contributes to `ui-renderer`**, under a name:
`text`, `desktop`, `terminal`, whatever a third party calls theirs. The
contribution says which surfaces of `frame.yaml` it draws, how to start it as
a client of a server (*the window is served*), and — when it has one — how to
build it.

**`amy ui` opens the renderer the config names.**

```sh
amy ui                    # ui.default from config.yaml
amy ui desktop            # a renderer by name
amy ui --mode terminal    # the same, as a flag
amy ui list               # what is installed, and which is the default
```

```yaml
ui:
  default: desktop
  server: https://amy.example.dev     # optional; the local server otherwise
```

A name nothing installed is refused with the list of what is, and how to add
one — `amy plugin add @amykit/ui-desktop` — the way a missing workflow already
is.

**One renderer arrives with the command: `text`.** It already ships inside
`@amykit/ui`, which the CLI depends on, so `amy ui` works on the bare install
and on a server with no display. Everything else is installed by name, as many
as a person wants. This keeps *nothing is installed by default*
(`docs/design/nothing-is-installed-by-default.md`): an install that arrived
carrying Electron would be a hundred megabytes nobody asked for on a machine
that may have no screen.

**`amy ui build <name>` builds a renderer that ships as an app.** A desktop
app is packaged, a phone app is compiled — neither can load a package at run
time — so the renderer that needs it declares a build, and the command runs it
against the current SDK — so the app carries the contract hash it was built
for, and the server tells it when it is out of date — with the renderer-side
contributions installed beside it: themes, and the
client half of any opener. What a build never needs is the plugins that
contribute *views*: views are computed on the server and arrive as data, so a
phone built once shows a plugin installed on the server a month later. Only a
plugin that changes how something is *drawn* asks for a rebuild, and the build
says which ones it took.

## The gates

`ui-frame` already drives every renderer; from this row it finds them by
name, through `ui-renderer`, rather than by a list in the script — so a
renderer cannot be installed and escape the gate. `ui-window` gains the
command.

## Acceptance criteria

- [ ] `amy ui` opens `ui.default`, `amy ui <name>` and `amy ui --mode <name>`
      open that renderer (proof: deferred:assertion:window.a_renderer_opens_by_name)
- [ ] A name nothing installed is refused with the installed list and the
      command that adds one (proof: deferred:test:packages/cli/tests/ui-command.test.ts)
- [ ] On the bare install, `amy ui` opens `text` and nothing was installed
      for it (proof: deferred:assertion:bare.a_window_needs_no_install)
- [ ] Two plugins contributing the same renderer name are refused at boot,
      naming both (proof: deferred:test:packages/core/tests/mount.test.ts)
- [ ] A renderer declaring a surface `frame.yaml` does not give it is refused
      at boot (proof: deferred:test:packages/cli/tests/ui-command.test.ts)
- [ ] Every installed renderer is driven by the frame's script, found through
      `ui-renderer` (proof: deferred:assertion:frame.every_installed_renderer_is_measured)
- [ ] A built app shows a view-only plugin installed on the server after the
      build, without rebuilding (proof: deferred:assertion:window.a_view_needs_no_rebuild)
- [ ] `amy ui build` names the drawing plugins it took
      (proof: deferred:test:packages/cli/tests/ui-build.test.ts)

**Exit condition:** on the bare install, `amy ui` opens the text renderer
against the local server; after `amy plugin add @amykit/ui-desktop` and
`ui.default: desktop`, `amy ui` opens the desktop app and `amy ui text` still
opens the text one — and a renderer from outside this repository, installed by
name, is driven by the frame's script without the script being edited.
