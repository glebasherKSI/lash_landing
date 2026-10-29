import { db } from '../src/db/db.js';

// Миграции применяются при импорте db.js; здесь только сообщаем результат.
const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').pluck().all();
console.log(`Миграции применены: ${applied.join(', ')}`);
