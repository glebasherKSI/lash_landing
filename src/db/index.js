import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ROOT } from '../config.js';

const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

export const openDatabase = (file) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
};

export const migrate = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const pending = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql') && !applied.has(name))
    .sort();

  for (const name of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
    })();
    console.log(`migration applied: ${name}`);
  }
  return pending;
};
