import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { RequirementsApi } from "./server.ts";
import { RequirementCatalog } from "./catalog/RequirementCatalog.ts";
import { RequirementChanges } from "./changes/RequirementChanges.ts";
import { ProcessRunner } from "./changes/ProcessRunner.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

describe("Requirements API", () => {
  it("saves an inline change, validates its test, and publishes a live update", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirements-api-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const directory = join(root, "apps", "example"); await mkdir(directory, { recursive: true });
    const path = join(directory, "example.test.ts");
    await writeFile(path, "import { test } from 'node:test'; import assert from 'node:assert/strict'; test('accepts one', () => { assert.equal(1, 1); });");
    const catalog = new RequirementCatalog(root);
    const runner = new ProcessRunner();
    const changes = new RequirementChanges(catalog, { run: async (command, options) => {
      if (options?.input) {
        await writeFile(path, (await readFile(path, "utf8")).replace("assert.equal(1, 1)", "assert.equal(2, 2)"));
        return { exitCode: 0, output: "Updated test implementation" };
      } else { return runner.run(command, options); }
    } }, { command: "agent", arguments: [], cwd: root });
    const api = new RequirementsApi(catalog, changes);
    const server = createServer((request, response) => void api.handle(request, response));
    cleanup.push(async () => { api.updates.stop(); api.closeStreams(); await new Promise<void>(resolve => server.close(() => resolve())); });
    api.updates.start(); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const stream = await fetch(`${address}/api/events`, { signal: AbortSignal.timeout(5000) });
    const reader = stream.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: catalog");
    const requirement = (await catalog.retrieveSnapshot()).requirements[0];
    const response = await fetch(`${address}/api/changes`, { method: "POST", headers: { "Content-Type": "application/json", "Origin": address }, body: JSON.stringify({ requirementId: requirement.id, sourceFingerprint: requirement.sourceFingerprint, description: "accepts two" }) });
    expect(response.status).toBe(200);
    await changes.waitForCompletion(); expect(changes.retrieveJobs()[0].status).toBe("verified");
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: catalog");
    expect((await (await fetch(`${address}/api/catalog`)).json()).requirements[0].title).toBe("accepts two");
    await reader.cancel();
  });
});
