// UTM zone 48N conversion between WGS84 and Indian 1960 (Everest 1830, 1937 adjustment).
// Ported 1:1 from the Indian60_Converter_Template.xlsm VBA macro: UTM inverse, geodetic -> ECEF,
// 3-parameter shift, ECEF -> geodetic (5 iterations), UTM forward. Height is taken as 0.

export type Direction = "w2i" | "i2w"; // w2i = WGS84 -> Indian60

type Ellipsoid = { a: number; e2: number };

const ellipsoid = (a: number, invf: number): Ellipsoid => {
  const f = 1 / invf;
  return { a, e2: 2 * f - f * f };
};

const WGS84 = ellipsoid(6378137, 298.257223563);
const INDIAN60 = ellipsoid(6377276.345, 300.8017);
const SHIFT = [198, 881, 317]; // Indian60 -> WGS84, metres
const K0 = 0.9996;
const LON0 = (105 * Math.PI) / 180; // zone 48 central meridian

function utmInverse(E: number, N: number, { a, e2 }: Ellipsoid): [number, number] {
  const x = E - 500000;
  const ep = e2 / (1 - e2);
  const mu = N / K0 / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C = ep * Math.cos(p) ** 2;
  const T = Math.tan(p) ** 2;
  const s = 1 - e2 * Math.sin(p) ** 2;
  const Nn = a / Math.sqrt(s);
  const R = (a * (1 - e2)) / s ** 1.5;
  const D = x / (Nn * K0);
  const lat =
    p -
    ((Nn * Math.tan(p)) / R) *
      (D ** 2 / 2 -
        ((5 + 3 * T + 10 * C - 4 * C ** 2 - 9 * ep) * D ** 4) / 24 +
        ((61 + 90 * T + 298 * C + 45 * T ** 2 - 252 * ep - 3 * C ** 2) * D ** 6) / 720);
  const lon =
    LON0 +
    (D -
      ((1 + 2 * T + C) * D ** 3) / 6 +
      ((5 - 2 * C + 28 * T - 3 * C ** 2 + 8 * ep + 24 * T ** 2) * D ** 5) / 120) /
      Math.cos(p);
  return [lat, lon];
}

function utmForward(lat: number, lon: number, { a, e2 }: Ellipsoid): [number, number] {
  const ep = e2 / (1 - e2);
  const Nn = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const T = Math.tan(lat) ** 2;
  const C = ep * Math.cos(lat) ** 2;
  const A = (lon - LON0) * Math.cos(lat);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));
  const E =
    500000 +
    K0 *
      Nn *
      (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep) * A ** 5) / 120);
  const N =
    K0 *
    (M +
      Nn *
        Math.tan(lat) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep) * A ** 6) / 720));
  return [E, N];
}

function toXYZ(lat: number, lon: number, { a, e2 }: Ellipsoid): [number, number, number] {
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [
    n * Math.cos(lat) * Math.cos(lon),
    n * Math.cos(lat) * Math.sin(lon),
    n * (1 - e2) * Math.sin(lat),
  ];
}

function fromXYZ(X: number, Y: number, Z: number, { a, e2 }: Ellipsoid): [number, number] {
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 5; i++) {
    const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    const h = p / Math.cos(lat) - n;
    lat = Math.atan2(Z, p * (1 - (e2 * n) / (n + h)));
  }
  return [lat, Math.atan2(Y, X)];
}

/** Converts one UTM 48N point (metres). Returns [Easting, Northing] on the other datum. */
export function convert(E: number, N: number, dir: Direction): [number, number] {
  const [from, to, sign] = dir === "w2i" ? [WGS84, INDIAN60, -1] : [INDIAN60, WGS84, 1];
  const [lat, lon] = utmInverse(E, N, from);
  const [X, Y, Z] = toXYZ(lat, lon, from);
  const [lat2, lon2] = fromXYZ(X + sign * SHIFT[0], Y + sign * SHIFT[1], Z + sign * SHIFT[2], to);
  return utmForward(lat2, lon2, to);
}

export type Datum = "wgs84" | "indian60";
const ELLIPSOIDS: Record<Datum, Ellipsoid> = { wgs84: WGS84, indian60: INDIAN60 };

/** UTM 48N (metres) -> [lat, lon] in degrees on the same datum. */
export function utmLatLon(E: number, N: number, datum: Datum): [number, number] {
  const [lat, lon] = utmInverse(E, N, ELLIPSOIDS[datum]);
  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}

/** [lat, lon] in degrees -> UTM 48N (metres) on the same datum. */
export function latLonUtm(lat: number, lon: number, datum: Datum): [number, number] {
  return utmForward((lat * Math.PI) / 180, (lon * Math.PI) / 180, ELLIPSOIDS[datum]);
}

/** WGS84 UTM 48N (metres) -> [lat, lon] in degrees, for plotting on a web map. */
export const wgs84LatLon = (E: number, N: number) => utmLatLon(E, N, "wgs84");
