# FINAL OPTIMIZATION STATUS

Date: 2026-09-06

Feed scheduler: PASS — at most one shared RAF scheduler.

Feed pagination: PASS (static) — latest 24/source realtime; older pages 20/source.

Feed virtualization: NOT COMPLETE — currently a 72-card hard bound, not reversible spacer/recycler windowing.

Feed DOM bound: PASS WITH LIMITATION — bounded at 72, but deep-history navigation beyond the retained window needs true virtualization.

Messages recent realtime: PASS (static) — `limitToLast(50)`.

Messages pagination: PASS (static) — older page size 40 with document cursor, ID dedupe and scroll-height anchoring.

Messages virtualization: NOT COMPLETE — loaded pages are still all represented in DOM.

Messages DOM bound: FAIL — no final spacer/recycler maximum yet.

Mobile GPU tier: PARTIAL — balanced/economy CSS rules and Canvas quality response exist; real-device paint/composite trace is pending.

Gravity physics: PASS (static) — fixed 60 Hz independent of render FPS.

Gravity HUD: PASS (static) — 4 Hz and pre-sorted leaderboard lookup.

Gravity allocations: PARTIAL — trail/difficulty/debris/tick allocation fixed; selective spawn pools remain profile-gated.

Gravity render optimization: PARTIAL — background cache, culling, adaptive stars/ribbons/shadows; deeper sprite/gradient cache requires visual profiling.

Gravity asset loading: PASS (static) — core/gameplay/advanced demand stages; source PNG masters retained.

Gravity audio lifecycle: PASS (static) — route demand loading, no duplicate loop map entry, hidden-page pause and active one-shot cleanup.

Service worker: PASS (static) — logical bounded caches, age/entry cleanup, quota handling and Range bypass.

PWA update: PARTIAL — version 29 and skip-waiting protocol exist; installed-device update flow not exercised here.

Vite MPA: DEFERRED — runtime architecture is not stable enough for safe route/build migration.

Production build: NOT AVAILABLE — direct-source MPA remains in use.

Static tests: PASS — all production JavaScript parses, Firestore index JSON parses, `git diff --check` reports only line-ending warnings.

Functional tests: PARTIAL — unauthenticated headless launch was unavailable because Edge GPU process failed in this environment; authenticated Firebase flows were not simulated.

Measured: code-verifiable limits and static resource behavior only.

Not measured: real iPhone FPS, frame/render/physics duration, heap, long tasks, thermal, battery, Firebase network bytes, authenticated PWA cold/warm launch.

Remaining technical bottlenecks:

1. True Messages dynamic-height spacer/recycler window.
2. True Feed reversible spacer/recycler window instead of hard truncation.
3. Authenticated functional regression on staging/production.
4. Real-mobile profiling before deeper atlas conversion, pooling or Vite migration.

SAFE FOR REAL-MOBILE TEST: NO

Blockers: Messages DOM is not yet bounded after many historical pages; Feed deep-history virtualization is not reversible; authenticated/PWA functional regression has not run. A limited staging smoke test is appropriate, but this state should not be called production-ready.
