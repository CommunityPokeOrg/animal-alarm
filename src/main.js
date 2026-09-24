/*
 * ELÄINHERÄTYS — the state machine of regret.
 * set -> armed -> ring -> mimic -> done
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  var views = {
    set: $("view-set"),
    armed: $("view-armed"),
    ring: $("view-ring"),
    mimic: $("view-mimic"),
    done: $("view-done")
  };

  var alarm = new AlarmSound();
  var slot = new SlotMachine(
    [document.querySelector("#reel-0 .reel-strip").parentNode,
     document.querySelector("#reel-1 .reel-strip").parentNode,
     document.querySelector("#reel-2 .reel-strip").parentNode],
    Mimic.ANIMALS, Mimic.ANIMAL_IDS
  );

  var alarmTimer = null;
  var clockTimer = null;
  var verifier = null;
  var giveUpHold = null;

  function show(name) {
    for (var k in views) views[k].classList.add("hidden");
    views[name].classList.remove("hidden");
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function tickClock() {
    var d = new Date();
    $("clock-now").textContent = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  /* ---------- arm / disarm ---------- */

  function arm() {
    var val = $("alarm-time").value;
    if (!val) return;
    var parts = val.split(":");
    var now = new Date();
    var target = new Date(now);
    target.setHours(+parts[0], +parts[1], 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    $("armed-time").textContent = val;
    show("armed");
    var delay = target - now;
    alarmTimer = setTimeout(fire, delay);
  }

  function disarm() {
    clearTimeout(alarmTimer);
    show("set");
  }

  /* ---------- ring -> slot -> mimic ---------- */

  function fire() {
    alarm.start();
    show("ring");
    // The machine decides. Three animals; the middle reel is your fate.
    var targets = [
      pickAnimal(), pickAnimal(), pickAnimal()
    ];
    setTimeout(function () {
      slot.spin(targets).then(function () {
        beginMimic(targets[1]);
      });
    }, 600);
  }

  function pickAnimal() {
    var ids = Mimic.ANIMAL_IDS;
    return ids[Math.floor(Math.random() * ids.length)];
  }

  function beginMimic(animalId) {
    var a = Mimic.ANIMALS[animalId];
    $("target-emoji").textContent = a.emoji;
    $("target-name").textContent = a.name;
    $("target-fi").textContent = a.fi;
    $("target-instruction").textContent = a.instruction;
    $("mimic-progress").style.width = "0%";
    $("verifier-status").textContent = "Listening…";
    $("verifier-pitch").textContent = "";
    show("mimic");

    verifier = new Mimic.MimicVerifier(a,
      function (progress, frame) {
        $("mimic-progress").style.width = Math.round(progress * 100) + "%";
        if (frame.pitch > 0) {
          $("verifier-pitch").textContent = Math.round(frame.pitch) + " Hz — keep going.";
        } else if (frame.rms > 0.02) {
          $("verifier-pitch").textContent = "I hear noise, not an animal.";
        } else {
          $("verifier-pitch").textContent = "";
        }
        if (progress > 0.2) $("verifier-status").textContent = "Something stirs…";
        if (progress > 0.6) $("verifier-status").textContent = "Almost believable.";
      },
      function () { finish(true); });

    verifier.start().catch(function (err) {
      $("verifier-status").textContent =
        "No microphone. The alarm accepts only a long, silent surrender — hold the button below.";
      verifier = null;
    });
  }

  function finish(mimicked) {
    if (verifier) { verifier.stop(); verifier = null; }
    alarm.stop();
    $("done-headline").textContent = mimicked
      ? "The alarm has stopped."
      : "You surrendered. The alarm stopped anyway. It pities you.";
    $("done-line").textContent = mimicked
      ? "Your performance was adequate. Go and have your coffee. It will not help, but have it anyway."
      : "Tomorrow the machine may choose again. There is always a tomorrow, unfortunately.";
    show("done");
  }

  /* ---------- give up (hold 4s) ---------- */

  function armGiveUp() {
    var btn = $("btn-giveup");
    var held = 0;
    btn.addEventListener("pointerdown", function () {
      btn.classList.add("armed-hold");
      held = Date.now();
      giveUpHold = setInterval(function () {
        if (Date.now() - held > 4000) {
          clearInterval(giveUpHold);
          finish(false);
        }
      }, 100);
    });
    ["pointerup", "pointerleave"].forEach(function (ev) {
      btn.addEventListener(ev, function () {
        btn.classList.remove("armed-hold");
        clearInterval(giveUpHold);
      });
    });
  }

  /* ---------- wire up ---------- */

  $("btn-arm").addEventListener("click", arm);
  $("btn-disarm").addEventListener("click", disarm);
  $("btn-again").addEventListener("click", function () { show("set"); });
  armGiveUp();

  tickClock();
  clockTimer = setInterval(tickClock, 500);
})();
