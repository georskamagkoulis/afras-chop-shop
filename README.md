# Afra's Chop Shop

Static website for Afra's Chop Shop, Λαμία. Live at https://georskamagkoulis.github.io/afras-chop-shop/

## To change the hours/rating/prices

1. Edit `data/site.json`.
2. Run `npm run build`.
3. Commit and push.

That's all: every page, including the footer, the `<meta>` / Open Graph descriptions and the Google
structured data, picks up the new value. Hours are written like `"09:00-14:00"`; a closed day is `[]`.

## How the files fit together

- `data/site.json`: the single source of truth (hours, prices, rating, phone, address, links,
  website URL and the image shown when the site is shared).
- `src/*.html`: one template per page. Values appear as `{{placeholders}}`, e.g. `{{rating.count}}`,
  `{{phone}}`, `{{hours.summary}}`.
- `src/partials/*.html`: pieces shared by every page, pasted in with `{{> name}}`:
  `head` (icons, canonical and share tags), `assets` (fonts, CSS, JS), `header` (logo + menu),
  `band` (red "Κλείσε ώρα" section) and `footer` (footer + mobile booking bar).
  Change the menu or footer here once and every page gets it.
- `build.mjs`: pastes the partials, fills the placeholders and writes the finished pages to the repo
  root (needs Node.js 18+, no packages to install). It stops with an error, without writing anything,
  if a placeholder or partial is missing. It also adds a fingerprint to the CSS/JS links
  (`main.css?v=…`), so visitors always get the latest version after a change.
- `index.html`, `prices.html`, `work.html`, `visit.html`, `404.html` in the root are **generated**.
  Don't edit them by hand; your changes would be overwritten by the next build.

## Publishing (GitHub Actions)

`.github/workflows/deploy.yml` runs `npm run build` on every push to `main` and publishes only the
public files (pages, `css/`, `js/`, `assets/`, `robots.txt`), so a forgotten build can't put old data
online, and `src/` / `data/` are not served. On pull requests it only checks that the build works.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Moving to your own domain

Change `website.url` in `data/site.json` (keep the `/` at the end) and rebuild. Canonical links,
share tags, structured data and the 404 page's paths all follow.
