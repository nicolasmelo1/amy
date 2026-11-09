---
title: Prove a phase
description: Write the scenario that proves a unit of work, the resources it runs against, and the fixtures it starts from — and read the proof it leaves.
group: Build your own
order: 5
---

# Prove a phase

Passing the tests a branch can run is not evidence the work holds. A project's
`prove/` phase runs a **scenario** against the real system — the app running,
the page published, the message sent — and leaves a **proof** the other phases
read. Proving is a plugin, `@amykit/plugin-prove`; the core learns no scenario,
step, resource or driver.

## The scenario is a section of the brief

The proving workflow declares one brief section, `Scenario`, so `amy brief
check` refuses a brief without it, naming the unit, and grooming does not stop
until it is there. It is YAML:

```yaml
name: paid-invoice-shows-paid
resources: [shop-main]          # leased before the first step
fixtures: [a-paid-invoice]      # ensured before the first step
steps:
  - id: settle                  # repeats its check until it holds, or fails naming it
    kind: wait-until
    operation: http.get
    input: { url: "https://api.shop.localhost/invoices/1" }
    expect: { path: status, equals: paid }
    deadlineMs: 30000
  - id: open                    # no kind: deterministic, no model runs
    operation: browser.open
    input: { url: "https://shop.localhost/invoices/1" }
  - id: badge                   # an agent calls operations one turn at a time, seeing each answer; a pass is replayed with no model
    kind: agent
    prompt: read the payment badge on the open page
  - id: look                    # asks a person in the work's thread, holding the leases
    kind: human
    ask: Does the badge read Paid?
    deadlineMs: 3600000
assertions:
  - { id: settled, criterion: C1, step: settle, path: status, equals: paid }
  - { id: shown, criterion: C2, step: badge, path: text, equals: Paid }
  - { id: seen, criterion: C3, step: look, path: answer }
```

A step reaches the world only through an operation a mounted plugin offers,
and the check refuses a step naming one nothing offers, or an input its schema
refuses. A scenario that calls no operation at all is refused: the
walkthrough's fake world would be its only actor.

An assertion is `passed`, `failed` or `unsupported`. Unsupported — a step that
never ran, an output without the path, a UI check nothing could settle —
blocks completion like a failure; it is never counted as a pass.

## Resources and fixtures

Nothing about an environment is assumed. A **resource** is the commands its
person configured to bring it up, check it and take it down, run through the
commands port by name; one with no `check` is refused at mount. A **fixture**
ensures a state: it reads the world, acts only on what differs, and asks a
person when it cannot.

A resource has a capacity, kept for the whole machine under Amy home, so two
tickets in different projects that need one account take turns: the next seat
goes to the highest priority waiting, and a run that stops renewing loses its
seat. Waiting for a seat is a look, never an attempt.

### Two worktrees side by side, with portless

[portless](https://github.com/vercel-labs/portless) gives each app a free port
through `PORT` and a stable `https://<name>.localhost`; in a linked git
worktree the branch becomes a subdomain, so the main checkout and a worktree on
`fix-ui` serve `shop.localhost` and `fix-ui.shop.localhost` at once. The
proving plugin never names it: it is three command lines in the config. Each
app's `up` keeps the process it started, and its `down` stops that process and
no other, because both worktrees run the same command line.

```yaml
plugins:
  "@amykit/plugin-command":
    allow:
      shop-main-up: "cd ~/work/shop && { nohup portless shop npm run dev > /tmp/shop-main.log 2>&1 & echo $! > /tmp/shop-main.pid; }"
      shop-main-check: "curl -fsS --retry 30 --retry-connrefused --retry-delay 1 https://shop.localhost/health"
      shop-main-down: "kill $(cat /tmp/shop-main.pid) && rm /tmp/shop-main.pid"
      shop-fix-ui-up: "cd ~/work/shop-fix-ui && { nohup portless shop npm run dev > /tmp/shop-fix-ui.log 2>&1 & echo $! > /tmp/shop-fix-ui.pid; }"
      shop-fix-ui-check: "curl -fsS --retry 30 --retry-connrefused --retry-delay 1 https://fix-ui.shop.localhost/health"
      shop-fix-ui-down: "kill $(cat /tmp/shop-fix-ui.pid) && rm /tmp/shop-fix-ui.pid"
  "@amykit/plugin-prove":
    resources:
      shop-main: { capacity: 1, up: shop-main-up, check: shop-main-check, down: shop-main-down }
      shop-fix-ui: { capacity: 1, up: shop-fix-ui-up, check: shop-fix-ui-check, down: shop-fix-ui-down }
    fixtures:
      a-paid-invoice:
        ensure:
          - check: { operation: http.get, input: { url: "https://api.shop.localhost/invoices/1" }, expect: { path: status, equals: paid } }
            act: { operation: http.post, input: { url: "https://api.shop.localhost/invoices/1/pay" } }
```

## Drivers

A driver is a plugin of its own, offering operations:

| Plugin | Drives | Through |
| :-- | :-- | :-- |
| `@amykit/plugin-agent-browser` | a web page: open, snapshot, act on refs, diff, a UI check | [agent-browser](https://agent-browser.dev) |
| `@amykit/plugin-agent-desktop` | a desktop app's accessibility tree: snapshot, click, type, press | [agent-desktop](https://agent-browser.dev/desktop) |
| `@amykit/plugin-terminal` | an interactive program: run, type, press, wait for text, read the screen | [terminal-use](https://github.com/flipbit03/terminal-use) |

A UI check passes on structure first — the accessibility tree — then on pixels
within a threshold against the planned design; what neither settles goes to an
agent, and what it cannot settle is `unsupported`.

## The proof

A run ends `PROVEN` or `refused`, and writes one record per unit in the
project's artifact root, beside the briefs: the scenario, each assertion's
status, who ran it, what it ran against, the code digest and the brief
revision. When either moves, the proof stops counting and the unit is unproven
again. A person who ran the scenario by hand records it the same way:

```sh
amy prove record TBO-12 --scenario paid-invoice-shows-paid --by ada \
  --assertion settled@C1=passed --assertion shown@C2=passed --assertion seen@C3=passed --revision 3
amy prove show TBO-12 --revision 3
```
