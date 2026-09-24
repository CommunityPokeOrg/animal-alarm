/*
 * ELÄINHERÄTYS — the three-reel decision machine.
 * It spins, it stops, it tells you what you must become.
 *
 * Each reel strip holds CYCLES copies of the symbol sequence. To land on a
 * symbol we translate the strip down by (cycle * n + index) * SYMBOL_H.
 * To re-spin we first snap back (invisibly) to an equivalent position in an
 * earlier cycle, then animate to the next landing position.
 */
(function (global) {
  "use strict";

  var SYMBOL_H = 110; // must match .reel height in style.css
  var CYCLES = 6;

  function SlotMachine(reelsEl, animals, ids) {
    this.reels = reelsEl;
    this.animals = animals;
    this.ids = ids;
    this.strips = [];
    this.currentIndex = []; // symbol index currently showing at top of each reel
    for (var i = 0; i < reelsEl.length; i++) {
      this.strips.push(reelsEl[i].querySelector(".reel-strip"));
      this._fillStrip(i);
      this.currentIndex.push(0);
    }
  }

  SlotMachine.prototype._symbolHtml = function (id) {
    var a = this.animals[id];
    return '<div class="reel-symbol"><span>' + a.emoji + "</span><small>" +
      a.name + "</small></div>";
  };

  SlotMachine.prototype._fillStrip = function (reelIdx) {
    var html = "";
    for (var c = 0; c < CYCLES; c++) {
      for (var i = 0; i < this.ids.length; i++) html += this._symbolHtml(this.ids[i]);
    }
    this.strips[reelIdx].innerHTML = html;
  };

  // Spin all reels; each lands on targets[i]. Resolves with the landed ids.
  SlotMachine.prototype.spin = function (targets) {
    var self = this;
    return Promise.all(this.strips.map(function (s, i) {
      return self._spinReel(i, targets[i]);
    })).then(function () { return targets; });
  };

  SlotMachine.prototype._spinReel = function (reelIdx, targetId) {
    var strip = this.strips[reelIdx];
    var reel = this.reels[reelIdx];
    var n = this.ids.length;
    var targetIdx = this.ids.indexOf(targetId);
    if (targetIdx < 0) targetIdx = 0;

    // Snap back: show the current symbol again but one cycle earlier,
    // so the upcoming animation always travels forward.
    var cur = this.currentIndex[reelIdx];
    strip.style.transition = "none";
    strip.style.transform = "translateY(-" + (cur * SYMBOL_H) + "px)";
    void strip.offsetHeight; // force reflow

    // Land 3–4 cycles ahead, on the target symbol.
    var cycle = 3 + (reelIdx % 2);
    var landingIndex = cycle * n + targetIdx;
    var offset = landingIndex * SYMBOL_H;
    var duration = 1200 + reelIdx * 800 + Math.random() * 300;
    this.currentIndex[reelIdx] = landingIndex;

    return new Promise(function (resolve) {
      reel.classList.remove("stopped");
      strip.style.transition =
        "transform " + duration + "ms cubic-bezier(0.12, 0.6, 0.15, 1)";
      strip.style.transform = "translateY(-" + offset + "px)";

      setTimeout(function () {
        reel.classList.add("stopped");
        // Normalize position: wrap into the first cycle so the translate
        // never grows unbounded across re-spins.
        var wrapped = (landingIndex % n) * SYMBOL_H;
        strip.style.transition = "none";
        strip.style.transform = "translateY(-" + wrapped + "px)";
        void strip.offsetHeight;
        // re-enable transitions for the next spin
        strip.style.transition = "";
        resolve(targetId);
      }, duration + 60);
    });
  };

  global.SlotMachine = SlotMachine;
})(typeof window !== "undefined" ? window : globalThis);
