import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Scryfall, type SearchParams } from "./scryfall.js";

type JsonContent = { type: "json"; json: unknown };
type ToolResult = { content: JsonContent[] };

export function createMcpServer(): any {
    const server: any = new McpServer(
        { name: "scryfall-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } }
    );

    // Tool: search_cards
    // Zod shapes for MCPServer (use raw shapes, not ZodObject)
    const searchParamsShape = {
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
    } as const;

    server.registerTool(
        "search_cards",
        {
            description: "Search cards using Scryfall's powerful full-text syntax.",
            inputSchema: searchParamsShape
        },
        async (params: SearchParams): Promise<ToolResult> => {
            const data: unknown = await Scryfall.searchCards(params);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    // Tool: get_card (by id or name)
    const getCardParamsShape = {
        id: z.string().uuid().optional(),
        name: z.string().optional(),
        fuzzy: z.boolean().optional().describe("If true, uses fuzzy name match")
    } as const;

    server.registerTool(
        "get_card",
        {
            description: "Get a single card by Scryfall UUID or by name (exact/fuzzy).",
            inputSchema: getCardParamsShape
        },
        async ({ id, name, fuzzy }: { id?: string; name?: string; fuzzy?: boolean }): Promise<ToolResult> => {
            const data: unknown = id
                ? await Scryfall.getCardById(id)
                : await Scryfall.getCardNamed(name as string, Boolean(fuzzy));
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    // Tool: random_card
    const randomCardParamsShape = { q: z.string().optional() } as const;

    server.registerTool(
        "random_card",
        {
            description: "Fetch a random card, optionally filtered by a 'q' search query.",
            inputSchema: randomCardParamsShape
        },
        async ({ q }: { q?: string }): Promise<ToolResult> => {
            const data: unknown = await Scryfall.getRandomCard(q);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    // Tool: autocomplete (card names)
    const autocompleteParamsShape = { q: z.string() } as const;

    server.registerTool(
        "autocomplete",
        {
            description: "Autocomplete card names based on a partial query.",
            inputSchema: autocompleteParamsShape
        },
        async ({ q }: { q: string }): Promise<ToolResult> => {
            const data: unknown = await Scryfall.autocomplete(q);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    // Tool: list_sets
    server.registerTool(
        "list_sets",
        {
            description: "List all sets available on Scryfall.",
            // No input schema for zero-arg tools
        } as any,
        async (): Promise<ToolResult> => {
            const data: unknown = await Scryfall.listSets();
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    // Tool: get_rulings
    const getRulingsParamsShape = { id: z.string().uuid() } as const;

    server.registerTool(
        "get_rulings",
        {
            description: "Get official rulings for a card by Scryfall UUID.",
            inputSchema: getRulingsParamsShape
        },
        async ({ id }: { id: string }): Promise<ToolResult> => {
            const data: unknown = await Scryfall.getRulingsById(id);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } as any;
        }
    );

    return server;
}
