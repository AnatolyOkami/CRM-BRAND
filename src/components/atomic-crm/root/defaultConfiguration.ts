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
 * deal commands: never rename them. Only the labels may be edited. "in-negociation" keeps the
 * spelling of the upstream repository on purpose.
 */
export const defaultDealStages = [
  { value: "opportunity", label: "Новые заявки" },
  { value: "to-contact", label: "Связаться" },
  { value: "contacted", label: "Связались" },
  { value: "in-work", label: "В работе" },
  { value: "proposal-sent", label: "КП отправлено" },
  { value: "in-negociation", label: "Согласование и оплата" },
  { value: "contract-signed", label: "Договор подписан" },
  { value: "sent-to-production", label: "Отправлено на производство" },
  { value: "won", label: "Выиграна" },
  { value: "lost", label: "Закрыта без продажи" },
  { value: "delayed", label: "Отложена" },
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
