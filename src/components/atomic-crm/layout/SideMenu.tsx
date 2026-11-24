import {
  BarChart3,
  Building2,
  CheckSquare,
  Factory,
  Inbox,
  KanbanSquare,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { CanAccess, useGetIdentity, useTranslate } from "ra-core";
import type { ComponentType } from "react";
import { Link, matchPath, useLocation } from "react-router";

import {
  hasProductionRole,
  hasSalesRole,
  isSalesHead,
} from "../providers/commons/canAccess";
import { useConfigurationContext } from "../root/ConfigurationContext";

interface MenuItem {
  to: string;
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
  match: string;
}

const SALES_ITEMS: MenuItem[] = [
  {
    to: "/my-tasks",
    labelKey: "crm.menu.tasks",
    icon: CheckSquare,
    match: "/my-tasks/*",
  },
  {
    to: "/deals",
    labelKey: "crm.menu.sales",
    icon: KanbanSquare,
    match: "/deals/*",
  },
  {
    to: "/analytics",
    labelKey: "crm.menu.analytics",
    icon: BarChart3,
    match: "/analytics/*",
  },
  {
    to: "/contacts",
    labelKey: "crm.menu.contacts",
    icon: Users,
    match: "/contacts/*",
  },
  {
    to: "/companies",
    labelKey: "crm.menu.companies",
    icon: Building2,
    match: "/companies/*",
  },
];

/**
 * Permanent left menu of the desktop layout. The items depend on the working roles; the database
 * enforces the same rules, the menu only hides what a person cannot use.
 */
export const SideMenu = () => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  const { identity } = useGetIdentity();
  const location = useLocation();
  const translate = useTranslate();
  const showSales = hasSalesRole(identity?.roles);
  // Without tracked roles (demo mode) there is no workshop
  const showProduction =
    identity?.roles != null && hasProductionRole(identity.roles);
  // Sources of leads and partner links are set by administrators and the sales head
  const showLeadSettings =
    identity?.administrator === true || isSalesHead(identity?.roles);

  return (
    <aside
      className="hidden md:flex w-56 shrink-0 flex-col border-r bg-secondary text-secondary-foreground"
      aria-label={translate("crm.navigation.label")}
    >
      <Link
        to="/"
        className="flex items-center gap-2 px-4 py-4 text-secondary-foreground no-underline"
      >
        <img className="[.light_&]:hidden h-6" src={darkModeLogo} alt={title} />
        <img className="[.dark_&]:hidden h-6" src={lightModeLogo} alt={title} />
        <span className="text-base font-semibold leading-tight">{title}</span>
      </Link>
      <nav className="flex flex-col gap-1 px-2 pb-4">
        {showSales &&
          SALES_ITEMS.map((item) => (
            <SideMenuLink
              key={item.to}
              item={item}
              active={!!matchPath(item.match, location.pathname)}
            />
          ))}
        {showProduction && (
          <SideMenuLink
            item={{
              to: "/production",
              labelKey: "crm.menu.production",
              icon: Factory,
              match: "/production/*",
            }}
            active={!!matchPath("/production/*", location.pathname)}
          />
        )}
        {showLeadSettings && (
          <SideMenuLink
            item={{
              to: "/lead-intake",
              labelKey: "crm.menu.lead_intake",
              icon: Inbox,
              match: "/lead-intake/*",
            }}
            active={!!matchPath("/lead-intake/*", location.pathname)}
          />
        )}
        <CanAccess resource="sales" action="list">
          <SideMenuLink
            item={{
              to: "/sales",
              labelKey: "crm.menu.users",
              icon: UserCog,
              match: "/sales/*",
            }}
            active={!!matchPath("/sales/*", location.pathname)}
          />
        </CanAccess>
        <CanAccess resource="configuration" action="edit">
          <SideMenuLink
            item={{
              to: "/settings",
              labelKey: "crm.menu.settings",
              icon: Settings,
              match: "/settings",
            }}
            active={!!matchPath("/settings", location.pathname)}
          />
        </CanAccess>
      </nav>
    </aside>
  );
};

const SideMenuLink = ({
  item,
  active,
}: {
  item: MenuItem;
  active: boolean;
}) => {
  const translate = useTranslate();
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors ${
        active
          ? "bg-background/60 text-secondary-foreground"
          : "text-secondary-foreground/70 hover:bg-background/30 hover:text-secondary-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {translate(item.labelKey)}
    </Link>
  );
};
