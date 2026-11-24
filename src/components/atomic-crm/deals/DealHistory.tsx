import { useGetList, useLocaleState, useTranslate } from "ra-core";

import { formatRelativeDate } from "../misc/RelativeDate";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { DealStageHistory } from "../types";
import { findDealLabel } from "./dealUtils";

/** Who changed the owner or the stage of the deal, when and why. */
export const DealHistory = ({
  dealId,
}: {
  dealId: DealStageHistory["deal_id"];
}) => {
  const translate = useTranslate();
  const { data, isPending } = useGetList<DealStageHistory>(
    "deal_stage_history",
    {
      filter: { deal_id: dealId },
      sort: { field: "id", order: "DESC" },
      pagination: { page: 1, perPage: 100 },
    },
  );

  return (
    <section aria-label={translate("crm.deal_history.title")}>
      <h3 className="mb-2 text-sm font-semibold">
        {translate("crm.deal_history.title")}
      </h3>
      {isPending ? null : !data?.length ? (
        <p className="text-sm text-muted-foreground">
          {translate("crm.deal_history.empty")}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {data.map((entry) => (
            <HistoryEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
};

const HistoryEntry = ({ entry }: { entry: DealStageHistory }) => {
  const translate = useTranslate();
  const [locale = "ru"] = useLocaleState();
  const { dealStages } = useConfigurationContext();
  const author = useGetSalesName(entry.changed_by ?? undefined, {
    enabled: entry.changed_by != null,
  });
  const newOwner = useGetSalesName(entry.to_sales_id ?? undefined, {
    enabled: entry.to_sales_id != null,
  });
  const stageLabel = (code: string | null) =>
    (code && findDealLabel(dealStages, code)) || code || "";

  let text: string;
  switch (entry.event) {
    case "created":
      text = translate("crm.deal_history.created");
      break;
    case "claimed":
      text = translate("crm.deal_history.claimed", { who: newOwner });
      break;
    case "assigned":
      text = translate("crm.deal_history.assigned", { who: newOwner });
      break;
    case "released":
      text = translate("crm.deal_history.released");
      break;
    case "call":
      text = translate("crm.deal_history.call");
      break;
    case "source":
      text = translate("crm.deal_history.source");
      break;
    case "handoff":
      text = translate("crm.deal_history.handoff");
      break;
    default:
      text = translate("crm.deal_history.stage", {
        from: stageLabel(entry.from_stage),
        to: stageLabel(entry.to_stage),
      });
  }

  return (
    <li className="text-sm">
      <span>{text}</span>
      <span className="ml-2 text-xs text-muted-foreground">
        {formatRelativeDate(entry.created_at, locale)}
        {author
          ? ` · ${translate("crm.deal_history.by", { name: author })}`
          : ""}
      </span>
      {entry.reason && (
        <p className="text-xs text-muted-foreground">«{entry.reason}»</p>
      )}
    </li>
  );
};
