# Looks are configuration

A record's row in the window should say at a glance whether it needs the
person reading it. The core cannot say so. It knows a state is `waiting` or
`terminal` and nothing more (`standing` in `packages/cli/src/status-view.ts`),
so `ESCALATED` and `HUMAN_REVIEW` look alike — both waiting — though one waits
on its owner and the other on somebody else.

And what a window looks like is a person's preference, not the machine's.

## What changes

**A workflow may declare `attentionStates`**: the states in which it waits on
the person whose work it is. Optional, so every workflow written so far mounts
unchanged and simply has none. `ticket-to-qa` declares `CLARIFYING` and
`ESCALATED`.

**Four semantic standings**: attention, active, waiting, finished. The window
colours by those, so a workflow nobody configured still reads correctly.

**`config.yaml` decides the rest**, under `ui`:

```yaml
ui:
  theme: dark                 # a shipped theme, or one a plugin contributes
  colors:                     # override any token of the theme
    attention: "#d9534f"
    accent: "#5b8def"
  states:                     # override one workflow's state
    ticket-to-qa:
      HUMAN_REVIEW: "#e0a23a"
```

A theme is a set of tokens — colours, font, density — contributed to a
`ui-theme` collection, so a plugin can ship one. The keys are validated at
boot like any setting: a state the workflow does not have, or a token no
theme defines, is refused by name.

## The gates

Colour is the one thing the frame does not fix, so it is the one thing a
renderer must not decide. `a-renderer-names-no-colour` (from *the frame is
closed*) keeps every colour in a theme's tokens. What the frame does fix is the
standing: the projection carries each row's standing, never its colour, so
"the escalated records stand out" is asserted the same way in a terminal and
a browser.

## Acceptance criteria

- [ ] A workflow without `attentionStates` mounts unchanged
      (proof: deferred:test:packages/core/tests/mount.test.ts)
- [ ] An escalated record's row carries the attention standing in every
      renderer, with no `ui` block at all (proof: deferred:assertion:frame.renderers_agree_on_every_region)
- [ ] A colour set for one state of one workflow applies there and nowhere
      else (proof: deferred:test:packages/cli/tests/ui-theme.test.ts)
- [ ] A state the workflow does not declare is refused at boot by name
      (proof: deferred:test:packages/cli/tests/ui-theme.test.ts)
- [ ] A colour literal in a renderer outside its token file fails the build
      (proof: deferred:test:mutation fixture for a-renderer-names-no-colour)

**Exit condition:** a person switches the window to a theme a plugin
contributed, recolours one state of one workflow, and the escalated records are
still the ones that stand out.
