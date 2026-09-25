// Prueba únicamente un proceso Ledger conectado a una base desechable.
import { createHmac, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const base = process.env.TOBOT_LEDGER_TEST_URL;
if (base !== "http://tobot-ledger-s6-test:18085") {
  throw new Error("Refusing to run outside the disposable S6 ledger process");
}
const token = process.env.TOBOT_LEDGER_SERVICE_TOKEN;
const key = process.env.TOBOT_LEDGER_RECEIPT_KEY;
if (!token || !key) throw new Error("Missing Ledger test credentials");

async function request(method, path, body) {
  const bytes = body === undefined ? "" : JSON.stringify(body);
  const expires = Math.floor(Date.now() / 1000) + 30;
  const signature = createHmac("sha256", key)
    .update(`${method}\n${path}\n${expires}\n${bytes}`)
    .digest("hex");
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "x-ledger-expires": String(expires),
      "x-ledger-signature": signature,
      "content-type": "application/json",
    },
    body: method === "POST" ? bytes : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

function command(name, tenant, idempotencyKey, payload) {
  const correlation = randomUUID();
  return {
    command_id: randomUUID(), schema_name: name, schema_version: 1,
    schema_family: "VirtualPayment", actor_account_id: randomUUID(), tenant_id: tenant,
    idempotency_key: idempotencyKey, deadline_at: new Date(Date.now() + 30000).toISOString(),
    correlation_id: correlation, trace_context: { trace_id: correlation, span_id: randomUUID() }, payload,
  };
}

function assert(ok, message) { if (!ok) throw new Error(message); }

if (process.env.TOBOT_LEDGER_REPLAY_ONLY==="true") {
  const file=process.env.TOBOT_LEDGER_REPLAY_FILE;
  assert(file,"Replay file is required");
  const saved=JSON.parse(await readFile(file,"utf8"));
  const replay=await request("POST","/internal/v1/ledger/command",saved.command);
  const wallet=await request("GET",`/internal/v1/ledger/wallet/${saved.tenant}/${saved.member}`);
  assert(replay.status===200 && replay.body.transaction_id===saved.transaction,
    "Post-restart replay minted another transaction");
  assert(wallet.status===200 && wallet.body.current===110,"Post-restart wallet changed");
  console.log(JSON.stringify({tenant:saved.tenant,replayedTransaction:saved.transaction,wallet:wallet.body.current}));
  process.exit(0);
}

if (process.env.TOBOT_LEDGER_VERIFY_TENANT) {
  const tenantToCheck=process.env.TOBOT_LEDGER_VERIFY_TENANT;
  const expectedHealthy=process.env.TOBOT_LEDGER_EXPECT_HEALTHY==="true";
  const check=await request("POST",`/internal/v1/ledger/reconcile/${tenantToCheck}`);
  const circuit=await request("GET",`/internal/v1/ledger/policy/${tenantToCheck}`);
  assert(check.status===(expectedHealthy?204:409),`Unexpected reconciliation status: ${check.status}`);
  assert(circuit.status===200 && circuit.body.write_ready===expectedHealthy,
    `Ledger write circuit disagrees with reconciliation: ${JSON.stringify(circuit)}`);
  console.log(JSON.stringify({tenant:tenantToCheck,healthy:expectedHealthy,writeReady:circuit.body.write_ready}));
  process.exit(0);
}

const tenant = randomUUID();
const member = "433113401481363457";
const guild = "1507221859610001440";
const publicRead = await fetch(`${base}/internal/v1/ledger/wallet/${tenant}/${member}`);
assert(publicRead.status === 401, "Unsigned Ledger wallet read was accepted");
const policy = await request("POST", "/internal/v1/ledger/command", command("PublishCurrencyPolicy", tenant, randomUUID(), {
  guild_id: guild, starting_grant: 100, wallet_ceiling: 1000, issuance_ceiling: 10000,
}));
assert(policy.status === 200, `Policy publish failed: ${policy.status} ${JSON.stringify(policy.body)}`);
const beforeWallet = await request("GET", `/internal/v1/ledger/wallet/${tenant}/${member}`);
assert(beforeWallet.status === 404, "Wallet GET created an account");
const walletCommand = command("EnsureMemberWallet", tenant, randomUUID(), { member_id: member });
const firstUse = await Promise.all([walletCommand,
  ...Array.from({length:5},()=>command("EnsureMemberWallet",tenant,randomUUID(),{member_id:member}))]
  .map((value)=>request("POST","/internal/v1/ledger/command",value)));
assert(firstUse.every((value)=>value.status===200 && value.body.current===100),
  `Concurrent first-use failed: ${JSON.stringify(firstUse)}`);
const repeatedWallet = await request("POST", "/internal/v1/ledger/command", walletCommand);
assert(repeatedWallet.status === 200 && repeatedWallet.body.current === 100, "First-use grant repeated");
const revised = await request("POST","/internal/v1/ledger/command",command("PublishCurrencyPolicy",tenant,randomUUID(),{
  guild_id:guild,starting_grant:200,wallet_ceiling:1000,issuance_ceiling:10000,
}));
assert(revised.status===200 && revised.body.revision===2,"Currency revision was not published");
const afterRevision = await request("POST","/internal/v1/ledger/command",
  command("EnsureMemberWallet",tenant,randomUUID(),{member_id:member}));
assert(afterRevision.status===200 && afterRevision.body.current===100,"Policy revision changed the first grant");
const action = randomUUID();
const settlement = command("SettleIncomeAction", tenant, action, {
  member_id: member, income_action_id: action, policy_revision_id: randomUUID(), interaction_id: "1552504272128839782", amount: 10,
});
const posted = await request("POST", "/internal/v1/ledger/command", settlement);
assert(posted.status === 200 && posted.body.balance_after === 110, `Daily posting failed: ${JSON.stringify(posted)}`);
const replay = await request("POST", "/internal/v1/ledger/command", settlement);
assert(replay.status === 200 && replay.body.transaction_id === posted.body.transaction_id, "Daily replay created another transaction");
const conflict = structuredClone(settlement);
conflict.payload.amount = 11;
const different = await request("POST", "/internal/v1/ledger/command", conflict);
assert(different.status === 409, `Conflicting request was not rejected: ${different.status}`);
const excessive = await request("POST","/internal/v1/ledger/command",command("SettleIncomeAction",tenant,randomUUID(),{
  member_id:member,income_action_id:randomUUID(),policy_revision_id:randomUUID(),interaction_id:"1552504272128839783",amount:2000,
}));
assert(excessive.status===422,"Wallet ceiling did not reject an excessive credit");
const read = await request("GET", `/internal/v1/ledger/wallet/${tenant}/${member}`);
assert(read.status === 200 && read.body.current === 110, "Authoritative wallet is not 110");
assert(read.body.recent_postings?.length === 2 && read.body.recent_postings[0].kind === "DailyIncome",
  "Recent committed postings are missing or out of order");
const reconcile = await request("POST", `/internal/v1/ledger/reconcile/${tenant}`);
assert(reconcile.status === 204, `Reconciliation failed: ${reconcile.status}`);
if (process.env.TOBOT_LEDGER_REPLAY_FILE) {
  await writeFile(process.env.TOBOT_LEDGER_REPLAY_FILE,JSON.stringify({tenant,member,command:settlement,transaction:posted.body.transaction_id}));
}
console.log(JSON.stringify({ tenant, wallet: read.body.current, grantAndDaily: 2, journalSequence: read.body.journal_sequence, reconciliation: "healthy" }));
