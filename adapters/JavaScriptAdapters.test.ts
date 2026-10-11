import { describe, expect, it } from "vitest";
import { PlaywrightAdapter, VitestAdapter, NodeTestAdapter, JestAdapter } from "./JavaScriptAdapters.ts";
import type { SourceContext } from "../model.ts";

const context = (source: string): SourceContext => ({ source, path: "apps/example/test.ts", absolutePath: "/repo/apps/example/test.ts", projectDirectory: "/repo/apps/example", project: "apps/example" });

describe("JavaScript requirement adapters", () => {
  it("preserves nested Vitest descriptions and aliases with their exact source locations", () => {
    const source = `import { describe as group, it as requirement } from 'vitest';
group('Account', () => { group('Sessions', () => {
  requirement('keeps the selected session', () => { expect(1).toBe(1); });
}); });`;
    const requirements = new VitestAdapter().discover(context(source));
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toMatchObject({ title: "keeps the selected session", suites: ["Account", "Sessions"], line: 3, editable: true });
    expect(source.slice(requirements[0].range.start, requirements[0].range.end)).toBe("'keeps the selected session'");
  });

  it("groups Playwright tests beneath test.describe and retains active and skipped states", () => {
    const requirements = new PlaywrightAdapter().discover(context(`import { test } from '@playwright/test';
test.describe('Navigation', () => { test('opens the session', async () => {}); test.skip('opens settings', () => {}); });`));
    expect(requirements.map(item => [item.title, item.suites, item.status])).toEqual([
      ["opens the session", ["Navigation"], "collected"], ["opens settings", ["Navigation"], "skipped"],
    ]);
  });

  it("represents parameterized templates and computed descriptions explicitly", () => {
    const requirements = new VitestAdapter().discover(context(`import * as v from 'vitest';
v.describe('Values', () => { v.it.each([1, 2])('accepts %i', value => {}); v.it(name, () => {}); });`));
    expect(requirements).toHaveLength(2);
    expect(requirements[0]).toMatchObject({ title: "accepts %i", template: true, suites: ["Values"] });
    expect(requirements[1]).toMatchObject({ editable: false, title: "[Computed description] name" });
  });

  it("reads source declarations while comments and implementation calls remain source details", () => {
    const source = `// it('comment example', () => {});
describe('Source', () => { it('reads a declaration', () => { const example = "it('text', () => {})"; }); });`;
    expect(new JestAdapter().discover(context(source)).map(item => item.title)).toEqual(["reads a declaration"]);
    expect(new NodeTestAdapter().discover(context(`import test from 'node:test'; test('reads Node tests', () => {});`))[0].title).toBe("reads Node tests");
  });

  it("retains todo requirements in the overview", () => {
    expect(new VitestAdapter().discover(context(`it.todo('supports keyboard navigation');`))[0]).toMatchObject({ title: "supports keyboard navigation", status: "skipped" });
  });
});
