export interface ValidationCommand {
  command: string;
  arguments: string[];
  cwd: string;
}

export interface SourceContext {
  path: string;
  absolutePath: string;
  source: string;
  projectDirectory: string;
  project: string;
  defaultFramework?: string;
}

export interface Requirement {
  id: string;
  framework: string;
  project: string;
  path: string;
  title: string;
  suites: string[];
  line: number;
  editorUrl?: string;
  range: { start: number; end: number };
  sourceFingerprint: string;
  implementationFingerprint: string;
  editable: boolean;
  status: string;
  syntax: "javascript" | "godot" | "cpp" | "annotation";
  template?: boolean;
  variant?: string;
  annotationPrefix?: string;
  insertAnnotation?: boolean;
  validation?: ValidationCommand[];
  validationIssue?: string;
}

export interface RequirementTree {
  id: string;
  title: string;
  kind: "root" | "project" | "file" | "suite" | "requirement";
  count: number;
  requirement?: Requirement;
  children: RequirementTree[];
}

export interface CatalogSnapshot {
  tree: RequirementTree;
  requirements: Requirement[];
  frameworks: { id: string; label: string; count: number }[];
  issues: string[];
  scannedAt: string;
}

export interface ChangeRequest {
  requirementId: string;
  sourceFingerprint: string;
  description: string;
}

export interface AgentJob {
  id: string;
  requirement: Requirement;
  description: string;
  prompt: string;
  status: "running" | "validating" | "verified" | "failed" | "interrupted";
  createdAt: string;
  updatedAt: string;
  log: string;
  summary?: string;
}
