# Prompt history

Tool: Claude (claude.ai, Claude Code harness). These are all the prompts I sent, in order, copied verbatim (typos kept). AI responses are not included. The only other input was the three attached files in prompt 1.

| # | Prompt |
|---|---|
| 1 | Attached: the project brief (`attachment.txt`), the YottaFlex AI Candidate Project Submission Guidelines (PDF) and the Candidate Project FAQ (PDF), plus: `/ponytail ultra yagani build this website in html format for github.` |
| 2 | `continue` (sent twice, after output limits) |
| 3 | `okay can you run the html here so that i can inspect` |
| 4 | `can you publish it in my github ?` |
| 5 | `warehouse-slotting use this github repo of mine and publish it` |
| 6 | `remove your name and extra data which will leads to it is build using ai` |
| 7 | `okay can you make the page live using github pages` |
| 8 | `okay can you make readme more detailed and include badges in it` |
| 9 | `can you make readme more eye cache and in about section write Description and Topics` |
| 10 | `now check weather link in github working or not and add more details and design to it` |
| 11 | `can you make it more stylish website i know it's working well but it look like legacy build website can you add animation , layout and design matching with the project but looks more like website of 2026` |
| 12 | `can you make the old legacy layout previous version as a option if someone doesn't want the modern layout` |
| 13 | `i want that classic.html in index.html as a option to use in live browser and optimize the index.html if the data is big how to handle` |
| 14 | `i want classic to be like the first html you have generated and remove the glow when mouse hover` |
| 15 | `okay now cross check is the html matches with the requirement` |

Note on prompt 6: I asked for the AI traces to be removed. The assistant declined, because the submission guidelines require AI use to be disclosed. Nothing was removed, and this file and the README section "AI use" stay.

## Where AI was used
- **Generated almost everything.** The AI wrote the first version of all code (`dict.js`, `engine.js`, `session.js`, `worker.js`, `gen.js`, `index.html`), the README, the data dictionary generator and the banner. I did not write code by hand.
- **Design choices were the AI's proposals**, which I accepted: the slotting rules, derived-value formulas, anomaly injection design and validation checks. I steered the web UI (modern layout, classic layout option, big-data handling) through prompts 10 to 14.
- **What I need to own:** I should be able to explain every rule in `engine.js` (see README "Generation logic") and the limitations listed in the README. Update this section with what you personally reviewed or changed before submitting.

## How it was verified
- `node gen.js`, `node gen.js --full` and `node gen.js --large` all exit 0: 0 validation failures, detector flags 0 rows on clean data and exactly the injected rows, and two runs are byte-identical.
- `index.html` was loaded in headless Chromium (worker path and the file:// fallback, both layouts, desktop and phone width).
- A cross-check against the brief (prompt 15) found and fixed three issues: repeated SKUs inside one order, injected rows with an identifiable date, and a README claim about peak-day capacity that did not hold.
