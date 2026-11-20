import { describe, expect, it } from "vitest";

import { toManualDealData, validateManualDeal } from "./manualDeal";

const now = new Date("2026-11-20T12:00:00.000Z");
const base = {
  name: "Баннер",
  source: "phone" as const,
  received_at: "2026-11-20T10:00",
  assign_to_me: true,
};

describe("validateManualDeal", () => {
  it("requires a title", () => {
    expect(
      validateManualDeal({ ...base, name: "  " }, "new", now),
    ).toHaveProperty("name");
  });

  it("requires a chosen customer in the existing mode", () => {
    expect(validateManualDeal(base, "existing", now)).toHaveProperty(
      "contact_id",
    );
    expect(
      validateManualDeal({ ...base, contact_id: 5 }, "existing", now),
    ).toEqual({});
  });

  it("accepts a new customer known only by a phone, without inventing a name", () => {
    expect(
      validateManualDeal({ ...base, phone: "+7 900 111-22-33" }, "new", now),
    ).toEqual({});
    expect(validateManualDeal(base, "new", now)).toHaveProperty("first_name");
  });

  it("does not accept a time of contact in the future", () => {
    expect(
      validateManualDeal(
        { ...base, contact_id: 5, received_at: "2026-11-21T10:00" },
        "existing",
        now,
      ),
    ).toHaveProperty("received_at");
  });
});

describe("toManualDealData", () => {
  it("sends the existing customer by id", () => {
    const data = toManualDealData({ ...base, contact_id: 5 }, "existing");
    expect(data.contact_id).toBe(5);
    expect(data.new_contact).toBeUndefined();
    expect(data.name).toBe("Баннер");
    expect(data.assign_to_me).toBe(true);
  });

  it("sends a new customer without empty fields and converts the time to ISO", () => {
    const data = toManualDealData(
      { ...base, first_name: " Иван ", last_name: "", phone: "+7 900" },
      "new",
    );
    expect(data.new_contact).toEqual({
      first_name: "Иван",
      last_name: undefined,
      phone: "+7 900",
      email: undefined,
    });
    expect(data.received_at).toBe(new Date("2026-11-20T10:00").toISOString());
  });
});
