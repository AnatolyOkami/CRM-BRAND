import type { ConfigurationContextValue } from "./ConfigurationContext";
// Import the logos as module assets so Vite resolves their URL relative to the
// JS chunk (import.meta.url), not the current route. A plain "./logos/..." path
// breaks on nested routes like /oauth/consent and under a deployment sub-path.
import darkModeLogo from "./logos/logo_atomic_crm_dark.svg";
import lightModeLogo from "./logos/logo_atomic_crm_light.svg";

export const defaultDarkModeLogo = darkModeLogo;
export const defaultLightModeLogo = lightModeLogo;

export const defaultCurrency = "RUB";

export const defaultTitle = "CRM Наружная реклама";

export const defaultCompanySectors = [
  { value: "retail", label: "Розничная торговля" },
  { value: "food-service", label: "Общепит и рестораны" },
  { value: "construction", label: "Строительство и недвижимость" },
  { value: "auto", label: "Авто и сервис" },
  { value: "beauty-health", label: "Красота и здоровье" },
  { value: "education", label: "Образование" },
  { value: "manufacturing", label: "Производство" },
  { value: "services", label: "Услуги" },
  { value: "government", label: "Госсектор" },
  { value: "agency", label: "Рекламное агентство" },
  { value: "other", label: "Другое" },
];

/**
 * Stage codes are system codes shared with the database (check constraint on deals.stage) and the
 * deal commands: never rename them. Only the labels may be edited. Leads enter "opportunity" ("New"),
 * a manager takes them to "processing" and agrees the order with the customer ("order"); the design
 * stages and the approval follow, then the production and the end of the order.
 */
export const defaultDealStages = [
  { value: "opportunity", label: "Новая" },
  { value: "processing", label: "Обработка" },
  { value: "order", label: "Заказ" },
  { value: "design-task", label: "Задача для дизайнера" },
  { value: "design-in-progress", label: "Взял в работу" },
  { value: "design-ready", label: "Макет готов" },
  { value: "approval", label: "Согласование" },
  { value: "approved", label: "Согласован" },
  { value: "sent-to-production", label: "Отправлено на производство" },
  { value: "won", label: "Заказ завершён" },
  { value: "lost", label: "Отказ" },
];

/**
 * Stages of the first pipeline. Old history and old deals still refer to them, so they keep a label,
 * but no deal can enter them again. "contract-signed" still has a column while old deals wait in it.
 */
export const retiredDealStages = [
  { value: "proposal-sent", label: "КП отправлено (старый этап)" },
  { value: "delayed", label: "Отложена (старый этап)" },
  { value: "to-contact", label: "Связаться (старый этап)" },
  { value: "contacted", label: "Связались (старый этап)" },
  { value: "in-work", label: "В работе (старый этап)" },
  { value: "in-negociation", label: "Согласование и оплата (старый этап)" },
  { value: "contract-signed", label: "Договор подписан (старый этап)" },
];

// Stages left out of the pipeline widget of the dashboard
export const defaultDealPipelineStatuses = ["won"];

export const defaultDealCategories = [
  { value: "banner", label: "Баннер" },
  { value: "signboard", label: "Вывеска" },
  { value: "lightbox", label: "Световой короб" },
  { value: "volumetric-letters", label: "Объёмные буквы" },
  { value: "vehicle-wrap", label: "Оклейка транспорта" },
  { value: "wide-format-print", label: "Широкоформатная печать" },
  { value: "stand", label: "Стенд, табличка" },
  { value: "billboard", label: "Билборд, сити-формат" },
  { value: "installation", label: "Монтаж" },
  { value: "other", label: "Другое" },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "Холодный", color: "#7dbde8" },
  { value: "warm", label: "Тёплый", color: "#e8cb7d" },
  { value: "hot", label: "Горячий", color: "#e88b7d" },
  { value: "in-contract", label: "В договоре", color: "#a4e87d" },
];

export const defaultTaskTypes = [
  { value: "none", label: "Без типа" },
  { value: "first-contact", label: "Первый контакт" },
  { value: "call", label: "Звонок" },
  { value: "email", label: "Письмо" },
  { value: "meeting", label: "Встреча" },
  { value: "measurement", label: "Замер" },
  { value: "follow-up", label: "Повторная связь" },
  { value: "proposal", label: "Расчёт и КП" },
  { value: "ship", label: "Отправить" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  currency: defaultCurrency,
  dealCategories: defaultDealCategories,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealStages: defaultDealStages,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
