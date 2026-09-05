---
"@amykit/cli": minor
---

Installing is `npm install -g @amykit/cli`, and `amy init` supplies the rest.

Installing meant cloning the repository and running a shell script. That asks
somebody to fetch a whole checkout to use a released product, and the script
is POSIX, so Windows was not supported at all — for a tool whose entire job is
to run unattended on whichever machine you leave it on.

Now it is npm, which is the same three words on macOS, Linux and Windows, and
npm's own shim puts `amy` on the PATH.

The command still carries nothing but itself. A plugin resolves by name at run
time, and a machine with no `codex` on it has no reason to hold the plugin
that shells out to one — so what gets installed is what your config actually
names, and `amy init` is what works that out:

```
These are not installed yet:
  @amykit/plugin-linear
  @amykit/plugin-github

Install them now? [Y/n]
```

It asks rather than assuming, because installing into a global prefix is a
change to the machine and not to amy. With nothing to ask on — a script, a
pipe, CI — it prints the command instead of running it, and `--install` is how
a pipeline says yes. `--no-install` keeps the old printing behaviour.

What it offers is what the profile **will mount**, not what is recommended for
it. That distinction is the bug this fixes as much as the ergonomics: a config
naming `@acme/plugin-jira` is exactly the case worth installing, and a
recommendation cannot know about a package this repository never shipped.

Two failures it reports rather than leaves you to meet later: npm exiting
non-zero, and npm exiting zero while the packages still do not resolve —
usually a global prefix that is not the one amy is installed under, which
would otherwise surface as a mount refusing by name on the first tick.

`npm run install:local` stays, and is now what it always really was: how the
gates prove an install works with no registry in the picture at all.
