/*
 * ELÄINHERÄTYS — the alarm itself.
 * A mournful synthesized accordion drone in a minor key,
 * with a slow heartbeat thump. It does not cheer you up. That is the point.
 */
(function (global) {
  "use strict";

  function AlarmSound() {
    this.ctx = null;
    this.nodes = [];
    this.playing = false;
    this._seqTimer = null;
  }

  AlarmSound.prototype._ensure = function () {
    if (!this.ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  };

  // One sad accordion-ish note: two detuned saws through a lowpass,
  // with slow tremolo like a bellows.
  AlarmSound.prototype._note = function (freq, t, dur) {
    var ctx = this.ctx;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.08);
    g.gain.setValueAtTime(0.5, t + dur - 0.15);
    g.gain.linearRampToValueAtTime(0, t + dur);

    var trem = ctx.createGain();
    trem.gain.value = 0.85;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    var lfoG = ctx.createGain();
    lfoG.gain.value = 0.15;
    lfo.connect(lfoG);
    lfoG.connect(trem.gain);

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;

    var o1 = ctx.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = freq;
    var o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq * 1.006;

    o1.connect(lp); o2.connect(lp);
    lp.connect(trem); trem.connect(g); g.connect(this.master);

    [o1, o2, lfo].forEach(function (o) { o.start(t); o.stop(t + dur + 0.05); });
    this.nodes.push(o1, o2, lfo);
  };

  // Low heartbeat thump under the melody.
  AlarmSound.prototype._thump = function (t) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.3);
    this.nodes.push(o);
  };

  // Gloomy minor descent: A – F – E – D, forever.
  AlarmSound.prototype._phrase = function (t0) {
    var notes = [220, 174.6, 164.8, 146.8];
    var step = 0.8;
    for (var i = 0; i < notes.length; i++) {
      this._note(notes[i], t0 + i * step, step * 0.95);
      this._thump(t0 + i * step);
    }
    return notes.length * step; // phrase length in seconds
  };

  AlarmSound.prototype.start = function () {
    if (this.playing) return;
    var ctx = this._ensure();
    this.playing = true;
    var self = this;
    var nextT = ctx.currentTime + 0.05;
    var len = 3.2;
    this._seqTimer = setInterval(function () {
      if (!self.playing) return;
      var ahead = ctx.currentTime + 0.5;
      while (nextT < ahead) {
        self._phrase(nextT);
        nextT += len;
      }
    }, 250);
  };

  AlarmSound.prototype.stop = function () {
    this.playing = false;
    if (this._seqTimer) clearInterval(this._seqTimer);
    this.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
    this.nodes = [];
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close();
    this.ctx = null;
  };

  global.AlarmSound = AlarmSound;
})(typeof window !== "undefined" ? window : globalThis);
