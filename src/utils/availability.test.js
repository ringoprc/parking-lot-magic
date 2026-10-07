import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailabilitySortPriority, hasKnownAvailability, mergeLotDisplayAvailability } from './availability.js';

test('recognized result filter includes available, full, numeric zero and positive counts', () => {
  const lots = [
    { availabilityMode: 'boolean', hasAvailableSpace: true },
    { availabilityMode: 'boolean', hasAvailableSpace: false },
    { availabilityMode: 'count', vacancy: 0 },
    { availabilityMode: 'count', vacancy: 12 },
    { vacancy: '3' },
    { availabilityMode: 'boolean', hasAvailableSpace: null, vacancy: 7 },
    { availabilityMode: 'boolean', hasAvailableSpace: 'false' },
    { availabilityMode: 'count', vacancy: null },
    { availabilityMode: 'count', vacancy: '' },
    { availabilityMode: 'count', vacancy: 'unknown' },
  ];
  assert.deepEqual(lots.filter(hasKnownAvailability), lots.slice(0, 5));
  assert.equal(hasKnownAvailability(undefined), false);
});

test('polled boolean results enter and leave the recognized result filter', () => {
  const lot = { availabilityMode: 'boolean', hasAvailableSpace: null };
  const recognized = mergeLotDisplayAvailability(lot, { availabilityMode: 'boolean', hasAvailableSpace: false });
  assert.equal(hasKnownAvailability(recognized), true);
  const unknown = mergeLotDisplayAvailability(recognized, { availabilityMode: 'boolean', hasAvailableSpace: null });
  assert.equal(hasKnownAvailability(unknown), false);
});

test('sorting prioritizes current results, then historical records, then no data', () => {
  const never = { vacancy: null, lastUpdated: null };
  const historical = { vacancy: null, lastUpdated: '2026-10-02T09:17:00Z', availabilityReason: 'stale' };
  const allUnknown = { vacancy: null, lastUpdated: '2026-10-07T09:17:00Z', availabilityReason: 'no_valid_results' };
  const current = { availabilityMode: 'boolean', hasAvailableSpace: false };
  assert.deepEqual([never, allUnknown, historical, current].sort((a, b) =>
    getAvailabilitySortPriority(b) - getAvailabilitySortPriority(a)),
  [current, historical, allUnknown, never]);
  assert.equal(getAvailabilitySortPriority({ vacancy: null, lastUpdated: 'invalid' }), 0);
  assert.equal(getAvailabilitySortPriority({ vacancy: 0 }), 3);
});

test('mixed valid history outranks all-X history even after consecutive failures', () => {
  const allUnknown = mergeLotDisplayAvailability({}, {
    status: 'unknown', at: '2026-10-07T09:17:00Z', reason: 'no_valid_results',
  });
  for (const reason of ['stale', 'too_many_failures', 'boolean_conflict', 'unconfirmed_jump']) {
    const mixed = mergeLotDisplayAvailability({}, {
      status: 'unknown', at: '2026-10-02T09:17:00Z', reason,
    });
    assert.ok(getAvailabilitySortPriority(mixed) > getAvailabilitySortPriority(allUnknown));
  }
});
