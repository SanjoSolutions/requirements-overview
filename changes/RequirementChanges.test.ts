import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequirementCatalog } from "../catalog/RequirementCatalog.ts";
import { RequirementChanges } from "./RequirementChanges.ts";
import { ProcessRunner } from "./ProcessRunner.ts";
import type { ProcessExecutor } from "./ProcessRunner.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "requirement-changes-")); directories.push(root);
  const directory = join(root, "apps", "example"); await mkdir(directory, { recursive: true });
  const path = join(directory, "example.test.ts");
  await writeFile(path, `import { test } from 'node:test'; import assert from 'node:assert/strict'; test('accepts one', () => { assert.equal(1, 1); });`);
  const catalog = new RequirementCatalog(root);
  const requirement = (await catalog.retrieveSnapshot()).requirements[0];
  return { root, path, catalog, request: { requirementId: requirement.id, sourceFingerprint: requirement.sourceFingerprint, description: "accepts two" } };
}

describe("Requirement change workflow", () => {
  it("hands the revised requirement to an agent and independently validates its implementation", async () => {
    const { root, path, catalog, request } = await fixture();
    const runner = new ProcessRunner();
    const run = vi.fn<ProcessExecutor["run"]>().mockImplementation(async (command, options) => {
      if (options?.input) {
        expect(options.input).toContain('Requested description: "accepts two"');
        await writeFile(path, (await readFile(path, "utf8")).replace("assert.equal(1, 1)", "assert.equal(2, 2)"));
        return { exitCode: 0, output: "Implementation updated" };
      }
      return runner.run(command, options);
    });
    const changes = new RequirementChanges(catalog, { run }, { command: "agent", arguments: [], cwd: root });
    const job = await changes.apply(request); await changes.waitForCompletion();
    expect(job.status).toBe("verified");
    expect(run).toHaveBeenCalledTimes(2);
    expect((await catalog.retrieveSnapshot(true)).requirements[0].title).toBe("accepts two");
    const restored = new RequirementChanges(catalog); await restored.initialize();
    expect(restored.retrieveJobs()[0].status).toBe("verified");
  });

  it("keeps a title-only edit pending for implementation", async () => {
    const { root, catalog, request } = await fixture();
    const changes = new RequirementChanges(catalog, { run: async () => ({ exitCode: 0, output: "Title updated" }) }, { command: "agent", arguments: [], cwd: root });
    const job = await changes.apply(request); await changes.waitForCompletion();
    expect(job).toMatchObject({ status: "failed" });
    expect(job.summary).toContain("test implementation");
  });

  it("preserves current source edits when a browser draft has become stale", async () => {
    const { path, catalog, request } = await fixture();
    await writeFile(path, "// Current user edit\n" + await readFile(path, "utf8"));
    const changes = new RequirementChanges(catalog);
    await expect(changes.apply(request)).rejects.toThrow("source changed");
    expect(await readFile(path, "utf8")).toContain("Current user edit");
  });

  it("keeps failed independent validation visible in the task result", async () => {
    const { root, path, catalog, request } = await fixture();
    const changes = new RequirementChanges(catalog, { run: async (_command, options) => {
      if (options?.input) { await writeFile(path, (await readFile(path, "utf8")).replace("assert.equal(1, 1)", "assert.equal(2, 1)")); return { exitCode: 0, output: "" }; }
      return { exitCode: 1, output: "Assertion failed" };
    } }, { command: "agent", arguments: [], cwd: root });
    const job = await changes.apply(request); await changes.waitForCompletion();
    expect(job.status).toBe("failed");
    expect(job.summary).toContain("Validation exited with status 1");
  });
});
