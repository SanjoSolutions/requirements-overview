import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RequirementCatalog } from "./RequirementCatalog.ts";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("Requirement catalog", () => {
  it("collects Godot assertion requirements from test-prefixed source files", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirement-godot-")); directories.push(root);
    const directory = join(root, "apps", "game");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "project.godot"), "config_version=5");
    await writeFile(join(directory, "test_menu.gd"), 'func test_menu():\n  assert(visible, "Opening the menu shows activities")');
    const snapshot = await new RequirementCatalog(root).retrieveSnapshot();
    expect(snapshot.requirements[0]).toMatchObject({ framework: "godot", project: "apps/game", title: "Opening the menu shows activities" });
  });
  it("combines adapter results in a project, file, suite, and requirement tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirement-catalog-")); directories.push(root);
    await mkdir(join(root, "apps", "example"), { recursive: true });
    await writeFile(join(root, "apps", "example", "package.json"), JSON.stringify({ devDependencies: { vitest: "4" } }));
    await writeFile(join(root, "apps", "example", "session.test.ts"), `describe('Sessions', () => { it('keeps the selection', () => {}); });`);
    await writeFile(join(root, "test-requirements.config.json"), JSON.stringify({ validation: [{ path: "apps/example", commands: [{ command: process.execPath, arguments: ["--version"] }] }] }));
    const catalog = new RequirementCatalog(root);
    const snapshot = await catalog.retrieveSnapshot();
    expect(snapshot.requirements).toHaveLength(1);
    expect(snapshot.tree.children[0].children[0].children[0]).toMatchObject({ kind: "suite", title: "Sessions", count: 1 });
    expect(snapshot.requirements[0].validation?.[0].cwd).toBe(join(root, "apps", "example"));
    await writeFile(join(root, "apps", "example", "session.test.ts"), `it('opens the selection', () => {});`);
    expect((await catalog.retrieveSnapshot(true)).requirements[0].title).toBe("opens the selection");
  });
  it("links each test to its source line in VS Code with encoded file names", async () => {
    const root = await mkdtemp(join(tmpdir(), "requirement-editor-")); directories.push(root);
    const directory = join(root, "apps", "example");
    await mkdir(directory, { recursive: true });
    const path = join(directory, "user #résumé.test.ts");
    await writeFile(path, `import { describe, it } from 'vitest';\ndescribe('Users', () => {\n  it('opens the profile', () => {});\n  it('saves the profile', () => {});\n});`);
    const snapshot = await new RequirementCatalog(root).retrieveSnapshot();
    const locations = snapshot.requirements.map(requirement => new URL(requirement.editorUrl!));
    expect(locations.map(location => location.protocol)).toEqual(["vscode:", "vscode:"]);
    expect(locations.map(location => location.hostname)).toEqual(["file", "file"]);
    expect(locations.map(location => decodeURIComponent(location.pathname))).toEqual([3, 4].map(line => `${process.platform === "win32" ? "/" : ""}${path.replaceAll("\\", "/")}:${line}:1`));
    expect(locations[0].pathname).toContain("user%20%23r%C3%A9sum%C3%A9.test.ts");
    expect(locations[0].hash).toBe("");
  });
});
