import assert from "node:assert/strict";
import { DynamicVirtualWindow } from "../shared/dynamic-virtual-window.js";

function verifyDataset(count, options) {
    const virtual = new DynamicVirtualWindow(options);
    const keys = Array.from({ length: count }, (_, index) => `item-${index}`);
    virtual.setKeys(keys);
    for (let index = 0; index < count; index += 7) {
        virtual.measure(keys[index], options.estimateHeight + (index % 11) * 17);
    }
    const viewport = 844;
    for (let scroll = 0; scroll < virtual.prefix.at(-1); scroll += 977) {
        const range = virtual.range(scroll, viewport);
        assert.ok(range.start >= 0 && range.end <= count && range.start < range.end);
        assert.ok(range.end - range.start <= options.maxItems, "DOM window exceeded its cap");
        assert.equal(range.top + (virtual.prefix[range.end] - virtual.prefix[range.start]) + range.bottom, range.total);
    }
    return { virtual, keys };
}

const messages = verifyDataset(5000, { estimateHeight: 86, overscan: 1.75, minItems: 24, maxItems: 120 });
const feed = verifyDataset(2000, { estimateHeight: 680, overscan: 1.25, minItems: 6, maxItems: 30 });

// Delayed image/video resize above the viewport must expose an exact anchor delta.
const anchorKey = messages.keys[2500];
const anchorBefore = messages.virtual.offsetFor(anchorKey);
const delta = messages.virtual.measure(messages.keys[100], 420);
assert.equal(messages.virtual.offsetFor(anchorKey), anchorBefore + delta);

// Realtime append preserves all existing offsets; prepend shifts the anchor predictably.
const appended = [...messages.keys, "realtime-message"];
messages.virtual.setKeys(appended);
assert.equal(messages.virtual.offsetFor(anchorKey), anchorBefore + delta);
const prepended = Array.from({ length: 40 }, (_, index) => `older-${index}`);
messages.virtual.setKeys([...prepended, ...appended]);
assert.equal(messages.virtual.offsetFor(anchorKey), anchorBefore + delta + 40 * 86);

// Delete and conversation switch cannot retain stale height-cache entries.
messages.virtual.setKeys(messages.keys.slice(1000));
messages.virtual.prune();
assert.equal(messages.virtual.heights.has("item-0"), false);
messages.virtual.clear();
assert.equal(messages.virtual.keys.length, 0);
assert.equal(messages.virtual.heights.size, 0);

// Feed deep scroll is reversible and stays bounded in both directions.
const deep = feed.virtual.range(feed.virtual.prefix.at(-1) * 0.8, 844);
const back = feed.virtual.range(0, 844);
assert.ok(deep.start > back.start);
assert.ok(deep.end - deep.start <= 30 && back.end - back.start <= 30);

console.log("dynamic virtual window: 5,000 messages + 2,000 posts PASS");
