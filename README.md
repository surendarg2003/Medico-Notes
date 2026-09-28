# Medico Notes

Medico Notes is a browser based note taking app for writing, drawing, annotating PDFs, adding sticky notes, and recording audio.

## Run locally

```sh
npm ci
npm run dev
```

Create a production build with:

```sh
npm run build
```

The build output is written to `dist/`.

## Deploy with Cloudflare Pages

Connect this GitHub repository to Cloudflare Pages and use these settings:

- Framework preset: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`

The app is static and does not need environment variables or a server. It saves notes and recordings in the current browser on the current device. Those local notes do not automatically sync to another device. The service worker can cache the app for offline use after its first successful load.
