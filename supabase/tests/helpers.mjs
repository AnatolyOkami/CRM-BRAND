// Helpers shared by the integration tests of the sales and production workflows.
// They talk to a real local Supabase (PostgREST, Auth, Postgres, Storage).
import assert from "node:assert/strict";
import { execSync } from "node:child_process";

const status = Object.fromEntries(
  // execSync runs through the shell, so that npx also resolves on Windows (npx.cmd)
  execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
export const API = status.API_URL;
export const PUB = status.PUBLISHABLE_KEY;
export const SECRET = status.SECRET_KEY;
export const PASSWORD = "Passw0rd!Passw0rd!";
export const RUN = Date.now().toString(36);

export const rest = async (token, method, path, body, extraHeaders = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: token === SECRET ? SECRET : PUB,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

export const rpc = (token, name, args) =>
  rest(token, "POST", `/rest/v1/rpc/${name}`, args);

export const users = {};

const adminHeaders = {
  apikey: SECRET,
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
};

const signIn = async (email) => {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) return null;
  return (await res.json()).access_token;
};

// Creates the account, or signs in when an earlier run already created it
const ensureUser = async (key, isFirst) => {
  const email = `${key}@test.local`;
  let token = await signIn(email);
  let id;
  if (!token) {
    id = crypto.randomUUID();
    // everybody except the very first account has to be invited
    if (!isFirst) {
      await rest(SECRET, "POST", "/rest/v1/user_invitations", { user_id: id });
    }
    const created = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        id,
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { first_name: key, last_name: "Test" },
      }),
    });
    assert.equal(created.status, 200, `create ${key}: ${await created.text()}`);
    token = await signIn(email);
  }
  const me = await fetch(`${API}/auth/v1/user`, {
    headers: { apikey: PUB, Authorization: `Bearer ${token}` },
  });
  id = (await me.json()).id;
  const sales = await rest(SECRET, "GET", `/rest/v1/sales?user_id=eq.${id}`);
  users[key] = { id, email, token, salesId: sales.body[0].id };
  return users[key];
};

export const setRoles = (key, roles) =>
  rpc(users.admin.token, "set_staff_roles", {
    p_sales_id: users[key].salesId,
    p_roles: roles,
  });

/**
 * Creates (or signs in) the accounts of the tests. The very first account of a database becomes
 * the administrator, so on a fresh database run `npx supabase db reset --local` first.
 */
export const setupUsers = async () => {
  const empty = await rest(SECRET, "GET", "/rest/v1/sales?select=id&limit=1");
  try {
    await ensureUser("admin", empty.body.length === 0);
  } catch (error) {
    throw new Error(
      `Run \`npx supabase db reset --local\` first: the first account must become the administrator (${error.message})`,
    );
  }
  for (const key of ["m1", "m2", "shop", "boss", "nobody"]) {
    await ensureUser(key, false);
  }
  const roles = {
    m1: ["manager"],
    m2: ["manager"],
    shop: ["workshop"],
    boss: ["production_head"],
  };
  for (const [key, list] of Object.entries(roles)) {
    assert.equal((await setRoles(key, list)).status, 204);
  }
};

// An unassigned deal, created by the sales head without taking it
export const newQueueDeal = async (name, extra = {}) => {
  const res = await rpc(users.admin.token, "create_manual_deal", {
    p_name: name,
    p_new_contact: { first_name: name, phone: "+7 900 000-00-00" },
    p_assign_to_me: false,
    ...extra,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

export const getDeal = async (id) =>
  (await rest(SECRET, "GET", `/rest/v1/deals?id=eq.${id}`)).body[0];

export const firstContactTasks = async (dealId) =>
  (
    await rest(
      SECRET,
      "GET",
      `/rest/v1/tasks?deal_id=eq.${dealId}&type=eq.first-contact`,
    )
  ).body;
