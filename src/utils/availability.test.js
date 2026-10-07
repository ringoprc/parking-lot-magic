import test from 'node:test';
import assert from 'node:assert/strict';
import { hasKnownAvailability, mergeLotDisplayAvailability } from './availability.js';

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
