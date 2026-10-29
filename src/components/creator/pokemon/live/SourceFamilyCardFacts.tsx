import type { FamilyContext } from "@/lib/pokemon/sourceFamilyTypes";

export default function SourceFamilyCardFacts({ metadata }: { metadata?: FamilyContext }) {
  if (!metadata) return null;
  if (metadata.schema !== "pokemon.source-card-family-advisory-context.v2" || metadata.scope !== "advisory_source_card_family_only" || metadata.existing_card_fields_must_remain_unchanged !== true) throw new Error("The source family details failed validation.");
  const source = metadata.evidence.source_facts, facts = source.card_details;
  const shown = (state: string, value: string | number | null) => {
    if (state === "not_declared" && value === null) return "Not declared by source";
    if (state === "not_applicable" && value === null) return "Not applicable";
    if (state !== "source_declared" || value === null) throw new Error("The source family details failed validation.");
    return value;
  };
  return <section aria-label="Source card family facts" style={{ minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere" }}>
    <h3>Source card family facts</h3>
    <p>These details describe the source card family. The exact printing, finish and printed number remain unverified.</p>
    <p>Source card type: {shown(facts.field_statuses.category, facts.category)}</p>
    <p>Source HP: {shown(facts.field_statuses.hp, facts.hp)}</p>
    <p>Source types: {shown(facts.field_statuses.types, facts.types === null ? null : facts.types.join(", "))}</p>
    <p>Source evolution stage: {shown(facts.field_statuses.stage, facts.stage)}</p>
    {facts.category !== "Pokemon" && facts.stage_source_literal !== null ? <p>Other source stage label: {facts.stage_source_literal}</p> : null}
    <p>Source illustrator: {shown(source.illustrator_status, source.illustrator)}</p>
    <p><a href={metadata.evidence.observation.url} target="_blank" rel="noreferrer">Source card record</a></p>
  </section>;
}
