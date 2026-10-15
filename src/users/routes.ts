import { zValidator } from "@hono/zod-validator";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Service-role client: bypasses RLS and can manage auth users. Never expose its key.
// Null when unconfigured, so the rest of the API (and its tests) runs without Supabase.
const admin =
  url && secret
    ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

const roleSchema = z.enum(["admin", "user"]);
const id = z.object({ id: z.uuid() });

/** Fails closed: the caller's token must resolve to a live user whose public.profiles role is admin. */
const requireAdmin = createMiddleware<{ Variables: { supabase: SupabaseClient } }>(
  async (c, next) => {
    if (!admin) return c.json({ message: "User admin is not configured" }, 503);
    const token = c.req.header("Authorization")?.replace(/^Bearer /, "");
    if (!token) return c.json({ message: "Unauthorized" }, 401);
    const { data } = await admin.auth.getUser(token);
    if (!data.user) return c.json({ message: "Unauthorized" }, 401);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") return c.json({ message: "Forbidden" }, 403);
    c.set("supabase", admin);
    await next();
  },
);

const fail = (message: string) => Response.json({ message }, { status: 400 });

export const users = new Hono()
  .use(requireAdmin)
  .get("/", async (c) => {
    const [list, profiles] = await Promise.all([
      c.var.supabase.auth.admin.listUsers({ perPage: 1000 }),
      c.var.supabase.from("profiles").select("id, role"),
    ]);
    if (list.error) return fail(list.error.message);
    if (profiles.error) return fail(profiles.error.message);
    const admins = new Set(profiles.data.filter((p) => p.role === "admin").map((p) => p.id));
    return c.json({
      users: list.data.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        role: admins.has(u.id) ? "admin" : "user",
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })),
    });
  })
  .post(
    "/",
    zValidator(
      "json",
      z.object({ email: z.email(), password: z.string().min(8).max(72), role: roleSchema }),
    ),
    async (c) => {
      const { email, password, role } = c.req.valid("json");
      const { data, error } = await c.var.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return fail(error.message);
      // The on_auth_user_created trigger made a 'user' profile; promote it if asked.
      if (role === "admin") {
        const promoted = await c.var.supabase
          .from("profiles")
          .update({ role })
          .eq("id", data.user.id);
        if (promoted.error) return fail(`User created as user; ${promoted.error.message}`);
      }
      return c.json({ id: data.user.id }, 201);
    },
  )
  .patch(
    "/:id",
    zValidator("param", id),
    zValidator("json", z.object({ role: roleSchema })),
    async (c) => {
      const { data, error } = await c.var.supabase
        .from("profiles")
        .update({ role: c.req.valid("json").role })
        .eq("id", c.req.valid("param").id)
        .select("id");
      if (error) return fail(error.message);
      return data.length ? c.json({ ok: true }) : c.json({ message: "User not found" }, 404);
    },
  )
  // Fix a user's sign-in: change their email and/or set a new password (e.g. they forgot it).
  .patch(
    "/:id/credentials",
    zValidator("param", id),
    zValidator(
      "json",
      z
        .object({ email: z.email().optional(), password: z.string().min(8).max(72).optional() })
        .refine((b) => b.email || b.password, "Nothing to update"),
    ),
    async (c) => {
      const { error } = await c.var.supabase.auth.admin.updateUserById(c.req.valid("param").id, {
        ...c.req.valid("json"),
        email_confirm: true, // admin-set email is trusted, no confirmation mail
      });
      return error ? fail(error.message) : c.json({ ok: true });
    },
  )
  .delete("/:id", zValidator("param", id), async (c) => {
    // The profile row goes with it (on delete cascade).
    const { error } = await c.var.supabase.auth.admin.deleteUser(c.req.valid("param").id);
    return error ? fail(error.message) : c.json({ ok: true });
  });
