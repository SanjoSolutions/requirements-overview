import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { TestFrameworkAdapter, humanize } from "./TestFrameworkAdapter.ts";
import { SourceTokens } from "./SourceTokens.ts";
import type { Requirement, SourceContext } from "../model.ts";

export class GodotAdapter extends TestFrameworkAdapter {
  readonly reader: SourceTokens;
  constructor(reader = new SourceTokens()) { super("godot", "Godot"); this.reader = reader; }
  supports(context: SourceContext) { return context.path.endsWith(".gd"); }
  discover(context: SourceContext) {
    const tokens = this.reader.read(context.source, "godot");
    const requirements: Requirement[] = [];
    const functions = [...context.source.matchAll(/^(?:static\s+)?func\s+(\w+)\s*\(/gm)];
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.value === "assert" && tokens[index + 1]?.value === "(") {
        const call = this.reader.retrieveCall(tokens, index);
        const message = call.arguments[1];
        if (message?.length) {
          const description = message[0];
          const literal = message.length === 1 && description.type === "string";
          const functionName = functions.findLast(item => item.index < token.start)?.[1];
          requirements.push(this.createRequirement(context, {
            title: literal ? description.value : `[Computed description] ${context.source.slice(description.start, message.at(-1)!.end)}`,
            suites: functionName ? [humanize(functionName.replace(/^_/, ""))] : [],
            start: description.start, end: message.at(-1)!.end, syntax: "godot", editable: literal,
            implementation: context.source.slice(token.start, call.end).replace(context.source.slice(description.start, message.at(-1)!.end), "DESCRIPTION"),
          }));
        }
        index = call.endIndex - 1;
      }
    }
    for (const [index, declaration] of functions.entries()) {
      const end = functions[index + 1]?.index ?? context.source.length;
      const covered = requirements.some(requirement => requirement.range.start >= declaration.index && requirement.range.start < end);
      if (declaration[1].startsWith("test_") && !covered) {
        const before = context.source.slice(0, declaration.index);
        const annotation = /## Requirement: ([^\r\n]+)\r?\n$/.exec(before);
        const start = annotation ? declaration.index - annotation[0].length + "## Requirement: ".length : declaration.index;
        requirements.push(this.createRequirement(context, {
          title: annotation?.[1] ?? humanize(declaration[1]), suites: [], start,
          end: annotation ? start + annotation[1].length : start,
          syntax: "annotation", annotationPrefix: "## Requirement: ", insertAnnotation: !annotation,
          implementation: context.source.slice(declaration.index, end),
        }));
      }
    }
    return requirements;
  }
  retrieveValidation(context: SourceContext) {
    const runner = join(context.projectDirectory, "tests", "run_tests.py");
    if (existsSync(runner)) {
      return [{ command: "python", arguments: [runner, "--suite", "changed", "--changed", relative(context.projectDirectory, context.absolutePath).replaceAll("\\", "/")], cwd: context.projectDirectory }];
    }
    throw new Error("Configure validation for this Godot project in requirements-overview.config.json.");
  }
}
