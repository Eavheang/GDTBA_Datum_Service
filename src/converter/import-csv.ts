import { parseLatLon } from "./latlon";
import { parseMgrs } from "./mgrs";

export type System =
  | "wgs84"
  | "indian60"
  | "wgs84-mgrs"
  | "indian60-mgrs"
  | "wgs84-dd"
  | "wgs84-dms"
  | "wgs84-ddm"
  | "indian60-dd"
  | "indian60-dms"
  | "indian60-ddm";
export type Row = { E: string; N: string };
export type ImportResult =
  | { ok: true; system: System; rows: Row[]; skipped: number[] }
  | { ok: false; found: string };

// The header names the file's system, so the user never picks it. Indian60 and WGS84 values look
// almost the same, so guessing wrong would silently shift every point by a few hundred metres.
export const TEMPLATE_HEADER: Record<System, string> = {
  wgs84: "Easting_WGS84,Northing_WGS84",
  indian60: "Easting_Indian60,Northing_Indian60",
  "wgs84-mgrs": "Grid_WGS84,Ref_WGS84",
  "indian60-mgrs": "Grid_Indian60,Ref_Indian60",
  "wgs84-dd": "Latitude_WGS84_DD,Longitude_WGS84_DD",
  "wgs84-dms": "Latitude_WGS84_DMS,Longitude_WGS84_DMS",
  "wgs84-ddm": "Latitude_WGS84_DDM,Longitude_WGS84_DDM",
  "indian60-dd": "Latitude_Indian60_DD,Longitude_Indian60_DD",
  "indian60-dms": "Latitude_Indian60_DMS,Longitude_Indian60_DMS",
  "indian60-ddm": "Latitude_Indian60_DDM,Longitude_Indian60_DDM",
};

export const parseCoord = (s: string) => Number(s.replace(/[ ,]/g, ""));
export const outOfRange = (E: number, N: number) =>
  E < 160000 || E > 840000 || N < 0 || N > 9300000;

// Splits on , ; or tab outside double quotes, so Excel's "491,234.56" stays one cell.
// Excel writes DMS seconds as "14°22'49.48""N", so "" inside a quoted cell is unescaped.
// ponytail: no full RFC 4180 (quoted newlines); coordinates never need it.
const cells = (line: string) =>
  line.split(/[,;\t](?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) =>
    c
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/""/g, '"')
      .trim(),
  );

const norm = (c: string) => c.toLowerCase().replace(/\s+/g, "");

export function parseImport(text: string): ImportResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = cells(lines[0] ?? "");
  while (header.length > 2 && !header[header.length - 1]) header.pop(); // Excel's trailing empty columns
  const system = (Object.keys(TEMPLATE_HEADER) as System[]).find(
    (d) =>
      header.length === 2 &&
      TEMPLATE_HEADER[d].split(",").every((h, i) => norm(h) === norm(header[i])),
  );
  if (!system) return { ok: false, found: lines[0]?.trim() || "(empty file)" };

  const rows: Row[] = [];
  const skipped: number[] = []; // file line numbers, so users can find them in their spreadsheet
  lines.slice(1).forEach((l, i) => {
    const line = i + 2;
    const [E = "", N = ""] = cells(l);
    if (!E && !N) return;
    const bad = system.endsWith("-mgrs")
      ? "error" in parseMgrs(E, N)
      : /-(dd|dms|ddm)$/.test(system)
        ? !E || !N || "error" in parseLatLon(E, N)
        : !E || !N || !Number.isFinite(parseCoord(E)) || !Number.isFinite(parseCoord(N));
    if (bad) return skipped.push(line);
    // Out-of-range rows are kept: the grid highlights them amber.
    rows.push({ E, N });
  });
  return { ok: true, system, rows, skipped };
}
