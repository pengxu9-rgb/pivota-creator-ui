'use strict';
// This is an owner-local browser demo, not an account authentication adapter.
function previewOrigin(env=process.env) {
  if(env.POKEMON_CREATOR_DEMO_ENABLED!=='true')return null;
  try {
    const url=new URL(env.POKEMON_CREATOR_DEMO_ORIGIN);
    if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.pathname!=='/'||url.username||url.password||url.search||url.hash)return null;
    return url.origin;
  }catch{return null;}
}
function requestAllowed(headers,env=process.env) {
  const origin=previewOrigin(env);
  return !!origin && headers.get('host')===new URL(origin).host
    && headers.get('origin')===origin && headers.get('x-collector-intent')==='decision'
    && /^application\/json(?:;|$)/i.test(headers.get('content-type')||'');
}
module.exports={previewOrigin,requestAllowed};
