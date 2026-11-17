import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressTimes } from '../public/js/modules/story.js';

test('подряд идущие окна от трёх сжимаются в диапазон, остальные — как есть', () => {
  assert.deepEqual(compressTimes(['10:00', '11:00', '12:00', '13:00', '15:00', '16:00'], 60), ['10:00–13:00', '15:00', '16:00']);
  assert.deepEqual(compressTimes(['10:00', '10:30', '11:00'], 30), ['10:00–11:00']);
  assert.deepEqual(compressTimes(['10:00', '12:00', '14:00'], 60), ['10:00', '12:00', '14:00']);
  assert.deepEqual(compressTimes([], 60), []);
});
