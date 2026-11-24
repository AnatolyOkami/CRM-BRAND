import { useGetIdentity, useTranslate } from "ra-core";

import { isSalesHead } from "../providers/commons/canAccess";
import { LeadPartnersSection } from "./LeadPartnersSection";
import { LeadSourcesSection } from "./LeadSourcesSection";

/** Sources of leads and partner links: for administrators and the sales head. */
export const LeadIntakePage = () => {
  const translate = useTranslate();
  const { identity, isPending } = useGetIdentity();
  if (isPending) return null;
  const allowed =
    identity?.administrator === true || isSalesHead(identity?.roles);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4">
      <h1 className="text-2xl font-semibold">
        {translate("crm.lead_settings.title")}
      </h1>
      {allowed ? (
        <>
          <LeadPartnersSection />
          <LeadSourcesSection />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate("crm.lead_settings.forbidden")}
        </p>
      )}
    </div>
  );
};

LeadIntakePage.path = "/lead-intake";
