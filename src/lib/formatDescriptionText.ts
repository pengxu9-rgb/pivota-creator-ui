const BLOCK_TAGS = [
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
];

const SECTION_HEADINGS = [
  "HOW TO USE",
  "DIRECTIONS",
  "DETAILS",
  "INGREDIENTS",
  "KEY INGREDIENTS",
  "BENEFITS",
  "FEATURES",
  "WARNINGS",
  "WARNING",
  "CAUTION",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainTextPreserveParagraphs(input: string): string {
  if (!input) return "";

  const blockTagPattern = BLOCK_TAGS.join("|");
  const openBlockTag = new RegExp(`<\\s*(?:${blockTagPattern})\\b[^>]*>`, "gi");
  const closeBlockTag = new RegExp(`<\\s*\\/\\s*(?:${blockTagPattern})\\s*>`, "gi");

  return decodeBasicEntities(input)
    .replace(/\r/g, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n- ")
    .replace(openBlockTag, "\n")
    .replace(closeBlockTag, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPrevNonSpaceChar(input: string, idx: number): string | null {
  for (let i = idx - 1; i >= 0; i -= 1) {
    const ch = input[i];
    if (ch !== " " && ch !== "\n" && ch !== "\t") return ch;
  }
  return null;
}

function findNextNonSpaceChar(input: string, idx: number): string | null {
  for (let i = idx; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== " " && ch !== "\n" && ch !== "\t") return ch;
  }
  return null;
}

function insertHeadingBreaks(input: string): string {
  let text = input;
  const headings = [...SECTION_HEADINGS].sort((a, b) => b.length - a.length);

  for (const heading of headings) {
    const re = new RegExp(`\\b${escapeRegExp(heading)}\\b`, "gi");
    text = text.replace(re, (match, offset: number) => {
      const before = findPrevNonSpaceChar(text, offset);
      const after = findNextNonSpaceChar(text, offset + match.length);

      const okBefore = before == null || before === "\n" || /[.!?:;()]/.test(before);
      const okAfter =
        after == null || after === "\n" || after === ":" || (after >= "A" && after <= "Z");

      if (!okBefore || !okAfter) return match;
      return `\n\n${heading}\n`;
    });
  }

  return text;
}

function insertLabelLineBreaks(input: string): string {
  return input.replace(
    /([^\n])\s+(?=[A-Z][A-Za-z0-9]*(?: [A-Z][A-Za-z0-9]*){0,3}:\s)/g,
    "$1\n",
  );
}

function normalizeParagraphSpacing(input: string): string {
  const lines = input
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ ]{2,}/g, " ").trim());

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatDescriptionText(input: unknown): string {
  const raw = typeof input === "string" ? input : "";
  if (!raw) return "";

  let text = htmlToPlainTextPreserveParagraphs(raw);
  text = insertHeadingBreaks(text);
  text = insertLabelLineBreaks(text);
  text = normalizeParagraphSpacing(text);
  return text;
}

export function splitParagraphs(text: string): string[] {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function isLikelyHeadingParagraph(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  if (t.length > 48) return false;
  if (/[.?!]/.test(t)) return false;
  return /[A-Z]/.test(t) && t === t.toUpperCase();
}

export function hasHtmlTags(input: string | undefined | null): boolean {
  const s = String(input || "").trim();
  if (!s) return false;
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

