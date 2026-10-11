import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { TestFrameworkAdapter } from "./TestFrameworkAdapter.ts";
import { JavaScriptTestReader } from "./JavaScriptTestReader.ts";
import type { SourceContext } from "../model.ts";

class JavaScriptAdapter extends TestFrameworkAdapter {
  readonly pattern: RegExp;
  readonly reader: JavaScriptTestReader;
  constructor(id: string, label: string, pattern: RegExp, reader: JavaScriptTestReader) {
    super(id, label);
    this.pattern = pattern;
    this.reader = reader;
  }
  supports(context: SourceContext) {
    return /\.[cm]?[jt]sx?$/.test(context.path) && this.pattern.test(context.source);
  }
  discover(context: SourceContext) { return this.reader.discover(context, this); }
  retrieveValidation(_context: SourceContext): import("../model.ts").ValidationCommand[] { throw new Error("Choose a concrete JavaScript adapter."); }
  retrieveEntry(context: SourceContext, packageName: string, entry: string) {
    const require = createRequire(join(context.projectDirectory, "package.json"));
    return join(dirname(require.resolve(`${packageName}/package.json`)), entry);
  }
}

export class PlaywrightAdapter extends JavaScriptAdapter {
  constructor(reader = new JavaScriptTestReader()) { super("playwright", "Playwright", /["'](?:@playwright\/test|playwright\/test)["']/, reader); }
  retrieveValidation(context: SourceContext) {
    return [{ command: process.execPath, arguments: [this.retrieveEntry(context, "@playwright/test", "cli.js"), "test", relative(context.projectDirectory, context.absolutePath)], cwd: context.projectDirectory }];
  }
}

export class VitestAdapter extends JavaScriptAdapter {
  constructor(reader = new JavaScriptTestReader()) { super("vitest", "Vitest", /["']vitest["']/, reader); }
  supports(context: SourceContext) {
    return super.supports(context) || (/\.[cm]?[jt]sx?$/.test(context.path) && context.defaultFramework === "vitest");
  }
  retrieveValidation(context: SourceContext) {
    const config = context.path.includes(".cloudflare.") ? ["--config", "vitest.cloudflare.config.mts"] : [];
    return [{ command: process.execPath, arguments: [this.retrieveEntry(context, "vitest", "vitest.ts"), "run", relative(context.projectDirectory, context.absolutePath), ...config], cwd: context.projectDirectory }];
  }
}

export class NodeTestAdapter extends JavaScriptAdapter {
  constructor(reader = new JavaScriptTestReader()) { super("node", "Node", /["']node:test["']/, reader); }
  retrieveValidation(context: SourceContext) {
    return [{ command: process.execPath, arguments: ["--test", context.absolutePath], cwd: context.projectDirectory }];
  }
}

export class JestAdapter extends JavaScriptAdapter {
  constructor(reader = new JavaScriptTestReader()) { super("jest", "Jest", /["']@jest\/globals["']/, reader); }
  supports(context: SourceContext) {
    return super.supports(context) || (/\.[cm]?[jt]sx?$/.test(context.path) && context.defaultFramework === "jest");
  }
  retrieveValidation(context: SourceContext) {
    return [{ command: process.execPath, arguments: [this.retrieveEntry(context, "jest", "bin/jest.js"), "--runInBand", "--runTestsByPath", context.absolutePath], cwd: context.projectDirectory }];
  }
}
