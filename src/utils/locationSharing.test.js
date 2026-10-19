import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers';
import { applyNearbyResult, pruneSharedLocations, locationRequest, createLocationPublisher, WAITING_FOR_MAP_LOCATION } from './locationSharing.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(requestOverride) {
  const calls = [], states = [], fixes = [], pendingTimers = new Set();
  const request = requestOverride || (async (action, body) => {
    calls.push({ action, body }); return action === 'start' ? { lease: 'test-lease' } : { ok: true };
  });
  const publisher = createLocationPublisher({ request, onState: state => states.push(state),
    geolocation: { getCurrentPosition(success, failure, options) { fixes.push({ success, failure, options }); } },
    timers: { setTimeout(fn) { pendingTimers.add(fn); return fn; }, clearTimeout(fn) { pendingTimers.delete(fn); } },
  });
  const fix = () => fixes.at(-1).success({ coords: { latitude: 25.05, longitude: 121.53 }, timestamp: Date.now() });
  return { publisher, calls, states, fixes, pendingTimers, fix };
}

test('publishes only after explicit start and each fresh fix; stop prevents later GPS callbacks', async () => {
  const f = fixture();
  assert.equal(f.calls.length, 0);
  await f.publisher.start(3, true);
  assert.deepEqual(f.calls, [{ action: 'start', body: { revision: 3 } }]);
  assert.equal(f.fixes[0].options.maximumAge, 0);
  await f.fix();
  assert.equal(f.calls[1].action, 'update');
  assert.equal(f.calls[1].body.sequence, 1);
  assert.equal(f.states.at(-1).sharing, true);
  const next = [...f.pendingTimers][0]; next();
  assert.equal(f.fixes.length, 2);
  assert.equal(f.calls.length, 2, 'a new fix is required; never re-send cached coordinates');
  f.publisher.stop();
  await f.fix();
  assert.equal(f.calls.at(-1).action, 'stop');
  assert.equal(f.calls.filter(call => call.action === 'update').length, 1);
  assert.equal(f.pendingTimers.size, 0);
});

test('late start response is cleaned up if page was hidden or unmounted while starting', async () => {
  let finish;
  const calls = [];
  const f = fixture(async (action, body) => {
    calls.push({ action, body });
    if (action === 'start') return new Promise(resolve => { finish = resolve; });
    return { ok: true };
  });
  const pending = f.publisher.start(1, true);
  f.publisher.stop();
  finish({ lease: 'late-lease' });
  await pending;
  assert.deepEqual(calls.at(-1), { action: 'stop', body: { lease: 'late-lease' } });
  assert.equal(f.fixes.length, 0);
});

test('permission denial stops the lease and never sends coordinates', async () => {
  const f = fixture(); await f.publisher.start(1, true);
  f.fixes[0].failure({ code: 1 });
  await flush();
  assert.deepEqual(f.calls.map(call => call.action), ['start', 'stop']);
  assert.equal(f.states.at(-1).error, true);
  assert.match(f.states.at(-1).text, /定位權限/);
});

test('temporary publishing failures retry with a fresh GPS fix without stopping the lease', async () => {
  const calls = [];
  let fail = true;
  const f = fixture(async (action, body) => {
    calls.push({ action, body });
    if (action === 'start') return { lease: 'test-lease' };
    if (action === 'update' && fail) throw new TypeError('Connection failed');
    return { ok: true };
  });
  await f.publisher.start(1, true); await f.fix();
  assert.deepEqual(calls.map(call => call.action), ['start', 'update']);
  assert.equal(f.states.at(-1).error, true);
  fail = false;
  const next = [...f.pendingTimers][0]; f.pendingTimers.delete(next); next();
  assert.equal(f.fixes.length, 2);
  assert.equal(calls.length, 2, 'retry must wait for a new GPS fix');
  await f.fixes[1].success({ coords: { latitude: 25.06, longitude: 121.54 }, timestamp: Date.now() });
  assert.equal(calls.at(-1).body.lat, 25.06);
  assert.equal(calls.at(-1).body.sequence, 2);
  assert.equal(f.states.at(-1).sharing, true);
  f.publisher.stop();
});

test('an update completing after stop cannot restart the publishing loop', async () => {
  let finish;
  const f = fixture(async action => {
    if (action === 'start') return { lease: 'test-lease' };
    if (action === 'update') return new Promise(resolve => { finish = resolve; });
    return { ok: true };
  });
  await f.publisher.start(1, true);
  const pending = f.fix(); f.publisher.stop(); finish({ ok: true }); await pending;
  assert.equal(f.pendingTimers.size, 0);
  assert.ok(!f.states.some(state => state.sharing));
});


test('enabling sharing alone waits without GPS or network requests until the map locates', async () => {
  const f = fixture();
  await f.publisher.start(1);
  await f.publisher.start(1, false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.fixes.length, 0);
  assert.deepEqual(f.states.at(-1), { text: WAITING_FOR_MAP_LOCATION });

  await f.publisher.start(1, true);
  assert.equal(f.fixes.length, 1);
  assert.ok(!f.states.some(state => state.sharing), 'GPS and upload must succeed before reporting sharing');
  await f.fix();
  assert.equal(f.states.at(-1).sharing, true);

  await f.publisher.start(1, false);
  assert.equal(f.calls.at(-1).action, 'stop');
  assert.equal(f.pendingTimers.size, 0);
  assert.deepEqual(f.states.at(-1), { text: WAITING_FOR_MAP_LOCATION });

  await f.publisher.start(1, true);
  assert.equal(f.fixes.length, 2, 'turning location back on obtains a fresh fix');
  const beforeLateFix = f.calls.length;
  await f.fixes[0].success({ coords: { latitude: 0, longitude: 0 }, timestamp: Date.now() });
  assert.equal(f.calls.length, beforeLateFix, 'the stopped location callback cannot publish after restarting');
  await f.fix();
  assert.equal(f.calls.at(-1).body.sequence, 1);
  assert.equal(f.states.at(-1).sharing, true);
});


test('temporary GPS errors retry, but stopping cancels the retry and ignores late fixes', async () => {
  const f = fixture(); await f.publisher.start(1, true);
  f.fixes[0].failure({ code: 3 });
  assert.equal(f.pendingTimers.size, 1);
  assert.deepEqual(f.calls.map(call => call.action), ['start']);
  const retry = [...f.pendingTimers][0]; f.pendingTimers.delete(retry); retry();
  assert.equal(f.fixes.length, 2);
  f.fixes[1].failure({ code: 2 });
  f.publisher.stop();
  assert.equal(f.pendingTimers.size, 0);
  await f.fix();
  assert.equal(f.calls.filter(call => call.action === 'update').length, 0);
});

test('authorization and consent conflicts stop rather than automatically restarting', async () => {
  for (const status of [400, 401, 403, 409]) {
    const calls = [];
    const f = fixture(async action => {
      calls.push(action);
      if (action === 'start') return { lease: 'lease' };
      if (action === 'update') throw Object.assign(new Error('Unavailable'), { status });
      return {};
    });
    await f.publisher.start(1, true); await f.fix();
    assert.deepEqual(calls, ['start', 'update', 'stop']);
    assert.equal(f.pendingTimers.size, 0);
  }
});

test('expired lease reconnects with the same consent revision and fresh coordinates', async () => {
  const calls = [];
  let starts = 0;
  const f = fixture(async (action, body) => {
    calls.push({ action, body });
    if (action === 'start') return { lease: `lease-${++starts}` };
    if (action === 'update' && starts === 1) throw Object.assign(new Error('Expired'), { status: 409, code: 'LEASE_EXPIRED' });
    return {};
  });
  await f.publisher.start(7, true); await f.fix();
  const retry = [...f.pendingTimers][0]; f.pendingTimers.delete(retry); await retry();
  assert.deepEqual(calls.at(-1), { action: 'start', body: { revision: 7 } });
  await f.fix();
  assert.equal(calls.at(-1).body.lease, 'lease-2');
  assert.equal(calls.at(-1).body.sequence, 1);
  assert.equal(f.states.at(-1).sharing, true);
  f.publisher.stop();
});

test('initial connection failures retry and can be cancelled without starting GPS', async () => {
  const f = fixture(async () => { throw Object.assign(new Error('Unavailable'), { status: 503 }); });
  await f.publisher.start(1, true);
  assert.equal(f.pendingTimers.size, 1);
  const retry = [...f.pendingTimers][0];
  f.publisher.stop(); await retry();
  assert.equal(f.fixes.length, 0);
  assert.equal(f.pendingTimers.size, 0);
});

test('nearby errors retain unexpired markers, but success, auth failure and expiry remove them promptly', () => {
  const now = 100000;
  const rows = [{ id: 'one', lat: 25, lng: 121, expiresAt: new Date(now + 5000).toISOString() }];
  assert.equal(pruneSharedLocations(rows, now), rows, 'no per-second identity churn');
  for (const error of [new TypeError('Offline'), Object.assign(new Error('Unavailable'), { status: 503 })]) {
    assert.equal(applyNearbyResult(rows, { error }, now), rows);
    assert.deepEqual(applyNearbyResult(rows, { error }, now + 5000), []);
  }
  assert.deepEqual(applyNearbyResult(rows, { locations: [] }, now), [], 'a revoked share is not kept until its old expiry');
  for (const status of [401, 403, 409]) assert.deepEqual(applyNearbyResult(rows, { error: { status } }, now), []);
  const moved = [{ ...rows[0], lat: 25.1 }];
  assert.deepEqual(applyNearbyResult(rows, { locations: moved }, now), moved);
});

test('location errors expose HTTP status and lease expiry code, including non-JSON failures', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Expired', code: 'LEASE_EXPIRED' }), { status: 409 }));
  await assert.rejects(locationRequest('', 'user', 'update', {}), error => error.status === 409 && error.code === 'LEASE_EXPIRED');
  globalThis.fetch = async () => new Response('Unavailable', { status: 503 });
  await assert.rejects(locationRequest('', 'user', 'nearby', {}), error => error.status === 503);
});
