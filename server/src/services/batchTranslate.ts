import { v4 as uuidv4 } from "uuid";
import type { protos } from "@google-cloud/translate";
import { config, requireGcsBucket } from "../config.js";
import { translationClient, parentPath } from "./translateClient.js";
import {
  uploadBuffer,
  downloadFile,
  listFiles,
  deletePrefix,
} from "./storage.js";
import type { BatchTranslateOptions, BatchJob, JobState } from "../types.js";

type IBatchTranslateDocumentRequest =
  protos.google.cloud.translation.v3.IBatchTranslateDocumentRequest;

const jobs = new Map<string, BatchJob>();
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function getJob(id: string): BatchJob | undefined {
  return jobs.get(id);
}

export function listJobs(): BatchJob[] {
  return [...jobs.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function startBatchTranslate(
  files: Array<{ buffer: Buffer; originalName: string; mimeType: string }>,
  options: BatchTranslateOptions
): Promise<BatchJob> {
  requireGcsBucket();

  const jobId = uuidv4();
  const inputPrefix = `in/${jobId}/`;
  const outputPrefix = `out/${jobId}/`;

  const job: BatchJob = {
    id: jobId,
    operationName: "",
    state: "uploading",
    createdAt: new Date().toISOString(),
    targetLanguageCodes: options.targetLanguageCodes,
    inputPrefix,
    outputPrefix,
    fileNames: files.map((f) => f.originalName),
  };
  jobs.set(jobId, job);

  try {
    const inputUris: string[] = [];
    for (const file of files) {
      const objectPath = `${inputPrefix}${sanitizeName(file.originalName)}`;
      const uri = await uploadBuffer(file.buffer, objectPath, file.mimeType);
      inputUris.push(uri);
    }

    const request: IBatchTranslateDocumentRequest = {
      parent: parentPath(),
      targetLanguageCodes: options.targetLanguageCodes,
      inputConfigs: inputUris.map((uri) => ({ gcsSource: { inputUri: uri } })),
      outputConfig: {
        gcsDestination: {
          outputUriPrefix: `gs://${config.gcsBucket}/${outputPrefix}`,
        },
      },
    };

    if (options.sourceLanguageCode) {
      request.sourceLanguageCode = options.sourceLanguageCode;
    }
    if (options.enableShadowRemovalNativePdf) {
      request.enableShadowRemovalNativePdf = true;
    }
    if (options.enableRotationCorrection) {
      request.enableRotationCorrection = true;
    }
    if (options.convertPdfToDocx) {
      request.formatConversions = {
        "application/pdf": DOCX_MIME,
      };
    }

    const [operation] = await translationClient.batchTranslateDocument(request);
    job.operationName = operation.name || "";
    job.state = "running";
  } catch (err) {
    job.state = "failed";
    job.error = err instanceof Error ? err.message : String(err);
  }

  return job;
}

export async function refreshJob(job: BatchJob): Promise<BatchJob> {
  if (job.state !== "running" || !job.operationName) {
    return job;
  }

  try {
    const [operation] = await translationClient.operationsClient.getOperation({
      name: job.operationName,
    } as Parameters<
      typeof translationClient.operationsClient.getOperation
    >[0]);

    const meta = operation.metadata as
      | protos.google.cloud.translation.v3.IBatchTranslateDocumentMetadata
      | Record<string, unknown>
      | undefined
      | null;

    const totalPages = (meta as { totalPages?: number } | null)?.totalPages;
    const failedPages = (meta as { failedPages?: number } | null)?.failedPages;
    if (typeof totalPages === "number") {
      job.totalPages = totalPages;
    }
    if (typeof failedPages === "number") {
      job.failedPages = failedPages;
    }

    if (operation.done) {
      if (operation.error) {
        job.state = "failed";
        job.error =
          operation.error.message ||
          `Operation failed (code ${operation.error.code})`;
      } else {
        job.state = "succeeded";
      }
    }
  } catch (err) {
    job.state = "failed";
    job.error = err instanceof Error ? err.message : String(err);
  }

  return job;
}

export async function downloadJobOutput(
  jobId: string
): Promise<Array<{ name: string; buffer: Buffer; mimeType: string }>> {
  const job = jobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  if (job.state !== "succeeded") {
    throw new Error(`Job is not finished (state: ${job.state})`);
  }

  const objectNames = await listFiles(job.outputPrefix);
  const results: Array<{ name: string; buffer: Buffer; mimeType: string }> = [];

  for (const objectName of objectNames) {
    const buffer = await downloadFile(objectName);
    const baseName = objectName.split("/").pop() || objectName;
    results.push({
      name: baseName,
      buffer,
      mimeType: guessMime(baseName),
    });
  }

  return results;
}

export async function cleanupJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;
  await Promise.all([
    deletePrefix(job.inputPrefix),
    deletePrefix(job.outputPrefix),
  ]);
  jobs.delete(jobId);
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\]/g, "_");
}

function guessMime(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return DOCX_MIME;
    case "doc":
      return "application/msword";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    default:
      return "application/octet-stream";
  }
}
