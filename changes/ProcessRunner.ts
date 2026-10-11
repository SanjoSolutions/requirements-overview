import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { ValidationCommand } from "../model.ts";

export interface ProcessResult { exitCode: number; output: string }
export interface ProcessExecutor {
  run(command: ValidationCommand, options?: { input?: string; signal?: AbortSignal; duration?: number; onOutput?: (output: string) => void }): Promise<ProcessResult>;
}

export class ProcessRunner implements ProcessExecutor {
  run(command: ValidationCommand, options: { input?: string; signal?: AbortSignal; duration?: number; onOutput?: (output: string) => void } = {}): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command.command, command.arguments, { cwd: command.cwd, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      let timedOut = false;
      const stop = () => {
        if (child.pid) {
          if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          else { try { process.kill(-child.pid, "SIGTERM"); } catch { /* The process group has completed. */ } }
        }
      };
      // Execution duration is in seconds.
      const timer = setTimeout(() => { timedOut = true; stop(); }, (options.duration ?? 1800) * 1000);
      const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", stop); };
      options.signal?.addEventListener("abort", stop, { once: true });
      const receive = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        output = (output + text).slice(-160_000);
        options.onOutput?.(text);
      };
      child.stdout.on("data", receive);
      child.stderr.on("data", receive);
      child.stdin.on("error", () => { /* Spawn errors and process exits supply the result. */ });
      child.on("error", error => { cleanup(); reject(error); });
      child.on("close", code => {
        cleanup();
        if (timedOut) reject(new Error("Execution reached its time limit. Review the log and continue the task."));
        else if (options.signal?.aborted) reject(new Error("The agent task was stopped. Review the working-tree changes."));
        else resolve({ exitCode: code ?? 1, output });
      });
      child.stdin.end(options.input ?? "");
      if (options.signal?.aborted) stop();
    });
  }
}

export function retrieveCodexCommand(root: string): ValidationCommand {
  if (process.env.REQUIREMENTS_CODEX_EXECUTABLE) {
    return { command: process.env.REQUIREMENTS_CODEX_EXECUTABLE, arguments: ["exec", "--sandbox", "workspace-write", "--json", "-"], cwd: root };
  }
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const entry = join(directory, "node_modules", "@openai", "codex", "bin", "codex.js");
    if (existsSync(entry)) return { command: process.execPath, arguments: [entry, "exec", "--sandbox", "workspace-write", "--json", "-"], cwd: root };
  }
  return { command: "codex", arguments: ["exec", "--sandbox", "workspace-write", "--json", "-"], cwd: root };
}
