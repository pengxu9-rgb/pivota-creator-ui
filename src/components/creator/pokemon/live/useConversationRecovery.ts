"use client";
import {useEffect,useRef,useState} from "react";
import type {CommerceTransport} from "@/lib/pokemon/commerceTypes";
// A Stop is complete only after cancellation and a fresh conversation read settle.
export default function useConversationRecovery(transport?:CommerceTransport){
  const held=useRef({pending:false,failed:false,generation:0}),latest=useRef(transport);latest.current=transport;
  const [state,setState]=useState({pending:false,failed:false});
  useEffect(()=>()=>{held.current.generation++;},[]);
  async function recover(abort:()=>void){
    if(held.current.pending||held.current.failed)return;
    const mine=++held.current.generation;held.current.pending=true;setState({pending:true,failed:false});abort();
    try{await latest.current?.cancel?.();if(held.current.generation===mine){held.current.failed=false;}}
    catch{if(held.current.generation===mine)held.current.failed=true;}
    finally{if(held.current.generation===mine){held.current.pending=false;setState({pending:false,failed:held.current.failed});}}
  }
  return {...state,blocked:state.pending||state.failed,isBlocked:()=>held.current.pending||held.current.failed,recover};
}
