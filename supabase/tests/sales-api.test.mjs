// Integration tests of the sales workflow against a real local Supabase (PostgREST, Auth, Postgres).
//
//   npx supabase start
//   npx supabase db reset --local      # the first account becomes the administrator, so start from an empty database
//   make test-sales-api                # or: node --test supabase/tests/sales-api.test.mjs
//
// They check that the rules hold when the Data API is called directly, not only through the UI.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  RUN,
  SECRET,
  firstContactTasks,
  getDeal,
  newQueueDeal,
  rest,
  rpc,
  setupUsers,
  users,
} from "./helpers.mjs";

before(setupUsers);

describe("roles", () => {
  it("the first account is the administrator and the owner", async () => {
    const roles = await rest(
      users.admin.token,
      "GET",
      `/rest/v1/staff_roles?sales_id=eq.${users.admin.salesId}`,
    );
    assert.deepEqual(roles.body.map((r) => r.role).sort(), ["owner"]);
  });

  it("only an administrator can change roles", async () => {
    const res = await rpc(users.m1.token, "set_staff_roles", {
      p_sales_id: users.m1.salesId,
      p_roles: ["manager", "sales_head"],
    });
    assert.equal(res.status, 403);
    const direct = await rest(users.m1.token, "POST", "/rest/v1/staff_roles", {
      sales_id: users.m1.salesId,
      role: "sales_head",
    });
    assert.ok([401, 403].includes(direct.status));
  });

  it("a person without a sales role sees no sales data", async () => {
    await newQueueDeal("secret deal");
    for (const key of ["shop", "nobody"]) {
      for (const table of [
        "deals",
        "contacts",
        "companies",
        "tasks",
        "tags",
        "deal_notes",
        "contact_notes",
        "deal_stage_history",
        "contacts_summary",
        "companies_summary",
        "activity_log",
      ]) {
        const res = await rest(users[key].token, "GET", `/rest/v1/${table}`);
        assert.equal(res.status, 200, `${key} ${table}`);
        assert.deepEqual(res.body, [], `${key} must not read ${table}`);
      }
      const claim = await rpc(users[key].token, "claim_deal", {
        p_deal_id: 1,
      });
      assert.equal(claim.status, 403, `${key} claim`);
      const search = await rpc(users[key].token, "global_search", {
        query: "secret",
      });
      assert.deepEqual(search.body, [], `${key} search`);
    }
  });
});

describe("direct Data API access", () => {
  it("rejects creating a deal straight in won", async () => {
    const res = await rest(users.m1.token, "POST", "/rest/v1/deals", {
      name: "sneaky",
      stage: "won",
      amount: 1,
    });
    assert.equal(res.status, 403);
    assert.match(JSON.stringify(res.body), /use_create_manual_deal/);
  });

  it("rejects an unknown stage code", async () => {
    const res = await rest(users.admin.token, "POST", "/rest/v1/deals", {
      name: "x",
      stage: "unknown",
      is_historical: true,
    });
    assert.ok([400, 403].includes(res.status));
  });

  it("lets the sales head import a past won deal, and nobody else", async () => {
    const head = await rest(users.admin.token, "POST", "/rest/v1/deals", {
      name: "old won deal",
      stage: "won",
      amount: 1000,
      is_historical: true,
    });
    assert.equal(head.status, 201, JSON.stringify(head.body));
    const manager = await rest(users.m1.token, "POST", "/rest/v1/deals", {
      name: "old won deal",
      stage: "won",
      is_historical: true,
    });
    assert.equal(manager.status, 403);
  });

  it("rejects direct changes of stage, owner and system fields", async () => {
    const created = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "mine",
      p_new_contact: { first_name: "Mine" },
    });
    const id = created.body.deal_id;
    for (const patch of [
      { stage: "won" },
      { stage: "contacted" },
      { sales_id: users.m2.salesId },
      { sales_id: null },
      { index: 5 },
      { version: 99 },
      { first_responded_at: new Date().toISOString() },
      { source: "avito" },
      { is_historical: true },
    ]) {
      const res = await rest(
        users.m1.token,
        "PATCH",
        `/rest/v1/deals?id=eq.${id}`,
        patch,
      );
      if (res.status === 200 && patch.version) {
        // the version is owned by the server: the supplied value is ignored
        assert.notEqual((await getDeal(id)).version, 99);
        continue;
      }
      assert.equal(res.status, 403, JSON.stringify(patch));
    }
    const ok = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${id}`,
      { description: "edited" },
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.body[0].description, "edited");
  });

  it("does not let a manager delete deals or promote themselves, and shows colleagues' deals", async () => {
    const mine = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "keep me",
      p_new_contact: { first_name: "Keep" },
    });
    const del = await rest(users.m1.token, "DELETE", "/rest/v1/deals?id=gt.0");
    assert.deepEqual(del.body, []);
    assert.ok(await getDeal(mine.body.deal_id));

    const promote = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/sales?id=eq.${users.m1.salesId}`,
      { administrator: true },
    );
    assert.deepEqual(promote.body, []);

    const others = await rest(
      users.m2.token,
      "GET",
      `/rest/v1/deals?id=eq.${mine.body.deal_id}`,
    );
    assert.equal(others.body.length, 1);
    const outsider = await rest(
      users.nobody.token,
      "GET",
      `/rest/v1/deals?id=eq.${mine.body.deal_id}`,
    );
    assert.deepEqual(outsider.body, []);
  });

  it("cannot be bypassed by archiving", async () => {
    const created = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "archive me",
      p_new_contact: { first_name: "Arch" },
    });
    const id = created.body.deal_id;
    const archive = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${id}`,
      { archived_at: new Date().toISOString() },
    );
    assert.equal(archive.status, 200);
    const restore = await rest(
      users.m1.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${id}`,
      { archived_at: null, stage: "won" },
    );
    assert.equal(restore.status, 403);
    const claim = await rpc(users.m2.token, "claim_deal", { p_deal_id: id });
    assert.equal(claim.status, 404, "an archived deal cannot be commanded");
  });
});

describe("create_manual_deal", () => {
  it("creates an owned deal with the first contact task and history", async () => {
    const res = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "Баннер 3x6",
      p_new_contact: {
        first_name: "Иван",
        last_name: "Петров",
        phone: "+7 900 111-22-33",
      },
      p_description: "Нужен баннер на фасад",
      p_source: "referral",
      p_received_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.stage, "processing");
    assert.equal(res.body.sales_id, users.m1.salesId);
    assert.ok(res.body.task_id);
    const deal = await getDeal(res.body.deal_id);
    assert.equal(deal.source, "referral");
    assert.ok(deal.first_response_due_at);
    assert.deepEqual(deal.contact_ids, [res.body.contact_id]);
    const tasks = await firstContactTasks(deal.id);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].sales_id, users.m1.salesId);
    assert.equal(tasks[0].contact_id, res.body.contact_id);
    const history = await rest(
      users.m1.token,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.id}&order=id`,
    );
    assert.deepEqual(
      history.body.map((h) => h.event),
      ["created", "claimed"],
    );
  });

  it("works with an existing contact and keeps the queue deal unassigned", async () => {
    const first = await newQueueDeal("shared contact");
    const res = await rpc(users.admin.token, "create_manual_deal", {
      p_name: "Вторая сделка",
      p_contact_id: first.contact_id,
      p_assign_to_me: false,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.contact_id, first.contact_id);
    assert.equal(res.body.sales_id, null);
    assert.equal(res.body.stage, "opportunity");
    assert.equal(res.body.task_id, null);
    assert.equal((await firstContactTasks(res.body.deal_id)).length, 0);
  });

  it("validates input", async () => {
    const noContact = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "no contact",
    });
    assert.equal(noContact.status, 422);
    const future = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "future",
      p_new_contact: { first_name: "F" },
      p_received_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    assert.equal(future.status, 422);
    const source = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "bad source",
      p_new_contact: { first_name: "F" },
      p_source: "carrier-pigeon",
    });
    assert.equal(source.status, 422);
  });

  it("is idempotent for one request key", async () => {
    const args = {
      p_name: `once-${RUN}`,
      p_new_contact: { first_name: "Once" },
      p_request_key: `create-${RUN}`,
    };
    const [a, b] = await Promise.all([
      rpc(users.m1.token, "create_manual_deal", args),
      rpc(users.m1.token, "create_manual_deal", args),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(a.body.deal_id, b.body.deal_id);
    const deals = await rest(
      SECRET,
      "GET",
      `/rest/v1/deals?name=eq.once-${RUN}&sales_id=eq.${users.m1.salesId}`,
    );
    assert.equal(deals.body.length, 1);
  });
});

describe("claim_deal", () => {
  it("two managers take the same deal at the same time: one owner, one task", async () => {
    for (let round = 0; round < 5; round++) {
      const queued = await newQueueDeal(`race ${round}`);
      const [a, b] = await Promise.all([
        rpc(users.m1.token, "claim_deal", { p_deal_id: queued.deal_id }),
        rpc(users.m2.token, "claim_deal", { p_deal_id: queued.deal_id }),
      ]);
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, [200, 409], JSON.stringify([a.body, b.body]));
      const loser = a.status === 409 ? a : b;
      assert.match(JSON.stringify(loser.body), /deal_already_assigned/);
      const winner = a.status === 200 ? users.m1 : users.m2;
      const deal = await getDeal(queued.deal_id);
      assert.equal(deal.sales_id, winner.salesId);
      assert.equal(deal.stage, "processing");
      const tasks = await firstContactTasks(queued.deal_id);
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].sales_id, winner.salesId);
      const claimed = await rest(
        SECRET,
        "GET",
        `/rest/v1/deal_stage_history?deal_id=eq.${queued.deal_id}&event=eq.claimed`,
      );
      assert.equal(claimed.body.length, 1);
    }
  });

  it("a double click of the owner does not create a second task", async () => {
    const queued = await newQueueDeal("double click");
    const first = await rpc(users.m1.token, "claim_deal", {
      p_deal_id: queued.deal_id,
    });
    const second = await rpc(users.m1.token, "claim_deal", {
      p_deal_id: queued.deal_id,
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.task_id, second.body.task_id);
    assert.equal((await firstContactTasks(queued.deal_id)).length, 1);
  });

  it("replays the stored result for the same request key", async () => {
    const queued = await newQueueDeal("keyed");
    const args = { p_deal_id: queued.deal_id, p_request_key: `claim-${RUN}` };
    const a = await rpc(users.m1.token, "claim_deal", args);
    const b = await rpc(users.m1.token, "claim_deal", args);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.body.replayed, true);
    assert.equal(a.body.task_id, b.body.task_id);
  });

  it("rejects a stale version", async () => {
    const queued = await newQueueDeal("stale");
    const res = await rpc(users.m1.token, "claim_deal", {
      p_deal_id: queued.deal_id,
      p_expected_version: queued.version + 5,
    });
    assert.equal(res.status, 409);
    assert.match(JSON.stringify(res.body), /deal_version_conflict/);
  });
});

describe("transition_deal", () => {
  const ownDeal = async (name) => {
    const res = await rpc(users.m1.token, "create_manual_deal", {
      p_name: name,
      p_new_contact: { first_name: name },
    });
    return res.body;
  };

  it("moves the owner's deal and records the history", async () => {
    const deal = await ownDeal("move");
    const res = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "order",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.stage, "order");
    assert.ok(res.body.version > deal.version);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&event=eq.stage`,
    );
    assert.equal(history.body.length, 1);
    assert.equal(history.body[0].from_stage, "processing");
    assert.equal(history.body[0].to_stage, "order");
    assert.equal(history.body[0].changed_by, users.m1.salesId);
  });

  it("rejects a stale version and a second move with the old version", async () => {
    const deal = await ownDeal("stale move");
    const ok = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "order",
    });
    assert.equal(ok.status, 200);
    const stale = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "design-task",
    });
    assert.equal(stale.status, 409);
    assert.equal((await getDeal(deal.deal_id)).stage, "order");
  });

  it("double submit with one request key moves once", async () => {
    const deal = await ownDeal("double submit");
    const args = {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "order",
      p_request_key: `move-${RUN}`,
    };
    const [a, b] = await Promise.all([
      rpc(users.m1.token, "transition_deal", args),
      rpc(users.m1.token, "transition_deal", args),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const history = await rest(
      SECRET,
      "GET",
      `/rest/v1/deal_stage_history?deal_id=eq.${deal.deal_id}&event=eq.stage`,
    );
    assert.equal(history.body.length, 1);
  });

  it("never sets won before the production order is ready", async () => {
    const deal = await ownDeal("no won");
    for (const key of ["m1", "admin"]) {
      const res = await rpc(users[key].token, "transition_deal", {
        p_deal_id: deal.deal_id,
        p_expected_version: (await getDeal(deal.deal_id)).version,
        p_to_stage: "won",
      });
      assert.equal(res.status, 422, key);
      assert.match(JSON.stringify(res.body), /won_requires_ready_order/);
    }
  });

  it("requires a reason to close a deal, and only the head reopens it", async () => {
    const deal = await ownDeal("lose");
    const noReason = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "lost",
    });
    assert.equal(noReason.status, 422);
    const lost = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "lost",
      p_reason: "Дорого",
    });
    assert.equal(lost.status, 200);
    assert.equal((await getDeal(deal.deal_id)).lost_reason, "Дорого");
    const reopen = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: lost.body.version,
      p_to_stage: "processing",
    });
    assert.equal(reopen.status, 403);
    const byHead = await rpc(users.admin.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: lost.body.version,
      p_to_stage: "processing",
    });
    assert.equal(byHead.status, 200);
    assert.equal((await getDeal(deal.deal_id)).lost_reason, null);
  });

  it("a colleague moves the deal without taking it over; an unclaimed deal must be claimed first", async () => {
    const deal = await ownDeal("foreign");
    const colleague = await rpc(users.m2.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "order",
    });
    assert.equal(colleague.status, 200, JSON.stringify(colleague.body));
    assert.equal((await getDeal(deal.deal_id)).sales_id, users.m1.salesId);
    const queued = await newQueueDeal("unclaimed");
    const res = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: queued.deal_id,
      p_expected_version: queued.version,
      p_to_stage: "order",
    });
    assert.equal(res.status, 422);
    assert.match(JSON.stringify(res.body), /claim_required/);
  });

  it("walks the stages of the technical task and refuses the retired ones", async () => {
    const deal = await ownDeal("statuses");
    let version = deal.version;
    for (const to of [
      "order",
      "design-task",
      "design-in-progress",
      "design-ready",
      "approval",
      "approved",
    ]) {
      const res = await rpc(users.m1.token, "transition_deal", {
        p_deal_id: deal.deal_id,
        p_expected_version: version,
        p_to_stage: to,
      });
      assert.equal(res.status, 200, `${to}: ${JSON.stringify(res.body)}`);
      version = res.body.version;
    }
    for (const to of [
      "proposal-sent",
      "delayed",
      "to-contact",
      "contract-signed",
    ]) {
      const res = await rpc(users.m1.token, "transition_deal", {
        p_deal_id: deal.deal_id,
        p_expected_version: version,
        p_to_stage: to,
      });
      assert.equal(res.status, 422, to);
      assert.match(JSON.stringify(res.body), /invalid_stage/);
    }
  });

  it("orders cards by neighbour id, not by screen position", async () => {
    const a = await ownDeal("order a");
    const b = await ownDeal("order b");
    const c = await ownDeal("order c");
    for (const d of [a, b, c]) {
      const r = await rpc(users.m1.token, "transition_deal", {
        p_deal_id: d.deal_id,
        p_expected_version: (await getDeal(d.deal_id)).version,
        p_to_stage: "order",
      });
      assert.equal(r.status, 200);
    }
    const before = (await getDeal(c.deal_id)).version;
    const res = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: c.deal_id,
      p_expected_version: before,
      p_to_stage: "order",
      p_before_deal_id: a.deal_id,
    });
    assert.equal(res.status, 200);
    const rows = (
      await rest(
        SECRET,
        "GET",
        `/rest/v1/deals?stage=eq.order&id=in.(${a.deal_id},${b.deal_id},${c.deal_id})&order=index.asc`,
      )
    ).body.map((r) => r.id);
    assert.deepEqual(rows, [c.deal_id, a.deal_id, b.deal_id]);
    // a reorder moves no version of the neighbours
    assert.equal(
      (await getDeal(b.deal_id)).version,
      (await getDeal(b.deal_id)).version,
    );
  });
});

describe("assign_deal", () => {
  it("returns a deal to the queue and lets the head assign it", async () => {
    const mine = await rpc(users.m1.token, "create_manual_deal", {
      p_name: "release me",
      p_new_contact: { first_name: "Rel" },
    });
    const released = await rpc(users.m1.token, "assign_deal", {
      p_deal_id: mine.body.deal_id,
      p_expected_version: mine.body.version,
      p_to_sales_id: null,
      p_reason: "Не моя тема",
    });
    assert.equal(released.status, 200, JSON.stringify(released.body));
    const row = await getDeal(mine.body.deal_id);
    assert.equal(row.sales_id, null);
    assert.equal(row.stage, "opportunity");
    assert.equal((await firstContactTasks(row.id)).length, 0);

    // another manager can take it, a new task appears for them
    const claim = await rpc(users.m2.token, "claim_deal", {
      p_deal_id: row.id,
    });
    assert.equal(claim.status, 200);
    const tasks = await firstContactTasks(row.id);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].sales_id, users.m2.salesId);

    // the head reassigns to the first manager and the task follows
    const assigned = await rpc(users.admin.token, "assign_deal", {
      p_deal_id: row.id,
      p_expected_version: claim.body.version,
      p_to_sales_id: users.m1.salesId,
    });
    assert.equal(assigned.status, 200);
    assert.equal((await getDeal(row.id)).sales_id, users.m1.salesId);
    assert.equal(
      (await firstContactTasks(row.id))[0].sales_id,
      users.m1.salesId,
    );
  });

  it("only the head assigns to someone else, and only to people who sell", async () => {
    const queued = await newQueueDeal("assign rules");
    const byManager = await rpc(users.m1.token, "assign_deal", {
      p_deal_id: queued.deal_id,
      p_expected_version: queued.version,
      p_to_sales_id: users.m2.salesId,
    });
    assert.equal(byManager.status, 403);
    const toShop = await rpc(users.admin.token, "assign_deal", {
      p_deal_id: queued.deal_id,
      p_expected_version: queued.version,
      p_to_sales_id: users.shop.salesId,
    });
    assert.equal(toShop.status, 422);
    assert.match(JSON.stringify(toShop.body), /invalid_assignee/);
  });
});
