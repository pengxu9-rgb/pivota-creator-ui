import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import styles from "./coverage.module.css";
const { coveragePageAllowed, loadCoverageSnapshot } = require("@/lib/pokemon/privateCoverage.cjs");

export const dynamic = "force-dynamic";
export const revalidate = 0;

const number = (value: number | null) => value === null ? "Not measured" : value.toLocaleString("en-US");
const referenceLabels: Record<string, string> = { present: "Reference recorded", missing: "Missing reference", held: "Needs review", unknown: "Not evaluated" };

export default async function CoveragePage() {
  const principal = (await headers()).get("x-pot-beta-principal");
  if (!coveragePageAllowed(process.env, principal)) notFound();
  const report = loadCoverageSnapshot({ principal });
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/creator/pokemon-collector/shopper">●● <strong>Pot</strong> / coverage</Link><span>Private browsing beta · orders and payments disabled</span></header>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>A COMPLETE COMPARISON STARTS WITH COMPLETE EVIDENCE</p><h1>From catalog card<br />to a confident comparison.</h1><p>Track the card, the offers and the photos separately. Catalog artwork never counts as a photo of a seller’s copy.</p></div>
      <aside><p className={styles.eyebrow}>REVIEW SNAPSHOT</p><strong>{report ? report.report_date : "No report attached"}</strong><p>Saved evidence · no source requests</p></aside>
    </section>
    {!report ? <section className={styles.notice}><h2>Coverage report unavailable</h2><p>A validated private snapshot has not been attached to this build. Missing measurements are not zero inventory.</p></section> : <>
      <section className={styles.summary} aria-label="Coverage summary">
        <article><span>Priority cards</span><strong>{report.cohort.cards.length}</strong><small>Selected from retained test journeys</small></article>
        <article><span>Priority cards missing references</span><strong>{report.cohort.cards.filter((card: any) => card.reference_image_status === "missing").length}</strong><small>Held and unknown images stay separate</small></article>
        <article><span>Item-price groups for review</span><strong>{number(report.offers.metrics.claimed_product_price_groups)}</strong><small>Equal printing, grade, condition and currency claims</small></article>
        <article><span>Listings with reviewed copy photos</span><strong>{number(report.offers.metrics.authorized_copy_photo_listings)}</strong><small>Local evidence review, not physical authentication</small></article>
      </section>
      <section><p className={styles.eyebrow}>THE NEXT MILESTONE</p><h2>Priority card queue</h2><p>These exact printings come from retained test journeys. They are not a popularity or demand ranking.</p>
        {report.offers.status === "not_ingested" && <p className={styles.notice}>Seller and photo coverage: not measured. No approved seller inventory has been supplied. This does not mean marketplaces have no offers.</p>}
        <div className={styles.cards}>{report.cohort.cards.map((card: any) => <article key={card.card_id}>
          <span className={styles.eyebrow}>{card.language === "ja" ? "JAPANESE" : "ENGLISH"}</span><h3>{card.name}</h3><p>{card.set_code} · {card.collector_number} · {card.variant}</p>
          <dl><div><dt>Reference artwork</dt><dd>{referenceLabels[card.reference_image_status]}</dd></div><div><dt>Current sellers / actual-copy photos</dt><dd>Not measured for this card</dd></div></dl>
          <p className={styles.note}>Reference artwork does not verify finish, edition, grade or physical-copy authenticity.</p>
        </article>)}</div>
        <p className={styles.note}>Next wave: {number(report.cohort.next_wave_samples)} retained identity samples. Marketplace aliases and listing-photo evidence still need review.</p>
      </section>
      <section className={styles.foundation}><p className={styles.eyebrow}>THE FOUNDATION</p><h2>Catalog breadth and reference art</h2>
        <dl><div><dt>Catalog source records</dt><dd>{number(report.catalog.source_records)}</dd></div><div><dt>Language-specific sets</dt><dd>{number(report.catalog.language_sets)}</dd></div><div><dt>Primary images with recorded copies</dt><dd>{number(report.catalog.primary_with_recorded_copy)}</dd></div><div><dt>Missing primary images</dt><dd>{number(report.catalog.missing_primary)}</dd></div><div><dt>Held for review</dt><dd>{number(report.catalog.held_primary)}</dd></div></dl>
        <p>Source records include variants and source versions. Image counts reconcile primary selections with historical copy evidence; current browser loading is not established by this report.</p>
      </section>
    </>}
    <section className={styles.footer}><h2>Two price stages</h2><p>Compare product asking prices within compatible grade and condition groups first. Final quotes need the selected listing and purchase or delivery details. This page has no quote, source-activation, order or payment action.</p></section>
  </main>;
}
