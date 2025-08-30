// Lightweight scraper for Scryfall Tagger docs page
// Extracts function (oracle) and art tag names from https://scryfall.com/docs/tagger-tags

const TAGS_URL = "https://scryfall.com/docs/tagger-tags";

export type TaggerTags = { function: string[]; art: string[] };

let cache: { at: number; data: TaggerTags } | undefined;

function uniqSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export async function fetchTaggerTags(options?: { ttlMs?: number }): Promise<TaggerTags> {
    const ttl = options?.ttlMs ?? 24 * 60 * 60 * 1000; // default 24h
    const now = Date.now();
    if (cache && now - cache.at < ttl) return cache.data;

    const res = await fetch(TAGS_URL, { headers: { "User-Agent": "scryfall-mcp/0.1 (+tag-fetch)" } });
    if (!res.ok) throw new Error(`Failed to fetch tagger tags: ${res.status} ${res.statusText}`);
    const html = await res.text();

    const functionTags: string[] = [];
    const artTags: string[] = [];

    // Match anchor elements that link to searches like /search?q=oracletag%3Afoo or /search?q=arttag%3Abar
    const re = /<a[^>]+href="\/search\?q=(oracletag%3A|otag%3A|function%3A|arttag%3A|atag%3A|art%3A)[^"]+"[^>]*>([^<]+)<\/a>/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const prefix = m[1].toLowerCase();
        const tagText = m[2].trim();
        if (!tagText) continue;
        if (prefix.startsWith("art")) artTags.push(tagText);
        else functionTags.push(tagText);
    }

    const data: TaggerTags = { function: uniqSorted(functionTags), art: uniqSorted(artTags) };
    cache = { at: now, data };
    return data;
}

export function toKebabTag(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

