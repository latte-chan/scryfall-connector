import path from "node:path";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { CSB } from "./csb.js";

export type CsbCardIndex = {
    builtAtMs: number;
    total: number;
    oracleToId: Record<string, number>;
};

const DEFAULT_CACHE_PATH = process.env.CSB_CARD_INDEX_PATH || path.join(process.cwd(), "cache", "csb-card-index.json");
const DEFAULT_TTL_MS = Number(process.env.CSB_CARD_INDEX_TTL_MS || 24 * 60 * 60 * 1000); // 24h

let memCache: { at: number; data: CsbCardIndex } | undefined;

async function ensureDirFor(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readCsbIndex(cachePath = DEFAULT_CACHE_PATH): Promise<{ data: CsbCardIndex; at: number } | null> {
    try {
        const [buf, st] = await Promise.all([readFile(cachePath, "utf8"), stat(cachePath)]);
        const data = JSON.parse(buf) as CsbCardIndex;
        return { data, at: st.mtimeMs };
    } catch {
        return null;
    }
}

export async function writeCsbIndex(data: CsbCardIndex, cachePath = DEFAULT_CACHE_PATH): Promise<string> {
    await ensureDirFor(cachePath);
    await writeFile(cachePath, JSON.stringify(data, null, 2), "utf8");
    return cachePath;
}

export async function buildCsbIndex(): Promise<CsbCardIndex> {
    const oracleToId: Record<string, number> = Object.create(null);
    const limit = 100;
    let offset = 0;
    let total = 0;
    while (true) {
        const page: any = await CSB.cards({ limit, offset });
        const results: any[] = Array.isArray(page?.results) ? page.results : [];
        total = Number(page?.count ?? total);
        for (const c of results) {
            const oid = c?.oracleId;
            const id = c?.id;
            if (typeof oid === "string" && typeof id === "number") {
                if (!(oid in oracleToId)) oracleToId[oid] = id;
            }
        }
        if (!page?.next || results.length === 0) break;
        offset += limit;
    }
    return { builtAtMs: Date.now(), total, oracleToId };
}

export async function loadCsbIndex(options?: { ttlMs?: number; force?: boolean; cachePath?: string }): Promise<CsbCardIndex> {
    const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
    const cachePath = options?.cachePath ?? DEFAULT_CACHE_PATH;
    const now = Date.now();

    if (!options?.force && memCache && now - memCache.at < ttl) return memCache.data;

    if (!options?.force) {
        const disk = await readCsbIndex(cachePath);
        if (disk && now - disk.at < ttl) {
            memCache = { at: disk.at, data: disk.data };
            return disk.data;
        }
    }

    const data = await buildCsbIndex();
    memCache = { at: now, data };
    await writeCsbIndex(data, cachePath).catch(() => {});
    return data;
}

export async function lookupCsbIdsByOracle(oracleIds: string[], options?: { ttlMs?: number; force?: boolean; cachePath?: string }): Promise<{ found: Record<string, number>; missing: string[] }> {
    const idx = await loadCsbIndex(options);
    const found: Record<string, number> = {};
    const missing: string[] = [];
    for (const oid of oracleIds) {
        const id = idx.oracleToId[oid];
        if (typeof id === "number") found[oid] = id;
        else missing.push(oid);
    }
    return { found, missing };
}

