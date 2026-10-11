import type { Requirement, RequirementTree } from "../model.ts";
import { InlineRequirementEditor } from "./InlineRequirementEditor.ts";
import { RequirementOutline } from "./RequirementOutline.ts";

const editorIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>';

/** Reuses tree nodes so live updates preserve editing focus and expanded suites. */
export class RequirementTreeView {
  readonly collapsed = new Set<string>();
  private readonly container: HTMLElement;
  private readonly editor: InlineRequirementEditor;
  private readonly outline = new RequirementOutline();
  private requirements: Requirement[] = [];
  private project = "";
  private query = "";
  private composing = false;
  constructor(container: HTMLElement, editor: InlineRequirementEditor) {
    this.container = container; this.editor = editor;
    container.addEventListener("compositionstart", () => { this.composing = true; });
    container.addEventListener("compositionend", () => { this.composing = false; this.render(); });
    container.addEventListener("toggle", event => {
      const details = event.target as HTMLDetailsElement;
      if (details.dataset.node && !this.query) {
        if (details.open) this.collapsed.delete(details.dataset.node);
        else this.collapsed.add(details.dataset.node);
      }
    }, true);
  }
  update(requirements: Requirement[], project: string, query: string) {
    this.requirements = requirements; this.project = project; this.query = query.toLowerCase(); this.render();
  }
  expand() { this.collapsed.clear(); this.render(); }
  collapse() { this.container.querySelectorAll<HTMLDetailsElement>("details").forEach(details => { this.collapsed.add(details.dataset.node!); details.open = false; }); }
  focusDescription(id?: string) {
    const input = this.container.querySelector<HTMLInputElement>(".requirement-input");
    if (input) { input.focus({ preventScroll: true }); input.select(); }
    else if (id) this.container.querySelector<HTMLButtonElement>(`[data-requirement="${id}"]`)?.focus({ preventScroll: true });
  }
  render() {
    if (!this.composing) {
      const scroll = this.container.scrollTop;
      const active = document.activeElement as HTMLElement | null;
      const draft = this.editor.retrieveDraft();
      const matching = this.requirements.filter(requirement => requirement.project === this.project
        && [requirement.title, requirement.path, ...requirement.suites].join(" ").toLowerCase().includes(this.query));
      if (draft?.requirement.project === this.project && !matching.some(requirement => requirement.id === draft.requirement.id)) matching.push(draft.requirement);
      const tree = this.outline.retrieveTree(matching, this.project);
      const existing = new Map([...this.container.querySelectorAll<HTMLLIElement>("[data-tree-node]")].map(item => [item.dataset.treeNode!, item]));
      let list = this.container.querySelector<HTMLUListElement>(":scope > ul");
      if (!list) { list = document.createElement("ul"); this.container.replaceChildren(list); }
      const renderNode = (node: RequirementTree): HTMLLIElement => {
        const item = existing.get(node.id) ?? document.createElement("li"); item.dataset.treeNode = node.id;
        if (node.requirement) {
          this.renderRequirement(item, node.requirement);
        } else {
          let details = item.querySelector<HTMLDetailsElement>(":scope > details");
          if (!details) { details = document.createElement("details"); details.append(document.createElement("summary"), document.createElement("ul")); item.append(details); }
          details.dataset.node = node.id;
          const summary = details.querySelector("summary")!;
          if (summary.textContent !== node.title) summary.textContent = node.title;
          details.open = Boolean(this.query) || !this.collapsed.has(node.id);
          this.reconcile(details.querySelector("ul")!, node.children.map(renderNode));
        }
        return item;
      };
      this.reconcile(list, tree.children.map(renderNode)); this.container.scrollTop = scroll;
      if (active?.isConnected && document.activeElement !== active) active.focus({ preventScroll: true });
    }
  }
  private renderRequirement(row: HTMLLIElement, requirement: Requirement) {
    const draft = this.editor.retrieveDraft(); const editing = draft?.requirement.id === requirement.id;
    row.className = `requirement-row${editing ? " editing" : ""}`;
    let description = row.querySelector<HTMLInputElement | HTMLButtonElement>(".requirement, .requirement-input");
    if (!description || (description instanceof HTMLInputElement) !== editing) {
      const replacement = document.createElement(editing ? "input" : "button");
      if (description) description.replaceWith(replacement); else row.prepend(replacement);
      description = replacement;
      if (replacement instanceof HTMLInputElement) {
        replacement.className = "requirement-input form-control form-control-sm"; replacement.value = draft!.description; replacement.maxLength = 2000;
        replacement.setAttribute("aria-label", "Requirement description"); replacement.setAttribute("aria-describedby", "edit-help");
      } else {
        replacement.className = "requirement"; replacement.dataset.requirement = requirement.id;
        replacement.title = requirement.editable ? "Edit requirement" : "Open this computed description in VS Code";
      }
    }
    if (description instanceof HTMLInputElement) description.readOnly = draft!.saving;
    else if (description.textContent !== requirement.title) description.textContent = requirement.title;
    if (requirement.editorUrl) {
      let link = row.querySelector<HTMLAnchorElement>(".open-in-editor");
      if (!link) { link = document.createElement("a"); link.className = "open-in-editor"; link.innerHTML = editorIcon; row.append(link); }
      link.href = requirement.editorUrl; link.title = "Open in VS Code"; link.setAttribute("aria-label", `Open ${requirement.title} in VS Code`);
    }
  }
  private reconcile(parent: HTMLElement, children: HTMLElement[]) {
    let position = parent.firstElementChild;
    for (const child of children) {
      if (child === position) position = position.nextElementSibling;
      else parent.insertBefore(child, position);
    }
    while (position) { const following = position.nextElementSibling; position.remove(); position = following; }
  }
}
