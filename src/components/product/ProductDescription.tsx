"use client";

import { formatDescriptionText, isLikelyHeadingParagraph, splitParagraphs } from "@/lib/formatDescriptionText";

export function ProductDescription({
  description,
  descriptionHtml,
}: {
  description?: string | null;
  descriptionHtml?: string | null;
}) {
  if (typeof descriptionHtml === "string" && descriptionHtml.trim().length > 0) {
    return (
      <div
        className="product-description"
        // 描述来自自有后端 + Shopify，当前信任来源，只在详情页使用富文本。
        dangerouslySetInnerHTML={{ __html: descriptionHtml }}
      />
    );
  }

  const text = formatDescriptionText(description || "");
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) return null;

  return (
    <div className="space-y-2 text-[12px] leading-relaxed text-[#8c715c]">
      {paragraphs.map((paragraph, idx) =>
        isLikelyHeadingParagraph(paragraph) ? (
          <div
            key={`${paragraph}-${idx}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-[#a38b78]"
          >
            {paragraph}
          </div>
        ) : (
          <p key={`${paragraph}-${idx}`} className="whitespace-pre-line">
            {paragraph}
          </p>
        ),
      )}
    </div>
  );
}

