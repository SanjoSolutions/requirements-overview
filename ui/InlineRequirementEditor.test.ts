import { describe, expect, it, vi } from "vitest";
import { InlineRequirementEditor } from "./InlineRequirementEditor.ts";
import type { Requirement } from "../model.ts";

const requirement: Requirement = { id: "test", project: "example", path: "example.test.ts", title: "opens the profile", suites: ["Profiles"], framework: "vitest", line: 1, range: { start: 0, end: 1 }, sourceFingerprint: "original source", implementationFingerprint: "test body", editable: true, status: "collected", syntax: "javascript" };

describe("Inline requirement editing", () => {
  it("cancels a draft and keeps its original requirement available", () => {
    const apply = vi.fn(); const editor = new InlineRequirementEditor(apply);
    editor.begin(requirement); editor.update("saves the profile"); editor.cancel(); editor.begin(requirement);
    expect(editor.retrieveDraft()?.description).toBe("opens the profile"); expect(apply).toHaveBeenCalledTimes(0);
  });
  it("saves the revised description once while its request is in flight", async () => {
    let finish!: () => void;
    const apply = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const editor = new InlineRequirementEditor(apply);
    editor.begin(requirement); editor.update("  saves the profile  ");
    const saving = editor.save();
    expect(editor.retrieveDraft()?.saving).toBe(true);
    await editor.save();
    expect(apply).toHaveBeenCalledExactlyOnceWith({ requirementId: "test", sourceFingerprint: "original source", description: "saves the profile" });
    finish(); expect(await saving).toBe(true); expect(editor.retrieveDraft()).toBeUndefined();
  });
  it("retains a failed draft and its source version for review", async () => {
    const editor = new InlineRequirementEditor(async () => { throw new Error("The source changed."); });
    editor.begin(requirement); editor.update("saves the profile");
    editor.begin({ ...requirement, title: "External edit", sourceFingerprint: "latest source" });
    await expect(editor.save()).rejects.toThrow("source changed");
    expect(editor.retrieveDraft()).toMatchObject({ description: "saves the profile", saving: false, requirement: { sourceFingerprint: "original source" } });
  });
});
