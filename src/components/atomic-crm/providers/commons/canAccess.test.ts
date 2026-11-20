import { describe, expect, it } from "vitest";

import { canAccess, hasSalesRole, isSalesHead } from "./canAccess";

describe("canAccess with working roles", () => {
  it("lets a manager use the sales resources but not the administration", () => {
    expect(
      canAccess("user", { resource: "deals", action: "list" }, ["manager"]),
    ).toBe(true);
    expect(
      canAccess("user", { resource: "sales", action: "list" }, ["manager"]),
    ).toBe(false);
    expect(
      canAccess("user", { resource: "configuration", action: "edit" }, [
        "manager",
      ]),
    ).toBe(false);
  });

  it("hides every sales resource from a person without a sales role", () => {
    for (const resource of ["deals", "contacts", "companies", "tasks"]) {
      expect(canAccess("user", { resource, action: "list" }, [])).toBe(false);
      expect(
        canAccess("user", { resource, action: "list" }, ["workshop"]),
      ).toBe(false);
    }
  });

  it("does not give business data to an administrator without a sales role", () => {
    expect(canAccess("admin", { resource: "deals", action: "list" }, [])).toBe(
      false,
    );
    expect(canAccess("admin", { resource: "sales", action: "list" }, [])).toBe(
      true,
    );
  });

  it("lets only the sales head delete deals", () => {
    const params = { resource: "deals", action: "delete" };
    expect(canAccess("user", params, ["manager"])).toBe(false);
    expect(canAccess("user", params, ["manager", "sales_head"])).toBe(true);
  });

  it("keeps working when roles are not tracked (demo mode)", () => {
    expect(canAccess("user", { resource: "deals", action: "delete" })).toBe(
      true,
    );
  });

  it("tells sales people and heads apart", () => {
    expect(hasSalesRole(["sales_head"])).toBe(true);
    expect(hasSalesRole(["fulfillment"])).toBe(false);
    expect(isSalesHead(["manager"])).toBe(false);
    expect(isSalesHead(["manager", "sales_head"])).toBe(true);
  });
});
