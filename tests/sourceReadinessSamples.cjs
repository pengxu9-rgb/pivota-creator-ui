"use strict";
// Synthetic capability metadata only; this file grants no real source access.
function readiness({source="mercari",enabled=true,photos=true,blocker="source_disabled"}={}) {
  return ["ebay_us","mercari","snkrdunk"].map(id=>{
    const active=id===source&&enabled;
    return {source:id,status:active?"enabled":id===source?"configured_offline":"not_configured",method:id===source?(id==="ebay_us"?"api":"crawl"):"none",listing_read_enabled:active,photo_display:active&&photos?"authorized_only":"not_approved",blocker:active?null:id===source?blocker:"source_access_required",message:"Synthetic source capability for offline protocol tests."};
  });
}
module.exports={readiness};
