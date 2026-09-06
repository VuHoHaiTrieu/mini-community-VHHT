# PERFORMANCE OPTIMIZATION REPORT — VHHT Community

Ngày: 2026-09-06

## 1. Files changed

- `community/realtime-feed-handler.js`
- `community/profile-user/profile-posts-logic.js`
- `community/messages/messages-logic.js`
- `firestore.indexes.json`
- `games/gravity-tourist/entry.js`
- `games/gravity-tourist/config/game-config.js`
- `games/gravity-tourist/core/GameLoop.js`
- `games/gravity-tourist/core/GameEngine.js`
- `games/gravity-tourist/entities/UFO.js`
- `games/gravity-tourist/systems/DifficultySystem.js`
- `games/gravity-tourist/components/GameRenderer.js`
- `service-worker.js`
- `shared/performance-governor.js`
- `shared/performance-debug.js` (mới)

`PERFORMANCE_AUDIT.md` là report audit có sẵn/chưa tracked, không phải source runtime.

## 2. P0 fixed

### Feed per-post RAF

Production card creation không còn gọi recursive RAF riêng. Card đăng ký vào `feedAnimationScheduler`; scheduler sở hữu tối đa một RAF, duyệt tập card active, xử lý mỗi pair collision một lần, dừng khi document hidden/list mode/không còn card. `removeFeedCard` unregister và clear respawn/comment resources.

Phần triển khai legacy đã bị vô hiệu hóa hoàn toàn; tìm kiếm tĩnh xác nhận không còn lời gọi `requestAnimationFrame(updatePhysicsFrame)` theo từng card. Production chỉ đăng ký card với scheduler dùng chung.

### Feed query bound

Realtime source dùng `orderBy(createdAt desc) + limit(24)` cho từng source public/audience. Older page dùng `getDocs + startAfter + limit(20)`. IDs được merge bằng Map để dedupe. DOM/card được giữ trần 72 trong implementation hiện tại.

Hai composite indexes được bổ sung `createdAt DESC`. Cần deploy Firestore indexes trước khi đưa query mới lên production.

### Gravity leaderboard

Leaderboard được cache thành:

- mảng hiển thị hiện tại;
- `Map` theo user ID;
- mảng ascending đã sort một lần.

Gameplay dùng binary search để tìm rival gần nhất. Không còn `filter().sort()` 10 lần/giây. HUD từ 100 ms chuyển thành 250 ms (4 Hz).

## 3. P1 fixed / reduced

- Physics chuẩn hóa `1/60` cho desktop/mobile, độc lập render cadence.
- Render bắt đầu 60 FPS và có hysteresis 60 → 45 → 30 dựa trên cả chi phí vẽ lẫn khoảng cách khung hình thực tế; phục hồi chậm hơn để tránh quality oscillation.
- Renderer nhận quality event: balanced giảm số sao/ribbon, low bỏ ribbon và chỉ vẽ một phần ba nền sao. Physics, collision và scoring không đổi.
- Trail đổi từ `push({x,y}) + shift()` sang fixed ring buffer 42 point tái sử dụng.
- Difficulty object được mutate/reuse; không spread object mỗi tick.
- Hot debris cleanup compact tại chỗ; không tạo array mới mỗi tick.
- Xóa `CustomEvent('tick')` không có consumer khỏi 60 Hz loop.
- Secondary game atlas không còn tự request ở 180/420/650/820 ms. Core title assets load lúc tạo renderer; gameplay/hazard assets load khi vào intro/play; advanced assets load theo tiến trình.
- Notes trong Messages giảm từ one listener per friend + collection listener xuống một own-note listener + một audience collection listener.
- Mobile balanced/economy tiers giảm large panel filter/shadow; economy dừng decorative animation không thiết yếu nhưng giữ border/layout/look.
- Inline comment listener ở feed/profile unsubscribe khi panel đóng và subscribe lại khi mở.
- Runtime PWA cache tách shell/images/audio/game, có entry/age policy, version cleanup và quota handling.

## 4. Feed architecture before / after

### Before

```text
post A -> recursive RAF
post B -> recursive RAF
post C -> recursive RAF
removed post -> RAF closure can remain
hidden/list/filtered -> timeout + RAF polling
```

### After

```text
FeedAnimationScheduler -> one RAF
  -> registered active cards
  -> one collision pass
  -> filtered/disconnected cards skipped
remove -> unregister + cleanup
hidden/list/no cards -> scheduler stopped
visible/space -> safe resume
```

Compact device updates are capped at 20 Hz inside the single scheduler; list mode uses no floating scheduler.

## 5. Firestore query before / after

Before: public/audience/legacy realtime queries could read whole post history.

After:

- public latest 24 realtime;
- friend-audience latest 24 realtime;
- legacy latest 24 realtime;
- older pages 20 per source via `getDocs/startAfter`;
- Map dedupe between live/older sources;
- maximum rendered/retained card window 72.

Known limitation: the current bounded card strategy is a hard window, not a full spacer-based recycler. It prevents unbounded growth but a future iteration should preserve arbitrary deep-history scrolling with top/bottom spacers.

## 6. Message loading before / after

Before: full ordered message subcollection realtime; one note listener per user plus visible-note query.

After in this iteration: note fan-out is removed. Full message history pagination/windowing is **not completed**, because the existing renderer is a single large snapshot callback. Applying `limit(50)` without extracting a reusable prepend renderer would hide older history and be a regression. This remains the highest unresolved architecture item.

## 7. Animation scheduler before / after

- Before: N post cards = N recursive RAF schedulers; desktop collision work repeated from every card.
- After: N post cards = 1 scheduler; collision pair checked once; unregister is explicit.
- Debug flag `?perf=1` displays FPS/frame ms, scheduler count, feed card count, game entities, quality tier and total DOM count. It is not enabled by default.

## 8. Gravity engine optimizations

- Fixed physics 60 Hz on all devices.
- Render cadence independent and adaptive.
- HUD 4 Hz.
- Leaderboard binary lookup.
- Ring-buffer trail.
- Reused difficulty state.
- In-place hot debris compaction.
- Removed unused per-tick event allocation.

Object pools for every debris/projectile/effect were not added blindly. Existing ordinary debris spawn rate is low and some cleanup occurs only on capture; profiling should prove pool value before increasing lifecycle complexity. Fast defense projectiles now benefit from in-place list cleanup, but still allocate at spawn.

## 9. Gravity rendering optimizations

Existing mobile DPR cap 1 and culling remain unchanged. Canvas renderer remains Canvas2D. No PixiJS/WebGL migration was attempted because no post-optimization real-device trace exists.

Gradient/static-visual cache work beyond the existing background cache remains open. Changing every gradient/shadow path without visual A/B profiling risks altering the game design and was not claimed complete.

## 10. Asset loading before / after

Before: four core and four secondary atlases all began loading within about 820 ms of route initialization.

After:

- title: UFO, base celestial atlas, background, base reaction atlas;
- intro/play: hazard and second celestial atlas;
- progress >=24%: third celestial and second reaction atlas.

PNG-to-WebP/AVIF conversion/atlas splitting is not performed in this iteration because it requires visual verification and asset pipeline work. Decoded texture estimates remain as documented in `PERFORMANCE_AUDIT.md`.

## 11. PWA / service-worker changes

Cache version: `vhht-shell-2026-09-06-29`.

Logical caches:

- static shell: max 90, 14 days;
- images/fonts: max 100, 14 days;
- audio: max 32, 7 days;
- game route/assets: max 48, 14 days.

Responses receive an internal cache timestamp. Cleanup removes expired/oldest entries. Quota errors trigger cleanup and do not break the network response. Old `vhht-shell-*` caches not belonging to the current release are removed. Navigation/offline behavior and shell precache remain.

Gravity/audio packs are not precached wholesale.

## 12. Build pipeline changes

No Vite migration was made. The requested order says build phase starts only after P0/P1 runtime fixes are stable. Browser/authenticated/PWA regression on real deployment has not yet established that stability. Introducing Vite now would combine runtime refactor with URL/deploy/service-worker migration and increase regression risk.

## 13. Measurements

Code-verifiable before/after:

| Metric | Before | After |
|---|---:|---:|
| Production feed animation schedulers | 1 per post | <=1 total |
| Latest realtime posts/source | unbounded | 24 |
| Older feed batch/source | N/A | 20, non-realtime |
| Feed card hard bound | unbounded | 72 |
| Gravity chase HUD cadence | 10 Hz | 4 Hz |
| Leaderboard sorting in HUD | every HUD update | once per loaded dataset |
| Physics step | desktop 120 Hz, mobile 60 Hz | 60 Hz both |
| Trail point allocation | one object/tick + shift | zero point objects/tick |
| Unused tick CustomEvent | 60/120 per second | 0 |
| Secondary asset eager delay | all within 820 ms | demand/progress based |
| Notes listeners | O(friends) + 1 | 2 |
| Runtime cache bounds | none | per-cache entry/age limits |

Static validation:

- all production `.js`: `node --check` passed;
- `firestore.indexes.json`: JSON parse passed;
- `git diff --check`: passed (only line-ending warnings);
- no dependency installed;
- no framework/database schema migration.

## 14. What could not be measured

**NOT MEASURED ON REAL MOBILE DEVICE.**

No claim is made for actual iPhone FPS, thermal, battery, heap, Core Web Vitals, Firestore wire bytes, Cache Storage size, first/second launch time or long-task duration. Authenticated Firebase UI flows and service-worker install/update require browser/deployed-environment regression.

## 15. Remaining bottlenecks

1. Messages recent-window pagination + prepend scroll anchoring + DOM virtualization.
2. True spacer/recycler feed virtualization for arbitrary deep history; current solution is bounded hard window.
3. Runtime/profile verification of new Firestore composite indexes after deployment.
4. Renderer gradient/glow bitmap cache guided by frame trace.
5. Selective entity pools only if allocation profiling proves value.
6. Asset format conversion and atlas splitting with visual comparison.
7. Vite MPA only after runtime stability.
8. PixiJS/Worker/OffscreenCanvas remain decision gates, not automatically justified changes.

## 16. Known regressions / deployment requirements

- No known syntax regression.
- New feed queries require deployment of `firestore.indexes.json`; until indexes finish building, secure feed queries can return an index-required error.
- Service worker version change requires update/activation/reload behavior to be tested in installed PWA.
- Actual gameplay fairness after changing desktop physics from 120 to 60 Hz must be play-tested, although time-based equations now use the same fixed step on every device.

## 17. Recommended next step

Run authenticated browser regression, then profile Feed, Messages and Gravity using `?perf=1`. The next implementation phase is the bounded dynamic-height Messages DOM window, followed by reversible Feed spacer virtualization.

## 18. Continuation update — Messages/PWA/renderer

- Firestore indexes were confirmed ENABLED by the project owner; no additional index was introduced.
- Messages now keeps realtime on only the latest 50 documents using `limitToLast(50)`.
- Scrolling near the top loads 40 older documents using `endBefore(oldestMessageCursor)` and `limitToLast(40)`.
- Recent and historical pages are deduplicated by document ID and sorted with pending server timestamps kept at the end.
- The existing scroll-height delta anchor is retained when older pages are prepended.
- The per-conversation scroll handler is owned by an `AbortController` and is removed immediately when switching conversations.
- `?perf=1` now reports recent realtime count, loaded messages, message DOM count and known active conversation listeners.
- Service Worker version 29 bypasses Range requests, preventing cached full responses from incorrectly serving iOS audio/video byte ranges. Cache updates are registered synchronously with `waitUntil`.
- Gravity quality tiers now reduce additional Canvas2D shadow cost without changing physics or scoring.
- Gravity hidden-page cleanup now stops intro timers and active one-shot sounds as well as music/loops.

Messages pagination is implemented, but true spacer/recycler DOM virtualization is still not complete. Feed remains a hard-bound window rather than a reversible spacer window. Vite MPA remains intentionally blocked until those runtime changes pass authenticated browser testing.
