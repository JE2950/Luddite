# Ludus: to-do list

Agreed with Jonny, 12 November 2026. Nothing below is built yet.

Done since: the Ludgrove background is now off-white cream (12 Nov).

## Look and layout

1. **Themed posters and slips.** The assignment poster and print slips take the set's subject design (Latin, French, Geography), not plain Ludgrove navy.
2. **Race background.** Make the track a near top-down view that fills each lane, so no runner floats. Only the top edge shows the setting: temples (Latin), a Paris street (French), mountains or a globe (Geography).
3. **Name boxes.** The white label behind each name on the race fits the length of the name.
4. **Present mode.** A host-screen button that shows only the race, full screen, for the board.
5. **Phones.** Each question and its answers fit on one screen with no scrolling. Turn the runner strip off on phones; keep it on tablets and laptops.

## New features

6. **Help tour.** A "?" button in the header for signed-in teachers. It runs a step-by-step tour (screen dims, one part lights up, a card explains it, with Next, Back and Skip). There is one tour each for the dashboard, set editor, host settings, a live game and assignments. Each tour runs by itself the first time a teacher opens that page. Match the tour on the Ludgrove PR screen: see `docs/tour-reference.md`.
7. **Swap questions and answers.** An option on Quizlet import (and in the set editor) to turn the set round: term becomes answer, definition becomes question. Keep the duplicate-answer grouping working in both directions.
8. **Pictures as questions or answers.** For example, guess the flag. A teacher can add an image to a question, or use images as the answer choices. Store images in Supabase Storage. Check upload size, and that pupil screens and the board both show them clearly.
9. **Geography subject.** A third design, with its own:
   - colours and fonts
   - detection rules (place names, capitals, countries, flags)
   - game mode names
   - team names
   - fishing treasures, worth pounds (£)
   - music, already in the repo: `assets/music/geography-lobby.mp3` (Curious Pulse, lobby) and `assets/music/geography.mp3` (Curious Expedition, game)
   - runners

## Geography runners

Source sheet: `assets/runners/source/geography-sheet.jpg`. Cut out the same way as the Latin and French sheets.

| Row, side | Character | File name |
|---|---|---|
| 1, left | Explorer, man (pith helmet, scroll map) | `explorer-m` |
| 1, right | Explorer, woman (glasses, folding map) | `explorer-f` |
| 2, left | Mountaineer (red jacket, ice axe, compass) | `mountaineer` |
| 2, right | Polar explorer (blue parka) | `polar` |
| 3, left | Land Rover with driver; fall: tipped over | `landrover` (rare, like the chariot) |
| 3, right | Camel rider | `camel` (rare) |
| 4, left | Jungle explorer (machete, binoculars) | `jungle` |
| 4, right | Geologist (hard hat, hammer) | `geologist` |

Two notes on the sheet:
- The geologist's second running frame holds a magnifying glass, not the hammer. It is usable, but it flickers.
- The Land Rover's two frames are identical. That is fine for a vehicle.

## Still to decide

- Geography team names. My suggestion: Explorers, Navigators, Pioneers, Voyagers.
