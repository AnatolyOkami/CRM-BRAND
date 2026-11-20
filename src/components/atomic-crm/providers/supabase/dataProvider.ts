import { supabaseDataProvider } from "ra-supabase-core";
import {
  HttpError,
  withLifecycleCallbacks,
  type DataProvider,
  type GetListParams,
  type Identifier,
  type ResourceCallbacks,
} from "ra-core";
import type {
  ContactNote,
  Deal,
  DealCommandResult,
  DealNote,
  FinanceSummary,
  ManualDealData,
  NotificationEvent,
  StaffRole,
  UploadedOrderFile,
  RAFile,
  Sale,
  SalesFormData,
  SearchResourceName,
  SearchResult,
  SignUpData,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { ATTACHMENTS_BUCKET } from "../commons/attachments";
import {
  DealCommandError,
  newRequestKey,
  type AssignDealParams,
  type FinanceSummaryArgs,
  type HandoffParams,
  type OrderTransitionResult,
  type PaymentParams,
  type TransitionDealParams,
  type TransitionOrderParams,
} from "../commons/dealCommands";
import { config } from "../../root/config";
import { getIsInitialized } from "./authProvider";
import { searchDealCategories } from "./searchDealCategories";
import { getSupabaseClient } from "./supabase";

const getBaseDataProvider = () =>
  supabaseDataProvider({
    instanceUrl: config.supabaseUrl!,
    apiKey: config.supabasePublishableKey!,
    supabaseClient: getSupabaseClient(),
    sortOrder: "asc,desc.nullslast" as any,
  });

const processCompanyLogo = async (params: any) => {
  const logo = params.data.logo;

  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

const ORDER_FILES_BUCKET = "order-files";

// Runs a deal command in the database. The database answers with HTTP 4xx and a code such as
// deal_already_assigned, which is turned into a DealCommandError.
const callDealCommand = async (
  name: string,
  args: Record<string, unknown>,
): Promise<DealCommandResult> => {
  const { data, error, status } = await getSupabaseClient().rpc(name, args);
  if (error) {
    throw new DealCommandError(error.message, status);
  }
  return data as DealCommandResult;
};

const getDataProviderWithCustomMethods = () => {
  const baseDataProvider = getBaseDataProvider();

  return {
    ...baseDataProvider,
    async getList(resource: string, params: GetListParams) {
      if (resource === "companies") {
        return baseDataProvider.getList("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getList("contacts_summary", params);
      }
      if (resource === "activity_log") {
        const { data, total } = await baseDataProvider.getList(
          "activity_log",
          params,
        );
        // Rename snake_case view columns to camelCase to match Activity type
        return {
          data: data.map((row: any) => ({
            ...row,
            contactNote: row.contact_note ?? undefined,
            dealNote: row.deal_note ?? undefined,
            contact_note: undefined,
            deal_note: undefined,
          })),
          total,
        };
      }

      return baseDataProvider.getList(resource, params);
    },
    async getOne(resource: string, params: any) {
      if (resource === "companies") {
        return baseDataProvider.getOne("companies_summary", params);
      }
      if (resource === "contacts") {
        return baseDataProvider.getOne("contacts_summary", params);
      }

      return baseDataProvider.getOne(resource, params);
    },

    async signUp({ email, password, first_name, last_name }: SignUpData) {
      const response = await getSupabaseClient().auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name,
            last_name,
          },
        },
      });

      if (!response.data?.user || response.error) {
        console.error("signUp.error", response.error);
        throw new Error(response?.error?.message || "Failed to create account");
      }

      // Update the is initialized cache
      (getIsInitialized as any)._is_initialized_cache = true;

      return {
        id: response.data.user.id,
        email,
        password,
      };
    },
    async salesCreate(body: SalesFormData) {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        data: Sale;
      }>("users", {
        method: "POST",
        body,
      });

      if (!data || error) {
        console.error("salesCreate.error", error);
        const errorDetails = await (async () => {
          try {
            return (await error?.context?.json()) ?? {};
          } catch {
            return {};
          }
        })();
        throw Object.assign(
          new Error(errorDetails?.message || "Failed to create the user"),
          { code: errorDetails?.code, email: errorDetails?.email },
        );
      }

      return data.data;
    },
    async salesUpdate(
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ) {
      const {
        email,
        secondary_emails,
        first_name,
        last_name,
        administrator,
        avatar,
        disabled,
      } = data;

      const { data: updatedData, error } =
        await getSupabaseClient().functions.invoke<{
          data: Sale;
        }>("users", {
          method: "PATCH",
          body: {
            sales_id: id,
            email,
            secondary_emails,
            first_name,
            last_name,
            administrator,
            disabled,
            avatar,
          },
        });

      if (!updatedData || error) {
        console.error("salesUpdate.error", error);
        const errorDetails = await (async () => {
          try {
            return (await error?.context?.json()) ?? {};
          } catch {
            return {};
          }
        })();
        throw Object.assign(
          new Error(
            errorDetails?.message || "Failed to update account manager",
          ),
          { code: errorDetails?.code, email: errorDetails?.email },
        );
      }

      return updatedData.data;
    },
    async updatePassword(id: Identifier) {
      const { data: passwordUpdated, error } =
        await getSupabaseClient().functions.invoke<boolean>("update_password", {
          method: "PATCH",
          body: {
            sales_id: id,
          },
        });

      if (!passwordUpdated || error) {
        console.error("update_password.error", error);
        throw new Error("Failed to update password");
      }

      return passwordUpdated;
    },
    async claimDeal(
      dealId: Identifier,
      expectedVersion?: number,
      requestKey: string = newRequestKey(),
    ) {
      return callDealCommand("claim_deal", {
        p_deal_id: dealId,
        p_expected_version: expectedVersion ?? null,
        p_request_key: requestKey,
      });
    },
    async transitionDeal({
      dealId,
      expectedVersion,
      toStage,
      beforeDealId,
      reason,
      contractSignedAt,
      contractLink,
      requestKey = newRequestKey(),
    }: TransitionDealParams) {
      return callDealCommand("transition_deal", {
        p_deal_id: dealId,
        p_expected_version: expectedVersion,
        p_to_stage: toStage,
        p_before_deal_id: beforeDealId ?? null,
        p_reason: reason ?? null,
        p_request_key: requestKey,
        p_contract_signed_at: contractSignedAt ?? null,
        p_contract_link: contractLink ?? null,
      });
    },
    async handoffDeal({
      dealId,
      expectedVersion,
      productName,
      instructions,
      dueDate,
      files,
      links,
      requestKey = newRequestKey(),
    }: HandoffParams) {
      return callDealCommand("handoff_deal_to_production", {
        p_deal_id: dealId,
        p_expected_version: expectedVersion,
        p_product_name: productName,
        p_instructions: instructions ?? null,
        p_due_date: dueDate || null,
        p_files: files,
        p_links: links,
        p_request_key: requestKey,
      });
    },
    async transitionOrder({
      orderId,
      expectedVersion,
      toStage,
      requestKey = newRequestKey(),
    }: TransitionOrderParams) {
      const { data, error, status } = await getSupabaseClient().rpc(
        "transition_production_order",
        {
          p_order_id: orderId,
          p_expected_version: expectedVersion,
          p_to_stage: toStage,
          p_request_key: requestKey,
        },
      );
      if (error) {
        throw new DealCommandError(error.message, status);
      }
      return data as OrderTransitionResult;
    },
    async registerPayment({
      dealId,
      kind,
      amount,
      paidAt,
      comment,
      requestKey = newRequestKey(),
    }: PaymentParams) {
      const { error, status } = await getSupabaseClient().rpc(
        "register_payment",
        {
          p_deal_id: dealId,
          p_kind: kind,
          p_amount: amount,
          p_paid_at: paidAt ?? null,
          p_comment: comment ?? null,
          p_request_key: requestKey,
        },
      );
      if (error) throw new DealCommandError(error.message, status);
    },
    /** Totals of the analytics screen over the whole selection, with the rights of the caller. */
    async getFinanceSummary(args: FinanceSummaryArgs): Promise<FinanceSummary> {
      const { data, error } = await getSupabaseClient().rpc(
        "deals_finance_summary",
        {
          p_stages: args.stages,
          p_sales_id: args.salesId,
          p_closing_from: args.closingFrom,
          p_closing_to: args.closingTo,
        },
      );
      if (error) throw error;
      return data as FinanceSummary;
    },
    async openNotification(id: Identifier) {
      const { error, status } = await getSupabaseClient().rpc(
        "open_notification",
        { p_id: id },
      );
      if (error) throw new DealCommandError(error.message, status);
    },
    async acknowledgeNotification(id: Identifier) {
      const { error, status } = await getSupabaseClient().rpc(
        "acknowledge_notification",
        { p_id: id },
      );
      if (error) throw new DealCommandError(error.message, status);
    },
    async getPendingNotifications(): Promise<NotificationEvent[]> {
      const { data, error } = await getSupabaseClient()
        .from("notification_events")
        .select("*")
        .is("acknowledged_at", null)
        .order("id", { ascending: true });
      if (error) throw error;
      return data as NotificationEvent[];
    },
    /** Uploads a file of a deal to the private bucket; the first folder of the path is the deal id. */
    async uploadOrderFile(
      dealId: Identifier,
      file: File,
    ): Promise<UploadedOrderFile> {
      // The object name is made of safe characters, the original name is kept next to it
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${dealId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await getSupabaseClient()
        .storage.from(ORDER_FILES_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      return {
        path,
        name: file.name,
        size: file.size,
        type: file.type,
      };
    },
    /** A short lived address of a private file, issued only to people allowed to read it. */
    async getOrderFileUrl(path: string): Promise<string> {
      const { data, error } = await getSupabaseClient()
        .storage.from(ORDER_FILES_BUCKET)
        .createSignedUrl(path, 120);
      if (error || !data) {
        throw new Error(error?.message ?? "File not available");
      }
      return data.signedUrl;
    },
    async assignDeal({
      dealId,
      expectedVersion,
      toSalesId,
      reason,
      requestKey = newRequestKey(),
    }: AssignDealParams) {
      return callDealCommand("assign_deal", {
        p_deal_id: dealId,
        p_expected_version: expectedVersion,
        p_to_sales_id: toSalesId,
        p_reason: reason ?? null,
        p_request_key: requestKey,
      });
    },
    async createManualDeal(
      data: ManualDealData,
      requestKey: string = newRequestKey(),
    ) {
      return callDealCommand("create_manual_deal", {
        p_name: data.name,
        p_contact_id: data.contact_id ?? null,
        p_new_contact: data.new_contact ?? null,
        p_company_id: data.company_id ?? null,
        p_description: data.description ?? null,
        p_source: data.source,
        p_received_at: data.received_at ?? null,
        p_categories: data.categories?.length ? data.categories : null,
        p_amount: data.amount ?? null,
        p_assign_to_me: data.assign_to_me ?? true,
        p_request_key: requestKey,
      });
    },
    async setStaffRoles(salesId: Identifier, roles: StaffRole[]) {
      const { error } = await getSupabaseClient().rpc("set_staff_roles", {
        p_sales_id: salesId,
        p_roles: roles,
      });
      if (error) {
        throw new DealCommandError(error.message);
      }
    },
    async unarchiveDeal(deal: Deal) {
      // Only archived_at changes: stage, owner and order are protected by the database
      return baseDataProvider.update("deals", {
        id: deal.id,
        data: { archived_at: null },
        previousData: deal,
      });
    },
    async isInitialized() {
      return getIsInitialized();
    },
    async globalSearch(
      query: string,
      resources: readonly SearchResourceName[],
      maxResults: number,
    ): Promise<SearchResult[]> {
      const { data, error, status } = await getSupabaseClient().rpc(
        "global_search",
        { query, resources, max_results: maxResults },
      );
      if (error) {
        console.error("global_search.error", error);
        // the status lets authProvider.checkError log out an expired session
        throw new HttpError("Failed to search", status, error);
      }
      return data ?? [];
    },
    async mergeContacts(sourceId: Identifier, targetId: Identifier) {
      const { data, error } = await getSupabaseClient().functions.invoke(
        "merge_contacts",
        {
          method: "POST",
          body: { loserId: sourceId, winnerId: targetId },
        },
      );

      if (error) {
        console.error("merge_contacts.error", error);
        throw new Error("Failed to merge contacts");
      }

      return data;
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    async updateConfiguration(
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> {
      const { data } = await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: { id: 1 },
      });
      return data.config as ConfigurationContextValue;
    },
  } satisfies DataProvider;
};

export type CrmDataProvider = ReturnType<
  typeof getDataProviderWithCustomMethods
>;

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    await uploadToBucket(logo);
    return logo.src;
  }
  return logo?.src ?? "";
};

const lifeCycleCallbacks: ResourceCallbacks[] = [
  {
    resource: "configuration",
    beforeUpdate: async (params) => {
      const config = params.data.config;
      if (config) {
        config.lightModeLogo = await processConfigLogo(config.lightModeLogo);
        config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
      }
      return params;
    },
  },
  {
    resource: "contact_notes",
    beforeSave: async (data: ContactNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "deal_notes",
    beforeSave: async (data: DealNote, _, __) => {
      if (data.attachments) {
        data.attachments = await Promise.all(
          data.attachments.map((fi) => uploadToBucket(fi)),
        );
      }
      return data;
    },
  },
  {
    resource: "sales",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
    beforeSave: async (data: Sale, _, __) => {
      if (data.avatar) {
        await uploadToBucket(data.avatar);
      }
      return data;
    },
  },
  {
    resource: "contacts",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "first_name",
        "last_name",
        "company_name",
        "title",
        "email",
        "phone",
        "background",
      ])(params);
    },
  },
  {
    resource: "companies",
    beforeGetList: async (params) => {
      return applyFullTextSearch([
        "name",
        "phone_number",
        "website",
        "zipcode",
        "city",
        "state_abbr",
      ])(params);
    },
    beforeCreate: async (params) => {
      const createParams = await processCompanyLogo(params);

      return {
        ...createParams,
        data: {
          created_at: new Date().toISOString(),
          ...createParams.data,
        },
      };
    },
    beforeUpdate: async (params) => {
      return await processCompanyLogo(params);
    },
  },
  {
    resource: "contacts_summary",
    beforeGetList: async (params) => {
      return applyFullTextSearch(["first_name", "last_name"])(params);
    },
  },
  {
    resource: "deals",
    beforeGetList: async (params, dataProvider) => {
      return searchDealCategories(
        applyFullTextSearch(["name", "description"])(params),
        params.filter?.q,
        dataProvider,
      );
    },
  },
];

export const getDataProvider = () => {
  if (!window._atomicCrmConfig) {
    throw new Error(
      "config.js is not loaded: index.html must load it before the app. See https://marmelab.com/atomic-crm/doc/developers/upgrade/",
    );
  }
  if (!config.supabaseUrl) {
    throw new Error(
      "Please set the VITE_SUPABASE_URL environment variable (or supabaseUrl in config.js)",
    );
  }
  if (!config.supabasePublishableKey) {
    throw new Error(
      "Please set the VITE_SB_PUBLISHABLE_KEY environment variable (or supabasePublishableKey in config.js)",
    );
  }
  return withLifecycleCallbacks(
    getDataProviderWithCustomMethods(),
    lifeCycleCallbacks,
  ) as CrmDataProvider;
};

const applyFullTextSearch = (columns: string[]) => (params: GetListParams) => {
  if (!params.filter?.q) {
    return params;
  }
  const { q, ...filter } = params.filter;
  return {
    ...params,
    filter: {
      ...filter,
      "@or": columns.reduce((acc, column) => {
        if (column === "email")
          return {
            ...acc,
            [`email_fts@ilike`]: q,
          };
        if (column === "phone")
          return {
            ...acc,
            [`phone_fts@ilike`]: q,
          };
        else
          return {
            ...acc,
            [`${column}@ilike`]: q,
          };
      }, {}),
    },
  };
};

const uploadToBucket = async (fi: RAFile) => {
  if (!fi.src.startsWith("blob:") && !fi.src.startsWith("data:")) {
    // Sign URL check if path exists in the bucket
    if (fi.path) {
      const { error } = await getSupabaseClient()
        .storage.from(ATTACHMENTS_BUCKET)
        .createSignedUrl(fi.path, 60);

      if (!error) {
        return fi;
      }
    }
  }

  const dataContent = fi.src
    ? await fetch(fi.src)
        .then((res) => {
          if (res.status !== 200) {
            return null;
          }
          return res.blob();
        })
        .catch(() => null)
    : fi.rawFile;

  if (dataContent == null) {
    // We weren't able to download the file from its src (e.g. user must be signed in on another website to access it)
    // or the file has no content (not probable)
    // In that case, just return it as is: when trying to download it, users should be redirected to the other website
    // and see they need to be signed in. It will then be their responsibility to upload the file back to the note.
    return fi;
  }

  const file = fi.rawFile;
  const fileParts = file.name.split(".");
  const fileExt = fileParts.length > 1 ? `.${file.name.split(".").pop()}` : "";
  const fileName = `${Math.random()}${fileExt}`;
  const filePath = `${fileName}`;
  const { error: uploadError } = await getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .upload(filePath, dataContent);

  if (uploadError) {
    console.error("uploadError", uploadError);
    throw new Error("Failed to upload attachment");
  }

  const { data } = getSupabaseClient()
    .storage.from(ATTACHMENTS_BUCKET)
    .getPublicUrl(filePath);

  fi.path = filePath;
  fi.src = data.publicUrl;

  // save MIME type
  const mimeType = file.type;
  fi.type = mimeType;

  return fi;
};
