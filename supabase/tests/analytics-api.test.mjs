// Integration tests of the payments and of the analytics totals against a real local Supabase.
// See sales-api.test.mjs for how to start it.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { API, PUB, RUN, rest, rpc, setupUsers, users } from "./helpers.mjs";

before(setupUsers);

const newDeal = async (name, amount, owner = "m1") => {
  const created = await rpc(users[owner].token, "create_manual_deal", {
    p_name: name,
    p_new_contact: { first_name: name, last_name: "Плательщиков" },
    ...(amount === undefined ? {} : { p_amount: amount }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  return created.body;
};

const pay = (token, dealId, kind, amount, extra = {}) =>
  rpc(token, "register_payment", {
    p_deal_id: dealId,
    p_kind: kind,
    p_amount: amount,
    ...extra,
  });

const financeRow = async (token, dealId) =>
  (await rest(token, "GET", `/rest/v1/deals_finance?id=eq.${dealId}`)).body[0];

const summary = async (token, args = {}) => {
  const res = await rpc(token, "deals_finance_summary", args);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

describe("payments", () => {
  it("computes the paid amount and the balance: 100 000, 30 000 + 20 000, refund 5 000", async () => {
    const deal = await newDeal("acceptance", 100000);
    assert.equal(
      (await pay(users.m1.token, deal.deal_id, "payment", 30000)).status,
      200,
    );
    assert.equal(
      (await pay(users.m1.token, deal.deal_id, "payment", 20000)).status,
      200,
    );
    const refund = await pay(users.m1.token, deal.deal_id, "refund", 5000, {
      p_comment: "Возврат за доставку",
    });
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(refund.body.paid, 45000);
    assert.equal(refund.body.balance, 55000);

    const row = await financeRow(users.m1.token, deal.deal_id);
    assert.equal(row.paid, 45000);
    assert.equal(row.balance, 55000);
    assert.equal(row.amount, 100000);

    const rows = (
      await rest(
        users.m1.token,
        "GET",
        `/rest/v1/deal_payments?deal_id=eq.${deal.deal_id}&order=id`,
      )
    ).body;
    assert.deepEqual(
      rows.map((r) => [r.kind, r.amount, r.currency]),
      [
        ["payment", 30000, "RUB"],
        ["payment", 20000, "RUB"],
        ["refund", 5000, "RUB"],
      ],
    );
    assert.equal(rows[2].comment, "Возврат за доставку");
    assert.equal(rows[2].created_by, users.m1.salesId);
  });

  it("shows an overpayment as a negative balance", async () => {
    const deal = await newDeal("overpaid", 100000);
    await pay(users.m1.token, deal.deal_id, "payment", 120000);
    const row = await financeRow(users.m1.token, deal.deal_id);
    assert.equal(row.balance, -20000);
  });

  it("calculates no balance while the price is unknown", async () => {
    const deal = await newDeal("no price");
    await pay(users.m1.token, deal.deal_id, "payment", 70000);
    const row = await financeRow(users.m1.token, deal.deal_id);
    assert.equal(row.amount, null);
    assert.equal(row.paid, 70000);
    assert.equal(row.balance, null);
  });

  it("refuses a refund larger than the paid amount and keeps the deal untouched", async () => {
    const deal = await newDeal("big refund", 50000);
    await pay(users.m1.token, deal.deal_id, "payment", 10000);
    const res = await pay(users.m1.token, deal.deal_id, "refund", 10001);
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body), /refund_exceeds_paid/);
    assert.equal((await financeRow(users.m1.token, deal.deal_id)).paid, 10000);
  });

  it("validates the kind, the amount and the date", async () => {
    const deal = await newDeal("validation", 1000);
    for (const [kind, amount, extra, code] of [
      ["gift", 100, {}, "invalid_kind"],
      ["payment", 0, {}, "invalid_amount"],
      ["payment", -5, {}, "invalid_amount"],
      ["payment", 100, { p_paid_at: "2999-01-01" }, "payment_in_future"],
    ]) {
      const res = await pay(users.m1.token, deal.deal_id, kind, amount, extra);
      assert.equal(res.status, 422, code);
      assert.match(JSON.stringify(res.body), new RegExp(code));
    }
    assert.equal((await financeRow(users.m1.token, deal.deal_id)).paid, 0);
  });

  it("registers one payment for a repeated or concurrent request key", async () => {
    const deal = await newDeal("idempotent", 5000);
    const key = `pay-${RUN}`;
    const results = await Promise.all([
      pay(users.m1.token, deal.deal_id, "payment", 1000, {
        p_request_key: key,
      }),
      pay(users.m1.token, deal.deal_id, "payment", 1000, {
        p_request_key: key,
      }),
    ]);
    for (const res of results) assert.equal(res.status, 200);
    assert.equal(results[0].body.payment_id, results[1].body.payment_id);
    assert.equal((await financeRow(users.m1.token, deal.deal_id)).paid, 1000);
  });

  it("lets only one of two simultaneous refunds pass", async () => {
    const deal = await newDeal("refund race", 20000);
    await pay(users.m1.token, deal.deal_id, "payment", 10000);
    const results = await Promise.all([
      pay(users.m1.token, deal.deal_id, "refund", 8000),
      pay(users.m1.token, deal.deal_id, "refund", 8000),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 422]);
    assert.equal((await financeRow(users.m1.token, deal.deal_id)).paid, 2000);
  });
});

describe("access to the money", () => {
  it("is open to every sales person and closed to the workshop and people without a role", async () => {
    const deal = await newDeal("shared money", 40000);
    await pay(users.m1.token, deal.deal_id, "payment", 15000);

    // a colleague works with the deal of another manager
    const colleague = await pay(users.m2.token, deal.deal_id, "payment", 1);
    assert.equal(colleague.status, 200, JSON.stringify(colleague.body));
    const seen = await rest(
      users.m2.token,
      "GET",
      `/rest/v1/deal_payments?deal_id=eq.${deal.deal_id}`,
    );
    assert.equal(seen.body.length, 2);

    for (const key of ["shop", "boss", "nobody"]) {
      const payments = await rest(
        users[key].token,
        "GET",
        `/rest/v1/deal_payments?deal_id=eq.${deal.deal_id}`,
      );
      assert.deepEqual(payments.body, [], `${key} must not read payments`);
      const finance = await rest(
        users[key].token,
        "GET",
        `/rest/v1/deals_finance?id=eq.${deal.deal_id}`,
      );
      assert.deepEqual(
        finance.body,
        [],
        `${key} must not read the finance view`,
      );
    }
    const head = await financeRow(users.admin.token, deal.deal_id);
    assert.equal(head.paid, 15001);
    const byHead = await pay(users.admin.token, deal.deal_id, "payment", 5000);
    assert.equal(byHead.status, 200);
  });

  it("gives the workshop and people without a role no totals and no registration", async () => {
    const deal = await newDeal("totals access", 1000);
    for (const key of ["shop", "boss", "nobody"]) {
      const totals = await summary(users[key].token);
      assert.equal(totals.total_count, 0, key);
      const res = await pay(users[key].token, deal.deal_id, "payment", 100);
      assert.equal(res.status, 403, key);
    }
  });

  it("cannot be written through the Data API", async () => {
    const deal = await newDeal("direct payment", 1000);
    const insert = await rest(
      users.m1.token,
      "POST",
      "/rest/v1/deal_payments",
      {
        deal_id: deal.deal_id,
        kind: "payment",
        amount: 999999,
      },
    );
    assert.ok([401, 403].includes(insert.status), JSON.stringify(insert.body));
    await pay(users.m1.token, deal.deal_id, "payment", 100);
    const patch = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deal_payments?deal_id=eq.${deal.deal_id}`,
      { amount: 1 },
    );
    assert.ok([401, 403].includes(patch.status));
    const del = await rest(
      users.m1.token,
      "DELETE",
      `/rest/v1/deal_payments?deal_id=eq.${deal.deal_id}`,
    );
    assert.ok([401, 403].includes(del.status));
    assert.equal((await financeRow(users.m1.token, deal.deal_id)).paid, 100);
  });
});

describe("totals of the analytics screen", () => {
  // 30 deals in a closing date window of their own: more than one page of 25
  const year = 2100 + (Date.now() % 700);
  const window = { from: `${year}-01-01`, to: `${year}-12-31` };
  const expected = {
    count: 0,
    inWork: 0,
    amount: 0,
    noAmount: 0,
    paid: 0,
    remaining: 0,
    overpaid: 0,
  };

  before(async () => {
    for (let i = 0; i < 30; i++) {
      const amount = i % 10 === 0 ? undefined : 1000 * (i + 1);
      const deal = await newDeal(`bulk ${i}`, amount);
      const date = new Date(Date.UTC(year, 0, 1 + i))
        .toISOString()
        .slice(0, 10);
      const patch = await rest(
        users.m1.token,
        "PATCH",
        `/rest/v1/deals?id=eq.${deal.deal_id}`,
        { expected_closing_date: date },
      );
      assert.equal(patch.status, 200);
      let paid = 0;
      if (i % 3 === 0) {
        paid = i % 6 === 0 ? 400 : 2000 * (i + 1);
        await pay(users.m1.token, deal.deal_id, "payment", paid);
      }
      let open = true;
      if (i % 7 === 0) {
        const closed = await rpc(users.m1.token, "transition_deal", {
          p_deal_id: deal.deal_id,
          p_expected_version:
            (await financeRow(users.m1.token, deal.deal_id)) &&
            patch.body[0].version,
          p_to_stage: "lost",
          p_reason: "тест",
        });
        assert.equal(closed.status, 200, JSON.stringify(closed.body));
        open = false;
      }
      expected.count += 1;
      if (open) {
        expected.inWork += 1;
        expected.amount += amount ?? 0;
        expected.noAmount += amount === undefined ? 1 : 0;
        expected.paid += paid;
        if (amount !== undefined) {
          expected.remaining += Math.max(amount - paid, 0);
          expected.overpaid += Math.max(paid - amount, 0);
        }
      }
    }
  });

  const list = async (token, query) => {
    const res = await fetch(`${API}/rest/v1/deals_finance?${query}`, {
      headers: {
        apikey: PUB,
        Authorization: `Bearer ${token}`,
        Prefer: "count=exact",
      },
    });
    return {
      rows: await res.json(),
      total: Number(res.headers.get("content-range").split("/")[1]),
    };
  };
  const range = `expected_closing_date=gte.${window.from}&expected_closing_date=lte.${window.to}`;

  it("count the whole selection, not the first page", async () => {
    const totals = await summary(users.m1.token, {
      p_closing_from: window.from,
      p_closing_to: window.to,
    });
    assert.equal(totals.total_count, expected.count);
    assert.equal(totals.in_work_count, expected.inWork);
    assert.equal(totals.in_work_amount, expected.amount);
    assert.equal(totals.in_work_without_amount, expected.noAmount);
    assert.equal(totals.paid, expected.paid);
    assert.equal(totals.remaining, expected.remaining);
    assert.equal(totals.overpaid, expected.overpaid);

    const firstPage = await list(users.m1.token, `${range}&limit=25&offset=0`);
    const secondPage = await list(
      users.m1.token,
      `${range}&limit=25&offset=25`,
    );
    assert.equal(firstPage.total, totals.total_count);
    assert.equal(firstPage.rows.length, 25);
    assert.equal(secondPage.rows.length, 5);
  });

  it("follow the filters of the table", async () => {
    const full = await list(users.m1.token, range);
    const lost = full.rows.filter((row) => row.stage === "lost");
    const only = await summary(users.m1.token, {
      p_closing_from: window.from,
      p_closing_to: window.to,
      p_stages: ["lost"],
    });
    assert.equal(only.total_count, lost.length);
    // closed deals are never in work
    assert.equal(only.in_work_count, 0);
    assert.equal(only.in_work_amount, 0);

    const narrow = `${year}-01-10`;
    const rowsNarrow = await list(
      users.m1.token,
      `expected_closing_date=gte.${narrow}&expected_closing_date=lte.${window.to}`,
    );
    const totalsNarrow = await summary(users.m1.token, {
      p_closing_from: narrow,
      p_closing_to: window.to,
    });
    assert.equal(totalsNarrow.total_count, rowsNarrow.total);
    const inWork = rowsNarrow.rows.filter(
      (r) => !["won", "lost"].includes(r.stage),
    );
    assert.equal(totalsNarrow.in_work_count, inWork.length);
    assert.equal(
      totalsNarrow.in_work_amount,
      inWork.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    );
    assert.equal(
      totalsNarrow.paid,
      inWork.reduce((sum, r) => sum + r.paid, 0),
    );

    const byOwner = await summary(users.admin.token, {
      p_closing_from: window.from,
      p_closing_to: window.to,
      p_sales_id: users.m2.salesId,
    });
    assert.equal(byOwner.total_count, 0);
  });

  it("show a manager the deals of colleagues, as to the sales head", async () => {
    const asManager = await summary(users.m2.token, {
      p_closing_from: window.from,
      p_closing_to: window.to,
    });
    assert.equal(asManager.total_count, expected.count);
    const asHead = await summary(users.admin.token, {
      p_closing_from: window.from,
      p_closing_to: window.to,
    });
    assert.equal(asHead.total_count, expected.count);
  });

  it("sort by the closing date and by the balance, empty values last", async () => {
    const byDate = await list(
      users.m1.token,
      `${range}&order=expected_closing_date.asc&limit=5`,
    );
    const dates = byDate.rows.map((r) => r.expected_closing_date);
    assert.deepEqual(dates, [...dates].sort());

    const byBalance = await list(
      users.m1.token,
      `${range}&order=balance.desc.nullslast&limit=30`,
    );
    const balances = byBalance.rows
      .map((r) => r.balance)
      .filter((b) => b !== null);
    assert.deepEqual(
      balances,
      [...balances].sort((a, b) => b - a),
    );
    const lastKnown = byBalance.rows.findLastIndex((r) => r.balance !== null);
    const firstUnknown = byBalance.rows.findIndex((r) => r.balance === null);
    assert.ok(firstUnknown === -1 || firstUnknown > lastKnown);
  });
});
