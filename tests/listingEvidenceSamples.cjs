"use strict";
// Explicit offline contract fixtures, not a production identity resolver.
function exactListing(offer,cardId="ja:SV2A:173/165:holo") {
  const [language,set_code,collector_number,finish]=cardId.split(":");
  const claims={language,set_code,collector_number,finish,edition:"standard"};
  return {...offer,identity_status:"exact_match",card_id:cardId,listing_quantity:offer.listing_quantity??1,
    identity_evidence:{status:"exact_match",target_card_id:cardId,target:{...claims,evidence_ref:"fixture:server-catalog"},claims,
      matched_fields:Object.keys(claims),missing_fields:[],conflicting_fields:[],listing_url:offer.url,
      evidence_ref:"fixture:exact-listing-attributes",observed_at:offer.observed_at,basis:"exact_listing_structured",authenticity_verified:false}};
}
function photo(offer,changes={}) {return {url:"https://static.mercdn.net/item/detail/orig/photos/m1_1.jpg",role:"listing_photo",listing_url:offer.url,evidence_ref:"fixture:exact-listing-photo",observed_at:offer.observed_at,...changes};}
module.exports={exactListing,photo};
