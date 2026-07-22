import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("GitHub helper enforces Epic base/head, waits checks, and writes merged evidence", { skip: process.platform !== "win32" }, async () => {
  const target = await fs.mkdtemp(path.join(os.tmpdir(), "geki-github-"));
  const fakeBin = path.join(target, "fake-bin");
  await fs.mkdir(fakeBin, { recursive: true });
  const fakeGh = `const args = process.argv.slice(2);
if (args[0] === "pr" && args[1] === "create") console.log("https://github.example/pr/1");
if (args[0] === "pr" && args[1] === "view") console.log(JSON.stringify({number:1,url:"https://github.example/pr/1",state:"MERGED",baseRefName:"coding",headRefName:"epic/1",headRefOid:"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",mergeStateStatus:"CLEAN",autoMergeRequest:{enabledAt:"now"},statusCheckRollup:[]}));
if (args[0] === "pr" && args[1] === "checks" && args.includes("--json")) console.log(JSON.stringify([{name:"CI",state:"SUCCESS",bucket:"pass",link:"https://github.example/check/1",workflow:"CI"}]));
`;
  const fakeScript = path.join(fakeBin, "gh.mjs");
  await fs.writeFile(fakeScript, fakeGh);
  const env = { ...process.env, GEKI_GH_BIN: process.execPath, GEKI_GH_SCRIPT: fakeScript };
  let result = spawnSync(process.execPath, [path.join(root, "runtime", "github.mjs"), "epic-pr", "--head", "epic/1", "--title", "Epic 1"], { cwd: target, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"base": "coding"/);
  result = spawnSync(process.execPath, [path.join(root, "runtime", "github.mjs"), "verify-epic", "--epic", "1", "--pr", "1", "--head-sha", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], { cwd: target, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(await fs.readFile(path.join(target, ".geki", "evidence", "github", "pr-1.json"), "utf8"));
  assert.equal(evidence.state, "MERGED");
  assert.equal(evidence.baseRefName, "coding");
  assert.equal(evidence.epicId, "1");
});
