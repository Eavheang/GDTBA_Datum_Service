import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logger } from "hono/logger";

import { converter } from "./converter/routes";

export const app = new Hono()
  .use(logger())
  // The web caps CSV imports at 5 MB; this leaves room for JSON overhead.
  .use(
    bodyLimit({
      maxSize: 6_000_000,
      onError: (c) => c.json({ message: "Request too large" }, 413),
    }),
  )
  .get("/health", (c) => c.json({ ok: true }))
  .route("/converter", converter);

app.notFound((c) => c.json({ message: "Not Found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ message: "Internal Server Error" }, 500);
});

export type AppType = typeof app;
