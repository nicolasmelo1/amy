// The defect, and beside it the move that keeps a commit nobody pushed.
await git("checkout", "-B", branch, `origin/${base}`);
await git("checkout", branch) && git("merge", "--ff-only", `origin/${branch}`);
