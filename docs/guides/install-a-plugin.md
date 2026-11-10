---
title: Install a plugin
description: Add a package with amy add, by its npm name or by the path of a fork you hold, configure it, and take it out again.
group: Guides
order: 2
---

# Install a plugin

A [plugin](../concepts/glossary.md#plugin) is an npm package. You install it with
one command, give it its settings in `~/.amy/config.yaml`, and check the machine
with `amy doctor`.

## By name

```sh
amy add @amykit/plugin-telegram
```

The argument is a spec: a package name, a name with a version range
(`@acme/plugin-pager@^1.2.0`), a git URL, a tarball URL, or a directory on this
disk. Why one argument takes all of them:
[a spec is a name, a URL or a path](../design/a-spec-is-a-name-a-url-or-a-path.md).

## By a fork's path

When you have cloned a plugin and changed it, point `amy add` at the directory:

```sh
amy add ../plugin-pager
```

amy reads the directory's `package.json` before running anything, and refuses a
directory that has none. It installs a copy of the directory under the name that
manifest declares, and the config names that package name, not the path. amy
imports the copy through its `exports`, so build the fork first.

`amy add <name> --fork` goes the other way: it takes the published package's
source into a fork the current [profile](../concepts/glossary.md#profile) owns,
builds it, and mounts it under the same name for that profile alone. `--to <dir>`
says where the fork goes. Setting `add: fork` in the config makes forking what
`amy add` does with no flag, and `--package` asks for the published package again.

## What amy add does

In order, so a step that fails can be undone:

1. **Is it already named?** A package already in `extraPlugins:`, or already the
   [workflow](../concepts/glossary.md#workflow) of a profile, is reported as already mounted, and nothing runs.
2. **Install.** The package goes into `~/.amy/plugins`, an npm root amy owns, with
   `npm install --prefix`. Nothing is installed globally. Why:
   [plugins live where amy can see them](../design/plugins-live-in-amy-home.md).
3. **Import.** The package must export `plugin`. One that does not, or that fails
   to import, is uninstalled again.
4. **Probe.** amy calls the plugin's `register` once against a throwaway registry,
   with stand-in settings, to learn whether it registers a
   workflow. One whose `register` throws is
   uninstalled again.
5. **Write.** A plugin is appended to `extraPlugins:`, the list every profile
   mounts on top of its own. A workflow becomes a profile under `workflows:`,
   named after the package, and amy installs the plugins it recommends.
6. **Boot.** amy mounts the machine the new config describes. If it does not come
   up, amy prints why and keeps the entry: fix the settings, or run `amy remove`.
7. **Files and setup.** Each profile that mounts the package gets the files the
   plugin brings, written once and never over a file you edited, and its setup
   steps run.

It ends with `the machine boots: run amy doctor, then amy tick`. Why it works this
way: [amy add and amy remove](../design/amy-add-and-amy-remove.md).

## Configure it

A plugin's settings live under `plugins:` in `~/.amy/config.yaml`, keyed by package
name:

```yaml
plugins:
  "@amykit/plugin-telegram":
    operator: "123456789"
```

The plugin declares what its slice looks like, and the boot refuses a missing
required setting, a wrong type, or a key the plugin does not declare, naming the
plugin and the setting. To see what a plugin takes:

```sh
amy config explain @amykit/plugin-telegram
```

`amy setup @amykit/plugin-telegram` asks for each setting and writes the slice for
you. Every plugin's settings are also listed in
[Reference: plugins](../reference/plugins.md).

Credentials do not go in the config. A plugin names the environment variables it
reads, and you put them in `~/.amy/.env`.

## Check it

```sh
amy doctor
```

The doctor asks for each environment variable a mounted plugin reads, runs the
checks each plugin brings under its own name, and then mounts the machine. A
variable is only asked for when a plugin that reads it is mounted.
`amy plugin list` shows what this profile mounts and whether each one loaded.

## Remove it

```sh
amy remove @amykit/plugin-telegram
```

`amy remove` takes the package name the config carries. Before it changes
anything, it mounts the machine the config would become without the package. If
a workflow would lose a [port](../concepts/glossary.md#port) it needs, it
refuses and names the [action](../concepts/glossary.md#action) that would have
nothing to run it. Otherwise it drops the entry and uninstalls the package from
`~/.amy/plugins`, unless another profile still mounts it. A plugin owns no
[records](../concepts/glossary.md#record), so the profile's records, queue and
log stay as they were.

Given a profile name, `amy remove` takes the profile and its workflow away, and
the profile's records and queue with them. It lists those directories and asks
before deleting them; `--yes` deletes without asking, and `--keep-state` keeps
them for a later `amy add` to pick up. The log is never deleted.

For a fork, `amy remove <name>` points the profile back at the published package
and leaves the fork's directory where it is.
