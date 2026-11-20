import { useMemo } from "react";
import { useStore } from "ra-core";

import type { DealStage, LabeledValue, NoteStatus } from "../types";
import {
  defaultConfiguration,
  defaultDealStages,
} from "./defaultConfiguration";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  currency: string;
  dealCategories: LabeledValue[];
  dealPipelineStatuses: string[];
  dealStages: DealStage[];
  noteStatuses: NoteStatus[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
}

/**
 * Stage codes belong to the system (database constraint, deal commands): the configuration can
 * only rename them. Stored settings with other codes, from an older version, never reach the board.
 */
export const normalizeDealStages = (stages?: DealStage[]): DealStage[] =>
  defaultDealStages.map((stage) => {
    const label = stages?.find((s) => s.value === stage.value)?.label?.trim();
    return { value: stage.value, label: label || stage.label };
  });

export const useConfigurationContext = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(() => {
    const merged = { ...defaultConfiguration, ...config };
    return { ...merged, dealStages: normalizeDealStages(merged.dealStages) };
  }, [config]);
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};
