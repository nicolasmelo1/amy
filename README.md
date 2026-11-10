<div align="center">

<img alt="amy" src="assets/logo.png" width="128">

<h1>amy</h1>

<p><em><strong>A</strong>utomate <strong>MY</strong> work</em></p>

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/nicolasmelo1/amy?style=flat-square&color=E424CC&labelColor=1B0A19"></a>
  <a href="https://github.com/nicolasmelo1/amy/actions/workflows/software-factory.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/nicolasmelo1/amy/software-factory.yml?branch=main&style=flat-square&label=ci&color=E424CC&labelColor=1B0A19"></a>
<!-- amy:generated readme-node-badge -->

<img alt="Node 22.18+" src="https://img.shields.io/badge/node-22.18+-E424CC?style=flat-square&labelColor=1B0A19">

<!-- amy:end readme-node-badge -->
  <img alt="Status: pre-release" src="https://img.shields.io/badge/status-pre--release-9DA0AE?style=flat-square&labelColor=1B0A19">
</p>

</div>

amy is an opinionated state machine framework where everything is a plugin. You
draw your process as a workflow as a Mermaid diagram, so it's easy for us, humans, and machine to understand. We then connect the logic through code, and pick the plugins it depends on (the tracker, the
code host, the chat, the agent), configure it your way and start it. It is left
running from then on, moving each piece of work one step at a time, on the
Claude Code, Codex and Hermes subscriptions you already pay for (more coming soon, or [you can also create a plugin for it yourself](docs/guides/write-a-plugin.md)).

## Install

```sh
npm install -g @amykit/cli
amy setup
```

`amy setup` asks which harness, workflow and channels you want, installs only
those ([setup is a workflow](docs/design/setup-is-a-workflow.md) itself, so amy runs on amy itself), and
checks them. `amy start` then runs the loop in the background.
More in [Installation](docs/start/installation.md) and the [Quickstart](docs/start/quickstart.md).

## For agents

If you are an agent setting amy up or driving it, read amy's skills first:
[packages/cli/skills/](packages/cli/skills/). `amy skills` installs them into the harnesses on this machine.

## Documentation

- **Start here:** [Overview](docs/start/overview.md), [Quickstart](docs/start/quickstart.md), [Configuration](docs/start/configuration.md)
- **Guides:** [Project, workflow or plugin](docs/guides/project-workflow-plugin.md), [Install a plugin](docs/guides/install-a-plugin.md), [Compose workflows](docs/guides/compose-workflows.md), [Write a workflow](docs/guides/write-a-workflow.md), [Write a plugin](docs/guides/write-a-plugin.md), [What a project is](docs/guides/what-a-project-is.md), [The chat](docs/guides/the-chat.md)
- **How it works:** [Workflows](docs/concepts/workflows.md), [Plugins](docs/concepts/plugins.md), [The engine](docs/concepts/the-engine.md), [Ports](docs/concepts/ports.md)
- **Build your own:** [Testing](docs/build/testing.md), [Prove a phase](docs/build/prove-a-phase.md), [Publishing](docs/build/publishing.md)
- **Reference:** [CLI](docs/reference/cli.md), [Configuration](docs/reference/configuration.md), [Plugins](docs/reference/plugins.md), [Workflows](docs/reference/workflows.md)
- **Packages:** [What is in the box](docs/catalog/index.md), and the runnable [examples](examples/README.md)
- **News:** [What shipped](docs/changelog/index.md)
- **Design notes:** why each decision was made, for instance [nothing is installed by default](docs/design/nothing-is-installed-by-default.md)
- **Development:** [Contributing](docs/development/contributing.md), [The gate](docs/development/the-gate.md)

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) is the short path from a clone to a green gate.

## License

MIT, see [LICENSE](LICENSE).
