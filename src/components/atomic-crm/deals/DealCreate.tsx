import { useQueryClient } from "@tanstack/react-query";
import {
  Form,
  required,
  useDataProvider,
  useGetRecordRepresentation,
  useNotify,
  useRedirect,
  useTranslate,
} from "ra-core";
import { useRef, useState } from "react";
import { AutocompleteArrayInput } from "@/components/admin/autocomplete-array-input";
import { AutocompleteInput } from "@/components/admin/autocomplete-input";
import { BooleanInput } from "@/components/admin/boolean-input";
import { DateTimeInput } from "@/components/admin/date-time-input";
import { NumberInput } from "@/components/admin/number-input";
import { ReferenceInput } from "@/components/admin/reference-input";
import { SelectInput } from "@/components/admin/select-input";
import { TextInput } from "@/components/admin/text-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { AutocompleteCompanyInput } from "../companies/AutocompleteCompanyInput";
import { contactOptionText } from "../misc/ContactOption";
import {
  DealCommandError,
  newRequestKey,
} from "../providers/commons/dealCommands";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import { describeCommandError } from "./boardUtils";
import {
  DEAL_SOURCES,
  toLocalInputValue,
  toManualDealData,
  validateManualDeal,
  type ContactMode,
  type ManualDealFormValues,
} from "./manualDeal";

export const DealCreate = ({ open }: { open: boolean }) => {
  const redirect = useRedirect();
  const handleClose = () => redirect("/deals");

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="max-h-9/10 overflow-y-auto lg:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            <TitleText />
          </DialogTitle>
        </DialogHeader>
        {open && <ManualDealForm onDone={handleClose} />}
      </DialogContent>
    </Dialog>
  );
};

const TitleText = () => {
  const translate = useTranslate();
  return <>{translate("crm.manual_deal.title")}</>;
};

const ManualDealForm = ({ onDone }: { onDone: () => void }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const { dealCategories } = useConfigurationContext();
  const getContactName = useGetRecordRepresentation("contacts");
  const [mode, setMode] = useState<ContactMode>("existing");
  const [submitting, setSubmitting] = useState(false);
  // One key for the whole dialog: a double click creates one deal
  const requestKey = useRef(newRequestKey());
  const [defaultReceivedAt] = useState(() => toLocalInputValue(new Date()));

  const onSubmit = async (values: Record<string, unknown>) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await dataProvider.createManualDeal(
        toManualDealData(values as unknown as ManualDealFormValues, mode),
        requestKey.current,
      );
      notify("crm.manual_deal.created", { type: "success" });
      await Promise.all(
        ["deals", "tasks", "contacts", "contacts_summary"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onDone();
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(code === "unknown" ? "crm.manual_deal.error" : view.messageKey, {
        type: "error",
        messageArgs: { code },
      });
      setSubmitting(false);
    }
  };

  return (
    <Form
      className="flex flex-col gap-4"
      defaultValues={{
        source: "phone",
        received_at: defaultReceivedAt,
        assign_to_me: true,
      }}
      validate={(values) =>
        validateManualDeal(values as Partial<ManualDealFormValues>, mode)
      }
      onSubmit={onSubmit}
    >
      <TextInput
        source="name"
        label="crm.manual_deal.name"
        placeholder={translate("crm.manual_deal.name_placeholder")}
        validate={required()}
        helperText={false}
      />

      <fieldset className="flex flex-col gap-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">
          {translate("crm.manual_deal.customer")}
        </legend>
        <div className="flex gap-2">
          {(["existing", "new"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? "default" : "outline"}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {translate(`crm.manual_deal.${value}_contact`)}
            </Button>
          ))}
        </div>
        {mode === "existing" ? (
          <ReferenceInput source="contact_id" reference="contacts_summary">
            <AutocompleteInput
              label="crm.manual_deal.choose_contact"
              optionText={contactOptionText}
              inputText={getContactName}
              helperText={false}
            />
          </ReferenceInput>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              source="first_name"
              label="crm.manual_deal.first_name"
              helperText={false}
            />
            <TextInput
              source="last_name"
              label="crm.manual_deal.last_name"
              helperText={false}
            />
            <TextInput
              source="phone"
              label="crm.manual_deal.phone"
              type="tel"
              helperText={false}
            />
            <TextInput
              source="email"
              label="crm.manual_deal.email"
              type="email"
              helperText={false}
            />
          </div>
        )}
        <ReferenceInput source="company_id" reference="companies">
          <AutocompleteCompanyInput
            label="resources.deals.fields.company_id"
            modal
          />
        </ReferenceInput>
      </fieldset>

      <TextInput
        source="description"
        label="crm.manual_deal.description"
        multiline
        rows={3}
        helperText={false}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput
          source="source"
          label="crm.manual_deal.source"
          choices={DEAL_SOURCES.map((value) => ({
            id: value,
            name: translate(`resources.deals.sources.${value}`),
          }))}
          validate={required()}
          helperText={false}
        />
        <DateTimeInput
          source="received_at"
          label="crm.manual_deal.received_at"
          validate={required()}
          helperText={false}
        />
        <AutocompleteArrayInput
          source="categories"
          label="crm.manual_deal.categories"
          choices={dealCategories}
          optionText="label"
          optionValue="value"
          helperText={false}
        />
        <NumberInput
          source="amount"
          label="crm.manual_deal.amount"
          helperText={false}
        />
      </div>

      <BooleanInput
        source="assign_to_me"
        label="crm.manual_deal.assign_to_me"
        helperText="crm.manual_deal.assign_to_me_help"
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          {translate("ra.action.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {translate("crm.manual_deal.submit")}
        </Button>
      </div>
    </Form>
  );
};
