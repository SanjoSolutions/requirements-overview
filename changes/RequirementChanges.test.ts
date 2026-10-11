import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequirementCatalog } from "../catalog/RequirementCatalog.ts";
import { RequirementChanges } from "./RequirementChanges.ts";
import { InlineRequirementEditor } from "../ui/InlineRequirementEditor.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const originalSource = 'import { test } from "node:test"; import assert from "node:assert/strict"; test("accepts one", () => { assert.equal(1, 1); });';
async function fixture(source = originalSource, filename = "example.test.ts") {
  const root = await mkdtemp(join(tmpdir(), "requirement-changes-")); directories.push(root);
  const directory = join(root, "apps", "example"); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "package.json"), '{"name":"example","private":true}');
  const path = join(directory, filename); await writeFile(path, source);
  const catalog = new RequirementCatalog(root);
  const requirement = (await catalog.retrieveSnapshot()).requirements[0];
  const changes = new RequirementChanges(catalog);
  return { path, catalog, changes, requirement, request: { requirementId: requirement.id, sourceFingerprint: requirement.sourceFingerprint, description: "accepts two" } };
}

describe("Requirement description changes", () => {
  it.each([
    { framework: "Node", filename: "example.test.ts", source: originalSource },
    { framework: "Vitest", filename: "example.test.ts", source: 'import { describe, it, expect } from "vitest"; describe("Example", () => { it("accepts one", () => { expect(1).toBe(1); }); });' },
    { framework: "Playwright", filename: "example.test.ts", source: 'import { test, expect } from "@playwright/test"; test.describe("Example", () => { test("accepts one", async () => { expect(1).toBe(1); }); });' },
    { framework: "Godot", filename: "test_example.gd", source: 'func test_example():\n  assert(true, "accepts one")\n' },
    { framework: "C++", filename: "example.cpp", source: 'TEST_CASE("accepts one") { CHECK(1 == 1); }\n' },
  ])("saves the $framework description while preserving the test implementation", async ({ filename, source }) => {
    const { path, requirement, changes, request } = await fixture(source, filename);
    const snapshot = await changes.apply(request);
    expect(await readFile(path, "utf8")).toBe(source.replace('"accepts one"', '"accepts two"'));
    expect(snapshot.requirements[0]).toMatchObject({ title: "accepts two", implementationFingerprint: requirement.implementationFingerprint });
  });

  it.each([
    { framework: "Godot", filename: "test_example.gd", source: "## Requirement: accepts one\r\nfunc test_example():\r\n  verify_value(1)\r\n" },
    { framework: "GoogleTest", filename: "example.cpp", source: "// Requirement: accepts one\nTEST(Example, AcceptsOne) { EXPECT_EQ(1, 1); }\n" },
  ])("updates the $framework requirement annotation while preserving identifiers and assertions", async ({ filename, source }) => {
    const { path, changes, request } = await fixture(source, filename);
    const snapshot = await changes.apply(request);
    expect(await readFile(path, "utf8")).toBe(source.replace("accepts one", "accepts two"));
    expect(snapshot.requirements[0].title).toBe("accepts two");
  });

  it.each([
    { framework: "Godot", filename: "test_example.gd", prefix: "## Requirement: ", source: "func test_accepts_one():\r\n  verify_value(1)\r\n", newline: "\r\n" },
    { framework: "GoogleTest", filename: "example.cpp", prefix: "// Requirement: ", source: "TEST(Example, AcceptsOne) { EXPECT_EQ(1, 1); }\n", newline: "\n" },
  ])("adds descriptive text to a $framework identifier-based test", async ({ filename, prefix, source, newline }) => {
    const { path, changes, request } = await fixture(source, filename);
    const snapshot = await changes.apply(request);
    expect(await readFile(path, "utf8")).toBe(`${prefix}accepts two${newline}${source}`);
    expect(snapshot.requirements[0].title).toBe("accepts two");
  });

  it("supports consecutive inline saves using the refreshed source version", async () => {
    const { path, catalog, changes, request } = await fixture();
    let snapshot = await catalog.retrieveSnapshot();
    const editor = new InlineRequirementEditor(async change => { snapshot = await changes.apply(change); });
    editor.begin(snapshot.requirements[0]); editor.update(request.description); expect(await editor.save()).toBe(true);
    editor.begin(snapshot.requirements[0]); editor.update('accepts "three" from C:\\examples'); expect(await editor.save()).toBe(true);
    expect(await readFile(path, "utf8")).toBe(originalSource.replace('"accepts one"', JSON.stringify('accepts "three" from C:\\examples')));
    expect(snapshot.requirements[0].title).toBe('accepts "three" from C:\\examples');
  });

  it("preserves current source edits when a browser draft has become stale", async () => {
    const { path, changes, request } = await fixture();
    const currentSource = "// Current user edit\n" + originalSource; await writeFile(path, currentSource);
    await expect(changes.apply(request)).rejects.toThrow("source changed");
    expect(await readFile(path, "utf8")).toBe(currentSource);
  });

  it("keeps computed descriptions tied to their original source expression", async () => {
    const source = 'import { test } from "node:test"; test(description, () => { assert.equal(1, 1); });';
    const { path, changes, request } = await fixture(source);
    await expect(changes.apply(request)).rejects.toThrow("computed description");
    expect(await readFile(path, "utf8")).toBe(source);
  });
});
