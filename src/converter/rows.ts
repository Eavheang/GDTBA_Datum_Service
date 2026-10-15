import { convert, latLonUtm, utmLatLon, wgs84LatLon } from "./geodesy";
import { outOfRange, parseCoord, TEMPLATE_HEADER, type Row, type System } from "./import-csv";
import { formatLatLon, parseLatLon, type LatLonForm } from "./latlon";
import { CAMBODIA_SQUARES, formatMgrs, parseMgrs } from "./mgrs";

export type { Row, System };
/** `deg` is the input point as WGS84 [lat, lon], for the web map. */
export type Converted = { out: [string, string]; warn: boolean; deg: [number, number] };
export type Result = Converted | { error: string } | null;

export const SYSTEMS = Object.keys(TEMPLATE_HEADER) as System[];
export const isSystem = (v: unknown): v is System => SYSTEMS.includes(v as System);

export const SYSTEM_NAMES: Record<System, string> = {
  wgs84: "WGS84 UTM48N",
  indian60: "Indian60 UTM48N",
  "wgs84-mgrs": "WGS84 MGRS",
  "indian60-mgrs": "Indian60 MGRS",
  "wgs84-dd": "WGS84 DD",
  "wgs84-dms": "WGS84 DMS",
  "wgs84-ddm": "WGS84 DDM",
  "indian60-dd": "Indian60 DD",
  "indian60-dms": "Indian60 DMS",
  "indian60-ddm": "Indian60 DDM",
};

/** MGRS is only a lettered way to write UTM metres; the datum part decides the shift. */
const isMgrs = (s: System) => s.endsWith("-mgrs");
/** Lat/lon forms convert through UTM 48N on their own datum, like the macro does. */
const latLonForm = (s: System) =>
  (s.match(/-(dd|dms|ddm)$/)?.[1] as LatLonForm | undefined) ?? null;
const datumOf = (s: System) => (s.startsWith("wgs84") ? "wgs84" : "indian60");
const onWgs84 = (s: System) => s.startsWith("wgs84");
const fmt = (v: number) => v.toFixed(3);

export const isConverted = (r: Result): r is Converted => r !== null && !("error" in r);

export function calc(r: Row, from: System, to: System): Result {
  const p = parse(r, from);
  if (!p || "error" in p) return p;
  const [E, N] =
    onWgs84(from) === onWgs84(to) ? [p.E, p.N] : convert(p.E, p.N, onWgs84(from) ? "w2i" : "i2w");
  const deg = wgs84LatLon(...(onWgs84(from) ? ([p.E, p.N] as const) : convert(p.E, p.N, "i2w")));
  const form = latLonForm(to);
  if (form) return { out: formatLatLon(...utmLatLon(E, N, datumOf(to)), form), warn: p.warn, deg };
  if (!isMgrs(to)) return { out: [fmt(E), fmt(N)], warn: p.warn, deg };
  const m = formatMgrs(E, N);
  return "error" in m ? m : { out: [m.square, m.ref], warn: p.warn, deg };
}

// DMS holds " and ', so quote cells the way Excel does.
const cell = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Converted rows as the `to` system's template CSV, so the file imports straight back. */
export function exportCsv(rows: Row[], from: System, to: System) {
  const out = rows
    .map((r) => calc(r, from, to))
    .filter(isConverted)
    .map((res) => res.out.map(cell).join(","));
  return (
    [`${SYSTEM_NAMES[from]} to ${SYSTEM_NAMES[to]}`, TEMPLATE_HEADER[to], ...out].join("\r\n") +
    "\r\n"
  );
}

/** UTM 48N metres on the input's own datum. */
function parse(
  r: Row,
  from: System,
): { E: number; N: number; warn: boolean } | { error: string } | null {
  if (!r.E.trim() && !r.N.trim()) return null;
  if (isMgrs(from)) {
    const p = parseMgrs(r.E, r.N);
    if ("error" in p) return p;
    return { E: p.E, N: p.N, warn: !CAMBODIA_SQUARES.has(p.square) || outOfRange(p.E, p.N) };
  }
  if (latLonForm(from)) {
    const p = parseLatLon(r.E, r.N);
    if ("error" in p) return p;
    const [E, N] = latLonUtm(p.lat, p.lon, datumOf(from));
    return { E, N, warn: p.lon < 102 || p.lon > 108 || outOfRange(E, N) }; // outside zone 48
  }
  if (!r.E.trim() || !r.N.trim()) return { error: "Needs Easting and Northing" };
  const E = parseCoord(r.E);
  const N = parseCoord(r.N);
  if (!Number.isFinite(E) || !Number.isFinite(N)) return { error: "Not a number" };
  return { E, N, warn: outOfRange(E, N) };
}
