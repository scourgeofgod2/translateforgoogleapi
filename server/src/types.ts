export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    ".pptx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export interface TranslateOptions {
  sourceLanguageCode?: string;
  targetLanguageCode: string;
  isTranslateNativePdfOnly?: boolean;
  enableShadowRemovalNativePdf?: boolean;
  enableRotationCorrection?: boolean;
}

export interface BatchTranslateOptions {
  sourceLanguageCode?: string;
  targetLanguageCodes: string[];
  enableShadowRemovalNativePdf?: boolean;
  enableRotationCorrection?: boolean;
  convertPdfToDocx?: boolean;
}

export type JobState =
  | "uploading"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface BatchJob {
  id: string;
  operationName: string;
  state: JobState;
  createdAt: string;
  targetLanguageCodes: string[];
  totalPages?: number;
  failedPages?: number;
  error?: string;
  inputPrefix: string;
  outputPrefix: string;
  fileNames: string[];
}
