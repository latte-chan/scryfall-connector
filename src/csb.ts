const DEFAULT_BASE_URL = "https://backend.commanderspellbook.com";

function buildUrl(path: string, params?: Record<string, unknown>, base = DEFAULT_BASE_URL) {
    const url = new URL(path, base);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            url.searchParams.set(k, String(v));
        }
    }
    return url;
}

// Polite rate limiter (reusing pattern from Scryfall client)
const intervalMs = Number(process.env.CSB_INTERVAL_MS || 100);
let lastStart = 0;
let queue: Promise<void> = Promise.resolve();

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

async function acquireSlot(): Promise<void> {
    const prev = queue;
    let release: () => void;
    const next = new Promise<void>((r) => (release = r));
    queue = next;
    await prev;
    const now = Date.now();
    const wait = Math.max(0, lastStart + intervalMs - now);
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    release!();
}

async function getJson(path: string, params?: Record<string, unknown>) {
    const base = process.env.CSB_BASE_URL || DEFAULT_BASE_URL;
    const url = buildUrl(path, params, base);

    const maxRetries = Number(process.env.CSB_MAX_RETRIES || 3);
    const retryBaseMs = Number(process.env.CSB_RETRY_BASE_MS || 250);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await acquireSlot();
        const res = await fetch(url, {
            headers: {
                "User-Agent": "scryfall-mcp/0.1 (https://github.com/latte-chan/scryfall-connector)"
            }
        });

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get("Retry-After") || 0);
            const backoff = retryAfter > 0 ? retryAfter * 1000 : retryBaseMs * Math.pow(2, attempt);
            if (attempt < maxRetries) {
                await sleep(backoff);
                continue;
            }
        }

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`CSB request failed: ${res.status} ${res.statusText} - ${text}`);
        }

        return res.json() as Promise<unknown>;
    }

    throw new Error("CSB request failed after retries");
}

async function postText(path: string, body: string) {
    const base = process.env.CSB_BASE_URL || DEFAULT_BASE_URL;
    const url = new URL(path, base);

    const maxRetries = Number(process.env.CSB_MAX_RETRIES || 3);
    const retryBaseMs = Number(process.env.CSB_RETRY_BASE_MS || 250);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await acquireSlot();
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "User-Agent": "scryfall-mcp/0.1 (commanderspellbook client)"
            },
            body
        });

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get("Retry-After") || 0);
            const backoff = retryAfter > 0 ? retryAfter * 1000 : retryBaseMs * Math.pow(2, attempt);
            if (attempt < maxRetries) {
                await sleep(backoff);
                continue;
            }
        }

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`CSB request failed: ${res.status} ${res.statusText} - ${text}`);
        }

        return res.json() as Promise<unknown>;
    }

    throw new Error("CSB request failed after retries");
}

export const CSB = {
    parseCardListFromText: (text: string) => postText("/card-list-from-text", text),
    findMyCombos: (ids: number[], limit?: number, offset?: number) =>
        getJson("/find-my-combos", { ids: ids.join(","), limit, offset }),
    variants: (opts: { uses?: number; produces?: number; of?: number; limit?: number; offset?: number }) =>
        getJson("/variants", opts),
    getCard: (id: number) => getJson(`/cards/${id}`),
    cards: (opts?: { limit?: number; offset?: number; search?: string; name?: string; oracleId?: string }) =>
        getJson("/cards", opts || {})
};

export type CSBAPI = typeof CSB;
