import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";

export const DEFAULT_COMPANY_TIME_ZONE = "Europe/Moscow";

/** Formats a moment in the time zone of the company, whatever the zone of the browser is. */
export const formatCompanyDateTime = (
  date: string | Date,
  locale = "ru",
  timeZone = DEFAULT_COMPANY_TIME_ZONE,
): string =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(date));

/**
 * Time zone of the company, kept in business_settings. Dates are stored with their zone and shown
 * in this one. Without the setting (demo mode, no access) the default zone of the company is used.
 */
export const useCompanyTimeZone = (): string => {
  const dataProvider = useDataProvider();
  const { data } = useQuery({
    queryKey: ["business_settings", "timezone"],
    queryFn: async () => {
      const { data } = await dataProvider.getOne<{
        id: number;
        timezone: string;
      }>("business_settings", { id: 1 });
      return data.timezone;
    },
    staleTime: 1000 * 60 * 30,
    retry: false,
  });
  return data ?? DEFAULT_COMPANY_TIME_ZONE;
};
