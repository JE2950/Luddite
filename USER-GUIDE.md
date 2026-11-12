# Ludus: how to use it

Ludus (or whatever you've renamed it) runs quick quiz games in class. You build sets of multiple-choice questions; pupils join a game on their own laptops with a 6-digit code and their first name, and everyone answers at their own pace. Pupils need no accounts, and nothing about them is stored online.

In this guide, "your site" means your Netlify address or your own domain. If you set up a `play.` address, pupils use that.

## Signing in and accounts

- **Sign in:** go to your site's `teacher.html` page (or just your domain, if you set one up) and enter your email and password.
- **Change your password:** click **Password** at the top of the page.
- **Forgotten your password?** Click **Forgotten your password?** on the sign-in page for a reset email, or ask the admin to set a new one.
- **Adding colleagues (admin only):** click **Teachers** at the top, enter their email, and click **Add teacher**. It suggests a starting password; give them that, their email and your site's address. On the same page you can **Set new password** for someone locked out, or **Remove** an account. **Removing a teacher also deletes their sets and folders.**

## Your library

The left-hand side of the library has:
- **My sets:** everything you've made
- **Unfiled:** your sets not in a folder
- **Other teachers' sets:** everyone else's, which you can view, play or host
- **My folders:** your own folders, private to you. Click **+ New folder** to add one; open a folder to rename or delete it. Deleting a folder moves its sets to Unfiled.

The **search box** finds sets by name, tag or subject (and by teacher, under Other teachers' sets). Clicking a tag or the subject label on a set searches for it.

Each set has these buttons:
- **Host live game:** run it with a class (see below)
- **Play solo:** try it yourself as a pupil would
- **View:** every question with its correct answer ticked. Untick **Show answers** if you're projecting it.
- **Edit:** your own sets only
- **Duplicate** or **Copy to my sets:** make your own editable copy
- **Export to Excel:** download the set in the import layout
- **Delete:** your own sets only

## Making a set

Sets save automatically as you type. Watch for **Saved** next to the logo.

1. Open a folder (optional) and click **+ New set**. Give it a name, and choose its **Subject** (Latin, French or None). The subject decides the look, mode names and music of any game played with the set. New sets start with the subject you last chose.
2. For each question, type the question and 2–4 answers, and tick the circle next to the right one. The **Pupil sees** preview shows exactly how it will look.
3. Add **tags**, separated by commas (e.g. `Year 7, fractions`), to find the set later.

**Maths:** wrap maths in dollar signs.

| Type this | To get |
|---|---|
| `$\frac{3}{4}$` | a fraction |
| `$x^2$` | a square |
| `$\sqrt{50}$` | a square root |
| `$3 \times 4$`, `$12 \div 3$` | × and ÷ signs |
| `$2\frac{1}{2}$` | a mixed number |

### Importing lots of questions at once

Click **Import questions**:
- **Paste from Excel:** one question per row, in the columns *Question, Answer 1, Answer 2, Answer 3, Answer 4, Correct answer number (1–4)*. Answers 3 and 4 can be blank. Copy the rows in Excel and paste them into the box, then click **Check rows**. It lists any rows it skipped and why.
- **Paste from Quizlet:** in Quizlet, open the set and choose **⋯ → Export**. Keep the default settings (tab between term and definition, new line between rows), click **Copy text** and paste it in. Choose whether questions show the term, the definition, or both (two questions per card), and how many answers each has. The wrong answers come from other cards in the same set, so a set needs at least 4 cards for 4 answers. Click **Check cards** to see the first question before adding.
- **Upload a file:** an .xlsx or .csv in that layout, or a Blooket spreadsheet import template exactly as Blooket gives it.

Then choose **Add to the end of this set** or **Replace all questions**.

AI tools are good at writing questions in this layout. Ask for "a table with columns Question, Answer 1–4, Correct number, with maths in $…$", then paste it in.

## Running a live game

Use your laptop on the projector. **Your browser tab runs the game**, so keep it open until you've finished.

1. On a set, click **Host live game**.
2. Choose:
   - **Mode:** Classic or the fishing mode (see below)
   - **Game length:** 3–30 minutes, or until you end it
   - **Rank pupils by:** points/catch, correct answers, or accuracy. Accuracy ranks pupils with 10 or more answers above everyone else, so one lucky answer cannot win.
   - **Shuffle answer order:** on by default, so neighbours' screens don't match
3. Click **Open the lobby**. The board shows your site's address and a 6-digit code, and lobby music starts.
4. Pupils go to your site, type the code and their first name, and their names appear on the board. Click a name to remove someone, e.g. a silly name. That laptop and that name are then blocked for the rest of the game.
5. Click **Start game** when everyone's in. The music changes to the game track.
6. During the game:
   - **❚❚ Pause** freezes the timer and every pupil's screen, for when you need eyes on you. **▶ Resume** carries on.
   - **Click a pupil's name** on the leaderboard to see every answer they've given, newest first. The same panel has **Let … join on another laptop**, for a pupil whose laptop has died: click it, and for 2 minutes he can join on a different laptop with the same name and keep his score.
   - The right-hand panel shows class accuracy and the trickiest questions so far, with the most common wrong answer for each.
   - **♪ On/Off** and the slider control the music, which plays from your laptop only.
7. The game ends when time runs out, or when you click **End game**.
8. The results screen shows a podium, the full leaderboard and question stats. Click **Download results** for a spreadsheet with three sheets: **Pupils**, **Questions** and **Every answer**.

If you close the tab by accident, open **Host live game** on the same set within 3 hours and click **Resume it**. The pupils carry on where they were.

## Game modes and scoring

Both modes reward accuracy: a wrong answer resets the pupil's streak and pauses them for 2 seconds while the right answer is shown.

| | Classic (Certamen in Latin, Le Concours in French) | Fishing mode (Piscatus, La Pêche) |
|---|---|---|
| A right answer gives | 100 points × streak multiplier | A fish of random rarity and weight |
| Streaks | ×1 (1–2 in a row), ×1.5 (3–4), ×2 (5–7), ×3 (8+) | Raise the lure level (1–4), which roughly doubles the chance of a rare fish |
| Luck | None | Some: a lucky Legendary can shake up the leaderboard |
| Leaderboard default | Points | Total kg caught |
| Extra | None | About every 3 minutes, a 30-second double-weight event (in games of 5 minutes or more) |

Fish come in five tiers: Common, Uncommon, Rare, Epic and Legendary. To take luck out of the result, rank by correct answers or accuracy instead.

## What pupils see

- They join at your site with the code and a first name. Names pass through a profanity filter, and two pupils can't use the same name at once.
- Each question appears when they click **Show question** or **Next question**. Questions come in a shuffled order and repeat until time runs out.
- After each answer they see straight away whether they were right, with the right answer highlighted.
- When they join, the page changes from the Ludgrove look to the subject's look. Latin sets label the answers I to IV; the number keys 1 to 4 still work.
- If their laptop refreshes or drops out, they rejoin automatically with their score. Moving to a different laptop needs the teacher's say-so (see above).
- At the end they see their position, accuracy and best streak, plus each question they got wrong with the right answer.

## Pupil data

Pupils' names, answers and scores are held only on the teacher's laptop, and are never saved online. The browser keeps the last game for up to 3 hours so a closed tab can be reopened, then wipes it. They pass through the live-game service in transit without being stored. The only data stored online is teacher accounts and the question sets and folders teachers make. Download the results before closing the tab if you want to keep them.
