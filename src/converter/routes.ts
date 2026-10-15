import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { parseImport, TEMPLATE_HEADER } from "./import-csv";
import { calc, exportCsv, isSystem, type System } from "./rows";

const systemSchema = z.custom<System>(isSystem, "Unknown system");
const cell = z.string().max(100);

// The web is untrusted: systems must be known and distinct, rows bounded.
const conversion = z
  .object({
    from: systemSchema,
    to: systemSchema,
    rows: z.array(z.object({ E: cell, N: cell })).max(50_000),
  })
  .refine((b) => b.from !== b.to, "from and to must differ");

const csv = (body: string, fileName: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });

export const converter = new Hono()
  /** One result per row, in order: `{ out, warn, deg }`, `{ error }`, or null for an empty row. */
  .post("/convert", zValidator("json", conversion), (c) => {
    const { from, to, rows } = c.req.valid("json");
    return c.json({ results: rows.map((r) => calc(r, from, to)) });
  })
  .post("/export", zValidator("json", conversion), (c) => {
    const { from, to, rows } = c.req.valid("json");
    return csv(exportCsv(rows, from, to), "converted-points.csv");
  })
  /** Body is the raw CSV text. A rejected file carries every accepted header, so the user sees what to fix. */
  .post("/import", async (c) => {
    const result = parseImport(await c.req.text());
    return c.json(result.ok ? result : { ...result, expected: Object.values(TEMPLATE_HEADER) });
  })
  .get("/template/:system", zValidator("param", z.object({ system: systemSchema })), (c) => {
    const { system } = c.req.valid("param");
    return csv(TEMPLATE_HEADER[system] + "\r\n", `template-${system}.csv`);
  });
