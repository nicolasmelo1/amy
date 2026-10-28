---
"@amykit/cli": patch
---

`amy update` reaches the release. It said `nothing to move` with 0.6.0 published to a machine on 0.5.0, for two reasons ([#110](https://github.com/nicolasmelo1/amy/issues/110)):

- **A 0.x caret never crossed a minor.** Every `@amykit/*` package now moves to one release, asked once of the CLI's registry intent (`latest` unless the operator wrote another), whatever caret npm saved, and each manifest entry then names it as `^<release>`. Third-party packages still move only within the range the operator wrote, so a 0.x workflow at `^0.1.0` stays on 0.1.0. To hold the machine below a release, set `amyUpdateRanges["@amykit/cli"]` in `~/.amy/plugins/package.json`; `--check` names that pin and the release it holds you below, where it used to say `nothing to move`.
- **A CLI installed with `npm install -g` read as a checkout.** The global prefix is now an install root, on Unix and on Windows. The CLI moves there with `npm install --global`, and when a plugin in the release refuses to import, every move rolls back, the CLI included.

The `amy-update` gate stubbed out both of these with a stand-in npm that answered whatever it held. It now runs real npm against a registry on a loopback port, with the CLI installed globally.
