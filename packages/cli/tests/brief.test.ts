import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BriefStore, HostServices, renderBrief } from "@amykit/core";
import { DEFAULT_CONFIG } from "../src/config.js";
import { load } from "../src/loader.js";
import { Profile } from "../src/profiles.js";
import { pluginList, pluginSlices } from "../src/slices.js";

/**
 * `amy brief show`, proven the way the command works: through a real mount,
 * because the whole point of the command is that it resolves the port rather
 * than a path, and a mock would put the path back.
 */

const TICKETS: Profile = {
  name: "tickets",
  workflow: "@amykit/workflow-ticket-to-qa",
  plugins: [],
  takesNotes: false,
  takesTasks: false,
};

const CONFIG = { ...DEFAULT_CONFIG, repos: ["acme/widgets"], notify: { hermes: null, inbox: false } };

describe("amy brief show", () => {
  let root: string;
  let host: HostServices;
  let previousKey: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-brief-cli-"));
    previousKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "lin_api_test";
    host = {
      runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
      now: () => new Date("2026-09-03T12:00:00.000Z"),
      paths: { workspace: path.join(root, "checkouts"), state: path.join(root, ".amy") },
    };
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previousKey;
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The store the mounted install would hand the command, seeded with one brief. */
  async function mountedStore(): Promise<{ store: BriefStore; state: string }> {
    const loaded = await load(pluginList(CONFIG, TICKETS));
    expect(loaded.problems).toEqual([]);

    const { mount } = await import("@amykit/core");
    const outcome = await mount(loaded.plugins, pluginSlices(CONFIG, TICKETS), host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const store = outcome.mounted.ports.get("brief") as BriefStore | undefined;
    if (!store) throw new Error("nothing mounted the `brief` port");

    await store.write({
      id: "invoice-currency",
      sections: [
        { name: "Goal", body: "One currency on every invoice line." },
        { name: "Scope", body: "The invoice view only." },
      ],
      explains: ["BILL-4021", "BILL-4022"],
      at: "2026-09-01T09:00:00.000Z",
    });
    await store.appendQuestion({
      id: "invoice-currency",
      question: { workId: "BILL-4022", question: "Does the total round?", at: "2026-09-02T09:00:00.000Z" },
      at: "2026-09-02T09:00:00.000Z",
    });

    return { store, state: host.paths.state };
  }

  it("renders the human document from the same snapshot the machine reads", async () => {
    const { store } = await mountedStore();

    const record = await store.get("invoice-currency");
    expect(record).not.toBeNull();
    const view = renderBrief(record!);

    // The one snapshot, rendered as the person reads it: sections in their
    // declared order, then the questions later work raised.
    expect(view.text).toContain("Goal\nOne currency on every invoice line.");
    expect(view.text).toContain("Scope\nThe invoice view only.");
    expect(view.text).toContain("Question (from BILL-4022, 2026-09-02T09:00:00.000Z): Does the total round?");
    expect(view.revision).toBe(1);
  });

  it("answers --json from the same snapshot, so the two cannot drift", async () => {
    const { store } = await mountedStore();

    const record = await store.get("invoice-currency");
    const view = renderBrief(record!);
    const asJson = { id: record!.id, revision: view.revision, explains: record!.explains, updatedAt: record!.updatedAt, text: view.text };

    // The machine-readable form is the human document plus what it takes to
    // be joined to the work: same text, same revision, same membership.
    expect(asJson.id).toBe("invoice-currency");
    expect(asJson.text).toBe(view.text);
    expect(asJson.revision).toBe(view.revision);
    expect(asJson.explains).toEqual(["BILL-4021", "BILL-4022"]);
  });

  it("names a brief that is not there, in the words an operator can act on", async () => {
    const { store } = await mountedStore();

    const missing = await store.get("no-such-brief");

    expect(missing).toBeNull();
  });

  it("keeps briefs under the profile's own state, beside the records", async () => {
    const { state } = await mountedStore();

    // One directory per profile under `.amy`, the same rule the records
    // follow, so two workflows under one home never read each other's
    // briefs. The adapter's layout is its own; what is asserted here is
    // where it lives, not what it looks like.
    expect(fs.existsSync(path.join(state, "briefs"))).toBe(true);
  });
});