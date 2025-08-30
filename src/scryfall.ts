const DEFAULT_BASE_URL = "https://api.scryfall.com";

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

// Simple polite rate limiter per Scryfall guidelines (~10 req/s)
const intervalMs = Number(process.env.SCRYFALL_INTERVAL_MS || 100);
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
    const base = process.env.SCRYFALL_BASE_URL || DEFAULT_BASE_URL;
    const url = buildUrl(path, params, base);

    const maxRetries = Number(process.env.SCRYFALL_MAX_RETRIES || 3);
    const retryBaseMs = Number(process.env.SCRYFALL_RETRY_BASE_MS || 250);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        await acquireSlot();
        const res = await fetch(url, {
            headers: {
                // Required by Scryfall API usage guidelines
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
            throw new Error(`Scryfall request failed: ${res.status} ${res.statusText} - ${text}`);
        }

        return res.json() as Promise<unknown>;
    }

    // Should not reach here due to return/throw above
    throw new Error("Scryfall request failed after retries");
}

export type SearchParams = {
    q: string;
    unique?: "cards" | "art" | "prints";
    order?:
    | "name"
    | "set"
    | "released"
    | "rarity"
    | "color"
    | "usd"
    | "tix"
    | "eur"
    | "cmc"
    | "power"
    | "toughness"
    | "edhrec"
    | "penny"
    | "artist"
    | "review";
    dir?: "auto" | "asc" | "desc";
    page?: number;
    include_extras?: boolean;
    include_multilingual?: boolean;
    include_variations?: boolean;
};

export const Scryfall = {
    searchCards: (opts: SearchParams) => getJson("/cards/search", opts),
    getCardById: (id: string) => getJson(`/cards/${encodeURIComponent(id)}`),
    getCardNamed: (name: string, fuzzy = false) =>
        getJson("/cards/named", fuzzy ? { fuzzy: name } : { exact: name }),
    getRandomCard: (q?: string) => getJson("/cards/random", q ? { q } : undefined),
    autocomplete: (q: string) => getJson("/cards/autocomplete", { q }),
    listSets: () => getJson("/sets"),
    getRulingsById: (id: string) => getJson(`/cards/${encodeURIComponent(id)}/rulings`)
};

export type ScryfallAPI = typeof Scryfall;
