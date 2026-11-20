import { Draggable } from "@hello-pangea/dnd";
import { formatDistanceStrict } from "date-fns";
import { Clock, MoreVertical, UserCheck } from "lucide-react";
import {
  RecordContextProvider,
  useGetList,
  useGetManyAggregate,
  useLocaleState,
  useRedirect,
  useTranslate,
  type Identifier,
} from "ra-core";
import { ReferenceField } from "@/components/admin/reference-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CompanyAvatar } from "../companies/CompanyAvatar";
import { formatCompanyDateTime, useCompanyTimeZone } from "../misc/companyTime";
import { getDateFnsLocale } from "../misc/RelativeDate";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { useGetSalesName } from "../sales/useGetSalesName";
import { OrderIndicators } from "../production/OrderIndicators";
import type {
  Contact,
  Deal,
  ProductionOrder,
  StaffRoleRecord,
  Task,
} from "../types";
import { getReplyStatus } from "./boardUtils";
import { formatDealCategories } from "./dealUtils";
import type { useDealBoardCommands } from "./useDealBoardCommands";

type Commands = ReturnType<typeof useDealBoardCommands>;

export interface DealCardViewer {
  salesId?: Identifier;
  isHead: boolean;
  canSell: boolean;
}

export const DealCard = ({
  deal,
  index,
  nextTask,
  order,
  commands,
  viewer,
}: {
  deal: Deal;
  index: number;
  nextTask?: Task;
  order?: ProductionOrder;
  commands: Commands;
  viewer: DealCardViewer;
}) => {
  if (!deal) return null;

  return (
    <Draggable
      draggableId={String(deal.id)}
      index={index}
      isDragDisabled={commands.busy || !viewer.canSell}
    >
      {(provided, snapshot) => (
        <DealCardContent
          provided={provided}
          snapshot={snapshot}
          deal={deal}
          nextTask={nextTask}
          order={order}
          commands={commands}
          viewer={viewer}
        />
      )}
    </Draggable>
  );
};

export const DealCardContent = ({
  provided,
  snapshot,
  deal,
  nextTask,
  order,
  commands,
  viewer,
}: {
  provided?: any;
  snapshot?: any;
  deal: Deal;
  nextTask?: Task;
  order?: ProductionOrder;
  commands?: Commands;
  viewer?: DealCardViewer;
}) => {
  const { dealCategories, currency } = useConfigurationContext();
  const translate = useTranslate();
  const [locale = "ru"] = useLocaleState();
  const redirect = useRedirect();
  const timeZone = useCompanyTimeZone();
  const handleClick = () => {
    redirect(`/deals/${deal.id}/show`, undefined, undefined, undefined, {
      _scrollToTop: false,
    });
  };

  const firstContactId = deal.contact_ids?.[0];
  const { data: contacts } = useGetManyAggregate<Contact>(
    "contacts",
    { ids: firstContactId != null ? [firstContactId] : [] },
    { enabled: firstContactId != null },
  );
  const customer = contacts?.[0]
    ? `${contacts[0].first_name ?? ""} ${contacts[0].last_name ?? ""}`.trim()
    : "";
  const ownerName = useGetSalesName(deal.sales_id ?? undefined, {
    enabled: deal.sales_id != null,
  });

  const reply = getReplyStatus(deal);
  const amount =
    deal.amount != null && deal.amount > 0
      ? deal.amount.toLocaleString("ru-RU", {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        })
      : null;

  return (
    <div
      className="cursor-pointer"
      {...provided?.draggableProps}
      {...provided?.dragHandleProps}
      ref={provided?.innerRef}
      onClick={handleClick}
    >
      <RecordContextProvider value={deal}>
        <Card
          className={`py-3 transition-all duration-200 ${
            snapshot?.isDragging
              ? "opacity-90 transform rotate-1 shadow-lg"
              : "shadow-sm hover:shadow-md"
          } ${reply.kind === "overdue" ? "border-destructive/60" : ""}`}
        >
          <CardContent className="flex flex-col gap-1.5 px-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {customer || deal.name}
                </p>
                {customer && (
                  <p className="line-clamp-2 text-sm">{deal.name}</p>
                )}
              </div>
              {deal.company_id != null && (
                <ReferenceField
                  source="company_id"
                  reference="companies"
                  link={false}
                >
                  <CompanyAvatar width={20} height={20} />
                </ReferenceField>
              )}
              {commands && viewer && (
                <CardMenu deal={deal} commands={commands} viewer={viewer} />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline">
                {translate(`resources.deals.sources.${deal.source}`, {
                  _: deal.source,
                })}
              </Badge>
              {deal.categories?.length ? (
                <span className="text-xs text-muted-foreground">
                  {formatDealCategories(dealCategories, deal.categories)}
                </span>
              ) : null}
              {amount && <span className="text-xs font-medium">{amount}</span>}
            </div>

            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {translate("crm.board.received", {
                time: formatCompanyDateTime(deal.received_at, locale, timeZone),
              })}
            </p>
            <ReplyBadge reply={reply} locale={locale} timeZone={timeZone} />

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 truncate">
                <UserCheck className="h-3 w-3" />
                {deal.sales_id == null
                  ? translate("crm.board.nobody")
                  : ownerName}
              </span>
              {deal.sales_id == null && viewer?.canSell && commands && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-xs"
                  disabled={commands.busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    commands.takeDeal(deal);
                  }}
                >
                  {translate("crm.board.take")}
                </Button>
              )}
            </div>

            {order && <OrderIndicators order={order} />}

            <p className="truncate text-xs text-muted-foreground">
              {nextTask
                ? `${translate("crm.board.next_action")}: ${nextTask.text}`
                : translate("crm.board.no_next_action")}
            </p>
          </CardContent>
        </Card>
      </RecordContextProvider>
    </div>
  );
};

const ReplyBadge = ({
  reply,
  locale,
  timeZone,
}: {
  reply: ReturnType<typeof getReplyStatus>;
  locale: string;
  timeZone: string;
}) => {
  const translate = useTranslate();
  if (reply.kind === "overdue") {
    return (
      <Badge variant="destructive" className="w-fit">
        {translate("crm.board.reply_overdue", {
          time: formatDistanceStrict(reply.dueAt, new Date(), {
            locale: getDateFnsLocale(locale),
          }),
        })}
      </Badge>
    );
  }
  if (reply.kind === "pending") {
    return (
      <Badge variant="secondary" className="w-fit">
        {translate("crm.board.reply_by", {
          time: formatCompanyDateTime(reply.dueAt, locale, timeZone),
        })}
      </Badge>
    );
  }
  return null;
};

const CardMenu = ({
  deal,
  commands,
  viewer,
}: {
  deal: Deal;
  commands: Commands;
  viewer: DealCardViewer;
}) => {
  const translate = useTranslate();
  const { dealStages } = useConfigurationContext();
  if (!viewer.canSell) return null;

  const isOwner = deal.sales_id != null && deal.sales_id === viewer.salesId;
  const canRelease =
    deal.sales_id != null &&
    (isOwner || viewer.isHead) &&
    ["opportunity", "to-contact"].includes(deal.stage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 h-6 w-6 shrink-0"
            aria-label={translate("crm.board.move")}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {translate("crm.board.move_to")}
          </DropdownMenuLabel>
          {dealStages
            .filter((stage) => stage.value !== deal.stage)
            .map((stage) => (
              <DropdownMenuItem
                key={stage.value}
                onClick={() => commands.moveDeal(deal, stage.value)}
              >
                {stage.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
        {canRelease && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => commands.releaseDeal(deal)}>
              {translate("crm.board.release")}
            </DropdownMenuItem>
          </>
        )}
        {viewer.isHead && !["won", "lost"].includes(deal.stage) && (
          <AssignItems deal={deal} commands={commands} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Mounted only while the menu is open: the people who sell are loaded on demand
const AssignItems = ({
  deal,
  commands,
}: {
  deal: Deal;
  commands: Commands;
}) => {
  const translate = useTranslate();
  const { data: roles } = useGetList<StaffRoleRecord>("staff_roles", {
    filter: { "role@in": "(manager,sales_head)" },
    pagination: { page: 1, perPage: 200 },
  });
  const { data: sales } = useGetList<{
    id: Identifier;
    first_name: string;
    last_name: string;
    disabled?: boolean;
  }>("sales", { pagination: { page: 1, perPage: 200 } });

  const sellerIds = new Set((roles ?? []).map((role) => role.sales_id));
  const sellers = (sales ?? []).filter(
    (person) => sellerIds.has(person.id) && !person.disabled,
  );
  if (sellers.length === 0) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{translate("crm.board.assign")}</DropdownMenuLabel>
        {sellers
          .filter((person) => person.id !== deal.sales_id)
          .map((person) => (
            <DropdownMenuItem
              key={person.id}
              onClick={() => commands.assignDeal(deal, person.id)}
            >
              {person.first_name} {person.last_name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuGroup>
    </>
  );
};
