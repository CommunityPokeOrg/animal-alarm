# animal-alarm

**ELÄINHERÄTYS** — Animal Mimicry Alarm Clock — by vwh and WillMcfly

A Finnish-gloom (Aki Kaurismäki–style) alarm clock. When it rings, a three-reel
slot machine chooses an animal, and the alarm does not stop until you imitate
that animal convincingly into the microphone. Verified live with the Web Audio
API.

## The animals

Donkey 🫏 · Viper 🐍 · Distressed Goat 🐐 · Seal 🦭 · Rooster 🐓 · Wolf 🐺

The middle reel decides your fate.

## Run it

It is a static site — no build, no dependencies.

```
npm run serve   # python3 -m http.server 8000
```

Then open http://localhost:8000. Any static file server works; it can be
deployed as-is (e.g. GitHub Pages). Microphone access requires HTTPS or
localhost.

## How verification works

`src/mimic.js` captures mic audio through an `AnalyserNode`, estimates pitch by
autocorrelation plus spectral flatness, and scores the last ~4 seconds of audio
against the target animal's profile — a wolf wants one sustained howl, a seal
wants three short barks, a viper wants pure noise, and so on. Fill the meter to
silence the alarm.

If there is no microphone, or you give up, hold the surrender button for four
seconds. The alarm will stop. It pities you.

## Checks

```
npm run check   # node --check on all source files
npm test        # synthetic-signal tests for the animal scorers and pitch detector
```
