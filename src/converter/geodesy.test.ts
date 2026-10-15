import { expect, test } from "bun:test";

import { convert, wgs84LatLon } from "./geodesy";

// Golden values: cached results of the VBA functions in Indian60_Converter_Template.xlsm (row 5).
test("matches the Excel macro in both directions", () => {
  const [e, n] = convert(100, 100, "w2i");
  expect(e).toBeCloseTo(523.85071023476098, 6);
  expect(n).toBeCloseTo(-217.85228599983176, 6);
  const [e2, n2] = convert(e, n, "i2w");
  expect(e2).toBeCloseTo(99.998526439688135, 6);
  expect(n2).toBeCloseTo(100.00153423635389, 6);
});

test("round trip of a Cambodian point stays within 1 mm", () => {
  const [e, n] = convert(...convert(491300, 1278500, "w2i"), "i2w");
  expect(Math.hypot(e - 491300, n - 1278500)).toBeLessThan(0.001);
});

// Reference: pyproj, EPSG:32648 -> EPSG:4326.
test("wgs84LatLon matches pyproj", () => {
  expect(wgs84LatLon(500000, 0)).toEqual([0, 105]);
  const [lat, lon] = wgs84LatLon(491300, 1278500);
  expect(lat).toBeCloseTo(11.565414742912745, 8);
  expect(lon).toBeCloseTo(104.92020573232998, 8);
});
