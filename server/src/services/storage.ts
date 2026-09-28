import { Storage } from "@google-cloud/storage";
import { config, requireGcsBucket } from "../config.js";

const storage = new Storage();

export function bucket() {
  return storage.bucket(requireGcsBucket());
}

export async function uploadBuffer(
  buffer: Buffer,
  objectPath: string,
  contentType: string
): Promise<string> {
  const file = bucket().file(objectPath);
  await file.save(buffer, {
    contentType,
    resumable: false,
  });
  return `gs://${config.gcsBucket}/${objectPath}`;
}

export async function downloadFile(objectPath: string): Promise<Buffer> {
  const file = bucket().file(objectPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectPath}`);
  }
  const [contents] = await file.download();
  return contents;
}

export async function listFiles(prefix: string): Promise<string[]> {
  const [files] = await bucket().getFiles({ prefix });
  return files.map((f) => f.name);
}

export async function deletePrefix(prefix: string): Promise<void> {
  const [files] = await bucket().getFiles({ prefix });
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
}
