"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Columns2,
  Bookmark as BookmarkIcon,
  Package,
  ArrowUp,
  X,
} from "lucide-react";
import type {
  Card,
  MediaWarning,
  Conversation,
  Bookmark,
  ChatMessage,
  ConversationSummary,
} from "@/lib/pokemon/types";
import {
  pokemonApi as api,
  POKEMON_CHAT_PATH as ROOT,
} from "../../pokemonClient";
import s from "./Live.module.css";
import MarketPanel from "./MarketPanel";
import CommercePanel from "./CommercePanel";
import useConversationCommerce from "./useConversationCommerce";
import CommerceChat, { type ChatCommerceRequest } from "./CommerceChat";
const { commerceIntent } = require("@/lib/pokemon/commerceChat.cjs");
import ProviderCardFacts from "./ProviderCardFacts";
import PublisherCardFacts from "./PublisherCardFacts";
import OfficialAnchoredCardFacts from "./OfficialAnchoredCardFacts";
import SourceFamilyCardFacts from "./SourceFamilyCardFacts";
const { warningLabels } = require("@/lib/pokemon/mediaWarnings.cjs") as { warningLabels: (values: MediaWarning[]) => string[] };
import PersonalRecords, { CardPersonalTools } from "./PersonalRecords";
const { changeBookmark } = require("@/lib/pokemon/bookmarkChange.cjs");
const { scanState, referenceCaption } = require("@/lib/pokemon/catalogMedia.cjs");
type MediaAvailability = {
  schema: "pokemon.catalog-media-availability.v1";
  status:
    | "current_source_scan_evidence"
    | "missing_source_scan_evidence"
    | "stale_source_scan_evidence"
    | "held_source_scan_evidence"
    | "identity_hold";
  with_source_scans_eligible: boolean;
  evidence_basis: "source_image_facts" | "number_reading" | null;
};
type VariantDimensionHold = {
  schema: "pokemon.variant-dimension-context.v1";
  status: string;
  legacy_card_id: string;
  declared_source_size: string;
  reason: string;
  canonical_replacement_card_id: null;
};
type CatalogCard = Card & {
  variant: string;
  match_eligible: number;
  display_allowed: number;
  media_availability?: MediaAvailability;
  variant_dimension_hold?: VariantDimensionHold;
};
type Detail = {
  card: CatalogCard;
  set: { name: string | null; release_date: string | null } | null;
  source_image_facts: {
    current_endpoint: boolean;
    source_ref: string;
    image_sha256: string;
    warnings: MediaWarning[];
    scope: string;
  } | null;
  number_context: Record<string, unknown>;
  media_evidence: MediaEvidence | null;
  primary_image?: {
    basis: "source_image_facts" | "number_reading" | "catalog_source_reference" | null;
    status: "current" | "stale" | "held" | "missing";
    identity_sha256: string;
  };
  source_scan_hold: boolean;
  discovery_facets: { facet_type: string; value: string }[];
  data_source: "live_catalog";
  backend: string;
};
type Overview = {
  records: number;
  languages: { ja: number; en: number };
  source_image_evidence: {
    records: number;
    current_records: number;
    events: number;
  } | null;
  source_scan_coverage: {
    current_source_scan_subjects: number;
    source_scan_subjects: number;
    by_status: Record<string, number>;
  } | null;
  catalog_source_image_coverage: {
    reference_subjects: number;
    current_primary_references: number;
    by_status: Record<string, number>;
  } | null;
  data_source: "live_catalog";
  backend: string;
};
type MediaEvidence = {
  event_id: string;
  image_sha256: string;
  identity_sha256: string | null;
  binding_scope: "reviewed_source_scan" | "source_card_reference";
  basis: string;
  current_endpoint: boolean;
  source_ref: string;
  scope: string;
  warnings: MediaWarning[];
  number_status: string | null;
  printed_denominator_observed: boolean | null;
  source_animation?: {
    schema: "pokemon.source-GIF-animation.v1";
    canvas_width: number;
    canvas_height: number;
    animated: boolean;
    preview_frame_index: 0;
    source_low_resolution: boolean;
  };
  gif_qualification_sha256?: string;
};
type SearchResult = {
  cards: CatalogCard[];
  total: number;
  offset: number;
  query: string;
  data_source: "live_catalog";
  backend: string;
  with_source_scans?: boolean;
  total_before_source_scan_filter?: number;
};
const path = (id: string, conversation: string | null = null) =>
  ROOT +
  "/card/" +
  encodeURIComponent(id) +
  (conversation ? "?conversation=" + encodeURIComponent(conversation) : "");
const labels = {
  discover: "Discover",
  card: "Card",
  compare: "Compare",
  watchlist: "Watchlist",
  collection: "Collection",
};
function errorText(e: unknown) {
  return e instanceof Error
    ? e.message
    : "The live service is unavailable. Try again.";
}
type BatchDetails = { schema: "pokemon.live-card-details.v1"; cards: Detail[] };
const CurrentDetails = createContext<{
  cards: Detail[] | null;
  error: string;
} | null>(null);
export function CurrentCards({
  cards,
  children,
}: {
  cards: Card[];
  children: ReactNode;
}) {
  const key = JSON.stringify([...new Set(cards.map((c) => c.card_id))]);
  const [state, setState] = useState<{
    key: string;
    cards: Detail[] | null;
    error: string;
  }>({ key: "", cards: null, error: "" });
  useEffect(() => {
    const c = new AbortController(),
      ids: string[] = JSON.parse(key);
    setState({ key, cards: null, error: "" });
    if (!ids.length) {
      setState({ key, cards: [], error: "" });
      return;
    }
    api<BatchDetails>("catalog/card", { card_ids: ids }, c.signal)
      .then((value) => {
        if (
          value.schema !== "pokemon.live-card-details.v1" ||
          !Array.isArray(value.cards) ||
          value.cards.length !== ids.length ||
          value.cards.some((d, i) => d.card.card_id !== ids[i])
        )
          throw new Error("The catalog response failed validation.");
        if (!c.signal.aborted) setState({ key, cards: value.cards, error: "" });
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setState({ key, cards: null, error: errorText(e) });
      });
    return () => c.abort();
  }, [key]);
  return (
    <CurrentDetails.Provider
      value={state.key === key ? state : { cards: null, error: "" }}
    >
      {children}
    </CurrentDetails.Provider>
  );
}
const credits = (d: Detail) => [
  ...new Set(
    d.discovery_facets
      .filter((f) => f.facet_type === "illustrator")
      .map((f) => f.value),
  ),
];
function Scan({
  card,
  media,
  numberHeld = false,
  priority = false,
  peerDetails,
}: {
  card: Card & { media_availability?: MediaAvailability };
  media: MediaEvidence | null;
  numberHeld?: boolean;
  priority?: boolean;
  peerDetails?: Detail[];
}) {
  const query = new URLSearchParams({
    card_id: card.card_id,
    event_id: media?.event_id || "",
    image_sha256: media?.image_sha256 || "",
    rendition: priority ? "detail" : "tile",
  });
  if (media?.identity_sha256) query.set("identity_sha256", media.identity_sha256);
  const src = "/api/creator-agent/pokemon-collector/media?" + query.toString();
  const [image, setImage] = useState<{ src: string; status: "loaded" | "failed" } | null>(null);
  const imageNode = useRef<HTMLImageElement | null>(null);
  const loaded = image?.src === src && image.status === "loaded";
  const state = scanState(media, card.media_availability, image?.src === src && image.status === "failed", numberHeld);
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    imageNode.current = node;
    // A cached image can finish before React attaches its load listener.
    if (node?.complete && node.naturalWidth > 0)
      setImage(previous => previous?.src === src && previous.status === "loaded" ? previous : { src, status: "loaded" });
  }, [src]);
  const sourceReference = media?.basis === "catalog_source_reference";
  const gif = sourceReference && media?.source_animation?.schema === "pokemon.source-GIF-animation.v1" ? media.source_animation : undefined;
  const currentDetails = useContext(CurrentDetails);
  const caption = referenceCaption(media, card, peerDetails ?? currentDetails?.cards ?? []);
  return (
    <>
    <div className={s.scan}>
      {state.status !== "recorded" ? (
        <div className={s.noImage}>
          Image unavailable<span>{state.message}</span>
          {state.status === "failed" && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setImage(null);
              }}
            >
              Retry this scan
            </button>
          )}
        </div>
      ) : (
        <>
          {!loaded && (
            <span role="status" className={s.scanLoading}>
              {sourceReference ? "Loading source reference…" : "Loading reviewed scan…"}
            </span>
          )}
          <img
            key={src}
            ref={imageRef}
            src={src}
            alt={
              card.name +
              " · " +
              card.card_id +
              (sourceReference
                ? " · card artwork reference; does not verify variant finish or edition"
                : " · preview of advisory reviewed source scan")
            }
            loading={priority ? "eager" : "lazy"}
            style={gif ? { width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "scale-down" } : undefined}
            onLoad={event => {
              if (event.currentTarget === imageNode.current) setImage({ src, status: "loaded" });
            }}
            onError={event => {
              if (event.currentTarget === imageNode.current) setImage({ src, status: "failed" });
            }}
          />
        </>
      )}
    </div>
    {caption && state.status === "recorded" && (
      <p className={s.referenceNote}><strong>{caption.label}</strong>{caption.message}</p>
    )}
    {gif && state.status === "recorded" && (
      <p className={s.referenceNote}>
        {gif.animated ? "Still preview of an animated source" : "Source image preview"} · {gif.canvas_width} × {gif.canvas_height} pixels.
        {gif.source_low_resolution ? " Low-resolution source image." : ""}
      </p>
    )}
    </>
  );
}
function IdentityNote({ card }: { card: CatalogCard }) {
  if (!card.variant_dimension_hold) return null;
  return (
    <p role="status" className={s.evidenceWarning}>
      Variant identity needs review. Source metadata declares size:{" "}
      {card.variant_dimension_hold.declared_source_size}. The original record is
      retained; image and offer matching are held.
    </p>
  );
}
function TitleReviewNote({ card }: { card: Card }) {
  const review = card.title_review;
  if (review === undefined) return null;
  return (
    <div role="status" className={s.evidenceWarning} data-title-review={review.status}>
      <strong>{review.status === "stale_source_title_warning"
        ? "Source title warning retained: this record has changed."
        : "Source title needs review."}</strong>
      <p>{review.explanation}</p>
      <p>Original source title: {review.original_title}. A corrected title has not been verified.</p>
      <details>
        <summary>Evidence needed to resolve this warning</summary>
        <ul>{review.required_evidence.map((item, index) => <li key={index}>{item}</li>)}</ul>
        <p>Recorded source: {review.source_ref}</p>
      </details>
    </div>
  );
}
// The mobile surface uses the same admitted image evidence and delivery path.
export function CatalogArtwork({ card }: { card: Card }) {
  const state = useContext(CurrentDetails);
  const detail = state?.cards?.find((value) => value.card.card_id === card.card_id);
  if (!state?.cards) return <div role="status">{state?.error ? "Image unavailable" : "Loading card artwork…"}</div>;
  if (!detail) return <div>Image unavailable</div>;
  return <Scan card={detail.card} media={detail.media_evidence} numberHeld={detail.source_scan_hold || !!detail.card.variant_dimension_hold}
    peerDetails={state.cards} />;
}
function Tile({
  card,
  onCompare,
  onResearch,
  selected,
  onSave,
  saved,
  saveDisabled,
}: {
  card: Card;
  onCompare?: (c: Card) => void;
  onResearch?: (c: Card) => void;
  selected?: boolean;
  onSave?: () => void;
  saved?: boolean;
  saveDisabled?: boolean;
}) {
  const context = useSearchParams().get("conversation"),
    state = useContext(CurrentDetails);
  if (!state) throw new Error("Current card reads are required.");
  const current = state.cards?.find((d) => d.card.card_id === card.card_id),
    error = state.error;
  if (error)
    return (
      <article className={s.tile} data-card-id={card.card_id}>
        <p role="status">Current card unavailable</p>
        <p className={s.id}>{card.card_id}</p>
        <p>{error}</p>
      </article>
    );
  if (!current)
    return (
      <article className={s.tile} data-card-id={card.card_id}>
        <p role="status">Reading current card…</p>
      </article>
    );
  const row = current.card;
  return (
    <article className={s.tile} data-card-id={row.card_id}>
      <Link href={path(row.card_id, context)}>
        <Scan
          card={row}
          media={current.media_evidence}
          numberHeld={current.source_scan_hold}
        />
        <h3>{row.name}</h3>
      </Link>
      <IdentityNote card={row} />
      <TitleReviewNote card={row} />
      <p>
        {row.language === "ja" ? "Japanese" : "English"} · {row.set_code} ·{" "}
        {row.collector_number}
      </p>
      <p>{row.rarity || "Rarity not recorded"}</p>
      <p className={s.id}>{row.card_id}</p>
      <p className={s.muted}>
        {current.media_evidence?.current_endpoint
          ? current.media_evidence.basis === "catalog_source_reference"
            ? "Card artwork reference"
            : "Reviewed scan preview"
          : "Scan unavailable"}{" "}
        · Physical copy unverified
      </p>
      {current.media_evidence?.warnings.length ? (
        <p className={s.evidenceWarning}>
          Image notes: {warningLabels(current.media_evidence.warnings).join(" ")}
        </p>
      ) : null}
      {current.media_evidence?.printed_denominator_observed === false && (
        <p className={s.evidenceWarning}>Printed denominator not observed.</p>
      )}
      <div className={s.tileActions}>
        {onResearch && <button onClick={() => onResearch(row)}>Research offers</button>}
        {onCompare && (
          <button aria-pressed={!!selected} onClick={() => onCompare(row)}>
            {selected ? "Added to compare" : "Compare"}
          </button>
        )}
        {onSave && (
          <button
            aria-pressed={!!saved}
            onClick={onSave}
            disabled={saveDisabled}
          >
            {saved ? "Unsave" : "Save"}
          </button>
        )}
      </div>
    </article>
  );
}
export default function LiveCollector({
  view = "discover",
  cardId,
  browsingBeta = false,
}: {
  view?: keyof typeof labels;
  cardId?: string;
  browsingBeta?: boolean;
}) {
  const params = useSearchParams(),
    router = useRouter(),
    desired = params.get("conversation"),
    initialAsk = params.get("ask");
  const [ready, setReady] = useState(false),
    [syntheticDemo, setSyntheticDemo] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [withSourceScans, setWithSourceScans] = useState(false),
    [result, setResult] = useState<SearchResult | null>(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [thread, setThread] = useState<Conversation | null>(null),
    [text, setText] = useState(""),
    [sending, setSending] = useState(false),
    [chatError, setChatError] = useState("");
  const [commerceCommand, setCommerceCommand] = useState<ChatCommerceRequest | null>(null),
    [commerceBusy, setCommerceBusy] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]),
    [savedPage, setSavedPage] = useState(0),
    [removingBookmark, setRemovingBookmark] = useState(false),
    [bookmarkUnverified, setBookmarkUnverified] = useState(false),
    [selected, setSelected] = useState<Card[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [comparing, setComparing] = useState<Detail[]>([]),
    [mobilePanel, setMobilePanel] = useState("catalog");
  const init = useRef(0),
    bookmarkRemoval = useRef(false),
    bookmarkChange = useRef(false),
    searchGeneration = useRef(0),
    chatFlight = useRef<AbortController | null>(null),
    searchFlight = useRef<AbortController | null>(null);
  const compareQuery = params.get("cards"),
    restoredId = useRef<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null),
    [overviewError, setOverviewError] = useState(""),
    [overviewAttempt, setOverviewAttempt] = useState(0),
    [history, setHistory] = useState<ConversationSummary[]>([]);
  const commerceTransport=useConversationCommerce(thread,(chat)=>{
    setThread(chat);restoredId.current=chat.id;
    setHistory(old=>[{id:chat.id,title:chat.title,updatedAt:chat.updatedAt,expiresAt:chat.expiresAt},...old.filter(h=>h.id!==chat.id)].sort((a,b)=>b.updatedAt-a.updatedAt));
    if(view==="discover"&&desired!==chat.id)router.replace(ROOT+"?conversation="+encodeURIComponent(chat.id),{scroll:false});
  },()=>{setReady(false);setChatError("The current conversation could not be read. Reload before continuing.");});
  const contextQuery = desired
    ? "?conversation=" + encodeURIComponent(desired)
    : "";
  const chatRoot = browsingBeta ? ROOT + "/shopper" : ROOT;
  const savedPageCount = Math.max(1, Math.ceil(bookmarks.length / 12)),
    currentSavedPage = Math.min(savedPage, savedPageCount - 1),
    visibleBookmarks = bookmarks.slice(
      currentSavedPage * 12,
      (currentSavedPage + 1) * 12,
    );
  useEffect(() => {
    setOverview(null);
    setOverviewError("");
    if (!ready || view !== "discover") return;
    const c = new AbortController();
    void api<Overview>("catalog/status", {}, c.signal)
      .then((value) => {
        if (!c.signal.aborted) setOverview(value);
      })
      .catch((e) => {
        if (!c.signal.aborted) setOverviewError(e?.code === "catalog_timeout"
          ? "Coverage took too long to load. Search and chat are still available."
          : errorText(e));
      });
    return () => c.abort();
  }, [ready, view, overviewAttempt]);
  useEffect(() => {
    if (view === "discover" && desired && restoredId.current === desired)
      return;
    const mine = ++init.current,
      c = new AbortController();
    setReady(false);
    setError("");
    setDetail(null);
    setComparing([]);
    setThread(null);
    setCommerceCommand(null);
    restoredId.current = null;
    setBookmarks([]);
    (async () => {
      try {
        const boot = await api<{ synthetic_demo?: boolean }>("bootstrap", {}, c.signal);
        if (!c.signal.aborted) setSyntheticDemo(boot.synthetic_demo === true);
        let compareIds: string[] = [];
        if (view === "compare" && compareQuery) {
          const ids: unknown = JSON.parse(compareQuery);
          if (
            !Array.isArray(ids) ||
            ids.length < 2 ||
            ids.length > 3 ||
            ids.some((id) => typeof id !== "string") ||
            new Set(ids).size !== ids.length
          )
            throw new Error("Choose two or three different cards to compare.");
          compareIds = ids;
        }
        const [saved, catalog] = await Promise.all([
          api<Bookmark[]>("bookmark-list", {}, c.signal),
          view === "card"
            ? api<Detail>("catalog/card", { card_id: cardId }, c.signal)
            : compareIds.length
              ? api<BatchDetails>(
                  "catalog/card",
                  { card_ids: compareIds },
                  c.signal,
                )
              : Promise.resolve(null),
        ]);
        if (mine !== init.current || c.signal.aborted) return;
        setBookmarks(saved);
        setBookmarkUnverified(false);
        if (view === "discover") {
          const chats = await api<ConversationSummary[]>(
            "chat-list",
            {},
            c.signal,
          );
          if (c.signal.aborted) return;
          setHistory(chats);
          if (desired) {
            const chat = await api<Conversation>(
              "chat-get",
              { id: desired },
              c.signal,
            );
            if (c.signal.aborted) return;
            setThread(chat);
            restoredId.current = chat.id;
          }
          if (initialAsk) {
            setText(initialAsk);
            setMobilePanel("chat");
          }
        } else if (view === "card") setDetail(catalog as Detail);
        else if (compareIds.length) {
          const batch = catalog as BatchDetails;
          if (
            batch.schema !== "pokemon.live-card-details.v1" ||
            batch.cards.length !== compareIds.length ||
            batch.cards.some((d, i) => d.card.card_id !== compareIds[i])
          )
            throw new Error("The catalog response failed validation.");
          setComparing(batch.cards);
        }
        if (mine === init.current) setReady(true);
      } catch (e) {
        if (!c.signal.aborted && mine === init.current) {
          setError(errorText(e));
          setReady(false);
        }
      }
    })();
    return () => {
      c.abort();
      chatFlight.current?.abort();
      searchFlight.current?.abort();
    };
  }, [view, cardId, desired, compareQuery, initialAsk]);
  async function search(q: string, offset = 0, withScans = withSourceScans) {
    if (!ready || !q.trim()) return;
    searchFlight.current?.abort();
    const c = new AbortController(),
      mine = ++searchGeneration.current;
    searchFlight.current = c;
    setSearching(true);
    setSearchError("");
    setResult(null);
    try {
      const r = await api<SearchResult>(
        "catalog/search",
        {
          q: q.trim(),
          offset,
          ...(overview?.source_scan_coverage
            ? { with_source_scans: withScans }
            : withScans
              ? { with_source_scans: true }
              : {}),
        },
        c.signal,
      );
      if (mine === searchGeneration.current && !c.signal.aborted) setResult(r);
    } catch (e) {
      if (mine === searchGeneration.current && !c.signal.aborted)
        setSearchError(errorText(e));
    } finally {
      if (mine === searchGeneration.current) {
        setSearching(false);
        searchFlight.current = null;
      }
    }
  }
  async function send() {
    if (
      !ready ||
      !text.trim() ||
      sending ||
      commerceBusy ||
      chatFlight.current ||
      bookmarkChange.current ||
      bookmarkUnverified
    )
      return;
    const intent = commerceIntent(text.trim());
    if (intent) {
      if (browsingBeta) {
        setChatError("This beta supports catalog browsing and saved preferences. Live listings, certificate checks and purchase quotes are not enabled.");
        return;
      }
      setChatError("");
      setCommerceCommand({ ...intent, id: crypto.randomUUID(), text: text.trim() });
      setText(""); setMobilePanel("chat"); return;
    }
    setCommerceCommand(null);
    const c = new AbortController();
    chatFlight.current = c;
    setSending(true);
    setChatError("");
    let active = thread;
    try {
      if (!active) {
        active = await api<Conversation>("chat-create", {}, c.signal);
        if (c.signal.aborted) return;
        setThread(active);
      }
      const chat = await api<Conversation>(
        "chat-send",
        { id: active.id, version: active.version, text: text.trim() },
        c.signal,
      );
      if (!c.signal.aborted) {
        setThread(chat);
        setText("");
        setHistory((old) =>
          [
            {
              id: chat.id,
              title: chat.title,
              updatedAt: chat.updatedAt,
              expiresAt: chat.expiresAt,
            },
            ...old.filter((h) => h.id !== chat.id),
          ].sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    } catch (e) {
      if (!c.signal.aborted) {
        setChatError(errorText(e));
        if (active) {
          try {
            const latest = await api<Conversation>(
              "chat-get",
              { id: active.id },
              c.signal,
            );
            if (!c.signal.aborted) setThread(latest);
          } catch {
            setChatError(
              "The live turn failed and its current state could not be read. Reload before continuing.",
            );
            setReady(false);
          }
        }
      }
    } finally {
      if (chatFlight.current === c) {
        chatFlight.current = null;
        setSending(false);
        if (active && !c.signal.aborted) {
          restoredId.current = active.id;
          router.replace(
            ROOT + "?conversation=" + encodeURIComponent(active.id),
            { scroll: false },
          );
        }
      }
    }
  }
  async function save(card: Card, message: ChatMessage) {
    if (
      !ready ||
      !thread ||
      sending ||
      chatFlight.current ||
      bookmarkChange.current ||
      bookmarkUnverified
    )
      return;
    bookmarkChange.current = true;
    const generation = init.current;
    setSending(true);
    setChatError("");
    try {
      const existing = bookmarks.find((b) => b.card.card_id === card.card_id);
      const result = await changeBookmark({
        api,
        cardId: card.card_id,
        existingId: existing?.id,
        payload: existing
          ? { id: existing.id }
          : {
              conversation_id: thread.id,
              message_id: message.id,
              card_id: card.card_id,
            },
      });
      if (generation === init.current) {
        if (result.bookmarks) setBookmarks(result.bookmarks);
        setBookmarkUnverified(result.unverified);
        if (result.error) setChatError(errorText(result.error));
        if (!result.unverified) {
          // Lease recovery and failure compensation can increment the chat
          // version even for an acknowledged Save. Read it before continuing.
          try {
            const latest = await api<Conversation>("chat-get", {
              id: thread.id,
            });
            if (generation === init.current) setThread(latest);
          } catch {
            if (generation === init.current) {
              setReady(false);
              setError(
                "Saved cards were checked, but this conversation could not be refreshed. Reload before continuing.",
              );
            }
          }
        }
      }
    } finally {
      bookmarkChange.current = false;
      setSending(false);
    }
  }
  function toggle(card: Card) {
    setSelected((old) =>
      old.some((c) => c.card_id === card.card_id)
        ? old.filter((c) => c.card_id !== card.card_id)
        : old.length < 3
          ? [...old, card]
          : old,
    );
  }
  function researchCard(card: Card) {
    if (browsingBeta) return;
    setCommerceCommand({ id: crypto.randomUUID(), kind: "research", card,
      text: "Research offers for " + card.name + " " + card.collector_number });
    setMobilePanel("chat");
  }
  const tiles = (cards: Card[], message?: ChatMessage) => (
    <CurrentCards cards={cards}>
      <div className={s.tiles}>
        {cards.map((card) => (
          <Tile
            key={card.card_id}
            card={card}
            onCompare={toggle}
            onResearch={browsingBeta ? undefined : researchCard}
            selected={selected.some((c) => c.card_id === card.card_id)}
            onSave={message ? () => void save(card, message) : undefined}
            saveDisabled={sending || !ready || bookmarkUnverified}
            saved={bookmarks.some((b) => b.card.card_id === card.card_id)}
          />
        ))}
      </div>
    </CurrentCards>
  );
  const facts = (d: Detail) => (
    <div className={s.facts}>
      <p>
        {d.card.language === "ja" ? "Japanese" : "English"} · {d.card.set_code}{" "}
        · {d.card.collector_number}
      </p>
      <p>
        {d.card.rarity || "Rarity not recorded"} · {d.card.variant}
      </p>
      <p>
        {d.set?.name || "Release name not recorded"}
        {d.set?.release_date ? " · " + d.set.release_date : ""}
      </p>
      <p>Catalog illustrator: {credits(d).join(", ") || "Not recorded"}</p>
      <ProviderCardFacts metadata={d.card.provider_metadata} />
      <PublisherCardFacts metadata={d.card.pinned_publisher_metadata} />
      <OfficialAnchoredCardFacts metadata={d.card.official_anchored_details} />
      <SourceFamilyCardFacts metadata={d.card.source_family_advisory} />
      <p className={s.id}>{d.card.card_id}</p>
      <details>
        <summary>Source and evidence</summary>
        <p className={s.id}>{d.card.provenance}</p>
        {d.media_evidence && (
          <>
            <p>
              {d.media_evidence.current_endpoint
                ? d.media_evidence.basis === "catalog_source_reference"
                  ? "Current source card reference · finish and edition unverified"
                  : "Current exact-record scan evidence"
                : "Scan evidence is stale"}{" "}
              · {d.media_evidence.basis}
            </p>
            <p className={s.id}>{d.media_evidence.source_ref}</p>
            <p>{d.media_evidence.scope}</p>
            {d.media_evidence.number_status && (
              <p>
                Number reading: {d.media_evidence.number_status}
                {d.media_evidence.printed_denominator_observed === false
                  ? " · Printed denominator not observed"
                  : ""}
              </p>
            )}
          </>
        )}
        <p>
          Physical printing, seller copy and ownership are unverified. Public
          display approval has not been granted.
        </p>
      </details>
    </div>
  );
  return (
    <main className={s.root}>
      <header className={s.header}>
        <Link
          href={chatRoot + contextQuery}
          className="pv-lockup"
          aria-label="Pivota home"
        >
          <span className="pv-logo pv-logo--purple pv-logo--sm" />
          <span className="pv-wordmark pv-wordmark--sm">Pivota</span>
        </Link>
        <span className={s.private}>{browsingBeta ? "Invite-only browsing beta" : syntheticDemo ? "Synthetic demo" : "Private catalog preview"}</span>
        <nav aria-label="Collector navigation">
          {[
            ["discover", "", Search],
            ["compare", "/compare", Columns2],
            ["watchlist", "/watchlist", BookmarkIcon],
            ["collection", "/collection", Package],
          ].map(([name, url, Icon]: any) => (
            <Link
              key={name}
              href={ROOT + url + contextQuery}
              aria-current={view === name ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{labels[name as keyof typeof labels]}</span>
            </Link>
          ))}
        </nav>
      </header>
      {browsingBeta && <p className={s.muted}>Catalog chat and saved cards are private to your account and retained for 30 days. Purchases are disabled.</p>}
      {syntheticDemo && <p className={s.evidenceWarning} role="status"><strong>Synthetic demo.</strong> The catalog card, marketplace prices and URLs are examples for this local walkthrough. No live inventory, verified PSA slab or purchasable offer is established.</p>}
      {error && (
        <div className={s.error} role="alert">
          {error}
          <button onClick={() => window.location.reload()}>
            Reload live service
          </button>
        </div>
      )}
      {!ready && !error && (
        <p className={s.loading} role="status">
          Connecting to your catalog…
        </p>
      )}
      {ready && view === "discover" && (
        <>
          <div className={s.mobileTabs}>
            <button
              aria-pressed={mobilePanel === "catalog"}
              onClick={() => setMobilePanel("catalog")}
            >
              Search catalog
            </button>
            <button
              aria-pressed={mobilePanel === "chat"}
              onClick={() => setMobilePanel("chat")}
            >
              Ask Pot
            </button>
          </div>
          <div className={s.discover}>
            <aside
              className={
                s.chat + " " + (mobilePanel !== "chat" ? s.mobileHidden : "")
              }
            >
              <h1>
                <span className={s.dot}>Pot</span> Find your next card.
              </h1>
              <p className={s.muted}>
                {browsingBeta ? "Explore recorded catalog evidence, compare cards and keep a private shortlist." : "Find a card, compare marketplace asks, check a PSA certificate and prepare a forwarder quote or product URL."}
              </p>
              <details>
                <summary>Conversations</summary>
                <button
                  disabled={sending || commerceBusy}
                  onClick={() => {
                    restoredId.current = null;
                    setThread(null);
                    setCommerceCommand(null);
                    setText("");
                    router.push(ROOT, { scroll: false });
                  }}
                >
                  New conversation
                </button>
                {history.map((h) => (
                  <Link
                    key={h.id}
                    className={s.historyLink}
                    href={ROOT + "?conversation=" + encodeURIComponent(h.id)}
                  >
                    {h.title}
                  </Link>
                ))}
              </details>
              <div className={s.messages} aria-live="polite">
                {!thread?.messages.length && (
                  <p>
                    {browsingBeta ? "Tell me what you collect. I’ll help you explore exact catalog printings and save cards." : "Tell me what you collect, or ask for live offers on a card. I’ll confirm the exact printing before researching marketplaces."}
                  </p>
                )}
                {thread?.messages.map((m) => (
                  <section
                    key={m.id}
                    className={m.role === "user" ? s.userMessage : s.reply}
                    data-message-id={m.id}
                  >
                    <strong>{m.role === "user" ? "You" : "Pot"}</strong>
                    <p>{m.text}</p>{m.commerce&&<p className={s.muted}>Action event · {m.commerce.status.replaceAll("_"," ")} · {new Date(m.commerce.recorded_at).toLocaleString()} · History only. Refresh listings and choices before continuing.</p>}
                    {m.status === "accepted" &&
                      typeof m.coverage?.matched_catalog_records === "number" &&
                      Number.isSafeInteger(
                        m.coverage.matched_catalog_records,
                      ) &&
                      m.coverage.matched_catalog_records >=
                        (m.cards?.length || 0) && (
                        <p className={s.muted}>
                          Showing {m.cards?.length || 0} of{" "}
                          {m.coverage.matched_catalog_records.toLocaleString()}{" "}
                          matching catalog records.
                        </p>
                      )}
                    {m.status === "failed" && (
                      <p className={s.error}>This turn failed.</p>
                    )}
                    {m.role === "assistant" &&
                      m.status === "accepted" &&
                      m.cards &&
                      tiles(m.cards, m)}
                  </section>
                ))}
                {!browsingBeta && commerceCommand && <CommerceChat transport={commerceTransport} command={commerceCommand} onBusyChange={setCommerceBusy} />}
                {sending && <p role="status">Checking the live catalog…</p>}
              </div>
              {chatError && (
                <p role="alert" className={s.error}>
                  {chatError}
                </p>
              )}
              <form
                className={s.composer}
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <label className={s.srOnly} htmlFor="ask-dot">
                  Ask Pot
                </label>
                <textarea
                  id="ask-dot"
                  value={text}
                  maxLength={commerceCommand ? 2000 : thread?.workspace ? 200 : 2000}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={browsingBeta ? "Find catalog cards, or ask about an exact printing…" : "Find Pikachu PSA 10 offers, or ask about a card…"}
                  disabled={syntheticDemo || sending || commerceBusy || thread?.busy || bookmarkUnverified}
                />
                <button
                  aria-label="Send question"
                  disabled={
                    !text.trim() ||
                    syntheticDemo ||
                    sending ||
                    commerceBusy ||
                    thread?.busy ||
                    bookmarkUnverified
                  }
                >
                  <ArrowUp size={20} />
                </button>
              </form>
              <p className={s.muted}>
                {browsingBeta ? "Catalog chat and saved cards are retained for 30 days. Marketplace research, certificate checks and purchase quotes are disabled." : syntheticDemo ? "Use catalog search to open the synthetic example and try listing research. Live conversation and saved-card writes are unavailable in this demo." : "Catalog chat and saved cards are kept for up to 24 hours. Live offers and quotes need a fresh check in each tab."}
              </p>
            </aside>
            <section
              className={
                s.catalog +
                " " +
                (mobilePanel !== "catalog" ? s.mobileHidden : "")
              }
            >
              <div className={s.sectionHead}>
                <div>
                  <h2>Your card catalog</h2>
                  {overview && (
                    <>
                      <p>
                        {overview.records.toLocaleString()} records · Japanese{" "}
                        {overview.languages.ja.toLocaleString()} · English{" "}
                        {overview.languages.en.toLocaleString()}
                      </p>
                      <p className={s.muted}>
                        {overview.source_scan_coverage
                          ? overview.source_scan_coverage.current_source_scan_subjects.toLocaleString() +
                            " records have current source scan evidence. " +
                            overview.source_scan_coverage.by_status.identity_hold.toLocaleString() +
                            " records need variant identity review."
                          : overview.source_image_evidence
                            ? "Source-image evidence for " +
                              overview.source_image_evidence.records.toLocaleString() +
                              " records."
                            : "Source-image evidence coverage has not been reported."}{" "}
                        Catalog totals include variants and unresolved source
                        records.
                      </p>
                      {overview.catalog_source_image_coverage && (
                        <p className={s.muted}>
                          {overview.catalog_source_image_coverage.current_primary_references.toLocaleString()}{" "}
                          records have a current source card reference. Finish
                          and edition are unverified.
                        </p>
                      )}
                    </>
                  )}
                  {!overview && !overviewError && (
                    <p role="status">Reading catalog coverage…</p>
                  )}
                  {overviewError && (
                    <p role="alert" className={s.error}>
                      Catalog coverage unavailable: {overviewError}
                      <button type="button" onClick={() => {
                        setOverviewError("");
                        setOverviewAttempt((attempt) => attempt + 1);
                      }}>Retry catalog coverage</button>
                    </p>
                  )}
                  <p>Search names, releases or collector numbers.</p>
                </div>
                <span className={s.live}>{syntheticDemo ? "Synthetic catalog example" : "Live backend"}</span>
              </div>
              <form
                className={s.search}
                onSubmit={(e) => {
                  e.preventDefault();
                  void search(query);
                }}
              >
                <Search size={20} />
                <label className={s.srOnly} htmlFor="catalog-search">
                  Search catalog
                </label>
                <input
                  id="catalog-search"
                  value={query}
                  maxLength={200}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Card name, set or number"
                />
                <button disabled={searching || !query.trim()}>Search</button>
              </form>
              <label className={s.scanFilter}>
                <input
                  type="checkbox"
                  checked={withSourceScans}
                  disabled={!overview?.source_scan_coverage || !ready}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setWithSourceScans(checked);
                    searchFlight.current?.abort();
                    searchGeneration.current++;
                    setResult(null);
                    setSearchError("");
                    setSearching(false);
                    if (query.trim()) void search(query, 0, checked);
                  }}
                />
                Only cards with current source scan evidence
              </label>
              {searching && <p role="status">Searching your backend…</p>}
              {searchError && (
                <p role="alert" className={s.error}>
                  {searchError}
                </p>
              )}
              {result && (
                <>
                  <p className={s.muted}>
                    {result.total.toLocaleString()} matching records · Showing{" "}
                    {result.cards.length ? result.offset + 1 : 0}–
                    {result.offset + result.cards.length}
                    {result.with_source_scans &&
                      " · Scan evidence filter applied across all " +
                        result.total_before_source_scan_filter?.toLocaleString() +
                        " matching records"}
                  </p>
                  {tiles(result.cards)}
                  {!result.cards.length && (
                    <p>No matching records in the live catalog.</p>
                  )}
                  <div className={s.pagination}>
                    <button
                      disabled={result.offset === 0}
                      onClick={() =>
                        void search(
                          result.query,
                          Math.max(0, result.offset - 12),
                        )
                      }
                    >
                      Previous
                    </button>
                    <button
                      disabled={
                        result.offset + result.cards.length >= result.total
                      }
                      onClick={() =>
                        void search(result.query, result.offset + 12)
                      }
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
              {!result && !searching && !searchError && (
                <div className={s.empty}>
                  <Search size={28} />
                  <h3>Explore your Japanese and English catalog</h3>
                  <p>
                    {syntheticDemo ? "Search opens the single synthetic card used in this walkthrough." : "Results come directly from your backend. Images appear where a source reference or reviewed scan is recorded."}
                  </p>
                </div>
              )}
              <p className={s.muted}>
                Source references and scans do not verify a seller’s card,
                edition, finish or condition.
              </p>
            </section>
          </div>
        </>
      )}
      {ready && view === "card" && detail && (
        <section className={s.detail}>
          <div>
            <Scan
              card={detail.card}
              media={detail.media_evidence}
              numberHeld={detail.source_scan_hold}
              priority
            />
            <p className={s.muted}>
              {detail.media_evidence?.current_endpoint
                ? detail.media_evidence.basis === "catalog_source_reference"
                  ? "Source card reference"
                  : "Reviewed scan preview"
                : "Scan unavailable"}{" "}
              · Physical copy unverified
            </p>
            {detail.media_evidence &&
              detail.media_evidence.warnings.length > 0 && (
                <p role="status" className={s.evidenceWarning}>
                  Image notes: {warningLabels(detail.media_evidence.warnings).join(" ")}
                </p>
              )}
            {detail.media_evidence?.printed_denominator_observed === false && (
              <p className={s.evidenceWarning}>
                Printed denominator not observed.
              </p>
            )}
          </div>
          <div>
            <span className={s.live}>{syntheticDemo ? "Synthetic demo card" : "Live backend"}</span>
            <h1>{detail.card.name}</h1>
            <IdentityNote card={detail.card} />
            <TitleReviewNote card={detail.card} />
            {facts(detail)}
            {!browsingBeta && <>
              <CommercePanel transport={commerceTransport} key={detail.card.card_id + ":commerce"} cardId={detail.card.card_id} cardName={detail.card.name} />
              <MarketPanel
                key={detail.card.card_id}
                cardId={detail.card.card_id}
              />
            </>}
            {!syntheticDemo && <CardPersonalTools
              key={detail.card.card_id + ":personal"}
              cardId={detail.card.card_id}
            />}
            <Link
              className={s.primary}
              href={
                ROOT +
                "?ask=" +
                encodeURIComponent(
                  "Inspect catalog record " + detail.card.card_id,
                )
              }
            >
              Ask Pot about this card
            </Link>
          </div>
        </section>
      )}
      {ready && view === "compare" && (
        <section className={s.page}>
          <h1>Compare exact cards</h1>
          {comparing.length ? (
            <>
              {comparing.every((d) => credits(d).length > 0) &&
                new Set(comparing.map((d) => JSON.stringify(credits(d).sort())))
                  .size > 1 && (
                  <p className={s.comparisonNote}>
                    Different catalog illustrator credits:{" "}
                    {comparing.map((d) => credits(d).join(", ")).join(" · ")}. A
                    shared Pokémon does not establish matching artwork.
                  </p>
                )}
              <div className={s.compare}>
                {comparing.map((d) => (
                  <article key={d.card.card_id}>
                    <Scan
                      card={d.card}
                      media={d.media_evidence}
                      numberHeld={d.source_scan_hold}
                      priority
                      peerDetails={comparing}
                    />
                    <p className={s.muted}>
                      {d.media_evidence?.current_endpoint
                        ? d.media_evidence.basis === "catalog_source_reference"
                          ? "Source card reference"
                          : "Reviewed scan preview"
                        : "Scan unavailable"}{" "}
                      · Physical copy unverified
                    </p>
                    {d.media_evidence &&
                      d.media_evidence.warnings.length > 0 && (
                        <p className={s.evidenceWarning}>
                          Image notes:{" "}
                          {warningLabels(d.media_evidence.warnings).join(" ")}
                        </p>
                      )}
                    {d.media_evidence?.printed_denominator_observed ===
                      false && (
                      <p className={s.evidenceWarning}>
                        Printed denominator not observed.
                      </p>
                    )}
                    <h2>{d.card.name}</h2>
                    <IdentityNote card={d.card} />
                    <TitleReviewNote card={d.card} />
                    {facts(d)}
                  </article>
                ))}
              </div>
              <p className={s.muted}>
                Each record keeps its own language, printing and source
                evidence. Price comparison is unavailable.
              </p>
            </>
          ) : (
            <div className={s.empty}>
              <Columns2 size={28} />
              <p>
                Select two or three cards in Discover to compare their catalog
                evidence.
              </p>
              <Link href={ROOT}>Find cards</Link>
            </div>
          )}
        </section>
      )}
      {ready && view === "watchlist" && (
        <section className={s.page}>
          <h1>Saved cards</h1>
          <p>
            Catalog bookmarks from your conversations. Price alert preferences
            are saved separately and remain paused until verified prices are
            connected.
          </p>
          {bookmarks.length ? (
            <CurrentCards cards={visibleBookmarks.map((b) => b.card)}>
              <div className={s.tiles}>
                {visibleBookmarks.map((b) => (
                  <div key={b.id}>
                    <Tile card={b.card} />
                    <Link
                      href={
                        chatRoot +
                        "?conversation=" +
                        encodeURIComponent(b.conversationId)
                      }
                    >
                      Open source conversation
                    </Link>
                    <button
                      disabled={removingBookmark || bookmarkUnverified}
                      onClick={async () => {
                        if (bookmarkRemoval.current || bookmarkUnverified)
                          return;
                        bookmarkRemoval.current = true;
                        setRemovingBookmark(true);
                        const generation = init.current;
                        try {
                          const result = await changeBookmark({
                            api,
                            cardId: b.card.card_id,
                            existingId: b.id,
                            payload: { id: b.id },
                          });
                          if (generation === init.current) {
                            if (result.bookmarks)
                              setBookmarks(result.bookmarks);
                            setBookmarkUnverified(result.unverified);
                            setError(
                              result.error ? errorText(result.error) : "",
                            );
                          }
                        } finally {
                          bookmarkRemoval.current = false;
                          setRemovingBookmark(false);
                        }
                      }}
                    >
                      Remove bookmark
                    </button>
                  </div>
                ))}
              </div>
              {savedPageCount > 1 && (
                <nav className={s.pagination} aria-label="Saved card pages">
                  <button
                    disabled={currentSavedPage === 0}
                    onClick={() => setSavedPage(currentSavedPage - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {currentSavedPage + 1} of {savedPageCount}
                  </span>
                  <button
                    disabled={currentSavedPage + 1 >= savedPageCount}
                    onClick={() => setSavedPage(currentSavedPage + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </CurrentCards>
          ) : (
            <div className={s.empty}>
              <BookmarkIcon size={28} />
              <p>Save a card from a Pot reply to return to its evidence.</p>
              <Link href={chatRoot}>Ask Pot</Link>
            </div>
          )}
          <PersonalRecords kind="alert" />
        </section>
      )}
      {ready && view === "collection" && (
        <section className={s.page}>
          <h1>Collection</h1>
          <PersonalRecords />
        </section>
      )}
      {selected.length > 0 && view === "discover" && (
        <div className={s.compareTray}>
          <span>{selected.length} of 3 cards selected</span>
          <button
            disabled={selected.length < 2}
            onClick={() =>
              router.push(
                ROOT +
                  "/compare?cards=" +
                  encodeURIComponent(
                    JSON.stringify(selected.map((c) => c.card_id)),
                  ) +
                  (desired
                    ? "&conversation=" + encodeURIComponent(desired)
                    : ""),
              )
            }
          >
            Compare cards
          </button>
          <button aria-label="Clear comparison" onClick={() => setSelected([])}>
            <X size={18} />
          </button>
        </div>
      )}
      <footer className={s.footer}>
        {browsingBeta ? "Pivota · Catalog browsing · Invite-only beta" : "Pivota · Connected catalog evidence · Private test access"}
      </footer>
    </main>
  );
}
