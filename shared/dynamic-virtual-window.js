/**
 * Framework-free dynamic-height window model used by Feed and Messages.
 * It owns no application DOM, so leaving a route cannot retain cards/bubbles.
 */
export class DynamicVirtualWindow {
    constructor({ estimateHeight = 96, overscan = 1.5, minItems = 16, maxItems = 120 } = {}) {
        this.estimateHeight = estimateHeight;
        this.overscan = overscan;
        this.minItems = minItems;
        this.maxItems = maxItems;
        this.keys = [];
        this.indexByKey = new Map();
        this.heights = new Map();
        this.prefix = [0];
    }

    setKeys(keys) {
        this.keys = [...keys];
        this.indexByKey = new Map(this.keys.map((key, index) => [key, index]));
        this.rebuild();
    }

    rebuild() {
        const prefix = new Array(this.keys.length + 1);
        prefix[0] = 0;
        for (let index = 0; index < this.keys.length; index += 1) {
            prefix[index + 1] = prefix[index] + (this.heights.get(this.keys[index]) || this.estimateHeight);
        }
        this.prefix = prefix;
    }

    lowerBound(offset) {
        let low = 0, high = this.keys.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this.prefix[middle + 1] < offset) low = middle + 1;
            else high = middle;
        }
        return Math.min(low, Math.max(0, this.keys.length - 1));
    }

    range(scrollTop, viewportHeight) {
        if (!this.keys.length) return { start: 0, end: 0, top: 0, bottom: 0, total: 0 };
        const view = Math.max(1, viewportHeight || 1);
        const pad = view * this.overscan;
        let start = this.lowerBound(Math.max(0, scrollTop - pad));
        let end = Math.min(this.keys.length, this.lowerBound(scrollTop + view + pad) + 1);
        if (end - start < this.minItems) {
            const missing = this.minItems - (end - start);
            start = Math.max(0, start - Math.ceil(missing / 2));
            end = Math.min(this.keys.length, start + this.minItems);
            start = Math.max(0, end - this.minItems);
        }
        if (end - start > this.maxItems) end = start + this.maxItems;
        return {
            start,
            end,
            top: this.prefix[start],
            bottom: this.prefix[this.keys.length] - this.prefix[end],
            total: this.prefix[this.keys.length]
        };
    }

    measure(key, height) {
        if (!this.indexByKey.has(key) || !Number.isFinite(height) || height <= 0) return 0;
        const previous = this.heights.get(key) || this.estimateHeight;
        if (Math.abs(previous - height) < 0.5) return 0;
        this.heights.set(key, height);
        this.rebuild();
        return height - previous;
    }

    offsetFor(key) {
        const index = this.indexByKey.get(key);
        return index == null ? null : this.prefix[index];
    }

    prune(validKeys = this.keys) {
        const valid = new Set(validKeys);
        for (const key of this.heights.keys()) if (!valid.has(key)) this.heights.delete(key);
    }

    clear() {
        this.keys = [];
        this.indexByKey.clear();
        this.heights.clear();
        this.prefix = [0];
    }
}

export function createVirtualSpacer(position, height) {
    const spacer = document.createElement("div");
    spacer.className = `vhht-virtual-spacer vhht-virtual-spacer-${position}`;
    spacer.dataset.virtualSpacer = position;
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.cssText = `height:${Math.max(0, height)}px;min-height:${Math.max(0, height)}px;flex:0 0 auto;pointer-events:none`;
    return spacer;
}
