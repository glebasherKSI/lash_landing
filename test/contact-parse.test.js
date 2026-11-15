import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContact } from '../public/js/modules/contact-parse.js';

test('имя и телефон в одной строке', () => {
  assert.deepEqual(parseContact('Аня +375 29 123-45-67'), { name: 'Аня', contact: '+375291234567' });
});

test('телефон впереди, имя после запятой', () => {
  assert.deepEqual(parseContact('+375 (29) 765-43-21, Ольга'), { name: 'Ольга', contact: '+375297654321' });
});

test('несколько строк из переписки', () => {
  assert.deepEqual(parseContact('Мария Иванова\nтел: 8 029 111 22 33'), { name: 'Мария Иванова', contact: '80291112233' });
});

test('ник в Telegram', () => {
  assert.deepEqual(parseContact('@anya_lash Аня'), { name: 'Аня', contact: '@anya_lash' });
});

test('только имя', () => {
  assert.deepEqual(parseContact('Катя'), { name: 'Катя', contact: '' });
});
