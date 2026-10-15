// MGRS for zone 48N (band P) — the lettered 100 km grid-square form used on Cambodian maps and Sentinel-2
// tiles. Both datums use the same "AA" lettering (client: Indian60 TA 18845-73591). UA (22453-98002) = UTM E 322453, N 1598002.
// Zone 48 is even, so 100 km columns are S–Z and row letters start at F on the equator.

const COLS = "STUVWXYZ"; // S = 100000–200000 … Z = 800000–900000
const ROWS = "ABCDEFGHJKLMNPQRSTUV"; // 20 letters, 2 000 000 m cycle
const ROW_SHIFT = 5; // even zones: equator is F, not A

/** 100 km squares that cover Cambodia (Sentinel-2 tiles in band 48P). */
export const CAMBODIA_SQUARES = new Set(
  "TA UA VA WA XA YA TV UV VV WV XV YV TU UU VU WU XU YU TT UT VT WT XT YT US VS WS".split(" "),
);

export function formatMgrs(
  E: number,
  N: number,
): { square: string; ref: string } | { error: string } {
  const e = Math.round(E);
  const n = Math.round(N);
  const col = Math.floor(e / 100000);
  const row = Math.floor(n / 100000);
  const colLetter = COLS[col - 1];
  if (!colLetter) return { error: "Easting is outside the UTM columns for zone 48" };
  const square = colLetter + ROWS[(((row + ROW_SHIFT) % 20) + 20) % 20];
  return {
    square,
    ref: `${String(e % 100000).padStart(5, "0")}-${String(n % 100000).padStart(5, "0")}`,
  };
}

/** Reads Grid + Ref (or a single combined cell) and returns UTM 48N metres. */
export function parseMgrs(
  grid: string,
  ref: string,
): { E: number; N: number; square: string } | { error: string } {
  const t = `${grid} ${ref}`.trim().toUpperCase();
  if (!t) return { error: "Needs a grid square and a ref" };
  const spaced = t.match(
    /^(?:48P\s*)?([A-HJ-NP-Z]{2})\s*\(?\s*(\d{1,5})\s*[-,\s]\s*(\d{1,5})\s*\)?$/,
  );
  const glued = t.match(/^(?:48P\s*)?([A-HJ-NP-Z]{2})\s*\(?(\d{2,10})\)?$/);
  const half = glued ? glued[2].length / 2 : 0;
  const [square, east, north] = spaced
    ? spaced.slice(1)
    : glued
      ? [glued[1], glued[2].slice(0, half), glued[2].slice(half)]
      : [];
  if (!square) return { error: "Not an MGRS ref (e.g. UA 22453-98002)" };
  if (east.length !== north.length)
    return { error: "MGRS easting and northing must have the same number of digits" };
  const col = COLS.indexOf(square[0]);
  const row = ROWS.indexOf(square[1]);
  if (col < 0 || row < 0) return { error: "Not a zone 48 MGRS square" };
  // Invert the even-zone shift: row letter F at the equator is northing 0–100000.
  const row100 = (((row - ROW_SHIFT) % 20) + 20) % 20;
  return {
    E: (col + 1) * 100000 + Number(east.padEnd(5, "0")),
    N: row100 * 100000 + Number(north.padEnd(5, "0")),
    square,
  };
}
