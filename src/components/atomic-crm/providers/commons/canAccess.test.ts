import { describe, expect, it } from "vitest";

import {
  canAccess,
  hasDesignerRole,
  hasInstallerRole,
  hasProductionRole,
  hasSalesRole,
  isSalesHead,
} from "./canAccess";

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
        canAccess("user", { resource, action: "list" }, ["shop_signs"]),
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

  it("lets only the office head and the owner delete deals", () => {
    const params = { resource: "deals", action: "delete" };
    expect(canAccess("user", params, ["manager"])).toBe(false);
    expect(canAccess("user", params, ["manager", "office_head"])).toBe(true);
    expect(canAccess("user", params, ["owner"])).toBe(true);
  });

  it("keeps working when roles are not tracked (demo mode)", () => {
    expect(canAccess("user", { resource: "deals", action: "delete" })).toBe(
      true,
    );
  });

  it("tells sales people and heads apart", () => {
    expect(hasSalesRole(["office_head"])).toBe(true);
    expect(hasSalesRole(["installer"])).toBe(false);
    expect(isSalesHead(["manager"])).toBe(false);
    expect(isSalesHead(["manager", "office_head"])).toBe(true);
  });

  it("gives the owner every role", () => {
    const owner: Parameters<typeof hasSalesRole>[0] = ["owner"];

    expect(hasSalesRole(owner)).toBe(true);
    expect(isSalesHead(owner)).toBe(true);
    expect(hasDesignerRole(owner)).toBe(true);
    expect(hasInstallerRole(owner)).toBe(true);
    expect(hasProductionRole(owner)).toBe(true);
  });

  it("limits the designer, the workshops and the installer to their part", () => {
    expect(hasDesignerRole(["designer"])).toBe(true);
    expect(hasSalesRole(["designer"])).toBe(false);
    expect(hasProductionRole(["shop_typography"])).toBe(true);
    expect(hasProductionRole(["designer"])).toBe(false);
    expect(hasInstallerRole(["installer"])).toBe(true);
    expect(hasInstallerRole(["manager"])).toBe(false);
  });

  it("lets a designer read the deals but nothing else of sales", () => {
    const roles: Parameters<typeof hasSalesRole>[0] = ["designer"];

    expect(
      canAccess("user", { resource: "deals", action: "list" }, roles),
    ).toBe(true);
    expect(
      canAccess("user", { resource: "contacts", action: "list" }, roles),
    ).toBe(false);
    expect(
      canAccess("user", { resource: "deals", action: "delete" }, roles),
    ).toBe(false);
  });
});
