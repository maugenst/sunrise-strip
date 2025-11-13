# Sunrise Simulation – deps aligned to your environment

This matches what your npm actually pulled:
- @sveltejs/kit 2.48.4
- svelte 5.1.15
- vite 7.0.5

So the peer deps should resolve **without** --force.

Run:

```bash
npm install
npm run dev -- --open
```

If your npm still complains because of a global override, you can do:

```bash
npm install --legacy-peer-deps
```
