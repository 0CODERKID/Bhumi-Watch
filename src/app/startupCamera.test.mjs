import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStartView, START_VIEW } from '../camera.js';
import { bindFakeCesiumCamera } from '../testSupport/fakeCameraPort.mjs';

function viewerRecording(views) {
  return bindFakeCesiumCamera({
    isDestroyed: () => false,
    camera: {
      setView(view) {
        views.push(view);
      },
      flyTo() {
        assert.fail('a start view is set, not flown to');
      },
    },
  });
}

test('the camera starts over India with the whole planet in view', () => {
  const views = [];
  applyStartView(viewerRecording(views));
  assert.equal(views.length, 1);
  assert.ok(START_VIEW.height >= 2000000 && START_VIEW.height <= 6000000, 'the Indian subcontinent is in view');
  assert.equal(START_VIEW.lon, 78);
  assert.equal(START_VIEW.lat, 22);
  assert.ok(Math.abs(views[0].orientation.pitch + Math.PI / 2) < 1e-9);
  assert.equal(views[0].orientation.heading, 0);
});

test('a host can start the camera at a city instead', () => {
  const views = [];
  applyStartView(viewerRecording(views), {
    lon: 2.35,
    lat: 48.86,
    height: 5000,
    heading: 90,
    pitch: -30,
  });
  assert.equal(views.length, 1);
  assert.ok(Math.abs(views[0].orientation.heading - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(views[0].orientation.pitch + Math.PI / 6) < 1e-9);
});
