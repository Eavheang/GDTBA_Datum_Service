import { app } from "./app";

export default { port: Number(process.env.PORT ?? 8000), fetch: app.fetch };
