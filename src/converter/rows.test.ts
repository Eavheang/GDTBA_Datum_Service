import { expect, test } from "bun:test";

import { calc, exportCsv, isConverted } from "./rows";

const out = (
  E: string,
  N: string,
  from: Parameters<typeof calc>[1],
  to: Parameters<typeof calc>[2],
) => {
  const res = calc({ E, N }, from, to);
  return isConverted(res) && res.out;
};

// Client's examples: one point, WGS84 -> Indian60, in every format pairing.
test("WGS84 MGRS -> Indian60 MGRS shifts the datum", () => {
  expect(out("TA", "18426-73915", "wgs84-mgrs", "indian60-mgrs")).toEqual(["TA", "18845-73591"]);
});

test("WGS84 MGRS -> Indian60 metres", () => {
  expect(out("TA", "18426-73915", "wgs84-mgrs", "indian60")).toEqual(["218844.944", "1573591.420"]);
});

test("WGS84 metres -> Indian60 metres", () => {
  expect(out("218426", "1573915", "wgs84", "indian60")).toEqual(["218844.944", "1573591.420"]);
});

test("Indian60 MGRS -> WGS84 MGRS goes back", () => {
  expect(out("TA", "18845-73591", "indian60-mgrs", "wgs84-mgrs")).toEqual(["TA", "18426-73915"]);
});

test("same datum, MGRS <-> metres only reformats", () => {
  expect(out("TA", "18426-73915", "wgs84-mgrs", "wgs84")).toEqual(["218426.000", "1573915.000"]);
  expect(out("322453", "1598002", "indian60", "indian60-mgrs")).toEqual(["UA", "22453-98002"]);
});

// Google Earth point: 14°22'49.48"N 104°50'52.34"E.
test("lat/lon forms convert to UTM and back", () => {
  const [E, N] = out(`104°50'52.34"E 14°22'49.48"N`, "", "wgs84-dms", "wgs84") as [string, string];
  expect(out(E, N, "wgs84", "wgs84-dms")).toEqual([`14°22'49.48"N`, `104°50'52.34"E`]);
  expect(out(E, N, "wgs84", "wgs84-ddm")).toEqual([`14°22.8247'N`, `104°50.8723'E`]);
  expect(out(E, N, "wgs84", "wgs84-dd")).toEqual(["14.380411", "104.847872"]);
});

test("lat/lon input accepts any form and order", () => {
  const dms: [string, string] = [`14°22'49.48"N`, `104°50'52.34"E`];
  expect(out("14.380411", "104.847872", "wgs84-dd", "wgs84-dms")).toEqual(dms);
  expect(out("N 14 22 49.48", "E 104 50 52.34", "wgs84-dd", "wgs84-dms")).toEqual(dms);
  expect(out(`104°50.8723'E`, `14°22.8247'N`, "wgs84-ddm", "wgs84-dms")).toEqual(dms);
  expect(out("14.380411, 104.847872", "", "wgs84-dd", "wgs84-dms")).toEqual(dms);
});

test("lat/lon converts across datums", () => {
  expect(out("14.380411", "104.847872", "wgs84-dd", "indian60")).toEqual(
    out("483598.946", "1589803.947", "wgs84", "indian60"),
  );
});

test("bad lat/lon is an error", () => {
  expect(calc({ E: "14°75'N", N: "104E" }, "wgs84-dms", "wgs84")).toHaveProperty("error");
  expect(calc({ E: "14N", N: "15S" }, "wgs84-dms", "wgs84")).toHaveProperty("error");
  expect(calc({ E: "14", N: "" }, "wgs84-dd", "wgs84")).toHaveProperty("error");
});

test("Indian60 lat/lon matches the Indian60 UTM result", () => {
  // Same point via Indian60 metres, then read back as Indian60 lat/lon.
  const [E, N] = out("14.380411", "104.847872", "wgs84-dd", "indian60") as [string, string];
  const dms = out(E, N, "indian60", "indian60-dms");
  expect(out("14.380411", "104.847872", "wgs84-dd", "indian60-dms")).toEqual(dms);
  const back = out(...(dms as [string, string]), "indian60-dms", "indian60") as [string, string];
  // 0.01" of DMS rounding is about 0.3 m.
  expect(Math.abs(Number(back[0]) - Number(E))).toBeLessThan(0.5);
  expect(Math.abs(Number(back[1]) - Number(N))).toBeLessThan(0.5);
  expect(dms).not.toEqual([`14°22'49.48"N`, `104°50'52.34"E`]); // the datum shift moved it
});

test("export writes the to-system template so it imports back", () => {
  const rows = [
    { E: "218426", N: "1573915" },
    { E: "", N: "" },
    { E: "x", N: "1" },
  ];
  expect(exportCsv(rows, "wgs84", "indian60")).toBe(
    "WGS84 UTM48N to Indian60 UTM48N\r\nEasting_Indian60,Northing_Indian60\r\n218844.944,1573591.420\r\n",
  );
  expect(exportCsv([{ E: "14.380411", N: "104.847872" }], "wgs84-dd", "wgs84-dms")).toContain(
    `"14°22'49.48""N"`,
  );
});
