// What a push that refuses nothing looks like, in each of the spellings that ask for it.
export async function push(git: (...args: string[]) => Promise<void>, branch: string) {
  await git("push", "--force", "origin", branch);
  await git("push", "--force-with-lease", "origin", branch);
  await git("push", "-f", "origin", branch);
  await git("push", "origin", `+${branch}`);
}
