// A harness plugin nobody listed anywhere, deciding when the work is pushed.
export async function answer(git: { commitAndPush(): Promise<boolean> }): Promise<void> {
  await git.commitAndPush();
}
