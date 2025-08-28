import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import { Scryfall, type SearchParams } from "./scryfall.js";

export function createMcpServer() {
  const server = new Server(
    { name: "scryfall-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Tool: search_cards
  const searchSchema = z.object({
    q: z.string().describe("Scryfall search query, e.g., 't:creature cmc<=3'"),
    unique: z.enum(["cards", "art", "prints"]).optional(),
    order: z
      .enum([
        "name",
        "set",
        "released",
        "rarity",
        "color",
        "usd",
        "tix",
        "eur",
        "cmc",
        "power",
        "toughness",
        "edhrec",
        "penny",
        "artist",
        "review"
      ])
      .optional(),
    dir: z.enum(["auto", "asc", "desc"]).optional(),
    page: z.number().int().min(1).optional(),
    include_extras: z.boolean().optional(),
    include_multilingual: z.boolean().optional(),
    include_variations: z.boolean().optional()
  });

  server.tool(
    "search_cards",
    {
      description: "Search cards using Scryfall's powerful full-text syntax.",
      inputSchema: searchSchema
    },
    async (input) => {
      const params = searchSchema.parse(input) as SearchParams;
      const data = await Scryfall.searchCards(params);
      return { content: [{ type: "json", json: data }] };
    }
  );

  // Tool: get_card (by id or name)
  const getCardInput = z
    .object({
      id: z.string().uuid().optional(),
      name: z.string().optional(),
      fuzzy: z.boolean().optional().describe("If true, uses fuzzy name match")
    })
    .refine((v) => Boolean(v.id) || Boolean(v.name), {
      message: "Provide either 'id' or 'name'"
    });

  server.tool(
    "get_card",
    {
      description: "Get a single card by Scryfall UUID or by name (exact/fuzzy).",
      inputSchema: getCardInput
    },
    async (input) => {
      const { id, name, fuzzy } = getCardInput.parse(input);
      const data = id
        ? await Scryfall.getCardById(id)
        : await Scryfall.getCardNamed(name!, Boolean(fuzzy));
      return { content: [{ type: "json", json: data }] };
    }
  );

  // Tool: random_card
  server.tool(
    "random_card",
    {
      description: "Fetch a random card, optionally filtered by a 'q' search query.",
      inputSchema: z.object({ q: z.string().optional() })
    },
    async (input) => {
      const { q } = z.object({ q: z.string().optional() }).parse(input);
      const data = await Scryfall.getRandomCard(q);
      return { content: [{ type: "json", json: data }] };
    }
  );

  // Tool: autocomplete (card names)
  server.tool(
    "autocomplete",
    {
      description: "Autocomplete card names based on a partial query.",
      inputSchema: z.object({ q: z.string() })
    },
    async (input) => {
      const { q } = z.object({ q: z.string() }).parse(input);
      const data = await Scryfall.autocomplete(q);
      return { content: [{ type: "json", json: data }] };
    }
  );

  // Tool: list_sets
  server.tool(
    "list_sets",
    {
      description: "List all sets available on Scryfall.",
      inputSchema: z.object({}).optional()
    },
    async () => {
      const data = await Scryfall.listSets();
      return { content: [{ type: "json", json: data }] };
    }
  );

  // Tool: get_rulings
  server.tool(
    "get_rulings",
    {
      description: "Get official rulings for a card by Scryfall UUID.",
      inputSchema: z.object({ id: z.string().uuid() })
    },
    async (input) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(input);
      const data = await Scryfall.getRulingsById(id);
      return { content: [{ type: "json", json: data }] };
    }
  );

  return server;
}

