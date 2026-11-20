import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const policy = parse(fs.readFileSync(path.join(process.cwd(), ".software-factory/policy.yaml"), "utf-8")) as {
  gates: Record<string, { required_assertions?: string[] }>;
};

describe("the every-claim-and-path-agrees gate", () => {
  it("requires every claim its exit names, the Windows stop marker included", () => {
    const required = policy.gates["every-claim-and-path-agrees"]?.required_assertions ?? [];

    expect(required).toContain("agree.a_stale_update_claim_is_recovered_once");
    expect(required).toContain("agree.amy_stop_writes_where_the_launcher_reads");
  });
});
