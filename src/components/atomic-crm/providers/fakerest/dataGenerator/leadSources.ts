import type { LeadSource } from "../../../types";

// The same starting list as the migration that creates the table of the real backend
const SOURCES: Array<[string, string, boolean]> = [
  ["avito", "Авито", true],
  ["website", "Сайт", true],
  ["yandex-maps", "Яндекс Карты", true],
  ["2gis", "2ГИС", true],
  ["partner", "Рекламный партнёр", true],
  ["referral", "Рекомендация", true],
  ["own-outdoor", "Собственная наружная реклама", true],
  ["other", "Другое", true],
];

export const generateLeadSources = (): LeadSource[] =>
  SOURCES.map(([code, label, is_active], index) => ({
    id: index + 1,
    code,
    label,
    is_active,
    position: (index + 1) * 10,
  }));
