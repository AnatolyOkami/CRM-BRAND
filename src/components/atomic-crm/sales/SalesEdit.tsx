import { useMutation } from "@tanstack/react-query";
import {
  useDataProvider,
  useEditController,
  useGetList,
  useNotify,
  useRecordContext,
  useRedirect,
  useTranslate,
} from "ra-core";
import type { SubmitHandler } from "react-hook-form";
import { SimpleForm } from "@/components/admin/simple-form";
import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";
import { Card, CardContent } from "@/components/ui/card";

import type { CrmDataProvider } from "../providers/types";
import type { Sale, SalesFormData, StaffRole, StaffRoleRecord } from "../types";
import { getSalesErrorNotification } from "./salesErrorNotification";
import { SalesInputs } from "./SalesInputs";
import { StaffRolesInput } from "./StaffRolesInput";

type SalesEditFormData = SalesFormData & { roles?: StaffRole[] };

function EditToolbar() {
  return (
    <div className="flex justify-end gap-4">
      <CancelButton />
      <SaveButton />
    </div>
  );
}

export function SalesEdit() {
  const { record } = useEditController();

  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const redirect = useRedirect();
  const translate = useTranslate();

  const { mutate } = useMutation({
    mutationKey: ["signup"],
    mutationFn: async ({ roles, ...data }: SalesEditFormData) => {
      if (!record) {
        throw new Error(
          translate("resources.sales.edit.record_not_found", {
            _: "Record not found",
          }),
        );
      }
      const updated = await dataProvider.salesUpdate(record.id, data);
      if (roles) {
        await dataProvider.setStaffRoles(record.id, roles);
      }
      return updated;
    },
    onSuccess: () => {
      redirect("/sales");
      notify("resources.sales.edit.success", {
        messageArgs: {
          _: "User updated successfully",
        },
      });
    },
    onError: (error) => {
      const { message, args } = getSalesErrorNotification(
        error,
        "resources.sales.edit.error",
      );
      notify(message, {
        type: "error",
        messageArgs: { ...args, _: "An error occurred. Please try again." },
      });
    },
  });

  const onSubmit: SubmitHandler<SalesEditFormData> = async (data) => {
    mutate(data);
  };

  // The form opens once the current roles are known, so that saving never wipes them by accident
  const { data: roleRecords, isPending: rolesPending } =
    useGetList<StaffRoleRecord>(
      "staff_roles",
      {
        filter: { sales_id: record?.id },
        pagination: { page: 1, perPage: 20 },
      },
      { enabled: record?.id != null },
    );
  if (!record || rolesPending) return null;
  const formRecord = {
    ...record,
    roles: (roleRecords ?? []).map((row) => row.role),
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-8">
      <Card>
        <CardContent>
          <SimpleForm
            toolbar={<EditToolbar />}
            onSubmit={onSubmit as SubmitHandler<any>}
            record={formRecord}
          >
            <SaleEditTitle />
            <SalesInputs />
            <StaffRolesInput />
          </SimpleForm>
        </CardContent>
      </Card>
    </div>
  );
}

const SaleEditTitle = () => {
  const record = useRecordContext<Sale>();
  const translate = useTranslate();
  if (!record) return null;
  return (
    <h2 className="text-lg font-semibold mb-4">
      {translate("resources.sales.edit.title", {
        name: `${record.first_name} ${record.last_name}`,
      })}
    </h2>
  );
};
