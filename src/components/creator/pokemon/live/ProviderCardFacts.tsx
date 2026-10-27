import type { ProviderCardMetadata } from "@/lib/pokemon/types";

export default function ProviderCardFacts({ metadata }: { metadata?: ProviderCardMetadata }) {
  if (metadata?.schema !== "pokemon.provider-card-metadata-context.v2") return null;
  const details = metadata.provider.card_details;
  if (!details) throw new Error("The source card details failed validation.");
  const shown = (field: "category" | "hp" | "types" | "stage", value: string | number | null) => {
    const state = details.field_statuses[field];
    if (state === "not_applicable") return "Not applicable";
    if (state === "not_declared") return "Not declared by source";
    if (value === null) throw new Error("The source card details failed validation.");
    return value;
  };
  return (
    <section aria-label="Source card details">
      <p>Card category: {shown("category", details.category === "Pokemon" ? "Pokémon" : details.category)}</p>
      <p>HP: {shown("hp", details.hp)}</p>
      <p>Types: {shown("types", details.types === null ? null : details.types.join(", "))}</p>
      <p>Evolution stage: {shown("stage", details.stage)}</p>
      {details.category !== "Pokemon" && details.stage_source_literal !== null && (
        <p>Source stage label: {details.stage_source_literal} · This is not a Pokémon evolution stage.</p>
      )}
      <p><a href={metadata.source.url} target="_blank" rel="noreferrer">TCGDex card details</a></p>
    </section>
  );
}
