if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.166.4\n");
  process.exit(0);
}
process.stderr.write("ticket-to-qa's Codex stand-in only answers --version\n");
process.exit(1);