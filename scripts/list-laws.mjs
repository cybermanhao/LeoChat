import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'os';
const db = new DatabaseSync(homedir() + '/.leochat-for-law/law.db');
const laws = db.prepare('SELECT title, category FROM laws ORDER BY category, title').all();
const byCategory = {};
for (const l of laws) {
  const cat = l.category ?? '未分类';
  byCategory[cat] = byCategory[cat] ?? [];
  byCategory[cat].push(l.title);
}
for (const [cat, titles] of Object.entries(byCategory)) {
  console.log('\n[' + cat + '] (' + titles.length + '部)');
  titles.forEach(t => console.log('  ' + t));
}
console.log('\n总计: ' + laws.length + ' 部');
