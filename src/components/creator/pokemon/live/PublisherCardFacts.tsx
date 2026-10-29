import type { PinnedPublisherMetadata } from "@/lib/pokemon/types";

export default function PublisherCardFacts({ metadata }: { metadata?: PinnedPublisherMetadata }) {
  if (!metadata) return null;
  if (metadata.schema !== "pokemon.pinned-publisher-metadata.v1") throw new Error("The source card details failed validation.");
  const facts = metadata.publisher;
  const shown = (field: "card_type" | "hp" | "types" | "stage", value: string | number | null) => {
    const state = facts.field_statuses[field];
    if (state === "not_declared") return "Not declared by source";
    if (state === "source_or_current_value_hold") return "Needs source review";
    if (state === "not_applicable_by_source_card_type") return "Not applicable";
    if (state !== "source_supported" || value === null) throw new Error("The source card details failed validation.");
    return value;
  };
  return (
    <section aria-label="Japanese source card details">
      <p>Source card type: {shown("card_type", facts.card_type_raw)}</p>
      <p>HP: {shown("hp", facts.hp)}</p>
      <p>Types: {shown("types", facts.types === null ? null : facts.types.join(", "))}</p>
      <p>Evolution stage (source label): {shown("stage", facts.stage_raw)}</p>
      <p><a href={metadata.source.declared_card_url} target="_blank" rel="noreferrer">Japanese source card details</a> · From the saved source record</p>
    </section>
  );
}
