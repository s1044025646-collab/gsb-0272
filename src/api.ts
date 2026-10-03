import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { CalError } from './calendar.js';
import { DateService } from './service.js';

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new CalError('BAD_REQUEST', '请求体必须是合法 JSON');
  }
}

function send(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

export function createApp(service: DateService) {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return send(res, 200, { ok: true, service: 'datecal', algorithm: 'hinnant-civil-v1' });
      }
      if (req.method === 'GET' && url.pathname === '/api/month') {
        return send(res, 200, service.month(Object.fromEntries(url.searchParams)));
      }
      if (req.method === 'GET' && url.pathname === '/api/history') {
        const limit = Number(url.searchParams.get('limit') ?? 50);
        return send(res, 200, { history: service.history(limit) });
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        switch (url.pathname) {
          case '/api/validate':
            return send(res, 200, service.validate(body));
          case '/api/convert':
            return send(res, 200, service.convert(body));
          case '/api/add':
            return send(res, 200, service.add(body));
          case '/api/diff':
            return send(res, 200, service.diff(body));
          case '/api/weekday':
            return send(res, 200, service.weekday(body));
        }
      }
      send(res, 404, { error: { code: 'NOT_FOUND', message: `${req.method} ${url.pathname} 不存在` } });
    } catch (e) {
      if (e instanceof CalError) {
        send(res, 400, { error: { code: e.code, message: e.message } });
      } else {
        send(res, 500, { error: { code: 'INTERNAL', message: String(e) } });
      }
    }
  });
}

/** port 缺省为 0，即让操作系统分配空闲端口 */
export function startServer(service: DateService, port = 0): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const server = createApp(service);
    server.listen(port, () => {
      const addr = server.address();
      const actual = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: actual, close: () => server.close() });
    });
  });
}
