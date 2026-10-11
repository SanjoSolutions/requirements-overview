import type { Requirement, RequirementTree } from "../model.ts";

/** Groups source descriptions into the requirement outline for one project. */
export class RequirementOutline {
  retrieveTree(requirements: Requirement[], project: string): RequirementTree {
    const root: RequirementTree = { id: "outline", title: project, kind: "root", count: 0, children: [] };
    for (const requirement of requirements) {
      if (requirement.project === project) {
        root.count++;
        let parent = root;
        const suitePath: string[] = [];
        for (const title of requirement.suites) {
          suitePath.push(title);
          const id = `suite:${JSON.stringify(suitePath)}`;
          let suite = parent.children.find(item => item.id === id);
          if (!suite) {
            suite = { id, title, kind: "suite", count: 0, children: [] };
            parent.children.push(suite);
          }
          suite.count++;
          parent = suite;
        }
        parent.children.push({ id: requirement.id, title: requirement.title, kind: "requirement", count: 1, requirement, children: [] });
      }
    }
    return root;
  }
}
