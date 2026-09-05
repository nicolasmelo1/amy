# @amykit/cli

The `amy` command.

It reads the configuration, loads the plugins it names, assembles them, and
prints. It holds no domain logic and it constructs no adapter: every decision
belongs to the workflow and every effect to a plugin.

## Start here

```sh
amy init                 # write the config and roster templates
cp .env.example .env     # then put your tracker key in it
amy roster confirm       # stamp today's date
amy doctor               # check every dependency before it touches a ticket
```

`amy doctor` is the one to run first, and it exits non-zero, so it is safe to
gate on. It checks the config, every plugin's own settings against the schema
that plugin declared, the roster's freshness, the API key, `gh`, `claude` and
`git`, the notification target, and that every configured repository is
actually checked out.

## What is mounted

```sh
amy plugin list              # what this install mounts, and what it assembled into
amy plugin add <spec>        # a package name, or a path
amy plugin remove <spec>
```

A spec is anything Node can import. With no `pluginList` in the config the
built-in set is used, so a fresh install works without listing anything.

Everything is refused at boot, by name: a plugin that will not import, a
setting that is not one it declared, two plugins claiming the same port, and
an action the workflow emits that nothing can run.

```
$ amy plugin remove @amykit/plugin-claude
$ amy discover
amy could not start:
  action `triage`: needs the `agent` port, which nothing mounted
  action `implement`: needs the `agent` port, which nothing mounted
  action `address-threads`: needs the `agent` port, which nothing mounted
```

That is the price of an open action name, and it is paid here rather than
halfway through somebody's ticket.

`amy plugin add` and `remove` rewrite only the plugin list, leaving every
other line of the config as it was, because the comments explaining what each
setting is for are most of that file's value.

## Running it

```sh
amy discover     # put tickets in the working status onto the queue
amy tick         # exactly one move, for watching or debugging
amy run          # keep advancing until nothing is due
amy status       # where every ticket stands, and what is waiting on you
amy stop         # pull the handbrake, and end work in flight
amy start        # release it
```

Prefer `amy tick` over `amy run` until a whole ticket has been through end to
end.

## The two kinds of stop

`amy stop` is the handbrake **you** pull, and it stays pulled until `amy
start`. Parking for a spent budget is automatic and temporary. Keeping them
separate matters: one is a decision and the other is a condition.
