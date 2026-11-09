import { useEffect, useState } from "react";
import { readSessionAccount } from "../lib/session-client";

export function AccountName() {
  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readSessionAccount().then((result) => {
      if (cancelled || result.kind !== "ready") return;
      setName(result.name);
      setAvatarUrl(result.avatarUrl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!name && !avatarUrl) return null;
  return (
    <span className="flex items-center gap-2">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" width={32} height={32} className="h-8 w-8" />
      ) : null}
      {name ? <span className="text-sm text-zinc-700">{name}</span> : null}
    </span>
  );
}
