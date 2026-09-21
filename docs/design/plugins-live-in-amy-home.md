# Plugins live where amy can see them

The command installs itself under one prefix and amy's state lives under
`~/.amy`. Installing a plugin with `npm install --global` put it in whichever
prefix npm happened to use, while the loader found packages by walking parents
of its own file. Those places only coincide by accident: an installed command
and a global prefix can be unrelated, and a successful npm run followed by a
boot refusal was the ordinary outcome.

The old design also reached outside amy. A global prefix is shared with every
other Node tool on the machine, and changing it is neither necessary for nor
owned by a workflow an operator configured under `~/.amy`.

## What shipped

`~/.amy/plugins` is now an npm root. Before the first install amy writes its
small private `package.json`; `npm install --prefix <root>` writes its own
`node_modules` below it. The root travels with `AMY_HOME`, exactly as the
config, records and queues do.

Every mounting command builds one resolver from that root. A local workflow
continues to win by directory name and a path URL stays a path URL. A package
name is resolved through `createRequire(<root>/package.json).resolve(spec)`
and the file Node names is imported as a file URL. Packages that intentionally
export only an ESM `import` condition are the one CJS resolver cannot name; for
those, amy reads the package entry from the same root using the existing ESM
entry walk. Neither route examines the command's parent directories.

`installedPlugins()` reads one `node_modules` directory. A missing-plugin
refusal and `amy plugin list` therefore describe what the configured root
actually contains rather than whatever packages happen to be reachable from
where amy itself was installed.

`amy init --install` installs the packages the config names into that root.
The command prints the equivalent `npm install --prefix` invocation when it
cannot ask, and does not invoke the global npm prefix.

## The proof

The existing `installed-plugins` scenario installs only the command, writes a
config for a workflow outside this repository, and lets `amy init --install`
put every named package into its own root. Its npm stand-in delegates a real
install from the scenario's local artifacts so it can assert both the exact
`--prefix` argv and Node loading files from the resulting root; it has no
registry or global-prefix dependency. A fake package beside the command proves
the listing does not retain the old parent walk.

## Acceptance criteria

- [x] A plugin installed into `~/.amy/plugins` mounts, with nothing installed
      globally (proof: assertion:plugins.resolve_from_amys_own_root)
- [x] The scenario installs no package globally and touches no global prefix
      (proof: assertion:plugins.a_global_install_is_not_needed)
- [x] `amy plugin list` reports what is in that root rather than what a parent
      walk found
      (proof: assertion:plugins.the_listing_is_read_from_one_directory)
- [x] `AMY_HOME` moves the plugin root with the rest of the state
      (proof: test:packages/cli/tests/paths.test.ts)
- [x] A spec that is a path still resolves as a path
      (proof: test:packages/cli/tests/loader.test.ts)
- [x] A plugin named and absent is still refused at boot, with the list of
      what is there (proof: assertion:plugins.a_missing_plugin_is_refused_at_boot)

**Exit condition:** a machine installs amy, adds one plugin, and runs work
with `npm prefix -g` pointing at a directory that contains nothing of amy's.
