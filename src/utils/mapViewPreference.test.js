import test from "node:test";
import assert from "node:assert/strict";
import { createMapViewSaver, isValidMapView } from "./mapViewPreference.js";

const view = { lat: 25, lng: 121, zoom: 14.5 };

test("rejects malformed preferences while accepting zero and fractional zoom", () => {
  for (const value of [null, {}, { ...view, lat: 91 }, { ...view, lng: 181 },
    { ...view, zoom: -1 }, { ...view, zoom: Infinity }, { ...view, lat: "25" }]) {
    assert.equal(isValidMapView(value), false);
  }
  assert.equal(isValidMapView(view), true);
  assert.equal(isValidMapView({ lat: 0, lng: 0, zoom: 0 }), true);
});

test("serializes slow writes and coalesces pending camera changes", async () => {
  const calls = [];
  let release;
  const saver = createMapViewSaver({ userId: "account-a", base: "", request: async (url, options) => {
    calls.push({ url, ...options, data: JSON.parse(options.body) });
    if (calls.length === 1) await new Promise((resolve) => { release = resolve; });
    return { ok: true };
  } });
  const first = saver.save(view);
  saver.save({ ...view, zoom: 15 });
  const last = saver.save({ ...view, zoom: 16 });
  assert.equal(calls.length, 1);
  release();
  await Promise.all([first, last]);
  assert.deepEqual(calls.map((call) => call.data.mapView.zoom), [14.5, 16]);
  assert.equal(calls[0].credentials, "include");
  assert.equal(calls[0].data.userId, "account-a");
  await saver.save({ ...view, zoom: 16 });
  assert.equal(calls.length, 2);
});

test("restored views are not rewritten; failed saves retry on the next event", async () => {
  let calls = 0;
  const saver = createMapViewSaver({ userId: "a", base: "", initialView: view, request: async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    return { ok: true };
  } });
  await saver.save(view);
  assert.equal(calls, 0);
  await saver.save({ ...view, zoom: 15 });
  await saver.save({ ...view, zoom: 15 });
  await saver.save({ ...view, zoom: 15 });
  assert.equal(calls, 2);
});

test("expired or switched accounts stop subsequent writes", async () => {
  for (const status of [401, 409]) {
    let calls = 0;
    const saver = createMapViewSaver({ userId: "a", base: "", request: async () => {
      calls++;
      return { ok: false, status };
    } });
    await saver.save(view);
    await saver.save({ ...view, zoom: 17 });
    assert.equal(calls, 1);
  }
});

test("cleanup discards queued writes on logout or unmount", async () => {
  let calls = 0;
  let release;
  const saver = createMapViewSaver({ userId: "a", base: "", request: async () => {
    calls++;
    await new Promise((resolve) => { release = resolve; });
    return { ok: true };
  } });
  const work = saver.save(view);
  saver.save({ ...view, zoom: 16 });
  saver.stop();
  release();
  await work;
  await saver.save(view);
  assert.equal(calls, 1);
});
