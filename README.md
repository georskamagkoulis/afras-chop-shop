# Afra's Chop Shop

Static website for Afra's Chop Shop, Λαμία. Live at https://georskamagkoulis.github.io/afras-chop-shop/

## To change the hours/rating/prices

1. Edit `data/site.json` (on your computer, or on github.com with the pencil icon, even from a phone).
2. Commit and push to `main`.

That's all: the GitHub Action tests, builds and publishes the site in about a minute. Every page,
including the footer, the `<meta>` / Open Graph descriptions and the Google structured data, picks up
the new value. Hours are written like `"09:00-14:00"`; a closed day is `[]`.

If something in the file is wrong (a missing comma, a time like "9-14"), the Action fails with a red ✗
in the **Actions** tab and the live site stays as it was. Fix the file and push again.

To preview on your computer first: `npm run build`, then open `index.html` in a browser.

## Holidays and special hours

Add them to `"closures"` in `data/site.json`:

```json
"closures": [
  { "from": "2026-12-24", "to": "2026-12-26", "note": "Χριστούγεννα" },
  { "from": "2026-12-31", "to": "2026-12-31", "note": "Παραμονή Πρωτοχρονιάς", "hours": ["09:00-14:00"] }
]
```

No `"hours"` means closed. With `"hours"` the shop is open only at those times that day.

What the visitor sees:
- a gold strip at the top of every page, from 3 weeks before the holiday until it ends;
- the "Ανοιχτά / Κλειστά" line takes the holiday into account ("Κλειστά · ανοίγει την Τρίτη στις 09:00");
- Google gets the dates as special opening hours.

Holidays that have ended disappear by themselves (the site is rebuilt every hour), so there is no need
to delete old entries. **Remember to block the same days in Setmore too**; the website cannot do that.

### Optional: holidays from a Google Sheet (so the shop can change them without GitHub)

1. Make a Google Sheet with the columns **Από | Έως | Σημείωση | Ώρες** in the first row.
   Dates like `24/12/2026`; leave "Έως" empty for one day; leave "Ώρες" empty for closed,
   or write e.g. `09:00-14:00`. Put nothing else in this sheet: it will be public.
2. File → Share → **Publish to the web** → choose the sheet and **Comma-separated values (.csv)** → Publish.
   Copy the link.
3. Put the link in `data/site.json`: `"closuresSheetCsv": "https://docs.google.com/...output=csv"`, push.

From then on, changes in the sheet appear on the site within about an hour. Holidays in the sheet and
in `"closures"` are combined. If the sheet has a mistake or cannot be reached, the build fails and the
live site keeps the previous version (GitHub emails you about the failed run).

## How the files fit together

- `data/site.json`: the single source of truth (hours, holidays, prices, rating, phone, address,
  links, website URL and the image shown when the site is shared).
- `src/*.html`: one template per page. Values appear as `{{placeholders}}`, e.g. `{{rating.count}}`,
  `{{phone}}`, `{{hours.summary}}`. `src/robots.txt` is a template too.
- `src/partials/*.html`: pieces shared by every page, pasted in with `{{> name}}`:
  `head` (icons, canonical and share tags), `assets` (fonts, CSS, JS), `header` (holiday notice,
  logo + menu), `band` (red "Κλείσε ώρα" section) and `footer` (footer + mobile booking bar).
  Change the menu or footer here once and every page gets it.
- `build.mjs`: pastes the partials, fills the placeholders and writes the finished pages, plus
  `sitemap.xml` and `robots.txt`. It stops with an error, without writing anything, if something is
  missing or wrong. It also adds a fingerprint to the CSS/JS links (`main.css?v=…`), so visitors always
  get the latest version after a change. Needs Node.js 18+, no packages to install.
- `build-helpers.mjs`: small helper functions for `build.mjs` (dates, Greek date text, reading CSV).
- `js/hours.js`: works out "Ανοιχτά / Κλειστά" (used by `js/main.js` in the browser and by the tests).
- `manifest.webmanifest`: name and icon used when someone adds the site to their phone's home screen.
- The finished pages (`index.html`, …, `sitemap.xml`, `robots.txt`) are **not in git**: the Action
  builds them for every deploy, and `npm run build` makes them on your computer for previewing.

## Tests

`npm test` runs the tests in `tests/` (Node's built-in test runner, nothing to install). They check
that every page builds with no `{{placeholders}}` left, that the meta descriptions match the hours
table, the "Ανοιχτά / Κλειστά" sentences for many days and times, holidays (strip, Google data,
expired ones), the Google Sheet import, and that bad data stops the build. The Action runs them before
every deploy: if a test fails, nothing is published.

## "Ανοιχτά τώρα" line

The home page and «Επίσκεψη» show "Ανοιχτά · κλείνει στις 14:00" or "Κλειστά · ανοίγει αύριο στις
09:00". It is worked out in the visitor's browser (`js/hours.js`, Greek time) from the hours and
holidays in `data/site.json`, so it is always current.

## Visitor statistics (optional)

Off by default. To switch it on:

1. Create a free account at goatcounter.com and pick a code, e.g. `afraschopshop`
   (your stats will be at `https://afraschopshop.goatcounter.com`). Check their terms for business use.
2. Put the code in `data/site.json`: `"analytics": { "goatcounterCode": "afraschopshop" }`.
3. Commit and push.

It counts page views and clicks on «Κλείσε ώρα», the phone number, the map, Setmore reviews,
Instagram and TikTok. No cookies, so no cookie banner is needed. The privacy page updates itself
to say so. To switch it off again, set the code back to `""`.

## Privacy page

`src/privacy.html`, linked from the footer. If you change what the site collects, update the text
and the "Τελευταία ενημέρωση" date at the bottom.

## Publishing (GitHub Actions)

`.github/workflows/deploy.yml` runs the tests and `npm run build` on every push to `main` and every
hour, and publishes only the public files (pages, `css/`, `js/`, `assets/`, `sitemap.xml`,
`robots.txt`, `manifest.webmanifest`), so `src/`, `data/` and `tests/` are not served. On pull
requests it only tests and builds. GitHub pauses the hourly runs if the repo has had no activity for
60 days and emails you; re-enable them in the Actions tab.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Dependabot (`.github/dependabot.yml`) opens a pull request once a month when the actions used in the
workflow have a newer version.

## Moving to your own domain

Change `website.url` in `data/site.json` (keep the `/` at the end) and push. Canonical links, share
tags, structured data, `sitemap.xml`, `robots.txt` and the 404 page's paths all follow.
