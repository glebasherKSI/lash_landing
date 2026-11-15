// Приводит телефоны в уже сохранённых записях к виду «+375291234567» (один раз после обновления).
// Не белорусские номера и ники Telegram остаются как есть. Запуск: node scripts/normalize-phones.js
import { db } from '../src/db/db.js';
import { normalizePhone } from '../public/js/modules/phone.js';

const update = db.prepare('UPDATE bookings SET contact = ? WHERE id = ?');
let changed = 0;
let skipped = 0;
db.transaction(() => {
  for (const { id, contact } of db.prepare('SELECT id, contact FROM bookings').all()) {
    const phone = normalizePhone(contact);
    if (!phone) skipped += 1;
    else if (phone !== contact) {
      update.run(phone, id);
      changed += 1;
    }
  }
})();
console.log(`Номеров приведено к стандарту: ${changed}. Оставлено как есть (не белорусские или Telegram): ${skipped}.`);
