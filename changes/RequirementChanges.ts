import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fingerprint } from "../adapters/TestFrameworkAdapter.ts";
import { RequirementCatalog } from "../catalog/RequirementCatalog.ts";
import type { AgentJob, ChangeRequest, Requirement, ValidationCommand } from "../model.ts";
import { ProcessRunner, retrieveCodexCommand } from "./ProcessRunner.ts";
import type { ProcessExecutor } from "./ProcessRunner.ts";

export class RequirementChanges {
  readonly catalog: RequirementCatalog;
  readonly executor: ProcessExecutor;
  readonly agentCommand: ValidationCommand;
  private jobs: AgentJob[] = [];
  private controller?: AbortController;
  private active?: Promise<void>;
  private submitting = false;
  private readonly statePath: string;

  constructor(catalog: RequirementCatalog, executor: ProcessExecutor = new ProcessRunner(), agentCommand = retrieveCodexCommand(catalog.root)) {
    this.catalog = catalog;
    this.executor = executor;
    this.agentCommand = agentCommand;
    this.statePath = join(catalog.root, "apps", "test-requirements", ".state", "jobs.json");
  }

  async initialize() {
    if (existsSync(this.statePath)) {
      this.jobs = JSON.parse(await readFile(this.statePath, "utf8"));
      for (const job of this.jobs) {
        if (["running", "validating"].includes(job.status)) {
          job.status = "interrupted";
          job.summary = "The server restarted during this task. Review the working-tree changes.";
        }
      }
    }
  }

  retrieveJobs() { return this.jobs; }

  async preview(request: ChangeRequest) {
    const requirement = await this.retrieveCurrent(request);
    return { prompt: this.createPrompt(requirement, request.description.trim()), validation: requirement.validation };
  }

  async apply(request: ChangeRequest): Promise<AgentJob> {
    if (this.active || this.submitting) throw new Error("Wait for the current agent task or stop it before starting another.");
    this.submitting = true;
    try {
      const requirement = await this.retrieveCurrent(request);
      if (!requirement.editable) throw new Error("Edit this computed description in its source file.");
      if (!requirement.validation?.length) throw new Error(requirement.validationIssue ?? "Configure validation for this test.");
      const description = request.description.trim();
      const context = await this.catalog.retrieveContext(requirement.path);
      const replacement = requirement.syntax === "annotation"
        ? requirement.insertAnnotation ? `${requirement.annotationPrefix}${description}${context.source.includes("\r\n") ? "\r\n" : "\n"}` : description
        : JSON.stringify(description);
      const revisedSource = context.source.slice(0, requirement.range.start) + replacement + context.source.slice(requirement.range.end);
      const now = new Date().toISOString();
      const job: AgentJob = { id: randomUUID(), requirement, description, prompt: this.createPrompt(requirement, description), status: "running", createdAt: now, updatedAt: now, log: "" };
      // Reserve the task and persist its intent before changing the test description.
      this.controller = new AbortController();
      this.jobs.unshift(job);
      this.jobs = this.jobs.slice(0, 30);
      await this.persist();
      await writeFile(context.absolutePath, revisedSource);
      this.active = this.execute(job, revisedSource, this.controller.signal).finally(() => { this.active = undefined; this.controller = undefined; });
      return job;
    } finally { this.submitting = false; }
  }

  async waitForCompletion() { await this.active; }

  stop(id: string) {
    const job = this.jobs.find(item => item.id === id);
    if (job && ["running", "validating"].includes(job.status)) this.controller?.abort();
  }

  private async retrieveCurrent(request: ChangeRequest): Promise<Requirement> {
    if (typeof request.description !== "string" || request.description.trim().length === 0 || request.description.length > 2000 || /[\r\n]/.test(request.description)) {
      throw new Error("Use a test description of 1 to 2,000 characters on one line.");
    }
    const requirement = await this.catalog.retrieveRequirement(request.requirementId);
    const context = await this.catalog.retrieveContext(requirement.path);
    if (request.sourceFingerprint !== requirement.sourceFingerprint || fingerprint(context.source) !== requirement.sourceFingerprint) {
      throw new Error("The source changed. Refresh the tree and review the current description.");
    }
    if (request.description.trim() === requirement.title) throw new Error("Enter a revised requirement description.");
    return requirement;
  }

  private createPrompt(requirement: Requirement, description: string): string {
    return [
      "Implement this requirement change in the current repository. Follow the applicable AGENTS.md instructions.",
      `Test system: ${requirement.framework}`,
      `Source: ${requirement.path}:${requirement.line}`,
      `Suites: ${requirement.suites.join(" > ")}`,
      `Original description: ${JSON.stringify(requirement.title)}`,
      `Requested description: ${JSON.stringify(description)}`,
      "The requirement editor updates the description before this task starts. Update the test's setup, actions, and assertions to prove the requested behavior. Update the affected application code to satisfy it.",
      "Establish the existing behavior, demonstrate the changed requirement with a meaningful failing assertion where applicable, then implement and validate the behavior. Preserve relevant regression coverage and active test execution.",
      "Keep changes focused on this requirement. Keep the revised description in the selected test. Preserve the user's existing working-tree changes. Leave changes available for review. Git commits, publication, and external messages belong to separate user requests.",
      "Validation commands (command and argument arrays; execute from cwd):",
      JSON.stringify(requirement.validation ?? [], null, 2),
      "The server independently reruns these commands. Report the implementation changes, test evidence, and any prerequisites that remain pending.",
    ].join("\n\n");
  }

  private async execute(job: AgentJob, revisedSource: string, signal: AbortSignal) {
    const append = (text: string) => { job.log = (job.log + text).slice(-160_000); job.updatedAt = new Date().toISOString(); };
    try {
      const agent = await this.executor.run(this.agentCommand, { input: job.prompt, signal, onOutput: append });
      if (agent.exitCode !== 0) throw new Error(`Agent exited with status ${agent.exitCode}. Review the log and working-tree changes.`);
      job.status = "validating";
      await this.persist();
      const context = await this.catalog.retrieveContext(job.requirement.path);
      if (context.source === revisedSource) throw new Error("The description is updated. The test implementation still needs the requested behavior.");
      const adapter = this.catalog.adapters.find(item => item.id === job.requirement.framework)!;
      const revised = adapter.discover(context).find(item => item.title === job.description && item.suites.join("\0") === job.requirement.suites.join("\0"));
      if (!revised || revised.status === "skipped") throw new Error("The revised requirement needs an active matching test before verification.");
      if (revised.implementationFingerprint === job.requirement.implementationFingerprint) throw new Error("The revised requirement needs an updated test implementation before verification.");
      for (const command of job.requirement.validation!) {
        append(`\nValidation: ${JSON.stringify(command)}\n`);
        const result = await this.executor.run(command, { signal, onOutput: append });
        if (result.exitCode !== 0) throw new Error(`Validation exited with status ${result.exitCode}. Review the log and continue the task.`);
      }
      job.status = "verified";
      job.summary = "The agent updated the requirement and test implementation. Independent validation passed.";
    } catch (error) {
      job.status = signal.aborted ? "interrupted" : "failed";
      job.summary = (error as Error).message;
      append(`\n${job.summary}\n`);
    } finally {
      job.updatedAt = new Date().toISOString();
      await this.persist();
      await this.catalog.retrieveSnapshot(true);
    }
  }

  private async persist() {
    await mkdir(join(this.statePath, ".."), { recursive: true });
    await writeFile(this.statePath + ".tmp", JSON.stringify(this.jobs, null, 2));
    await rename(this.statePath + ".tmp", this.statePath);
  }
}
