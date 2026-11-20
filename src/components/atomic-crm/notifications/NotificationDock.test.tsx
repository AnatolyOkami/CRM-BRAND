import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { NotificationEvent } from "../types";
import { NotificationDock } from "./NotificationDock";

const buildNotification = (
  overrides: Partial<NotificationEvent> = {},
): NotificationEvent => ({
  id: 1,
  recipient_sales_id: 1,
  kind: "order_ready",
  order_id: 7,
  deal_id: 3,
  ready_cycle: 1,
  payload: { order_number: 7, customer_name: "Acme", product_name: "Banner" },
  created_at: "2026-11-20T10:00:00.000Z",
  opened_at: null,
  acknowledged_at: null,
  ...overrides,
});

/** A tiny server: the notifications live outside the React tree, like in the database. */
const createServer = (initial: NotificationEvent[]) => {
  let rows = initial;
  const calls = { open: [] as unknown[], confirm: [] as unknown[] };
  return {
    calls,
    failConfirm: false,
    provider() {
      return {
        getPendingNotifications: async () => rows,
        openNotification: async (id: unknown) => {
          calls.open.push(id);
          rows = rows.map((row) =>
            row.id === id ? { ...row, opened_at: "2026-11-20T10:05:00Z" } : row,
          );
        },
        acknowledgeNotification: async (id: unknown) => {
          calls.confirm.push(id);
          if (this.failConfirm) throw new Error("network");
          rows = rows.filter((row) => row.id !== id);
        },
      };
    },
  };
};

const renderDock = (server: ReturnType<typeof createServer>) =>
  render(
    <StoryWrapper
      dataProvider={server.provider() as never}
      chrome={<NotificationDock />}
    >
      <p>Home</p>
    </StoryWrapper>,
  );

describe("NotificationDock", () => {
  it("shows every unconfirmed order with no way to close the panel", async () => {
    const server = createServer([
      buildNotification(),
      buildNotification({
        id: 2,
        order_id: 8,
        payload: {
          order_number: 8,
          customer_name: "Globex",
          product_name: "Sign",
        },
      }),
    ]);
    const screen = await renderDock(server);

    await expect
      .element(screen.getByText("Order №7 for Acme is ready for pickup"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Order №8 for Globex is ready for pickup"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: /close|dismiss/i }))
      .not.toBeInTheDocument();
    // the confirmation is not offered before the order was opened
    await expect
      .element(screen.getByRole("button", { name: "Confirm that I saw it" }))
      .not.toBeInTheDocument();
  });

  it("offers the confirmation after the order was opened, and hides the card once it is saved", async () => {
    const server = createServer([buildNotification()]);
    const screen = await renderDock(server);

    await screen.getByRole("button", { name: "Open" }).click();
    const confirm = screen.getByRole("button", {
      name: "Confirm that I saw it",
    });
    await expect.element(confirm).toBeVisible();
    // opening alone does not remove the notification
    await expect
      .element(screen.getByText("Order №7 for Acme is ready for pickup"))
      .toBeVisible();

    await confirm.click();

    await expect
      .element(screen.getByText("Order №7 for Acme is ready for pickup"))
      .not.toBeInTheDocument();
    expect(server.calls.confirm).toEqual([1]);
  });

  it("keeps the card and allows a retry when the confirmation could not be saved", async () => {
    const server = createServer([
      buildNotification({ opened_at: "2026-11-20T10:05:00Z" }),
    ]);
    server.failConfirm = true;
    const screen = await renderDock(server);

    await screen.getByRole("button", { name: "Confirm that I saw it" }).click();

    await expect
      .element(screen.getByText("Could not save the confirmation, try again"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Order №7 for Acme is ready for pickup"))
      .toBeVisible();

    server.failConfirm = false;
    await screen.getByRole("button", { name: "Confirm that I saw it" }).click();
    await expect
      .element(screen.getByText("Order №7 for Acme is ready for pickup"))
      .not.toBeInTheDocument();
  });

  it("renders nothing when there is nothing to confirm", async () => {
    const screen = await renderDock(createServer([]));

    await expect
      .element(screen.getByRole("region", { name: "Orders ready for pickup" }))
      .not.toBeInTheDocument();
  });
});
