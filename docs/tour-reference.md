# Help tour: reference from the Ludgrove Division Screen (PR screen)

This note copies the pattern of the guided tour in Jonny's Ludgrove Division Screen (version 20261112-1736). The Ludus tour should look and behave the same way. The screen file itself is not stored here because it holds the staff timetable.

## How it looks

- **Button:** a round "?" icon button in the header, beside the other icon buttons (36 px circle, thin outline, question-mark-in-circle icon). Its tooltip reads "Guided tour (?)".
- **Spotlight:** a fixed box drawn around the element being explained, with:
  - a 2 px gold border (`#C2A463`) and 16 px radius;
  - `box-shadow: 0 0 0 9999px rgba(5,14,28,.78)`, which darkens the rest of the screen;
  - 8 px of padding round the element's box;
  - a 0.2 s ease when it moves between steps.
- **Card:** about 360 px wide (`min(360px, 86vw)`), paper background, 16 px radius, deep shadow. It contains, in order:
  - a small caps line, "Step 3 of 14" (11 px, letter-spacing .18em, muted);
  - the title in the serif face (20 px, 600 weight);
  - the text (14.5 px, line height 1.5);
  - three buttons: **Back**, **Next** (primary; reads **Finish** on the last step) and **Close** (pushed to the right).
- **Card position:** below the lit element. If it doesn't fit, it goes above. If neither fits, it is centred. It is always kept 12 px inside the window.
- **Steps with no element:** if a step has no element, or the element isn't on screen, the spotlight hides and the card sits in the middle.

## How it behaves

- **Opening:** the "?" button or the **?** key starts at step 1.
- **Keys:** **Right arrow** or **Enter** goes forward, **Left arrow** goes back, **Esc** closes. Other shortcuts are paused while the tour is open.
- **Modes:** a step can name a mode, and the tour switches the screen to it first. When the tour closes, the screen goes back to the mode it was in before.
- **Placement:** the card is placed about 90 ms after each step change, so the layout can settle first. It is re-placed when the window resizes.

## How the text is written

- One short title per step, saying what the area is, for example "Pointer, pen, highlighter, rubber", "Casting to a second display" or "Save what you have done".
- Two to four plain sentences: what it does, how to use it, and the keyboard key if there is one.
- No headings or bullets inside a card.
- The tour ends on Settings.

## Ludus tours to write (from TODO item 6)

| Page | Steps |
|---|---|
| Dashboard | folders, new set, Excel paste, Quizlet paste, Assignments button, help |
| Set editor | subject, questions and answers, the repeated-answer warning, swap questions and answers, pictures |
| Host settings | mode, teams, timing, music, QR code and join address |
| Live game | pause, next, present mode, the race, results download |
| Assignments | new assignment, code and poster, slips, results table, pupil drill-down, close or reopen |

Tours only start from the "?" button or the ? key. They never start by themselves (Jonny, 13 Nov 2026).
