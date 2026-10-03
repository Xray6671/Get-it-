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

## Compliance Hub (`hub.html`)
A login area where business owners track employee safety training: employees, knowledge checks (graded on the server), training files and a CSV export. Its code is `hub.html`, `hub.js` and `hub-config.js`; the database is in `supabase/`. Nothing links to it yet, and search engines are told not to index it.

`compliance-hub-demo.html` is a separate sample page with made-up data. It saves nothing outside the visitor's browser.

### One-time setup
1. Create a free project at [supabase.com](https://supabase.com). Choose a US region.
2. In the project, open **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**. It is safe to run again after edits; it keeps existing data.
3. Open **Project Settings → API** (or the **Connect** button). Copy the **Project URL** and the **anon / publishable** key into `hub-config.js`. Never use the `service_role` or secret key.
4. Open **Authentication → URL Configuration**. Set **Site URL** to `https://nevadabusinesswatch.com/hub.html` and add the same address under **Redirect URLs**. Confirmation and password-reset emails link there.
5. Leave **Confirm email** on (Authentication → Providers → Email).
6. Before real clients sign up, set up your own email sender under **Authentication → Emails → SMTP Settings**. Supabase's built-in sender only allows a handful of emails per hour.

If you put the project on a custom domain, add that domain to `connect-src` in the security policy at the top of `hub.html`.

### Changing the knowledge checks
Edit the questions and answers at the bottom of `supabase/schema.sql` and run the file again in the SQL Editor. Answers live in a `private` table that browsers can't read. If you remove a question, also delete its row from `public.course_questions`.

### Tests
- **Access rules**, on a local Postgres 16, using stand-ins for Supabase's `auth` and `storage`. Run them against an empty database:
  ```
  psql -d hubtest -f supabase/tests/supabase_stub.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
  ```
- **The page**, in Chromium with a fake Supabase client. This needs Playwright:
  ```
  node supabase/tests/hub.test.mjs
  ```

Never run `supabase_stub.sql` on a real Supabase project.
