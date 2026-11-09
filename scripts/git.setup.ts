// A test that makes a repository of its own must not reach the one it runs in.
//
// Git hands a hook GIT_DIR, GIT_INDEX_FILE and the rest. In a `git worktree`
// they are absolute, so a test's `git init`, `commit`, `tag` or `config` in a
// temporary directory lands in the real repository: one commit from a
// worktree once left `core.bare=true`, `@acme/*` tags and a `work` branch.

// Forgotten once, before any test, so every child process inherits nothing.
for (const name of Object.keys(process.env)) {
  if (name.startsWith("GIT_")) delete process.env[name];
}
