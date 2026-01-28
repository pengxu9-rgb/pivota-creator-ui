import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProductDetailsData } from '@/features/pdp/types';
import { formatDescriptionText, isLikelyHeadingParagraph, splitParagraphs } from '@/lib/formatDescriptionText';
import { cn } from '@/lib/utils';

export function DetailsAccordion({ data }: { data: ProductDetailsData }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {data.sections.map((s, idx) => {
        const isOpen = open.has(idx);
        const formattedContent = isOpen ? formatDescriptionText(s.content) : '';
        const paragraphs = isOpen ? splitParagraphs(formattedContent) : [];
        return (
          <div key={`${s.heading}-${idx}`} className="border-b border-border last:border-b-0">
            <button
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50"
            >
              <span className="text-sm font-semibold">{s.heading}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform duration-200',
                  isOpen ? 'rotate-180' : '',
                )}
              />
            </button>
            {isOpen ? (
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">
                {paragraphs.length ? (
                  <div className="space-y-2">
                    {paragraphs.map((paragraph, paragraphIndex) =>
                      isLikelyHeadingParagraph(paragraph) ? (
                        <div
                          key={`${paragraph}-${paragraphIndex}`}
                          className="text-[11px] font-semibold tracking-wide text-foreground"
                        >
                          {paragraph}
                        </div>
                      ) : (
                        <p key={`${paragraph}-${paragraphIndex}`} className="whitespace-pre-line">
                          {paragraph}
                        </p>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-line">{formattedContent}</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
