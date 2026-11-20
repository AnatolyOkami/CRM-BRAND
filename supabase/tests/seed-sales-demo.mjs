// Test data for the sales workflow on a LOCAL Supabase (never run it against a real project).
//
//   npx supabase db reset --local && node supabase/tests/seed-sales-demo.mjs
//
// Accounts (password for all of them: Passw0rd!Passw0rd!):
//   head@crm.test    administrator + manager + sales head
//   anna@crm.test    manager
//   boris@crm.test   manager
//   shop@crm.test    workshop: sees no sales data at all
//   nobody@crm.test  no working role yet
import { execFileSync } from "node:child_process";

const status = Object.fromEntries(
  execFileSync("npx", ["supabase", "status", "-o", "env"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split("\n")
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = status.API_URL;
const PUB = status.PUBLISHABLE_KEY;
const SECRET = status.SECRET_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(API)) {
  throw new Error(`Refusing to seed a non local instance: ${API}`);
}
const PASSWORD = "Passw0rd!Passw0rd!";

const call = async (token, method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: token === SECRET ? SECRET : PUB,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return json;
};

const createUser = async (email, firstName, lastName, invite) => {
  const id = crypto.randomUUID();
  if (invite)
    await call(SECRET, "POST", "/rest/v1/user_invitations", { user_id: id });
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id,
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    }),
  });
  if (!res.ok) throw new Error(`create ${email}: ${await res.text()}`);
  const login = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUB, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { access_token } = await login.json();
  const [sale] = await call(SECRET, "GET", `/rest/v1/sales?user_id=eq.${id}`);
  return { token: access_token, salesId: sale.id };
};

const existing = await call(SECRET, "GET", "/rest/v1/sales?select=id&limit=1");
if (existing.length > 0) {
  throw new Error(
    "The database is not empty. Run `npx supabase db reset --local` first.",
  );
}

const head = await createUser("head@crm.test", "Ирина", "Руководова", false);
const anna = await createUser("anna@crm.test", "Анна", "Менеджерова", true);
const boris = await createUser("boris@crm.test", "Борис", "Продажин", true);
const shop = await createUser("shop@crm.test", "Сергей", "Цехов", true);
await createUser("nobody@crm.test", "Новый", "Сотрудник", true);

const setRoles = (who, roles) =>
  call(head.token, "POST", "/rest/v1/rpc/set_staff_roles", {
    p_sales_id: who.salesId,
    p_roles: roles,
  });
await setRoles(anna, ["manager"]);
await setRoles(boris, ["manager"]);
await setRoles(shop, ["workshop"]);

const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const requests = [
  [
    "Баннер 3×6 на фасад магазина",
    "Алексей",
    "+7 900 100-10-01",
    "website",
    30,
  ],
  ["Световой короб «Аптека»", "Мария", "+7 900 100-10-02", "avito", 5],
  ["Оклейка двух фургонов", "ООО «Логистик»", "+7 900 100-10-03", "phone", 3],
  ["Объёмные буквы для офиса", "Дмитрий", "+7 900 100-10-04", "telegram", 1],
  ["Вывеска кофейни", "Ольга", "+7 900 100-10-05", "whatsapp", 0.2],
];
for (const [name, first_name, phone, source, ago] of requests) {
  await call(head.token, "POST", "/rest/v1/rpc/create_manual_deal", {
    p_name: name,
    p_new_contact: { first_name, phone },
    p_source: source,
    p_received_at: hoursAgo(ago),
    p_assign_to_me: false,
    p_description: "Тестовая заявка",
  });
}

const mine = await call(anna.token, "POST", "/rest/v1/rpc/create_manual_deal", {
  p_name: "Стенд для выставки",
  p_new_contact: { first_name: "Виктор", phone: "+7 900 200-20-01" },
  p_source: "phone",
  p_amount: 85000,
});
await call(anna.token, "POST", "/rest/v1/rpc/transition_deal", {
  p_deal_id: mine.deal_id,
  p_expected_version: mine.version,
  p_to_stage: "contacted",
});

await call(head.token, "POST", "/rest/v1/deals", {
  name: "Баннер для стадиона (2025)",
  stage: "won",
  amount: 150000,
  is_historical: true,
  sales_id: boris.salesId,
});

process.stdout.write(
  `Seeded. Sign in as head@crm.test or anna@crm.test with ${PASSWORD}\n`,
);
