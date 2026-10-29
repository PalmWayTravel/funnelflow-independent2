// Base44-kompatibilis kliens Supabase-en. A felület ugyanúgy hívja
// (base44.entities.X.list/filter/..., base44.auth.*, base44.functions.invoke),
// de a háttér már saját Supabase projekt: Postgres + RLS + Auth + Edge Functions.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const fail = (error, fallback = "Ismeretlen hiba") => {
  const e = new Error((error && (error.message || error.error_description)) || fallback);
  e.status = error?.status || (error?.code === "42501" ? 403 : 400);
  e.data = error;
  throw e;
};

const unwrap = ({ data, error }) => {
  if (error) fail(error);
  return data;
};

// ---- Entitások --------------------------------------------------------------
// Az "options" objektumos hívás ({sort, limit}) lapozott választ ad ({items, has_more}),
// a pozicionális hívás (sort, limit, skip) sima tömböt – mint a Base44 SDK.
function entityApi(name) {
  const find = (filter, sort, limit, skip) =>
    supabase
      .rpc("entity_find", { p_entity: name, p_filter: filter || {}, p_sort: sort || null, p_limit: limit ?? 50, p_skip: skip ?? 0 })
      .then(unwrap);

  const filterFn = async (query, sortOrOpts, limit, skip) => {
    if (sortOrOpts && typeof sortOrOpts === "object") {
      const lim = sortOrOpts.limit ?? 50;
      const rows = await find(query, sortOrOpts.sort, lim + 1, sortOrOpts.skip ?? 0);
      return { items: rows.slice(0, lim), has_more: rows.length > lim };
    }
    return find(query, sortOrOpts, limit, skip);
  };

  return {
    list: (sort, limit, skip) => find({}, sort, limit, skip),
    filter: filterFn,
    get: (id) => supabase.rpc("entity_get", { p_entity: name, p_id: String(id) }).then(unwrap),
    create: (data) => supabase.rpc("entity_create", { p_entity: name, p_data: data || {} }).then(unwrap),
    bulkCreate: async (rows) => {
      const out = [];
      for (const r of rows || []) out.push(await supabase.rpc("entity_create", { p_entity: name, p_data: r }).then(unwrap));
      return out;
    },
    update: (id, patch) => supabase.rpc("entity_update", { p_entity: name, p_id: String(id), p_patch: patch || {} }).then(unwrap),
    updateMany: (query, patch) =>
      supabase.rpc("entity_update_many", { p_entity: name, p_filter: query || {}, p_patch: patch || {} }).then(unwrap),
    delete: (id) => supabase.rpc("entity_delete", { p_entity: name, p_id: String(id) }).then(unwrap),
    deleteMany: (query) => supabase.rpc("entity_delete_many", { p_entity: name, p_filter: query || {} }).then(unwrap),
    count: (query) => supabase.rpc("entity_count", { p_entity: name, p_filter: query || {} }).then(unwrap).then(Number),
    aggregate: ({ query, groupBy, sum, limit } = {}) =>
      supabase
        .rpc("entity_aggregate", { p_entity: name, p_filter: query || {}, p_group_by: groupBy || null, p_sum: sum || [], p_limit: limit ?? 100 })
        .then(unwrap),
  };
}

// A User entitás a profiles táblára képződik (a belépett felhasználók profilja).
function userApi() {
  const PROFILE_FIELDS = "id,email,full_name,role,account_id,avatar_color,created_date,updated_date";
  const norm = (r) => r && { ...r, account_id: r.account_id || "" };
  return {
    list: async (sort) => {
      const desc = typeof sort === "string" && sort.startsWith("-");
      const col = typeof sort === "string" && sort.replace(/^-/, "") === "created_date" ? "created_date" : "full_name";
      const rows = unwrap(await supabase.from("profiles").select(PROFILE_FIELDS).order(col, { ascending: !desc }).limit(1000));
      return rows.map(norm);
    },
    filter: async (query = {}) => {
      let q = supabase.from("profiles").select(PROFILE_FIELDS);
      for (const [k, v] of Object.entries(query)) if (typeof v !== "object") q = q.eq(k, v);
      return unwrap(await q.limit(1000)).map(norm);
    },
    get: async (id) => norm(unwrap(await supabase.from("profiles").select(PROFILE_FIELDS).eq("id", id).single())),
    update: async (id, patch) =>
      norm(unwrap(await supabase.from("profiles").update(patch).eq("id", id).select(PROFILE_FIELDS).single())),
  };
}

const entityCache = new Map();
const entities = new Proxy(
  {},
  {
    get(_, name) {
      if (typeof name !== "string") return undefined;
      if (!entityCache.has(name)) entityCache.set(name, name === "User" ? userApi() : entityApi(name));
      return entityCache.get(name);
    },
  }
);

// ---- Azonosítás -------------------------------------------------------------
async function currentProfile() {
  const { data: sess } = await supabase.auth.getSession();
  const user = sess?.session?.user;
  if (!user) {
    const e = new Error("Nincs bejelentkezve");
    e.status = 401;
    throw e;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,account_id,avatar_color,created_date")
    .eq("id", user.id)
    .single();
  if (error) fail(error);
  return { ...data, account_id: data.account_id || "" };
}

const auth = {
  me: currentProfile,
  isAuthenticated: async () => !!(await supabase.auth.getSession()).data?.session,
  updateMe: async (patch) => {
    const me = await currentProfile();
    const allowed = {};
    for (const k of ["full_name", "avatar_color"]) if (k in patch) allowed[k] = patch[k];
    return unwrap(await supabase.from("profiles").update(allowed).eq("id", me.id).select().single());
  },
  loginViaEmailPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail(error, "Hibás e-mail vagy jelszó");
    return data;
  },
  loginWithProvider: (provider, returnTo = "/") =>
    supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + returnTo } }),
  // Regisztráció csak meghívóval megy; a nyílt regisztráció ki van kapcsolva a Supabase-ben.
  register: async ({ email, password }) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) fail(error);
  },
  verifyOtp: async ({ email, otpCode }) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: "signup" });
    if (error) fail(error);
    return { access_token: data.session?.access_token };
  },
  resendOtp: async (email) => {
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) fail(error);
  },
  setToken: () => {},
  resetPasswordRequest: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
    if (error) fail(error);
  },
  // A visszaállító linkre kattintva a Supabase már bejelentkeztet egy helyreállító munkamenetbe.
  resetPassword: async ({ newPassword }) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) fail(error);
  },
  logout: async (redirectTo) => {
    await supabase.auth.signOut();
    window.location.href = redirectTo ? "/login" : "/login";
  },
  redirectToLogin: (returnTo) => {
    const rt = returnTo ? `?returnTo=${encodeURIComponent(new URL(returnTo, window.location.origin).pathname)}` : "";
    window.location.href = `/login${rt}`;
  },
};

// ---- Háttérfüggvények (Supabase Edge Functions) -----------------------------
const functions = {
  invoke: async (name, payload = {}) => {
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) {
      let detail = null;
      try {
        detail = await error.context?.json?.();
      } catch (_) { /* nincs JSON törzs */ }
      const e = new Error(detail?.error || detail?.message || error.message || "Függvényhiba");
      e.status = error.context?.status || 500;
      e.data = detail;
      throw e;
    }
    return { data };
  },
};

// ---- Felhasználók meghívása, fájlfeltöltés, publikus beállítások -------------
const users = {
  inviteUser: async (email, role = "user") => (await functions.invoke("inviteUser", { email, role })).data,
};

const integrations = {
  Core: {
    UploadPublicFile: async ({ file }) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${crypto.randomUUID()}/${safe}`;
      const { error } = await supabase.storage.from("public-files").upload(path, file, { contentType: file.type });
      if (error) fail(error);
      const { data } = supabase.storage.from("public-files").getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

const app = {
  getPublicSettings: async () => ({ id: "funnelflow", public_settings: "private" }),
};

// A Base44 beépített AI-ügynökei (Panaszkezelő) itt még nincsenek átvive.
const unsupported = (what) => async () => {
  throw new Error(`${what} ebben a verzióban még nem érhető el`);
};
const agents = {
  listConversations: async () => [],
  getConversation: unsupported("AI asszisztens"),
  createConversation: unsupported("AI asszisztens"),
  addMessage: unsupported("AI asszisztens"),
  subscribeToConversation: () => () => {},
};

export const base44 = { entities, auth, functions, users, integrations, app, agents };
