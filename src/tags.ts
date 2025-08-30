// Lightweight scraper + disk cache for Scryfall Tagger docs page
// Extracts function (oracle) and art tag names from https://scryfall.com/docs/tagger-tags

import path from "node:path";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";

const TAGS_URL = "https://scryfall.com/docs/tagger-tags";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_CACHE_PATH = process.env.TAGGER_CACHE_PATH || path.join(process.cwd(), "cache", "tagger-tags.json");

export type TaggerTags = { function: string[]; art: string[] };

let memCache: { at: number; data: TaggerTags } | undefined;

function uniqSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

async function ensureDirFor(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readTaggerCache(cachePath = DEFAULT_CACHE_PATH): Promise<{ data: TaggerTags; at: number } | null> {
    try {
        const [buf, st] = await Promise.all([readFile(cachePath, "utf8"), stat(cachePath)]);
        const data = JSON.parse(buf) as TaggerTags;
        return { data, at: st.mtimeMs };
    } catch {
        return null;
    }
}

export async function writeTaggerCache(data: TaggerTags, cachePath = DEFAULT_CACHE_PATH): Promise<string> {
    await ensureDirFor(cachePath);
    await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
    return cachePath;
}

export async function fetchTaggerTags(options?: { ttlMs?: number; force?: boolean; cachePath?: string }): Promise<TaggerTags> {
    const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
    const cachePath = options?.cachePath ?? DEFAULT_CACHE_PATH;
    const now = Date.now();

    // In-memory
    if (!options?.force && memCache && now - memCache.at < ttl) return memCache.data;

    // Disk cache
    if (!options?.force) {
        const disk = await readTaggerCache(cachePath);
        if (disk && now - disk.at < ttl) {
            memCache = { at: disk.at, data: disk.data };
            return disk.data;
        }
    }

    // Network fetch
    const res = await fetch(TAGS_URL, { headers: { "User-Agent": "scryfall-mcp/0.1 (+tag-fetch)" } });
    if (!res.ok) throw new Error(`Failed to fetch tagger tags: ${res.status} ${res.statusText}`);
    const html = await res.text();

    const functionTags: string[] = [];
    const artTags: string[] = [];

    // Match anchor elements that link to searches like /search?q=oracletag%3Afoo or /search?q=arttag%3Abar
    const re = /<a[^>]+href=\"\/search\?q=(oracletag%3A|otag%3A|function%3A|arttag%3A|atag%3A|art%3A)[^\"]+\"[^>]*>([^<]+)<\/a>/gim;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const prefix = m[1].toLowerCase();
        const tagText = m[2].trim();
        if (!tagText) continue;
        if (prefix.startsWith("art")) artTags.push(tagText);
        else functionTags.push(tagText);
    }

    const data: TaggerTags = { function: uniqSorted(functionTags), art: uniqSorted(artTags) };
    memCache = { at: now, data };
    await writeTaggerCache(data, cachePath).catch(() => {});
    return data;
}

export async function refreshTaggerTags(cachePath = DEFAULT_CACHE_PATH): Promise<{ path: string; counts: { function: number; art: number } }> {
    const data = await fetchTaggerTags({ force: true, cachePath, ttlMs: 0 });
    const p = await writeTaggerCache(data, cachePath);
    return { path: p, counts: { function: data.function.length, art: data.art.length } };
}

export function toKebabTag(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

