import { useGetIdentity, useTranslate } from "ra-core";
import { Navigate } from "react-router";

import { hasSalesRole } from "../providers/commons/canAccess";

/** Where a person lands after the sign-in: sales people go to the deal board. */
export const Landing = () => {
  const { identity, isPending } = useGetIdentity();
  const translate = useTranslate();

  if (isPending) return null;
  if (hasSalesRole(identity?.roles)) {
    return <Navigate to="/deals" replace />;
  }
  return (
    <p className="mt-8 text-center text-muted-foreground">
      {translate("crm.landing.no_role")}
    </p>
  );
};
