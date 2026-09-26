// The official contracts the scripted doubles are held to, vendored.
//
//   node scripts/contracts.mjs --check    red unless every vendored contract
//                                         is the one its publisher serves today
//   node scripts/contracts.mjs --update   download them again and rewrite the
//                                         manifest
//
// A double that answers what the real tool would refuse is how
// `reviewsRequestedOf` shipped broken; a double held to a stale contract is
// the same defect a release later. So the check runs in the gate, and a
// contract that moved turns it red until somebody updates and the suite runs
// against the new one.
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const repo = path.resolve(import.meta.dirname, "..");
const directory = path.join(repo, "packages/test-fixtures/contracts");
const manifestPath = path.join(directory, "manifest.json");

/** Downloaded as published; `gzip` is how a large one is kept in the repository. */
const DOCUMENTS = [
  {
    name: "github-graphql",
    file: "github.graphql",
    url: "https://docs.github.com/public/fpt/schema.docs.graphql",
    publisher: "GitHub — the public GraphQL schema for github.com",
  },
  {
    name: "github-rest",
    file: "github-rest.json.gz",
    gzip: true,
    url: "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json",
    publisher: "GitHub — the OpenAPI description of the github.com REST API",
  },
  {
    name: "linear-graphql",
    file: "linear.graphql",
    url: "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql",
    publisher: "Linear — the GraphQL schema its own SDK is generated from",
  },
];

/**
 * The `gh` CLI publishes no machine-readable contract, so its contract is
 * what the binary itself prints at one release: `gh reference` for every
 * command and flag, and `gh pr list --json` for the fields that flag takes.
 * Fresh means that release is the latest one.
 */
const GH_RELEASES = "https://api.github.com/repos/cli/cli/releases/latest";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function download(url) {
  const response = await fetch(url, { headers: { "user-agent": "amy-contracts" } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function latestGh() {
  const response = await fetch(GH_RELEASES, {
    headers: {
      "user-agent": "amy-contracts",
      accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`${GH_RELEASES} answered ${response.status}`);
  const release = await response.json();
  return String(release.tag_name).replace(/^v/, "");
}

function ghOutput(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    // `gh pr list --json` with no fields lists them on stderr and exits 1.
    if (typeof error.stderr === "string" && error.stderr.length > 0) return error.stderr;
    throw error;
  }
}

function prJsonFields() {
  return ghOutput(["pr", "list", "--json"])
    .split("\n")
    .filter((line) => line.startsWith("  "))
    .map((line) => line.trim())
    .filter(Boolean);
}

async function update() {
  fs.mkdirSync(directory, { recursive: true });
  const manifest = { documents: [], gh: null };

  for (const document of DOCUMENTS) {
    const body = await download(document.url);
    fs.writeFileSync(path.join(directory, document.file), document.gzip ? gzipSync(body, { level: 9 }) : body);
    manifest.documents.push({
      name: document.name,
      file: document.file,
      url: document.url,
      publisher: document.publisher,
      sha256: sha256(body),
    });
    console.log(`${document.name}: ${body.length} bytes from ${document.url}`);
  }

  const latest = await latestGh();
  const installed = /gh version (\S+)/.exec(ghOutput(["--version"]))?.[1];
  if (installed !== latest) {
    throw new Error(
      `gh ${latest} is the latest release, and this machine has gh ${installed ?? "nothing"}: ` +
        "the gh contract is what that release prints, so install it before updating",
    );
  }
  const reference = ghOutput(["reference"]);
  const fields = `${prJsonFields().join("\n")}\n`;
  fs.writeFileSync(path.join(directory, "gh-reference.md"), reference);
  fs.writeFileSync(path.join(directory, "gh-pr-json-fields.txt"), fields);
  manifest.gh = {
    version: latest,
    releases: GH_RELEASES,
    reference: { file: "gh-reference.md", sha256: sha256(reference) },
    prJsonFields: { file: "gh-pr-json-fields.txt", sha256: sha256(fields) },
  };
  console.log(`gh: ${latest}`);

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function check() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const problems = [];

  for (const entry of manifest.documents) {
    const stored = fs.readFileSync(path.join(directory, entry.file));
    const vendored = entry.file.endsWith(".gz") ? gunzipSync(stored) : stored;
    if (sha256(vendored) !== entry.sha256) {
      problems.push(`${entry.file} is not the file the manifest recorded — it was edited by hand`);
      continue;
    }
    const published = await download(entry.url);
    if (sha256(published) !== entry.sha256) {
      problems.push(`${entry.name} moved: ${entry.url} no longer serves the vendored copy`);
    }
  }

  for (const part of [manifest.gh.reference, manifest.gh.prJsonFields]) {
    if (sha256(fs.readFileSync(path.join(directory, part.file))) !== part.sha256) {
      problems.push(`${part.file} is not the file the manifest recorded — it was edited by hand`);
    }
  }
  const latest = await latestGh();
  if (latest !== manifest.gh.version) {
    problems.push(`gh moved: ${latest} is the latest release, and the vendored contract is ${manifest.gh.version}'s`);
  }

  if (problems.length > 0) {
    console.error("The doubles are held to contracts their publishers no longer serve:\n");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("\nRun `npm run contracts:update`, then `npm test` against what changed.");
    process.exit(1);
  }
  console.log("contracts: every vendored contract is the one its publisher serves today");
}

const mode = process.argv[2];
if (mode === "--update") await update();
else if (mode === "--check") await check();
else {
  console.error("usage: node scripts/contracts.mjs --check | --update");
  process.exit(2);
}
