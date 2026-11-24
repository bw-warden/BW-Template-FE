import {
  ensureRootCollection,
  findCollectionByName,
  listCollections,
} from "@/lib/bitwarden/public-api";
import { BitwardenSettings, loadSettings, settingsReady } from "@/lib/settings";

export async function templatesCollection(): Promise<{
  settings: BitwardenSettings;
  collectionId: string;
}> {
  const settings = await loadSettings();
  if (!settingsReady(settings)) {
    throw new Error("Bitwarden settings not configured");
  }
  const rootName = settings!.templatesRootName || "Templates";
  const collections = await listCollections(settings!);
  let col = findCollectionByName(collections, rootName);
  if (!col) {
    col = await ensureRootCollection(settings!, rootName);
  }
  return { settings: settings!, collectionId: col.id };
}
