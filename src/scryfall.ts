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

async function getJson(path: string, params?: Record<string, unknown>) {
  const base = process.env.SCRYFALL_BASE_URL || DEFAULT_BASE_URL;
  const url = buildUrl(path, params, base);

  const res = await fetch(url, {
    headers: {
      // Courtesy header for Scryfall logs; adjust URL if you publish this.
      "User-Agent": "scryfall-mcp/0.1 (https://github.com/your/repo)"
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Scryfall request failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json() as Promise<unknown>;
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

