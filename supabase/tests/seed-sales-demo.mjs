// Test data for the sales workflow on a LOCAL Supabase (never run it against a real project).
//
//   npx supabase db reset --local && node supabase/tests/seed-sales-demo.mjs
//
// Accounts (password for all of them: Passw0rd!Passw0rd!):
//   head@crm.test    administrator + manager + sales head
//   anna@crm.test    manager
//   boris@crm.test   manager
//   shop@crm.test    workshop: sees only the production board
//   boss@crm.test    production head
//   nobody@crm.test  no working role yet
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
const boss = await createUser("boss@crm.test", "Павел", "Производов", true);
await createUser("nobody@crm.test", "Новый", "Сотрудник", true);

const setRoles = (who, roles) =>
  call(head.token, "POST", "/rest/v1/rpc/set_staff_roles", {
    p_sales_id: who.salesId,
    p_roles: roles,
  });
await setRoles(anna, ["manager"]);
await setRoles(boris, ["manager"]);
await setRoles(shop, ["workshop"]);
await setRoles(boss, ["production_head"]);

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
  ["Оклейка двух фургонов", "ООО «Логистик»", "+7 900 100-10-03", "other", 3],
  ["Объёмные буквы для офиса", "Дмитрий", "+7 900 100-10-04", "referral", 1],
  ["Вывеска кофейни", "Ольга", "+7 900 100-10-05", "yandex-maps", 0.2],
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
  p_source: "other",
  p_amount: 85000,
});
await call(anna.token, "POST", "/rest/v1/rpc/transition_deal", {
  p_deal_id: mine.deal_id,
  p_expected_version: mine.version,
  p_to_stage: "design-task",
});

// A deal agreed with the customer ("order"): ready to be handed over to production from the board
const signContract = async (who, name, phone) => {
  const deal = await call(
    who.token,
    "POST",
    "/rest/v1/rpc/create_manual_deal",
    {
      p_name: name,
      p_new_contact: { first_name: name.split(" ")[0], phone },
      p_source: "other",
      p_amount: 120000,
    },
  );
  return call(who.token, "POST", "/rest/v1/rpc/transition_deal", {
    p_deal_id: deal.deal_id,
    p_expected_version: deal.version,
    p_to_stage: "order",
  });
};
await signContract(anna, "Вывеска для кофейни", "+7 900 300-30-01");

// An order that the workshop already has, with a link to the layout
const handed = await signContract(
  anna,
  "Баннер для ярмарки",
  "+7 900 300-30-02",
);
await call(anna.token, "POST", "/rest/v1/rpc/handoff_deal_to_production", {
  p_deal_id: handed.deal_id,
  p_expected_version: handed.version,
  p_product_name: "Баннер 2×4 с люверсами",
  p_instructions: "Печать 720 dpi, люверсы каждые 50 см",
  p_due_date: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
  p_links: [{ url: "https://example.com/maket", label: "Макет в облаке" }],
});

// Money: the example of the acceptance, 30 000 + 20 000 paid and 5 000 refunded of 85 000
const pay = (who, dealId, kind, amount, comment) =>
  call(who.token, "POST", "/rest/v1/rpc/register_payment", {
    p_deal_id: dealId,
    p_kind: kind,
    p_amount: amount,
    p_comment: comment ?? null,
  });
await pay(anna, mine.deal_id, "payment", 30000, "Аванс");
await pay(anna, mine.deal_id, "payment", 20000, "Вторая часть");
await pay(anna, mine.deal_id, "refund", 5000, "Возврат за доставку");
const inDays = (days) =>
  new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
await call(anna.token, "PATCH", `/rest/v1/deals?id=eq.${mine.deal_id}`, {
  expected_closing_date: inDays(-2),
});
await pay(anna, handed.deal_id, "payment", 150000, "Предоплата с переплатой");
await call(anna.token, "PATCH", `/rest/v1/deals?id=eq.${handed.deal_id}`, {
  expected_closing_date: inDays(10),
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
