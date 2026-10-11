import { describe, expect, it } from "vitest";
import { RequirementOutline } from "./RequirementOutline.ts";
import type { Requirement } from "../model.ts";

function requirement(id: string, project: string, suites: string[], title: string): Requirement {
  return { id, project, suites, title, path: `${project}/${id}.test.ts`, framework: "vitest", line: 1, range: { start: 0, end: 1 }, sourceFingerprint: "source", implementationFingerprint: "test", editable: true, status: "collected", syntax: "javascript" };
}

describe("Project requirement outline", () => {
  it("shows the selected project's describe and it texts in their source order", () => {
    const tree = new RequirementOutline().retrieveTree([
      requirement("first", "apps/example", ["Thing"], "does the first thing"),
      requirement("second", "apps/example", ["Thing"], "does the second thing"),
      requirement("other", "apps/other", ["Other thing"], "belongs to another project"),
    ], "apps/example");
    expect(tree.count).toBe(2);
    expect(tree.children.map(item => item.title)).toEqual(["Thing"]);
    expect(tree.children[0].children.map(item => item.title)).toEqual(["does the first thing", "does the second thing"]);
    expect(tree.children[0].children[0].requirement?.path).toBe("apps/example/first.test.ts");
  });
  it("preserves every level of nested describe blocks", () => {
    const tree = new RequirementOutline().retrieveTree([
      requirement("first", "apps/example", ["Top describe", "Nested describe"], "it 1"),
      requirement("second", "apps/example", ["Top describe", "Nested describe"], "it 2"),
      requirement("third", "apps/example", ["Top describe", "Nested describe", "Deeper describe"], "it 3"),
    ], "apps/example");
    const top = tree.children[0]; const nested = top.children[0];
    expect(top.title).toBe("Top describe"); expect(nested.title).toBe("Nested describe");
    expect(nested.children.map(item => item.title)).toEqual(["it 1", "it 2", "Deeper describe"]);
    expect(nested.children[2].children[0].title).toBe("it 3");
  });
  it("shows standalone it descriptions at the top level", () => {
    const tree = new RequirementOutline().retrieveTree([requirement("first", "apps/example", [], "does a thing")], "apps/example");
    expect(tree.children[0]).toMatchObject({ kind: "requirement", title: "does a thing" });
  });
});
