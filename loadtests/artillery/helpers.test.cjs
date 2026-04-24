const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildHttpRequestOptions,
  isInsecureTlsEnabled,
} = require('./helpers.js');

test('isInsecureTlsEnabled returns true only for explicit true', () => {
  assert.equal(isInsecureTlsEnabled('true'), true);
  assert.equal(isInsecureTlsEnabled('TRUE'), true);
  assert.equal(isInsecureTlsEnabled('false'), false);
  assert.equal(isInsecureTlsEnabled(undefined), false);
});

test('buildHttpRequestOptions disables TLS verification only when configured', () => {
  const insecure = buildHttpRequestOptions(
    new URL('https://nginx'),
    '/api/auth/login',
    10,
    true,
  );

  assert.equal(insecure.rejectUnauthorized, false);
  assert.equal(insecure.hostname, 'nginx');
  assert.equal(insecure.path, '/api/auth/login');

  const secure = buildHttpRequestOptions(
    new URL('https://yovi-es1c.duckdns.org'),
    '/api/auth/login',
    10,
    false,
  );

  assert.equal('rejectUnauthorized' in secure, false);
});
