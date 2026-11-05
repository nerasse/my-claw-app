# The validated UI reference

This folder is the mockup the 0.6.x interface was built from, kept as source rather than as
screenshots: `v3/` is the version the owner picked and iterated on, in plain HTML and CSS.

It is not served, not built, and not part of the app. Open `index.html` in a browser to look at it;
nothing here needs a server or a login.

Why it is kept after the work landed, given that `PLAN-UI-REFONTE.md` §13 records what was
delivered: the plan says what was decided, this says what it looked like. Numbers that were argued
over (a 28 pt control box, the 46 pt gauge track, the 720 pt threshold where the header drops a
control) are easier to re-derive from the mockup than from a commit message, and the next person to
touch the header will want to see the strip they are changing.

Some of it deliberately differs from the app and should not be copied back:

- It is French, the app is English.
- Its phone layout is drawn with `compact.css` at fixed breakpoints; the app decides from
  `core/layout.ts` and `app/headerControls.ts`.
- Its colours are the Sable palette only. The app ships ten themes plus a custom palette, and the
  mockup predates that.

The screenshots that came with it (17 PNG, 4 MB) are not in the repository. They were an argument
during the work, not a reference afterwards; the CSS is the durable half.
