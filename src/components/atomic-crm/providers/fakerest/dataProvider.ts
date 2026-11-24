import {
  withLifecycleCallbacks,
  type CreateParams,
  type DataProvider,
  type Identifier,
  type ResourceCallbacks,
  type UpdateParams,
} from "ra-core";
import fakeRestDataProvider from "ra-data-fakerest";

import type {
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  DealCommandResult,
  FinanceSummary,
  ManualDealData,
  NotificationEvent,
  Sale,
  SalesFormData,
  SearchResourceName,
  SearchResult,
  SignUpData,
  Tag,
  Task,
  UploadedOrderFile,
} from "../../types";
import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { getActivityLog } from "../commons/activity";
import {
  DealCommandError,
  type AssignDealParams,
  type OrderTransitionResult,
  type SavedLeadPartner,
  type TransitionDealParams,
} from "../commons/dealCommands";
import { getCompanyAvatar } from "../commons/getCompanyAvatar";
import { getContactAvatar } from "../commons/getContactAvatar";
import { mergeContacts } from "../commons/mergeContacts";
import { getSearchResults } from "./search";
import type { CrmDataProvider } from "../types";
import {
  authProvider as defaultAuthProvider,
  USER_STORAGE_KEY,
} from "./authProvider";
import generateData from "./dataGenerator";
import type { Db } from "./dataGenerator/types";
import { withSupabaseFilterAdapter } from "./internal/supabaseAdapter";

const TASK_MARKED_AS_DONE = "TASK_MARKED_AS_DONE";
const TASK_MARKED_AS_UNDONE = "TASK_MARKED_AS_UNDONE";
const TASK_DONE_NOT_CHANGED = "TASK_DONE_NOT_CHANGED";

const processCompanyLogo = async (params: any) => {
  let logo = params.data.logo;
  if (params.data.logo === undefined) return params;

  if (typeof logo !== "object" || logo === null || !logo.src) {
    logo = await getCompanyAvatar(params.data);
  } else if (logo.rawFile instanceof File) {
    const base64Logo = await convertFileToBase64(logo);
    logo = { src: base64Logo, title: logo.title };
  }

  return {
    ...params,
    data: {
      ...params.data,
      logo,
    },
  };
};

async function processContactAvatar(
  params: UpdateParams<Contact>,
): Promise<UpdateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact>,
): Promise<CreateParams<Contact>>;

async function processContactAvatar(
  params: CreateParams<Contact> | UpdateParams<Contact>,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  if (data.avatar?.src || !data.email_jsonb || !data.email_jsonb.length) {
    return params;
  }
  const avatarUrl = await getContactAvatar(data);

  // Clone the data and modify the clone
  const newData = { ...data, avatar: { src: avatarUrl || undefined } };

  return { ...params, data: newData };
}

async function fetchAndUpdateCompanyData(
  params: UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<UpdateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact>>;

async function fetchAndUpdateCompanyData(
  params: CreateParams<Contact> | UpdateParams<Contact>,
  dataProvider: DataProvider,
): Promise<CreateParams<Contact> | UpdateParams<Contact>> {
  const { data } = params;
  const newData = { ...data };

  if (!newData.company_id) {
    return params;
  }

  const { data: company } = await dataProvider.getOne("companies", {
    id: newData.company_id,
  });

  if (!company) {
    return params;
  }

  newData.company_name = company.name;
  return { ...params, data: newData };
}

export interface CreateFakeRestDataProviderOptions {
  db?: Db;
  latency?: number;
  authProvider?: Pick<typeof defaultAuthProvider, "getIdentity">;
  silent?: boolean;
}

const processConfigLogo = async (logo: any): Promise<string> => {
  if (typeof logo === "string") return logo;
  if (logo?.rawFile instanceof File) {
    return (await convertFileToBase64(logo)) as string;
  }
  return logo?.src ?? "";
};

const preserveAttachmentMimeType = <
  NoteType extends { attachments?: Array<{ rawFile?: File; type?: string }> },
>(
  note: NoteType,
): NoteType => ({
  ...note,
  attachments: (note.attachments ?? []).map((attachment) => ({
    ...attachment,
    type: attachment.type ?? attachment.rawFile?.type,
  })),
});

export const createDataProvider = ({
  db = generateData(),
  latency = 300,
  authProvider,
  silent = false,
}: CreateFakeRestDataProviderOptions = {}): CrmDataProvider => {
  const baseDataProvider = fakeRestDataProvider(db, !silent, latency);
  let taskUpdateType = TASK_DONE_NOT_CHANGED;
  let companiesToUpdate:
    { increment?: Identifier; decrement?: Identifier } | undefined = undefined;
  const getIdentity = async () =>
    authProvider?.getIdentity?.() ?? defaultAuthProvider.getIdentity?.();

  // Gives the deal to a person, moves it to "processing" and adds the first contact task
  const assignInMemory = async (deal: Deal, salesId: Identifier) => {
    await baseDataProvider.update("deals", {
      id: deal.id,
      data: {
        sales_id: salesId,
        stage: "processing",
        version: (deal.version ?? 1) + 1,
      },
      previousData: deal,
    });
    let taskId: Identifier | null = null;
    const contactId = deal.contact_ids?.[0];
    if (contactId != null) {
      const { data: task } = await baseDataProvider.create<Task>("tasks", {
        data: {
          contact_id: contactId,
          deal_id: deal.id,
          type: "first-contact",
          text: `Первый контакт по заявке «${deal.name}»`,
          due_date: deal.first_response_due_at ?? new Date().toISOString(),
          sales_id: salesId,
        },
      });
      taskId = task.id;
    }
    return {
      deal_id: deal.id,
      version: (deal.version ?? 1) + 1,
      stage: "processing",
      sales_id: salesId,
      task_id: taskId,
      replayed: false,
    };
  };

  const updateCompany = async (
    companyId: Identifier,
    updateFn: (company: Company) => Partial<Company>,
  ) => {
    const { data: company } = await dataProvider.getOne<Company>("companies", {
      id: companyId,
    });

    return await dataProvider.update("companies", {
      id: companyId,
      data: {
        ...updateFn(company),
      },
      previousData: company,
    });
  };

  const dataProviderWithCustomMethod: CrmDataProvider = {
    ...baseDataProvider,
    async getMany(resource: string, params: any) {
      if (resource === "tags" || resource === "contacts") {
        // like PostgREST, ignore unknown ids (a deleted tag may still be in cached contacts,
        // a deleted contact in the recently viewed contacts)
        const { data } = await baseDataProvider.getList(resource, {
          filter: { id_eq_any: params.ids },
          pagination: { page: 1, perPage: params.ids.length },
          sort: { field: "id", order: "ASC" },
        });
        return { data };
      }
      return baseDataProvider.getMany(resource, params);
    },
    async getList(resource: string, params: any) {
      if (resource === "activity_log") {
        const { filter = {}, pagination } = params;
        const all = await getActivityLog(
          withSupabaseFilterAdapter(baseDataProvider),
          filter.company_id,
          filter.sales_id,
        );
        const { page, perPage } = pagination;
        const start = (page - 1) * perPage;
        return { data: all.slice(start, start + perPage), total: all.length };
      }
      return baseDataProvider.getList(resource, params);
    },
    unarchiveDeal: async (deal: Deal) => {
      return baseDataProvider.update("deals", {
        id: deal.id,
        data: { archived_at: null },
        previousData: deal,
      });
    },
    claimDeal: async (dealId: Identifier) => {
      const identity = await getIdentity();
      const { data: deal } = await baseDataProvider.getOne<Deal>("deals", {
        id: dealId,
      });
      if (deal.sales_id != null && deal.sales_id !== identity?.id) {
        throw new DealCommandError("deal_already_assigned", 409);
      }
      return assignInMemory(deal, identity?.id as Identifier);
    },
    transitionDeal: async ({
      dealId,
      expectedVersion,
      toStage,
      beforeDealId,
      reason,
    }: TransitionDealParams) => {
      const { data: deal } = await baseDataProvider.getOne<Deal>("deals", {
        id: dealId,
      });
      if ((deal.version ?? 1) !== expectedVersion) {
        throw new DealCommandError("deal_version_conflict", 409);
      }
      if (toStage === "won") {
        throw new DealCommandError("won_requires_handoff", 422);
      }
      if (toStage === "lost" && !reason?.trim()) {
        throw new DealCommandError("reason_required", 422);
      }
      const { data: column } = await baseDataProvider.getList<Deal>("deals", {
        filter: { stage: toStage, "archived_at@is": null },
        pagination: { page: 1, perPage: 1000 },
        sort: { field: "index", order: "ASC" },
      });
      const others = column.filter((d) => d.id !== dealId);
      const position = others.findIndex((d) => d.id === beforeDealId);
      const ordered =
        position === -1
          ? [...others, deal]
          : [...others.slice(0, position), deal, ...others.slice(position)];
      await Promise.all(
        ordered.map((d, index) =>
          baseDataProvider.update("deals", {
            id: d.id,
            data:
              d.id === dealId
                ? {
                    stage: toStage,
                    index,
                    version: (deal.version ?? 1) + 1,
                    lost_reason: toStage === "lost" ? reason : null,
                  }
                : { index },
            previousData: d,
          }),
        ),
      );
      return {
        deal_id: dealId,
        version: (deal.version ?? 1) + 1,
        stage: toStage,
        sales_id: deal.sales_id,
        index: ordered.findIndex((d) => d.id === dealId),
        replayed: false,
      };
    },
    assignDeal: async ({ dealId, toSalesId }: AssignDealParams) => {
      const { data: deal } = await baseDataProvider.getOne<Deal>("deals", {
        id: dealId,
      });
      if (toSalesId == null) {
        await baseDataProvider.update("deals", {
          id: dealId,
          data: {
            sales_id: null,
            stage: "opportunity",
            version: (deal.version ?? 1) + 1,
          },
          previousData: deal,
        });
        return {
          deal_id: dealId,
          version: (deal.version ?? 1) + 1,
          stage: "opportunity",
          sales_id: null,
          replayed: false,
        };
      }
      return assignInMemory(deal, toSalesId);
    },
    createManualDeal: async (data: ManualDealData) => {
      const identity = await getIdentity();
      let contactId = data.contact_id;
      if (contactId == null) {
        const { data: contact } = await baseDataProvider.create<Contact>(
          "contacts",
          {
            data: {
              first_name: data.new_contact?.first_name ?? "Клиент",
              last_name: data.new_contact?.last_name ?? "",
              email_jsonb: data.new_contact?.email
                ? [{ email: data.new_contact.email, type: "Work" }]
                : [],
              phone_jsonb: data.new_contact?.phone
                ? [{ number: data.new_contact.phone, type: "Work" }]
                : [],
              company_id: data.company_id ?? null,
              sales_id: identity?.id,
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              tags: [],
            },
          },
        );
        contactId = contact.id;
      }
      const now = new Date().toISOString();
      const { data: deal } = await baseDataProvider.create<Deal>("deals", {
        data: {
          name: data.name,
          company_id: data.company_id ?? null,
          contact_ids: [contactId],
          categories: data.categories ?? [],
          stage: "opportunity",
          description: data.description ?? "",
          amount: data.amount ?? null,
          source: data.source,
          received_at: data.received_at ?? now,
          first_response_due_at: data.received_at ?? now,
          first_responded_at: null,
          version: 1,
          sales_id: null,
          index: 0,
          created_at: now,
          updated_at: now,
        },
      });
      if (data.assign_to_me ?? true) {
        const result = await assignInMemory(deal, identity?.id as Identifier);
        return { ...result, contact_id: contactId };
      }
      return {
        deal_id: deal.id,
        contact_id: contactId,
        version: 1,
        stage: "opportunity",
        sales_id: null,
        task_id: null,
        replayed: false,
      };
    },
    setStaffRoles: async () => {
      // The demo has no role restrictions
    },
    // The production module needs the real backend: files, orders and notifications are stored there
    handoffDeal: async (): Promise<DealCommandResult> => {
      throw new DealCommandError("not_available_in_demo");
    },
    transitionOrder: async (): Promise<OrderTransitionResult> => {
      throw new DealCommandError("not_available_in_demo");
    },
    openNotification: async () => {
      throw new DealCommandError("not_available_in_demo");
    },
    acknowledgeNotification: async () => {
      throw new DealCommandError("not_available_in_demo");
    },
    getPendingNotifications: async (): Promise<NotificationEvent[]> => [],
    registerPayment: async () => {
      throw new DealCommandError("not_available_in_demo");
    },
    // Calls, sources and partner links need the real backend
    logCallResult: async (): Promise<DealCommandResult> => {
      throw new DealCommandError("not_available_in_demo");
    },
    setDealSource: async (): Promise<DealCommandResult> => {
      throw new DealCommandError("not_available_in_demo");
    },
    saveLeadPartner: async (): Promise<SavedLeadPartner> => {
      throw new DealCommandError("not_available_in_demo");
    },
    rotateLeadPartnerSecret: async (): Promise<string> => {
      throw new DealCommandError("not_available_in_demo");
    },
    saveLeadSource: async (): Promise<void> => {
      throw new DealCommandError("not_available_in_demo");
    },
    getFinanceSummary: async (): Promise<FinanceSummary> => ({
      total_count: 0,
      in_work_count: 0,
      in_work_amount: 0,
      in_work_without_amount: 0,
      paid: 0,
      remaining: 0,
      overpaid: 0,
    }),
    uploadOrderFile: async (): Promise<UploadedOrderFile> => {
      throw new DealCommandError("not_available_in_demo");
    },
    getOrderFileUrl: async (): Promise<string> => {
      throw new DealCommandError("not_available_in_demo");
    },
    signUp: async ({
      email,
      password,
      first_name,
      last_name,
    }: SignUpData): Promise<{
      id: string;
      email: string;
      password: string;
    }> => {
      const user = await baseDataProvider.create("sales", {
        data: {
          email,
          first_name,
          last_name,
        },
      });

      return {
        ...user.data,
        password,
      };
    },
    salesCreate: async ({ ...data }: SalesFormData): Promise<Sale> => {
      const response = await dataProvider.create("sales", {
        data: {
          ...data,
          password: "new_password",
        },
      });

      return response.data;
    },
    salesUpdate: async (
      id: Identifier,
      data: Partial<Omit<SalesFormData, "password">>,
    ): Promise<Sale> => {
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      const { data: sale } = await dataProvider.update<Sale>("sales", {
        id,
        data,
        previousData,
      });
      return { ...sale, user_id: sale.id.toString() };
    },
    isInitialized: async (): Promise<boolean> => {
      const sales = await dataProvider.getList<Sale>("sales", {
        filter: {},
        pagination: { page: 1, perPage: 1 },
        sort: { field: "id", order: "ASC" },
      });
      if (sales.data.length === 0) {
        return false;
      }
      return true;
    },
    updatePassword: async (id: Identifier): Promise<true> => {
      const currentUser = await getIdentity();
      if (!currentUser) {
        throw new Error("User not found");
      }
      const { data: previousData } = await dataProvider.getOne<Sale>("sales", {
        id: currentUser.id,
      });

      if (!previousData) {
        throw new Error("User not found");
      }

      await dataProvider.update("sales", {
        id,
        data: {
          password: "demo_newPassword",
        },
        previousData,
      });

      return true;
    },
    globalSearch: async (
      query: string,
      resources: readonly SearchResourceName[],
      maxResults: number,
    ): Promise<SearchResult[]> => {
      return getSearchResults(
        withSupabaseFilterAdapter(baseDataProvider),
        query,
        resources,
        maxResults,
      );
    },
    mergeContacts: async (sourceId: Identifier, targetId: Identifier) => {
      return mergeContacts(sourceId, targetId, baseDataProvider);
    },
    getConfiguration: async (): Promise<ConfigurationContextValue> => {
      const { data } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      return (data?.config as ConfigurationContextValue) ?? {};
    },
    updateConfiguration: async (
      config: ConfigurationContextValue,
    ): Promise<ConfigurationContextValue> => {
      const { data: prev } = await baseDataProvider.getOne("configuration", {
        id: 1,
      });
      await baseDataProvider.update("configuration", {
        id: 1,
        data: { config },
        previousData: prev,
      });
      return config;
    },
  };

  const dataProvider = withLifecycleCallbacks(
    withSupabaseFilterAdapter(dataProviderWithCustomMethod),
    [
      {
        resource: "configuration",
        beforeUpdate: async (params) => {
          const config = params.data.config;
          if (config) {
            config.lightModeLogo = await processConfigLogo(
              config.lightModeLogo,
            );
            config.darkModeLogo = await processConfigLogo(config.darkModeLogo);
          }
          return params;
        },
      },
      {
        resource: "sales",
        beforeCreate: async (params) => {
          const { data } = params;
          // If administrator role is not set, we simply set it to false
          if (data.administrator == null) {
            data.administrator = false;
          }
          return params;
        },
        afterSave: async (data) => {
          // Since the current user is stored in localStorage in fakerest authProvider
          // we need to update it to keep information up to date in the UI
          const currentUser = await getIdentity();
          if (currentUser?.id === data.id) {
            localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data));
          }
          return data;
        },
        beforeDelete: async (params) => {
          if (params.meta?.identity?.id == null) {
            throw new Error("Identity MUST be set in meta");
          }

          const newSaleId = params.meta.identity.id as Identifier;

          const [companies, contacts, contactNotes, deals] = await Promise.all([
            dataProvider.getList("companies", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("contacts", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("contact_notes", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
            dataProvider.getList("deals", {
              filter: { sales_id: params.id },
              pagination: {
                page: 1,
                perPage: 10_000,
              },
              sort: { field: "id", order: "ASC" },
            }),
          ]);

          await Promise.all([
            dataProvider.updateMany("companies", {
              ids: companies.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("contacts", {
              ids: contacts.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("contact_notes", {
              ids: contactNotes.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
            dataProvider.updateMany("deals", {
              ids: deals.data.map((company) => company.id),
              data: {
                sales_id: newSaleId,
              },
            }),
          ]);

          return params;
        },
      } satisfies ResourceCallbacks<Sale>,
      {
        resource: "contacts",
        beforeCreate: async (createParams, dataProvider) => {
          const params = {
            ...createParams,
            data: {
              ...createParams.data,
              first_seen:
                createParams.data.first_seen ?? new Date().toISOString(),
              last_seen:
                createParams.data.last_seen ?? new Date().toISOString(),
            },
          };
          const newParams = await processContactAvatar(params);
          return fetchAndUpdateCompanyData(newParams, dataProvider);
        },
        afterCreate: async (result) => {
          if (result.data.company_id != null) {
            await updateCompany(result.data.company_id, (company) => ({
              nb_contacts: (company.nb_contacts ?? 0) + 1,
            }));
          }

          return result;
        },
        beforeUpdate: async (params) => {
          const newParams = await processContactAvatar(params);
          if (params.data.company_id != params.previousData.company_id) {
            companiesToUpdate = {};
            if (params.data.company_id != null) {
              companiesToUpdate.increment = params.data.company_id;
            }
            if (params.previousData.company_id != null) {
              companiesToUpdate.decrement = params.previousData.company_id;
            }
          }

          return fetchAndUpdateCompanyData(newParams, dataProvider);
        },
        afterUpdate: async (result) => {
          if (companiesToUpdate != null) {
            if (companiesToUpdate.increment) {
              await updateCompany(companiesToUpdate.increment, (company) => ({
                nb_contacts: (company.nb_contacts ?? 0) + 1,
              }));
            }
            if (companiesToUpdate.decrement) {
              await updateCompany(companiesToUpdate.decrement, (company) => ({
                nb_contacts: (company.nb_contacts ?? 0) - 1,
              }));
            }
            companiesToUpdate = undefined;
          }

          return result;
        },
        afterDelete: async (result) => {
          if (result.data.company_id != null) {
            await updateCompany(result.data.company_id, (company) => ({
              nb_contacts: (company.nb_contacts ?? 1) - 1,
            }));
          }

          return result;
        },
      } satisfies ResourceCallbacks<Contact>,
      {
        resource: "tasks",
        beforeCreate: async (params) => ({
          ...params,
          data: { ...params.data, created_at: new Date().toISOString() },
        }),
        afterCreate: async (result, dataProvider) => {
          // update the task count in the related contact
          const { contact_id } = result.data;
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks: (contact.nb_tasks ?? 0) + 1,
            },
            previousData: contact,
          });
          return result;
        },
        beforeUpdate: async (params) => {
          const { data, previousData } = params;
          if (previousData.done_date !== data.done_date) {
            taskUpdateType = data.done_date
              ? TASK_MARKED_AS_DONE
              : TASK_MARKED_AS_UNDONE;
          } else {
            taskUpdateType = TASK_DONE_NOT_CHANGED;
          }
          return params;
        },
        afterUpdate: async (result, dataProvider) => {
          // update the contact: if the task is done, decrement the nb tasks, otherwise increment it
          const { contact_id } = result.data;
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          if (taskUpdateType !== TASK_DONE_NOT_CHANGED) {
            await dataProvider.update("contacts", {
              id: contact_id,
              data: {
                nb_tasks:
                  taskUpdateType === TASK_MARKED_AS_DONE
                    ? (contact.nb_tasks ?? 0) - 1
                    : (contact.nb_tasks ?? 0) + 1,
              },
              previousData: contact,
            });
          }
          return result;
        },
        afterDelete: async (result, dataProvider) => {
          // update the task count in the related contact
          const { contact_id } = result.data;
          if (result.data.done_date) {
            // if the task is done, we don't need to update the contact's nb of active tasks
            return result;
          }
          const { data: contact } = await dataProvider.getOne("contacts", {
            id: contact_id,
          });
          await dataProvider.update("contacts", {
            id: contact_id,
            data: {
              nb_tasks: (contact.nb_tasks ?? 0) - 1,
            },
            previousData: contact,
          });
          return result;
        },
      } satisfies ResourceCallbacks<Task>,
      {
        resource: "companies",
        beforeCreate: async (params) => {
          const createParams = await processCompanyLogo(params);

          return {
            ...createParams,
            data: {
              ...createParams.data,
              created_at: new Date().toISOString(),
            },
          };
        },
        beforeUpdate: async (params) => {
          return await processCompanyLogo(params);
        },
        afterUpdate: async (result, dataProvider) => {
          // get all contacts of the company and for each contact, update the company_name
          const { id, name } = result.data;
          const { data: contacts } = await dataProvider.getList("contacts", {
            filter: { company_id: id },
            pagination: { page: 1, perPage: 1000 },
            sort: { field: "id", order: "ASC" },
          });

          const contactIds = contacts.map((contact) => contact.id);
          await dataProvider.updateMany("contacts", {
            ids: contactIds,
            data: { company_name: name },
          });
          return result;
        },
      } satisfies ResourceCallbacks<Company>,
      {
        resource: "deals",
        beforeCreate: async (params) => {
          return {
            ...params,
            data: {
              ...params.data,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          };
        },
        afterCreate: async (result) => {
          await updateCompany(result.data.company_id, (company) => ({
            nb_deals: (company.nb_deals ?? 0) + 1,
          }));

          return result;
        },
        beforeUpdate: async (params) => {
          return {
            ...params,
            data: {
              ...params.data,
              updated_at: new Date().toISOString(),
            },
          };
        },
        afterDelete: async (result) => {
          await updateCompany(result.data.company_id, (company) => ({
            nb_deals: (company.nb_deals ?? 1) - 1,
          }));

          return result;
        },
      } satisfies ResourceCallbacks<Deal>,
      {
        resource: "tags",
        afterDelete: async (result, dataProvider) => {
          // remove the deleted tag from all contacts, like the on_tag_deleted DB trigger
          const tagId = result.data.id;
          const { data: contacts } = await dataProvider.getList<Contact>(
            "contacts",
            {
              filter: { "tags@cs": `{${tagId}}` },
              pagination: { page: 1, perPage: 10_000 },
              sort: { field: "id", order: "ASC" },
            },
          );
          await Promise.all(
            contacts.map((contact) =>
              dataProvider.update("contacts", {
                id: contact.id,
                data: { tags: contact.tags.filter((id) => id !== tagId) },
                previousData: contact,
              }),
            ),
          );
          return result;
        },
      } satisfies ResourceCallbacks<Tag>,
      {
        resource: "contact_notes",
        beforeSave: async (params) => preserveAttachmentMimeType(params),
      } satisfies ResourceCallbacks<ContactNote>,
      {
        resource: "deal_notes",
        beforeSave: async (params) => preserveAttachmentMimeType(params),
      } satisfies ResourceCallbacks<DealNote>,
    ],
  ) as CrmDataProvider;

  return dataProvider;
};

export const dataProvider = createDataProvider();

/**
 * Convert a `File` object returned by the upload input into a base 64 string.
 * That's not the most optimized way to store images in production, but it's
 * enough to illustrate the idea of dataprovider decoration.
 */
const convertFileToBase64 = (file: { rawFile: Blob }): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    // We know result is a string as we used readAsDataURL
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file.rawFile);
  });
