import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createFactory } from "hono/factory";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Service-role client: bypasses RLS and can manage auth users. Never expose its key.
// Null when unconfigured: every guarded route then fails closed with 503.
const admin =
  url && secret
    ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

export const factory = createFactory<{ Variables: { user: User; supabase: SupabaseClient } }>();

/** The caller's bearer token must resolve to a live Supabase user. */
// ponytail: one Supabase round trip per request; verify the JWT locally (hono/jwk + project JWKS) if latency matters.
export const requireUser = factory.createMiddleware(async (c, next) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
  if (!token) return c.json({ message: "Unauthorized" }, 401);
  if (!admin) return c.json({ message: "Auth is not configured" }, 503);
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return c.json({ message: "Unauthorized" }, 401);
  c.set("user", data.user);
  c.set("supabase", admin);
  await next();
});

/** Runs after requireUser: the user's public.profiles role must be admin. */
export const requireAdmin = factory.createMiddleware(async (c, next) => {
  const { data: profile } = await c.var.supabase
    .from("profiles")
    .select("role")
    .eq("id", c.var.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return c.json({ message: "Forbidden" }, 403);
  await next();
});
