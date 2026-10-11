import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";
import type { AgentJob, CatalogSnapshot, Requirement } from "../model.ts";
import { InlineRequirementEditor } from "./InlineRequirementEditor.ts";
import { RequirementTreeView } from "./RequirementTreeView.ts";

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
let requirements: Requirement[] = [];
let jobs: AgentJob[] = [];
let refreshing = false;
let refreshPending = false;
const editor = new InlineRequirementEditor(async requestBody => {
  if (jobs.some(job => ["running", "validating"].includes(job.status))) throw new Error("Wait for the current agent task or stop it before saving another requirement.");
  const job = await request<AgentJob>("/api/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  requirements = requirements.map(requirement => requirement.id === requestBody.requirementId ? { ...requirement, title: job.description } : requirement);
  return job;
});
const tree = new RequirementTreeView(element("tree"), editor);

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const result = await response.json();
  if (response.ok) return result;
  throw new Error(result.error);
}
function showMessage(message: string, style = "danger", kind = "action") {
  element("message").className = `alert alert-${style}`; element("message").textContent = message; element("message").dataset.kind = kind;
}
function renderTree() {
  tree.update(requirements, element<HTMLSelectElement>("project").value, element<HTMLInputElement>("search").value);
  element("edit-help").classList.toggle("d-none", !editor.retrieveDraft());
}
async function refresh() {
  refreshPending = true;
  if (!refreshing) {
    refreshing = true;
    try {
      while (refreshPending) {
        refreshPending = false;
        const snapshot = await request<CatalogSnapshot>("/api/catalog"); requirements = snapshot.requirements;
        const project = element<HTMLSelectElement>("project");
        const value = project.value || new URL(location.href).searchParams.get("project");
        const projects = [...new Set(requirements.map(requirement => requirement.project))].sort();
        if ([...project.options].map(option => option.value).join("\0") !== projects.join("\0")) {
          project.replaceChildren(...projects.map(name => { const option = document.createElement("option"); option.value = name; option.textContent = name; return option; }));
          project.value = value && projects.includes(value) ? value : projects[0] ?? "";
        }
        renderTree();
        if (snapshot.issues.length) showMessage(`${snapshot.issues.length} source files need review. ${snapshot.issues[0]}`, "warning");
      }
    } catch (error) { showMessage((error as Error).message); }
    finally { refreshing = false; }
  }
}
async function saveDescription() {
  const id = editor.retrieveDraft()?.requirement.id;
  const save = editor.save(); renderTree();
  try {
    if (await save) { showMessage("Saved. The agent is updating the test.", "info"); await refreshJobs(); }
  } catch (error) { showMessage((error as Error).message); }
  finally { renderTree(); tree.focusDescription(id); }
}
async function refreshJobs() {
  const current = await request<AgentJob[]>("/api/jobs");
  if (JSON.stringify(current) !== JSON.stringify(jobs)) {
    jobs = current;
    const expanded = new Set([...element("jobs").querySelectorAll<HTMLDetailsElement>("details[open]")].map(item => item.dataset.job));
    element("jobs").innerHTML = jobs.length ? `<h2 class="h6">Agent tasks</h2>${jobs.map(job => `<article class="border rounded p-3 mb-2"><div class="d-flex justify-content-between gap-2"><strong class="small">${escape(job.description)}</strong><span class="badge text-bg-${job.status === "verified" ? "success" : job.status === "failed" ? "danger" : "secondary"}">${job.status}</span></div>${job.summary ? `<p class="small mt-2 mb-0">${escape(job.summary)}</p>` : ""}<details class="mt-2" data-job="${job.id}" ${expanded.has(job.id) ? "open" : ""}><summary class="small">Task and execution log</summary><pre>${escape(job.prompt)}</pre><pre>${escape(job.log || "Starting agent…")}</pre></details>${["running", "validating"].includes(job.status) ? `<button class="btn btn-outline-secondary btn-sm mt-2" data-stop="${job.id}">Stop task</button>` : ""}</article>`).join("")}` : "";
  }
}

element("tree").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-requirement]");
  if (button) {
    const requirement = requirements.find(item => item.id === button.dataset.requirement);
    if (requirement) {
      try { editor.begin(requirement); element("message").classList.add("d-none"); renderTree(); tree.focusDescription(); }
      catch (error) { showMessage((error as Error).message); }
    }
  }
});
element("tree").addEventListener("input", event => {
  const input = event.target as HTMLInputElement;
  if (input.classList.contains("requirement-input")) editor.update(input.value);
});
element("tree").addEventListener("keydown", event => {
  if ((event.target as HTMLElement).classList.contains("requirement-input") && !event.isComposing) {
    if (event.key === "Enter") { event.preventDefault(); void saveDescription(); }
    else if (event.key === "Escape") { event.preventDefault(); const id = editor.retrieveDraft()?.requirement.id; editor.cancel(); renderTree(); tree.focusDescription(id); }
  }
});
element("search").addEventListener("input", renderTree);
element("project").addEventListener("change", () => {
  tree.collapsed.clear(); renderTree();
  const url = new URL(location.href); url.searchParams.set("project", element<HTMLSelectElement>("project").value); history.replaceState({}, "", url);
});
element("expand").addEventListener("click", () => tree.expand());
element("collapse").addEventListener("click", () => tree.collapse());
element("jobs").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-stop]");
  if (button) void request("/api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: button.dataset.stop }) }).then(refreshJobs).catch(error => showMessage(error.message));
});
let updates: EventSource;
function connectUpdates() {
  updates?.close(); updates = new EventSource("/api/events");
  updates.addEventListener("catalog", () => void refresh());
  updates.addEventListener("source-error", event => showMessage(JSON.parse((event as MessageEvent).data).message, "warning"));
  updates.addEventListener("error", () => showMessage("Reconnecting to live updates…", "warning", "connection"));
  updates.addEventListener("open", () => { if (element("message").dataset.kind === "connection") element("message").classList.add("d-none"); });
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void refresh(); void refreshJobs().catch(error => showMessage(error.message)); } });
window.addEventListener("pagehide", () => updates.close());
window.addEventListener("pageshow", event => { if (event.persisted) connectUpdates(); });
connectUpdates();
void refreshJobs().catch(error => showMessage(error.message));
setInterval(() => { if (document.visibilityState === "visible") void refreshJobs().catch(error => showMessage(error.message)); }, 2000);
