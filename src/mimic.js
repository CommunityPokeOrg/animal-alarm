/*
 * ELÄINHERÄTYS — mimicry verification.
 *
 * Frame shape produced by the analyser and consumed by the scorers:
 *   { t: seconds, rms: 0..1, pitch: Hz or -1 (unvoiced), confidence: 0..1,
 *     flatness: 0..1 (spectral flatness; ~1 = noise) }
 *
 * Each animal profile exposes score(frames) -> 0..1 and verdict text.
 * score() is pure and runs in both the browser and Node (tests).
 */
(function (global) {
  "use strict";

  var MIN_RMS = 0.02; // anything quieter is treated as silence

  function voiced(f) {
    return f.rms > MIN_RMS && f.pitch > 0 && f.confidence > 0.55;
  }

  /* Split frames into runs of voiced frames (gaps > maxGapSec end a run). */
  function voicedRuns(frames, maxGapSec) {
    var runs = [];
    var cur = null;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (voiced(f)) {
        if (!cur) { cur = { start: i, end: i }; }
        else { cur.end = i; }
      } else if (cur) {
        var gap = f.t - frames[cur.end].t;
        if (gap > maxGapSec) { runs.push(cur); cur = null; }
      }
    }
    if (cur) runs.push(cur);
    return runs;
  }

  function runDur(frames, run) {
    return frames[run.end].t - frames[run.start].t;
  }

  function pitchesIn(frames, run) {
    var out = [];
    for (var i = run.start; i <= run.end; i++) {
      if (frames[i].pitch > 0) out.push(frames[i].pitch);
    }
    return out;
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  /* Loud, unvoiced/noisy fraction — hiss, static, breath. */
  function noiseFraction(frames) {
    var loud = 0, noisy = 0;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.rms > MIN_RMS * 2) {
        loud++;
        if (!voiced(f) || f.flatness > 0.55) noisy++;
      }
    }
    return loud ? noisy / loud : 0;
  }

  function activitySpan(frames) {
    var first = -1, last = -1;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].rms > MIN_RMS) { if (first < 0) first = i; last = i; }
    }
    return first < 0 ? 0 : frames[last].t - frames[first].t;
  }

  /* ---------------- animal scorers ---------------- */

  // VIPER (Kyy): a sustained hiss — loud broadband noise, no stable pitch.
  function scoreViper(frames) {
    var span = activitySpan(frames);
    var target = 1.6; // seconds of hissing required
    var nf = noiseFraction(frames);
    if (nf < 0.5) return 0.1 * (span / target); // too tonal to be a snake
    return Math.min(1, (span / target) * nf);
  }

  // WOLF (Susi): one long howl — a sustained, gently drifting voiced tone.
  function scoreWolf(frames) {
    var runs = voicedRuns(frames, 0.25);
    var best = 0;
    for (var r = 0; r < runs.length; r++) {
      var dur = runDur(frames, runs[r]);
      var ps = pitchesIn(frames, runs[r]);
      if (ps.length < 4) continue;
      var m = mean(ps);
      if (m < 120 || m > 700) continue;
      var drift = Math.abs(ps[ps.length - 1] - ps[0]) / ps[0];
      if (drift > 1.2) continue; // a sweep, not a howl
      best = Math.max(best, dur);
    }
    return Math.min(1, best / 2.2); // need ~2.2s of continuous howl
  }

  // SEAL (Hylje): bark bark bark — several short voiced bursts, low-mid pitch.
  function scoreSeal(frames) {
    var runs = voicedRuns(frames, 0.3);
    var barks = 0;
    for (var r = 0; r < runs.length; r++) {
      var dur = runDur(frames, runs[r]);
      var ps = pitchesIn(frames, runs[r]);
      if (!ps.length) continue;
      var m = mean(ps);
      if (dur >= 0.08 && dur <= 0.8 && m >= 80 && m <= 500) barks++;
    }
    return Math.min(1, barks / 3); // need 3 barks
  }

  // DISTRESSED GOAT (Ahdistunut vuohi): bleating — voiced with fast
  // amplitude/pitch tremolo. Count modulation peaks inside voiced runs.
  function scoreGoat(frames) {
    var runs = voicedRuns(frames, 0.2);
    var tremoloPeaks = 0;
    for (var r = 0; r < runs.length; r++) {
      var ps = [];
      for (var i = runs[r].start; i <= runs[r].end; i++) {
        if (frames[i].pitch > 0) {
          ps.push(frames[i].pitch);
        }
      }
      var m = mean(ps);
      if (m < 150 || m > 900) continue;
      // count direction reversals in pitch (the wobble of a bleat)
      var dir = 0;
      for (var j = 1; j < ps.length; j++) {
        var d = ps[j] - ps[j - 1];
        var nd = Math.abs(d) < 8 ? dir : (d > 0 ? 1 : -1);
        if (dir !== 0 && nd !== dir) tremoloPeaks++;
        dir = nd;
      }
    }
    return Math.min(1, tremoloPeaks / 6); // need ~6 wobbles
  }

  // ROOSTER (Kukko): cock-a-doodle-doo — a voiced cry that sweeps sharply
  // upward then breaks downward. Look for a big rise followed by a fall.
  function scoreRooster(frames) {
    var runs = voicedRuns(frames, 0.2);
    var best = 0;
    for (var r = 0; r < runs.length; r++) {
      var ps = pitchesIn(frames, runs[r]);
      if (ps.length < 6) continue;
      var peak = 0;
      for (var i = 0; i < ps.length; i++) if (ps[i] > ps[peak]) peak = i;
      var rise = ps[peak] / Math.max(1, ps[0]);
      var fall = ps[peak] / Math.max(1, ps[ps.length - 1]);
      if (ps[peak] < 250 || ps[peak] > 1500) continue;
      var s = Math.min(1, (rise - 1) / 0.6) * 0.6 + Math.min(1, (fall - 1) / 0.5) * 0.4;
      if (peak > 0 && peak < ps.length - 1) best = Math.max(best, s);
    }
    return Math.min(1, best / 0.85); // a near-perfect crow counts as a crow
  }

  // DONKEY (Aasi): hee-haw — alternating between a low band and a high band.
  function scoreDonkey(frames) {
    var switches = 0;
    var state = 0; // 0 none, 1 low, 2 high
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (!voiced(f)) continue;
      var band = f.pitch <= 300 ? 1 : (f.pitch >= 380 ? 2 : state);
      if (band === 0) continue;
      if (state !== 0 && band !== state) switches++;
      state = band;
    }
    return Math.min(1, switches / 3); // hee-haw-hee: 3 band switches
  }

  var ANIMALS = {
    donkey: {
      id: "donkey", name: "Donkey", fi: "Aasi", emoji: "🫏",
      instruction: "Hee-haw. Alternate between a low groan and a high bray. Commit to it.",
      score: scoreDonkey
    },
    viper: {
      id: "viper", name: "Viper", fi: "Kyy", emoji: "🐍",
      instruction: "Hiss. Sustained, venomous, no melody. Think of a tire giving up.",
      score: scoreViper
    },
    goat: {
      id: "goat", name: "Distressed Goat", fi: "Ahdistunut vuohi", emoji: "🐐",
      instruction: "Bleat. Your voice must tremble like the goat has seen the news.",
      score: scoreGoat
    },
    seal: {
      id: "seal", name: "Seal", fi: "Hylje", emoji: "🦭",
      instruction: "Bark three times. Short, round, low. Like a wet dog with dignity.",
      score: scoreSeal
    },
    rooster: {
      id: "rooster", name: "Rooster", fi: "Kukko", emoji: "🐓",
      instruction: "Cock-a-doodle-doo. Rise sharply, then fall apart at the end.",
      score: scoreRooster
    },
    wolf: {
      id: "wolf", name: "Wolf", fi: "Susi", emoji: "🐺",
      instruction: "Howl. One long, lonely note held for at least two seconds. Mean it.",
      score: scoreWolf
    }
  };

  var ANIMAL_IDS = ["donkey", "viper", "goat", "seal", "rooster", "wolf"];

  /* ---------------- pitch detection ---------------- */

  // Autocorrelation pitch estimate on a Float32Array of time-domain samples.
  function detectPitch(buf, sampleRate) {
    var SIZE = buf.length;
    var rms = 0;
    for (var i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.008) return { pitch: -1, confidence: 0 };

    // trim silence at the edges: first/last sample above threshold
    var r1 = 0, r2 = SIZE - 1, thres = 0.1;
    for (i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) > thres) { r1 = i; break; }
    for (i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) > thres) { r2 = SIZE - i; break; }

    var trimmed = buf.slice(r1, r2);
    var N = trimmed.length;
    if (N < 64) return { pitch: -1, confidence: 0 };

    var c = new Float32Array(N);
    for (i = 0; i < N; i++) {
      var sum = 0;
      for (var j = 0; j < N - i; j++) sum += trimmed[j] * trimmed[j + i];
      c[i] = sum;
    }

    var d = 0;
    while (d < N - 1 && c[d] > c[d + 1]) d++;
    var maxval = -1, maxpos = -1;
    for (i = d; i < N; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    if (maxpos <= 0) return { pitch: -1, confidence: 0 };

    var T0 = maxpos;
    // parabolic interpolation
    var x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    var a = (x1 + x3 - 2 * x2) / 2;
    var b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    var pitch = sampleRate / T0;
    var confidence = maxval / (c[0] || 1);
    if (pitch < 60 || pitch > 1500) confidence = 0;
    return { pitch: pitch, confidence: Math.max(0, Math.min(1, confidence)) };
  }

  // Spectral flatness (geometric/arithmetic mean of magnitudes): ~1 = noise.
  function spectralFlatness(freqData) {
    var n = freqData.length, geo = 0, arith = 0, used = 0;
    for (var i = 0; i < n; i++) {
      var v = Math.pow(10, freqData[i] / 20); // dB -> linear amplitude
      if (v <= 0) continue;
      geo += Math.log(v);
      arith += v;
      used++;
    }
    if (!used || arith === 0) return 0;
    geo = Math.exp(geo / used);
    arith = arith / used;
    return geo / arith;
  }

  /* ---------------- live verifier (browser only) ---------------- */

  var FRAME_MS = 50;

  function MimicVerifier(animal, onProgress, onDone) {
    this.animal = animal;
    this.onProgress = onProgress || function () {};
    this.onDone = onDone || function () {};
    this.frames = [];
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.timer = null;
    this.stopped = false;
    this.progress = 0;
  }

  MimicVerifier.prototype.start = function () {
    var self = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("no-mic-api"));
    }
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      self.stream = stream;
      var AC = global.AudioContext || global.webkitAudioContext;
      self.ctx = new AC();
      var src = self.ctx.createMediaStreamSource(stream);
      self.analyser = self.ctx.createAnalyser();
      self.analyser.fftSize = 2048;
      src.connect(self.analyser);
      self.buf = new Float32Array(self.analyser.fftSize);
      self.freq = new Uint8Array(self.analyser.frequencyBinCount);
      self.t0 = self.ctx.currentTime;
      self.timer = setInterval(function () { self._tick(); }, FRAME_MS);
      return self;
    });
  };

  MimicVerifier.prototype._tick = function () {
    if (this.stopped) return;
    // legacy + current API both appear in the wild
    if (this.analyser.getFloatTimeDomainData) {
      this.analyser.getFloatTimeDomainData(this.buf);
    } else {
      var u8 = new Uint8Array(this.buf.length);
      this.analyser.getByteTimeDomainData(u8);
      for (var i = 0; i < u8.length; i++) this.buf[i] = (u8[i] - 128) / 128;
    }
    var rms = 0;
    for (var i = 0; i < this.buf.length; i++) rms += this.buf[i] * this.buf[i];
    rms = Math.sqrt(rms / this.buf.length);
    this.analyser.getByteFrequencyData(this.freq);

    var p = detectPitch(this.buf, this.ctx.sampleRate);
    var frame = {
      t: this.ctx.currentTime - this.t0,
      rms: rms,
      pitch: p.confidence > 0.4 ? p.pitch : -1,
      confidence: p.confidence,
      flatness: spectralFlatness(this.freq)
    };
    this.frames.push(frame);
    // keep ~8s of history
    while (this.frames.length && this.frames[0].t < frame.t - 8) this.frames.shift();

    var recent = this.frames.filter(function (f) { return f.t > frame.t - 4; });
    this.progress = this.animal.score(recent);
    this.onProgress(this.progress, frame);
    if (this.progress >= 1) {
      this.stop();
      this.onDone();
    }
  };

  MimicVerifier.prototype.stop = function () {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
    }
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close();
  };

  var api = {
    ANIMALS: ANIMALS,
    ANIMAL_IDS: ANIMAL_IDS,
    detectPitch: detectPitch,
    spectralFlatness: spectralFlatness,
    MimicVerifier: MimicVerifier,
    scorers: {
      donkey: scoreDonkey, viper: scoreViper, goat: scoreGoat,
      seal: scoreSeal, rooster: scoreRooster, wolf: scoreWolf
    }
  };

  global.Mimic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
