import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { RequirementsApi, startServer } from "./server.ts";
import { RequirementCatalog } from "./catalog/RequirementCatalog.ts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

describe("Requirements API", () => {
  it("serves requirements from the current working directory by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirements-cwd-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
    await writeFile(join(root, "session.test.ts"), `import { it } from 'vitest'; it('opens the session from this directory', () => {});`);
    const workingDirectory = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      const server = await startServer(undefined, 0); cleanup.push(() => server.close());
      const address = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
      const response = await fetch(`${address}/api/catalog`);
      expect(response.status).toBe(200);
      expect((await response.json()).requirements.map((requirement: { title: string }) => requirement.title)).toEqual(["opens the session from this directory"]);
    } finally { workingDirectory.mockRestore(); }
  });
  it("saves an inline description, preserves its implementation, and publishes a live update", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirements-api-")); cleanup.push(() => rm(root, { recursive: true, force: true }));
    const directory = join(root, "apps", "example"); await mkdir(directory, { recursive: true });
    const path = join(directory, "example.test.ts");
    const source = 'import { test } from "node:test"; import assert from "node:assert/strict"; test("accepts one", () => { assert.equal(1, 1); });';
    await writeFile(path, source);
    const catalog = new RequirementCatalog(root);
    const api = new RequirementsApi(catalog);
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
    expect((await response.json()).requirements[0]).toMatchObject({ title: "accepts two", implementationFingerprint: requirement.implementationFingerprint });
    expect(await readFile(path, "utf8")).toBe(source.replace('"accepts one"', '"accepts two"'));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: catalog");
    expect((await (await fetch(`${address}/api/catalog`)).json()).requirements[0].title).toBe("accepts two");
    await reader.cancel();
  });
});
