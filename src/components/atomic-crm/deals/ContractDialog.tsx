import { useTranslate } from "ra-core";
import { useState } from "react";
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

import { toLocalInputValue } from "./manualDeal";
import { isHttpUrl } from "./handoffUtils";

export interface ContractData {
  signedAt: string;
  link?: string;
}

/** Fixes the signing of the contract: the date (today by default) and, if there is one, a link. */
export const ContractDialog = ({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (data: ContractData) => void;
  onCancel: () => void;
}) => (
  <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
    <DialogContent>
      {open && <ContractForm onConfirm={onConfirm} onCancel={onCancel} />}
    </DialogContent>
  </Dialog>
);

const ContractForm = ({
  onConfirm,
  onCancel,
}: {
  onConfirm: (data: ContractData) => void;
  onCancel: () => void;
}) => {
  const translate = useTranslate();
  const [signedAt, setSignedAt] = useState(() =>
    toLocalInputValue(new Date()).slice(0, 10),
  );
  const [link, setLink] = useState("");
  const trimmed = link.trim();
  const linkInvalid = trimmed !== "" && !isHttpUrl(trimmed);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{translate("crm.contract_dialog.title")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contract-signed-at">
            {translate("crm.contract_dialog.signed_at")}
          </Label>
          <Input
            id="contract-signed-at"
            type="date"
            value={signedAt}
            onChange={(event) => setSignedAt(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contract-link">
            {translate("crm.contract_dialog.link")}
          </Label>
          <Input
            id="contract-link"
            type="url"
            value={link}
            placeholder={translate("crm.contract_dialog.link_placeholder")}
            aria-invalid={linkInvalid}
            onChange={(event) => setLink(event.target.value)}
          />
          {linkInvalid && (
            <p className="text-xs text-destructive">
              {translate("crm.handoff.link_invalid")}
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {translate("crm.contract_dialog.cancel")}
        </Button>
        <Button
          disabled={!signedAt || linkInvalid}
          onClick={() =>
            onConfirm({ signedAt, link: trimmed === "" ? undefined : trimmed })
          }
        >
          {translate("crm.contract_dialog.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
};
