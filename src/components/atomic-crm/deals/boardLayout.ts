import {
  hasInstallerRole,
  hasSalesRole,
  type WorkingRole,
} from "../providers/commons/canAccess";

/**
 * One column of the single board. A "stage" column shows the deals of a stage of the deal;
 * a "card" column holds the cards of a workshop or of the installation, which are not deals.
 */
export type BoardColumn =
  | { id: string; kind: "stage"; stage: string }
  | { id: string; kind: "card"; labelKey: string };

export interface BoardGroup {
  id: BoardGroupId;
  labelKey: string;
  columns: BoardColumn[];
}

export type BoardGroupId =
  | "sales"
  | "design"
  | "typography"
  | "wide-format"
  | "signs"
  | "installation"
  | "completion";

const stage = (value: string): BoardColumn => ({
  id: value,
  kind: "stage",
  stage: value,
});

const card = (id: string, labelKey: string): BoardColumn => ({
  id,
  kind: "card",
  labelKey,
});

const shopColumns = (shop: string): BoardColumn[] => [
  card(`${shop}-in-progress`, "crm.board.columns.in_progress"),
  card(`${shop}-done`, "crm.board.columns.done"),
];

/** The groups left to right, in this order always, even when a group has no cards yet. */
export const BOARD_GROUPS: BoardGroup[] = [
  {
    id: "sales",
    labelKey: "crm.board.groups.sales",
    columns: [stage("opportunity"), stage("processing"), stage("order")],
  },
  {
    id: "design",
    labelKey: "crm.board.groups.design",
    columns: [
      stage("design-task"),
      stage("design-in-progress"),
      stage("design-ready"),
      stage("approval"),
      stage("approved"),
    ],
  },
  {
    id: "typography",
    labelKey: "crm.board.groups.typography",
    columns: shopColumns("typography"),
  },
  {
    id: "wide-format",
    labelKey: "crm.board.groups.wide_format",
    columns: shopColumns("wide-format"),
  },
  {
    id: "signs",
    labelKey: "crm.board.groups.signs",
    columns: shopColumns("signs"),
  },
  {
    id: "installation",
    labelKey: "crm.board.groups.installation",
    columns: [
      card("install-to-plan", "crm.board.columns.install_to_plan"),
      card("install-planned", "crm.board.columns.install_planned"),
      card("install-done", "crm.board.columns.done"),
    ],
  },
  {
    id: "completion",
    labelKey: "crm.board.groups.completion",
    columns: [stage("won"), stage("lost")],
  },
];

const SHOP_GROUP_BY_ROLE: Partial<Record<WorkingRole, BoardGroupId>> = {
  shop_typography: "typography",
  shop_wide_format: "wide-format",
  shop_signs: "signs",
};

/**
 * What a person sees of the single board. Managers, the office head and the owner see the whole
 * line; the designer the design part, a workshop employee the columns of the own workshop, the
 * installer the installation. The server limits the data in the same way.
 */
export const getVisibleGroups = (roles?: WorkingRole[]): BoardGroup[] => {
  if (roles == null || hasSalesRole(roles)) return BOARD_GROUPS;
  const visible = new Set<BoardGroupId>();
  if (roles.includes("designer")) visible.add("design");
  for (const [role, group] of Object.entries(SHOP_GROUP_BY_ROLE)) {
    if (roles.includes(role as WorkingRole)) visible.add(group);
  }
  if (hasInstallerRole(roles)) visible.add("installation");
  return BOARD_GROUPS.filter((group) => visible.has(group.id));
};
