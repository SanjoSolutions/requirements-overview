import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { RequirementCatalog } from "./RequirementCatalog.ts";

export type CatalogUpdate = { type: "catalog" } | { type: "source-error"; message: string };

/** Watches source files and publishes one refreshed catalog for each settled batch. */
export class CatalogUpdates {
  private readonly catalog: RequirementCatalog;
  private readonly listeners = new Set<(update: CatalogUpdate) => void>();
  private watcher?: FSWatcher;
  private timer?: ReturnType<typeof setTimeout>;
  private pending = false;
  private refreshing = false;
  private active = false;

  constructor(catalog: RequirementCatalog) { this.catalog = catalog; }

  start() {
    this.active = true;
    this.watcher = watch(this.catalog.root, { recursive: true }, (_event, path) => {
      if (path && this.catalog.isRelevantPath(path.toString())) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.refresh(), 200);
      }
    });
    this.watcher.on("error", error => this.notify({ type: "source-error", message: error.message }));
  }

  subscribe(listener: (update: CatalogUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
    this.watcher?.close();
    this.listeners.clear();
  }

  private async refresh() {
    this.pending = true;
    if (this.active && !this.refreshing) {
      this.refreshing = true;
      try {
        while (this.pending && this.active) {
          this.pending = false;
          await this.catalog.retrieveSnapshot(true);
          if (this.active && !this.pending) this.notify({ type: "catalog" });
        }
      } catch (error) { if (this.active) this.notify({ type: "source-error", message: (error as Error).message }); }
      finally { this.refreshing = false; }
    }
  }

  private notify(update: CatalogUpdate) { for (const listener of this.listeners) listener(update); }
}
