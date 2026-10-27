"use client";
import {useCallback,useRef} from "react";
import {pokemonApi as api} from "../../pokemonClient";
import type {Conversation} from "@/lib/pokemon/types";
import type {CommerceTransport} from "@/lib/pokemon/commerceTypes";
export default function useConversationCommerce(thread:Conversation|null,onConversation:(value:Conversation)=>void,onUnavailable:()=>void) {
  const latest=useRef(thread);latest.current=thread;
  const callbacks=useRef({onConversation,onUnavailable});callbacks.current={onConversation,onUnavailable};
  const transport=useCallback<CommerceTransport>(async<T,>(operation:string,payload:unknown,signal?:AbortSignal)=>{
    let active=latest.current;
    if(!active){active=await api<Conversation>("chat-create",{},signal);latest.current=active;callbacks.current.onConversation(active);}
    const id=active.id;
    try{
      const value=await api<T>(operation,{...(payload as Record<string,unknown>),conversation:{id,version:active.version,request_id:crypto.randomUUID()}},signal);
      if(signal?.aborted)throw new Error("The check was stopped.");
      const current=await api<Conversation>("chat-get",{id},signal);
      if(signal?.aborted||latest.current?.id!==id)throw new Error("The conversation changed. Refresh its current check.");
      latest.current=current;callbacks.current.onConversation(current);return value;
    }catch(error){
      if(!signal?.aborted&&latest.current?.id===id){
        try{const current=await api<Conversation>("chat-get",{id},signal);if(!signal?.aborted&&latest.current?.id===id){latest.current=current;callbacks.current.onConversation(current);}}
        catch{callbacks.current.onUnavailable();}
      }
      throw error;
    }
  },[]);
  return Object.assign(transport,{cancel:async()=>{
    const active=latest.current;if(!active)return;
    try{await api("chat-cancel",{id:active.id});const current=await api<Conversation>("chat-get",{id:active.id});if(latest.current?.id===active.id){latest.current=current;callbacks.current.onConversation(current);if(current.busy)throw Error("The check is still settling. Reload the current conversation before continuing.");}}
    catch(error){if(latest.current?.id===active.id)callbacks.current.onUnavailable();throw error;}
  }});
}
