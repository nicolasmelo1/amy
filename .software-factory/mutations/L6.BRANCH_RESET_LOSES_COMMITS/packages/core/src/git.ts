// What prepareBranch did before: it reset a branch that held an unpushed commit.
export async function prepareBranch(git: (...args: string[]) => Promise<void>, branch: string, base: string) {
  await git("checkout", "-B", branch, `origin/${base}`);
}
