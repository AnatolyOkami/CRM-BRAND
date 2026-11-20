import {
  useDataProvider,
  useGetList,
  useNotify,
  useTranslate,
  type Identifier,
} from "ra-core";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { OrderMaterial } from "../types";

/**
 * The files and the links of an order in two separate blocks, so that their presence is visible at
 * once. Files live in a private bucket: an address is requested only when someone opens a file,
 * and only people allowed to read the order get one.
 */
export const OrderMaterials = ({ orderId }: { orderId: Identifier }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { data, isPending, error } = useGetList<OrderMaterial>(
    "production_order_materials",
    {
      filter: { order_id: orderId },
      pagination: { page: 1, perPage: 100 },
      sort: { field: "id", order: "ASC" },
    },
  );

  if (isPending) return null;
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {translate("crm.order.materials_error")}
      </p>
    );
  }

  const files = (data ?? []).filter((item) => item.kind === "file");
  const links = (data ?? []).filter((item) => item.kind === "link");

  const openFile = async (path: string) => {
    try {
      const url = await dataProvider.getOrderFileUrl(path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      notify("crm.order.file_error", { type: "error" });
    }
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <section
        aria-label={translate("crm.handoff.files")}
        className="rounded-md border p-3"
      >
        <h4 className="mb-1 text-sm font-semibold">
          {translate("crm.handoff.files")}
        </h4>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("crm.handoff.files_none")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="truncate">{file.file_name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void openFile(file.file_path!)}
                >
                  {translate("crm.order.open")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        aria-label={translate("crm.handoff.links")}
        className="rounded-md border p-3"
      >
        <h4 className="mb-1 text-sm font-semibold">
          {translate("crm.handoff.links")}
        </h4>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("crm.handoff.links_none")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.id} className="text-sm">
                <a
                  href={link.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {link.label || link.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
