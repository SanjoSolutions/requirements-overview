import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { PlaywrightAdapter, VitestAdapter, NodeTestAdapter, JestAdapter } from "../adapters/JavaScriptAdapters.ts";
import { GodotAdapter } from "../adapters/GodotAdapter.ts";
import { CppAdapter } from "../adapters/CppAdapter.ts";
import type { TestFrameworkAdapter } from "../adapters/TestFrameworkAdapter.ts";
import type { CatalogSnapshot, Requirement, RequirementTree, SourceContext, ValidationCommand } from "../model.ts";

interface ValidationRecipe { path: string; commands: { command: string; arguments: string[]; cwd?: string }[] }
interface CatalogConfiguration { roots?: string[]; validation?: ValidationRecipe[] }
const excludedDirectories = new Set(["node_modules", ".git", ".godot", ".next", ".cache", ".state", "dist", "build", "out", "output", "coverage", "vendor", "thirdparty", "third_party", "addons", ".amplify", "cdk.out", "__pycache__"]);
const candidate = (path: string) => /\.(?:cpp|cc|cxx|h|hpp)$/.test(path)
  || (/(?:^|[\/._-])(?:test|tests|spec|specs|scene_checks)(?:[\/._-]|$)/i.test(path.replaceAll("\\", "/"))
    && /\.(?:[cm]?[jt]sx?|gd)$/.test(path));

export class RequirementCatalog {
  readonly root: string;
  readonly adapters: TestFrameworkAdapter[];
  private readonly cache = new Map<string, { signature: string; source: string }>();
  private snapshot?: CatalogSnapshot;
  private scanning?: Promise<CatalogSnapshot>;

  constructor(root: string, adapters: TestFrameworkAdapter[] = [new PlaywrightAdapter(), new NodeTestAdapter(), new VitestAdapter(), new JestAdapter(), new GodotAdapter(), new CppAdapter()]) {
    this.root = resolve(root);
    this.adapters = adapters;
  }

  async retrieveConfiguration(): Promise<CatalogConfiguration> {
    const path = join(this.root, "test-requirements.config.json");
    return existsSync(path) ? JSON.parse(await readFile(path, "utf8")) : {};
  }

  async retrieveSnapshot(refresh = false): Promise<CatalogSnapshot> {
    if (this.scanning) return this.scanning;
    if (this.snapshot && !refresh) return this.snapshot;
    this.scanning = this.scan();
    try { this.snapshot = await this.scanning; return this.snapshot; }
    finally { this.scanning = undefined; }
  }

  async retrieveRequirement(id: string): Promise<Requirement> {
    const snapshot = await this.retrieveSnapshot();
    const requirement = snapshot.requirements.find(item => item.id === id);
    if (requirement) return requirement;
    throw new Error("Refresh the tree and select an available requirement.");
  }

  async retrieveContext(path: string): Promise<SourceContext> {
    const absolutePath = this.resolvePath(path);
    const source = await readFile(absolutePath, "utf8");
    let directory = dirname(absolutePath);
    let projectDirectory = this.root;
    let defaultFramework: string | undefined;
    let found = false;
    while (!found && directory.startsWith(this.root)) {
      if (existsSync(join(directory, "project.godot"))) {
        projectDirectory = directory;
        found = true;
      } else if (existsSync(join(directory, "package.json"))) {
        projectDirectory = directory;
        const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
        const dependencies = { ...metadata.dependencies, ...metadata.devDependencies };
        defaultFramework = dependencies.vitest ? "vitest" : dependencies.jest ? "jest" : undefined;
        found = true;
      } else if (directory === this.root) {
        found = true;
      } else {
        directory = dirname(directory);
      }
    }
    return { path, absolutePath, source, projectDirectory, project: relative(this.root, projectDirectory).replaceAll("\\", "/") || "Repository", defaultFramework };
  }

  resolvePath(path: string): string {
    const result = resolve(this.root, path);
    if (result.startsWith(this.root + sep)) return result;
    throw new Error("Choose a source file inside the repository.");
  }

  async retrieveSource(requirement: Requirement): Promise<string> {
    const context = await this.retrieveContext(requirement.path);
    const lines = context.source.split("\n");
    const start = Math.max(0, requirement.line - 7);
    return lines.slice(start, requirement.line + 12).map((line, index) => `${start + index + 1}  ${line}`).join("\n");
  }

  private async scan(): Promise<CatalogSnapshot> {
    const configuration = await this.retrieveConfiguration();
    const paths: string[] = [];
    const issues: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
          const path = join(directory, entry.name);
          if (entry.isDirectory() && !excludedDirectories.has(entry.name) && !entry.name.startsWith(".")) await walk(path);
          else if (entry.isFile() && candidate(relative(this.root, path))) paths.push(path);
        }
      } catch (error) { issues.push(`${relative(this.root, directory)}: ${String(error)}`); }
    };
    for (const root of configuration.roots ?? ["apps", "packages", "scripts"]) {
      const directory = this.resolvePath(root);
      if (existsSync(directory)) await walk(directory);
    }
    const requirements: Requirement[] = [];
    for (const absolutePath of [...new Set(paths)].sort()) {
      const path = relative(this.root, absolutePath).replaceAll("\\", "/");
      try {
        const metadata = await stat(absolutePath);
        const signature = `${metadata.mtimeMs}:${metadata.size}`;
        const cached = this.cache.get(path);
        const source = cached?.signature === signature ? cached.source : await readFile(absolutePath, "utf8");
        this.cache.set(path, { signature, source });
        const context = await this.retrieveContext(path);
        const adapter = this.adapters.find(item => item.supports(context));
        if (adapter) {
          const discovered = adapter.discover({ ...context, source });
          let validation: ValidationCommand[] | undefined;
          let validationIssue: string | undefined;
          try {
            const recipe = [...configuration.validation ?? []].sort((left, right) => right.path.length - left.path.length)
              .find(item => path === item.path || path.startsWith(item.path.replace(/\/$/, "") + "/"));
            validation = recipe ? recipe.commands.map(command => ({ ...command, cwd: resolve(this.root, command.cwd ?? recipe.path) })) : adapter.retrieveValidation(context);
            if (validation.length === 0) throw new Error("Configure at least one validation command.");
          } catch (error) { validationIssue = (error as Error).message; }
          for (const requirement of discovered) requirements.push({ ...requirement, validation, validationIssue });
        }
      } catch (error) { issues.push(`${path}: ${(error as Error).message}`); }
    }
    return {
      tree: this.createTree(requirements), requirements, issues, scannedAt: new Date().toISOString(),
      frameworks: this.adapters.map(adapter => ({ id: adapter.id, label: adapter.label, count: requirements.filter(item => item.framework === adapter.id).length })),
    };
  }

  private createTree(requirements: Requirement[]): RequirementTree {
    const root: RequirementTree = { id: "root", title: "Requirements", kind: "root", count: requirements.length, children: [] };
    for (const requirement of requirements) {
      let parent = root;
      const groups: Pick<RequirementTree, "title" | "kind">[] = [{ title: requirement.project, kind: "project" }, { title: requirement.path.replace(requirement.project + "/", ""), kind: "file" }, ...requirement.suites.map(title => ({ title, kind: "suite" as const }))];
      for (const group of groups) {
        const id = `${parent.id}/${group.title}`;
        let child = parent.children.find(item => item.id === id);
        if (!child) {
          child = { ...group, id, count: 0, children: [] };
          parent.children.push(child);
        }
        child.count++;
        parent = child;
      }
      parent.children.push({ id: requirement.id, title: requirement.title, kind: "requirement", count: 1, requirement, children: [] });
    }
    return root;
  }
}
