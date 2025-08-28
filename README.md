# Scryfall MCP Server

A Model Context Protocol (MCP) server that exposes Scryfall (Magic: The Gathering) API as tools for AI assistants and MCP-compatible clients (e.g., Claude Desktop, Cursor, Continue, Zed).

## Features

- Search cards with Scryfall's full-text syntax (`search_cards`)
- Fetch a single card by id or name (`get_card`)
- Get a random card, optionally filtered (`random_card`)
- Autocomplete card names (`autocomplete`)
- List all sets (`list_sets`)
- Get card rulings (`get_rulings`)

## Requirements

- Node.js 18.17 or newer (provides built-in `fetch`)

## Setup

1. Install deps and build:
   - Install: `npm install`
   - Build: `npm run build`

2. Run directly (for local testing):
   - `node dist/index.js`

3. SSE server (HTTP):
   - Build first: `npm run build`
   - Start: `npm run start:sse`
   - Env: `PORT=3000` (default), `CORS_ORIGIN=*` (optional)

Optional environment variables:
- `SCRYFALL_BASE_URL`: Override the base API URL (defaults to `https://api.scryfall.com`).

## MCP Client Integration

Configure your MCP client to launch the built JS with Node. Example (Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "scryfall": {
      "command": "node",
      "args": ["C:\\path\\to\\your\\repo\\dist\\index.js"],
      "env": {
        "SCRYFALL_BASE_URL": "https://api.scryfall.com"
      }
    }
  }
}
```

If you `npm link`, you can also use the installed binary `scryfall-mcp` as the `command` with no args.

## Exposed Tools

- `search_cards`:
  - Input: `{ q: string, unique?: 'cards'|'art'|'prints', order?: 'name'|'set'|'released'|'rarity'|'color'|'usd'|'tix'|'eur'|'cmc'|'power'|'toughness'|'edhrec'|'penny'|'artist'|'review', dir?: 'auto'|'asc'|'desc', page?: number, include_extras?: boolean, include_multilingual?: boolean, include_variations?: boolean }`
- `get_card`:
  - Input: `{ id?: uuid, name?: string, fuzzy?: boolean }` (must provide `id` or `name`)
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
