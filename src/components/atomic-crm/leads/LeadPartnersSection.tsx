import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useGetList, useNotify, useTranslate } from "ra-core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { describeCommandError } from "../deals/boardUtils";
import { DealCommandError } from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { LeadPartner } from "../types";
import {
  PartnerSecretDialog,
  type PartnerSecretInfo,
} from "./PartnerSecretDialog";
import { partnerFormUrl } from "./partnerLinks";
import { useLeadSources } from "./useLeadSources";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** Partner links and website connections: who may send leads in, and where their leads are counted. */
export const LeadPartnersSection = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { sources, labelOf } = useLeadSources();
  const { data: partners = [] } = useGetList<LeadPartner>("lead_partners", {
    pagination: { page: 1, perPage: 200 },
    sort: { field: "id", order: "ASC" },
  });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LeadPartner["kind"]>("partner");
  const [source, setSource] = useState("partner");
  const [secret, setSecret] = useState<PartnerSecretInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["lead_partners"] });
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      notify(describeCommandError(code).messageKey, {
        type: "error",
        messageArgs: { code },
      });
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const saved = await dataProvider.saveLeadPartner({
        id: null,
        name: name.trim(),
        kind,
        source,
        isActive: true,
      });
      setName("");
      if (saved.secret) {
        setSecret({
          name: name.trim(),
          code: saved.code,
          secret: saved.secret,
        });
      }
      notify("crm.lead_settings.saved", { type: "success" });
    });

  const toggle = (partner: LeadPartner) =>
    run(async () => {
      await dataProvider.saveLeadPartner({
        id: partner.id,
        name: partner.name,
        kind: partner.kind,
        source: partner.source,
        isActive: !partner.is_active,
      });
    });

  const rotate = (partner: LeadPartner) =>
    run(async () => {
      const value = await dataProvider.rotateLeadPartnerSecret(partner.id);
      setSecret({ name: partner.name, code: partner.code, secret: value });
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("crm.lead_settings.copied", { type: "success" });
    } catch {
      notify("crm.lead_settings.copy_failed", { type: "warning" });
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="partners-title">
      <h2 id="partners-title" className="text-lg font-semibold">
        {translate("crm.lead_settings.partners")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {translate("crm.lead_settings.partners_hint")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{translate("crm.lead_settings.name")}</TableHead>
            <TableHead>{translate("crm.lead_settings.kind")}</TableHead>
            <TableHead>{translate("crm.lead_settings.counts_as")}</TableHead>
            <TableHead>{translate("crm.lead_settings.access")}</TableHead>
            <TableHead>{translate("crm.lead_settings.active")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((partner) => (
            <TableRow key={partner.id}>
              <TableCell>{partner.name}</TableCell>
              <TableCell>
                {translate(`crm.lead_settings.kinds.${partner.kind}`)}
              </TableCell>
              <TableCell>{labelOf(partner.source)}</TableCell>
              <TableCell className="flex flex-wrap gap-2">
                {partner.kind === "partner" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(partnerFormUrl(partner.code))}
                  >
                    {translate("crm.lead_settings.copy_link")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void rotate(partner)}
                  >
                    {translate("crm.lead_settings.new_secret")}
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <Checkbox
                  aria-label={translate("crm.lead_settings.active")}
                  checked={partner.is_active}
                  disabled={busy}
                  onCheckedChange={() => void toggle(partner)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-partner" className="text-sm">
            {translate("crm.lead_settings.name")}
          </label>
          <Input
            id="new-partner"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-partner-kind" className="text-sm">
            {translate("crm.lead_settings.kind")}
          </label>
          <select
            id="new-partner-kind"
            className={selectClass}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as LeadPartner["kind"];
              setKind(next);
              setSource(next === "website" ? "website" : "partner");
            }}
          >
            <option value="partner">
              {translate("crm.lead_settings.kinds.partner")}
            </option>
            <option value="website">
              {translate("crm.lead_settings.kinds.website")}
            </option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="new-partner-source" className="text-sm">
            {translate("crm.lead_settings.counts_as")}
          </label>
          <select
            id="new-partner-source"
            className={selectClass}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            {sources
              .filter((item) => item.is_active)
              .map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
          </select>
        </div>
        <Button disabled={!name.trim() || busy} onClick={() => void create()}>
          {translate("crm.lead_settings.add")}
        </Button>
      </div>
      <PartnerSecretDialog info={secret} onClose={() => setSecret(null)} />
    </section>
  );
};
