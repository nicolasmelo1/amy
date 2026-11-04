import fc from "fast-check";

// A property is a proof a plan cites, so it runs the same cases on every
// machine and every CI run: a fixed seed, never one drawn from the clock. A
// falsifier it rejects here it rejects everywhere, and one it misses is missed
// everywhere, which is what widening the generator answers.
fc.configureGlobal({ seed: 20261104, numRuns: 200 });
