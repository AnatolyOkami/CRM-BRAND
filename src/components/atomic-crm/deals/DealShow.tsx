import { useMutation } from "@tanstack/react-query";
import { formatDistanceStrict } from "date-fns";
import { Archive, ArchiveRestore } from "lucide-react";
import {
  InfiniteListBase,
  ShowBase,
  useDataProvider,
  useLocaleState,
  useNotify,
  useRecordContext,
  useRedirect,
  useRefresh,
  useTranslate,
  useUpdate,
} from "ra-core";
import { DeleteButton } from "@/components/admin/delete-button";
import { EditButton } from "@/components/admin/edit-button";
import { ReferenceArrayField } from "@/components/admin/reference-array-field";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { formatCompanyDateTime, useCompanyTimeZone } from "../misc/companyTime";
import { getDateFnsLocale } from "../misc/RelativeDate";
import { DealNotificationBanner } from "../notifications/DealNotificationBanner";
import { NoteCreate } from "../notes/NoteCreate";
import { NotesIterator } from "../notes/NotesIterator";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { useGetSalesName } from "../sales/useGetSalesName";
import type { Deal } from "../types";
import { getReplyStatus } from "./boardUtils";
import { ContactList } from "./ContactList";
import { DealHistory } from "./DealHistory";
import { DealOrderBlock } from "./DealOrderBlock";
import {
  findDealLabel,
  formatDealCategories,
  formatISODateString,
  isISODateString,
} from "./dealUtils";

export const DealShow = ({ open, id }: { open: boolean; id?: string }) => {
  const redirect = useRedirect();
  const handleClose = () => {
    redirect("list", "deals");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="lg:max-w-4xl p-4 overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
        {id ? (
          <ShowBase id={id}>
            <DealShowContent />
          </ShowBase>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const DealShowContent = () => {
  const translate = useTranslate();
  const { dealStages, dealCategories, currency } = useConfigurationContext();
  const record = useRecordContext<Deal>();
  const [locale = "ru"] = useLocaleState();
  const timeZone = useCompanyTimeZone();
  const ownerName = useGetSalesName(record?.sales_id ?? undefined, {
    enabled: record?.sales_id != null,
  });
  if (!record) return null;
  const closingDate = record.expected_closing_date;
  const reply = getReplyStatus(record);

  return (
    <>
      <div className="space-y-2">
        <DealNotificationBanner dealId={record.id} />
        {record.archived_at ? <ArchivedTitle /> : null}
        <div className="flex-1">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <ReferenceField
                source="company_id"
                reference="companies"
                link="show"
              >
                <CompanyAvatar />
              </ReferenceField>
              <h2 className="text-xl font-semibold">{record.name}</h2>
            </div>
            <div className={`flex gap-2 ${record.archived_at ? "" : "pr-12"}`}>
              {record.archived_at ? (
                <>
                  <UnarchiveButton record={record} />
                  <DeleteButton />
                </>
              ) : (
                <>
                  <ArchiveButton record={record} />
                  <EditButton />
                </>
              )}
            </div>
          </div>

          <div className="flex gap-8 m-4">
            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.expected_closing_date")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm">
                  {closingDate == null
                    ? translate("resources.deals.no_closing_date")
                    : (formatISODateString(closingDate) ??
                      translate("resources.deals.invalid_date"))}
                </span>
                {isISODateString(closingDate) &&
                new Date(closingDate) < new Date() ? (
                  <Badge variant="destructive">
                    {translate("crm.common.past")}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.amount")}
              </span>
              <span className="text-sm">
                {record.amount == null
                  ? "—"
                  : record.amount.toLocaleString("ru-RU", {
                      style: "currency",
                      currency,
                      maximumFractionDigits: 0,
                    })}
              </span>
            </div>

            {!!record.categories?.length && (
              <div className="flex flex-col mr-10">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.categories")}
                </span>
                <span className="text-sm">
                  {formatDealCategories(dealCategories, record.categories)}
                </span>
              </div>
            )}

            <div className="flex flex-col mr-10">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.stage")}
              </span>
              <span className="text-sm">
                {findDealLabel(dealStages, record.stage)}
              </span>
            </div>
          </div>

          <div className="m-4 grid gap-4 sm:grid-cols-4">
            <DealFact
              label={translate("resources.deals.fields.source")}
              value={translate(`resources.deals.sources.${record.source}`, {
                _: record.source,
              })}
            />
            <DealFact
              label={translate("resources.deals.fields.received_at")}
              value={formatCompanyDateTime(
                record.received_at,
                locale,
                timeZone,
              )}
            />
            <DealFact
              label={translate("resources.deals.fields.sales_id")}
              value={
                record.sales_id == null
                  ? translate("crm.board.nobody")
                  : ownerName
              }
            />
            <DealFact
              label={translate("resources.deals.fields.first_response_due_at")}
              value={
                reply.kind === "replied"
                  ? translate("crm.board.replied")
                  : reply.kind === "overdue"
                    ? translate("crm.board.reply_overdue", {
                        time: formatDistanceStrict(reply.dueAt, new Date(), {
                          locale: getDateFnsLocale(locale),
                        }),
                      })
                    : reply.kind === "pending"
                      ? formatCompanyDateTime(reply.dueAt, locale, timeZone)
                      : "—"
              }
            />
            {record.contract_signed_at && (
              <DealFact
                label={translate("crm.order.contract")}
                value={translate("crm.order.contract_signed_on", {
                  date: new Date(
                    record.contract_signed_at + "T00:00:00",
                  ).toLocaleDateString(locale),
                })}
              />
            )}
            {record.contract_link && (
              <div className="flex flex-col">
                <span className="text-xs tracking-wide text-muted-foreground">
                  {translate("crm.order.contract_link")}
                </span>
                <a
                  href={record.contract_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm text-primary underline-offset-4 hover:underline"
                >
                  {record.contract_link}
                </a>
              </div>
            )}
            {record.lost_reason && (
              <DealFact
                label={translate("resources.deals.fields.lost_reason")}
                value={record.lost_reason}
              />
            )}
          </div>

          <div className="m-4 empty:hidden">
            <DealOrderBlock dealId={record.id} />
          </div>

          {!!record.contact_ids?.length && (
            <div className="m-4">
              <div className="flex flex-col min-h-12 mr-10">
                <span className="text-xs text-muted-foreground tracking-wide">
                  {translate("resources.deals.fields.contact_ids")}
                </span>
                <ReferenceArrayField
                  source="contact_ids"
                  reference="contacts_summary"
                >
                  <ContactList />
                </ReferenceArrayField>
              </div>
            </div>
          )}

          {record.description && (
            <div className="m-4 whitespace-pre-line">
              <span className="text-xs text-muted-foreground tracking-wide">
                {translate("resources.deals.fields.description")}
              </span>
              <p className="text-sm leading-6">{record.description}</p>
            </div>
          )}

          <div className="m-4">
            <Separator className="mb-4" />
            <InfiniteListBase
              resource="deal_notes"
              filter={{ deal_id: record.id }}
              sort={{ field: "date", order: "DESC" }}
              perPage={25}
              disableSyncWithLocation
              storeKey={false}
              empty={<NoteCreate reference={"deals"} />}
            >
              <NotesIterator reference="deals" />
            </InfiniteListBase>
          </div>

          <div className="m-4">
            <Separator className="mb-4" />
            <DealHistory dealId={record.id} />
          </div>
        </div>
      </div>
    </>
  );
};

const DealFact = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-xs tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm">{value}</span>
  </div>
);

const ArchivedTitle = () => {
  const translate = useTranslate();
  return (
    <div className="bg-orange-500 px-6 py-4">
      <h3 className="text-lg font-bold text-white">
        {translate("resources.deals.archived.title")}
      </h3>
    </div>
  );
};

const ArchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const [update] = useUpdate();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();
  const handleClick = () => {
    update(
      "deals",
      {
        id: record.id,
        data: { archived_at: new Date().toISOString() },
        previousData: record,
      },
      {
        onSuccess: () => {
          redirect("list", "deals");
          notify("resources.deals.archived.success", {
            type: "info",
            undoable: false,
          });
          refresh();
        },
        onError: () => {
          notify("resources.deals.archived.error", {
            type: "error",
          });
        },
      },
    );
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <Archive className="w-4 h-4" />
      {translate("resources.deals.archived.action")}
    </Button>
  );
};

const UnarchiveButton = ({ record }: { record: Deal }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const refresh = useRefresh();

  const { mutate } = useMutation({
    mutationFn: () => dataProvider.unarchiveDeal(record),
    onSuccess: () => {
      redirect("list", "deals");
      notify("resources.deals.unarchived.success", {
        type: "info",
        undoable: false,
      });
      refresh();
    },
    onError: () => {
      notify("resources.deals.unarchived.error", {
        type: "error",
      });
    },
  });

  const handleClick = () => {
    mutate();
  };

  return (
    <Button
      onClick={handleClick}
      size="sm"
      variant="outline"
      className="flex items-center gap-2 h-9"
    >
      <ArchiveRestore className="w-4 h-4" />
      {translate("resources.deals.unarchived.action")}
    </Button>
  );
};
