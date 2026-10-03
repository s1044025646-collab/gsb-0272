import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";

export interface HistoryRow {
  id: number;
  operation: string;
  mode: string;
  algorithm_version: string;
  request_json: string;
  result_json: string;
  status: string;
  error_code: string | null;
  created_at: string;
}

export class HistoryStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        mode TEXT NOT NULL,
        algorithm_version TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        created_at TEXT NOT NULL
      )
    `);
  }

  record(entry: {
    operation: string;
    mode: string;
    algorithmVersion: string;
    request: unknown;
    result: unknown;
    status: "ok" | "error";
    errorCode?: string | null;
  }): number {
    const stmt = this.db.prepare(
      `INSERT INTO conversions
        (operation, mode, algorithm_version, request_json, result_json, status, error_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const info = stmt.run(
      entry.operation,
      entry.mode,
      entry.algorithmVersion,
      JSON.stringify(entry.request),
      JSON.stringify(entry.result),
      entry.status,
      entry.errorCode ?? null,
      new Date().toISOString()
    );
    return Number(info.lastInsertRowid);
  }

  list(limit = 50): HistoryRow[] {
    return this.db
      .prepare(`SELECT * FROM conversions ORDER BY id DESC LIMIT ?`)
      .all(limit) as unknown as HistoryRow[];
  }

  get(id: number): HistoryRow | undefined {
    return this.db.prepare(`SELECT * FROM conversions WHERE id = ?`).get(id) as
      | HistoryRow
      | undefined;
  }

  close(): void {
    this.db.close();
  }
}
