export const SKIN_PHOTO_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const SKIN_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type PhotoAnalysisLanguage = "CN" | "EN";

export type SkinPhotoAnalysisResult = {
  status: "success" | "failed";
  assistantText: string;
  rawUpload?: unknown;
  rawAnalysis?: unknown;
  photoId?: string | null;
  qcStatus?: string | null;
  failureClass?: string | null;
  requestId?: string | null;
};

type AnalyzeSkinPhotoOptions = {
  languageHint?: string | null;
  userId?: string | null;
  sourceAgent: "shopping_agent" | "creator_agent";
  creatorId?: string | null;
};

function flagEnabled(value: string | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isCreatorSkinPhotoUploadBetaEnabled(): boolean {
  return flagEnabled(process.env.NEXT_PUBLIC_CREATOR_AGENT_PHOTO_UPLOAD_BETA);
}

function isLikelyChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

export function resolvePhotoAnalysisLanguage(hint?: string | null): PhotoAnalysisLanguage {
  if (hint && isLikelyChinese(hint)) return "CN";
  if (typeof window !== "undefined") {
    const lang = String(window.navigator?.language || "").trim().toLowerCase();
    if (lang.startsWith("zh")) return "CN";
  }
  return "EN";
}

export function validateSkinPhotoFile(
  file: Pick<File, "size" | "type"> | null | undefined,
  language: PhotoAnalysisLanguage = "EN",
): string | null {
  if (!file) return null;
  if (!SKIN_PHOTO_ACCEPTED_TYPES.includes(String(file.type || "").toLowerCase())) {
    return language === "CN"
      ? "目前只支持 JPG、PNG 或 WEBP 皮肤照片。"
      : "Only JPG, PNG, or WEBP skin photos are supported.";
  }
  if (Number(file.size || 0) > SKIN_PHOTO_MAX_BYTES) {
    return language === "CN" ? "单张照片需小于 10MB。" : "Skin photos must be 10MB or smaller.";
  }
  return null;
}

function getOrCreateSkinPhotoSessionId(): string {
  if (typeof window === "undefined") return "skin-photo-server";
  const key = "pivota_skin_photo_session_id_v1";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `photo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function collectCards(value: unknown, seen = new WeakSet<object>()): any[] {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectCards(item, seen));

  const record = value as Record<string, any>;
  const direct = Array.isArray(record.cards) ? record.cards : [];
  const nested: any[] = [];
  for (const key of ["output", "result", "data", "analysis", "session"]) {
    if (record[key] && typeof record[key] === "object") nested.push(...collectCards(record[key], seen));
  }
  return [...direct, ...nested].filter((card) => isRecord(card));
}

function findCard(value: unknown, type: string): Record<string, any> | null {
  const normalized = type.toLowerCase();
  return collectCards(value).find((card) => String(card?.type || "").trim().toLowerCase() === normalized) || null;
}

function collectStatusTokens(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectStatusTokens(item, seen));

  const record = value as Record<string, any>;
  const tokens = typeof record.status === "string" ? [record.status.trim().toLowerCase()].filter(Boolean) : [];
  for (const key of ["output", "result", "data", "analysis", "session"]) {
    if (record[key] && typeof record[key] === "object") tokens.push(...collectStatusTokens(record[key], seen));
  }
  return tokens;
}

function hasUsedPhotos(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasUsedPhotos(item, seen));
  const record = value as Record<string, any>;
  if (record.used_photos === true || record.usedPhotos === true) return true;
  return Object.values(record).some((item) => hasUsedPhotos(item, seen));
}

function hasErrorCard(value: unknown): boolean {
  return collectCards(value).some((card) => {
    const type = String(card?.type || "").trim().toLowerCase();
    const status = String(card?.payload?.status || card?.status || "").trim().toLowerCase();
    return type.includes("error") || status === "failed";
  });
}

function normalizePhotoQcToken(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  const token = raw.includes(":") ? raw.split(":").pop() || raw : raw;
  if (["pass", "passed", "ok", "success", "succeeded"].includes(token)) return "passed";
  if (["degraded", "warn", "warning", "low"].includes(token)) return "degraded";
  if (["fail", "failed", "reject", "rejected", "bad"].includes(token)) return "failed";
  return token;
}

function collectPhotoQcTokens(value: unknown, seen = new WeakSet<object>()): string[] {
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectPhotoQcTokens(item, seen));

  const record = value as Record<string, any>;
  const out: string[] = [];
  for (const key of ["qc_status", "qcStatus", "photo_qc", "photoQc"]) {
    const raw = record[key];
    const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
    for (const item of values) {
      const token = normalizePhotoQcToken(item);
      if (token) out.push(token);
    }
  }
  for (const item of Object.values(record)) out.push(...collectPhotoQcTokens(item, seen));
  return out;
}

export function isSkinPhotoAnalysisSuccess(value: unknown): boolean {
  const statuses = collectStatusTokens(value);
  const hasSuccessStatus = statuses.some((status) => status === "success" || status === "succeeded");
  const qcTokens = collectPhotoQcTokens(value);
  const qcPasses = qcTokens.length === 0 || qcTokens.every((token) => token === "passed");
  return hasSuccessStatus && hasUsedPhotos(value) && qcPasses && !hasErrorCard(value);
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!isRecord(item)) return "";
      return pickString(item.text, item.label, item.title, item.name, item.summary, item.description, item.detail) || "";
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildTextFromAnalysis(value: unknown, language: PhotoAnalysisLanguage): string {
  const story = findCard(value, "analysis_story_v2") || findCard(value, "analysis_summary");
  const modules = findCard(value, "photo_modules_v1");
  const payload = isRecord(story?.payload) ? story.payload : {};
  const ui = isRecord(payload.ui_card_v1) ? payload.ui_card_v1 : {};
  const modulesPayload = isRecord(modules?.payload) ? modules.payload : {};
  const headline =
    pickString(ui.headline, payload.headline, payload.title, modulesPayload.headline) ||
    (language === "CN" ? "皮肤照片分析完成。" : "Skin photo analysis is ready.");
  const summary = pickString(
    ui.summary,
    ui.body,
    payload.summary,
    payload.overall_summary,
    payload.verdict,
    modulesPayload.summary,
  );
  const findings = [
    ...normalizeList(ui.key_findings),
    ...normalizeList(ui.findings),
    ...normalizeList(payload.primary_findings),
    ...normalizeList(payload.findings),
    ...normalizeList(modulesPayload.modules),
  ].slice(0, 4);
  const boundary =
    language === "CN"
      ? "这不是医疗诊断；如果有持续红肿、疼痛或快速恶化，请咨询皮肤科医生。"
      : "This is not a medical diagnosis; see a dermatologist for persistent redness, pain, or rapid worsening.";
  return [headline, summary, ...findings.map((item) => `- ${item}`), boundary].filter(Boolean).join("\n");
}

function extractAssistantText(value: unknown, language: PhotoAnalysisLanguage): string {
  if (!isRecord(value)) return buildTextFromAnalysis(value, language);
  return (
    pickString(
      value.assistant_text,
      value.assistant_message,
      value.reply,
      value.message,
      value.output?.reply,
      value.output?.final_text,
    ) || buildTextFromAnalysis(value, language)
  );
}

function failureMessage(language: PhotoAnalysisLanguage, reason?: string | null): string {
  const suffix = reason ? ` (${reason})` : "";
  return language === "CN"
    ? `这张照片暂时没有完成有效皮肤分析${suffix}。请换一张清晰、自然光、无遮挡的面部皮肤照片，或直接用文字描述肤况。`
    : `This photo did not complete a usable skin analysis${suffix}. Try a clear, naturally lit, unobstructed skin photo, or describe your skin in text.`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { status: "failed", message: text };
  }
}

function extractRequestId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return pickString(value.request_id, value.requestId, value.metadata?.request_id);
}

export async function analyzeSkinPhotoFile(
  file: File,
  options: AnalyzeSkinPhotoOptions,
): Promise<SkinPhotoAnalysisResult> {
  const language = resolvePhotoAnalysisLanguage(options.languageHint);
  const validation = validateSkinPhotoFile(file, language);
  if (validation) return { status: "failed", assistantText: validation };

  const uid = getOrCreateSkinPhotoSessionId();
  const form = new FormData();
  form.append("slot_id", "front");
  form.append("consent", "true");
  form.append("photo", file);

  const uploadRes = await fetch("/api/photo-analysis/upload", {
    method: "POST",
    headers: {
      "X-Lang": language,
      "X-Aurora-UID": uid,
    },
    body: form,
  });
  const uploadBody = await readJson(uploadRes);
  const confirm = findCard(uploadBody, "photo_confirm");
  const photoId = pickString(confirm?.payload?.photo_id, confirm?.payload?.photoId, (uploadBody as any)?.photo_id);
  const qcStatus = pickString(confirm?.payload?.qc_status, confirm?.payload?.qcStatus, "passed");
  if (!uploadRes.ok || !photoId) {
    return {
      status: "failed",
      assistantText: failureMessage(language, pickString((uploadBody as any)?.error, (uploadBody as any)?.message)),
      rawUpload: uploadBody,
      qcStatus,
      failureClass: pickString((uploadBody as any)?.error, (uploadBody as any)?.failure_class),
      requestId: extractRequestId(uploadBody),
    };
  }

  const normalizedQc = String(qcStatus || "").trim().toLowerCase();
  if (normalizedQc && normalizePhotoQcToken(normalizedQc) !== "passed") {
    return {
      status: "failed",
      assistantText: failureMessage(language, `qc_status=${qcStatus}`),
      rawUpload: uploadBody,
      photoId,
      qcStatus,
      requestId: extractRequestId(uploadBody),
    };
  }

  const analysisPayload = {
    use_photo: true,
    photos: [{ photo_id: photoId, slot_id: "front", qc_status: qcStatus || "passed" }],
    profile: {},
    currentRoutine: {},
    metadata: {
      source_agent: options.sourceAgent,
      ui_source: options.sourceAgent === "creator_agent" ? "creator-agent-ui" : "shopping-agent-ui",
      photo_upload_beta: true,
      ...(options.creatorId ? { creator_id: options.creatorId } : {}),
      ...(options.userId ? { user_id: options.userId } : {}),
    },
  };

  const analysisRes = await fetch("/api/photo-analysis/skin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lang": language,
      "X-Aurora-UID": uid,
    },
    body: JSON.stringify(analysisPayload),
  });
  const analysisBody = await readJson(analysisRes);
  if (!analysisRes.ok || !isSkinPhotoAnalysisSuccess(analysisBody)) {
    return {
      status: "failed",
      assistantText: failureMessage(
        language,
        pickString((analysisBody as any)?.failure_class, (analysisBody as any)?.error, (analysisBody as any)?.message),
      ),
      rawUpload: uploadBody,
      rawAnalysis: analysisBody,
      photoId,
      qcStatus,
      failureClass: pickString((analysisBody as any)?.failure_class, (analysisBody as any)?.error),
      requestId: extractRequestId(analysisBody) || extractRequestId(uploadBody),
    };
  }

  return {
    status: "success",
    assistantText: extractAssistantText(analysisBody, language),
    rawUpload: uploadBody,
    rawAnalysis: analysisBody,
    photoId,
    qcStatus,
    requestId: extractRequestId(analysisBody) || extractRequestId(uploadBody),
  };
}
