import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALGORITHM_VERSION } from './calendar.js';

const here = dirname(fileURLToPath(import.meta.url));
/** 项目内数据目录，可用环境变量 DATECAL_DATA_DIR 覆盖 */
export const DATA_DIR = process.env.DATECAL_DATA_DIR ?? join(here, '..', 'data');

export class HistoryStore {
  private db: DatabaseSync;

  constructor(dbPath = join(DATA_DIR, 'datecal.db')) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT NOT NULL
      )
    `);
  }

  record(kind: string, mode: string, request: unknown, result: unknown) {
    this.db
      .prepare(
        'INSERT INTO operations (ts, kind, mode, algorithm_version, request_json, result_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(new Date().toISOString(), kind, mode, ALGORITHM_VERSION, JSON.stringify(request), JSON.stringify(result));
  }

  list(limit = 50) {
    const rows = this.db
      .prepare('SELECT * FROM operations ORDER BY id DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind,
      mode: r.mode,
      algorithmVersion: r.algorithm_version,
      request: JSON.parse(r.request_json),
      result: JSON.parse(r.result_json),
    }));
  }

  close() {
    this.db.close();
  }
}
