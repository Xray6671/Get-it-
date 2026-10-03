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

## My Business File (`business-file.html`)
The client app, in English and Spanish. Its code is `business-file.js` and `business-file.css`, configured by `business-file-config.js`; the database is in `supabase/`. Nothing links to it yet, and search engines are told not to index it.

- **Clients** sign in with a one-time code sent to their email (no passwords). They see their licenses, insurance and other documents with what needs action, upload new copies, read updates from NBW, and use the **Safety** tab: it shows what Nevada requires for their crew size and heat exposure (NRS 618.383 and Regulation R131-24) and lets them order a Safety & Heat package.
- **Crew training** is on the Safety tab. Clients add their employees; each knowledge check (Heat Illness Prevention, Hazard Communication) shows key points to read, asks the employee to confirm they read them, then asks the questions, and the employee signs by typing their name. Everything is in English and Spanish. The database grades the answers, so the answer key never reaches the browser; records can only be added; employees are archived, never deleted. A check is due again 12 months after it was passed.
- **Orders** use the prices on `safety.html`. Clients on a plan get 15% off, rounded to whole dollars. The database sets the price; no payment is taken in the app. An order is a request that NBW confirms, reprices if needed (for example the founding rate) and invoices.
- **NBW staff** use `staff.html`: the review queue, each client's documents, files and crew training status, accepting an upload (with its expiration date) or sending it back with a note, requesting missing documents, posting updates, confirming orders, adding clients and giving people access.

Every upload stays **Under review** until someone at NBW accepts it, so someone has to check `staff.html` regularly. The database records who reviewed each document or handled each order, and when. Nobody can delete stored files from the browser. Each client can store up to 500 files; if an upload's record fails, the file is left over, and staff can list these with `select * from public.orphan_files();` in the SQL Editor and delete them in **Storage → client-files**.

Not built yet: emails to staff about new uploads and orders, reminder emails before documents expire, and card payments.

### Changing the knowledge checks
Edit the courses, questions and answers at the end of `supabase/schema.sql` and run the file again in the SQL Editor. Each question has English and Spanish text; have a native speaker review the Spanish. Answers live in a `private` table that browsers can't read. If you remove a question, also delete its row from `public.course_questions`. The demo keeps its own copy of the content in `business-file.js` (`DEMO_COURSES`, `DEMO_QUESTIONS`).

### Demo (`business-file-demo.html`)
The same app on example data: Marco from Desert Ridge Roofing. It has no config file, so it never connects to anything. Uploads and orders stay in the browser tab, and reloading starts over. The real `business-file.html` never shows example data: until Supabase is set up, it says the Business File isn't open yet.

### One-time setup
1. Create a free project at [supabase.com](https://supabase.com). Choose a US region.
2. In the project, open **SQL Editor → New query**, paste all of `supabase/schema.sql` and click **Run**. It is safe to run again after edits; it keeps existing data.
3. Open **Project Settings → API** (or the **Connect** button). Copy the **Project URL** and the **anon / publishable** key into `business-file-config.js`, and check the phone number and email there. Never use the `service_role` or secret key.
4. Open **Authentication → URL Configuration**. Set **Site URL** to `https://nevadabusinesswatch.com/business-file.html`, and add that address and `https://nevadabusinesswatch.com/staff.html` under **Redirect URLs**.
5. Turn off new sign-ups (**Authentication → Sign In / Providers → Allow new users to sign up**). NBW creates every account, so strangers can't make one.
6. Make yourself NBW staff: add yourself under **Authentication → Users → Add user**, then run this in the SQL Editor with your email:
   ```
   insert into public.staff (user_id) select id from auth.users where email = 'you@example.com';
   ```
   Repeat for each team member. Only do this for NBW staff: they can see every client's files. To remove someone, `delete from public.staff where user_id = ...`.
7. Set up your own email sender under **Authentication → Emails → SMTP Settings**. Sign-in codes go out by email, and Supabase's built-in sender only allows a handful per hour.

**Adding a client:** add the person under **Authentication → Users**, then in `staff.html` use **Add a client** and **Give someone access** with their email.

If you put the project on a custom domain, add that domain to `connect-src` in the security policy at the top of `business-file.html` and `staff.html`.

### Tests
GitHub runs both suites on every pull request and every push to `main` (`.github/workflows/tests.yml`). The site deploy (`.github/workflows/pages.yml`) leaves out `supabase/`, `.github/` and this README.

- **Access rules**, on a local Postgres 16, using stand-ins for Supabase's `auth` and `storage`. Run them against an empty database:
  ```
  psql -d apptest -f supabase/tests/supabase_stub.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
  ```
- **The pages** (the demo, the live app against a fake Supabase client, and the staff page), in Chromium. This needs Playwright:
  ```
  node supabase/tests/app.test.mjs
  ```

Never run `supabase_stub.sql` on a real Supabase project.
