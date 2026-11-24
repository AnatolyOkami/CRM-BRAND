import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { config } from "../root/config";
import { intakeEndpointUrl } from "./partnerLinks";

export interface PartnerSecretInfo {
  name: string;
  code: string;
  secret: string;
}

/**
 * Shows the signing secret of a website connection once, with what the developer of the site
 * needs: the address, the body, the header with the signature.
 */
export const PartnerSecretDialog = ({
  info,
  onClose,
}: {
  info: PartnerSecretInfo | null;
  onClose: () => void;
}) => {
  const translate = useTranslate();
  const endpoint = intakeEndpointUrl(config.supabaseUrl);

  return (
    <Dialog open={info != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-9/10 overflow-y-auto lg:max-w-2xl">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle>
                {translate("crm.lead_settings.secret_title", {
                  name: info.name,
                })}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-destructive">
              {translate("crm.lead_settings.secret_warning")}
            </p>
            <dl className="grid gap-2 text-sm">
              <dt className="font-medium">
                {translate("crm.lead_settings.secret")}
              </dt>
              <dd>
                <code className="break-all rounded bg-muted px-2 py-1">
                  {info.secret}
                </code>
              </dd>
              <dt className="font-medium">
                {translate("crm.lead_settings.endpoint")}
              </dt>
              <dd>
                <code className="break-all rounded bg-muted px-2 py-1">
                  POST {endpoint}
                </code>
              </dd>
              <dt className="font-medium">
                {translate("crm.lead_settings.request_format")}
              </dt>
              <dd>
                <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
                  {`Content-Type: application/json
apikey: <publishable key of the project>
X-Signature: sha256=<hex HMAC-SHA256 of the raw body, key = secret>

{
  "code": "${info.code}",
  "submission_id": "<unique id of the submission, 8-100 chars>",
  "name": "...", "contact": "...", "description": "...",
  "utm": { "utm_source": "...", "utm_campaign": "..." }
}`}
                </pre>
              </dd>
            </dl>
            <p className="text-sm text-muted-foreground">
              {translate("crm.lead_settings.request_hint")}
            </p>
            <DialogFooter>
              <Button onClick={onClose}>
                {translate("crm.lead_settings.close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
