import { TranslationServiceClient } from "@google-cloud/translate";
import { config } from "../config.js";

export const translationClient = new TranslationServiceClient();

export function parentPath(): string {
  return translationClient.locationPath(config.projectId, config.location);
}
