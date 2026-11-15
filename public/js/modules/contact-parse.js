// Разбор вставленного текста вроде «Аня +375 29 123-45-67» или «@anya_lash Аня» на имя и контакт.
// Общий для админки (быстрая запись) и теста в test/contact-parse.test.js.

const PHONE_RE = /\+?\d[\d\s()\-]{6,}\d/;
const TELEGRAM_RE = /@[A-Za-z][A-Za-z0-9_]{3,31}/;

export const parseContact = (text) => {
  const source = String(text ?? '').trim();
  const phone = source.match(PHONE_RE)?.[0];
  const telegram = phone ? null : source.match(TELEGRAM_RE)?.[0];
  const contactRaw = phone ?? telegram ?? '';
  const contact = phone ? (phone.trim().startsWith('+') ? '+' : '') + phone.replace(/\D/g, '') : contactRaw;
  // Имя — то, что осталось после контакта: первая строка без служебных слов и знаков
  const name = source
    .replace(contactRaw, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/(тел(ефон)?|phone|telegram|тг)\s*[:.]?/gi, ' ').replace(/[,;:|•—–-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? '';
  return { name: name.slice(0, 60), contact };
};
