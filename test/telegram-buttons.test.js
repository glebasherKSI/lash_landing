import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleCallback } from '../src/lib/telegram.js';

const target = { token: 'T', chatId: '-100' };
const booking = { id: 7, status: 'new', service_title: 'Классика', effect_name: null, date: '2026-11-18', start_min: 600, end_min: 750, price_byn: 60, client_name: 'Оля', contact: '+375291112233', comment: '' };

const setup = (status = 'new') => {
  const db = { ...booking, status };
  const calls = [];
  const repo = { getBooking: (id) => (id === db.id ? db : undefined), setBookingStatus: (_id, s) => (db.status = s) };
  const send = async (_token, method, payload) => calls.push({ method, payload });
  const press = (data, chatId = '-100') =>
    handleCallback(target, { id: 'q', data, from: { first_name: 'Вероника' }, message: { chat: { id: chatId }, message_id: 5 } }, repo, send);
  return { db, calls, press };
};

test('подтверждение меняет статус и текст сообщения', async () => {
  const { db, calls, press } = setup();
  await press('b:7:confirm');
  assert.equal(db.status, 'confirmed');
  const edit = calls.find((c) => c.method === 'editMessageText');
  assert.match(edit.payload.text, /Подтвердила Вероника/);
  // после подтверждения остаётся только «Отменить запись»
  assert.deepEqual(edit.payload.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ['b:7:ask']);
  assert.equal(calls.at(-1).payload.text, 'Запись подтверждена');
});

test('отмена в два шага: сначала вопрос, статус не меняется', async () => {
  const { db, calls, press } = setup();
  await press('b:7:ask');
  assert.equal(db.status, 'new');
  assert.deepEqual(calls[0].payload.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ['b:7:cancel', 'b:7:back']);
  await press('b:7:cancel');
  assert.equal(db.status, 'cancelled');
});

test('чужой чат и устаревшие нажатия статус не трогают', async () => {
  const other = setup();
  await other.press('b:7:confirm', '-999');
  assert.equal(other.db.status, 'new');
  const stale = setup('cancelled');
  await stale.press('b:7:confirm');
  assert.equal(stale.db.status, 'cancelled');
  assert.equal(stale.calls.at(-1).payload.text, 'Запись уже отменена');
});
