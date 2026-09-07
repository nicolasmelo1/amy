# Nothing is installed by default

`plugins-are-installed-not-compiled-in.md` ended with two names still in the
host: `@amykit/cli` depends on `@amykit/workflow-ticket-to-qa`, because the
roster is that workflow's vocabulary living in the host, and on
`@amykit/plugin-notify-hermes`, because `amy doctor` imports a function to
check a delivery target. There are seven more beside them in
`packages/cli/package.json`.

So installing the command installs a workflow, four plugins and a notifier,
and then `amy init` offers to install about fifteen more — because
`SHIPPED_PROFILES` gives three profiles to any config that declares none
(`profiles.ts:41`), `EXAMPLE_CONFIG` writes two of them into the file, and
`init` walks all of them working out what is absent (`index.ts:216`).

Every one of those is a real workflow that somebody real might want. None of
them is the one the person installing amy is about to write, and a machine
that arrives pre-loaded with three processes teaches that amy is a thing with
processes in it rather than a thing you put yours into.

## What changes

`@amykit/cli` depends on the command and nothing else. The two names the
previous plan left behind are the reason this is not just a `package.json`
edit: the roster moves to the workflow whose vocabulary it is, and `doctor`
asks the mounted notification port whether its target is reachable instead of
importing one notifier's reader. Both are the same fix — a host holding a
plugin's knowledge — and neither is large.

`SHIPPED_PROFILES` becomes empty. A config with no `workflows:` block drives
nothing, which `resolveProfile` already says in the right words:
*"no workflow is configured, so there is nothing to drive"* (`profiles.ts:139`)
— it gains one sentence naming `amy workflow new` and `amy add`.

`EXAMPLE_CONFIG` stops declaring two workflows it cannot promise are
installed. It keeps them as commented examples, which is what they were
always doing for the reader.

`amy init` writes the config, the roster and the notes directory, and installs
nothing. `--install` keeps working for a config that already names things,
which is the machine being rebuilt rather than the machine being set up.

`/amy-init` does the asking, and asks in the right order: what process do you
want amy to drive, and would you like to write it — then an existing one, if
the answer is that somebody already has.

## The gate

New: `a-bare-install`, scenario in
`.software-factory/evidence/bare-install-scenario.sh`, joined to
`npm run e2e`. Activation on `packages/cli/package.json`,
`packages/cli/src/profiles.ts`, `packages/cli/src/config.ts`,
`packages/cli/src/doctor.ts`.

`L2.DEPENDENCIES_CHANGE_DELIBERATELY` already refuses a manifest that moves
without an explicit lock update, so the dependency half of this cannot land
quietly.

## Acceptance criteria

- [ ] Installing `@amykit/cli` installs no workflow and no plugin
      (proof: assertion:bare.the_command_arrives_alone)
- [ ] `amy init` on that machine writes its files and installs nothing
      (proof: assertion:bare.init_installs_nothing)
- [ ] With no workflow configured, every command says so and names what to
      run next (proof: assertion:bare.it_says_what_to_do_instead_of_failing)
- [ ] `amy doctor` reports a reachable notification target without importing
      a notifier (proof: assertion:bare.doctor_asks_the_port_not_the_package)
- [ ] The roster is the workflow's, and an install without that workflow needs
      no roster (proof: test:packages/cli/tests/roster.test.ts)
- [ ] `amy init --install` still supplies a config that names things
      (proof: test:packages/cli/tests/init.test.ts)
- [ ] The config template still names every setting there is
      (proof: test:packages/cli/tests/config-template.test.ts)

**Exit condition:** a fresh machine installs one package, and the only
workflow on it afterwards is one the person there chose or wrote.
