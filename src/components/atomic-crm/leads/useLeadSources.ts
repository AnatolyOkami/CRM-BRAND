import { useGetList, useTranslate } from "ra-core";
import { useCallback, useMemo } from "react";

import type { DealSource, LeadSource } from "../types";
import { getSelectableSources, getSourceLabel } from "./leadSourceUtils";

const FIVE_MINUTES = 5 * 60_000;

/** The sources of leads from the database: the list changes rarely, so it is cached. */
export const useLeadSources = () => {
  const translate = useTranslate();
  const { data, isPending } = useGetList<LeadSource>(
    "lead_sources",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "position", order: "ASC" },
    },
    { staleTime: FIVE_MINUTES },
  );
  const sources = useMemo(() => data ?? [], [data]);

  const labelOf = useCallback(
    (code: DealSource) =>
      getSourceLabel(
        sources,
        code,
        translate(`resources.deals.sources.${code}`, { _: code }),
      ),
    [sources, translate],
  );
  const selectableFor = useCallback(
    (current?: DealSource) => getSelectableSources(sources, current),
    [sources],
  );

  return { sources, labelOf, selectableFor, isPending };
};
