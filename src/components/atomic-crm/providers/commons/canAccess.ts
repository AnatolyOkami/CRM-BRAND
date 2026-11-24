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
  | "owner"
  | "office_head"
  | "manager"
  | "designer"
  | "shop_typography"
  | "shop_wide_format"
  | "shop_signs"
  | "installer";

/** The roles of the workshops, one per workshop. */
export const SHOP_ROLES: WorkingRole[] = [
  "shop_typography",
  "shop_wide_format",
  "shop_signs",
];

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

// The designer reads the deals of the design stages, with their notes and history
const DESIGNER_RESOURCES = new Set([
  "deals",
  "deal_notes",
  "deal_stage_history",
]);

/** The owner holds every role. */
const holds = (roles: WorkingRole[], role: WorkingRole) =>
  roles.includes("owner") || roles.includes(role);

export const hasProductionRole = (roles?: WorkingRole[]) =>
  roles == null ||
  holds(roles, "office_head") ||
  SHOP_ROLES.some((role) => holds(roles, role));

export const hasSalesRole = (roles?: WorkingRole[]) =>
  roles == null || holds(roles, "manager") || holds(roles, "office_head");

export const hasDesignerRole = (roles?: WorkingRole[]) =>
  roles == null || holds(roles, "designer");

export const hasInstallerRole = (roles?: WorkingRole[]) =>
  roles == null || holds(roles, "installer");

/** The office head and the owner: all deals and orders, the sources, the partners. */
export const isSalesHead = (roles?: WorkingRole[]) =>
  roles != null && holds(roles, "office_head");

export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: string,
  params: CanAccessParams<RecordType>,
  // undefined means the roles are not tracked (demo mode): everybody may sell
  roles?: WorkingRole[],
) => {
  if (
    SALES_RESOURCES.has(params.resource) &&
    !hasSalesRole(roles) &&
    !(DESIGNER_RESOURCES.has(params.resource) && hasDesignerRole(roles))
  ) {
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
