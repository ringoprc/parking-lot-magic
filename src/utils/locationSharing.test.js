import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationPublisher } from './locationSharing.js';

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
  await f.publisher.start(3);
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
  const pending = f.publisher.start(1);
  f.publisher.stop();
  finish({ lease: 'late-lease' });
  await pending;
  assert.deepEqual(calls.at(-1), { action: 'stop', body: { lease: 'late-lease' } });
  assert.equal(f.fixes.length, 0);
});

test('permission denial stops the lease and never sends coordinates', async () => {
  const f = fixture(); await f.publisher.start(1);
  f.fixes[0].failure({ code: 1 });
  await flush();
  assert.deepEqual(f.calls.map(call => call.action), ['start', 'stop']);
  assert.equal(f.states.at(-1).error, true);
  assert.match(f.states.at(-1).text, /定位權限/);
});

test('failed publishing stops sharing and does not retry an old coordinate', async () => {
  const calls = [];
  const f = fixture(async action => {
    calls.push(action);
    if (action === 'start') return { lease: 'test-lease' };
    if (action === 'update') throw new Error('Connection failed');
    return { ok: true };
  });
  await f.publisher.start(1); await f.fix();
  assert.deepEqual(calls, ['start', 'update', 'stop']);
  assert.equal(f.states.at(-1).error, true);
  assert.equal(f.pendingTimers.size, 0);
});

test('an update completing after stop cannot restart the publishing loop', async () => {
  let finish;
  const f = fixture(async action => {
    if (action === 'start') return { lease: 'test-lease' };
    if (action === 'update') return new Promise(resolve => { finish = resolve; });
    return { ok: true };
  });
  await f.publisher.start(1);
  const pending = f.fix(); f.publisher.stop(); finish({ ok: true }); await pending;
  assert.equal(f.pendingTimers.size, 0);
  assert.ok(!f.states.some(state => state.sharing));
});
