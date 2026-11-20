import { useTranslate } from "ra-core";
import { useController } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

import type { StaffRole } from "../types";
import { STAFF_ROLES } from "./staffRoles";

/** Working roles of a person: an administrator ticks them, the database enforces them. */
export const StaffRolesInput = ({ source = "roles" }: { source?: string }) => {
  const translate = useTranslate();
  const { field } = useController({ name: source, defaultValue: [] });
  const value: StaffRole[] = Array.isArray(field.value) ? field.value : [];

  const toggle = (role: StaffRole, checked: boolean) => {
    field.onChange(
      checked
        ? [...value.filter((current) => current !== role), role]
        : value.filter((current) => current !== role),
    );
  };

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">
        {translate("crm.roles.title")}
      </legend>
      {STAFF_ROLES.map((role) => (
        <div key={role} className="flex items-center gap-2">
          <Checkbox
            id={`role-${role}`}
            checked={value.includes(role)}
            onCheckedChange={(checked) => toggle(role, checked === true)}
          />
          <Label htmlFor={`role-${role}`}>
            {translate(`crm.roles.${role}`)}
          </Label>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        {value.length === 0 ? `${translate("crm.roles.none")}. ` : ""}
        {translate("crm.roles.help")}
      </p>
    </fieldset>
  );
};
