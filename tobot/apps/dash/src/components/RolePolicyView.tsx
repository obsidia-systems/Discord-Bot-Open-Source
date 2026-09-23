import { type FormEvent, useEffect, useState } from "react";
import {
  type RoleBody,
  type RoleChoice,
  publishAutomaticRole,
  readAutomaticRole,
  readAutomaticRoleStatus,
} from "../lib/session-client";

type State =
  | { kind: "loading" }
  | { kind: "ready"; body: RoleBody; roles: RoleChoice[] }
  | { kind: "no-access" }
  | { kind: "unavailable" };

export function RolePolicyView({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [roleId, setRoleId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      const result = await readAutomaticRole(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setState(result);
      if (result.kind === "ready") {
        timer = window.setTimeout(() => void pollStatus(), 5_000);
      }
    }
    async function pollStatus() {
      const result = await readAutomaticRoleStatus(tenantId);
      if (cancelled) return;
      if (result.kind === "unauthenticated") {
        window.location.assign("/auth/login");
        return;
      }
      setState((current) =>
        current.kind === "ready" && result.kind === "ready"
          ? { ...current, body: result.body }
          : current,
      );
      timer = window.setTimeout(() => void pollStatus(), 5_000);
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [tenantId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const result = await publishAutomaticRole(tenantId, roleId);
    if (result === "unauthenticated") {
      window.location.assign("/auth/login");
      return;
    }
    if (result === "done") {
      setMessage("The automatic role was published.");
      const refreshed = await readAutomaticRole(tenantId);
      if (refreshed.kind === "ready") setState(refreshed);
      return;
    }
    setMessage("The automatic role could not be published.");
  }

  if (state.kind === "loading") return <p>Loading automatic role settings.</p>;
  if (state.kind === "no-access") return <p role="alert">No access to this server.</p>;
  if (state.kind === "unavailable") return <p role="alert">Automatic role settings are unavailable.</p>;
  const published = state.body.role_id;
  const last = state.body.last_assignment;
  return (
    <>
      <h1 className="font-serif text-3xl text-zinc-950">Automatic role</h1>
      <p className="mt-3 text-zinc-700">One role is added when a member joins. This page does not add the role.</p>
      {published ? (
        <section className="mt-8 border-t border-zinc-200 pt-5" aria-label="Published automatic role">
          <p>Published role {published}</p>
          {last ? <p className="mt-2">Latest assignment: {last.status} for member {last.member_id}.</p> : <p className="mt-2">No assignment yet.</p>}
        </section>
      ) : <p className="mt-8">No automatic role is published yet.</p>}
      <form className="mt-8 space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <div>
          <label className="block text-sm font-medium" htmlFor="automatic-role">Role</label>
          <select id="automatic-role" required value={roleId} onChange={(event) => setRoleId(event.target.value)}
            className="mt-1 w-full border border-zinc-300 bg-white px-3 py-2">
            <option value="">Select a role</option>
            {state.roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
        <button className="border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm text-white" type="submit">Publish role</button>
      </form>
      {message ? <p className="mt-4" role="status">{message}</p> : null}
    </>
  );
}
