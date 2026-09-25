import { useEffect,useState } from "react";
import { readMemberGuilds } from "../lib/session-client";

type Guild={tenant_id:string;guild_id:string;name:string|null};
export function WalletPicker(){
  const [state,setState]=useState<"loading"|"ready"|"unavailable">("loading");
  const [guilds,setGuilds]=useState<Guild[]>([]);
  useEffect(()=>{let active=true;void readMemberGuilds().then((value)=>{
    if (!active) return;
    if (value.kind==="unauthenticated"){window.location.assign("/auth/login");return;}
    setState(value.kind);if (value.kind==="ready") setGuilds(value.guilds);
  });return()=>{active=false;};},[]);
  if (state==="loading") return <p>Loading your servers.</p>;
  if (state==="unavailable") return <p role="alert">Your servers are temporarily unavailable.</p>;
  if (!guilds.length) return <p>No installed guild wallets are available to this account.</p>;
  return <ul className="mt-6 space-y-3">{guilds.map((guild)=><li key={guild.tenant_id}>
    <a className="underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-950" href={`/guild/${guild.tenant_id}/economy`}>{guild.name||guild.guild_id}</a>
  </li>)}</ul>;
}
