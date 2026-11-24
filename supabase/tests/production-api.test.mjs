// Integration tests of the production handoff, the workshop board and the ready notification
// against a real local Supabase. See sales-api.test.mjs for how to start it.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  API,
  PUB,
  RUN,
  SECRET,
  getDeal,
  rest,
  rpc,
  setupUsers,
  users,
} from "./helpers.mjs";

before(setupUsers);

// A deal of the manager m1 that has reached the stage "order"
const orderDeal = async (name, owner = "m1") => {
  const created = await rpc(users[owner].token, "create_manual_deal", {
    p_name: name,
    p_new_contact: { first_name: name, last_name: "Клиентов" },
    p_amount: 100000,
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  let signed = created.body;
  for (const to of ["processing", "order"]) {
    const moved = await rpc(users[owner].token, "transition_deal", {
      p_deal_id: signed.deal_id,
      p_expected_version: signed.version,
      p_to_stage: to,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    signed = moved.body;
  }
  return signed;
};

const upload = async (token, path, content = "print file") => {
  const res = await fetch(`${API}/storage/v1/object/order-files/${path}`, {
    method: "POST",
    headers: {
      apikey: PUB,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: content,
  });
  return { status: res.status, body: await res.text() };
};

const download = (token, path) =>
  fetch(`${API}/storage/v1/object/authenticated/order-files/${path}`, {
    headers: { apikey: PUB, Authorization: `Bearer ${token}` },
  });

const handoff = (token, deal, extra = {}) =>
  rpc(token, "handoff_deal_to_production", {
    p_deal_id: deal.deal_id,
    p_expected_version: deal.version,
    p_product_name: "Баннер 3×6",
    p_instructions: "Люверсы по периметру",
    ...extra,
  });

const getOrder = async (dealId) =>
  (await rest(SECRET, "GET", `/rest/v1/production_orders?deal_id=eq.${dealId}`))
    .body[0];

// A signed deal handed over to the workshop: returns the order id
const orderInWorkshop = async (name, extra = {}) => {
  const deal = await orderDeal(name);
  const res = await handoff(users.m1.token, deal, extra);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { dealId: deal.deal_id, orderId: res.body.order_id };
};

const moveOrder = (token, orderId, toStage, version, key) =>
  rpc(token, "transition_production_order", {
    p_order_id: orderId,
    p_expected_version: version,
    p_to_stage: toStage,
    p_request_key: key ?? null,
  });

const notificationsOf = async (orderId) =>
  (
    await rest(
      SECRET,
      "GET",
      `/rest/v1/notification_events?order_id=eq.${orderId}&order=id`,
    )
  ).body;

describe("the order stage", () => {
  it("is entered from processing and keeps the owner", async () => {
    const deal = await orderDeal("order stage");
    const row = await getDeal(deal.deal_id);
    assert.equal(row.stage, "order");
    assert.equal(row.sales_id, users.m1.salesId);
  });

  it("does not let a deal enter a retired stage", async () => {
    const created = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "retired stage",
      p_new_contact: { first_name: "R" },
    });
    for (const to of [
      "contract-signed",
      "to-contact",
      "contacted",
      "in-work",
    ]) {
      const res = await rpc(users.m1.token, "transition_deal", {
        p_deal_id: created.body.deal_id,
        p_expected_version: created.body.version,
        p_to_stage: to,
      });
      assert.equal(res.status, 422, to);
      assert.match(JSON.stringify(res.body), /invalid_stage/);
    }
  });

  it("does not send a deal to production through a plain stage change", async () => {
    const deal = await orderDeal("plain move");
    const res = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "sent-to-production",
    });
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body), /handoff_required/);
  });
});

describe("handoff_deal_to_production", () => {
  it("creates one order with files and links and moves the deal", async () => {
    const deal = await orderDeal("with materials");
    const path = `${deal.deal_id}/${RUN}-layout.txt`;
    assert.equal((await upload(users.m1.token, path)).status, 200);

    const res = await handoff(users.m1.token, deal, {
      p_due_date: "2026-12-24",
      p_files: [{ path, name: "layout.txt", size: 10, type: "text/plain" }],
      p_links: [{ url: "https://drive.example.com/maket", label: "Макет" }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.stage, "sent-to-production");
    assert.equal(res.body.order_stage, "accepted");

    const order = await getOrder(deal.deal_id);
    assert.equal(order.product_name, "Баннер 3×6");
    assert.equal(order.instructions, "Люверсы по периметру");
    assert.equal(order.due_date, "2026-12-24");
    assert.equal(order.files_count, 1);
    assert.equal(order.links_count, 1);
    assert.equal(order.customer_name, "with materials Клиентов");

    const materials = await rest(
      SECRET,
      "GET",
      `/rest/v1/production_order_materials?order_id=eq.${order.id}&order=id`,
    );
    assert.deepEqual(
      materials.body.map((m) => [m.kind, m.label ?? m.file_name]),
      [
        ["file", "layout.txt"],
        ["link", "Макет"],
      ],
    );
    assert.equal((await getDeal(deal.deal_id)).stage, "sent-to-production");
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/order_stage_history?order_id=eq.${order.id}`,
    );
    assert.deepEqual(
      history.body.map((h) => [h.event, h.to_stage]),
      [["created", "accepted"]],
    );
  });

  it("accepts an order without any material", async () => {
    const { orderId } = await orderInWorkshop("no materials");
    const order = (
      await rest(SECRET, "GET", `/rest/v1/production_orders?id=eq.${orderId}`)
    ).body[0];
    assert.equal(order.files_count, 0);
    assert.equal(order.links_count, 0);
  });

  it("returns the same order for a repeated and for a concurrent request", async () => {
    const deal = await orderDeal("twice");
    const key = `handoff-${RUN}`;
    const [a, b, c] = await Promise.all([
      handoff(users.m1.token, deal, { p_request_key: key }),
      handoff(users.m1.token, deal, { p_request_key: key }),
      handoff(users.m1.token, deal, { p_request_key: `${key}-other` }),
    ]);
    for (const res of [a, b, c]) {
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    assert.equal(a.body.order_id, b.body.order_id);
    assert.equal(a.body.order_id, c.body.order_id);
    const orders = await rest(
      SECRET,
      "GET",
      `/rest/v1/production_orders?deal_id=eq.${deal.deal_id}`,
    );
    assert.equal(orders.body.length, 1);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&to_stage=eq.sent-to-production`,
    );
    assert.equal(history.body.length, 1);
  });

  it("validates the request", async () => {
    const deal = await orderDeal("validation");
    const noName = await handoff(users.m1.token, deal, { p_product_name: " " });
    assert.equal(noName.status, 422);
    const badLink = await handoff(users.m1.token, deal, {
      p_links: [{ url: "ftp://example.com/file", label: "x" }],
    });
    assert.equal(badLink.status, 422);
    assert.match(JSON.stringify(badLink.body), /invalid_link/);
    const missingFile = await handoff(users.m1.token, deal, {
      p_files: [{ path: `${deal.deal_id}/not-uploaded.txt`, name: "x" }],
    });
    assert.match(JSON.stringify(missingFile.body), /invalid_file/);
    // a file of another deal cannot be attached
    const other = await orderDeal("other deal");
    const otherPath = `${other.deal_id}/${RUN}-foreign.txt`;
    await upload(users.m1.token, otherPath);
    const foreign = await handoff(users.m1.token, deal, {
      p_files: [{ path: otherPath, name: "foreign" }],
    });
    assert.match(JSON.stringify(foreign.body), /invalid_file/);
    assert.equal(await getOrder(deal.deal_id), undefined);
    assert.equal((await getDeal(deal.deal_id)).stage, "order");
  });

  it("needs the order stage and a fresh version, and a colleague may hand over too", async () => {
    const created = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "unsigned",
      p_new_contact: { first_name: "U" },
    });
    const early = await handoff(users.m1.token, created.body);
    assert.equal(early.status, 422);
    assert.match(JSON.stringify(early.body), /order_stage_required/);

    const deal = await orderDeal("owner rules");
    const stale = await handoff(users.m1.token, {
      ...deal,
      version: deal.version - 1,
    });
    assert.equal(stale.status, 409);
    assert.equal(await getOrder(deal.deal_id), undefined);
    const colleague = await handoff(users.m2.token, deal);
    assert.equal(colleague.status, 200, JSON.stringify(colleague.body));
    assert.ok(await getOrder(deal.deal_id));
  });

  it("locks the deal in production: only the finished order lets it go on", async () => {
    const { dealId } = await orderInWorkshop("locked");
    const row = await getDeal(dealId);
    for (const to of ["processing", "lost", "won"]) {
      const res = await rpc(users.m1.token, "transition_deal", {
        p_deal_id: dealId,
        p_expected_version: row.version,
        p_to_stage: to,
        p_reason: "x",
      });
      assert.equal(res.status, 422, to);
    }
  });

  it("cannot be bypassed through the Data API", async () => {
    const deal = await orderDeal("bypass");
    const insert = await rest(
      users.m1.token,
      "POST",
      "/rest/v1/production_orders",
      {
        deal_id: deal.deal_id,
        product_name: "x",
      },
    );
    assert.ok([401, 403].includes(insert.status), JSON.stringify(insert.body));
    const patch = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${deal.deal_id}`,
      { stage: "sent-to-production" },
    );
    assert.equal(patch.status, 403);
  });
});

describe("the workshop", () => {
  it("sees every handed over order and nothing of sales", async () => {
    const { dealId, orderId } = await orderInWorkshop("workshop view");
    for (const key of ["shop", "boss"]) {
      const orders = await rest(
        users[key].token,
        "GET",
        `/rest/v1/production_orders?id=eq.${orderId}`,
      );
      assert.equal(orders.body.length, 1, key);
      assert.equal(orders.body[0].customer_name, "workshop view Клиентов");
      // nothing about money in the answer
      assert.ok(!("amount" in orders.body[0]));

      for (const table of [
        "deals",
        "contacts",
        "companies",
        "tasks",
        "deal_notes",
        "deal_stage_history",
        "contacts_summary",
        "activity_log",
      ]) {
        const res = await rest(users[key].token, "GET", `/rest/v1/${table}`);
        assert.deepEqual(res.body, [], `${key} must not read ${table}`);
      }
      const byId = await rest(
        users[key].token,
        "GET",
        `/rest/v1/deals?id=eq.${dealId}`,
      );
      assert.deepEqual(byId.body, []);
      const search = await rpc(users[key].token, "global_search", {
        query: "workshop",
      });
      assert.deepEqual(search.body, []);
    }
  });

  it("reads the files of an order, and only of an order", async () => {
    const deal = await orderDeal("files access");
    const path = `${deal.deal_id}/${RUN}-print.txt`;
    await upload(users.m1.token, path, "secret layout");
    // before the handoff the workshop has no right to the file
    assert.notEqual((await download(users.shop.token, path)).status, 200);
    const res = await handoff(users.m1.token, deal, {
      p_files: [{ path, name: "print.txt" }],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));

    const shop = await download(users.shop.token, path);
    assert.equal(shop.status, 200);
    assert.equal(await shop.text(), "secret layout");
    assert.equal((await download(users.m1.token, path)).status, 200);
    // a colleague works with the deal, so with its files too
    assert.equal((await download(users.m2.token, path)).status, 200);
    assert.notEqual((await download(users.nobody.token, path)).status, 200);
    // the bucket is private: there is no public address
    const anon = await fetch(
      `${API}/storage/v1/object/public/order-files/${path}`,
    );
    assert.notEqual(anon.status, 200);
  });

  it("is visible to every manager and hidden from people without a role", async () => {
    const { orderId } = await orderInWorkshop("visibility");
    const own = await rest(
      users.m1.token,
      "GET",
      `/rest/v1/production_orders?id=eq.${orderId}`,
    );
    assert.equal(own.body.length, 1);
    const colleague = await rest(
      users.m2.token,
      "GET",
      `/rest/v1/production_orders?id=eq.${orderId}`,
    );
    assert.equal(colleague.body.length, 1);
    const outsider = await rest(
      users.nobody.token,
      "GET",
      `/rest/v1/production_orders?id=eq.${orderId}`,
    );
    assert.deepEqual(outsider.body, []);
    const head = await rest(
      users.admin.token,
      "GET",
      `/rest/v1/production_orders?id=eq.${orderId}`,
    );
    assert.equal(head.body.length, 1);
  });

  it("is the only one who moves an order", async () => {
    const { orderId } = await orderInWorkshop("who moves");
    for (const key of ["m1", "admin", "nobody"]) {
      const res = await moveOrder(users[key].token, orderId, "in-progress", 1);
      assert.equal(res.status, 403, key);
    }
    const ok = await moveOrder(users.shop.token, orderId, "in-progress", 1);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const direct = await rest(
      users.shop.token,
      "PATCH",
      `/rest/v1/production_orders?id=eq.${orderId}`,
      { stage: "ready" },
    );
    assert.ok([401, 403].includes(direct.status));
  });
});

describe("ready order and the pinned notification", () => {
  it("creates one notification for the responsible manager in the same transition", async () => {
    const { dealId, orderId } = await orderInWorkshop("notify me");
    const started = await moveOrder(
      users.shop.token,
      orderId,
      "in-progress",
      1,
    );
    assert.equal(started.status, 200);
    assert.equal(started.body.notified, false);
    assert.deepEqual(await notificationsOf(orderId), []);

    const ready = await moveOrder(users.shop.token, orderId, "ready", 2);
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    assert.equal(ready.body.notified, true);

    const list = await notificationsOf(orderId);
    assert.equal(list.length, 1);
    assert.equal(list[0].recipient_sales_id, users.m1.salesId);
    assert.equal(list[0].kind, "order_ready");
    assert.equal(list[0].deal_id, dealId);
    assert.equal(list[0].payload.order_number, orderId);
    assert.equal(list[0].payload.customer_name, "notify me Клиентов");
    assert.equal(list[0].acknowledged_at, null);

    const order = await getOrder(dealId);
    assert.equal(order.stage, "ready");
    assert.ok(order.ready_at);
    assert.equal(order.ready_by, users.shop.salesId);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/order_stage_history?order_id=eq.${orderId}&order=id`,
    );
    assert.deepEqual(
      history.body.map((h) => `${h.from_stage ?? "-"}>${h.to_stage}`),
      ["->accepted", "accepted>in-progress", "in-progress>ready"],
    );
  });

  it("does not duplicate the notification for a repeated or concurrent transition", async () => {
    const { orderId } = await orderInWorkshop("no duplicates");
    await moveOrder(users.shop.token, orderId, "in-progress", 1);
    const key = `ready-${RUN}`;
    const results = await Promise.all([
      moveOrder(users.shop.token, orderId, "ready", 2, key),
      moveOrder(users.shop.token, orderId, "ready", 2, key),
      moveOrder(users.boss.token, orderId, "ready", 2, `${key}-boss`),
    ]);
    for (const res of results) {
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
    assert.equal(
      results.filter((r) => r.body.notified && !r.body.replayed).length,
      1,
    );
    assert.equal((await notificationsOf(orderId)).length, 1);
    // a later repeat after the commit changes nothing either
    const again = await moveOrder(users.shop.token, orderId, "ready", 3);
    assert.equal(again.status, 200);
    assert.equal((await notificationsOf(orderId)).length, 1);
  });

  it("creates a new notification when a returned order becomes ready again", async () => {
    const { orderId } = await orderInWorkshop("ready twice");
    await moveOrder(users.shop.token, orderId, "ready", 1);
    const back = await moveOrder(users.shop.token, orderId, "in-progress", 2);
    assert.equal(back.status, 200);
    assert.equal((await notificationsOf(orderId)).length, 1);
    const again = await moveOrder(users.shop.token, orderId, "ready", 3);
    assert.equal(again.status, 200);
    const list = await notificationsOf(orderId);
    assert.equal(list.length, 2);
    assert.deepEqual(
      list.map((n) => n.ready_cycle),
      [1, 2],
    );
  });

  it("rejects a stale version of the order", async () => {
    const { orderId } = await orderInWorkshop("stale order");
    await moveOrder(users.shop.token, orderId, "in-progress", 1);
    const stale = await moveOrder(users.boss.token, orderId, "ready", 1);
    assert.equal(stale.status, 409);
    assert.match(JSON.stringify(stale.body), /order_version_conflict/);
    assert.deepEqual(await notificationsOf(orderId), []);
  });

  it("shows the ready order to the manager, who can then close the deal as won", async () => {
    const { dealId, orderId } = await orderInWorkshop("won after ready");
    const before = await getDeal(dealId);
    const early = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: dealId,
      p_expected_version: before.version,
      p_to_stage: "won",
    });
    assert.equal(early.status, 422);
    assert.match(JSON.stringify(early.body), /won_requires_ready_order/);

    await moveOrder(users.shop.token, orderId, "ready", 1);
    const seen = await rest(
      users.m1.token,
      "GET",
      `/rest/v1/production_orders?id=eq.${orderId}`,
    );
    assert.equal(seen.body[0].stage, "ready");
    const won = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: dealId,
      p_expected_version: (await getDeal(dealId)).version,
      p_to_stage: "won",
    });
    assert.equal(won.status, 200, JSON.stringify(won.body));
    assert.equal((await getDeal(dealId)).stage, "won");
  });
});

describe("confirmation of a notification", () => {
  const readyOrder = async (name) => {
    const { orderId } = await orderInWorkshop(name);
    await moveOrder(users.shop.token, orderId, "ready", 1);
    const [notification] = await notificationsOf(orderId);
    return notification;
  };
  const pending = async (key) =>
    (
      await rest(
        users[key].token,
        "GET",
        "/rest/v1/notification_events?acknowledged_at=is.null&order=id",
      )
    ).body;

  it("lets only the recipient see, open and confirm it", async () => {
    const note = await readyOrder("only recipient");
    assert.ok((await pending("m1")).some((n) => n.id === note.id));
    for (const key of ["m2", "admin", "shop"]) {
      assert.ok(!(await pending(key)).some((n) => n.id === note.id), key);
    }
    const open = await rpc(users.m2.token, "open_notification", {
      p_id: note.id,
    });
    assert.equal(open.status, 404);
    const ack = await rpc(users.m2.token, "acknowledge_notification", {
      p_id: note.id,
    });
    assert.equal(ack.status, 403);
    assert.equal(
      (await pending("m1")).some((n) => n.id === note.id),
      true,
    );
  });

  it("needs the card to be opened before the confirmation", async () => {
    const note = await readyOrder("open first");
    const early = await rpc(users.m1.token, "acknowledge_notification", {
      p_id: note.id,
    });
    assert.equal(early.status, 422);
    assert.match(JSON.stringify(early.body), /open_first/);
    assert.ok((await pending("m1")).some((n) => n.id === note.id));

    const open = await rpc(users.m1.token, "open_notification", {
      p_id: note.id,
    });
    assert.equal(open.status, 200);
    // opening alone does not remove the notification
    assert.ok((await pending("m1")).some((n) => n.id === note.id));

    const ack = await rpc(users.m1.token, "acknowledge_notification", {
      p_id: note.id,
    });
    assert.equal(ack.status, 200, JSON.stringify(ack.body));
    assert.ok(ack.body.acknowledged_at);
    assert.ok(!(await pending("m1")).some((n) => n.id === note.id));

    const stored = (
      await rest(SECRET, "GET", `/rest/v1/notification_events?id=eq.${note.id}`)
    ).body[0];
    assert.equal(stored.acknowledged_by, users.m1.salesId);
  });

  it("keeps the first confirmation when it is repeated", async () => {
    const note = await readyOrder("repeat ack");
    await rpc(users.m1.token, "open_notification", { p_id: note.id });
    const [a, b] = await Promise.all([
      rpc(users.m1.token, "acknowledge_notification", { p_id: note.id }),
      rpc(users.m1.token, "acknowledge_notification", { p_id: note.id }),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.acknowledged_at, b.body.acknowledged_at);
  });

  it("cannot be created or changed through the Data API", async () => {
    const note = await readyOrder("direct writes");
    const patch = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/notification_events?id=eq.${note.id}`,
      { acknowledged_at: new Date().toISOString() },
    );
    assert.ok([401, 403].includes(patch.status), JSON.stringify(patch.body));
    const insert = await rest(
      users.m1.token,
      "POST",
      "/rest/v1/notification_events",
      {
        recipient_sales_id: users.m1.salesId,
        kind: "order_ready",
        order_id: note.order_id,
        deal_id: note.deal_id,
        ready_cycle: 99,
      },
    );
    assert.ok([401, 403].includes(insert.status));
  });
});
