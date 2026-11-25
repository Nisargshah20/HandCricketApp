<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/13bedba2-8d8e-4355-83ae-1fe4ba4afc63

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## AdMob app verification

Vite copies `public/app-ads.txt` to the build root, and the production server
serves it at `/app-ads.txt`. Keep its publisher record identical to the snippet
provided by the AdMob account.

After deploying, check that
https://hand-cricket-backend-z6ey.onrender.com/app-ads.txt returns plain text:

```text
google.com, pub-5012012151589823, DIRECT, f08c47fec0942fa0
```

In Google Play Console, set **Store settings > Store listing contact details >
Website** to `https://hand-cricket-backend-z6ey.onrender.com` and publish the
listing change. The privacy policy URL alone does not replace this setting.
Then request an app-ads.txt update check in AdMob. Google notes that detecting
a changed developer website can take up to 24 hours.
