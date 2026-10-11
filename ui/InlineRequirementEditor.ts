import type { ChangeRequest, Requirement } from "../model.ts";

export interface RequirementDraft { requirement: Requirement; description: string; saving: boolean }

/** Keeps a draft tied to the source version that the user started editing. */
export class InlineRequirementEditor {
  private draft?: RequirementDraft;
  private readonly apply: (request: ChangeRequest) => Promise<unknown>;
  constructor(apply: (request: ChangeRequest) => Promise<unknown>) { this.apply = apply; }
  retrieveDraft() { return this.draft; }
  begin(requirement: Requirement) {
    if (this.draft?.saving) throw new Error("Wait for this description to finish saving.");
    if (!requirement.editable) throw new Error("Edit this computed description through its VS Code link.");
    if (this.draft?.requirement.id !== requirement.id) this.draft = { requirement, description: requirement.title, saving: false };
  }
  update(description: string) { if (this.draft && !this.draft.saving) this.draft.description = description; }
  cancel() { if (!this.draft?.saving) this.draft = undefined; }
  async save(): Promise<boolean> {
    let saved = false;
    const draft = this.draft;
    if (draft && !draft.saving) {
      const description = draft.description.trim();
      if (description === draft.requirement.title) {
        this.cancel();
      } else {
        if (description.length === 0) throw new Error("Enter a requirement description.");
        draft.saving = true;
        try {
          await this.apply({ requirementId: draft.requirement.id, sourceFingerprint: draft.requirement.sourceFingerprint, description });
          this.draft = undefined; saved = true;
        } finally { draft.saving = false; }
      }
    }
    return saved;
  }
}
