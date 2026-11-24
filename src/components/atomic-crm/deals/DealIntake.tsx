import { useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import {
  useDataProvider,
  useGetOne,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useLeadSources } from "../leads/useLeadSources";
import { hasSalesRole } from "../providers/commons/canAccess";
import {
  DealCommandError,
  newRequestKey,
} from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { Deal, LeadPartner } from "../types";
import { describeCommandError } from "./boardUtils";
import { CallResultDialog } from "./CallResultDialog";
import { useGetIdentity } from "ra-core";
import { useState } from "react";

const UTM_LABELS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/**
 * Where the lead came from (the source can be clarified by any manager), who sent it, and the button
 * with which the manager records the result of a call.
 */
export const DealIntake = ({ deal }: { deal: Deal }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { identity } = useGetIdentity();
  const { labelOf, selectableFor } = useLeadSources();
  const [callOpen, setCallOpen] = useState(false);
  const canSell = hasSalesRole(identity?.roles);
  const closed = ["won", "lost"].includes(deal.stage);

  const changeSource = async (source: string) => {
    try {
      await dataProvider.setDealSource({
        dealId: deal.id,
        expectedVersion: deal.version,
        source,
        requestKey: newRequestKey(),
      });
      notify("crm.intake.source_changed", { type: "success" });
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(view.messageKey, {
        type: view.conflict ? "warning" : "error",
        messageArgs: { code },
      });
    } finally {
      await Promise.all(
        ["deals", "deal_stage_history"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    }
  };

  const utm = deal.utm
    ? UTM_LABELS.filter((key) => deal.utm?.[key]).map(
        (key) => `${key}=${deal.utm?.[key]}`,
      )
    : [];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col">
        <span className="text-xs tracking-wide text-muted-foreground">
          {translate("resources.deals.fields.source")}
        </span>
        <span className="flex items-center gap-1 text-sm">
          {labelOf(deal.source)}
          {canSell && !deal.archived_at && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="link" size="sm" className="h-auto p-0" />
                }
              >
                {translate("crm.intake.change_source")}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {selectableFor(deal.source)
                  .filter((source) => source.code !== deal.source)
                  .map((source) => (
                    <DropdownMenuItem
                      key={source.code}
                      onClick={() => void changeSource(source.code)}
                    >
                      {source.label}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </span>
      </div>
      {deal.partner_id != null && <PartnerName id={deal.partner_id} />}
      {utm.length > 0 && (
        <div className="flex flex-col">
          <span className="text-xs tracking-wide text-muted-foreground">
            UTM
          </span>
          <span className="text-sm">{utm.join(", ")}</span>
        </div>
      )}
      {canSell && deal.sales_id != null && !closed && !deal.archived_at && (
        <>
          <Button variant="outline" size="sm" onClick={() => setCallOpen(true)}>
            <PhoneCall className="mr-1 h-4 w-4" />
            {translate("crm.board.call_result")}
          </Button>
          <CallResultDialog
            deal={callOpen ? deal : null}
            onClose={() => setCallOpen(false)}
          />
        </>
      )}
    </div>
  );
};

const PartnerName = ({ id }: { id: Identifier }) => {
  const translate = useTranslate();
  const { data } = useGetOne<LeadPartner>("lead_partners", { id });
  return (
    <div className="flex flex-col">
      <span className="text-xs tracking-wide text-muted-foreground">
        {translate("crm.intake.partner")}
      </span>
      <span className="text-sm">{data?.name ?? "…"}</span>
    </div>
  );
};
