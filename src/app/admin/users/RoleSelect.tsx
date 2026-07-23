"use client";

import { useTransition, useState } from "react";
import { setUserRole } from "./actions";

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useState(role);
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          start(async () => {
            const r = await setUserRole(userId, next);
            if (r?.error) {
              setErr(r.error);
              setValue(role);
            } else setErr(null);
          });
        }}
        className="rounded-[8px] border border-line bg-bg px-2 py-1 text-sm"
      >
        <option value="user">user</option>
        <option value="reviewer">reviewer</option>
        <option value="admin">admin</option>
      </select>
      {err && <span className="text-[11px] text-crit">{err}</span>}
    </span>
  );
}
