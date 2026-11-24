import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  secondary_emails?: string[];
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  secondary_emails?: string[];

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: number[];
  gender: string;
  sales_id?: Identifier;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  categories: string[];
  stage: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string | null;
  // null while the deal waits in the shared queue
  sales_id: Identifier | null;
  index: number;
  source: DealSource;
  received_at: string;
  first_response_due_at: string | null;
  first_responded_at: string | null;
  // optimistic lock used by the deal commands
  version: number;
  lost_reason?: string | null;
  is_historical?: boolean;
  // Contracts are no longer a step of the process; the data of old deals stays readable
  contract_signed_at?: string | null;
  contract_link?: string | null;
  // Leads that came through a partner link or the website
  partner_id?: Identifier | null;
  utm?: Record<string, string> | null;
} & Pick<RaRecord, "id">;

export type ProductionStage = "accepted" | "in-progress" | "ready";

/** An order of the workshop, one per deal. It holds no price and no contact of the customer. */
export type ProductionOrder = {
  deal_id: Identifier;
  stage: ProductionStage;
  product_name: string;
  instructions: string | null;
  due_date: string | null;
  customer_name: string;
  files_count: number;
  links_count: number;
  version: number;
  ready_cycle: number;
  ready_at: string | null;
  ready_by: Identifier | null;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type OrderMaterial = {
  order_id: Identifier;
  kind: "file" | "link";
  label: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
} & Pick<RaRecord, "id">;

/** A file already uploaded to the private bucket, ready to be attached to a handoff. */
export type UploadedOrderFile = {
  path: string;
  name: string;
  size: number;
  type: string;
};

export type OrderLink = { url: string; label: string };

export type NotificationEvent = {
  recipient_sales_id: Identifier;
  kind: "order_ready";
  order_id: Identifier;
  deal_id: Identifier;
  ready_cycle: number;
  payload: {
    order_number: number;
    customer_name: string;
    product_name: string;
  };
  created_at: string;
  opened_at: string | null;
  acknowledged_at: string | null;
} & Pick<RaRecord, "id">;

/** A code of lead_sources: the list is edited by the administrator, so it is not a closed union. */
export type DealSource = string;

/** A source of leads. The code is stored on deals, the label is what people read. */
export type LeadSource = {
  code: DealSource;
  label: string;
  is_active: boolean;
  position: number;
} & Pick<RaRecord, "id">;

/** A partner link (short public form) or the website connection that sends leads in. */
export type LeadPartner = {
  name: string;
  kind: "partner" | "website";
  source: DealSource;
  /** The code in the link of the form; it identifies the partner */
  code: string;
  is_active: boolean;
  created_at: string;
} & Pick<RaRecord, "id">;

export type StaffRole =
  "manager" | "sales_head" | "production_head" | "workshop" | "fulfillment";

export type StaffRoleRecord = {
  sales_id: Identifier;
  role: StaffRole;
} & Pick<RaRecord, "id">;

export type DealStageHistory = {
  deal_id: Identifier;
  event:
    | "created"
    | "claimed"
    | "stage"
    | "assigned"
    | "released"
    | "call"
    | "source";
  from_stage: string | null;
  to_stage: string | null;
  from_sales_id: Identifier | null;
  to_sales_id: Identifier | null;
  changed_by: Identifier | null;
  reason: string | null;
  created_at: string;
} & Pick<RaRecord, "id">;

/** Answer of the deal commands (claim, transition, assign, create). */
export type DealCommandResult = {
  order_id?: Identifier;
  order_stage?: ProductionStage;
  deal_id: Identifier;
  version: number;
  stage: string;
  sales_id: Identifier | null;
  index?: number;
  task_id?: Identifier | null;
  contact_id?: Identifier;
  replayed: boolean;
};

export type ManualDealData = {
  name: string;
  contact_id?: Identifier;
  new_contact?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
  };
  company_id?: Identifier | null;
  description?: string;
  source: DealSource;
  received_at?: string;
  categories?: string[];
  amount?: number | null;
  assign_to_me?: boolean;
};

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Task = {
  contact_id: Identifier;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
  created_at?: string;
  deal_id?: Identifier | null;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier | null;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type DealStage = LabeledValue;

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export type SearchResourceName =
  "companies" | "contacts" | "deals" | "tasks" | "contact_notes" | "deal_notes";

export type SearchResult = {
  resource: SearchResourceName;
  record_id: Identifier;
  title: string | null;
  subtitle: string | null;
  contact_id: Identifier | null;
  deal_id: Identifier | null;
  date: string | null;
  /** The searched fields, to show and highlight where the query matched. */
  content: string | null;
};

export type DealPayment = {
  deal_id: Identifier;
  kind: "payment" | "refund";
  amount: number;
  paid_at: string;
  comment: string | null;
  currency: string;
  created_by: Identifier | null;
  created_at: string;
} & Pick<RaRecord, "id">;

/** A row of the analytics table: the money of one deal. */
export type DealFinanceRow = {
  name: string;
  stage: string;
  sales_id: Identifier | null;
  customer_name: string;
  expected_closing_date: string | null;
  amount: number | null;
  paid: number;
  // null while the amount of the deal is unknown, negative for an overpayment
  balance: number | null;
  order_id: Identifier | null;
  order_stage: ProductionStage | null;
  order_due_date: string | null;
} & Pick<RaRecord, "id">;

export type FinanceSummary = {
  total_count: number;
  in_work_count: number;
  in_work_amount: number;
  in_work_without_amount: number;
  paid: number;
  remaining: number;
  overpaid: number;
};
