// The defect, and beside it the move that keeps a commit nobody pushed.
declare function git(...args: string[]): Promise<boolean>;
declare const branch: string;
declare const base: string;

await git("checkout", "-B", branch, `origin/${base}`);
await git("checkout", branch) && git("merge", "--ff-only", `origin/${branch}`);

export {};
