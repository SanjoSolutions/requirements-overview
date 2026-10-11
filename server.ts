import { createServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { RequirementCatalog } from "./catalog/RequirementCatalog.ts";
import { CatalogUpdates } from "./catalog/CatalogUpdates.ts";
import { RequirementChanges } from "./changes/RequirementChanges.ts";
import type { ChangeRequest } from "./model.ts";

export class RequirementsApi {
  readonly catalog: RequirementCatalog;
  readonly changes: RequirementChanges;
  readonly updates: CatalogUpdates;
  private readonly streams = new Set<ServerResponse>();
  constructor(catalog: RequirementCatalog, changes = new RequirementChanges(catalog), updates = new CatalogUpdates(catalog)) {
    this.catalog = catalog; this.changes = changes; this.updates = updates;
  }
  closeStreams() { for (const response of this.streams) response.end(); }
  async handle(request: IncomingMessage, response: ServerResponse) {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(value));
    };
    try {
      const host = request.headers.host ?? "";
      const url = new URL(request.url ?? "/", `http://${host}`);
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || (request.headers.origin && request.headers.origin !== url.origin)) {
        send(403, { error: "Open this app through its local address." });
      } else if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
        this.streams.add(response);
        const unsubscribe = this.updates.subscribe(update => { response.write(`event: ${update.type}\ndata: ${JSON.stringify(update)}\n\n`); });
        const heartbeat = setInterval(() => response.write(": connected\n\n"), 15_000);
        response.on("close", () => { clearInterval(heartbeat); unsubscribe(); this.streams.delete(response); });
        response.write('event: catalog\ndata: {"type":"catalog"}\n\n');
      } else if (request.method === "GET" && url.pathname === "/api/catalog") {
        send(200, await this.catalog.retrieveSnapshot(url.searchParams.has("refresh")));
      } else if (request.method === "GET" && url.pathname === "/api/source") {
        const requirement = await this.catalog.retrieveRequirement(url.searchParams.get("id") ?? "");
        send(200, { source: await this.catalog.retrieveSource(requirement) });
      } else if (request.method === "POST" && url.pathname === "/api/changes") {
        if (request.headers["content-type"] !== "application/json") throw new Error("Send this change as JSON.");
        const body = await this.readBody(request) as ChangeRequest;
        send(200, await this.changes.apply(body));
      } else {
        send(404, { error: "Choose an available action." });
      }
    } catch (error) { send(400, { error: (error as Error).message }); }
  }
  private async readBody(request: IncomingMessage): Promise<unknown> {
    let body = "";
    for await (const chunk of request) {
      body += chunk.toString("utf8");
      if (body.length > 32_000) throw new Error("Keep the requirement change within the supported size.");
    }
    return JSON.parse(body);
  }
}

export async function startServer(root = process.cwd(), port = 3110) {
  const catalog = new RequirementCatalog(root);
  const api = new RequirementsApi(catalog);
  api.updates.start();
  const server = await createServer({
    root: import.meta.dirname, configFile: false,
    server: { host: "127.0.0.1", port, strictPort: true, fs: { deny: ["**/.state/**", "**/.git/**", "**/.env*"] } },
    plugins: [{ name: "requirements-overview-api", hotUpdate(context) {
      if (catalog.isRelevantPath(context.file)) return [];
    }, configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        if (request.url?.startsWith("/api/")) void api.handle(request, response);
        else next();
      });
    } }],
  });
  await server.listen();
  server.printUrls();
  const close = async () => {
    api.updates.stop(); api.closeStreams();
    await server.close();
  };
  const handleSignal = () => void close();
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  server.httpServer?.once("close", () => {
    api.updates.stop(); api.closeStreams();
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
  });
  return server;
}
