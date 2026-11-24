// Integration tests of the roles of the technical task against a real local Supabase.
//
//   npx supabase db reset --local && node --test supabase/tests/roles-api.test.mjs
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  RUN,
  getDeal,
  rest,
  rpc,
  setRoles,
  setupUsers,
  users,
} from "./helpers.mjs";

before(setupUsers);
// the account "nobody" changes its roles from test to test: leave it as it was
after(() => setRoles("nobody", []));

const stageOf = (name, stage) =>
  rpc(users.m1.token, "create_manual_deal", {
    p_name: `${name} ${RUN}`,
    p_new_contact: { first_name: name },
  }).then(async (created) => {
    assert.equal(created.status, 200, JSON.stringify(created.body));
    if (stage === "processing") return created.body;
    const moved = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: created.body.deal_id,
      p_expected_version: created.body.version,
      p_to_stage: stage,
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    return moved.body;
  });

describe("the roles of the technical task", () => {
  it("accepts only the roles of the task", async () => {
    for (const bad of [
      "sales_head",
      "workshop",
      "production_head",
      "fulfillment",
      "boss",
    ]) {
      const res = await setRoles("nobody", [bad]);
      assert.equal(res.status, 422, bad);
    }
    for (const good of [
      "owner",
      "office_head",
      "manager",
      "designer",
      "shop_typography",
      "shop_wide_format",
      "shop_signs",
      "installer",
    ]) {
      const res = await setRoles("nobody", [good]);
      assert.equal(res.status, 204, good);
    }
  });

  it("lets the owner and the administrator manage the rights, nobody else", async () => {
    const byManager = await rpc(users.m1.token, "set_staff_roles", {
      p_sales_id: users.nobody.salesId,
      p_roles: ["owner"],
    });
    assert.equal(byManager.status, 403);
    await setRoles("nobody", ["owner"]);
    const byOwner = await rpc(users.nobody.token, "set_staff_roles", {
      p_sales_id: users.m2.salesId,
      p_roles: ["manager"],
    });
    assert.equal(byOwner.status, 204, JSON.stringify(byOwner.body));
  });

  it("gives the owner every role: the deals, the workshops and the sources", async () => {
    await setRoles("nobody", ["owner"]);
    const deal = await stageOf("owner sees", "order");
    const seen = await rest(
      users.nobody.token,
      "GET",
      `/rest/v1/deals?id=eq.${deal.deal_id}`,
    );
    assert.equal(seen.body.length, 1);
    const source = await rpc(users.nobody.token, "save_lead_source", {
      p_code: `owner-${RUN}`,
      p_label: "Владелец",
    });
    assert.equal(source.status, 200, JSON.stringify(source.body));
    const moved = await rpc(users.nobody.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "design-task",
    });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
  });

  it("shows the designer only the deals of the design stages, read only", async () => {
    await setRoles("nobody", ["designer"]);
    const inDesign = await stageOf("in design", "design-task");
    const inSales = await stageOf("in sales", "order");
    const rows = await rest(
      users.nobody.token,
      "GET",
      `/rest/v1/deals?id=in.(${inDesign.deal_id},${inSales.deal_id})&select=id,stage`,
    );
    assert.deepEqual(
      rows.body.map((r) => r.id),
      [inDesign.deal_id],
    );
    const write = await rest(
      users.nobody.token,
      "PATCH",
      `/rest/v1/deals?id=eq.${inDesign.deal_id}`,
      { name: "hacked" },
    );
    assert.deepEqual(write.body, []);
    assert.notEqual((await getDeal(inDesign.deal_id)).name, "hacked");
    const move = await rpc(users.nobody.token, "transition_deal", {
      p_deal_id: inDesign.deal_id,
      p_expected_version: inDesign.version,
      p_to_stage: "design-in-progress",
    });
    assert.equal(move.status, 403);
    const contacts = await rest(users.nobody.token, "GET", "/rest/v1/contacts");
    assert.deepEqual(contacts.body, []);
    const money = await rest(
      users.nobody.token,
      "GET",
      "/rest/v1/deal_payments",
    );
    assert.deepEqual(money.body, []);
  });

  it("shows the workshops and the installer no deals at all", async () => {
    const deal = await stageOf("no deals", "design-ready");
    for (const role of [
      "shop_typography",
      "shop_wide_format",
      "shop_signs",
      "installer",
    ]) {
      await setRoles("nobody", [role]);
      const rows = await rest(
        users.nobody.token,
        "GET",
        `/rest/v1/deals?id=eq.${deal.deal_id}`,
      );
      assert.deepEqual(rows.body, [], role);
    }
  });

  it("gives the office head the powers of the old sales head", async () => {
    await setRoles("nobody", ["office_head"]);
    const deal = await stageOf("office head", "order");
    const lost = await rpc(users.m1.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: deal.version,
      p_to_stage: "lost",
      p_reason: "Дорого",
    });
    assert.equal(lost.status, 200);
    const reopen = await rpc(users.nobody.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: lost.body.version,
      p_to_stage: "processing",
    });
    assert.equal(reopen.status, 200, JSON.stringify(reopen.body));
    const manager = await rpc(users.m2.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: reopen.body.version,
      p_to_stage: "lost",
      p_reason: "x",
    });
    assert.equal(manager.status, 200);
    const reopenByManager = await rpc(users.m2.token, "transition_deal", {
      p_deal_id: deal.deal_id,
      p_expected_version: manager.body.version,
      p_to_stage: "processing",
    });
    assert.equal(reopenByManager.status, 403);
  });
});
