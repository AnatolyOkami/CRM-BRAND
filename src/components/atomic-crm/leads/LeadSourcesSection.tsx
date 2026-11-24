import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
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
import type { LeadSource } from "../types";
import { nextSourcePosition, slugifySourceCode } from "./leadSourceUtils";
import { useLeadSources } from "./useLeadSources";

/** The list of sources of leads: the labels, the order and the activity are edited here. */
export const LeadSourcesSection = () => {
  const translate = useTranslate();
  const { sources } = useLeadSources();
  const [newLabel, setNewLabel] = useState("");
  const code = slugifySourceCode(newLabel);
  const exists = sources.some((source) => source.code === code);
  const { save, busy } = useSaveSource();

  const add = async () => {
    if (!code || exists) return;
    const saved = await save({
      code,
      label: newLabel.trim(),
      isActive: true,
      position: nextSourcePosition(sources),
    });
    if (saved) setNewLabel("");
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sources-title">
      <h2 id="sources-title" className="text-lg font-semibold">
        {translate("crm.lead_settings.sources")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {translate("crm.lead_settings.sources_hint")}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{translate("crm.lead_settings.label")}</TableHead>
            <TableHead>{translate("crm.lead_settings.position")}</TableHead>
            <TableHead>{translate("crm.lead_settings.active")}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.map((source) => (
            <SourceRow key={source.code} source={source} />
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="new-source" className="text-sm">
            {translate("crm.lead_settings.new_source")}
          </label>
          <Input
            id="new-source"
            value={newLabel}
            maxLength={80}
            onChange={(event) => setNewLabel(event.target.value)}
          />
        </div>
        <Button disabled={!code || exists || busy} onClick={() => void add()}>
          {translate("crm.lead_settings.add")}
        </Button>
        {exists && (
          <p className="text-sm text-destructive">
            {translate("crm.lead_settings.source_exists")}
          </p>
        )}
      </div>
    </section>
  );
};

const SourceRow = ({ source }: { source: LeadSource }) => {
  const translate = useTranslate();
  const [label, setLabel] = useState(source.label);
  const [position, setPosition] = useState(String(source.position));
  const [isActive, setIsActive] = useState(source.is_active);
  const { save, busy } = useSaveSource();
  const changed =
    label.trim() !== source.label ||
    Number(position) !== source.position ||
    isActive !== source.is_active;
  const valid = label.trim().length > 0 && Number.isFinite(Number(position));

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label={translate("crm.lead_settings.label")}
          value={label}
          maxLength={80}
          onChange={(event) => setLabel(event.target.value)}
        />
      </TableCell>
      <TableCell className="w-28">
        <Input
          aria-label={translate("crm.lead_settings.position")}
          type="number"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      </TableCell>
      <TableCell>
        <Checkbox
          aria-label={translate("crm.lead_settings.active")}
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          disabled={!changed || !valid || busy}
          onClick={() =>
            void save({
              code: source.code,
              label: label.trim(),
              isActive,
              position: Math.round(Number(position)),
            })
          }
        >
          {translate("crm.lead_settings.save")}
        </Button>
      </TableCell>
    </TableRow>
  );
};

const useSaveSource = () => {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [busy, setBusy] = useState(false);

  const save = async (
    params: Parameters<CrmDataProvider["saveLeadSource"]>[0],
  ) => {
    setBusy(true);
    try {
      await dataProvider.saveLeadSource(params);
      notify("crm.lead_settings.saved", { type: "success" });
      await queryClient.invalidateQueries({ queryKey: ["lead_sources"] });
      return true;
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      notify(describeCommandError(code).messageKey, {
        type: "error",
        messageArgs: { code },
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
};
