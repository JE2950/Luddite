# Ludus: setup guide

Ludus is a classroom quiz game, similar to Blooket. Teachers build sets of multiple-choice questions; pupils join a live game on their own laptops with a 6-digit code and their first name, and answer at their own pace while a leaderboard and class stats show on the projector. Pupils need no accounts, and nothing about them is stored online.

This guide gets your own copy running. It takes 30–45 minutes, needs no coding, and costs nothing (a custom web address is optional, at roughly £10 a year). Once it's running, **USER-GUIDE.md** explains day-to-day use.

This copy is set up for Ludgrove: the home pages use the school's navy and white, and each set can be tagged **Latin** or **French**. A tagged set takes on that subject's look, with a pixel takeover animation, as soon as a game starts. The name, subjects, colours and music are all in `assets/config.js` and `assets/style.css`.

## How it fits together

| Part | What it does | Service (free plan) |
|---|---|---|
| The code | This folder: the web pages and settings | **GitHub** holds it |
| The website | Serves the pages to teachers and pupils | **Netlify** publishes it straight from GitHub |
| The database | Teacher accounts, question sets and folders, and the live-game connection | **Supabase** |

When you change a file on GitHub, Netlify republishes the site automatically within a minute or two.

**What's in this folder:**
- `index.html`: the pupil page (join a game)
- `teacher.html`: the teacher area (sign-in, library, set editor)
- `host.html`: the live-game screen for the projector
- `assets/config.js`: **your settings, the only file you need to edit** (name, crest, subjects)
- `assets/theme.js`: switches between the Ludgrove, Latin and French looks
- `assets/`: styles, scripts, fonts, music, icons
- `supabase/setup.sql`: the database setup, run once
- `supabase/functions/quiz-admin/index.ts`: a small server function behind the Teachers admin page
- `_headers`: tells browsers which files they can keep, so pages load faster

## Before you start

Make free accounts at:
- **github.com**
- **supabase.com** (you can sign in with GitHub)
- **netlify.com** (sign in with GitHub, which makes step 7 easier)

Have this folder unzipped on your computer.

## Step 1: Put the code on GitHub

The code already lives in the GitHub repository **JE2950/Luddite**, so there is nothing to upload. If you ever start again in a new repository, upload everything inside this folder (not the folder itself).

Check that `index.html`, `teacher.html` and the `assets` folder are at the top level of the repository, not inside another folder.

## Step 2: Create the Supabase project

1. In Supabase, create an **organisation** if asked: any name, type **Personal**, plan **Free**.
2. Click **New project**:
   - **Name:** anything, e.g. `quiz-arena`
   - **Database password:** click **Generate**, and save it somewhere safe (you won't need it day to day)
   - **Region:** **London (eu-west-2)**, so the data stays in the UK
   - Under **Security**, set **Enable Data API** on, **Automatically expose new tables** off, and **Enable automatic RLS** on
3. Click **Create** and wait a minute or two for it to finish setting up.

## Step 3: Lock sign-up and create your account

Accounts are created by the admin (you), so pupils and strangers can't sign themselves up.

1. Go to **Authentication → Sign In / Providers**. Under **User Signups**, switch **Allow new users to sign up** off, and save. Leave **Email** on as a provider.
2. Go to **Authentication → Users → Add user → Create new user**. Enter your email and a password, tick **Auto Confirm User**, and create it.

## Step 4: Set up the database

1. Open `supabase/setup.sql` in Notepad.
2. Near the bottom, replace `YOUR-EMAIL-HERE` with the email from step 3, keeping the quote marks. This makes you the admin.
3. In Supabase, go to **SQL Editor → New query**, paste the whole file and click **Run**.
4. Supabase may warn about "destructive operations". That's expected: the `drop` lines only replace earlier copies of these rules, so click Run anyway.
5. You should see **Success. No rows returned**.

This creates the tables for folders and sets, and the access rules: only signed-in teachers can see sets, each teacher's folders are private, and teachers can only change their own sets.

## Step 5: Fill in your settings

1. In Supabase, find two values:
   - **Project URL:** **Project Settings → Data API**, looks like `https://abcdefgh.supabase.co`
   - **Publishable key:** **Project Settings → API Keys**, starts `sb_publishable_`. If you only see legacy keys, use the one marked **anon / public**.
   - **Never** use the `secret` or `service_role` key here.
2. On GitHub, open `assets/config.js` and click the pencil icon (**Edit**).
3. Paste the two values between the quote marks. While you're there, change `name` to whatever you want to call it, and change the mode names if you like.
4. Click **Commit changes**.

The publishable key is designed to be public: the database rules from step 4 decide what it can do.

## Step 6: Add the admin function (for the Teachers page)

This lets you add colleagues and reset their passwords from inside the site. It runs on Supabase's servers, so the secret key it needs never reaches the website.

1. In Supabase, go to **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `quiz-admin` (or match whatever `adminFunction` says in `config.js`).
3. Delete the sample code, paste in the whole of `supabase/functions/quiz-admin/index.ts`, and click **Deploy**.

## Step 6b: Turn on assignments

In Supabase, go to **SQL Editor → New query**, paste the whole of `supabase/assignments.sql` and click **Run** (accept the "destructive operations" warning). This adds assignments and revision folders. Until it has run, the **Assign** buttons stay hidden.

## Step 7: Publish the website on Netlify

1. In Netlify, click **Add new site → Import an existing project → GitHub**, and allow access to your repository.
2. Choose your repository and branch `main`.
3. Leave **Build command** empty and **Publish directory** empty, then click **Deploy**.
4. After a minute it's live at an address like `random-name-123.netlify.app`. To choose a nicer one, go to **Site configuration → Change site name**.

## Step 8: Tell Supabase your web address

This is for password-reset emails.

1. In Supabase, go to **Authentication → URL Configuration**.
2. Set **Site URL** to your Netlify address, e.g. `https://quiz-arena.netlify.app`.
3. Under **Redirect URLs**, add the same address followed by `/**`, e.g. `https://quiz-arena.netlify.app/**`, and save.

## Step 9: Test it

1. Go to `https://your-address/teacher.html` and sign in. You should see an empty **My sets**. If you see "Almost there", `config.js` still needs your Supabase details (step 5).
2. Check a **Teachers** button appears at the top. If not, check the email in step 4 matched your account exactly, then sign out and in again.
3. Make a set with a few questions, click **Host live game**, and open the lobby.
4. On your phone (or an InPrivate/Incognito window), go to `https://your-address`, enter the code and a name, and play a few questions.
5. If pupils get stuck on "Joining…": in Supabase, open **Project Settings → Realtime** and check that public channels are allowed (not "private channels only").

## Optional: your own web address

A short address like `play.myquiz.com` is easier for pupils to type. School web filters also sometimes block `netlify.app` sites; your own domain is easier for IT to allow.

1. Buy a domain. You can do this in Netlify (**Domains → Register a domain**, which sets everything up automatically) or from a company such as Cloudflare or Namecheap.
2. In Netlify, open your site, go to **Domain management → Add a domain**, and add your domain (e.g. `myquiz.com`). Then **Add a domain alias** for `play.myquiz.com`. If you bought the domain elsewhere, add the DNS records Netlify shows you at the company you bought it from.
3. Make `myquiz.com` the **primary domain**. HTTPS (the padlock) is added automatically within the hour.
4. In `config.js`, set `domain: 'myquiz.com'` and `playHost: 'play.myquiz.com'`, then commit.
5. Redo step 8 with the new address.

Teachers then use `myquiz.com` (which opens teacher sign-in) and pupils use `play.myquiz.com` (which opens the join page). The host screen tells pupils the play address automatically.

## The school network

If the site won't load at school, ask IT to allow:
- your site's address (and its `play.` address, if you set one up)
- your Supabase address, e.g. `abcdefgh.supabase.co`, including secure WebSockets (used for live games)

A summary of the data protection position for IT, which you can copy:
- **Pupils (live games):** no accounts, logins or emails. They join with a game code and a first name, which passes through a profanity filter. Names, answers and scores are held on the teacher's laptop only: in the browser tab during a game, and in that browser's storage for up to 3 hours afterwards so a closed tab can be reopened. They pass through the live-game service in transit without being stored. Each pupil's traffic travels on a channel only that pupil's browser and the teacher's tab can work out, so pupils cannot read or send each other's answers.
- **Pupils (assignments and revision folders):** no accounts. For each play, the pupil's first name and surname initial (as typed), the score and each answer are stored in Supabase (London), readable only by the teacher who set the assignment. Pupils reach them only through three database functions that check the code. Deleting an assignment deletes its plays.
- **Stored online:** teacher accounts (email and a hashed password) and the question sets and folders teachers make. They're held by Supabase in its London region, readable only by signed-in teachers.
- **The website:** a static site served over HTTPS. No adverts, analytics or tracking, and all code, fonts and libraries are served from the site itself.

## Changing things later

- **Name, web address, mode names:** edit `assets/config.js` on GitHub and commit.
- **Colours:** in `assets/style.css`, change the `--accent` and `--accent-deep` colours near the top (both the light and dark sets).
- **Crest:** upload the school crest as `assets/ludgrove-logo.png`. It appears on the join page, the sign-in page and the library. Until the file exists the pages show the name alone.
- **Music:** each subject has a lobby track (`latin-lobby.mp3`, `french-lobby.mp3`), playing while pupils join, and a game track (`latin.mp3`, `french.mp3`) from Start to the end. Music plays from the host laptop only; pupils' laptops stay silent. Replace a file to change it. Sets with no subject use `lobby.mp3`, `classic.mp3` and `fishing.mp3`. The tracks loop, so pick ones without a long intro or fade-out. Browsers can keep the old tracks for up to a day.
- **Subjects:** the `subjects` block in `assets/config.js` holds each subject's name, mode names, fish names and takeover colours. Its colours and fonts are in `assets/style.css` under "Subject themes". A new subject also needs adding to the `subject in (...)` line of `supabase/setup.sql`.
- **Add teachers:** use the **Teachers** page in the site. They sign in with the email and starting password you give them.

## Things to know about the free plans

- **Supabase pauses free projects after about a week with no activity.** If the site says it can't load sets after a holiday, sign in to Supabase and click **Restore project**. It takes a couple of minutes, and nothing is lost.
- **Live games are comfortable up to about 30 pupils at once.** Supabase's free plan allows 100 live messages a second.
- **Supabase's built-in email sends only a few password-reset emails an hour.** If one doesn't arrive, set a new password from the **Teachers** page instead.

## Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| "Almost there" on every page | `config.js` still has the PASTE placeholders. Do step 5. |
| "Couldn't load your sets" | Supabase project paused (restore it), or the URL/key in `config.js` is wrong. |
| Sign-in says the email and password don't match | Check the account exists under **Authentication → Users** and is confirmed. |
| No **Teachers** button | Step 4's email didn't match. Rerun the last lines of `setup.sql` with the right email, then sign out and in again. |
| Teachers page says the admin tools aren't set up | The function isn't deployed, or its name doesn't match `adminFunction` in `config.js` (step 6). |
| Pupils stuck on "Joining…" or "No game found" | Realtime public channels are switched off (step 9.5), or the school filter blocks the Supabase address. |
| Page loads as plain unstyled text at school | The school filter is blocking the site. Ask IT to allow it, or use your own domain. |
| Password-reset email link goes to the wrong site | Step 8's Site URL or Redirect URL is wrong. |

## Credits

- **Libraries:** MathJax 3 (maths display, Apache 2.0), SheetJS Community Edition (spreadsheets, Apache 2.0) and supabase-js (MIT).
- **Fonts:** Libre Baskerville, Cinzel, EB Garamond, Playfair Display, Atkinson Hyperlegible and JetBrains Mono (SIL Open Font Licence).
- **Music:** made with Suno, for classroom use.
