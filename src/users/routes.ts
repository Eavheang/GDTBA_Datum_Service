import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { factory, requireAdmin } from "../middleware/auth";

const roleSchema = z.enum(["admin", "user"]);
const id = z.object({ id: z.uuid() });

const fail = (message: string) => Response.json({ message }, { status: 400 });

export const users = factory
  .createApp()
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
