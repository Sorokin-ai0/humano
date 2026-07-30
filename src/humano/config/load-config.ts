import rawConfig from "../../../config/humano.config.json";
import { humanoConfigSchema, type HumanoConfig } from "./schema";

let cachedConfig: HumanoConfig | undefined;

/** Loads and validates the bundled Worker-safe JSON configuration once. */
export function loadHumanoConfig(): HumanoConfig {
  cachedConfig ??= humanoConfigSchema.parse(rawConfig);
  return cachedConfig;
}
