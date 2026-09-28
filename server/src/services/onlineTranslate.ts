import type { protos } from "@google-cloud/translate";
import { translationClient, parentPath } from "./translateClient.js";
import type { TranslateOptions } from "../types.js";

type ITranslateDocumentRequest =
  protos.google.cloud.translation.v3.ITranslateDocumentRequest;

export interface OnlineTranslateResult {
  buffer: Buffer;
  mimeType: string;
  detectedLanguageCode?: string;
}

export async function translateDocumentOnline(
  input: {
    content: Buffer;
    mimeType: string;
    fileName: string;
  },
  options: TranslateOptions
): Promise<OnlineTranslateResult> {
  const request: ITranslateDocumentRequest = {
    parent: parentPath(),
    targetLanguageCode: options.targetLanguageCode,
    documentInputConfig: {
      content: input.content,
      mimeType: input.mimeType,
    },
  };

  if (options.sourceLanguageCode) {
    request.sourceLanguageCode = options.sourceLanguageCode;
  }
  if (options.isTranslateNativePdfOnly) {
    request.isTranslateNativePdfOnly = true;
  }
  if (options.enableShadowRemovalNativePdf) {
    request.enableShadowRemovalNativePdf = true;
  }
  if (options.enableRotationCorrection) {
    request.enableRotationCorrection = true;
  }

  const [response] = await translationClient.translateDocument(request);

  const translation = response.documentTranslation;
  if (!translation?.byteStreamOutputs?.[0]) {
    throw new Error("Translation returned no document content");
  }

  const buffer = Buffer.from(translation.byteStreamOutputs[0] as Uint8Array);

  return {
    buffer,
    mimeType: translation.mimeType || input.mimeType,
    detectedLanguageCode: translation.detectedLanguageCode || undefined,
  };
}
