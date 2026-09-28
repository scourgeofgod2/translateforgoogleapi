import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { translateRouter } from "./routes/translate.js";
import { languagesRouter } from "./routes/languages.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    projectId: config.projectId,
    location: config.location,
    batchEnabled: Boolean(config.gcsBucket),
  });
});

app.use("/api/languages", languagesRouter);
app.use("/api/translate", translateRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(
    `doctsltr server listening on http://localhost:${config.port} (project=${config.projectId}, location=${config.location}, batch=${Boolean(config.gcsBucket)})`
  );
});
