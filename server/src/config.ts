import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  projectId: required("GCP_PROJECT_ID"),
  location: process.env.GCP_LOCATION || "us-central1",
  gcsBucket: process.env.GCS_BUCKET || "",
  port: Number(process.env.PORT || 3000),
};

export function requireGcsBucket(): string {
  if (!config.gcsBucket) {
    throw new Error(
      "GCS_BUCKET is required for batch translation. Set it in .env"
    );
  }
  return config.gcsBucket;
}
