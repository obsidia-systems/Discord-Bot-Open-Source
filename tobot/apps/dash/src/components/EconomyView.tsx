import { useEffect, useState, type SyntheticEvent } from "react";
import { publishEconomy, readEconomy, readWallet, setEconomyCircuit, type EconomyBody, type WalletBody } from "../lib/session-client";

export function EconomyView({tenantId}:{tenantId:string}) {
  const [wallet,setWallet]=useState<WalletBody|null>(null);
  const [walletState,setWalletState]=useState("loading");
  const [economy,setEconomy]=useState<EconomyBody|null>(null);
  const [operator,setOperator]=useState(false);
  const [message,setMessage]=useState("");
  const [grant,setGrant]=useState("100");
  const [daily,setDaily]=useState("10");
  const [walletCeiling,setWalletCeiling]=useState("1000000");
  const [issuanceCeiling,setIssuanceCeiling]=useState("1000000000");

  useEffect(()=>{
    let active=true;
    async function refresh(){
      const [own,policy]=await Promise.all([readWallet(tenantId),readEconomy(tenantId)]);
      if (!active) return;
      if (own.kind==="unauthenticated") {window.location.assign("/auth/login");return;}
      setWalletState(own.kind);
      if (own.kind==="ready") setWallet(own.body);
      if (policy.kind==="ready") {
        setOperator(true);setEconomy(policy.body);
        setGrant((value)=>policy.body.currency ? String(policy.body.currency.starting_grant) : value);
        setDaily((value)=>policy.body.daily ? String(policy.body.daily.amount) : value);
        setWalletCeiling((value)=>policy.body.currency ? String(policy.body.currency.wallet_ceiling) : value);
        setIssuanceCeiling((value)=>policy.body.currency ? String(policy.body.currency.issuance_ceiling) : value);
      }
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),5000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[tenantId]);

  async function submit(event:SyntheticEvent<HTMLFormElement>){
    event.preventDefault();setMessage("");
    const request={starting_grant:Number(grant),daily_amount:Number(daily),wallet_ceiling:Number(walletCeiling),issuance_ceiling:Number(issuanceCeiling)};
    if (!Object.values(request).every((value)=>Number.isSafeInteger(value))){setMessage("Enter whole unit amounts.");return;}
    const outcome=await publishEconomy(tenantId,request);
    if (outcome==="unauthenticated"){window.location.assign("/auth/login");return;}
    setMessage(outcome==="done"?"Currency and daily policies were published.":outcome==="invalid"?"Check the policy amounts and ceilings.":"The policy could not be published. Check setup status before retrying.");
    const updated=await readEconomy(tenantId);
    if (updated.kind==="ready") setEconomy(updated.body);
  }

  async function switchWrites(enabled:boolean){
    if (!economy?.currency || !economy.daily) return;
    setMessage("");
    const outcome=await setEconomyCircuit(tenantId,enabled,enabled);
    if (outcome==="unauthenticated"){window.location.assign("/auth/login");return;}
    setMessage(outcome==="done"?enabled?"Daily claims and credits enabled.":"Daily claims and credits paused.":"The write controls could not be changed.");
    const updated=await readEconomy(tenantId);
    if (updated.kind==="ready") setEconomy(updated.body);
  }

  return <>
    <h1 className="font-serif text-3xl text-zinc-950">Guild wallet</h1>
    <p className="mt-3 text-zinc-700">Virtual guild units have no cash value. Use /daily in Discord to claim once every 24 hours.</p>
    {walletState==="loading"?<p className="mt-8">Loading your wallet.</p>:null}
    {walletState==="no-access"?<p className="mt-8" role="alert">You do not have access to this server wallet.</p>:null}
    {walletState==="unavailable"?<p className="mt-8" role="alert">Your wallet is temporarily unavailable.</p>:null}
    {walletState==="ready" && !wallet?.wallet?<p className="mt-8">No wallet yet. Your first eligible claim creates it.</p>:null}
    {walletState==="ready" && wallet?.wallet?<section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Your wallet">
      <p className="text-2xl font-semibold">{wallet.wallet.current.toLocaleString()} units</p>
      <p className="mt-1 text-sm text-zinc-700">Available {wallet.wallet.available.toLocaleString()} · Currency {wallet.wallet.currency_id}</p>
      <p className="mt-1 text-sm text-zinc-700">Committed journal sequence {wallet.wallet.journal_sequence}.</p>
      {wallet.projection?<p className="mt-1 text-sm text-zinc-700">Query projection sequence {wallet.projection.journal_sequence}{wallet.projection.journal_sequence<wallet.wallet.journal_sequence?" (catching up)":""}.</p>:null}
      {wallet.wallet.recent_postings.length?<div className="mt-5">
        <h2 className="font-semibold">Recent credits</h2>
        <ul className="mt-2 space-y-2 text-sm">{wallet.wallet.recent_postings.map((posting)=><li key={posting.transaction_id} className="flex justify-between border-b border-zinc-100 pb-2">
          <span>{posting.kind==="StartingGrant"?"Starting grant":posting.kind==="DailyIncome"?"Daily claim":posting.kind}</span>
          <span>+{posting.amount.toLocaleString()} · #{posting.journal_sequence}</span>
        </li>)}</ul>
      </div>:null}
    </section>:null}
    {operator?<section className="mt-10 border-t border-zinc-200 pt-5" aria-label="Economy policy">
      <h2 className="font-serif text-2xl">Daily policy</h2>
      <p className="mt-2 text-sm text-zinc-700">{economy?.ready?"Currency and daily policies are active.":"Setup is incomplete. /daily will not admit claims yet."}</p>
      {economy?.currency && !economy.currency.write_ready?<p className="mt-2" role="alert">Ledger writes are paused for reconciliation.</p>:null}
      {economy?.currency && economy.daily?<div className="mt-4 flex gap-3">
        <button className="border border-zinc-300 px-3 py-2 text-sm" type="button" onClick={()=>void switchWrites(false)}>Pause daily and credits</button>
        <button className="border border-zinc-300 px-3 py-2 text-sm" type="button" onClick={()=>void switchWrites(true)}>Resume daily and credits</button>
      </div>:null}
      <form className="mt-6 grid gap-4" onSubmit={(event)=>void submit(event)}>
        <label>One-time starting grant <input className="mt-1 block w-full border border-zinc-300 p-2" type="number" min="0" step="1" value={grant} onChange={(event)=>setGrant(event.target.value)} /></label>
        <label>Daily award <input className="mt-1 block w-full border border-zinc-300 p-2" type="number" min="1" step="1" value={daily} onChange={(event)=>setDaily(event.target.value)} /></label>
        <label>Wallet ceiling <input className="mt-1 block w-full border border-zinc-300 p-2" type="number" min="1" step="1" value={walletCeiling} onChange={(event)=>setWalletCeiling(event.target.value)} /></label>
        <label>Issuance ceiling <input className="mt-1 block w-full border border-zinc-300 p-2" type="number" min="1" step="1" value={issuanceCeiling} onChange={(event)=>setIssuanceCeiling(event.target.value)} /></label>
        <button className="w-fit border border-zinc-950 bg-zinc-950 px-4 py-2 text-white" type="submit">Publish policy</button>
      </form>
      {message?<p className="mt-3" role="status">{message}</p>:null}
    </section>:null}
  </>;
}
