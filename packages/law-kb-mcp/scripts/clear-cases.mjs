import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('data/laws.db');
db.exec('DELETE FROM case_chunks; DELETE FROM cases;');
try { db.exec("DELETE FROM sqlite_sequence WHERE name IN ('cases','case_chunks')"); } catch {}
const n = db.prepare('SELECT COUNT(*) as n FROM cases').get().n;
console.log('cases after clear:', n);
