import { useTranslate } from "ra-core";
import { useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { newRequestKey } from "../providers/commons/dealCommands";
import {
  readUtm,
  submitLead,
  validateLeadForm,
  type LeadFormValues,
} from "./leadForm";

type Status =
  | { kind: "editing" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "failed"; error: string };

/**
 * The short public form of an advertising partner. It needs no sign in: the code in the link
 * identifies the partner, the server stores the lead in the first column of the board.
 */
export const PartnerLeadForm = () => {
  const translate = useTranslate();
  const { code = "" } = useParams();
  const [searchParams] = useSearchParams();
  // One id per opening of the form: pressing the button twice sends the same lead
  const submissionId = useRef(newRequestKey());
  const [values, setValues] = useState<LeadFormValues>({
    name: "",
    contact: "",
    description: "",
  });
  const [robotField, setRobotField] = useState("");
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "editing" });
  const errors = validateLeadForm(values);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0 || status.kind === "sending") return;
    setStatus({ kind: "sending" });
    const result = await submitLead({
      ...values,
      code,
      submissionId: submissionId.current,
      utm: readUtm(searchParams, new URLSearchParams(window.location.search)),
      website: robotField,
    });
    setStatus(
      result.ok ? { kind: "sent" } : { kind: "failed", error: result.error },
    );
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-secondary p-4 sm:items-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{translate("crm.lead_form.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {status.kind === "sent" ? (
            <p role="status" className="text-sm">
              {translate("crm.lead_form.thanks")}
            </p>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => void onSubmit(event)}
              noValidate
            >
              <p className="text-sm text-muted-foreground">
                {translate("crm.lead_form.intro")}
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-name">
                  {translate("crm.lead_form.name")}
                </Label>
                <Input
                  id="lead-name"
                  value={values.name}
                  autoComplete="name"
                  maxLength={120}
                  onChange={(e) =>
                    setValues({ ...values, name: e.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-contact">
                  {translate("crm.lead_form.contact")}
                </Label>
                <Input
                  id="lead-contact"
                  value={values.contact}
                  autoComplete="tel"
                  maxLength={200}
                  placeholder={translate("crm.lead_form.contact_placeholder")}
                  aria-invalid={touched && errors.contact != null}
                  onChange={(e) =>
                    setValues({ ...values, contact: e.target.value })
                  }
                />
                {touched && errors.contact && (
                  <p className="text-sm text-destructive">
                    {translate(errors.contact)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead-description">
                  {translate("crm.lead_form.description")}
                </Label>
                <Textarea
                  id="lead-description"
                  value={values.description}
                  rows={4}
                  maxLength={4000}
                  placeholder={translate(
                    "crm.lead_form.description_placeholder",
                  )}
                  onChange={(e) =>
                    setValues({ ...values, description: e.target.value })
                  }
                />
              </div>
              {/* A trap for robots: people never see or fill this field */}
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
              >
                <label htmlFor="lead-website">Website</label>
                <input
                  id="lead-website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={robotField}
                  onChange={(e) => setRobotField(e.target.value)}
                />
              </div>
              {status.kind === "failed" && (
                <p role="alert" className="text-sm text-destructive">
                  {translate(
                    status.error === "partner_not_found"
                      ? "crm.lead_form.link_invalid"
                      : "crm.lead_form.error",
                  )}
                </p>
              )}
              <Button type="submit" disabled={status.kind === "sending"}>
                {translate("crm.lead_form.send")}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

PartnerLeadForm.path = "/lead/:code";
