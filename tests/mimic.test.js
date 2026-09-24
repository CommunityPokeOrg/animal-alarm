/*
 * Node smoke tests for the mimicry scorers and pitch detector.
 * Scorers are pure functions over synthetic frame streams.
 * Run: npm test
 */
"use strict";

const assert = require("assert");
const Mimic = require("../src/mimic.js");

/* ---- frame helpers ---- */

let _t = 0;
function frame(opts) {
  _t += 0.05;
  return Object.assign(
    { t: _t, rms: 0.001, pitch: -1, confidence: 0, flatness: 0.1 },
    opts
  );
}
function silent(n) { const out = []; for (let i = 0; i < n; i++) out.push(frame({})); return out; }
function voicedRun(pitch, seconds, jitterFn) {
  const out = [];
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i++) {
    const p = jitterFn ? jitterFn(pitch, i) : pitch;
    out.push(frame({ rms: 0.1, pitch: p, confidence: 0.9, flatness: 0.15 }));
  }
  return out;
}
function noise(seconds) {
  const out = [];
  const n = Math.round(seconds / 0.05);
  for (let i = 0; i < n; i++) {
    out.push(frame({ rms: 0.12, pitch: -1, confidence: 0.2, flatness: 0.85 }));
  }
  return out;
}
function seq(...parts) { return parts.flat(); }

const S = Mimic.scorers;

/* ---- wolf: sustained howl ---- */
{
  _t = 0;
  const frames = seq(silent(10), voicedRun(300, 2.5, (p, i) => p * (1 + 0.02 * Math.sin(i / 10))), silent(10));
  assert.ok(S.wolf(frames) >= 1, "wolf: 2.5s howl should score full");
  _t = 0;
  const short = seq(silent(5), voicedRun(300, 0.8), silent(5));
  assert.ok(S.wolf(short) < 0.5, "wolf: 0.8s howl should score low");
}

/* ---- seal: three short barks ---- */
{
  _t = 0;
  const bark = () => seq(voicedRun(200, 0.3), silent(6));
  const frames = seq(silent(5), bark(), bark(), bark(), silent(5));
  assert.ok(S.seal(frames) >= 1, "seal: 3 barks should score full");
  _t = 0;
  const one = seq(silent(5), bark(), silent(5));
  assert.ok(S.seal(one) < 0.5, "seal: 1 bark should score low");
}

/* ---- goat: tremolo bleating ---- */
{
  _t = 0;
  // pitch wobbling ±60Hz at ~5Hz over 2s
  const frames = seq(silent(5), voicedRun(400, 2.0, (p, i) => p + 60 * Math.sin(i * 1.6)), silent(5));
  assert.ok(S.goat(frames) >= 1, "goat: wobbling bleat should score full");
  _t = 0;
  const steady = seq(silent(5), voicedRun(400, 2.0), silent(5));
  assert.ok(S.goat(steady) < 0.5, "goat: steady tone should score low");
}

/* ---- rooster: pitch rises then falls ---- */
{
  _t = 0;
  const frames = seq(
    silent(5),
    voicedRun(0, 1.0, (p, i) => 300 + i * 30),      // rising 300 -> ~840
    voicedRun(0, 0.5, (p, i) => 840 - i * 25),       // falling
    silent(5)
  );
  assert.ok(S.rooster(frames) >= 1, "rooster: rise+fall sweep should score full");
  _t = 0;
  const flat = seq(silent(5), voicedRun(500, 1.5), silent(5));
  assert.ok(S.rooster(flat) < 0.5, "rooster: flat pitch should score low");
}

/* ---- donkey: low/high alternation ---- */
{
  _t = 0;
  const frames = seq(
    silent(5),
    voicedRun(200, 0.4), voicedRun(500, 0.4),
    voicedRun(200, 0.4), voicedRun(500, 0.4),
    silent(5)
  );
  assert.ok(S.donkey(frames) >= 1, "donkey: hee-haw alternation should score full");
  _t = 0;
  const oneBand = seq(silent(5), voicedRun(200, 2), silent(5));
  assert.ok(S.donkey(oneBand) < 0.5, "donkey: single band should score low");
}

/* ---- viper: sustained broadband hiss ---- */
{
  _t = 0;
  const frames = seq(silent(5), noise(2.5), silent(5));
  assert.ok(S.viper(frames) >= 1, "viper: 2.5s hiss should score full");
  _t = 0;
  const tonal = seq(silent(5), voicedRun(300, 2.5), silent(5));
  assert.ok(S.viper(tonal) < 0.4, "viper: tonal sound should score low");
}

/* ---- silence scores nothing for anyone ---- */
{
  _t = 0;
  const frames = silent(60);
  for (const id of Object.keys(S)) {
    assert.ok(S[id](frames) < 0.2, id + ": silence should score ~0");
  }
}

/* ---- detectPitch on a synthetic sine ---- */
{
  const sr = 44100, N = 2048, f0 = 220;
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = 0.5 * Math.sin(2 * Math.PI * f0 * i / sr);
  const r = Mimic.detectPitch(buf, sr);
  assert.ok(r.confidence > 0.5, "detectPitch: sine should be confident");
  assert.ok(Math.abs(r.pitch - f0) < 5, `detectPitch: expected ~${f0}Hz, got ${r.pitch}`);

  const quiet = new Float32Array(N); // silence
  const rq = Mimic.detectPitch(quiet, sr);
  assert.strictEqual(rq.pitch, -1, "detectPitch: silence -> unvoiced");
}

console.log("All mimic tests passed.");
