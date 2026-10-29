"use strict";
const LABELS=Object.freeze({
  "finish_edition_unverified": "Finish and edition have not been verified.",
  "not_visually_reviewed": "This image reference has not had a visual review.",
  "source_image_name_unconfirmed": "The name on the source image is unconfirmed.",
  "source_hp_conflict": "The HP on the source image conflicts with the catalog.",
  "source_hp_without_visible_header": "The catalog HP is not visible in the source image.",
  "stale_source_image_facts": "The image review no longer matches the current card record.",
  "source_number_coordinate_conflict": "The number on the source image conflicts with the catalog record.",
  "source_animation_frame0_preview": "This preview shows the first frame of the source animation.",
  "low_resolution_source": "The source image is low resolution."
});
function validWarnings(values){return Array.isArray(values)&&values.length<=32&&new Set(values).size===values.length&&values.every(v=>typeof v==="string"&&Object.prototype.hasOwnProperty.call(LABELS,v));}
function warningLabels(values){if(!validWarnings(values))throw Object.assign(new Error("invalid_catalog_media_evidence"),{code:"invalid_catalog_media_evidence"});return values.map(v=>LABELS[v]);}
module.exports={validWarnings,warningLabels};
