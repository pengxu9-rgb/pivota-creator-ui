"use strict";
// Provider work runs outside the short conversation-store lease. Never replay it after a lost acknowledgement.
async function runCommerce({begin,invoke,finish,signal}){
  if(typeof begin!=='function'||typeof finish!=='function')throw Error('invalid_commerce_request');
  const reservation=await begin();
  let finishing=false;
  try{
    const value=await invoke();
    if(signal?.aborted)throw Error('cancelled');
    if(reservation){finishing=true;const ack=await finish(reservation,{response:value});if(ack?.accepted===false)throw Error('commerce_reservation_expired');}
    return value;
  }catch(error){
    if(reservation&&!finishing){finishing=true;try{await finish(reservation,{error:error.code||error.message||'commerce_unavailable'});}catch{/* Explicit read recovers a pending event; no provider retry. */}}
    throw error;
  }
}
module.exports={runCommerce};
