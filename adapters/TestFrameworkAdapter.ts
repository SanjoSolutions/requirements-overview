import { createHash } from "node:crypto";
import type { Requirement, SourceContext, ValidationCommand } from "../model.ts";

export function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function humanize(value: string) {
  return value.replace(/^test_/, "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Adapter contract: translate framework source and execution into the shared requirement model. */
export abstract class TestFrameworkAdapter {
  readonly id: string;
  readonly label: string;
  constructor(id: string, label: string) {
    this.id = id;
    this.label = label;
  }

  abstract supports(context: SourceContext): boolean;
  abstract discover(context: SourceContext): Requirement[];
  abstract retrieveValidation(context: SourceContext): ValidationCommand[];

  createRequirement(context: SourceContext, { title, suites = [], start, end, implementation, ...details }: Pick<Requirement, "title" | "syntax"> & Partial<Pick<Requirement, "suites" | "status" | "editable" | "template" | "variant" | "annotationPrefix" | "insertAnnotation">> & { start: number; end: number; implementation?: string }): Requirement {
    return {
      id: fingerprint(`${this.id}:${context.path}:${start}`).slice(0, 24),
      framework: this.id,
      path: context.path,
      project: context.project,
      title,
      suites,
      line: context.source.slice(0, start).split("\n").length,
      sourceFingerprint: fingerprint(context.source),
      implementationFingerprint: fingerprint(implementation ?? ""),
      range: { start, end },
      editable: true,
      status: "collected",
      ...details,
    };
  }
}
