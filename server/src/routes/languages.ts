import { Router } from "express";
import { translationClient, parentPath } from "../services/translateClient.js";

export const languagesRouter = Router();

languagesRouter.get("/", async (_req, res, next) => {
  try {
    const [response] = await translationClient.getSupportedLanguages({
      parent: parentPath(),
      displayLanguageCode: "en",
    });

    const languages = (response.languages || []).map((lang) => ({
      code: lang.languageCode,
      name: lang.displayName,
      supportSource: Boolean(lang.supportSource),
      supportTarget: Boolean(lang.supportTarget),
    }));

    res.json({ languages });
  } catch (err) {
    next(err);
  }
});
