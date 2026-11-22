# Afra's Chop Shop

Static website for Afra's Chop Shop, Λαμία. Live at https://georskamagkoulis.github.io/afras-chop-shop/

## To change the hours/rating/prices

1. Edit `data/site.json`.
2. Run `npm run build`.
3. Commit and push.

That's all: every page, including the footer, the `<meta>` / Open Graph descriptions and the Google
structured data, picks up the new value. Hours are written like `"09:00-14:00"`; a closed day is `[]`.

## How the files fit together

- `data/site.json`: the single source of truth (hours, prices, rating, phone, address, links).
- `src/*.html`: the page templates. Edit text and layout here. Values appear as `{{placeholders}}`,
  e.g. `{{rating.count}}`, `{{phone}}`, `{{hours.summary}}`.
- `build.mjs`: fills the placeholders and writes the finished pages to the repo root
  (needs Node.js 18+, no packages to install). It stops with an error if a placeholder has no value.
- `index.html`, `prices.html`, `work.html`, `visit.html`, `404.html` in the root are **generated**.
  Don't edit them by hand; your changes would be overwritten by the next build.
