# Workout Planner

A small offline-first PWA that drafts a paired-interval workout from your available equipment.

Default: 24 minutes — three 8-minute blocks, two exercises per block alternating each minute, 40 s work / 20 s rest.

## Run locally

```bash
python3 -m http.server 18765 --directory docs --bind 127.0.0.1
```

Open <http://127.0.0.1:18765/>.

## Update exercises

Edit `docs/exercises.js` directly. Bump `CACHE_NAME` in `docs/sw.js` so installed clients pick up the new data.

## Regenerate icons

```bash
python3 docs/generate_icons.py
```

## Deploy

Push to GitHub. **Settings → Pages → Source: `main` + `/docs`.** App lives at `https://<user>.github.io/workout_planner/`.
