# Nevada Business Watch website

Static website (HTML, CSS, and a little JavaScript) for Nevada Business Watch LLC, in English and Spanish. It has no build step: every page is a plain `.html` file in this folder.

## Pages
| English | Spanish |
|---|---|
| index.html | index-es.html |
| services.html | services-es.html |
| safety.html | safety-es.html |
| about.html | about-es.html |
| contact.html | contact-es.html |
| lessons.html | lessons-es.html |
| privacy.html | privacy-es.html |
| terms.html | terms-es.html |

There's also `404.html` (page not found). Shared styles are in `styles.css`, and shared scripts (text size, menu, animations, lesson checklists) are in `site.js`. Sample reports are in `reports/`.

## Preview locally
```
npx http-server -p 8080 .
```
Then open http://localhost:8080.

## Contact form
The form posts to FormSubmit at `https://formsubmit.co/ajax/xray_navy@yahoo.com` (see `FORMSPREE_ENDPOINT` in `contact.html` and `contact-es.html`). The first submission sends an activation email to that inbox, and someone has to click the link in it once. Until then, and whenever the service is down, the form falls back to opening the visitor's email app.

To change the address, replace it in every `.html` file, including both form endpoints.

## Publishing
`.github/workflows/pages.yml` deploys the site to GitHub Pages on every push to `main`. Before the first deploy, someone has to set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

To serve it from nevadabusinesswatch.com, add the domain under **Settings → Pages → Custom domain**, then point the domain's DNS at GitHub Pages. Canonical URLs and the sitemap already use that domain.
