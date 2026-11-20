import { useQueryClient } from "@tanstack/react-query";
import { useDataProvider, useNotify, useTranslate } from "ra-core";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  DealCommandError,
  newRequestKey,
} from "../providers/commons/dealCommands";
import type { CrmDataProvider } from "../providers/types";
import type { Deal, OrderLink, UploadedOrderFile } from "../types";
import { describeCommandError } from "./boardUtils";
import { addOrderLink, validateHandoffForm } from "./handoffUtils";

/**
 * The handoff form. Cancelling, or an error, leaves the deal in its stage. The form keeps one
 * request key, so a double click or a retry gives one order.
 */
export const HandoffDialog = ({
  deal,
  onClose,
}: {
  deal: Deal | null;
  onClose: () => void;
}) => (
  <Dialog open={deal != null} onOpenChange={(isOpen) => !isOpen && onClose()}>
    <DialogContent className="max-h-9/10 overflow-y-auto lg:max-w-2xl">
      {deal && <HandoffForm deal={deal} onClose={onClose} />}
    </DialogContent>
  </Dialog>
);

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const HandoffForm = ({
  deal,
  onClose,
}: {
  deal: Deal;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const queryClient = useQueryClient();
  const requestKey = useRef(newRequestKey());
  const fileInput = useRef<HTMLInputElement>(null);

  const [productName, setProductName] = useState(deal.name);
  const [instructions, setInstructions] = useState(deal.description ?? "");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<UploadedOrderFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [links, setLinks] = useState<OrderLink[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = validateHandoffForm({ productName });

  const onFilesPicked = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setUploading(true);
    for (const file of Array.from(picked)) {
      try {
        const uploaded = await dataProvider.uploadOrderFile(deal.id, file);
        setFiles((current) => [...current, uploaded]);
      } catch {
        notify("crm.handoff.upload_error", {
          type: "error",
          messageArgs: { name: file.name },
        });
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onAddLink = () => {
    const result = addOrderLink(links, linkUrl, linkLabel);
    if (result.error) {
      setLinkError(
        result.error === "invalid"
          ? "crm.handoff.link_invalid"
          : "crm.handoff.link_duplicate",
      );
      return;
    }
    setLinks(result.links);
    setLinkUrl("");
    setLinkLabel("");
    setLinkError(null);
  };

  const onSubmit = async () => {
    setTouched(true);
    if (errors.productName || submitting || uploading) return;
    setSubmitting(true);
    try {
      await dataProvider.handoffDeal({
        dealId: deal.id,
        expectedVersion: deal.version,
        productName: productName.trim(),
        instructions: instructions.trim() || undefined,
        dueDate: dueDate || null,
        files,
        links,
        requestKey: requestKey.current,
      });
      notify("crm.handoff.done", { type: "success" });
      await Promise.all(
        [
          "deals",
          "production_orders",
          "production_order_materials",
          "deal_stage_history",
        ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      onClose();
    } catch (error: unknown) {
      const code = error instanceof DealCommandError ? error.code : "unknown";
      const view = describeCommandError(code);
      notify(code === "unknown" ? "crm.handoff.error" : view.messageKey, {
        type: view.conflict ? "warning" : "error",
        messageArgs: { code },
      });
      if (view.conflict) {
        // somebody changed the deal: show the real state instead of a stale form
        await queryClient.invalidateQueries({ queryKey: ["deals"] });
        onClose();
      }
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{translate("crm.handoff.title")}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handoff-product">
            {translate("crm.handoff.product_name")} *
          </Label>
          <Input
            id="handoff-product"
            value={productName}
            placeholder={translate("crm.handoff.product_placeholder")}
            aria-invalid={touched && !!errors.productName}
            onChange={(event) => setProductName(event.target.value)}
          />
          {touched && errors.productName && (
            <p className="text-xs text-destructive">
              {translate(errors.productName)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="handoff-instructions">
            {translate("crm.handoff.instructions")}
          </Label>
          <Textarea
            id="handoff-instructions"
            rows={4}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-1/2">
          <Label htmlFor="handoff-due">
            {translate("crm.handoff.due_date")}
          </Label>
          <Input
            id="handoff-due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {translate("crm.handoff.optional_materials")}
        </p>

        <fieldset className="flex flex-col gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            {translate("crm.handoff.files")}
          </legend>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("crm.handoff.files_none")}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {translate("crm.handoff.files_count", { count: files.length })}
              </p>
              <ul className="flex flex-col gap-1">
                {files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate">
                      {file.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {formatSize(file.size)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item.path !== file.path),
                        )
                      }
                    >
                      {translate("crm.handoff.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              data-testid="handoff-file-input"
              onChange={(event) => void onFilesPicked(event.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading
                ? translate("crm.handoff.uploading")
                : translate("crm.handoff.add_files")}
            </Button>
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            {translate("crm.handoff.links")}
          </legend>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {translate("crm.handoff.links_none")}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">
                {translate("crm.handoff.links_count", { count: links.length })}
              </p>
              <ul className="flex flex-col gap-1">
                {links.map((link) => (
                  <li
                    key={link.url}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate">
                      {link.label || link.url}
                      {link.label && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {link.url}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setLinks((current) =>
                          current.filter((item) => item.url !== link.url),
                        )
                      }
                    >
                      {translate("crm.handoff.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
            <Input
              aria-label={translate("crm.handoff.link_url")}
              placeholder={translate("crm.handoff.link_url")}
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddLink();
                }
              }}
            />
            <Input
              aria-label={translate("crm.handoff.link_label")}
              placeholder={translate("crm.handoff.link_label")}
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddLink}
            >
              {translate("crm.handoff.link_add")}
            </Button>
          </div>
          {linkError && (
            <p className="text-xs text-destructive">{translate(linkError)}</p>
          )}
        </fieldset>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          {translate("ra.action.cancel")}
        </Button>
        <Button
          onClick={() => void onSubmit()}
          disabled={submitting || uploading}
        >
          {translate("crm.handoff.submit")}
        </Button>
      </DialogFooter>
    </>
  );
};
