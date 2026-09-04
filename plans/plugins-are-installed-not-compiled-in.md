# Plugins are installed, not compiled in

A plugin that wraps a CLI which is not on the machine has no reason to be on
the machine. `@amy/plugin-claude` shells out to `claude`; on a box without it
the plugin is dead weight that still has to be mounted, configured around and
reasoned about.

Today it travels anyway, because there is exactly one artifact and everything
is inside it.

## What goes, and what comes back

`bun build --compile` goes, and the single executable with it. What ships is
built JavaScript, run by node, installed from a registry.

The `BUILT_INS` table in `packages/cli/src/loader.ts` goes with it. That table
exists for one reason, stated in its own comment: a bundler follows a
specifier it can read and cannot follow a variable. With no bundler in the
path, `import(spec)` is correct again — and the loader already has that path,
for third-party plugins, under a comment saying the table *"is what ships in
the box, not a list of what is allowed"*. The box stops existing and the
second half of that sentence becomes the whole design.

`DEFAULT_PLUGINS` stops meaning "what is in the binary" and starts meaning
"what `amy init` suggests installing". A recommendation, not an inventory.

## The risk does not go away, it moves

The bug this table was built to prevent — every test green, a binary with no
plugins in it — cannot happen without a bundler. The failure it becomes is a
config naming a plugin nobody installed, and that one is not hypothetical
either: it is what every machine will hit the first time somebody copies a
config from a box that had more installed than this one does.

So the boot refusal becomes the load-bearing part, where the table used to
be. Named and missing has to be refused **before** a ticket is touched, and
the refusal has to name the plugin and what was there instead. That is the
same shape the relay already holds itself to for a mistyped agent ladder
(`relay.refuses_an_unknown_agent_at_boot`), and there is no reason for a
plugin to be held to less.

## What phase 6 was actually about, and why it survives

`plans/what-runs-is-not-this-repo.md` named two problems. The compiled binary
was the answer it chose, not the problem it solved, and both problems outlive
the answer.

**The code under test is never the code that ships.** Compiling was one way to
force the question. Installing from a registry is another, and it is the one
that matches how this now works: the proof becomes a machine that installs the
published packages and runs a ticket, rather than a machine that runs a file
somebody compiled.

**The working directory must not be a repository.** Unchanged and still true.
A global install into a directory on `PATH` satisfies it exactly as the binary
did.

What does not survive is the gate's wording. `installed.plugins_are_inside_
the_binary` and `installed.every_plugin_resolves` assert the opposite of this
design, so the `installed-binary` gate in `.software-factory/policy.yaml` is
rewritten rather than dropped — the claim it protects is still worth
protecting, and it is only the mechanism underneath it that changed.

## Acceptance criteria

- [ ] A machine installs `@amy/cli` and a subset of plugins and runs a ticket
      with the rest never present
      (proof: deferred:nothing is installable separately yet)
- [ ] A machine with no `claude` installed and no `@amy/plugin-claude`
      installed boots and works
      (proof: deferred:nothing is installable separately yet)
- [ ] A config naming a plugin nobody installed is refused at boot, before a
      ticket is touched
      (proof: deferred:the refusal is not the load-bearing path yet)
- [ ] That refusal names the plugin and what was installed instead
      (proof: deferred:the refusal is not the load-bearing path yet)
- [ ] `amy plugin list` distinguishes installed from mounted, so a missing
      plugin is visible before it is needed
      (proof: deferred:the list still reports what is compiled in)
- [ ] Plugins resolve by name from disk at run time, with no literal-import
      table anywhere
      (proof: deferred:`BUILT_INS` still exists)
- [ ] The `installed-binary` gate asserts installation rather than
      compilation, and still fails when the claim breaks
      (proof: deferred:the gate asserts the opposite today)
- [ ] amy runs from a directory that is no repository and writes nothing into
      one (proof: assertion:installed.does_not_write_into_the_source_tree)

**Exit condition:** a second machine with node, `@amy/cli` and only the
plugins it needs runs a ticket end to end, a plugin it never installed is
refused by name at boot rather than at first use, and no machine carries code
for a tool it does not have.
