import { expect, test } from "bun:test";

import { parseImport } from "./import-csv";

test("detects the datum from the template header", () => {
  expect(parseImport("Easting_Indian60,Northing_Indian60\n491300,1278500")).toEqual({
    ok: true,
    system: "indian60",
    rows: [{ E: "491300", N: "1278500" }],
    skipped: [],
  });
  const r = parseImport("﻿ easting_wgs84 ; NORTHING_WGS84 ;;\r\n491300;1278500\r\n");
  expect(r.ok && r.system).toBe("wgs84");
});

test("detects a WGS84 MGRS file", () => {
  expect(parseImport("Grid_WGS84,Ref_WGS84\nUA,22453-98002")).toEqual({
    ok: true,
    system: "wgs84-mgrs",
    rows: [{ E: "UA", N: "22453-98002" }],
    skipped: [],
  });
});

test("rejects files that are not the template", () => {
  expect(parseImport("ID,X,Y\n1,491300,1278500")).toEqual({ ok: false, found: "ID,X,Y" });
  expect(parseImport("Easting,Northing\n491300,1278500").ok).toBe(false);
  expect(parseImport("Easting_WGS84,Northing_WGS84,Owner\n1,2,x").ok).toBe(false);
  expect(parseImport("")).toEqual({ ok: false, found: "(empty file)" });
});

test("skips bad rows by line number and keeps out-of-range ones", () => {
  const r = parseImport(
    [
      "Easting_WGS84,Northing_WGS84",
      "491300,1278500",
      "491300,",
      "",
      "49l300,1278500",
      "1205000,491000",
    ].join("\n"),
  );
  if (!r.ok) throw new Error("expected ok");
  expect(r.rows).toEqual([
    { E: "491300", N: "1278500" },
    { E: "1205000", N: "491000" },
  ]);
  expect(r.skipped).toEqual([3, 5]);
});

test("keeps quoted thousands separators in one cell", () => {
  const r = parseImport('Easting_WGS84,Northing_WGS84\n"491,300.25","1,278,500.75"');
  expect(r.ok && r.rows).toEqual([{ E: "491,300.25", N: "1,278,500.75" }]);
});

test("reads an Excel DMS file with doubled quotes", () => {
  expect(
    parseImport(`Latitude_WGS84_DMS,Longitude_WGS84_DMS\n"14°22'49.48""N","104°50'52.34""E"`),
  ).toEqual({
    ok: true,
    system: "wgs84-dms",
    rows: [{ E: `14°22'49.48"N`, N: `104°50'52.34"E` }],
    skipped: [],
  });
});
