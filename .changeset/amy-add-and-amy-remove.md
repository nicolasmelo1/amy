---
"@amykit/cli": minor
---

New `amy add` and `amy remove` commands: one argument — a package name, a URL, a git URL or a path — installs the package into `~/.amy/plugins`, mounts it alone to decide whether it is a workflow or a plugin, writes the config entry (a profile for a workflow, the machine-wide `extraPlugins:` list for a plugin), and refuses what the machine would not survive instead of leaving a half-added entry behind. Plugins added this way join a profile without freezing its recommended set into the config.