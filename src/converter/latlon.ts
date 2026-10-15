// Latitude/longitude (WGS84 or Indian60) in the three forms GPS units and Google Earth show:
// DD 14.380411, DMS 14°22'49.48"N, DDM 14°22.8247'N. Any form is accepted as input; the system only picks the output.

type Angle = { v: number; hemi: string };

// Degrees, then optional minutes, then optional seconds; symbols or spaces/colons between them.
const ANGLE =
  /^(\d+(?:\.\d+)?)\s*[°º]?(?:[\s:]*(\d+(?:\.\d+)?)\s*['′]?(?:[\s:]*(\d+(?:\.\d+)?)\s*(?:["″]|'')?)?)?$/;

function parseAngle(s: string): Angle | null {
  let t = s.trim().toUpperCase();
  let hemi = "";
  if (/^[NSEW]/.test(t)) [hemi, t] = [t[0], t.slice(1)];
  else if (/[NSEW]$/.test(t)) [hemi, t] = [t[t.length - 1], t.slice(0, -1)];
  t = t.trim();
  const neg = t.startsWith("-");
  const m = t.replace(/^[-+]\s*/, "").match(ANGLE);
  if (!m) return null;
  const [d, min, sec] = m.slice(1);
  // Only the last part may have decimals, and minutes/seconds stay under 60.
  if ((min !== undefined && d.includes(".")) || (sec !== undefined && min.includes(".")))
    return null;
  if (Number(min ?? 0) >= 60 || Number(sec ?? 0) >= 60) return null;
  const v = Number(d) + Number(min ?? 0) / 60 + Number(sec ?? 0) / 3600;
  return { v: neg || hemi === "S" || hemi === "W" ? -v : v, hemi };
}

/** Splits one pasted cell holding both values: "14.38, 104.85" or `104°50'52.34"E 14°22'49.48"N`. */
export function splitPair(s: string): [string, string] | null {
  const m = s.trim().match(/^(.+?)\s*(?:[,;\t]\s*|(?<=[NSEW])\s+(?=[-+\d])|\s+(?=[NSEW]\d))(.+)$/i);
  return m ? [m[1], m[2]] : null;
}

/** Reads Latitude + Longitude (or both in one cell). A hemisphere letter wins over column order. */
export function parseLatLon(
  a: string,
  b: string,
): { lat: number; lon: number } | { error: string } {
  const pair = a.trim() && b.trim() ? [a, b] : splitPair(a.trim() || b.trim());
  if (!pair) return { error: "Needs latitude and longitude" };
  let [p, q] = pair.map(parseAngle);
  if (!p || !q) return { error: `Not a lat/lon (e.g. 14°22'49.48"N or 14.380411)` };
  if ("EW".includes(p.hemi || "-") || "NS".includes(q.hemi || "-")) [p, q] = [q, p];
  if ("EW".includes(p.hemi || "-") || "NS".includes(q.hemi || "-"))
    return { error: "Needs one N/S and one E/W value" };
  if (Math.abs(p.v) > 90 || Math.abs(q.v) > 180)
    return { error: "Latitude or longitude out of range" };
  return { lat: p.v, lon: q.v };
}

// Rounded in whole output units first, so 59.999" carries into the minute instead of printing 60.00".
function dms(v: number, pos: string, neg: string) {
  const cs = Math.round(Math.abs(v) * 360000); // hundredths of a second
  const s = (cs % 6000) / 100;
  return `${Math.floor(cs / 360000)}°${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0")}"${v < 0 ? neg : pos}`;
}

function ddm(v: number, pos: string, neg: string) {
  const u = Math.round(Math.abs(v) * 600000); // 1/10000 minute
  return `${Math.floor(u / 600000)}°${((u % 600000) / 10000).toFixed(4).padStart(7, "0")}'${v < 0 ? neg : pos}`;
}

export type LatLonForm = "dd" | "dms" | "ddm";

/** DD 6 decimals ≈ 0.1 m, DMS 0.01" ≈ 0.3 m, DDM 0.0001' ≈ 0.2 m. */
export function formatLatLon(lat: number, lon: number, form: LatLonForm): [string, string] {
  if (form === "dd") return [lat.toFixed(6), lon.toFixed(6)];
  const f = form === "dms" ? dms : ddm;
  return [f(lat, "N", "S"), f(lon, "E", "W")];
}
