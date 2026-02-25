"use client";

// NOTE: Kept as a separate client component so `page.tsx` can wrap it in `Suspense`
// (required by Next.js when using `useSearchParams`).

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  accountsMe,
  attachReviewMediaFromUser,
  createReviewFromUser,
  getPdpV2Personalization,
  getReviewEligibility,
  type AccountsUser,
  type UgcCapabilities,
} from "@/lib/accountsClient";
import type { PDPPayload } from "@/features/pdp/types";
import { pdpTracking } from "@/features/pdp/tracking";
import { cn } from "@/lib/utils";

const MAX_MEDIA_FILES = 5;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_MEDIA_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

type TokenSubject = {
  merchant_id: string;
  platform: string;
  platform_product_id: string;
  variant_id?: string;
};

type SubmissionTokenPayload = {
  exp?: number;
  jti?: string;
  merchant_id?: string;
  subjects?: TokenSubject[];
  verification?: string;
};

type ReviewEligibility = {
  eligible: boolean;
  reason?: string;
  canRate?: boolean;
  ratingReason?: string;
  action?: "CREATE" | "UPGRADE" | "ADD_RATING";
};

function b64UrlToUtf8(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  return atob(padded);
}

function decodeSubmissionToken(token: string): SubmissionTokenPayload | null {
  const [payloadPart] = (token || "").split(".", 1);
  if (!payloadPart) return null;
  try {
    const json = b64UrlToUtf8(payloadPart);
    return JSON.parse(json) as SubmissionTokenPayload;
  } catch {
    return null;
  }
}

function parseInvitationTokenFromHash(hash: string): string | null {
  const h = (hash || "").replace(/^#/, "").trim();
  if (!h) return null;
  const params = new URLSearchParams(h);
  const t = params.get("invitation_token");
  return t ? t.trim() : null;
}

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => {
        const v = idx + 1;
        const active = v <= value;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            className={cn(
              "p-1 rounded-lg transition-colors",
              disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-black/5",
            )}
            onClick={() => onChange(v)}
            aria-label={`Rate ${v} star${v === 1 ? "" : "s"}`}
          >
            <Star
              className={cn(
                "h-6 w-6",
                active ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground",
              )}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm text-muted-foreground">{value}/5</span>
    </div>
  );
}

async function fetchCreatorPdp(args: {
  productId: string;
  merchantId?: string | null;
}): Promise<{ payload: PDPPayload; subject: any | null } | null> {
  const res = await fetch("/api/creator-agent/pdp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: args.productId,
      ...(args.merchantId ? { merchantId: args.merchantId } : {}),
      include: [],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const payload = (data && typeof data === "object" ? (data as any).pdp_payload : null) as PDPPayload | null;
  if (!payload) return null;
  const subject = (data && typeof data === "object" ? (data as any).subject : null) || null;
  return { payload, subject };
}

async function fetchProductDetail(args: { merchantId: string; productId: string }) {
  const res = await fetch("/api/creator-agent/product-detail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantId: args.merchantId, productId: args.productId }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data && typeof data === "object" ? (data as any).product : null) as any;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function inferPlatformFromProductId(productId: string): string | null {
  const pid = String(productId || "").trim();
  if (!pid) return null;

  // Shopify product ids are typically numeric strings (often 10-14 digits).
  if (/^\d{10,}$/.test(pid) || /^gid:\/\/shopify\//.test(pid)) return "shopify";

  // Wix ids are commonly UUID-like.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid)) {
    return "wix";
  }

  return null;
}

function parsePlatformFromProductKey(productKey: string): string | null {
  const key = String(productKey || "").trim();
  if (!key) return null;
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const platform = key.slice(0, idx).trim();
  return platform || null;
}

async function fetchSubjectRefFromProductDetail(args: {
  merchantId: string;
  productId: string;
}): Promise<{ platform: string; platform_product_id: string } | null> {
  const merchantId = String(args.merchantId || "").trim();
  const productId = String(args.productId || "").trim();
  if (!merchantId || !productId) return null;

  const res = await fetch("/api/creator-agent/product-detail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantId, productId }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!isRecord(data)) return null;

  const rawAgentResponse = data.rawAgentResponse;
  const rawProduct = isRecord(rawAgentResponse)
    ? (rawAgentResponse as any).product || (rawAgentResponse as any).output?.product || (rawAgentResponse as any).product_raw || rawAgentResponse
    : null;

  if (!isRecord(rawProduct)) return null;

  const ref = (rawProduct as any).product_ref || (rawProduct as any).productRef || null;
  const platform =
    safeString((isRecord(ref) ? ref.platform : null) || (rawProduct as any).platform || (rawProduct as any).source_platform)
      .trim()
      .toLowerCase() || "";
  const platformProductId =
    safeString(
      (isRecord(ref) ? (ref.platform_product_id || ref.platformProductId) : null) ||
        (rawProduct as any).platform_product_id ||
        (rawProduct as any).platformProductId ||
        (rawProduct as any).platform_productId,
    ).trim() || productId;

  if (!platform || !platformProductId) return null;
  return { platform, platform_product_id: platformProductId };
}

function safeString(input: unknown): string {
  if (typeof input === "string") return input;
  if (input == null) return "";
  return String(input);
}

function isAllowedMediaFile(file: File): boolean {
  const type = String(file.type || "").trim().toLowerCase();
  if (type && ALLOWED_MEDIA_TYPES.has(type)) return true;
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.trim()
    .toLowerCase();
  return Boolean(ext && ALLOWED_MEDIA_EXTENSIONS.has(ext));
}

function readReviewIdFromCapabilities(caps?: UgcCapabilities | null): number | null {
  const rid = Number((caps as any)?.review?.review_id);
  if (!Number.isFinite(rid) || rid <= 0) return null;
  return Math.trunc(rid);
}

export default function WriteReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const productIdParam =
    (searchParams.get("product_id") || searchParams.get("productId") || "").trim() || null;
  const merchantIdParam =
    (searchParams.get("merchant_id") || searchParams.get("merchantId") || "").trim() || null;
  const entryParam = (searchParams.get("entry") || "").trim().toLowerCase();

  const [accountsUser, setAccountsUser] = useState<AccountsUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [submissionToken, setSubmissionToken] = useState<string | null>(null);
  const [submissionPayload, setSubmissionPayload] = useState<SubmissionTokenPayload | null>(null);
  const [selectedSubjectIdx, setSelectedSubjectIdx] = useState(0);
  const [product, setProduct] = useState<any | null>(null);
  const [inAppPdp, setInAppPdp] = useState<{ payload: PDPPayload; subject: any | null } | null>(null);
  const [inAppEligibility, setInAppEligibility] = useState<ReviewEligibility | null>(null);
  const [invitationEligibility, setInvitationEligibility] = useState<ReviewEligibility | null>(null);
  const [inAppCapabilities, setInAppCapabilities] = useState<UgcCapabilities | null>(null);
  const [invitationCapabilities, setInvitationCapabilities] = useState<UgcCapabilities | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: "info" | "error" } | null>(null);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedMediaFiles, setSelectedMediaFiles] = useState<File[]>([]);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const subjects = useMemo(() => submissionPayload?.subjects || [], [submissionPayload]);
  const activeSubject = subjects[selectedSubjectIdx] || null;
  const inAppExistingReviewId = useMemo(() => readReviewIdFromCapabilities(inAppCapabilities), [inAppCapabilities]);
  const invitationExistingReviewId = useMemo(
    () => readReviewIdFromCapabilities(invitationCapabilities),
    [invitationCapabilities],
  );
  const mode = useMemo(() => {
    if (invitationToken) return "invitation";
    if (productIdParam) return "in_app";
    return "missing";
  }, [invitationToken, productIdParam]);
  const accountsUserId = accountsUser?.id;

  const invitationProductIdForEligibility = useMemo(() => {
    if (!activeSubject) return "";
    return safeString(product?.product_id || activeSubject.platform_product_id).trim();
  }, [activeSubject, product?.product_id]);

  const invitationProductGroupIdForEligibility = useMemo(() => {
    const groupId = safeString(product?.product_group_id).trim();
    return groupId || null;
  }, [product?.product_group_id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setAuthChecking(true);
        const me = await accountsMe();
        if (!cancelled) setAccountsUser(me);
      } catch {
        if (!cancelled) setAccountsUser(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 4000 : 2500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  useEffect(() => {
    const fromHash = parseInvitationTokenFromHash(window.location.hash);
    const fromSession = productIdParam ? null : window.sessionStorage.getItem("pivota_reviews_invitation_token");
    const token = (fromHash || fromSession || "").trim() || null;

    if (fromHash) {
      window.sessionStorage.setItem("pivota_reviews_invitation_token", fromHash);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    if (productIdParam && !fromHash) {
      window.sessionStorage.removeItem("pivota_reviews_invitation_token");
      window.sessionStorage.removeItem("pivota_reviews_submission_token");
    }

    setInvitationToken(token);
  }, [productIdParam]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!invitationToken) {
        if (productIdParam) return;
        setLoading(false);
        return;
      }

      setLoading(true);

      const cachedToken = window.sessionStorage.getItem("pivota_reviews_submission_token");
      if (cachedToken) {
        const payload = decodeSubmissionToken(cachedToken);
        if (payload?.merchant_id && Array.isArray(payload.subjects) && payload.subjects.length) {
          setSubmissionToken(cachedToken);
          setSubmissionPayload(payload);
          setLoading(false);
          return;
        }
      }

      try {
        const res = await fetch("/api/reviews/buyer/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: invitationToken, ttl_seconds: 3600 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = (data?.detail || data?.error || data?.message || "Failed to exchange invitation") as string;
          throw new Error(detail);
        }

        const token = String(data?.submission_token || "").trim();
        const payload = decodeSubmissionToken(token);
        if (!token || !payload?.merchant_id || !Array.isArray(payload.subjects) || !payload.subjects.length) {
          throw new Error("Invalid submission token");
        }

        if (!cancelled) {
          window.sessionStorage.setItem("pivota_reviews_submission_token", token);
          setSubmissionToken(token);
          setSubmissionPayload(payload);
        }
      } catch (e) {
        console.error(e);
        setNotice({ message: (e as Error).message || "Unable to start review", tone: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [invitationToken, productIdParam]);

  useEffect(() => {
    let cancelled = false;

    async function loadProduct() {
      if (mode !== "invitation") {
        setProduct(null);
        setInvitationCapabilities(null);
        return;
      }
      if (!activeSubject) {
        setProduct(null);
        setInvitationCapabilities(null);
        return;
      }
      try {
        const p = await fetchProductDetail({
          merchantId: activeSubject.merchant_id,
          productId: activeSubject.platform_product_id,
        });
        if (!cancelled) setProduct(p);
      } catch {
        if (!cancelled) setProduct(null);
      }
    }

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [activeSubject, mode]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (mode !== "invitation") {
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      if (!accountsUserId) {
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }
      if (!invitationProductIdForEligibility) {
        setInvitationEligibility(null);
        setInvitationCapabilities(null);
        return;
      }

      try {
        const [elig, personalization] = await Promise.all([
          getReviewEligibility({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
          }),
          getPdpV2Personalization({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
          }),
        ]);
        if (!cancelled) {
          setInvitationEligibility(elig);
          setInvitationCapabilities(personalization || null);
        }
      } catch {
        // Ignore eligibility failures; server will enforce on submit.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, accountsUserId, invitationProductIdForEligibility, invitationProductGroupIdForEligibility]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (mode !== "in_app" || !productIdParam) {
        setInAppPdp(null);
        setInAppEligibility(null);
        setInAppCapabilities(null);
        return;
      }

      setLoading(true);
      setSubmissionToken(null);
      setSubmissionPayload(null);
      setInAppPdp(null);
      setInAppEligibility(null);
      setInAppCapabilities(null);

      try {
        const pdp = await fetchCreatorPdp({
          productId: productIdParam,
          merchantId: merchantIdParam,
        });
        if (cancelled) return;
        if (!pdp) throw new Error("Failed to load product");
        setInAppPdp(pdp);

        if (accountsUserId) {
          const [elig, personalization] = await Promise.all([
            getReviewEligibility({
              productId: productIdParam,
              ...(pdp.payload.product_group_id ? { productGroupId: pdp.payload.product_group_id } : {}),
            }),
            getPdpV2Personalization({
              productId: productIdParam,
              ...(pdp.payload.product_group_id ? { productGroupId: pdp.payload.product_group_id } : {}),
            }),
          ]);
          if (!cancelled) {
            setInAppEligibility(elig);
            setInAppCapabilities(personalization || null);
          }
        }
      } catch (err) {
        console.error(err);
        setNotice({ message: (err as Error)?.message || "Failed to load product", tone: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, productIdParam, merchantIdParam, accountsUserId]);

  const handleMediaInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;

    let invalidType = 0;
    let tooLarge = 0;
    let overflow = 0;

    setSelectedMediaFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= MAX_MEDIA_FILES) {
          overflow += 1;
          continue;
        }
        if (!isAllowedMediaFile(file)) {
          invalidType += 1;
          continue;
        }
        if (file.size > MAX_MEDIA_BYTES) {
          tooLarge += 1;
          continue;
        }
        next.push(file);
      }
      return next;
    });

    if (invalidType > 0) {
      setNotice({ message: "Only JPG, PNG, WEBP, or GIF images are supported.", tone: "info" });
    } else if (tooLarge > 0) {
      setNotice({ message: "Each image must be 10MB or smaller.", tone: "info" });
    } else if (overflow > 0) {
      setNotice({ message: `You can upload up to ${MAX_MEDIA_FILES} images.`, tone: "info" });
    }

    event.target.value = "";
  };

  const removeMediaAt = (index: number) => {
    setSelectedMediaFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const uploadSelectedMedia = async (targetReviewId: number): Promise<{ success: number; failed: number }> => {
    if (!selectedMediaFiles.length) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;
    for (const file of selectedMediaFiles) {
      try {
        await attachReviewMediaFromUser({ reviewId: targetReviewId, file });
        success += 1;
      } catch {
        failed += 1;
      }
    }
    return { success, failed };
  };

  const trackUploadEvent = (
    eventName: "ugc_upload_start" | "ugc_upload_success" | "ugc_upload_partial_fail",
    payload: Record<string, unknown>,
  ) => {
    pdpTracking.track(eventName, {
      flow: mode,
      entry: entryParam || null,
      product_id: productIdParam || invitationProductIdForEligibility || null,
      merchant_id: merchantIdParam || activeSubject?.merchant_id || null,
      ...payload,
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (authChecking) return;

    const redirect = `${window.location.pathname}${window.location.search}`;
    const mediaCount = selectedMediaFiles.length;
    const hasMedia = mediaCount > 0;
    const redirectToLogin = () => {
      setNotice({ message: "Please sign in to write a review.", tone: "info" });
      router.push(`/account/login?return_to=${encodeURIComponent(redirect)}`);
    };

    if (mode === "invitation") {
      if (!activeSubject) return;
      if (!accountsUser) {
        redirectToLogin();
        return;
      }

      const reason = String(invitationEligibility?.reason || "").toUpperCase();
      const canUseExistingReview = reason === "ALREADY_REVIEWED" && invitationExistingReviewId != null;
      if (invitationEligibility && !invitationEligibility.eligible && !canUseExistingReview) {
        setNotice({
          message:
            reason === "ALREADY_REVIEWED"
              ? "You already reviewed this product."
              : "Only purchasers can write a review.",
          tone: "info",
        });
        return;
      }
      if (canUseExistingReview && !hasMedia) {
        setNotice({ message: "You already reviewed this product. Add photos to upload.", tone: "info" });
        return;
      }
      if (!invitationProductIdForEligibility && !canUseExistingReview) {
        setNotice({ message: "Missing product context.", tone: "error" });
        return;
      }

      const canRate = invitationEligibility?.canRate ?? true;
      const ratingToSend = canRate ? rating : null;
      if (!canUseExistingReview && !canRate && !title.trim() && !body.trim()) {
        setNotice({ message: "Please write a short comment (ratings are for verified buyers).", tone: "info" });
        return;
      }

      setSubmitting(true);
      try {
        let targetReviewId = invitationExistingReviewId;
        let createdReview = false;

        if (!targetReviewId) {
          const data = await createReviewFromUser({
            productId: invitationProductIdForEligibility,
            ...(invitationProductGroupIdForEligibility ? { productGroupId: invitationProductGroupIdForEligibility } : {}),
            subject: {
              merchant_id: activeSubject.merchant_id,
              platform: activeSubject.platform,
              platform_product_id: activeSubject.platform_product_id,
              variant_id: activeSubject.variant_id || null,
            },
            rating: ratingToSend,
            title: title.trim() || null,
            body: body.trim() || null,
          });

          const rid = Number((data as any)?.review_id);
          if (!Number.isFinite(rid) || rid <= 0) throw new Error("Missing review id.");
          targetReviewId = Math.trunc(rid);
          createdReview = true;
        }

        if (hasMedia) {
          trackUploadEvent("ugc_upload_start", {
            review_id: targetReviewId,
            file_count: mediaCount,
            created_review: createdReview,
          });
        }
        const uploadSummary = await uploadSelectedMedia(targetReviewId);
        setReviewId(targetReviewId);
        setSelectedMediaFiles([]);
        if (mediaInputRef.current) mediaInputRef.current.value = "";

        if (hasMedia) {
          if (uploadSummary.success === mediaCount) {
            trackUploadEvent("ugc_upload_success", {
              review_id: targetReviewId,
              file_count: mediaCount,
              success_count: uploadSummary.success,
              failed_count: uploadSummary.failed,
              created_review: createdReview,
            });
            setNotice({ message: createdReview ? "Review and photos submitted." : "Photos uploaded.", tone: "info" });
          } else {
            trackUploadEvent("ugc_upload_partial_fail", {
              review_id: targetReviewId,
              file_count: mediaCount,
              success_count: uploadSummary.success,
              failed_count: uploadSummary.failed,
              created_review: createdReview,
            });
            if (uploadSummary.success > 0) {
              setNotice({ message: `Uploaded ${uploadSummary.success} photo(s); ${uploadSummary.failed} failed.`, tone: "info" });
            } else {
              setNotice({ message: createdReview ? "Review submitted, but photo upload failed." : "Photo upload failed.", tone: "error" });
            }
          }
        } else {
          setNotice({ message: createdReview ? "Review submitted." : "Review updated.", tone: "info" });
        }
      } catch (err: any) {
        if (err?.code === "NOT_AUTHENTICATED" || err?.code === "UNAUTHENTICATED" || err?.status === 401) {
          redirectToLogin();
        } else if (err?.code === "NOT_VERIFIED_FOR_RATING") {
          setNotice({ message: "Ratings are available for verified buyers. Please submit a comment without a rating.", tone: "info" });
        } else if (err?.code === "NOT_PURCHASER") {
          setNotice({ message: "Only purchasers can write a review.", tone: "info" });
        } else if (err?.code === "ALREADY_REVIEWED" || err?.status === 409) {
          setNotice({ message: "You already reviewed this product.", tone: "info" });
        } else if (err?.code === "EMPTY_REVIEW") {
          setNotice({ message: "Please write a comment or select a rating.", tone: "info" });
        } else if (err?.status === 400) {
          setNotice({ message: err?.message || "Invalid input.", tone: "error" });
        } else if (err?.status === 403) {
          setNotice({ message: err?.message || "Not allowed.", tone: "error" });
        } else {
          console.error(err);
          setNotice({ message: err?.message || "Submit failed", tone: "error" });
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode !== "in_app" || !productIdParam || !inAppPdp?.payload) return;
    if (!accountsUser) {
      redirectToLogin();
      return;
    }

    const reason = String(inAppEligibility?.reason || "").toUpperCase();
    const canUseExistingReview = reason === "ALREADY_REVIEWED" && inAppExistingReviewId != null;
    if (inAppEligibility && !inAppEligibility.eligible && !canUseExistingReview) {
      setNotice({
        message:
          reason === "ALREADY_REVIEWED"
            ? "You already reviewed this product."
            : "Only purchasers can write a review.",
        tone: "info",
      });
      return;
    }
    if (canUseExistingReview && !hasMedia) {
      setNotice({ message: "You already reviewed this product. Add photos to upload.", tone: "info" });
      return;
    }

    const canRate = inAppEligibility?.canRate ?? true;
    const ratingToSend = canRate ? rating : null;
    if (!canUseExistingReview && !canRate && !title.trim() && !body.trim()) {
      setNotice({ message: "Please write a short comment (ratings are for verified buyers).", tone: "info" });
      return;
    }

    setSubmitting(true);
    try {
      let targetReviewId = inAppExistingReviewId;
      let createdReview = false;

      if (!targetReviewId) {
        const canonicalRaw =
          (inAppPdp.subject as any)?.canonical_product_ref ||
          (inAppPdp.subject as any)?.canonicalProductRef ||
          null;

        let resolvedMerchantId =
          safeString(canonicalRaw?.merchant_id || canonicalRaw?.merchantId).trim() ||
          safeString(merchantIdParam).trim() ||
          safeString((inAppPdp.payload as any)?.product?.merchant_id).trim() ||
          safeString((inAppPdp.payload as any)?.offers?.[0]?.merchant_id).trim();

        let resolvedPlatform =
          safeString(canonicalRaw?.platform).trim().toLowerCase() ||
          parsePlatformFromProductKey(
            safeString((inAppPdp.subject as any)?.product_key || (inAppPdp.subject as any)?.productKey),
          ) ||
          "";

        let resolvedPlatformProductId =
          safeString(
            canonicalRaw?.platform_product_id ||
              canonicalRaw?.platformProductId ||
              canonicalRaw?.product_id ||
              canonicalRaw?.productId,
          ).trim() || productIdParam;

        if ((!resolvedPlatform || !resolvedPlatformProductId) && resolvedMerchantId) {
          const fromDetail = await fetchSubjectRefFromProductDetail({
            merchantId: resolvedMerchantId,
            productId: resolvedPlatformProductId || productIdParam,
          });
          if (fromDetail) {
            if (!resolvedPlatform) resolvedPlatform = fromDetail.platform;
            if (!resolvedPlatformProductId) resolvedPlatformProductId = fromDetail.platform_product_id;
          }
        }

        if (!resolvedPlatform) {
          const inferred = inferPlatformFromProductId(resolvedPlatformProductId || productIdParam);
          if (inferred) resolvedPlatform = inferred;
        }

        if (!resolvedMerchantId || !resolvedPlatform || !resolvedPlatformProductId) {
          throw new Error("Missing canonical product reference.");
        }

        const data = await createReviewFromUser({
          productId: productIdParam,
          ...(inAppPdp.payload.product_group_id ? { productGroupId: inAppPdp.payload.product_group_id } : {}),
          subject: {
            merchant_id: resolvedMerchantId,
            platform: resolvedPlatform,
            platform_product_id: resolvedPlatformProductId,
            variant_id: null,
          },
          rating: ratingToSend,
          title: title.trim() || null,
          body: body.trim() || null,
        });
        const rid = Number((data as any)?.review_id);
        if (!Number.isFinite(rid) || rid <= 0) throw new Error("Missing review id.");
        targetReviewId = Math.trunc(rid);
        createdReview = true;
      }

      if (hasMedia) {
        trackUploadEvent("ugc_upload_start", {
          review_id: targetReviewId,
          file_count: mediaCount,
          created_review: createdReview,
        });
      }
      const uploadSummary = await uploadSelectedMedia(targetReviewId);
      setReviewId(targetReviewId);
      setSelectedMediaFiles([]);
      if (mediaInputRef.current) mediaInputRef.current.value = "";

      if (hasMedia) {
        if (uploadSummary.success === mediaCount) {
          trackUploadEvent("ugc_upload_success", {
            review_id: targetReviewId,
            file_count: mediaCount,
            success_count: uploadSummary.success,
            failed_count: uploadSummary.failed,
            created_review: createdReview,
          });
          setNotice({ message: createdReview ? "Review and photos submitted." : "Photos uploaded.", tone: "info" });
        } else {
          trackUploadEvent("ugc_upload_partial_fail", {
            review_id: targetReviewId,
            file_count: mediaCount,
            success_count: uploadSummary.success,
            failed_count: uploadSummary.failed,
            created_review: createdReview,
          });
          if (uploadSummary.success > 0) {
            setNotice({ message: `Uploaded ${uploadSummary.success} photo(s); ${uploadSummary.failed} failed.`, tone: "info" });
          } else {
            setNotice({ message: createdReview ? "Review submitted, but photo upload failed." : "Photo upload failed.", tone: "error" });
          }
        }
      } else {
        setNotice({ message: createdReview ? "Review submitted." : "Review updated.", tone: "info" });
      }
    } catch (err: any) {
      if (err?.code === "NOT_AUTHENTICATED" || err?.status === 401) {
        redirectToLogin();
      } else if (err?.code === "NOT_VERIFIED_FOR_RATING") {
        setNotice({ message: "Ratings are available for verified buyers. Please submit a comment without a rating.", tone: "info" });
      } else if (err?.code === "NOT_PURCHASER") {
        setNotice({ message: "Only purchasers can write a review.", tone: "error" });
      } else if (err?.code === "ALREADY_REVIEWED" || err?.status === 409) {
        setNotice({ message: "You already reviewed this product.", tone: "error" });
      } else if (err?.code === "EMPTY_REVIEW") {
        setNotice({ message: "Please write a comment or select a rating.", tone: "info" });
      } else if (err?.status === 400) {
        setNotice({ message: err?.message || "Invalid input.", tone: "error" });
      } else if (err?.status === 403) {
        setNotice({ message: err?.message || "Not allowed.", tone: "error" });
      } else {
        setNotice({ message: err?.message || "Submit failed", tone: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const productTitle = useMemo(() => {
    if (mode === "invitation") return safeString(product?.title) || "Product";
    if (mode === "in_app") return safeString(inAppPdp?.payload?.product?.title) || "Product";
    return "Write a review";
  }, [inAppPdp?.payload?.product?.title, mode, product?.title]);

  const productImageUrl = useMemo(() => {
    const fromInvitation = safeString(product?.imageUrl || product?.image_url || product?.image);
    const fromInApp = safeString(inAppPdp?.payload?.product?.image_url);
    return (fromInvitation || fromInApp).trim() || null;
  }, [inAppPdp?.payload?.product?.image_url, product]);

  const activeEligibility = mode === "invitation" ? invitationEligibility : inAppEligibility;
  const canRate = activeEligibility?.canRate ?? true;
  const invitationBlocked =
    Boolean(invitationEligibility && !invitationEligibility.eligible) &&
    !(
      String(invitationEligibility?.reason || "").toUpperCase() === "ALREADY_REVIEWED" &&
      invitationExistingReviewId != null
    );
  const inAppBlocked =
    Boolean(inAppEligibility && !inAppEligibility.eligible) &&
    !(String(inAppEligibility?.reason || "").toUpperCase() === "ALREADY_REVIEWED" && inAppExistingReviewId != null);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 py-8">
        {notice ? (
          <div
            className={cn(
              "mb-4 rounded-xl border px-3 py-2 text-xs",
              notice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-900 bg-slate-900 text-white",
            )}
            role="status"
            aria-live="polite"
          >
            {notice.message}
          </div>
        ) : null}

        <header className="mb-6">
          <h1 className="text-lg font-semibold text-slate-900">Write a review</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your feedback helps other buyers and the merchant improve.
          </p>
        </header>

        {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}

        {!loading && mode === "missing" ? (
          <div className="text-sm text-slate-600">
            Missing invitation token. Please open the link from your invitation email, or start from a product page.
          </div>
        ) : null}

        {!loading && mode === "invitation" && invitationToken && !submissionToken ? (
          <div className="text-sm text-slate-600">
            This invitation cannot be used. It may have expired or was already used.
          </div>
        ) : null}

        {!loading && (mode === "invitation" ? submissionToken : mode === "in_app") ? (
          <>
            {mode === "invitation" && subjects.length > 1 ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
                <div className="text-sm font-medium text-slate-900">Select item</div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {subjects.map((s, idx) => (
                    <button
                      key={`${s.platform}:${s.platform_product_id}:${s.variant_id || ""}:${idx}`}
                      type="button"
                      onClick={() => setSelectedSubjectIdx(idx)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left",
                        idx === selectedSubjectIdx
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      )}
                    >
                      <div className="text-sm font-semibold line-clamp-1">
                        {idx === selectedSubjectIdx ? productTitle : `Product ${idx + 1}`}
                      </div>
                      <div className={cn("mt-0.5 text-xs", idx === selectedSubjectIdx ? "text-white/80" : "text-slate-500")}>
                        {s.platform} · {s.platform_product_id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mb-5 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-black/5 shrink-0">
                {productImageUrl ? (
                  <Image src={productImageUrl} alt={productTitle} fill className="object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                    No image
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900 line-clamp-1">{productTitle}</div>
                {mode === "in_app" && inAppBlocked ? (
                  <div className="mt-1 text-xs text-rose-600">
                    {String(inAppEligibility?.reason || "").toUpperCase() === "ALREADY_REVIEWED"
                      ? "You already reviewed this product."
                      : "Only purchasers can write a review."}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-slate-500">
                    {mode === "invitation" && activeSubject ? `${activeSubject.platform} · ${activeSubject.platform_product_id}` : ""}
                  </div>
                )}
              </div>
            </div>

            {reviewId != null ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm">
                <div className="font-semibold text-slate-900">Thanks!</div>
                <div className="mt-1 text-slate-600">
                  Review received (ID: {reviewId}). It may appear after moderation.
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.back()}
                  >
                    Back
                  </Button>
                  {mode === "invitation" ? (
                    <Button
                      type="button"
                      className="flex-1"
                      onClick={() => {
                        window.sessionStorage.removeItem("pivota_reviews_invitation_token");
                        window.sessionStorage.removeItem("pivota_reviews_submission_token");
                        window.location.reload();
                      }}
                    >
                      Submit another (new link)
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : mode === "invitation" && authChecking ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                Checking your account…
              </div>
            ) : mode === "invitation" && !accountsUser ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">Login required</div>
                <div className="mt-1">Please sign in to write a review.</div>
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      const redirect = `${window.location.pathname}${window.location.search}`;
                      router.push(`/account/login?return_to=${encodeURIComponent(redirect)}`);
                    }}
                  >
                    Sign in
                  </Button>
                </div>
              </div>
            ) : mode === "invitation" && invitationBlocked ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">Not eligible</div>
                <div className="mt-1">
                  {String(invitationEligibility?.reason || "").toUpperCase() === "ALREADY_REVIEWED"
                    ? "You already reviewed this product."
                    : "Not eligible."}
                </div>
              </div>
            ) : mode === "in_app" && inAppBlocked ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">Not eligible</div>
                <div className="mt-1">
                  {String(inAppEligibility?.reason || "").toUpperCase() === "ALREADY_REVIEWED"
                    ? "You already reviewed this product."
                    : "Not eligible."}
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-200 bg-white/70 p-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-900">Rating</div>
                  <StarRating value={rating} onChange={setRating} disabled={submitting || !canRate} />
                  {!canRate ? (
                    <div className="text-xs text-slate-500">
                      Ratings are for verified buyers. You can still leave a comment below.
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Title (optional)</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={submitting}
                    maxLength={200}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    placeholder="Summarize your experience"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900">Review (optional)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    disabled={submitting}
                    maxLength={5000}
                    rows={6}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    placeholder="What did you like or dislike?"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-900">Photos (optional)</label>
                    <span className="text-xs text-slate-500">
                      {selectedMediaFiles.length}/{MAX_MEDIA_FILES}
                    </span>
                  </div>
                  {entryParam === "ugc_upload" ? (
                    <p className="text-xs text-slate-500">
                      Add photos from your gallery. Successful uploads are kept even if some files fail.
                    </p>
                  ) : null}
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={handleMediaInputChange}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting || selectedMediaFiles.length >= MAX_MEDIA_FILES}
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      Add photos
                    </Button>
                    <span className="text-xs text-slate-500">Max 5 images, 10MB each.</span>
                  </div>
                  {selectedMediaFiles.length ? (
                    <div className="space-y-2">
                      {selectedMediaFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${file.size}-${idx}`}
                          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                        >
                          <span className="truncate pr-2">{file.name}</span>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => removeMediaAt(idx)}
                            className="text-slate-500 hover:text-slate-900"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    {mode === "invitation"
                      ? "We keep your invitation token in the URL fragment to reduce leakage."
                      : canRate
                        ? "Verified buyers can rate and comment."
                        : "Sign in to comment. Ratings are for verified buyers."}
                  </div>
                  <Button type="submit" disabled={submitting || (mode === "invitation" && !activeSubject)}>
                    {submitting ? "Submitting…" : "Submit review"}
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
