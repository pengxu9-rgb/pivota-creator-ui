# Pot seller-offer journey

Pot uses the existing conversation, research, selection and BNS preview routes.
There is no new public API path, provider credential input or order/payment route.
The browsing beta remains catalog-only. Its **Seller offer access** panel is a
passive explanation: opening it and typing a seller/quote command do not call a
marketplace, a certificate provider or BNS.

The research producer can report `source_readiness` for eBay, Mercari and
SNKRDUNK. Each closed record reports the configured method, current listing-read
capability, separate seller-photo display permission and a safe blocker code.
Configured or enabled access does not establish current inventory, exhaustive
coverage, merchant support at BNS or card authenticity. Source messages in the
shopper view are fixed consumer copy; private policy references and credentials
do not belong in this payload.

The frontend preserves older research responses for evidence review. Missing,
malformed or inactive readiness cannot authorize a non-fixture selection or
automatic quote/handoff. A captured offer may still be shown after the source
request budget ends. Independently approved photo display can remain permitted
when listing reads stop, but revoked or missing permission hides both image
elements and original-image links. Catalog artwork is never substituted for a
seller photograph.

1. Compare item asks in their original currencies and compatible printing,
   language, condition and grade groups. Multiple sellers and listings stay
   distinct. Sold, stale, conflicting or unverified evidence remains explicit.
2. Select one exact listing. It is a choice for recheck, not a stock reservation.
   A changed identity, grade, price, availability or certificate conflict blocks
   progression. The backend must recheck source permission before dispatch.
3. Request a supported BNS quote or informational URL handoff for that listing.
   Provider options require an explicit choice. Destination-dependent totals
   remain separate from item asks. The quote binds the selected URL, reference
   and variant, not the authenticity of a physical card.
4. Orders and payments remain disabled. Copying a URL, opening the BNS form or
   receiving a quote does not create or complete an order.

The real hook and rendering regressions use synthetic inputs with no external
network access. They exercise two sellers for one grade, separate other grades,
explicit option choice, quote binding, inactive/missing access, price-change
failure and rejection of an order-enabled response. These are protocol tests,
not evidence that live inventory or BNS sandbox fulfillment has been tested.

Live activation still needs approved listing and seller-photo access. A real
BNS sandbox test additionally needs the partner's verified test endpoint,
credential reference, nonfulfillment assurance and supported test listing and
destination. A marketplace's public page is not itself permission to crawl it.
