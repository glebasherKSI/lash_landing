import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchVerificationSchema } from '../src/validation/schemas.js';

test('код подтверждения: и сам код, и весь meta-тег; мусор не проходит', () => {
  const ok = searchVerificationSchema.parse({
    google_verification: '<meta name="google-site-verification" content="TestCode_abc-123456789" />',
    yandex_verification: 'a1b2c3d4e5f6a7b8',
  });
  assert.deepEqual(ok, { google_verification: 'TestCode_abc-123456789', yandex_verification: 'a1b2c3d4e5f6a7b8' });
  assert.equal(searchVerificationSchema.safeParse({ google_verification: 'не код!!', yandex_verification: '' }).success, false);
  assert.deepEqual(searchVerificationSchema.parse({ google_verification: '', yandex_verification: '' }), { google_verification: '', yandex_verification: '' });
});
