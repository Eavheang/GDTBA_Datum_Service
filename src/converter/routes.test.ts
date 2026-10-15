import { expect, test } from "bun:test";

import { app } from "../app";

const post = (path: string, body: unknown) =>
  app.request(`/converter${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

test("convert returns one result per row", async () => {
  const res = await post("/convert", {
    from: "wgs84-mgrs",
    to: "indian60-mgrs",
    rows: [
      { E: "TA", N: "18426-73915" },
      { E: "", N: "" },
      { E: "x", N: "y" },
    ],
  });
  expect(res.status).toBe(200);
  const { results } = await res.json();
  expect(results[0].out).toEqual(["TA", "18845-73591"]);
  expect(results[1]).toBeNull();
  expect(results[2]).toHaveProperty("error");
});

test("convert rejects unknown or equal systems", async () => {
  expect((await post("/convert", { from: "utm", to: "wgs84", rows: [] })).status).toBe(400);
  expect((await post("/convert", { from: "wgs84", to: "wgs84", rows: [] })).status).toBe(400);
});

test("import names the expected headers on a bad file", async () => {
  const res = await app.request("/converter/import", { method: "POST", body: "ID,X\n1,2" });
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.expected).toContain("Easting_WGS84,Northing_WGS84");
});

test("template and export are CSV downloads", async () => {
  const tpl = await app.request("/converter/template/wgs84-dms");
  expect(tpl.headers.get("Content-Disposition")).toContain("template-wgs84-dms.csv");
  expect(await tpl.text()).toBe("Latitude_WGS84_DMS,Longitude_WGS84_DMS\r\n");
  expect((await app.request("/converter/template/nope")).status).toBe(400);
  const out = await post("/export", {
    from: "wgs84",
    to: "indian60",
    rows: [{ E: "218426", N: "1573915" }],
  });
  expect(await out.text()).toContain("218844.944,1573591.420");
});
