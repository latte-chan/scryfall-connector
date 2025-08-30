import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Scryfall, type SearchParams } from "./scryfall.js";
import { fetchTaggerTags, toKebabTag } from "./tags.js";

type JsonContent = { type: "json"; json: unknown };
type ToolResult = { content: JsonContent[] };

export function createMcpServer(): any {
    const server: any = new McpServer(
        { name: "scryfall-mcp", version: "0.1.0" },
        { capabilities: { tools: {} } }
    );

    // Helper: build Scryfall query strings safely
    const quote = (v: string): string =>
        /\s|\"|:/.test(v) ? `"${v.replaceAll("\"", '\\"')}"` : v;
    const joinParts = (parts: Array<string | undefined>): string => parts.filter(Boolean).join(" ");
    const cardSummaryShape = {
        name: z.string(),
        mana_cost: z.string().optional(),
        type_line: z.string(),
        oracle_text: z.string().optional(),
        set: z.string(),
        collector_number: z.string(),
        scryfall_uri: z.string().url(),
        image: z.string().url().optional(),
        prices: z
            .object({ usd: z.string().nullable().optional(), eur: z.string().nullable().optional(), tix: z.string().nullable().optional() })
            .partial()
            .optional()
    } as const;
    type CardSummary = z.infer<z.ZodObject<typeof cardSummaryShape>>;
    const summarize = (card: any): CardSummary => ({
        name: card?.name,
        mana_cost: card?.mana_cost,
        type_line: card?.type_line,
        oracle_text: card?.oracle_text,
        set: card?.set,
        collector_number: String(card?.collector_number ?? ""),
        scryfall_uri: card?.scryfall_uri,
        image: card?.image_uris?.normal ?? card?.image_uris?.large ?? card?.image_uris?.small,
        prices: card?.prices
    });

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

    // Tool: search_by_colors
    const searchByColorsInput = {
        colors: z.array(z.enum(["W", "U", "B", "R", "G"])).min(0).max(5).optional(),
        mode: z.enum(["exact", "contains", "at_most"]).default("contains"),
        include_colorless: z.boolean().optional().describe("Include colorless cards"),
        identity: z.boolean().optional().describe("Filter by color identity instead of printed colors"),
        page: z.number().int().min(1).optional()
    } as const;
    const searchByColorsOutput = {
        total: z.number().int().nonnegative(),
        results: z.array(z.object(cardSummaryShape))
    } as const;
    server.registerTool(
        "search_by_colors",
        {
            title: "Search by colors",
            description: "Find cards by colors or color identity.",
            inputSchema: searchByColorsInput,
            outputSchema: searchByColorsOutput
        },
        async ({ colors = [], mode, include_colorless, identity, page }: { colors?: Array<"W" | "U" | "B" | "R" | "G">; mode: "exact" | "contains" | "at_most"; include_colorless?: boolean; identity?: boolean; page?: number }) => {
            const op = mode === "exact" ? "=" : mode === "contains" ? ">=" : "<=";
            const opKey = identity ? "c" : "color"; // c = color identity
            const parts = [colors.length ? `${opKey}${op}${colors.join("")}` : undefined, include_colorless ? "is:colorless" : undefined];
            const q = joinParts(parts);
            const data: any = (await Scryfall.searchCards({ q, page })) as any;
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const out = { total: Number(data?.total_cards ?? items.length), results: items.map(summarize) };
            return { structuredContent: out } as any;
        }
    );

    // Tool: search_by_cmc (mana value)
    const searchByCmcInput = {
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(0).optional(),
        colors: z.array(z.enum(["W", "U", "B", "R", "G"])).min(0).max(5).optional(),
        type: z.string().optional(),
        page: z.number().int().min(1).optional()
    } as const;
    const searchByCmcOutput = searchByColorsOutput;
    server.registerTool(
        "search_by_cmc",
        {
            title: "Search by mana value",
            description: "Find cards within a mana value range, optionally filtered by color and type.",
            inputSchema: searchByCmcInput,
            outputSchema: searchByCmcOutput
        },
        async ({ min, max, colors = [], type, page }: { min?: number; max?: number; colors?: Array<"W" | "U" | "B" | "R" | "G">; type?: string; page?: number }) => {
            const range = [typeof min === "number" ? `mv>=${min}` : undefined, typeof max === "number" ? `mv<=${max}` : undefined];
            const colorPart = colors.length ? `color>=${colors.join("")}` : undefined;
            const typePart = type ? `type:${quote(type)}` : undefined;
            const q = joinParts([...range, colorPart, typePart]);
            const data: any = (await Scryfall.searchCards({ q, page })) as any;
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const out = { total: Number(data?.total_cards ?? items.length), results: items.map(summarize) };
            return { structuredContent: out } as any;
        }
    );

    // Tool: search_by_format legality
    const formats = [
        "standard",
        "pioneer",
        "modern",
        "legacy",
        "vintage",
        "commander",
        "oathbreaker",
        "pauper",
        "paupercommander",
        "historic",
        "timeless",
        "alchemy",
        "brawl",
        "duel",
        "predh"
    ] as const;
    const searchByFormatInput = {
        format: z.enum(formats),
        status: z.enum(["legal", "banned", "restricted"]).default("legal"),
        colors: z.array(z.enum(["W", "U", "B", "R", "G"])).min(0).max(5).optional(),
        page: z.number().int().min(1).optional()
    } as const;
    server.registerTool(
        "search_by_format",
        {
            title: "Search by format legality",
            description: "Find cards by legality in a given format.",
            inputSchema: searchByFormatInput,
            outputSchema: searchByColorsOutput
        },
        async ({ format, status, colors = [], page }: { format: typeof formats[number]; status: "legal" | "banned" | "restricted"; colors?: Array<"W" | "U" | "B" | "R" | "G">; page?: number }) => {
            const legal = `${status}:${format}`; // e.g., legal:commander
            const colorPart = colors.length ? `color>=${colors.join("")}` : undefined;
            const q = joinParts([legal, colorPart]);
            const data: any = (await Scryfall.searchCards({ q, page })) as any;
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const out = { total: Number(data?.total_cards ?? items.length), results: items.map(summarize) };
            return { structuredContent: out } as any;
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

    // Tool: list_tagger_tags (scrapes public docs)
    const listTaggerTagsOutput = {
        function: z.array(z.string()),
        art: z.array(z.string())
    } as const;
    server.registerTool(
        "list_tagger_tags",
        {
            title: "List Tagger tags",
            description: "Fetches Scryfall Tagger tag names from the public docs page.",
            outputSchema: listTaggerTagsOutput
        },
        async () => {
            const tags = await fetchTaggerTags();
            return { structuredContent: tags } as any;
        }
    );

    // Tool: search_by_function_tag
    const searchByFuncTagInput = {
        tags: z.array(z.string()).min(1),
        match: z.enum(["any", "all"]).default("any"),
        colors: z.array(z.enum(["W", "U", "B", "R", "G"])).min(0).max(5).optional(),
        format: z
            .enum([
                "standard",
                "pioneer",
                "modern",
                "legacy",
                "vintage",
                "commander",
                "oathbreaker",
                "pauper",
                "paupercommander",
                "historic",
                "timeless",
                "alchemy",
                "brawl",
                "duel",
                "predh"
            ])
            .optional(),
        page: z.number().int().min(1).optional()
    } as const;
    server.registerTool(
        "search_by_function_tag",
        {
            title: "Search by function tag",
            description: "Find cards using Tagger function (oracle) tags, e.g. removal, ramp.",
            inputSchema: searchByFuncTagInput,
            outputSchema: searchByColorsOutput
        },
        async ({ tags, match, colors = [], format, page }: { tags: string[]; match: "any" | "all"; colors?: Array<"W" | "U" | "B" | "R" | "G">; format?: string; page?: number }) => {
            const terms = tags.map((t) => `otag:${toKebabTag(t)}`);
            const joined = match === "all" ? terms.join(" ") : terms.join(" OR ");
            const colorPart = colors.length ? `color>=${colors.join("")}` : undefined;
            const formatPart = format ? `legal:${format}` : undefined;
            const q = joinParts([joined, colorPart, formatPart]);
            const data: any = (await Scryfall.searchCards({ q, page })) as any;
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const out = { total: Number(data?.total_cards ?? items.length), results: items.map(summarize) };
            return { structuredContent: out } as any;
        }
    );

    // Tool: search_by_art_tag
    const searchByArtTagInput = {
        tags: z.array(z.string()).min(1),
        match: z.enum(["any", "all"]).default("any"),
        colors: z.array(z.enum(["W", "U", "B", "R", "G"])).min(0).max(5).optional(),
        type: z.string().optional(),
        page: z.number().int().min(1).optional()
    } as const;
    server.registerTool(
        "search_by_art_tag",
        {
            title: "Search by art tag",
            description: "Find cards using Tagger artwork tags, e.g. squirrel, dragon, wizard.",
            inputSchema: searchByArtTagInput,
            outputSchema: searchByColorsOutput
        },
        async ({ tags, match, colors = [], type, page }: { tags: string[]; match: "any" | "all"; colors?: Array<"W" | "U" | "B" | "R" | "G">; type?: string; page?: number }) => {
            const terms = tags.map((t) => `arttag:${toKebabTag(t)}`);
            const joined = match === "all" ? terms.join(" ") : terms.join(" OR ");
            const colorPart = colors.length ? `color>=${colors.join("")}` : undefined;
            const typePart = type ? `type:${quote(type)}` : undefined;
            const q = joinParts([joined, colorPart, typePart]);
            const data: any = (await Scryfall.searchCards({ q, page })) as any;
            const items: any[] = Array.isArray(data?.data) ? data.data : [];
            const out = { total: Number(data?.total_cards ?? items.length), results: items.map(summarize) };
            return { structuredContent: out } as any;
        }
    );

    return server;
}
