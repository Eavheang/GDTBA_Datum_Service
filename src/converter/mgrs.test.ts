import { expect, test } from "bun:test";

import { CAMBODIA_SQUARES, formatMgrs, parseMgrs } from "./mgrs";

test("UA (22453-98002) is UTM E 322453 N 1598002", () => {
  const p = parseMgrs("UA", "22453-98002");
  if ("error" in p) throw new Error(p.error);
  expect(p).toEqual({ E: 322453, N: 1598002, square: "UA" });
  expect(formatMgrs(322453, 1598002)).toEqual({ square: "UA", ref: "22453-98002" });
});

test("accepts the usual ways of writing one square", () => {
  const want = { E: 322453, N: 1598002, square: "UA" };
  for (const [g, r] of [
    ["48PUA", "22453-98002"],
    ["48P UA", "(22453-98002)"],
    ["UA (22453-98002)", ""],
    ["48PUA2245398002", ""],
    ["ua", "2245398002"],
    ["UA", "22453 98002"],
  ] as const) {
    expect(parseMgrs(g, r)).toEqual(want);
  }
});

test("Phnom Penh-ish UTM lands in 48PVT", () => {
  expect(formatMgrs(491300, 1278500)).toEqual({ square: "VT", ref: "91300-78500" });
  expect(parseMgrs("VT", "91300-78500")).toEqual({ E: 491300, N: 1278500, square: "VT" });
  expect(CAMBODIA_SQUARES.has("VT")).toBe(true);
});

test("shorter refs pad to the south-west of the square", () => {
  expect(parseMgrs("UA", "2245-9800")).toEqual({ E: 322450, N: 1598000, square: "UA" });
  expect(parseMgrs("UA", "224-980")).toEqual({ E: 322400, N: 1598000, square: "UA" });
});

test("round trip of a 1 m point", () => {
  const fmt = formatMgrs(500000, 1300000);
  if ("error" in fmt) throw new Error(fmt.error);
  expect(fmt.square).toBe("WU");
  expect(parseMgrs(fmt.square, fmt.ref)).toEqual({ E: 500000, N: 1300000, square: "WU" });
});

test("rejects junk and the wrong zone", () => {
  expect(parseMgrs("", "")).toEqual({ error: "Needs a grid square and a ref" });
  expect(parseMgrs("UA", "")).toHaveProperty("error");
  expect(parseMgrs("47PUA", "22453-98002")).toHaveProperty("error");
  expect(parseMgrs("UA", "22453-980")).toEqual({
    error: "MGRS easting and northing must have the same number of digits",
  });
  expect(formatMgrs(50000, 1300000)).toEqual({
    error: "Easting is outside the UTM columns for zone 48",
  });
});
