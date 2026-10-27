import type { OfficialAnchoredSourceDetails } from "@/lib/pokemon/types";

export default function OfficialAnchoredCardFacts({ metadata }: { metadata?: OfficialAnchoredSourceDetails }) {
  if (!metadata) return null;
  if (metadata.schema !== "pokemon.official-anchored-source-details.v1" || metadata.status !== "official_anchored_source_details_supported") throw new Error("The source card details failed validation.");
  const facts = metadata.details;
  const shown = (field: "card_type" | "hp" | "types" | "stage", value: string | number | null) => {
    const state = facts.field_statuses[field];
    if (state === "not_declared") return "Not declared by source";
    if (state === "not_applicable_by_source_card_type") return "Not applicable";
    if (state !== "source_supported" || value === null) throw new Error("The source card details failed validation.");
    return value;
  };
  const sourceURL = "https://github.com/type-null/PTCG-database/blob/" + metadata.source.revision + "/" + metadata.source.relative_path;
  return (
    <section aria-label="Saved Japanese source details" style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}>
      <p>Source card type: {shown("card_type", facts.card_type_raw)}</p>
      <p>HP: {shown("hp", facts.hp)}</p>
      <p>Types: {shown("types", facts.types === null ? null : facts.types.join(", "))}</p>
      <p>Evolution stage (source label): {shown("stage", facts.stage_raw)}</p>
      <p><a href={sourceURL} target="_blank" rel="noreferrer">Saved source record</a> · <a href={metadata.official_parent.url} target="_blank" rel="noreferrer">Official card identity page</a></p>
    </section>
  );
}
