import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatNational, formatPhone, normalizePhone } from '../public/js/modules/phone.js';

test('любой привычный ввод приводится к одному виду', () => {
  for (const input of ['+375 29 123-45-67', '8 029 123 45 67', '80291234567', '375291234567', '(29) 123-45-67', '291234567']) {
    assert.equal(normalizePhone(input), '+375291234567', input);
  }
});

test('ерунда и не белорусские номера не проходят', () => {
  // в том числе номер с лишними цифрами: обрезать его нельзя, получится чужой номер
  for (const input of ['', 'abc', '@anya_lash', '29123', '+7 916 123-45-67', '(55) 123-45-67', '+375254594584954']) {
    assert.equal(normalizePhone(input), null, input);
  }
});

test('маска по мере ввода и форматирование для показа', () => {
  assert.equal(formatNational('2'), '(2');
  assert.equal(formatNational('2912'), '(29) 12');
  assert.equal(formatNational('2912345678999'), '(29) 123-45-67');
  assert.equal(formatPhone('+375291234567'), '+375 (29) 123-45-67');
  assert.equal(formatPhone('@anya_lash'), '@anya_lash');
});
