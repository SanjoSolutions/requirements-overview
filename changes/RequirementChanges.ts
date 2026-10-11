import { writeFile } from "node:fs/promises";
import { fingerprint } from "../adapters/TestFrameworkAdapter.ts";
import { RequirementCatalog } from "../catalog/RequirementCatalog.ts";
import type { CatalogSnapshot, ChangeRequest } from "../model.ts";

/** Saves a requirement description in its source and returns the refreshed catalog. */
export class RequirementChanges {
  readonly catalog: RequirementCatalog;
  private submitting = false;

  constructor(catalog: RequirementCatalog) { this.catalog = catalog; }

  async apply(request: ChangeRequest): Promise<CatalogSnapshot> {
    if (this.submitting) throw new Error("Wait for the current description to finish saving.");
    this.submitting = true;
    try {
      if (typeof request.description !== "string" || request.description.trim().length === 0 || request.description.length > 2000 || /[\r\n]/.test(request.description)) {
        throw new Error("Use a test description of 1 to 2,000 characters on one line.");
      }
      const requirement = await this.catalog.retrieveRequirement(request.requirementId);
      const context = await this.catalog.retrieveContext(requirement.path);
      if (request.sourceFingerprint !== requirement.sourceFingerprint || fingerprint(context.source) !== requirement.sourceFingerprint) {
        throw new Error("The source changed. Review its current description and start a fresh edit.");
      }
      if (!requirement.editable) throw new Error("Edit this computed description in its source file.");
      const description = request.description.trim();
      if (description === requirement.title) throw new Error("Enter a revised requirement description.");
      const replacement = requirement.syntax === "annotation"
        ? requirement.insertAnnotation ? `${requirement.annotationPrefix}${description}${context.source.includes("\r\n") ? "\r\n" : "\n"}` : description
        : JSON.stringify(description);
      const revisedSource = context.source.slice(0, requirement.range.start) + replacement + context.source.slice(requirement.range.end);
      await writeFile(context.absolutePath, revisedSource);
      return await this.catalog.retrieveSnapshot(true);
    } finally { this.submitting = false; }
  }
}
