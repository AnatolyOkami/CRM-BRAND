// FIXME: This should be exported from the ra-core package
type CanAccessParams<
  RecordType extends Record<string, any> = Record<string, any>,
> = {
  action: string;
  resource: string;
  record?: RecordType;
};

/** Working roles, mirrored from public.staff_roles. The database enforces them, this only shapes the UI. */
export type WorkingRole =
  "manager" | "sales_head" | "production_head" | "workshop" | "fulfillment";

const SALES_ROLES: WorkingRole[] = ["manager", "sales_head"];

// Resources that hold sales data: nobody without a sales role has anything to do with them
const SALES_RESOURCES = new Set([
  "deals",
  "contacts",
  "companies",
  "tasks",
  "tags",
  "contact_notes",
  "deal_notes",
  "deal_stage_history",
  "activity_log",
]);

export const hasSalesRole = (roles?: WorkingRole[]) =>
  roles == null || roles.some((role) => SALES_ROLES.includes(role));

export const isSalesHead = (roles?: WorkingRole[]) =>
  roles?.includes("sales_head") ?? false;

export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: string,
  params: CanAccessParams<RecordType>,
  // undefined means the roles are not tracked (demo mode): everybody may sell
  roles?: WorkingRole[],
) => {
  if (SALES_RESOURCES.has(params.resource) && !hasSalesRole(roles)) {
    return false;
  }

  // Only sales heads delete deals, companies and contacts
  if (
    params.action === "delete" &&
    ["deals", "contacts", "companies"].includes(params.resource) &&
    roles != null &&
    !isSalesHead(roles)
  ) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  // Non admins can't access the sales resource
  if (params.resource === "sales") {
    return false;
  }

  // Non admins can't access the configuration resource
  if (params.resource === "configuration") {
    return false;
  }

  return true;
};
