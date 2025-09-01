# Scryfall MCP Server

MCP server that exposes Scryfall (Magic: The Gathering) through simple, typed tools for MCP-compatible clients (Claude Desktop, Cursor, Continue, Zed, etc.). Now includes Commander Spellbook (combo database) integration.

## Highlights

- High-level server API via `McpServer` with typed inputs/outputs
- Tools for common queries: full-text search, by colors/CMC/format, and Tagger-based searches
- SSE or stdio transports
- Polite rate limiting and 429 backoff (Scryfall and Commander Spellbook)
- Optional local cache of Tagger tag lists
- Optional local index mapping Scryfall oracle_id → Commander Spellbook card id

## Requirements

- Node.js >= 18.17

## Install & Build

- Install: `npm install`
- Build: `npm run build`

## Run (stdio)

- `node dist/index.js`

## Run (SSE HTTP)

- `npm run start:sse`
- Env: `PORT=3000` (default), `CORS_ORIGIN=*` (optional)

## Docker

- Build: `docker build -t scryfall-mcp:latest .`
- Run (SSE): `docker run --rm -p 3000:3000 -v mcp_data:/data scryfall-mcp:latest`
- Override env:
  - `SCRYFALL_INTERVAL_MS=100` (rate limiter)
  - `TAGGER_CACHE_PATH=/data/tagger-tags.json`
  - `SCRYFALL_BASE_URL=https://api.scryfall.com`
  - `CSB_INTERVAL_MS=100` (rate limiter for Commander Spellbook)
  - `CSB_BASE_URL=https://backend.commanderspellbook.com`
  - `CSB_CARD_INDEX_PATH=/data/csb-card-index.json`
  - `CSB_CARD_INDEX_TTL_MS=86400000`
- Stdio transport: `docker run --rm -it scryfall-mcp:latest node dist/index.js`

## MCP Client Example (Claude Desktop)

```json
{
  "mcpServers": {
    "scryfall": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "SCRYFALL_INTERVAL_MS": "100",
        "TAGGER_CACHE_PATH": "C:/path/to/cache/tagger-tags.json"
      }
    }
  }
}
```

## Environment Variables

- `SCRYFALL_BASE_URL`: API base URL (default `https://api.scryfall.com`)
- `SCRYFALL_INTERVAL_MS`: Minimum ms between requests (default `100`)
- `SCRYFALL_MAX_RETRIES`: Max retries on 429 (default `3`)
- `SCRYFALL_RETRY_BASE_MS`: Base backoff ms (default `250`)
- `TAGGER_CACHE_PATH`: Local JSON path for Tagger tag lists (default `./cache/tagger-tags.json`, Docker default `/data/tagger-tags.json`)

Commander Spellbook (CSB):
- `CSB_BASE_URL`: API base URL (default `https://backend.commanderspellbook.com`)
- `CSB_INTERVAL_MS`: Minimum ms between requests (default `100`)
- `CSB_MAX_RETRIES`: Max retries on 429 (default `3`)
- `CSB_RETRY_BASE_MS`: Base backoff ms (default `250`)
- `CSB_CARD_INDEX_PATH`: Cache file path for oracleId→CSB id index (default `./cache/csb-card-index.json`)
- `CSB_CARD_INDEX_TTL_MS`: TTL for index reuse in ms (default `86400000` = 24h)

## Tools (Scryfall)

- `search_cards` — Full-text search using Scryfall `q` syntax.
- `get_card` — Fetch a card by `id` or `name` (`fuzzy` optional).
- `random_card` — Random card, optional `q` filter.
- `autocomplete` — Autocomplete card names.
- `list_sets` — All sets.
- `get_rulings` — Rulings by card `id`.

Guided search tools (structured results):
- `search_by_colors` — Params: `colors`, `mode` (`exact|contains|at_most`), `identity`, `include_colorless`, `page`.
- `search_by_cmc` — Params: `min`, `max`, `colors`, `type`, `page`.
- `search_by_format` — Params: `format`, `status` (`legal|banned|restricted`), `colors`, `page`.

Tagger-powered tools:
- `list_tagger_tags` — Returns `{ function: string[], art: string[] }` from docs page (cached).
- `search_by_function_tag` — Params: `tags[]`, `match` (`any|all`), `colors?`, `format?`, `page?` (uses `otag:`).
- `search_by_art_tag` — Params: `tags[]`, `match` (`any|all`), `colors?`, `type?`, `page?` (uses `arttag:`).
- `read_tagger_cache` — Read cached tags without network.
- `refresh_tagger_tags` — Force refresh tags and write cache.

Notes:
- Many tools return `structuredContent` with compact card summaries: `name`, `mana_cost`, `type_line`, `oracle_text`, `set`, `collector_number`, `scryfall_uri`, `image`, `prices`.
- Some basic tools return `content` text (JSON stringified) for compatibility.

## Commander Spellbook Tools

- `csb_parse_deck_text` — Parse plain-text decklist to cards via CSB.
  - Input: `{ text: string }`
- `csb_find_combos_by_card_ids` — Find combos included/almost-included by CSB numeric card IDs.
  - Input: `{ ids: number[], limit?: number, offset?: number }`
- `csb_variants_search` — Search variants (combos) by filters like `uses` (card id) or `produces` (feature id).
  - Input: `{ uses?: number, produces?: number, of?: number, limit?: number, offset?: number }`
- `csb_card` — Fetch CSB card by numeric id.
  - Input: `{ id: number }`
- `csb_build_card_index` — Build and cache oracleId→CSB id index (paginates `/cards`).
- `csb_read_card_index` — Read the cached index without network.
- `csb_lookup_by_oracle_ids` — Map Scryfall `oracle_id` UUIDs to CSB numeric ids using the cached index.
  - Input: `{ oracleIds: string[] }`
- `csb_find_combos_by_names` — Resolve names via Scryfall → `oracle_id`, map via cached index, then call `find-my-combos`.
  - Input: `{ names: string[], fuzzy?: boolean, limit?: number, offset?: number }`

Notes:
- CSB’s `card-list-from-text` expects `Content-Type: text/plain` (handled by the tool).
- The `csb_find_combos_by_names` tool benefits from building the index first: run `csb_build_card_index` once per day or set a custom TTL.

## API Etiquette

- All requests send a descriptive `User-Agent`.
- Default limiter targets ~10 req/s (100ms between starts) and backs off on HTTP 429, honoring `Retry-After` (applies to both Scryfall and CSB).

## Development

- Build: `npm run build`
- StdIO dev: `npm run start:stdio`
- SSE dev: `npm run start:sse`

- `random_card`:
  - Input: `{ q?: string }`
- `autocomplete`:
  - Input: `{ q: string }`
- `list_sets`:
  - Input: none
- `get_rulings`:
  - Input: `{ id: uuid }`

## Notes

- Scryfall rate limits: be respectful (they suggest up to ~10 requests/sec). This server does not add extra rate limiting; your client should avoid flooding requests.
- Responses are returned as JSON content for maximum fidelity; clients can post-process or render summaries.

### SSE Transport Endpoints

- Events stream (server -> client via EventSource): `GET /sse`
- Messages endpoint (client -> server): `POST /messages`

Point your MCP client’s SSE transport at these endpoints on your configured host/port.

## Development

- Build: `npm run build`
- Start (built): `npm start`
- Edit source in `src/` and rebuild.

## License

No license specified. Add one if you plan to distribute.
