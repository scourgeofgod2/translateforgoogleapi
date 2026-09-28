import multer from "multer";
import type { Request } from "express";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../types.js";

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  if (ALLOWED_MIME_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed: ${Object.keys(
          ALLOWED_MIME_TYPES
        ).join(", ")}`
      )
    );
  }
}

export const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter,
});

export const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 100 },
  fileFilter,
});
