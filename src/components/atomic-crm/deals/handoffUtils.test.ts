import { describe, expect, it } from "vitest";

import { addOrderLink, isHttpUrl, validateHandoffForm } from "./handoffUtils";

describe("isHttpUrl", () => {
  it("accepts http and https addresses", () => {
    expect(isHttpUrl("https://drive.example.com/file?id=1")).toBe(true);
    expect(isHttpUrl(" http://example.com ")).toBe(true);
  });

  it("rejects other schemes, spaces and plain words", () => {
    for (const value of [
      "javascript:alert(1)",
      "ftp://example.com/file",
      "example.com/file",
      "https://exa mple.com",
      "",
    ]) {
      expect(isHttpUrl(value)).toBe(false);
    }
  });
});

describe("addOrderLink", () => {
  it("adds a valid link with its label without touching the list", () => {
    const links = [{ url: "https://a.example.com", label: "A" }];
    const result = addOrderLink(links, " https://b.example.com ", " Макет ");
    expect(result.error).toBeUndefined();
    expect(result.links).toEqual([
      { url: "https://a.example.com", label: "A" },
      { url: "https://b.example.com", label: "Макет" },
    ]);
    expect(links).toHaveLength(1);
  });

  it("refuses an invalid or a repeated address", () => {
    const links = [{ url: "https://a.example.com", label: "A" }];
    expect(addOrderLink(links, "not a link", "").error).toBe("invalid");
    expect(addOrderLink(links, "https://a.example.com", "").error).toBe(
      "duplicate",
    );
  });
});

describe("validateHandoffForm", () => {
  it("requires the name of the product", () => {
    expect(validateHandoffForm({ productName: "  " })).toHaveProperty(
      "productName",
    );
    expect(validateHandoffForm({ productName: "Баннер" })).toEqual({});
  });
});
