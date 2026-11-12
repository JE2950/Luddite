// Admin function: lets an admin list teachers, add teachers, set passwords and remove teachers.
// Deploy in Supabase → Edge Functions → Deploy a new function → Via Editor, named "quiz-admin"
// (or whatever name you put as adminFunction in assets/config.js).
// It uses the service role key that Supabase provides to every Edge Function; that key never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Who is calling, and are they an admin?
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who?.user) return reply({ error: "Please sign in again." }, 401);
    const me = who.user;
    const { data: row } = await admin.from("admins").select("user_id").eq("user_id", me.id).maybeSingle();
    if (!row) return reply({ error: "Only admins can do this." }, 403);

    const body = await req.json().catch(() => ({}));
    const pw = (p: unknown) => typeof p === "string" && p.length >= 8;

    switch (body.action) {
      case "list": {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw error;
        const { data: admins } = await admin.from("admins").select("user_id");
        const ids = new Set((admins || []).map((a: { user_id: string }) => a.user_id));
        const teachers = data.users.map((u) => ({
          id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, admin: ids.has(u.id), you: u.id === me.id,
        })).sort((a, b) => (a.email || "").localeCompare(b.email || ""));
        return reply({ teachers });
      }
      case "create": {
        const email = String(body.email || "").trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ error: "That doesn't look like an email address." }, 400);
        if (!pw(body.password)) return reply({ error: "Passwords need at least 8 characters." }, 400);
        const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
        if (error) return reply({ error: /already/i.test(error.message) ? "There is already an account with that email." : error.message }, 400);
        return reply({ id: data.user?.id });
      }
      case "set_password": {
        if (!pw(body.password)) return reply({ error: "Passwords need at least 8 characters." }, 400);
        const { error } = await admin.auth.admin.updateUserById(String(body.id), { password: body.password });
        if (error) return reply({ error: error.message }, 400);
        return reply({ ok: true });
      }
      case "remove": {
        if (body.id === me.id) return reply({ error: "You can't remove your own account." }, 400);
        const { error } = await admin.auth.admin.deleteUser(String(body.id));
        if (error) return reply({ error: error.message }, 400);
        return reply({ ok: true });
      }
      default:
        return reply({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    return reply({ error: (e as Error).message || "Something went wrong." }, 500);
  }
});
