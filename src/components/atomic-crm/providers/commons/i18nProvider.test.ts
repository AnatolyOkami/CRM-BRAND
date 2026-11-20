import { afterEach, describe, expect, it, vi } from "vitest";
import { getInitialLocale, i18nProvider } from "./i18nProvider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("i18nProvider", () => {
  it("registers ru, en and fr locales", () => {
    expect(i18nProvider.getLocales?.()).toEqual([
      { locale: "ru", name: "Русский" },
      { locale: "en", name: "English" },
      { locale: "fr", name: "Français" },
    ]);
  });

  it("translates the language key in french", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("crm.language")).toBe("Langue");
  });

  it("falls back to english for unknown locales", async () => {
    await i18nProvider.changeLocale("es");

    expect(i18nProvider.translate("crm.language")).toBe("Language");
  });

  it("uses customized password reset overrides for en and fr", async () => {
    await i18nProvider.changeLocale("en");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Check your emails for a Reset Password message.",
    );

    await i18nProvider.changeLocale("fr");
    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    );
  });

  it("translates recently added fr crm keys", async () => {
    await i18nProvider.changeLocale("fr");

    expect(i18nProvider.translate("resources.deals.empty.title")).toBe(
      "Aucune affaire trouvée",
    );
  });

  it("translates the interface in russian", async () => {
    await i18nProvider.changeLocale("ru");

    expect(i18nProvider.translate("crm.language")).toBe("Язык");
    expect(i18nProvider.translate("crm.menu.sales")).toBe("Продажи");
    expect(i18nProvider.translate("resources.deals.sources.avito")).toBe(
      "Авито",
    );
  });

  it("uses plural forms of Russian", async () => {
    await i18nProvider.changeLocale("ru");
    const key = "crm.common.task_count";

    expect(i18nProvider.translate(key, { smart_count: 1 })).toBe("1 задача");
    expect(i18nProvider.translate(key, { smart_count: 3 })).toBe("3 задачи");
    expect(i18nProvider.translate(key, { smart_count: 5 })).toBe("5 задач");
    expect(i18nProvider.translate(key, { smart_count: 21 })).toBe("21 задача");
  });

  it("starts in russian whatever the browser language is", () => {
    vi.stubGlobal("navigator", {
      language: "en-US",
      languages: ["en-US"],
    });

    expect(getInitialLocale()).toBe("ru");
  });

  it("keeps the english catalog available for missing russian keys", async () => {
    await i18nProvider.changeLocale("ru");

    expect(i18nProvider.translate("ra-supabase.auth.password_reset")).toBe(
      "Check your emails for a Reset Password message.",
    );
  });
});
