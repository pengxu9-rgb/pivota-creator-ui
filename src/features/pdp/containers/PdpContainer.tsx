'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Share2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  MediaGalleryData,
  MediaItem,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  ReviewsPreviewData,
  Variant,
} from '@/features/pdp/types';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import {
  collectColorOptions,
  collectSizeOptions,
  extractAttributeOptions,
  extractBeautyAttributes,
  findVariantByOptions,
  getOptionValue,
} from '@/features/pdp/utils/variantOptions';
import { pdpTracking } from '@/features/pdp/tracking';
import { dispatchPdpAction } from '@/features/pdp/actions';
import { MediaGallery } from '@/features/pdp/sections/MediaGallery';
import { MediaGallerySheet } from '@/features/pdp/sections/MediaGallerySheet';
import { VariantSelector } from '@/features/pdp/sections/VariantSelector';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { RecommendationsGrid, RecommendationsSkeleton } from '@/features/pdp/sections/RecommendationsGrid';
import { BeautyReviewsSection } from '@/features/pdp/sections/BeautyReviewsSection';
import { BeautyUgcGallery } from '@/features/pdp/sections/BeautyUgcGallery';
import { BeautyRecentPurchases } from '@/features/pdp/sections/BeautyRecentPurchases';
import { BeautyShadesSection } from '@/features/pdp/sections/BeautyShadesSection';
import { BeautyDetailsSection } from '@/features/pdp/sections/BeautyDetailsSection';
import { BeautyVariantSheet } from '@/features/pdp/sections/BeautyVariantSheet';
import { GenericColorSheet } from '@/features/pdp/sections/GenericColorSheet';
import { GenericRecentPurchases } from '@/features/pdp/sections/GenericRecentPurchases';
import { GenericStyleGallery } from '@/features/pdp/sections/GenericStyleGallery';
import { GenericSizeHelper } from '@/features/pdp/sections/GenericSizeHelper';
import { GenericSizeGuide } from '@/features/pdp/sections/GenericSizeGuide';
import { GenericDetailsSection } from '@/features/pdp/sections/GenericDetailsSection';
import { OfferSheet } from '@/features/pdp/offers/OfferSheet';
import { cn } from '@/lib/utils';

function getModuleData<T>(payload: PDPPayload, type: string): T | null {
  const m = payload.modules.find((x) => x.type === type);
  return (m?.data as T) ?? null;
}

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('h-3 w-3', i < rounded ? 'fill-gold text-gold' : 'text-muted-foreground')}
        />
      ))}
    </div>
  );
}

export function PdpContainer({
  payload,
  initialQuantity = 1,
  mode,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
}: {
  payload: PDPPayload;
  initialQuantity?: number;
  mode?: 'beauty' | 'generic';
  onAddToCart: (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(
    payload.product.default_variant_id || payload.product.variants?.[0]?.variant_id,
  );
  const [quantity, setQuantity] = useState(initialQuantity);
  const reviewsTracked = useRef(false);
  const [activeTab, setActiveTab] = useState('product');
  const [showShadeSheet, setShowShadeSheet] = useState(false);
  const [showColorSheet, setShowColorSheet] = useState(false);
  const [showMediaSheet, setShowMediaSheet] = useState(false);
  const [showOfferSheet, setShowOfferSheet] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [navVisible, setNavVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();

  const allowMockRecentPurchases =
    (payload.product.merchant_id || '') !== 'external_seed';

  const variants = useMemo(() => payload.product.variants ?? [], [payload.product.variants]);

  const selectedVariant = useMemo(() => {
    return variants.find((v) => v.variant_id === selectedVariantId) || variants[0];
  }, [variants, selectedVariantId]);

  const isInStock =
    typeof selectedVariant?.availability?.in_stock === 'boolean'
      ? selectedVariant.availability.in_stock
      : typeof payload.product.availability?.in_stock === 'boolean'
        ? payload.product.availability.in_stock
        : true;

  const availableQuantity = useMemo(() => {
    const qty = selectedVariant?.availability?.available_quantity ?? payload.product.availability?.available_quantity;
    if (typeof qty !== 'number' || !Number.isFinite(qty)) return undefined;
    return Math.max(0, Math.floor(qty));
  }, [payload.product.availability?.available_quantity, selectedVariant?.availability?.available_quantity]);

  const maxQuantity = availableQuantity != null && availableQuantity > 0 ? availableQuantity : undefined;
  const resolvedQuantity = maxQuantity != null ? Math.min(quantity, maxQuantity) : quantity;

  useEffect(() => {
    if (maxQuantity == null) return;
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity, selectedVariantId]);

  const resolvedMode: 'beauty' | 'generic' = mode || (isBeautyProduct(payload.product) ? 'beauty' : 'generic');

  const media = getModuleData<MediaGalleryData>(payload, 'media_gallery');
  const pricePromo = getModuleData<PricePromoData>(payload, 'price_promo');
  const details = getModuleData<ProductDetailsData>(payload, 'product_details');
  const reviews = getModuleData<ReviewsPreviewData>(payload, 'reviews_preview');
  const recommendations = getModuleData<RecommendationsData>(payload, 'recommendations');

  const offers = useMemo(() => payload.offers ?? [], [payload.offers]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(() => {
    const merchantId = String(payload.product.merchant_id || '').trim();
    const merchantOfferId = merchantId
      ? offers.find((o) => o.merchant_id === merchantId)?.offer_id
      : null;
    return merchantOfferId || payload.default_offer_id || offers[0]?.offer_id || null;
  });
  const selectedOffer = useMemo(() => {
    if (!offers.length) return null;
    if (!selectedOfferId) return offers[0] || null;
    return offers.find((o) => o.offer_id === selectedOfferId) || offers[0] || null;
  }, [offers, selectedOfferId]);
  const offerDebugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get('pdp_debug') || params.get('debug') || '').trim().toLowerCase();
    if (!raw || raw === '0' || raw === 'false') return false;
    const envAllowed = String(process.env.NEXT_PUBLIC_PDP_DEBUG || '').trim() === '1';
    if (process.env.NODE_ENV === 'production' && !envAllowed) return false;
    return true;
  }, []);

  useEffect(() => {
    const merchantId = String(payload.product.merchant_id || '').trim();
    const merchantOfferId = merchantId
      ? offers.find((o) => o.merchant_id === merchantId)?.offer_id
      : null;
    setSelectedOfferId(merchantOfferId || payload.default_offer_id || offers[0]?.offer_id || null);
  }, [payload.product.product_id, payload.product.merchant_id, payload.default_offer_id, offers]);

  useEffect(() => {
    if (!offerDebugEnabled) return;
    // eslint-disable-next-line no-console
    console.info('[pdp][offer-debug]', {
      product_id: payload.product.product_id,
      product_group_id: payload.product_group_id || selectedOffer?.product_group_id || null,
      selected_offer_id: selectedOfferId,
      default_offer_id: payload.default_offer_id || null,
      best_price_offer_id: payload.best_price_offer_id || null,
      merchant_id: selectedOffer?.merchant_id || payload.product.merchant_id || null,
    });
  }, [
    offerDebugEnabled,
    payload.product.product_id,
    payload.product_group_id,
    payload.default_offer_id,
    payload.best_price_offer_id,
    payload.product.merchant_id,
    selectedOfferId,
    selectedOffer?.merchant_id,
    selectedOffer?.product_group_id,
  ]);

  const colorOptions = useMemo(() => collectColorOptions(variants), [variants]);
  const sizeOptions = useMemo(() => collectSizeOptions(variants), [variants]);
  const [selectedColor, setSelectedColor] = useState<string | null>(
    getOptionValue(selectedVariant, ['color', 'colour', 'shade', 'tone']) || null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(
    getOptionValue(selectedVariant, ['size', 'fit']) || null,
  );

  useEffect(() => {
    setSelectedColor(getOptionValue(selectedVariant, ['color', 'colour', 'shade', 'tone']) || null);
    setSelectedSize(getOptionValue(selectedVariant, ['size', 'fit']) || null);
  }, [selectedVariantId, selectedVariant]);

  useEffect(() => {
    const nextVariantId = payload.product.default_variant_id || variants[0]?.variant_id;
    if (nextVariantId) {
      setSelectedVariantId(nextVariantId);
    }
    setActiveMediaIndex(0);
  }, [payload.product.product_id, payload.product.default_variant_id, variants]);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [selectedVariantId]);

  useEffect(() => {
    if (!isInStock) {
      setQuantity(1);
    }
  }, [isInStock]);

  useEffect(() => {
    pdpTracking.setBaseContext({
      page_request_id: payload.tracking.page_request_id,
      entry_point: payload.tracking.entry_point,
      experiment: payload.tracking.experiment,
      product_id: payload.product.product_id,
    });
    pdpTracking.track('pdp_view', { pdp_mode: resolvedMode });
  }, [payload, resolvedMode]);

  useEffect(() => {
    if (reviews && !reviewsTracked.current) {
      reviewsTracked.current = true;
      pdpTracking.track('pdp_module_impression', { module: 'reviews_preview' });
    }
  }, [reviews]);

  const baseMediaItems = useMemo(() => media?.items ?? [], [media]);
  const galleryItems: MediaItem[] = useMemo(() => {
    if (!selectedVariant?.image_url) return baseMediaItems;
    const exists = baseMediaItems.some((item) => item.url === selectedVariant.image_url);
    if (exists) return baseMediaItems;
    return [
      {
        type: 'image' as const,
        url: selectedVariant.image_url,
        alt_text: selectedVariant.title,
      },
      ...baseMediaItems,
    ];
  }, [baseMediaItems, selectedVariant?.image_url, selectedVariant?.title]);
  const galleryData = useMemo(() => ({ items: galleryItems }), [galleryItems]);

  const heroUrl = selectedVariant?.image_url || payload.product.image_url || '';
  const baseCurrency =
    selectedVariant.price?.current.currency || payload.product.price?.current.currency || 'USD';
  const basePriceAmount =
    selectedVariant.price?.current.amount ?? payload.product.price?.current.amount ?? 0;
  const offerCurrency = selectedOffer?.price?.currency || baseCurrency;
  const offerShippingCost = Number(selectedOffer?.shipping?.cost?.amount) || 0;
  const offerTotalPrice = selectedOffer ? (Number(selectedOffer.price.amount) || 0) + offerShippingCost : null;
  const displayCurrency = selectedOffer ? offerCurrency : baseCurrency;
  const displayPriceAmount = selectedOffer && offerTotalPrice != null ? offerTotalPrice : basePriceAmount;

  const effectiveMerchantId = selectedOffer?.merchant_id || payload.product.merchant_id;
  const effectiveShippingEta =
    selectedOffer?.shipping?.eta_days_range || payload.product.shipping?.eta_days_range;
  const effectiveReturns = selectedOffer?.returns || payload.product.returns;
  const actionsByType = payload.actions.reduce<Record<string, string>>((acc, action) => {
    acc[action.action_type] = action.label;
    return acc;
  }, {});
  const headerHeight = 44;
  const navRowHeight = navVisible ? 36 : 0;
  const scrollMarginTop = headerHeight + navRowHeight + 14;

  const hasReviews = !!reviews;
  const hasRecommendations = !!recommendations?.items?.length;
  const isRecommendationsLoading = payload.x_recommendations_state === 'loading';
  const showRecommendationsSection = hasRecommendations || isRecommendationsLoading;
  const showShades = resolvedMode === 'beauty' && variants.length > 1;
  const showSizeGuide = resolvedMode === 'generic' && !!payload.product.size_guide;
  const showSizeHelper = useMemo(() => {
    if (resolvedMode !== 'generic') return false;
    const categoryPath = payload.product.category_path || [];
    const tags = Array.isArray(payload.product.tags) ? payload.product.tags : [];
    const department = payload.product.department ? [payload.product.department] : [];
    const haystack = [...categoryPath, ...tags, ...department].join(' ').toLowerCase();
    if (!haystack) return false;

    const keywords = [
      // apparel
      'apparel',
      'clothing',
      'tops',
      'bottoms',
      'pants',
      'jeans',
      'dress',
      'skirt',
      'outerwear',
      'jacket',
      'coat',
      'hoodie',
      'sweater',
      'shirt',
      't-shirt',
      'tee',
      'activewear',
      // footwear
      'footwear',
      'shoe',
      'shoes',
      'sneaker',
      'sneakers',
      'boot',
      'boots',
      'heel',
      'heels',
      'sandals',
      'slippers',
    ];

    return keywords.some((kw) => haystack.includes(kw));
  }, [payload.product.category_path, payload.product.department, payload.product.tags, resolvedMode]);

  const tabs = useMemo(() => {
    return [
      { id: 'product', label: 'Product' },
      ...(hasReviews ? [{ id: 'reviews', label: 'Reviews' }] : []),
      ...(showShades ? [{ id: 'shades', label: 'Shades' }] : []),
      ...(showSizeGuide ? [{ id: 'size', label: 'Size' }] : []),
      { id: 'details', label: 'Details' },
      ...(showRecommendationsSection ? [{ id: 'similar', label: 'Similar' }] : []),
    ];
  }, [hasReviews, showShades, showSizeGuide, showRecommendationsSection]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    sectionRefs.current[tabId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('product');
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const updateNavVisibility = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const maxScroll = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        const viewportThreshold = window.innerHeight * 1.1;
        const threshold =
          maxScroll >= viewportThreshold
            ? viewportThreshold
            : Math.max(80, maxScroll * 0.4);
        const nextVisible = maxScroll > 0 && window.scrollY >= threshold;
        setNavVisible(nextVisible);
      });
    };
    updateNavVisibility();
    window.addEventListener('scroll', updateNavVisibility, { passive: true });
    window.addEventListener('resize', updateNavVisibility);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateNavVisibility);
      window.removeEventListener('resize', updateNavVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame = 0;
    const updateActive = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const offset = headerHeight + (navVisible ? 36 : 0) + 10;
        const entries = tabs
          .map((tab) => {
            const node = sectionRefs.current[tab.id];
            if (!node) return null;
            return { id: tab.id, top: node.getBoundingClientRect().top };
          })
          .filter(Boolean) as Array<{ id: string; top: number }>;

        if (!entries.length) return;
        let current = entries[0].id;
        entries.forEach((entry) => {
          if (entry.top - offset <= 0) current = entry.id;
        });
        if (current && current !== activeTab) {
          setActiveTab(current);
        }
      });
    };
    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, [tabs, activeTab, navVisible, headerHeight]);

  const handleColorSelect = (value: string) => {
    setSelectedColor(value);
    const match = findVariantByOptions({ variants, color: value, size: selectedSize });
    if (match) {
      setSelectedVariantId(match.variant_id);
      setActiveMediaIndex(0);
    }
  };

  const handleSizeSelect = (value: string) => {
    setSelectedSize(value);
    const match = findVariantByOptions({ variants, color: selectedColor, size: value });
    if (match) {
      setSelectedVariantId(match.variant_id);
      setActiveMediaIndex(0);
    }
  };

  const handleVariantSelect = (variantId: string) => {
    setSelectedVariantId(variantId);
    setActiveMediaIndex(0);
  };

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  };

  const handleShare = () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    pdpTracking.track('pdp_action_click', { action_type: 'share' });

    if (navigator.share) {
      navigator.share({ title: payload.product.title, url }).catch(() => {
        // ignore share cancel
      });
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {
        // ignore clipboard failures
      });
    }
  };

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    pdpTracking.track('pdp_action_click', { action_type: 'search', query });
    router.push(`/products?q=${encodeURIComponent(query)}`);
  };

  const attributeOptions = extractAttributeOptions(selectedVariant);
  const beautyAttributes = extractBeautyAttributes(selectedVariant);
  const compareAmount =
    pricePromo?.compare_at?.amount ??
    selectedVariant.price?.compare_at?.amount ??
    payload.product.price?.compare_at?.amount;
  const discountPercent =
    compareAmount && compareAmount > displayPriceAmount
      ? Math.round((1 - displayPriceAmount / compareAmount) * 100)
      : null;
  const ugcFromReviews =
    reviews?.preview_items?.flatMap((item) => item.media || []) || [];
  const ugcFromMedia = (media?.items || []).slice(1);
  const ugcItems = (ugcFromReviews.length ? ugcFromReviews : ugcFromMedia).filter(
    (item) => item?.url,
  );
  const tagList = payload.product.tags || [];
  const halfTagCount = Math.ceil(tagList.length / 2);
  const popularLooks =
    payload.product.beauty_meta?.popular_looks || tagList.slice(0, halfTagCount);
  const bestFor =
    payload.product.beauty_meta?.best_for || tagList.slice(halfTagCount);
  const importantInfo = payload.product.beauty_meta?.important_info || [];
  const trustBadges = [];
  if (payload.product.brand?.name) trustBadges.push('Authentic');
  if (effectiveReturns?.return_window_days) {
    trustBadges.push(
      effectiveReturns.free_returns
        ? 'Free returns'
        : `Returns · ${effectiveReturns.return_window_days} days`,
    );
  }
  if (effectiveShippingEta?.length) {
    trustBadges.push(
      `Shipping ${effectiveShippingEta[0]}–${effectiveShippingEta[1]} days`,
    );
  }
  const showTrustBadges = resolvedMode === 'beauty' && trustBadges.length > 0;

  return (
    <div className="relative min-h-screen bg-background pb-[calc(120px+env(safe-area-inset-bottom,0px))] lovable-pdp">
      <div
        className={cn(
          'fixed left-0 right-0 z-50 transition-colors',
          navVisible ? 'bg-gradient-to-b from-white via-white to-white/95 shadow-sm' : 'bg-transparent',
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto max-w-md flex items-center gap-2 h-11 px-3">
          <button
            type="button"
            onClick={handleBack}
            className={cn(
              'h-9 w-9 rounded-full border border-border flex items-center justify-center',
              navVisible ? 'bg-white' : 'bg-white/90',
            )}
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          {navVisible ? (
            <form className="flex-1" onSubmit={handleSearchSubmit}>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                enterKeyHint="search"
                className="w-full h-8 rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </form>
          ) : null}
          <button
            type="button"
            onClick={handleShare}
            className={cn(
              'h-9 w-9 rounded-full border border-border flex items-center justify-center ml-auto',
              navVisible ? 'bg-white' : 'bg-white/90',
            )}
            aria-label="Share"
          >
            <Share2 className="h-4 w-4 text-foreground" />
          </button>
        </div>
        {navVisible ? (
          <div className="bg-white border-b border-border/60">
            <div className="max-w-md mx-auto flex">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    'relative flex-1 py-2.5 text-xs font-semibold transition-colors',
                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground',
                  )}
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                >
                  {tab.label}
                  {activeTab === tab.id ? (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-10 bg-primary rounded-full" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

        <div className="mx-auto w-full max-w-md">
        <div
          ref={(el) => {
            sectionRefs.current.product = el;
          }}
          style={{ scrollMarginTop }}
        >
          <div className="pb-2">
            <div className="relative">
              <MediaGallery
                data={galleryData}
                title={payload.product.title}
                fallbackUrl={heroUrl}
                activeIndex={activeMediaIndex}
                onSelect={(index) => setActiveMediaIndex(index)}
                onOpenAll={() => setShowMediaSheet(true)}
                aspectClass={resolvedMode === 'generic' ? 'aspect-square' : 'aspect-[6/5]'}
                fit={resolvedMode === 'generic' ? 'object-contain' : 'object-cover'}
              />
            </div>

            {resolvedMode === 'beauty' && variants.length > 1 ? (
              <div className="border-b border-border bg-card py-1.5">
                <div className="overflow-x-auto">
                  <div className="flex items-center gap-1.5 px-3">
                    {variants.slice(0, 4).map((variant) => {
                      const isSelected = variant.variant_id === selectedVariant.variant_id;
                      return (
                        <button
                          key={variant.variant_id}
                          onClick={() => {
                            handleVariantSelect(variant.variant_id);
                            pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variant.variant_id });
                          }}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] whitespace-nowrap transition-all',
                            isSelected
                              ? 'border-primary bg-primary/20 font-semibold text-primary ring-2 ring-primary/50 shadow-sm'
                              : 'border-border hover:border-primary/50',
                          )}
                        >
                          {variant.swatch?.hex ? (
                            <span
                              className={cn(
                                'h-3 w-3 rounded-full ring-1 ring-border',
                                isSelected ? 'ring-primary/50' : 'ring-border',
                              )}
                              style={{ backgroundColor: variant.swatch.hex }}
                            />
                          ) : null}
                          <span>{variant.title}</span>
                        </button>
                      );
                    })}
                    {variants.length > 4 ? (
                      <button
                        onClick={() => setShowShadeSheet(true)}
                        className="rounded-full border border-dashed border-border px-2.5 py-1 text-[10px] text-muted-foreground"
                      >
                        +{variants.length - 4} more
                      </button>
                    ) : null}
                    <button
                      onClick={() => setShowShadeSheet(true)}
                      className="ml-auto text-[10px] text-primary font-medium whitespace-nowrap"
                    >
                      {variants.length} colors →
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="px-3 py-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[26px] font-semibold text-foreground leading-none">{formatPrice(displayPriceAmount, displayCurrency)}</span>
                {!isInStock ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                    Out of stock
                  </span>
                ) : null}
                {compareAmount && compareAmount > displayPriceAmount ? (
                  <span className="text-[10px] text-muted-foreground line-through">
                    {formatPrice(compareAmount, displayCurrency)}
                  </span>
                ) : null}
                {discountPercent ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    -{discountPercent}%
                  </span>
                ) : null}
                {offers.length > 1 ? (
                  <button
                    type="button"
                    className="ml-auto text-[11px] font-semibold text-primary"
                    onClick={() => {
                      pdpTracking.track('pdp_action_click', { action_type: 'open_offer_sheet' });
                      setShowOfferSheet(true);
                    }}
                  >
                    Other offers ({Math.max(0, offers.length - 1)})
                  </button>
                ) : null}
              </div>

              <h1 className="mt-1 text-[17px] font-semibold leading-snug text-foreground">
                {payload.product.brand?.name ? `${payload.product.brand.name} ` : ''}{payload.product.title}
              </h1>
              {payload.product.subtitle ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">{payload.product.subtitle}</p>
              ) : null}
              {variants.length > 1 ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Selected: <span className="text-foreground">{selectedVariant?.title}</span>
                </div>
              ) : null}

              {reviews?.review_count ? (
                <button
                  className="mt-1 flex items-center gap-1.5"
                  onClick={() => handleTabChange('reviews')}
                >
                  <StarRating value={(reviews.rating / reviews.scale) * 5} />
                  <span className="text-xs font-medium">{reviews.rating.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">({reviews.review_count})</span>
                </button>
              ) : null}

              {resolvedMode === 'beauty' && beautyAttributes.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {beautyAttributes.map((opt) => (
                    <span
                      key={`${opt.label}-${opt.value}`}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px]"
                    >
                      {opt.value}
                    </span>
                  ))}
                </div>
              ) : null}

              {attributeOptions.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {attributeOptions.map((opt) => (
                    <span
                      key={`${opt.name}-${opt.value}`}
                      className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px]"
                    >
                      {opt.name}: {opt.value}
                    </span>
                  ))}
                </div>
              ) : null}

              {resolvedMode === 'generic' && colorOptions.length ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Color</div>
                    <button
                      type="button"
                      onClick={() => setShowColorSheet(true)}
                      className="text-[11px] font-medium text-primary"
                    >
                      View all →
                    </button>
                  </div>
                  <div className="mt-1.5 overflow-x-auto">
                    <div className="flex gap-1.5 pb-1">
                      {colorOptions.slice(0, 8).map((color) => {
                        const isSelected = selectedColor === color;
                        return (
                          <button
                            key={color}
                            onClick={() => handleColorSelect(color)}
                            className={cn(
                              'flex-shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
                              isSelected
                                ? 'border-primary bg-primary/20 text-primary ring-2 ring-primary/50'
                                : 'border-border hover:border-primary/50',
                            )}
                          >
                            {color}
                          </button>
                        );
                      })}
                      {colorOptions.length > 8 ? (
                        <button
                          type="button"
                          onClick={() => setShowColorSheet(true)}
                          className="flex-shrink-0 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          +{colorOptions.length - 8} more
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {resolvedMode === 'generic' && sizeOptions.length ? (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold">Size</div>
                    <div className="text-[11px] text-muted-foreground">Select a size</div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {sizeOptions.map((size) => {
                      const isSelected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          onClick={() => handleSizeSelect(size)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs transition-colors',
                            isSelected
                              ? 'border-primary bg-primary/20 text-primary ring-2 ring-primary/50'
                              : 'border-border hover:border-primary/50',
                          )}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {resolvedMode === 'generic' && !sizeOptions.length && !colorOptions.length && variants.length > 1 ? (
                <div className="mt-2">
                  <VariantSelector
                    variants={variants}
                    selectedVariantId={selectedVariant.variant_id}
                    onChange={(variantId) => {
                      handleVariantSelect(variantId);
                      pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
                    }}
                    mode={resolvedMode}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {showTrustBadges ? (
            <div className="mx-3 mt-1.5 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[10px]">
              {trustBadges.map((badge, idx) => (
                <div key={`${badge}-${idx}`} className="flex items-center gap-2">
                  <span>{badge}</span>
                  {idx < trustBadges.length - 1 ? <span className="text-border">•</span> : null}
                </div>
              ))}
            </div>
          ) : (effectiveShippingEta?.length || effectiveReturns?.return_window_days) ? (
            <div className="mx-3 rounded-lg bg-card border border-border px-3 py-1.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
              {effectiveShippingEta?.length ? (
                <span>
                  Shipping {effectiveShippingEta[0]}–{effectiveShippingEta[1]} days
                </span>
              ) : null}
              {effectiveReturns?.return_window_days ? (
                <span>
                  {effectiveReturns.free_returns ? 'Free returns' : 'Returns'} · {effectiveReturns.return_window_days} days
                </span>
              ) : null}
            </div>
          ) : null}

          {resolvedMode === 'beauty' ? (
            <>
              <BeautyRecentPurchases
                items={payload.product.recent_purchases || []}
                showEmpty={allowMockRecentPurchases}
              />
              <BeautyUgcGallery items={ugcItems} showEmpty />
            </>
          ) : resolvedMode === 'generic' ? (
            <>
              <GenericRecentPurchases
                items={payload.product.recent_purchases || []}
                showEmpty={allowMockRecentPurchases}
              />
              <GenericStyleGallery items={ugcItems} showEmpty />
              {showSizeHelper ? <GenericSizeHelper /> : null}
            </>
          ) : null}
        </div>

        {hasReviews ? (
          <div
            ref={(el) => {
              sectionRefs.current.reviews = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            <BeautyReviewsSection
              data={reviews as ReviewsPreviewData}
              brandName={payload.product.brand?.name}
              showEmpty
              onWriteReview={
                onWriteReview
                  ? () => {
                      pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'write_review' });
                      onWriteReview();
                    }
                  : undefined
              }
              onSeeAll={
                onSeeAllReviews
                  ? () => {
                      pdpTracking.track('pdp_action_click', { action_type: 'open_embed', target: 'open_reviews' });
                      onSeeAllReviews();
                    }
                  : undefined
              }
            />
          </div>
        ) : null}

        {showShades ? (
          <div
            ref={(el) => {
              sectionRefs.current.shades = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            {resolvedMode === 'beauty' ? (
              <BeautyShadesSection
                selectedVariant={selectedVariant}
                popularLooks={popularLooks}
                bestFor={bestFor}
                importantInfo={importantInfo}
                mediaItems={media?.items || []}
                brandName={payload.product.brand?.name}
                showEmpty
              />
            ) : (
              <div className="px-4 py-4">
                <h2 className="text-sm font-semibold mb-2">Shades</h2>
                <div className="grid grid-cols-3 gap-3">
                  {variants.map((variant) => {
                    const isSelected = variant.variant_id === selectedVariant.variant_id;
                    return (
                      <button
                        key={variant.variant_id}
                        onClick={() => {
                          handleVariantSelect(variant.variant_id);
                          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variant.variant_id });
                        }}
                        className={cn(
                          'rounded-xl border p-3 text-left transition-colors',
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {variant.swatch?.hex ? (
                            <span className="h-6 w-6 rounded-full ring-1 ring-border" style={{ backgroundColor: variant.swatch.hex }} />
                          ) : (
                            <span className="h-6 w-6 rounded-full bg-muted" />
                          )}
                          <span className="text-xs font-medium">{variant.title}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {showSizeGuide ? (
          <div
            ref={(el) => {
              sectionRefs.current.size = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            {resolvedMode === 'generic' ? (
              <GenericSizeGuide sizeGuide={payload.product.size_guide} />
            ) : (
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold mb-2">Size Guide</h2>
                <div className="flex flex-wrap gap-2">
                  {sizeOptions.map((size) => {
                    const isSelected = selectedSize === size;
                    return (
                      <button
                        key={size}
                        onClick={() => handleSizeSelect(size)}
                        className={cn(
                          'rounded-full border px-3 py-1 text-xs transition-colors',
                          isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30',
                        )}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Sizing is based on merchant-provided options.</div>
              </div>
            )}
          </div>
        ) : null}

        {details ? (
          <div
            ref={(el) => {
              sectionRefs.current.details = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            {resolvedMode === 'beauty' ? (
              <BeautyDetailsSection data={details} product={payload.product} media={media} />
            ) : resolvedMode === 'generic' ? (
              <GenericDetailsSection data={details} product={payload.product} media={media} />
            ) : (
              <div className="px-4 py-4">
                <h2 className="text-sm font-semibold mb-3">Details</h2>
                <DetailsAccordion data={details} />
              </div>
            )}
          </div>
        ) : null}

        {showRecommendationsSection ? (
          <div
            ref={(el) => {
              sectionRefs.current.similar = el;
            }}
            className="border-t border-muted/60"
            style={{ scrollMarginTop }}
          >
            <div className="px-3 py-3">
              {recommendations?.items?.length ? (
                <RecommendationsGrid data={recommendations} />
              ) : isRecommendationsLoading ? (
                <RecommendationsSkeleton />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {mounted
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-[2147483646]">
              <div
                className="mx-auto max-w-md px-3"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                <div className="rounded-2xl border border-border bg-white shadow-[0_-10px_24px_rgba(0,0,0,0.12)] overflow-hidden mb-2">
                  {pricePromo?.promotions?.length ? (
                    <div className="flex items-center justify-between px-4 py-2 bg-primary/5 text-xs">
                      <span className="flex items-center gap-2">
                        <span className="text-primary">🎁</span>
                        <span>{pricePromo.promotions[0].label}</span>
                      </span>
                      <button className="text-muted-foreground" aria-label="Dismiss promotion">
                        ×
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex flex-1 gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-10 rounded-full font-semibold text-sm"
                        disabled={!isInStock}
                        onClick={() => {
                          pdpTracking.track('pdp_action_click', { action_type: 'add_to_cart', variant_id: selectedVariant.variant_id });
                          dispatchPdpAction('add_to_cart', {
                            variant: selectedVariant,
                            quantity: resolvedQuantity,
                            merchant_id: effectiveMerchantId,
                            offer_id: selectedOffer?.offer_id || undefined,
                            onAddToCart,
                          });
                        }}
                      >
                        {actionsByType.add_to_cart || 'Add to Cart'}
                      </Button>
                      <Button
                        className="flex-[1.5] h-10 rounded-full bg-primary hover:bg-primary/90 font-semibold text-sm"
                        disabled={!isInStock}
                        onClick={() => {
                          pdpTracking.track('pdp_action_click', { action_type: 'buy_now', variant_id: selectedVariant.variant_id });
                          dispatchPdpAction('buy_now', {
                            variant: selectedVariant,
                            quantity: resolvedQuantity,
                            merchant_id: effectiveMerchantId,
                            offer_id: selectedOffer?.offer_id || undefined,
                            onBuyNow,
                          });
                        }}
                      >
                        {actionsByType.buy_now || 'Buy Now'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      <MediaGallerySheet
        open={showMediaSheet}
        onClose={() => setShowMediaSheet(false)}
        items={galleryItems}
        activeIndex={activeMediaIndex}
        onSelect={(index) => setActiveMediaIndex(index)}
      />
      <BeautyVariantSheet
        open={resolvedMode === 'beauty' && showShadeSheet}
        onClose={() => setShowShadeSheet(false)}
        variants={variants}
        selectedVariantId={selectedVariant.variant_id}
        onSelect={(variantId) => {
          handleVariantSelect(variantId);
          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
        }}
      />
      <GenericColorSheet
        open={resolvedMode === 'generic' && showColorSheet}
        onClose={() => setShowColorSheet(false)}
        variants={variants}
        selectedVariantId={selectedVariant.variant_id}
        onSelect={(variantId) => {
          handleVariantSelect(variantId);
          pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
        }}
      />
      <OfferSheet
        open={showOfferSheet}
        offers={offers}
        selectedOfferId={selectedOfferId}
        defaultOfferId={payload.default_offer_id}
        bestPriceOfferId={payload.best_price_offer_id}
        onClose={() => setShowOfferSheet(false)}
        onSelect={(offerId) => {
          setSelectedOfferId(offerId);
          setShowOfferSheet(false);
          const offer = offers.find((o) => o.offer_id === offerId) || null;
          pdpTracking.track('pdp_action_click', {
            action_type: 'select_offer',
            offer_id: offerId,
            merchant_id: offer?.merchant_id,
          });
        }}
      />
      {offerDebugEnabled ? (
        <details className="mx-auto max-w-md px-3 pb-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Offer debug</summary>
          <div className="mt-2 rounded-xl border border-border bg-card/60 p-3 font-mono text-[11px] leading-relaxed">
            <div>selected_offer_id: {selectedOfferId || 'null'}</div>
            <div>default_offer_id: {payload.default_offer_id || 'null'}</div>
            <div>best_price_offer_id: {payload.best_price_offer_id || 'null'}</div>
            <div>
              product_group_id: {payload.product_group_id || selectedOffer?.product_group_id || 'null'}
            </div>
            <div>merchant_id: {selectedOffer?.merchant_id || payload.product.merchant_id || 'null'}</div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
