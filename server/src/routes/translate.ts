import { Router } from "express";
import { uploadSingle, uploadMultiple } from "../middleware/upload.js";
import { HttpError } from "../middleware/errorHandler.js";
import { translateDocumentOnline } from "../services/onlineTranslate.js";
import {
  startBatchTranslate,
  getJob,
  listJobs,
  refreshJob,
  downloadJobOutput,
  cleanupJob,
} from "../services/batchTranslate.js";
import { ALLOWED_MIME_TYPES } from "../types.js";

export const translateRouter = Router();

function parseBool(value: unknown): boolean {
  return value === "true" || value === true;
}

function requireFile(file: Express.Multer.File | undefined) {
  if (!file) {
    throw new HttpError(400, "No file uploaded");
  }
  if (!ALLOWED_MIME_TYPES[file.mimetype]) {
    throw new HttpError(400, `Unsupported file type: ${file.mimetype}`);
  }
}

// POST /api/translate/online — single file, synchronous
translateRouter.post(
  "/online",
  uploadSingle.single("file"),
  async (req, res, next) => {
    try {
      const file = req.file;
      requireFile(file);

      const body = req.body as Record<string, string | undefined>;
      const targetLanguageCode = body.targetLanguageCode;
      if (!targetLanguageCode) {
        throw new HttpError(400, "targetLanguageCode is required");
      }

      const result = await translateDocumentOnline(
        {
          content: file!.buffer,
          mimeType: file!.mimetype,
          fileName: file!.originalname,
        },
        {
          sourceLanguageCode: body.sourceLanguageCode || undefined,
          targetLanguageCode,
          isTranslateNativePdfOnly: parseBool(body.isTranslateNativePdfOnly),
          enableShadowRemovalNativePdf: parseBool(
            body.enableShadowRemovalNativePdf
          ),
          enableRotationCorrection: parseBool(body.enableRotationCorrection),
        }
      );

      const baseName = file!.originalname.replace(/\.[^.]+$/, "");
      const ext =
        ALLOWED_MIME_TYPES[result.mimeType] ||
        ALLOWED_MIME_TYPES[file!.mimetype] ||
        "";
      const outputName = `${baseName}.${targetLanguageCode}${ext}`;

      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${outputName}"`
      );
      if (result.detectedLanguageCode) {
        res.setHeader("X-Detected-Language", result.detectedLanguageCode);
      }
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/translate/batch — multiple files, returns jobId
translateRouter.post(
  "/batch",
  uploadMultiple.array("files", 100),
  async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (files.length === 0) {
        throw new HttpError(400, "No files uploaded");
      }

      const body = req.body as Record<string, string | undefined>;
      const targetLanguageCodes = (body.targetLanguageCodes || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (targetLanguageCodes.length === 0) {
        throw new HttpError(400, "targetLanguageCodes is required");
      }
      if (targetLanguageCodes.length > 10) {
        throw new HttpError(400, "Maximum 10 target languages per batch");
      }

      const job = await startBatchTranslate(
        files.map((f) => ({
          buffer: f.buffer,
          originalName: f.originalname,
          mimeType: f.mimetype,
        })),
        {
          sourceLanguageCode: body.sourceLanguageCode || undefined,
          targetLanguageCodes,
          enableShadowRemovalNativePdf: parseBool(
            body.enableShadowRemovalNativePdf
          ),
          enableRotationCorrection: parseBool(body.enableRotationCorrection),
          convertPdfToDocx: parseBool(body.convertPdfToDocx),
        }
      );

      res.status(202).json({ job });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/translate/batch — list jobs
translateRouter.get("/batch", (_req, res) => {
  res.json({ jobs: listJobs() });
});

// GET /api/translate/batch/:id — job status
translateRouter.get("/batch/:id", async (req, res, next) => {
  try {
    const job = getJob(req.params.id);
    if (!job) {
      throw new HttpError(404, "Job not found");
    }
    await refreshJob(job);
    res.json({ job });
  } catch (err) {
    next(err);
  }
});

// GET /api/translate/batch/:id/download — download all outputs as a simple multi-file response
// Returns JSON with base64 files if multiple, or streams a single file directly.
translateRouter.get("/batch/:id/download", async (req, res, next) => {
  try {
    const job = getJob(req.params.id);
    if (!job) {
      throw new HttpError(404, "Job not found");
    }
    await refreshJob(job);
    if (job.state !== "succeeded") {
      throw new HttpError(409, `Job not ready (state: ${job.state})`);
    }

    const outputs = await downloadJobOutput(job.id);
    if (outputs.length === 0) {
      throw new HttpError(404, "No output files found");
    }

    if (outputs.length === 1) {
      const file = outputs[0];
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.name}"`
      );
      res.send(file.buffer);
      return;
    }

    // Multiple files: return JSON with base64 payloads
    res.json({
      files: outputs.map((f) => ({
        name: f.name,
        mimeType: f.mimeType,
        contentBase64: f.buffer.toString("base64"),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/translate/batch/:id — cleanup job artifacts
translateRouter.delete("/batch/:id", async (req, res, next) => {
  try {
    const job = getJob(req.params.id);
    if (!job) {
      throw new HttpError(404, "Job not found");
    }
    await cleanupJob(job.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
