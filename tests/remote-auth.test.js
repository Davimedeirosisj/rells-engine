import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, startServer } from '../backend/server.js';
import { config } from '../backend/config.js';

const original = {
  host: config.host,
  allowRemote: config.allowRemote,
  remoteUsername: config.remoteUsername,
  remotePassword: config.remotePassword,
};
let server;
let base;

before(async () => {
  config.host = '0.0.0.0';
  config.allowRemote = true;
  config.remoteUsername = 'test-user';
  config.remotePassword = 'test-password';
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  Object.assign(config, original);
});

test('remote UI requires HTTP Basic credentials', async () => {
  const response = await fetch(base + '/');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /^Basic/);
});

test('remote UI rejects incorrect credentials', async () => {
  const authorization = `Basic ${Buffer.from('test-user:wrong-password').toString('base64')}`;
  const response = await fetch(base + '/', { headers: { authorization } });
  assert.equal(response.status, 401);
});

test('remote UI accepts configured credentials', async () => {
  const authorization = `Basic ${Buffer.from('test-user:test-password').toString('base64')}`;
  const response = await fetch(base + '/', { headers: { authorization } });
  assert.equal(response.status, 200);
});

test('startServer refuses remote binding without credentials', () => {
  config.remoteUsername = '';
  config.remotePassword = '';
  assert.throws(() => startServer(), /REMOTE_USERNAME e REMOTE_PASSWORD/);
});
