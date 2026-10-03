import * as http from "node:http";
import * as net from "node:net";
import * as path from "node:path";
import { CalendarError } from "./calendar";
import { HistoryStore } from "./db";
import { CalendarService } from "./service";

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function sendError(res: http.ServerResponse, e: unknown): void {
  if (e instanceof CalendarError) {
    sendJson(res, 400, { error: { code: e.code, message: e.message } });
  } else {
    sendJson(res, 500, {
      error: { code: "INTERNAL", message: e instanceof Error ? e.message : String(e) },
    });
  }
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CalendarError("BAD_REQUEST", "请求体必须是合法 JSON");
  }
}

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
  });
}

export interface ServerOptions {
  port?: number;
  dbPath?: string;
}

export async function startServer(opts: ServerOptions = {}): Promise<{
  server: http.Server;
  port: number;
  store: HistoryStore;
}> {
  const dbPath =
    opts.dbPath ?? path.join(__dirname, "..", "data", "calendar.db");
  const store = new HistoryStore(dbPath);
  const service = new CalendarService(store);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;
    try {
      if (route === "GET /health") {
        return sendJson(res, 200, { status: "ok" });
      }
      if (route === "POST /api/validate") {
        const b = await readBody(req);
        return sendJson(res, 200, service.validate(b.mode, b.date));
      }
      if (route === "POST /api/convert") {
        const b = await readBody(req);
        return sendJson(res, 200, service.convert(b.from, b.to, b.date));
      }
      if (route === "POST /api/add-days") {
        const b = await readBody(req);
        return sendJson(res, 200, service.addDays(b.mode, b.date, b.days));
      }
      if (route === "POST /api/diff-days") {
        const b = await readBody(req);
        return sendJson(res, 200, service.diffDays(b.mode, b.from, b.to));
      }
      if (route === "POST /api/weekday") {
        const b = await readBody(req);
        return sendJson(res, 200, service.weekday(b.mode, b.date));
      }
      if (route === "POST /api/month-dates") {
        const b = await readBody(req);
        return sendJson(res, 200, service.monthDates(b.mode, b.year, b.month));
      }
      if (route === "GET /api/history") {
        const limit = Number(url.searchParams.get("limit") ?? "50");
        return sendJson(res, 200, { items: store.list(limit) });
      }
      if (req.method === "GET" && url.pathname.startsWith("/api/history/")) {
        const id = Number(url.pathname.split("/").pop());
        const row = store.get(id);
        if (!row) {
          return sendJson(res, 404, {
            error: { code: "NOT_FOUND", message: `没有 id=${id} 的历史记录` },
          });
        }
        return sendJson(res, 200, row);
      }
      return sendJson(res, 404, {
        error: { code: "NOT_FOUND", message: `未知路由 ${route}` },
      });
    } catch (e) {
      return sendError(res, e);
    }
  });

  const port = opts.port && opts.port > 0 ? opts.port : await findFreePort();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return { server, port, store };
}

if (require.main === module) {
  const portArg = process.env.PORT ? Number(process.env.PORT) : 0;
  startServer({ port: portArg }).then(({ port }) => {
    console.log(`历法换算服务已启动: http://127.0.0.1:${port}`);
  });
}
