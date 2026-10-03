// An agent that decides on its own when the work reaches the remote.
export async function implement(git: { commitAndPush(): Promise<boolean> }, run: (args: string[]) => Promise<void>) {
  await git.commitAndPush();
  await run(["push", "origin", "HEAD"]);
}
