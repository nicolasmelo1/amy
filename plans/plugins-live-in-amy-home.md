# Plugins live where amy can see them

`amy init --install` runs `npm install --global`
(`packages/cli/src/install.ts:35`). `scripts/install.sh` installs amy into
`~/.local/lib/amy` and symlinks the command onto `PATH`. A plugin installed by
the first is in `$(npm prefix -g)/lib/node_modules`; the loader looks for it by
walking `node_modules` up from its own file (`loader.ts:66`), and that walk
never reaches the global prefix.

The CLI already knows. `supply()` ends with *"npm succeeded, but these still
do not resolve … Check `npm prefix -g` against where amy is installed"*
(`index.ts:263`). That is a design describing its own bug in a warning, and
the warning is the best case: the machine that hits the bad case gets a boot
refusal naming a plugin it just watched npm install successfully.

There is a third party to this that should not be one. A global prefix is
shared with everything else on the machine, so `amy add` would be reaching
outside its own state directory to change something nobody scoped to amy —
and `npm install -g` needing a different permission than writing to `~/.amy`
is the smallest sign that the boundary is wrong.

## What changes

`~/.amy/plugins` becomes a real npm root: its own `package.json`, its own
`node_modules`, written by `npm install --prefix`. `paths()` gains it, so
`AMY_HOME` moves it with everything else and a test gets its own.

The loader stops relying on where its own file happens to sit. It resolves
through that root explicitly — `createRequire(<root>/package.json).resolve(spec)`
and then `import(pathToFileURL(...))` — which is the same resolution Node
would do from inside the root, made explicit instead of inherited. A path spec
resolves as itself, unchanged.

`installedPlugins()` reads that one directory rather than walking twelve levels
of parent looking for names that pattern-match a plugin. It becomes an answer
instead of a heuristic, and the refusal that lists *"what was installed
instead"* stops depending on how amy was installed.

`scripts/install.sh` keeps installing the command, and stops being the only
way to add a plugin to an install.

## The gate

`installed-plugins`, extended. Its activation already covers `loader.ts`,
`profiles.ts`, `paths.ts` and `scripts/install.sh`, so this change expires its
evidence on its own — which is correct, because the last run proved a machine
whose resolution worked differently.

Its scenario grows one step: after installing the command with nothing else,
install the third-party workflow into `~/.amy/plugins` through amy rather than
by running npm inside the install directory, and drive the same lifecycle.
Add to `required_assertions`:

- `plugins.resolve_from_amys_own_root`
- `plugins.a_global_install_is_not_needed`
- `plugins.the_listing_is_read_from_one_directory`

## Acceptance criteria

- [ ] A plugin installed into `~/.amy/plugins` mounts, with nothing installed
      globally (proof: assertion:plugins.resolve_from_amys_own_root)
- [ ] The scenario installs no package globally and touches no global prefix
      (proof: assertion:plugins.a_global_install_is_not_needed)
- [ ] `amy plugin list` reports what is in that root rather than what a
      parent walk found
      (proof: assertion:plugins.the_listing_is_read_from_one_directory)
- [ ] `AMY_HOME` moves the plugin root with the rest of the state
      (proof: test:packages/cli/tests/paths.test.ts)
- [ ] A spec that is a path still resolves as a path
      (proof: test:packages/cli/tests/loader.test.ts)
- [ ] A plugin named and absent is still refused at boot, with the list of
      what is there (proof: assertion:plugins.a_missing_plugin_is_refused_at_boot)

**Exit condition:** a machine installs amy, adds one plugin, and runs work
with `npm prefix -g` pointing at a directory that contains nothing of amy's.
