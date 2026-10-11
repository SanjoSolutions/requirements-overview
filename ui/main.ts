import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";
import type { AgentJob, CatalogSnapshot, Requirement, RequirementTree } from "../model.ts";

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
let snapshot: CatalogSnapshot;
let selected: Requirement | undefined;
const expanded = new Set<string>();
let jobs: AgentJob[] = [];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  const result = await response.json();
  if (response.ok) return result;
  throw new Error(result.error);
}

function showMessage(message: string, style = "danger") {
  element("message").className = `alert alert-${style}`;
  element("message").textContent = message;
}

function renderTree() {
  const query = element<HTMLInputElement>("search").value.toLowerCase();
  const framework = element<HTMLSelectElement>("framework").value;
  const matching = snapshot.requirements.filter(item => (!framework || item.framework === framework)
    && [item.title, item.path, ...item.suites].join(" ").toLowerCase().includes(query));
  const identifiers = new Set(matching.map(item => item.id));
  const visible = (node: RequirementTree): boolean => node.requirement ? identifiers.has(node.id) : node.children.some(visible);
  const count = (node: RequirementTree): number => node.requirement ? Number(identifiers.has(node.id)) : node.children.reduce((sum, child) => sum + count(child), 0);
  const render = (node: RequirementTree): string => node.requirement
    ? `<li><button class="requirement ${selected?.id === node.id ? "selected" : ""}" data-requirement="${node.id}"><span class="test-mark">${node.requirement.status === "skipped" ? "○" : "•"}</span><span>${escape(node.title)}</span><span class="framework-label">${escape(node.requirement.framework)}</span></button></li>`
    : `<li><details data-node="${escape(node.id)}" ${expanded.has(node.id) || query || framework ? "open" : ""}><summary>${escape(node.title)} <span class="text-secondary small">${count(node)}</span></summary><ul>${node.children.filter(visible).map(render).join("")}</ul></details></li>`;
  element("tree").innerHTML = matching.length ? `<ul>${snapshot.tree.children.filter(visible).map(render).join("")}</ul>` : '<p class="text-secondary mb-0">Matching requirements appear here.</p>';
  element("summary").textContent = `${matching.length.toLocaleString()} of ${snapshot.requirements.length.toLocaleString()} test descriptions · ${snapshot.frameworks.filter(item => item.count).length} frameworks`;
}

async function selectRequirement(id: string) {
  selected = snapshot.requirements.find(item => item.id === id);
  if (selected) {
    const requirement = selected;
    renderTree();
    element("editor").innerHTML = `<div class="text-secondary small mb-2">${escape(requirement.framework)} · ${escape(requirement.path)}:${requirement.line}</div><h2 class="h6">${escape(requirement.suites.join(" › ") || "Requirement")}</h2><form id="edit-form"><label for="description" class="form-label small">Test description</label><textarea id="description" rows="4" class="form-control" ${requirement.editable ? "" : "readonly"}>${escape(requirement.title)}</textarea><div class="text-secondary small mt-2">${requirement.template ? "Template description. The test runner expands its cases. " : ""}${requirement.editable ? "The agent updates the test and affected implementation, then runs validation." : "Open the source to edit this computed description."}</div><div class="d-flex justify-content-end gap-2 mt-3"><button class="btn btn-outline-secondary btn-sm" type="button" id="preview-task">Preview task</button><button class="btn btn-primary btn-sm" type="submit" id="apply" disabled>Apply with agent</button></div></form>${requirement.validationIssue ? `<p class="small text-secondary mt-3">${escape(requirement.validationIssue)}</p>` : ""}<details class="mt-4"><summary class="small">Source</summary><pre id="source" class="mt-2">Loading…</pre></details><pre id="task-preview" class="mt-3 d-none"></pre>`;
    const result = await request<{ source: string }>(`/api/source?id=${id}`);
    if (selected?.id === id) element("source").textContent = result.source;
    element("preview-task").addEventListener("click", () => void previewTask().catch(error => showMessage(error.message)));
    element("edit-form").addEventListener("submit", event => { event.preventDefault(); void applyChange().catch(error => showMessage(error.message)); });
    element("description").addEventListener("input", updateApplyButton);
    updateApplyButton();
  }
}

function updateApplyButton() {
  const button = document.getElementById("apply") as HTMLButtonElement | null;
  if (button) button.disabled = !selected?.editable || !selected.validation?.length || element<HTMLTextAreaElement>("description").value.trim() === selected.title || jobs.some(item => ["running", "validating"].includes(item.status));
}

function changeRequest() {
  return { requirementId: selected!.id, sourceFingerprint: selected!.sourceFingerprint, description: element<HTMLTextAreaElement>("description").value };
}

async function previewTask() {
  const result = await request<{ prompt: string }>("/api/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changeRequest()) });
  element("task-preview").textContent = result.prompt;
  element("task-preview").classList.remove("d-none");
}

async function applyChange() {
  element<HTMLButtonElement>("apply").disabled = true;
  try {
    await request<AgentJob>("/api/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changeRequest()) });
    showMessage("The agent is updating this requirement. Follow its task below.", "info");
    await refreshJobs();
  } finally { updateApplyButton(); }
}

async function refreshJobs() {
  const previous = jobs;
  jobs = await request<AgentJob[]>("/api/jobs");
  const completed = jobs.some(job => ["verified", "failed", "interrupted"].includes(job.status) && previous.some(item => item.id === job.id && ["running", "validating"].includes(item.status)));
  element("jobs").innerHTML = jobs.length ? `<h2 class="h6">Agent tasks</h2>${jobs.map(job => `<article class="border rounded p-3 mb-2"><div class="d-flex justify-content-between gap-2"><strong class="small">${escape(job.description)}</strong><span class="badge text-bg-${job.status === "verified" ? "success" : job.status === "failed" ? "danger" : "secondary"}">${job.status}</span></div>${job.summary ? `<p class="small mt-2 mb-0">${escape(job.summary)}</p>` : ""}<details class="mt-2"><summary class="small">Task and execution log</summary><pre>${escape(job.prompt)}</pre><pre>${escape(job.log || "Starting agent…")}</pre></details>${["running", "validating"].includes(job.status) ? `<button class="btn btn-outline-secondary btn-sm mt-2" data-stop="${job.id}">Stop task</button>` : ""}</article>`).join("")}` : "";
  updateApplyButton();
  if (completed) {
    await refresh(true);
    if (selected) {
      const current = snapshot.requirements.find(item => item.id === selected!.id);
      if (current) await selectRequirement(current.id);
    }
  }
}

async function refresh(force = false) {
  element<HTMLButtonElement>("refresh").disabled = true;
  try {
    snapshot = await request<CatalogSnapshot>(`/api/catalog${force ? "?refresh=1" : ""}`);
    const framework = element<HTMLSelectElement>("framework");
    const value = framework.value;
    framework.innerHTML = '<option value="">All frameworks</option>' + snapshot.frameworks.map(item => `<option value="${item.id}">${escape(item.label)} (${item.count})</option>`).join("");
    framework.value = value;
    renderTree();
    if (snapshot.issues.length) showMessage(`${snapshot.issues.length} source files need review. ${snapshot.issues[0]}`, "warning");
  } catch (error) { showMessage((error as Error).message); }
  finally { element<HTMLButtonElement>("refresh").disabled = false; }
}

element("tree").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-requirement]");
  if (button) void selectRequirement(button.dataset.requirement!).catch(error => showMessage(error.message));
});
element("tree").addEventListener("toggle", event => {
  const details = event.target as HTMLDetailsElement;
  if (details.dataset.node) {
    if (details.open) expanded.add(details.dataset.node);
    else expanded.delete(details.dataset.node);
  }
}, true);
element("search").addEventListener("input", renderTree);
element("framework").addEventListener("change", renderTree);
element("refresh").addEventListener("click", () => void refresh(true));
element("expand").addEventListener("click", () => { document.querySelectorAll<HTMLDetailsElement>("#tree details").forEach(item => { item.open = true; expanded.add(item.dataset.node!); }); });
element("collapse").addEventListener("click", () => { expanded.clear(); document.querySelectorAll<HTMLDetailsElement>("#tree details").forEach(item => { item.open = false; }); });
element("export").addEventListener("click", () => {
  const outline = (node: RequirementTree, depth: number): string => `${"  ".repeat(depth)}- ${node.title}\n${node.children.map(child => outline(child, depth + 1)).join("")}`;
  const url = URL.createObjectURL(new Blob([outline(snapshot.tree, 0)], { type: "text/markdown" }));
  const link = document.createElement("a"); link.href = url; link.download = "test-requirements.md"; link.click(); URL.revokeObjectURL(url);
});
element("jobs").addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-stop]");
  if (button) void request("/api/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: button.dataset.stop }) }).then(refreshJobs).catch(error => showMessage(error.message));
});
void refresh();
void refreshJobs().catch(error => showMessage(error.message));
setInterval(() => { if (document.visibilityState === "visible") void refreshJobs().catch(error => showMessage(error.message)); }, 2000);
