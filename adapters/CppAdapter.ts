import { TestFrameworkAdapter, humanize } from "./TestFrameworkAdapter.ts";
import { SourceTokens } from "./SourceTokens.ts";
import type { Requirement, SourceContext, ValidationCommand } from "../model.ts";

export class CppAdapter extends TestFrameworkAdapter {
  readonly reader: SourceTokens;
  constructor(reader = new SourceTokens()) { super("cpp", "C++"); this.reader = reader; }
  supports(context: SourceContext) { return /\.(cpp|cc|cxx|h|hpp)$/.test(context.path); }
  discover(context: SourceContext) {
    const tokens = this.reader.read(context.source, "cpp");
    const requirements: Requirement[] = [];
    const scopes: (string | undefined)[] = [];
    let pendingSuite: string | undefined;
    const retrieveBody = (index: number) => {
      let cursor = index;
      while (cursor < tokens.length && !["{", ";"].includes(tokens[cursor].value)) cursor++;
      const start = tokens[cursor]?.start ?? context.source.length;
      let depth = 0;
      do {
        if (tokens[cursor]?.value === "{") depth++;
        if (tokens[cursor]?.value === "}") depth--;
        cursor++;
      } while (cursor < tokens.length && depth > 0);
      return context.source.slice(start, tokens[cursor - 1]?.end ?? start);
    };
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (token.type === "symbol" && token.value === "{") { scopes.push(pendingSuite); pendingSuite = undefined; }
      else if (token.type === "symbol" && token.value === "}") scopes.pop();
      else if (tokens[index + 1]?.value === "(") {
        const suite = ["TEST_SUITE", "TEST_SUITE_BEGIN"].includes(token.value);
        const named = /^(TEST_CASE(?:_FIXTURE|_METHOD)?|SCENARIO|SUBCASE|SECTION)$/.test(token.value);
        const google = ["TEST", "TEST_F", "TEST_P", "TYPED_TEST"].includes(token.value);
        if (suite || named || google) {
          const call = this.reader.retrieveCall(tokens, index);
          const descriptions = call.arguments.flat().filter(item => item.type === "string");
          const description = descriptions[0];
          if (suite && description) {
            pendingSuite = description.value;
            if (token.value === "TEST_SUITE_BEGIN") scopes.push(pendingSuite);
          } else if (named && description) {
            requirements.push(this.createRequirement(context, {
              title: description.value, suites: scopes.filter((value): value is string => Boolean(value)),
              start: description.start, end: description.end, syntax: "cpp",
              implementation: retrieveBody(call.endIndex),
              variant: token.value,
            }));
            pendingSuite = description.value;
          } else if (google && call.arguments[1]?.[0]) {
            const before = context.source.slice(0, token.start);
            const annotation = /\/\/ Requirement: ([^\r\n]+)\r?\n[ \t]*$/.exec(before);
            const start = annotation ? before.length - annotation[0].length + "// Requirement: ".length : token.start;
            requirements.push(this.createRequirement(context, {
              title: annotation?.[1] ?? humanize(call.arguments[1][0].value),
              suites: [...scopes.filter((value): value is string => Boolean(value)), call.arguments[0][0].value], start,
              end: annotation ? start + annotation[1].length : start,
              syntax: "annotation", annotationPrefix: "// Requirement: ", insertAnnotation: !annotation,
              implementation: retrieveBody(call.endIndex), variant: token.value,
            }));
          }
          index = call.endIndex - 1;
        }
      }
    }
    return requirements;
  }
  retrieveValidation(): ValidationCommand[] {
    throw new Error("Configure C++ build and test commands in test-requirements.config.json.");
  }
}
