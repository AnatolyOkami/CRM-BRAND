// Integration tests of the inbound leads, the sources and the call result against a real local Supabase.
//
//   npx supabase db reset --local && node --test supabase/tests/intake-api.test.mjs
//
// They call the Data API directly: the rules must hold without the UI.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  PUB,
  RUN,
  SECRET,
  getDeal,
  newQueueDeal,
  rest,
  rpc,
  setupUsers,
  users,
} from "./helpers.mjs";

before(setupUsers);

const createPartner = async (name, extra = {}) => {
  const res = await rpc(users.admin.token, "save_lead_partner", {
    p_id: null,
    p_name: `${name} ${RUN}`,
    p_kind: "partner",
    p_source: "partner",
    ...extra,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

const intake = (code, extra = {}) =>
  rpc(SECRET, "intake_lead", {
    p_partner_code: code,
    p_submission_id: `sub-${RUN}-${Math.random().toString(36).slice(2)}`,
    p_name: "Алексей",
    p_contact: "+7 900 123-45-67",
    p_description: "Баннер 3×6 на фасад",
    ...extra,
  });

describe("intake_lead", () => {
  it("creates one unassigned deal in the first column with the partner and the source", async () => {
    const partner = await createPartner("Рекламный партнёр");
    const res = await intake(partner.code, {
      p_utm: {
        utm_source: "yandex",
        utm_campaign: "spring",
        evil: "x",
        utm_term: 7,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.duplicate, false);

    const deal = await getDeal(res.body.deal_id);
    assert.equal(deal.stage, "opportunity");
    assert.equal(deal.sales_id, null);
    assert.equal(deal.source, "partner");
    assert.equal(deal.partner_id, partner.id);
    assert.deepEqual(deal.utm, {
      utm_source: "yandex",
      utm_campaign: "spring",
    });
    assert.ok(Date.now() - new Date(deal.received_at).getTime() < 60_000);
    assert.equal(deal.description, "Баннер 3×6 на фасад");

    const contact = (
      await rest(
        SECRET,
        "GET",
        `/rest/v1/contacts?id=eq.${deal.contact_ids[0]}`,
      )
    ).body[0];
    assert.equal(contact.first_name, "Алексей");
    assert.equal(contact.phone_jsonb[0].number, "+7 900 123-45-67");

    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.id}`,
    );
    assert.deepEqual(
      history.body.map((h) => h.event),
      ["created"],
    );
  });

  it("creates one deal for a repeated and for a concurrent submission with the same id", async () => {
    const partner = await createPartner("Повтор");
    const args = {
      p_partner_code: partner.code,
      p_submission_id: `dup-${RUN}-0001`,
      p_name: "Ольга",
      p_contact: "olga@example.com",
    };
    const results = await Promise.all([
      rpc(SECRET, "intake_lead", args),
      rpc(SECRET, "intake_lead", args),
      rpc(SECRET, "intake_lead", args),
    ]);
    for (const r of results)
      assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(new Set(results.map((r) => r.body.deal_id)).size, 1);
    assert.equal(results.filter((r) => r.body.duplicate === false).length, 1);

    const deals = await rest(
      SECRET,
      "GET",
      `/rest/v1/deals?partner_id=eq.${partner.id}`,
    );
    assert.equal(deals.body.length, 1);
    const contact = (
      await rest(
        SECRET,
        "GET",
        `/rest/v1/contacts?id=eq.${deals.body[0].contact_ids[0]}`,
      )
    ).body[0];
    assert.equal(contact.email_jsonb[0].email, "olga@example.com");
  });

  it("keeps a contact that is neither a phone nor an email as a note of the contact", async () => {
    const partner = await createPartner("Мессенджер");
    const res = await intake(partner.code, { p_contact: "@alexey_tg" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const deal = await getDeal(res.body.deal_id);
    const contact = (
      await rest(
        SECRET,
        "GET",
        `/rest/v1/contacts?id=eq.${deal.contact_ids[0]}`,
      )
    ).body[0];
    assert.match(contact.background, /@alexey_tg/);
  });

  it("rejects an unknown or switched off partner and a bad request", async () => {
    const unknown = await intake("0".repeat(24));
    assert.equal(unknown.status, 404);

    const partner = await createPartner("Выключенный");
    const off = await rpc(users.admin.token, "save_lead_partner", {
      p_id: partner.id,
      p_name: "Выключенный",
      p_kind: "partner",
      p_source: "partner",
      p_is_active: false,
    });
    assert.equal(off.status, 200);
    assert.equal((await intake(partner.code)).status, 404);

    const active = await createPartner("Проверка");
    assert.equal((await intake(active.code, { p_contact: "  " })).status, 422);
    assert.equal(
      (await intake(active.code, { p_submission_id: "short" })).status,
      422,
    );
    assert.equal(
      (await intake(active.code, { p_description: "x".repeat(4001) })).status,
      422,
    );
  });

  it("uses the source of the partner link, for example Avito", async () => {
    const partner = await createPartner("Авито", { p_source: "avito" });
    const res = await intake(partner.code);
    assert.equal((await getDeal(res.body.deal_id)).source, "avito");
  });

  it("cannot be called by a signed-in person or by an anonymous visitor", async () => {
    const partner = await createPartner("Закрытый");
    const body = {
      p_partner_code: partner.code,
      p_submission_id: `deny-${RUN}-0001`,
      p_contact: "+7 900 000-00-01",
    };
    for (const token of [users.admin.token, users.m1.token, PUB]) {
      const res = await rpc(token, "intake_lead", body);
      assert.ok([401, 403].includes(res.status), `${res.status}`);
    }
    const secret = await rpc(users.admin.token, "get_intake_partner", {
      p_code: partner.code,
    });
    assert.ok([401, 403].includes(secret.status));
  });
});

describe("partners and sources", () => {
  it("are managed only by the administrator and the sales head", async () => {
    for (const key of ["m1", "shop", "nobody"]) {
      const res = await rpc(users[key].token, "save_lead_partner", {
        p_id: null,
        p_name: "x",
        p_kind: "partner",
        p_source: "partner",
      });
      assert.equal(res.status, 403, key);
      const source = await rpc(users[key].token, "save_lead_source", {
        p_code: `x-${RUN}`,
        p_label: "x",
      });
      assert.equal(source.status, 403, key);
    }
  });

  it("show the secret of a website once and keep it out of the Data API", async () => {
    const created = await createPartner("Сайт", {
      p_kind: "website",
      p_source: "website",
    });
    assert.match(created.secret, /^[0-9a-f]{48}$/);

    const stored = await rpc(SECRET, "get_intake_partner", {
      p_code: created.code,
    });
    assert.equal(stored.body.secret, created.secret);
    assert.equal(stored.body.kind, "website");

    const list = await rest(
      users.m1.token,
      "GET",
      "/rest/v1/lead_partners?select=*",
    );
    assert.equal(list.status, 200);
    assert.ok(list.body.length > 0);
    assert.ok(list.body.every((p) => !("secret" in p)));

    const rotated = await rpc(users.admin.token, "rotate_lead_partner_secret", {
      p_id: created.id,
    });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.body, created.secret);
    const byManager = await rpc(users.m1.token, "rotate_lead_partner_secret", {
      p_id: created.id,
    });
    assert.equal(byManager.status, 403);
  });

  it("cannot be written through the Data API", async () => {
    for (const [method, path, body] of [
      ["POST", "/rest/v1/lead_partners", { name: "x", source: "partner" }],
      ["POST", "/rest/v1/lead_sources", { code: `d-${RUN}`, label: "x" }],
      ["PATCH", "/rest/v1/lead_sources?code=eq.other", { label: "hacked" }],
    ]) {
      const res = await rest(users.admin.token, method, path, body);
      assert.ok(
        [401, 403].includes(res.status),
        `${method} ${path} ${res.status}`,
      );
    }
  });

  it("lets the sales head add a source and switch one off", async () => {
    const code = `fair-${RUN}`;
    const created = await rpc(users.admin.token, "save_lead_source", {
      p_code: code,
      p_label: "Выставка",
      p_position: 85,
    });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const ok = await rpc(users.m1.token, "create_manual_deal", {
      p_name: `fair ${RUN}`,
      p_new_contact: { first_name: "F" },
      p_source: code,
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    await rpc(users.admin.token, "save_lead_source", {
      p_code: code,
      p_label: "Выставка",
      p_is_active: false,
      p_position: 85,
    });
    const off = await rpc(users.m1.token, "create_manual_deal", {
      p_name: `fair off ${RUN}`,
      p_new_contact: { first_name: "F" },
      p_source: code,
    });
    assert.equal(off.status, 422);
    // the old deal keeps its source
    assert.equal((await getDeal(ok.body.deal_id)).source, code);

    const bad = await rpc(users.admin.token, "save_lead_source", {
      p_code: "Bad Code!",
      p_label: "x",
    });
    assert.ok(bad.status >= 400 && bad.status < 500);
  });
});

describe("set_deal_source", () => {
  const ownDeal = async (name) => {
    const res = await rpc(users.m1.token, "create_manual_deal", {
      p_name: name,
      p_new_contact: { first_name: name },
      p_source: "avito",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  it("changes the source of the deal of a colleague and keeps the change in the history", async () => {
    const deal = await ownDeal("source change");
    const res = await rpc(users.m2.token, "set_deal_source", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_source: "yandex-maps",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await getDeal(deal.deal_id);
    assert.equal(row.source, "yandex-maps");
    assert.equal(row.sales_id, users.m1.salesId);

    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&event=eq.source`,
    );
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].changed_by, users.m2.salesId);
    assert.equal(history.body[0].reason, "Источник: Авито → Яндекс Карты");
  });

  it("refuses an unknown source and a stale version, and does not write the same value twice", async () => {
    const deal = await ownDeal("source checks");
    const unknown = await rpc(users.m1.token, "set_deal_source", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_source: "carrier-pigeon",
    });
    assert.equal(unknown.status, 422);
    const retired = await rpc(users.m1.token, "set_deal_source", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_source: "telegram",
    });
    assert.equal(retired.status, 422);
    const stale = await rpc(users.m1.token, "set_deal_source", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version - 1,
      p_source: "website",
    });
    assert.equal(stale.status, 409);
    const same = await rpc(users.m1.token, "set_deal_source", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_source: "avito",
    });
    assert.equal(same.status, 200);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&event=eq.source`,
    );
    assert.equal(history.body.length, 0);
  });

  it("is closed to people without a sales role", async () => {
    const deal = await ownDeal("source access");
    for (const key of ["shop", "nobody"]) {
      const res = await rpc(users[key].token, "set_deal_source", {
        p_deal_id: deal.deal_id,
        p_expected_version: deal.version,
        p_source: "website",
      });
      assert.equal(res.status, 403, key);
    }
  });

  it("cannot be done through a plain update", async () => {
    const deal = await ownDeal("source patch");
    const res = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${deal.deal_id}`,
      { source: "website" },
    );
    assert.equal(res.status, 403);
    const partner = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${deal.deal_id}`,
      { partner_id: 1 },
    );
    assert.equal(partner.status, 403);
  });
});

describe("log_call_result", () => {
  const ownDeal = async (name) => {
    const res = await rpc(users.m1.token, "create_manual_deal", {
      p_name: name,
      p_new_contact: { first_name: name, phone: "+7 900 111-11-11" },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body;
  };

  it("keeps the result as a note, plans the call back and closes the first contact task", async () => {
    const deal = await ownDeal("call result");
    const recall = new Date(Date.now() + 2 * 86400_000).toISOString();
    const res = await rpc(users.m1.token, "log_call_result", {
      p_deal_id: deal.deal_id,
      p_result: "Клиент ждёт расчёт",
      p_agreements: "Прислать КП до пятницы",
      p_recall_at: recall,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const notes = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_notes?deal_id=eq.${deal.deal_id}`,
    );
    assert.equal(notes.body.length, 1);
    assert.equal(notes.body[0].type, "call");
    assert.match(notes.body[0].text, /Клиент ждёт расчёт/);
    assert.match(notes.body[0].text, /Прислать КП до пятницы/);

    const tasks = await rest(
      SECRET,
      "GET",
      `/rest/v1/tasks?deal_id=eq.${deal.deal_id}&order=id`,
    );
    const first = tasks.body.find((t) => t.type === "first-contact");
    const call = tasks.body.find((t) => t.type === "call");
    assert.ok(first.done_date, "the first contact task is closed");
    assert.equal(new Date(call.due_date).toISOString(), recall);
    assert.equal(call.sales_id, users.m1.salesId);
    assert.equal(call.contact_id, deal.contact_id);

    const row = await getDeal(deal.deal_id);
    assert.ok(row.first_responded_at);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&event=eq.call`,
    );
    assert.equal(history.body.length, 1);
  });

  it("works without a call back task and for a colleague", async () => {
    const deal = await ownDeal("colleague call");
    const res = await rpc(users.m2.token, "log_call_result", {
      p_deal_id: deal.deal_id,
      p_result: "Не взял трубку",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.task_id, null);
    const tasks = await rest(
      SECRET,
      "GET",
      `/rest/v1/tasks?deal_id=eq.${deal.deal_id}&type=eq.call`,
    );
    assert.equal(tasks.body.length, 0);
  });

  it("is idempotent for one request key", async () => {
    const deal = await ownDeal("call once");
    const args = {
      p_deal_id: deal.deal_id,
      p_result: "Договорились",
      p_request_key: `call-${RUN}`,
    };
    const [a, b] = await Promise.all([
      rpc(users.m1.token, "log_call_result", args),
      rpc(users.m1.token, "log_call_result", args),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const notes = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_notes?deal_id=eq.${deal.deal_id}`,
    );
    assert.equal(notes.body.length, 1);
  });

  it("validates the request and needs a taken deal", async () => {
    const deal = await ownDeal("call checks");
    const empty = await rpc(users.m1.token, "log_call_result", {
      p_deal_id: deal.deal_id,
      p_result: "   ",
    });
    assert.equal(empty.status, 422);
    const past = await rpc(users.m1.token, "log_call_result", {
      p_deal_id: deal.deal_id,
      p_result: "ok",
      p_recall_at: new Date(Date.now() - 86400_000).toISOString(),
    });
    assert.equal(past.status, 422);
    const queued = await newQueueDeal("call unclaimed");
    const unclaimed = await rpc(users.m1.token, "log_call_result", {
      p_deal_id: queued.deal_id,
      p_result: "ok",
    });
    assert.equal(unclaimed.status, 422);
    assert.match(JSON.stringify(unclaimed.body), /claim_required/);
    for (const key of ["shop", "nobody"]) {
      const denied = await rpc(users[key].token, "log_call_result", {
        p_deal_id: deal.deal_id,
        p_result: "ok",
      });
      assert.equal(denied.status, 403, key);
    }
  });
});
