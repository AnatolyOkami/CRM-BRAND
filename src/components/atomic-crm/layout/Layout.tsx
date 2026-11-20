import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { DataImportProvider } from "../dataImport/DataImportProvider";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { useLocation } from "react-router";

import Header from "./Header";
import { NotificationDock } from "../notifications/NotificationDock";
import { SideMenu } from "./SideMenu";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  const { pathname } = useLocation();
  // The sales board uses the whole working width, the other pages keep a readable column
  const fullWidth = pathname.startsWith("/deals");
  return (
    <DataImportProvider>
      <div className="flex min-h-screen">
        <SideMenu />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main
            className={
              fullWidth ? "w-full p-4" : "mx-auto w-full max-w-screen-xl p-4"
            }
            id="main-content"
          >
            <ErrorBoundary FallbackComponent={Error}>
              <Suspense
                fallback={<Skeleton className="h-12 w-12 rounded-full" />}
              >
                {children}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <Notification />
      <NotificationDock />
    </DataImportProvider>
  );
};
