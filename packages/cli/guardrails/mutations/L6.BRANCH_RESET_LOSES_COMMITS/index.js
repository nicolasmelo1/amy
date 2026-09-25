// The defect, and beside it the move that proves the tip first.
await git("checkout", "-B", branch, `origin/${base}`);
await git("merge-base", "--is-ancestor", branch, `origin/${branch}`) && git("checkout", "-B", branch, `origin/${branch}`);
