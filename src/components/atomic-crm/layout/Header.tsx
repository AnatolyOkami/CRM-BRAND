import { FileText, Import, Settings, User, Users } from "lucide-react";
import { CanAccess, useTranslate, useUserMenu } from "ra-core";
import { Link } from "react-router";
import { RefreshButton } from "@/components/admin/refresh-button";
import { ThemeModeToggle } from "@/components/admin/theme-mode-toggle";
import { UserMenu } from "@/components/admin/user-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { ImportPage } from "../misc/ImportPage";
import { ChangelogPage } from "../misc/ChangelogPage";
import { GlobalSearchButton } from "../search/GlobalSearchButton";

const Header = () => {
  return (
    <header className="border-b bg-secondary">
      <div className="flex items-center justify-end px-4 py-1">
        <GlobalSearchButton />
        <ThemeModeToggle />
        <RefreshButton />
        <UserMenu>
          <ProfileMenu />
          <CanAccess resource="sales" action="list">
            <UsersMenu />
          </CanAccess>
          <CanAccess resource="configuration" action="edit">
            <SettingsMenu />
          </CanAccess>
          <ImportFromJsonMenuItem />
          <ChangelogMenuItem />
        </UserMenu>
      </div>
    </header>
  );
};

const UsersMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<UsersMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/sales" className="flex items-center gap-2" />}
    >
      <Users />
      {translate("resources.sales.name", { smart_count: 2 })}
    </DropdownMenuItem>
  );
};

const ProfileMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ProfileMenu> must be used inside <UserMenu?");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/profile" className="flex items-center gap-2" />}
    >
      <User />
      {translate("crm.profile.title")}
    </DropdownMenuItem>
  );
};

const SettingsMenu = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<SettingsMenu> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to="/settings" className="flex items-center gap-2" />}
    >
      <Settings />
      {translate("crm.settings.title")}
    </DropdownMenuItem>
  );
};

const ImportFromJsonMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ImportFromJsonMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={<Link to={ImportPage.path} className="flex items-center gap-2" />}
    >
      <Import />
      {translate("crm.header.import_data")}
    </DropdownMenuItem>
  );
};

const ChangelogMenuItem = () => {
  const translate = useTranslate();
  const userMenuContext = useUserMenu();
  if (!userMenuContext) {
    throw new Error("<ChangelogMenuItem> must be used inside <UserMenu>");
  }
  return (
    <DropdownMenuItem
      onClick={userMenuContext.onClose}
      render={
        <Link to={ChangelogPage.path} className="flex items-center gap-2" />
      }
    >
      <FileText />
      {translate("crm.changelog.title")}
    </DropdownMenuItem>
  );
};
export default Header;
