import ts from "typescript";
import type { Requirement, SourceContext } from "../model.ts";
import type { TestFrameworkAdapter } from "./TestFrameworkAdapter.ts";

/** Composition keeps the syntax reader common to Vitest, Playwright, Jest, and Node. */
export class JavaScriptTestReader {
  discover(context: SourceContext, adapter: TestFrameworkAdapter) {
    const sourceFile = ts.createSourceFile(context.path, context.source, ts.ScriptTarget.Latest, true,
      context.path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const bindings = new Map([["describe", "suite"], ["it", "test"], ["test", "test"]]);
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause && ts.isStringLiteral(statement.moduleSpecifier)) {
        const moduleName = statement.moduleSpecifier.text;
        if (/^(vitest|@jest\/globals|@playwright\/test|playwright\/test|node:test)$/.test(moduleName)) {
          const clause = statement.importClause;
          if (clause.name && moduleName === "node:test") bindings.set(clause.name.text, "test");
          if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (const binding of clause.namedBindings.elements) {
              const original = (binding.propertyName ?? binding.name).text;
              if (["describe", "it", "test"].includes(original)) {
                bindings.set(binding.name.text, original === "describe" ? "suite" : "test");
              }
            }
          } else if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
            bindings.set(clause.namedBindings.name.text, "namespace");
          }
        }
      }
    }
    const retrieveCall = (expression: ts.Expression) => {
      const modifiers: string[] = [];
      let current = expression;
      while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current) || ts.isTaggedTemplateExpression(current)) {
        if (ts.isPropertyAccessExpression(current)) {
          modifiers.unshift(current.name.text);
          current = current.expression;
        } else {
          current = ts.isTaggedTemplateExpression(current) ? current.tag : current.expression;
        }
      }
      let kind = ts.isIdentifier(current) ? bindings.get(current.text) : undefined;
      if (kind === "namespace") {
        const member = modifiers.shift();
        kind = member === "describe" ? "suite" : ["it", "test"].includes(member ?? "") ? "test" : undefined;
      } else if (kind === "test" && modifiers[0] === "describe") {
        modifiers.shift();
        kind = "suite";
      }
      return { kind, modifiers };
    };
    const requirements: Requirement[] = [];
    const visit = (node: ts.Node, suites: string[] = [], inheritedStatus = "collected") => {
      if (ts.isCallExpression(node)) {
        const { kind, modifiers } = retrieveCall(node.expression);
        const description = node.arguments[0];
        const callback = [...node.arguments].reverse().find(argument => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
        // Factory calls such as it.each(rows) belong to the outer declaration.
        const declaration = kind && description && (callback || modifiers.includes("todo"))
          && !modifiers.includes("extend");
        if (declaration) {
          const literal = ts.isStringLiteral(description) || ts.isNoSubstitutionTemplateLiteral(description);
          const title = literal ? description.text : `[Computed description] ${description.getText(sourceFile)}`;
          const status = modifiers.some(value => ["skip", "todo"].includes(value)) ? "skipped" : inheritedStatus;
          if (kind === "suite") {
            if (callback) visit(callback.body, [...suites, title], status);
          } else {
            requirements.push(adapter.createRequirement(context, {
              title, suites, start: description.getStart(sourceFile), end: description.end,
              implementation: callback?.body.getText(sourceFile), status,
              editable: literal, syntax: "javascript",
              template: modifiers.includes("each") || modifiers.includes("for"),
            }));
          }
        } else {
          ts.forEachChild(node, child => visit(child, suites, inheritedStatus));
        }
      } else {
        ts.forEachChild(node, child => visit(child, suites, inheritedStatus));
      }
    };
    visit(sourceFile);
    return requirements;
  }
}
