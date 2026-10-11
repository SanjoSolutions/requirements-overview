import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequirementCatalog } from "./RequirementCatalog.ts";
import { CatalogUpdates } from "./CatalogUpdates.ts";
import type { CatalogUpdate } from "./CatalogUpdates.ts";

const directories: string[] = [];
const watchers: CatalogUpdates[] = [];
afterEach(async () => { watchers.splice(0).forEach(watcher => watcher.stop()); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("Live requirement updates", () => {
  it("reflects edits, renamed test files, and removals in the cached catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirement-live-")); directories.push(root);
    const directory = join(root, "apps", "example"); await mkdir(directory, { recursive: true });
    const path = join(directory, "profile.test.ts");
    const source = "import { it } from 'vitest'; it('opens the profile', () => {});";
    await writeFile(path, source);
    const catalog = new RequirementCatalog(root); await catalog.retrieveSnapshot();
    const updates = new CatalogUpdates(catalog); watchers.push(updates);
    const events: CatalogUpdate[] = []; updates.subscribe(event => events.push(event)); updates.start();
    await writeFile(path, source.replace("opens", "saves"));
    await vi.waitFor(async () => { expect(events.some(event => event.type === "catalog")).toBe(true); expect((await catalog.retrieveSnapshot()).requirements[0].title).toBe("saves the profile"); });
    const renamed = join(directory, "account.test.ts"); await rename(path, renamed);
    await vi.waitFor(async () => { expect((await catalog.retrieveSnapshot()).requirements[0].path).toBe("apps/example/account.test.ts"); });
    await rm(renamed);
    await vi.waitFor(async () => { expect((await catalog.retrieveSnapshot()).requirements).toHaveLength(0); });
  });
});
