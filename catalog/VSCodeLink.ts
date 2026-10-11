import { pathToFileURL } from "node:url";

export class VSCodeLink {
  retrieveUrl(absolutePath: string, line: number): string {
    return `vscode://file${pathToFileURL(absolutePath).pathname}:${line}:1`;
  }
}
