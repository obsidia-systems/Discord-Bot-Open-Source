import {useEffect,useState} from "react";
import {readBilling,startBillingCheckout,type BillingBody} from "../lib/session-client";

function formatPrice(minor:number,currency:string):string {
  const formatter=new Intl.NumberFormat("en-US",{style:"currency",currency:currency.toUpperCase()});
  const fractionDigits=formatter.resolvedOptions().maximumFractionDigits??2;
  return formatter.format(minor/10**fractionDigits);
}

function accessLabel(body:BillingBody):string {
  if (body.entitlement?.active) return body.entitlement.state==="Grace"?"Payment grace period":"Plan active";
  if (body.billing?.subscription_state==="Incomplete") return "Payment incomplete";
  if (body.billing?.order_state==="Fulfilled") return "Payment verified; access updating";
  if (body.billing?.order_state==="Open") return "Checkout started";
  if (body.entitlement?.state) return body.entitlement.state;
  return "No plan";
}

function benefitLabel(benefit:BillingBody["offers"][number]["benefits"][number]):string {
  if (benefit.key==="platform.base") return "Platform plan access";
  if (benefit.key==="support.closed") return "Open support tickets are not included";
  if (benefit.kind==="limit"&&benefit.key==="support.max_open_tickets") return `Open support ticket cap: ${benefit.quantity} simultaneous tickets`;
  if (benefit.kind==="limit") return `${benefit.key}: ${benefit.quantity} ${benefit.unit}`;
  return benefit.key;
}

export function BillingView({tenantId}:{tenantId:string}) {
  const [body,setBody]=useState<BillingBody|null>(null);
  const [kind,setKind]=useState("loading");
  const [message,setMessage]=useState("");
  const [submitting,setSubmitting]=useState(false);
  useEffect(()=>{
    let active=true;
    async function refresh(){
      const outcome=await readBilling(tenantId);
      if (!active) return;
      if (outcome.kind==="unauthenticated") {window.location.assign("/auth/login");return;}
      setKind(outcome.kind);
      if (outcome.kind==="ready") setBody(outcome.body);
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),5000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[tenantId]);
  async function checkout(revisionId:string){
    setSubmitting(true);setMessage("");
    const key=`tobot:billing:checkout:${tenantId}:${revisionId}`;
    let semanticKey=sessionStorage.getItem(key);
    if (!semanticKey){semanticKey=crypto.randomUUID();sessionStorage.setItem(key,semanticKey);}
    const outcome=await startBillingCheckout(tenantId,semanticKey,revisionId);
    if (outcome.kind==="ready"){window.location.assign(outcome.url);return;}
    if (outcome.kind==="unauthenticated"){window.location.assign("/auth/login");return;}
    setMessage(outcome.kind==="conflict"?"This server already has a checkout or an active plan. Check the current status before retrying.":
      outcome.kind==="no-access"?"You need current server administration to start checkout.":
      "Checkout is unavailable. Your previous request may still be processing; retry with the same button.");
    setSubmitting(false);
  }
  const entitlement=body?.entitlement;
  const offers=body?.offers??[];
  return <>
    <h1 className="font-serif text-3xl text-zinc-950">Platform plan</h1>
    <p className="mt-3 text-zinc-700">Checkout is hosted by the payment provider. Returning here does not confirm payment; this page updates after verification.</p>
    {kind==="loading"?<p className="mt-8">Loading plan status.</p>:null}
    {kind==="no-access"?<p className="mt-8" role="alert">You do not have access to this server.</p>:null}
    {kind==="unavailable"?<p className="mt-8" role="alert">Billing status is temporarily unavailable.</p>:null}
    {kind==="ready"?<section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Plan status">
      <h2 className="font-serif text-2xl">Access</h2>
      <p className="mt-2 font-semibold">{body?accessLabel(body):"No plan"}</p>
      {entitlement?.benefits.length?<ul className="mt-2 list-disc pl-5 text-sm">{entitlement.benefits.map((benefit) => <li key={benefit.key}>{benefitLabel(benefit)}</li>)}</ul>:null}
      {entitlement?.state==="Grace"&&entitlement.valid_until?<p className="mt-1 text-sm text-zinc-700">Grace ends {new Date(entitlement.valid_until*1000).toLocaleString()}.</p>:null}
      {!entitlement?.active&&body?.billing?.subscription_state==="Incomplete"?<p className="mt-3 text-sm text-zinc-700">The payment has not been confirmed, so this plan does not grant access yet. Check your Stripe payment or invoice email. {body.billing.purchased_offer?.support_url?<a className="underline" href={body.billing.purchased_offer.support_url} target="_blank" rel="noopener noreferrer">Contact support</a>:"Contact support"} if you cannot complete it; another checkout for this server is unavailable while this order is open.</p>:null}
      {!entitlement?.active&&body?.billing?.order_state==="Open"&&body.billing.subscription_state!=="Incomplete"?<p className="mt-3 text-sm text-zinc-700">Checkout has started, but payment is not confirmed. Complete the Stripe checkout to activate this plan. If the session has expired, contact support to resolve the open order.</p>:null}
      {!entitlement?.active&&body?.billing?.order_state==="Fulfilled"?<p className="mt-3 text-sm text-zinc-700">Payment has been verified. Access is still updating; refresh this page shortly.</p>:null}
      {(body?.billing?.order_state==="Open"||body?.billing?.order_state==="Fulfilled"||entitlement?.active)&&body?.billing?.purchased_offer?<p className="mt-2 text-sm">Chosen offer: {body.billing.purchased_offer.name} · {formatPrice(body.billing.purchased_offer.price_minor,body.billing.purchased_offer.currency)} per {body.billing.purchased_offer.interval}.</p>:null}
      <h2 className="mt-8 font-serif text-2xl">Available offers</h2>
      {offers.length===0?<p className="mt-3 text-sm">No plans are currently available for new checkout.</p>:null}
      {entitlement?.active?<p className="mt-3 text-sm">This server already has a base plan. Plan changes are not available yet.</p>:null}
      {!entitlement?.active&&body?.billing?.order_state==="Open"&&offers.length>0?<p className="mt-3 text-sm">This server already has an open purchase. Resolve it before choosing another plan.</p>:null}
      <div className="mt-4 space-y-4">{offers.map((offer)=><article key={offer.revision_id} className="border border-zinc-300 p-4">
        <h3 className="font-semibold">{offer.display_name}</h3>
        <p className="mt-1 text-sm">{formatPrice(offer.unit_amount,offer.currency)} per {offer.interval_name}</p>
        <p className="mt-1 text-sm text-zinc-700">Sold by {offer.merchant_of_record}.</p>
        <ul className="mt-2 list-disc pl-5 text-sm">{offer.benefits.map((benefit)=><li key={benefit.key}>{benefitLabel(benefit)}</li>)}</ul>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm"><a className="underline" href={offer.terms_url} target="_blank" rel="noopener noreferrer">Terms</a><a className="underline" href={offer.privacy_url} target="_blank" rel="noopener noreferrer">Privacy</a><a className="underline" href={offer.support_url} target="_blank" rel="noopener noreferrer">Support</a></p>
        {!entitlement?.active&&body?.billing?.order_state!=="Open"&&body?.billing?.order_state!=="Fulfilled"?<button className="mt-4 border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={submitting} type="button" onClick={()=>void checkout(offer.revision_id)}>Start test checkout</button>:null}
      </article>)}</div>
      {message?<p className="mt-3" role="status">{message}</p>:null}
    </section>:null}
  </>;
}
