import type { BaseSource, BaseSourceSnapshot, BriefStore, Feature, GroomedWork, GroomingTracker } from "@amykit/core";

export const GROOMING_WORKFLOW = "feature-grooming";

/** A proposed item and the source files that made it necessary. */
export interface ProposedWork {
  key: string;
  title: string;
  body: string;
}

/** Policy is deliberately owned by the workflow rather than parsed by core. */
export interface Groomer {
  propose(feature: Feature, sources: readonly BaseSourceSnapshot[]): Promise<readonly ProposedWork[]>;
}

export interface GroomingResult {
  featureId: string;
  created: string[];
  revised: string[];
  retired: string[];
}

/**
 * Reconciles a feature's generated work from fresh base-branch snapshots.
 *
 * The source capability is intentionally narrow. This function receives no
 * Git, branch, commit, checkout path, or worktree; the only source operation
 * it can perform is read through BaseSource.snapshot(). Provenance is kept on
 * tracker work (`groomedBy`), never overloaded onto Brief.explains.
 */
export async function groomFeature(
  feature: Feature,
  deps: { source: BaseSource; tracker: GroomingTracker; briefs: BriefStore; groomer: Groomer; now: () => Date },
): Promise<GroomingResult> {
  const snapshots = await Promise.all(feature.repos.map((repo) => deps.source.snapshot(repo)));
  const proposals = await deps.groomer.propose(feature, snapshots);
  const existing = await deps.tracker.groomedWork(feature.id, GROOMING_WORKFLOW);
  const byKey = new Map(existing.filter((work) => !work.retired).map((work) => [workKey(work), work]));
  const wanted = new Set(proposals.map((proposal) => proposal.key));
  const result: GroomingResult = { featureId: feature.id, created: [], revised: [], retired: [] };

  for (const proposal of proposals) {
    const current = byKey.get(proposal.key);
    const body = withKey(proposal);
    if (!current) {
      const created = await deps.tracker.createGroomedWork({
        featureId: feature.id,
        groomedBy: GROOMING_WORKFLOW,
        title: proposal.title,
        body,
      });
      result.created.push(created.id);
    } else if (current.title !== proposal.title || current.body !== body) {
      await deps.tracker.updateGroomedWork(current.id, { title: proposal.title, body });
      result.revised.push(current.id);
    }
  }

  for (const work of existing) {
    if (!work.retired && !wanted.has(workKey(work))) {
      await deps.tracker.retireGroomedWork(work.id);
      result.retired.push(work.id);
    }
  }

  // `write` replaces membership and increments the revision while the store
  // preserves its independent question log. Membership is only grooming-owned
  // work: a human's feature ticket is never adopted just because it shares an id.
  const current = await deps.tracker.groomedWork(feature.id, GROOMING_WORKFLOW);
  await deps.briefs.write({
    id: feature.id,
    sections: [{ name: feature.title, body: feature.body ?? "" }],
    explains: current.filter((work) => !work.retired).map((work) => work.id),
    at: deps.now().toISOString(),
  });
  return result;
}

function withKey(proposal: ProposedWork): string {
  return `<!-- amy:grooming-key=${proposal.key} -->\n${proposal.body}`;
}

function workKey(work: GroomedWork): string {
  return /<!-- amy:grooming-key=([^ ]+) -->/.exec(work.body)?.[1] ?? work.id;
}
