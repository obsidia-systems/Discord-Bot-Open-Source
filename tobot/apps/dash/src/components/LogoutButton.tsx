import { useState } from "react";
import { logoutSession } from "../lib/session-client";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onLogout() {
    setPending(true);
    setFailed(false);
    const outcome = await logoutSession();
    if (outcome === "done" || outcome === "unauthenticated") {
      window.location.assign("/auth/login");
      return;
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <span className="flex items-center gap-3">
      <button
        className="border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:cursor-wait disabled:opacity-60"
        type="button"
        onClick={() => void onLogout()}
        disabled={pending}
      >
        Log out
      </button>
      {failed ? (
        <p className="text-sm" role="alert">
          Log out failed. Try again.
        </p>
      ) : null}
    </span>
  );
}
