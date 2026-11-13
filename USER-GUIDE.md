# Ludus: how to use it

Ludus (or whatever you've renamed it) runs quick quiz games in class. You build sets of multiple-choice questions; pupils join a game on their own laptops with a 6-digit code and their first name, and everyone answers at their own pace. Pupils need no accounts, and nothing about them is stored online.

Every page has a **?** button in the top corner (or press the **?** key). It walks you round that page one part at a time: Back and Next, or the arrow keys, and Esc to close.

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

1. Open a folder (optional) and click **+ New set**. Give it a name, The subject decides the look, mode names and music of any game played with the set. Leave **Subject** on **Work it out** and the app reads the title, tags and questions: Latin dictionary entries, macrons and Latin words make it Latin; accents and French words make it French; country names, capitals, rivers, mountains and geography words make it Geography. The box shows what it worked out, e.g. "Latin (worked out)". Choose Latin, French, Geography or None to override it.
2. For each question, type the question and 2–4 answers, and tick the circle next to the right one. The **Pupil sees** preview shows exactly how it will look.
3. Add **tags**, separated by commas (e.g. `Year 7, fractions`), to find the set later.

**Pictures:** click **🖼 Add a picture** under a question to show a picture with it (a flag, a map, a diagram). The words become optional. Click **🖼** beside an answer to make that answer a picture. Pasting a picture's web address (ending .png, .jpg, .webp, .gif or .svg) into an answer box does the same, and so does putting the address in a cell of a pasted Excel row. Pictures are shrunk before they're stored, so a phone photo is fine. A guess-the-flag set is quickest as Excel rows: a flag's address in the Question column, then country names as the answers.

**Swap questions and answers:** **⇄ Swap questions and answers** turns the whole set round, so each right answer becomes the question and the old question becomes its answer. The wrong answers come from the other questions. Run it again to swap back. Questions that share a right answer are combined, so no wrong answer is ever another right one. A picture question becomes a picture answer, so "Which country is this flag?" turns into "France: which flag?".

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
- **Paste from Quizlet:** in Quizlet, open the set and choose **⋯ → Export**. Keep the default settings (tab between term and definition, new line between rows), click **Copy text** and paste it in. Choose whether questions show the term, the definition (swapped), or both (two questions per card), and how many answers each has. Cards that share a word are combined: *domini* becomes one question whose answer is "genitive singular / nominative plural / vocative plural". The wrong answers come from other cards in the same set, so a set needs at least 4 cards for 4 answers. Click **Check cards** to see the first question before adding.
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
3. Click **Open the lobby**. The board shows your site's address and a 6-digit code, and lobby music starts. Below them is the game's **joining link**: click **Copy link** and push it to pupils' devices from your classroom app. The link opens the join page with the code filled in, so each pupil only types his name.
4. Pupils go to your site, type the code and their first name, and their names appear on the board. Click a name to remove someone, e.g. a silly name. That laptop and that name are then blocked for the rest of the game.
5. Click **Start game** when everyone's in. The music changes to the game track.
6. During the game:
   - **❚❚ Pause** freezes the timer and every pupil's screen, for when you need eyes on you. **▶ Resume** carries on.
   - **Click a pupil's name** on the leaderboard to see every answer they've given, newest first. The same panel has **Let … join on another laptop**, for a pupil whose laptop has died: click it, and for 2 minutes he can join on a different laptop with the same name and keep his score.
   - The right-hand panel shows class accuracy and the trickiest questions so far, with the most common wrong answer for each.
   - **♪ On/Off** and the slider control the music, which plays from your laptop only.
   - **Present** (or the **P** key, in Classic mode) shows only the race, full screen, for the projector. Esc or **Back to dashboard** returns.
7. The game ends when time runs out, or when you click **End game**.
8. The results screen shows a podium, the full leaderboard and question stats. Two downloads:
   - **Download results:** a spreadsheet with four sheets: **Pupils**, **By pupil and question**, **Questions** and **Every answer**.
   - **Pupil weaknesses (CSV):** one row per pupil per question they met, with the date, set, subject, question, correct answer, times asked, right and wrong, a Result (Right, Wrong or Mixed), a Weakness flag (Yes if they got it wrong at least once) and their wrong answers. Every column has a plain heading and the file opens in Excel, so another program or an AI can read it straight in and build questions on each pupil's weak spots.

If you close the tab by accident, open **Host live game** on the same set within 3 hours and click **Resume it**. The pupils carry on where they were.

## Teams

In the host settings, choose **2 teams**, **3 teams** or **4 teams**. Pupils go into the smallest team as they join; **Shuffle teams** in the lobby mixes them up again. Each pupil's points (or treasure) count towards his team. The board shows the team totals above the leaderboard, each pupil sees his team on his screen, and the results and download include a **Teams** sheet. Team names follow the subject: Romani, Graeci, Galli and Carthaginienses for Latin; Les Bleus, Les Rouges, Les Verts and Les Jaunes for French; Explorers, Navigators, Pioneers and Voyagers for Geography.

## The runner and the treasures

- **Classic mode:** a character runs across the top of each pupil's screen. A right answer gives him a burst of speed; a wrong one trips him over. Latin sets give a man or woman in a toga, a gladiator, or now and then a charioteer. French sets give a mime, a chef with a frying pan or a peasant in a garlic necklace. Geography sets give an explorer, a mountaineer, a polar explorer, a jungle explorer or a geologist, and now and then a Land Rover or a camel. On the board, the top six pupils (or the teams) race each other, placed by their scores. On phones the runner stays off, so the question and answers fit on one screen.
- **Fishing mode with a subject set:** each right answer brings up a treasure instead of a fish, worth denarii (Latin), francs (French) or pounds (Geography): from rusty swords, garlic bulbs and soggy maps up to the Golden Fleece, the Great Golden Cheese and the Golden Globe.
- **The characters** are pictures in `assets/runners` (see the note there). Replace a file to change a character.

## Worksheets

Open a set and click **🖨 Worksheets** to print it as a paper sheet. Choose one of six kinds:

- **Match up:** two columns; pupils write the letter of the matching answer in each box.
- **Crossword:** the questions are the clues and the answers go in the grid.
- **Gap fill:** each question with a line for the answer, and a word bank if you tick it. If a question already has a gap, such as `J’___ un frère` or `…`, the line goes in that gap.
- **Word search:** the answers are hidden in the grid, with the questions as clues. Tick **Words can run backwards** for a harder grid.
- **Anagrams:** each answer with its letters jumbled.
- **Multiple choice:** each question with its answers, labelled a to d.

Choose how many questions to include (fewer than the set picks them at random) and which way round they go. The preview shows exactly what will print. **New layout** shuffles the order and the grid, and **Print** prints it, with the answers on a separate page unless you untick that box. Choose Save as PDF in the print box to keep a copy.

Crosswords and word searches drop accents and macrons from the grid and leave out answers that are pictures, numbers or maths. Gap fills and anagrams leave out picture answers. The page tells you how many questions it left out and why. Sheets take the subject's look, like the posters.

## Assignments and revision folders

Pupils can also play on their own, outside lessons, and you see how they get on.

- **Set an assignment:** click **Assign** on a set. Choose the title pupils see, the mode, how long each round lasts, and a due date if you want one. Click **Create code**.
- **Share a revision folder:** open one of your folders and click **Share for revision**. Pupils choose from every set in the folder, including sets you add later.
- **Give pupils the code:** each assignment has a 5-character code (letters and numbers), a QR code and a direct link. **Print poster** gives one large A4 sheet for the board; **Print slips** gives eight to cut out.
- **What pupils do:** go to the site (or scan the QR code), type the code, then their first name and the first letter of their surname. They can play as many times as they like. Before each round they see their best score and the questions they keep getting wrong, and those questions come up twice as often.
- **Results:** click **Assignments** at the top, then an assignment. You see each pupil's plays, best score, accuracy and number of questions to practise; click a name to list those questions. **Pupil weaknesses (CSV)** downloads one row per pupil per question, in the same layout as the live-game download. Click **Refresh** for the latest plays.
- **Close** stops pupils opening the code (reopen it any time). **Delete** removes the code and every saved play.

A pupil who types his name two ways ("Hugo B" and "Hugh B") shows up twice, so tell the class to use the same first name each time.

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

**Live games:** pupils' names, answers and scores are held only on the teacher's laptop, and are never saved online. The browser keeps the last game for up to 3 hours so a closed tab can be reopened, then wipes it. They pass through the live-game service in transit without being stored. The only data stored online is teacher accounts and the question sets and folders teachers make. Download the results before closing the tab if you want to keep them.

**Assignments and revision folders:** each play is saved online in the Supabase project (London): the pupil's first name and surname initial as typed, the score, and each answer. Nothing else is stored. Deleting an assignment deletes its plays.
