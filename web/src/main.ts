import Alpine from "alpinejs";

declare global {
  interface Window {
    Alpine: typeof Alpine;
  }
}

window.Alpine = Alpine;

type Lang = {
  code: string;
  name: string;
  supportSource: boolean;
  supportTarget: boolean;
};

type Job = {
  id: string;
  state: string;
  totalPages?: number;
  failedPages?: number;
  error?: string;
  targetLanguageCodes: string[];
};

const FALLBACK_LANGS: Lang[] = [
  { code: "tr", name: "Turkish", supportSource: true, supportTarget: true },
  { code: "en", name: "English", supportSource: true, supportTarget: true },
  { code: "de", name: "German", supportSource: true, supportTarget: true },
  { code: "fr", name: "French", supportSource: true, supportTarget: true },
  { code: "es", name: "Spanish", supportSource: true, supportTarget: true },
  { code: "ar", name: "Arabic", supportSource: true, supportTarget: true },
  { code: "ru", name: "Russian", supportSource: true, supportTarget: true },
  { code: "ja", name: "Japanese", supportSource: true, supportTarget: true },
  { code: "zh", name: "Chinese (Simplified)", supportSource: true, supportTarget: true },
  { code: "ko", name: "Korean", supportSource: true, supportTarget: true },
  { code: "it", name: "Italian", supportSource: true, supportTarget: true },
  { code: "pt", name: "Portuguese", supportSource: true, supportTarget: true },
  { code: "nl", name: "Dutch", supportSource: true, supportTarget: true },
  { code: "pl", name: "Polish", supportSource: true, supportTarget: true },
  { code: "uk", name: "Ukrainian", supportSource: true, supportTarget: true },
];

const ACCEPTED_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"];
const MAX_SIZE = 20 * 1024 * 1024;

function isAccepted(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return ACCEPTED_EXT.includes(ext);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

Alpine.data("app", () => ({
  // shared
  mode: "online" as "online" | "batch",
  languages: [] as Lang[],
  health: { projectId: "", location: "", batchEnabled: false },
  statusMessage: "",
  statusIsError: false,
  statusTimer: 0 as ReturnType<typeof setTimeout> | 0,

  // online
  onlineFile: null as File | null,
  onlineDragging: false,
  onlineTarget: "",
  onlineSource: "",
  onlineBusy: false,
  online: {
    isNativePdf: false,
    shadowRemoval: false,
    rotationCorrection: false,
  },

  // batch
  batchFiles: [] as File[],
  batchDragging: false,
  batchTarget: "",
  batchTargets: [] as string[],
  batchSource: "",
  batchBusy: false,
  batch: {
    shadowRemoval: false,
    rotationCorrection: false,
    convertPdfToDocx: false,
  },
  activeJob: null as Job | null,
  pollTimer: 0 as ReturnType<typeof setInterval> | 0,

  get targetLanguages() {
    return this.languages.filter((l) => l.supportTarget);
  },
  get sourceLanguages() {
    return this.languages.filter((l) => l.supportSource);
  },

  async init() {
    this.languages = FALLBACK_LANGS;
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        this.health = await res.json();
      }
      const langRes = await fetch("/api/languages");
      if (langRes.ok) {
        const data = await langRes.json();
        if (Array.isArray(data.languages) && data.languages.length > 0) {
          this.languages = data.languages;
        }
      }
    } catch {
      // keep fallback languages
    }
  },

  formatSize,
  langName(code: string) {
    return this.languages.find((l) => l.code === code)?.name || code;
  },

  setStatus(msg: string, isError = false) {
    this.statusMessage = msg;
    this.statusIsError = isError;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    if (!isError) {
      this.statusTimer = setTimeout(() => {
        this.statusMessage = "";
      }, 6000);
    }
  },

  // ---- online ----
  onOnlineSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setOnlineFile(file);
    input.value = "";
  },
  onOnlineDrop(e: DragEvent) {
    this.onlineDragging = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.setOnlineFile(file);
  },
  setOnlineFile(file: File) {
    if (!isAccepted(file)) {
      this.setStatus(`Desteklenmeyen format: ${file.name}`, true);
      return;
    }
    if (file.size > MAX_SIZE) {
      this.setStatus(`Dosya çok büyük (max 20 MB): ${file.name}`, true);
      return;
    }
    this.onlineFile = file;
  },

  async runOnline() {
    if (!this.onlineFile || !this.onlineTarget) return;
    this.onlineBusy = true;
    this.setStatus("Çevriliyor…");
    try {
      const fd = new FormData();
      fd.append("file", this.onlineFile);
      fd.append("targetLanguageCode", this.onlineTarget);
      if (this.onlineSource) fd.append("sourceLanguageCode", this.onlineSource);
      if (this.online.isNativePdf) fd.append("isTranslateNativePdfOnly", "true");
      if (this.online.shadowRemoval)
        fd.append("enableShadowRemovalNativePdf", "true");
      if (this.online.rotationCorrection)
        fd.append("enableRotationCorrection", "true");

      const res = await fetch("/api/translate/online", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }

      const blob = await res.blob();
      const detected = res.headers.get("X-Detected-Language");
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `translated.${this.onlineTarget}`;
      triggerDownload(blob, filename);

      const msg = detected
        ? `İndirildi (algılanan kaynak: ${detected})`
        : "İndirildi";
      this.setStatus(msg);
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    } finally {
      this.onlineBusy = false;
    }
  },

  // ---- batch ----
  onBatchSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.addBatchFiles(files);
    input.value = "";
  },
  onBatchDrop(e: DragEvent) {
    this.batchDragging = false;
    const files = Array.from(e.dataTransfer?.files || []);
    this.addBatchFiles(files);
  },
  addBatchFiles(files: File[]) {
    const valid = files.filter((f) => {
      if (!isAccepted(f)) {
        this.setStatus(`Desteklenmeyen format: ${f.name}`, true);
        return false;
      }
      if (f.size > MAX_SIZE) {
        this.setStatus(`Dosya çok büyük (max 20 MB): ${f.name}`, true);
        return false;
      }
      return true;
    });
    this.batchFiles = [...this.batchFiles, ...valid].slice(0, 100);
  },

  removeBatchTarget(code: string) {
    this.batchTargets = this.batchTargets.filter((c) => c !== code);
  },

  addBatchTarget() {
    const code = this.batchTarget;
    if (code && !this.batchTargets.includes(code) && this.batchTargets.length < 10) {
      this.batchTargets = [...this.batchTargets, code];
    }
    this.batchTarget = "";
  },

  async runBatch() {
    if (this.batchFiles.length === 0 || this.batchTargets.length === 0) return;

    // When user selects a language in the dropdown, add it
    if (this.batchTarget && !this.batchTargets.includes(this.batchTarget)) {
      this.batchTargets.push(this.batchTarget);
      this.batchTarget = "";
    }

    this.batchBusy = true;
    this.setStatus("Batch işi gönderiliyor…");
    try {
      const fd = new FormData();
      for (const f of this.batchFiles) fd.append("files", f);
      fd.append("targetLanguageCodes", this.batchTargets.join(","));
      if (this.batchSource) fd.append("sourceLanguageCode", this.batchSource);
      if (this.batch.shadowRemoval)
        fd.append("enableShadowRemovalNativePdf", "true");
      if (this.batch.rotationCorrection)
        fd.append("enableRotationCorrection", "true");
      if (this.batch.convertPdfToDocx) fd.append("convertPdfToDocx", "true");

      const res = await fetch("/api/translate/batch", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }

      const data = await res.json();
      this.activeJob = data.job;
      this.setStatus("Batch işi başlatıldı");
      this.startPolling();
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    } finally {
      this.batchBusy = false;
    }
  },

  startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(async () => {
      if (!this.activeJob) return;
      if (
        this.activeJob.state === "succeeded" ||
        this.activeJob.state === "failed"
      ) {
        clearInterval(this.pollTimer);
        this.pollTimer = 0;
        return;
      }
      await this.refreshJob();
    }, 4000);
  },

  async refreshJob() {
    if (!this.activeJob) return;
    try {
      const res = await fetch(`/api/translate/batch/${this.activeJob.id}`);
      if (!res.ok) throw new Error("Job status failed");
      const data = await res.json();
      this.activeJob = data.job;
      if (data.job.state === "succeeded") {
        this.setStatus("Batch işi tamamlandı");
        if (this.pollTimer) clearInterval(this.pollTimer);
      } else if (data.job.state === "failed") {
        this.setStatus(data.job.error || "Batch işi başarısız", true);
        if (this.pollTimer) clearInterval(this.pollTimer);
      }
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    }
  },

  async downloadBatch() {
    if (!this.activeJob) return;
    try {
      const res = await fetch(
        `/api/translate/batch/${this.activeJob.id}/download`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || res.statusText);
      }

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        for (const f of data.files || []) {
          const bin = atob(f.contentBase64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          triggerDownload(new Blob([arr], { type: f.mimeType }), f.name);
        }
        this.setStatus(`${(data.files || []).length} dosya indirildi`);
      } else {
        const blob = await res.blob();
        const cd = res.headers.get("Content-Disposition") || "";
        const match = cd.match(/filename="([^"]+)"/);
        triggerDownload(blob, match?.[1] || "translated-output");
        this.setStatus("İndirildi");
      }
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    }
  },

  async deleteJob() {
    if (!this.activeJob) return;
    try {
      await fetch(`/api/translate/batch/${this.activeJob.id}`, {
        method: "DELETE",
      });
      this.activeJob = null;
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.setStatus("İş temizlendi");
    } catch (err) {
      this.setStatus(err instanceof Error ? err.message : String(err), true);
    }
  },
}));

Alpine.start();
