import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const clientPath = "scripts/analytics.js";
const htmlPath = "index.html";
const client = await readFile(new URL(clientPath, root), 'utf8');
const productionHosts = ["sharing-view.memoria-ll.link"];
const origin = 'https://' + productionHosts[0];

async function runClient(url, { override = false, fail = false, unsupported = false } = {}) {
  const parsed = new URL(url);
  const calls = [];
  const timeouts = [];
  const location = { hostname: parsed.hostname, protocol: parsed.protocol, pathname: parsed.pathname };
  for (const key of ['href', 'search', 'hash']) {
    Object.defineProperty(location, key, { get() { assert.fail('private URL field read: ' + key); } });
  }
  vm.runInNewContext(client, {
    location,
    __MEMORIA_ANALYTICS_TEST__: override,
    AbortSignal: unsupported ? undefined : { timeout(ms) { timeouts.push(ms); return 'timeout-signal'; } },
    fetch(url, options) {
      calls.push([url, options]);
      return fail ? Promise.reject(Error('offline')) : Promise.resolve({ ok: true });
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { calls, timeouts };
}

test('client sends once, without query/fragment, credentials or referrer; uses a 5s timeout', async () => {
  const { calls, timeouts } = await runClient(origin + '/?d=shared-id&token=secret#name');
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, 'https://memoria-analytics.yorutsuki22.workers.dev/_analytics/events');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.referrerPolicy, 'no-referrer');
  assert.equal(options.keepalive, true);
  assert.equal(options.signal, 'timeout-signal');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { event: 'page_view', path: '/' });
  assert.deepEqual(timeouts, [5000]);
  assert.equal(JSON.parse((await runClient(origin + '/index.html?token=private')).calls[0][1].body).path, '/index.html');
});

test('only documented production hosts send automatically; preview/local need test override', async () => {
  for (const url of ['http://localhost/', 'https://localhost/', 'https://app.localhost/', 'https://127.0.0.1/',
    'http://[::1]/', 'https://192.168.1.5/', 'https://10.0.0.1/', 'https://172.16.0.2/', 'https://dev.local/',
    'https://preview.pages.dev/', 'https://branch.personal-portal.pages.dev/', 'https://unlisted.example/']) {
    assert.equal((await runClient(url)).calls.length, 0, url);
  }
  assert.equal((await runClient('http://localhost/?d=private', { override: true })).calls.length, 1);
  for (const hostname of productionHosts) {
    assert.equal((await runClient('https://' + hostname + '/')).calls.length, 1, hostname);
    assert.equal((await runClient('http://' + hostname + '/')).calls.length, 0, hostname);
    assert.equal((await runClient('https://' + hostname + '.evil.example/')).calls.length, 0, hostname);
  }
  assert.equal((await runClient(origin + '/shares/private-id')).calls.length, 0);
});

test('failed/unsupported requests are swallowed without retries', async () => {
  assert.equal((await runClient(origin, { fail: true })).calls.length, 1);
  assert.equal((await runClient(origin, { unsupported: true })).calls.length, 0);
});

test('static HTML loads the analytics client exactly once', async () => {
  const html = await readFile(new URL(htmlPath, root), 'utf8');
  const publicScript = '/' + clientPath.replace(/^dist\//, '');
  assert.equal(html.split('<script defer src="' + publicScript + '"></script>').length, 2);
});
