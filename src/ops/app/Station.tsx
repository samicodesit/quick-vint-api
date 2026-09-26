import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { callOps } from "./gateway";
import { PrintLabel, Scanner } from "./Scanner";
import { locationLookupCode } from "../../../utils/ops/inventory/labels";

type Location = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  version: number;
};
type Resolution = {
  kind: string;
  items: Array<{ itemId: string; displaySku: string }>;
  locations: Array<{ locationId: string; code: string }>;
};

export function Station({
  client,
  workspaceId,
  role,
}: {
  client: SupabaseClient;
  workspaceId: string;
  role: string;
}) {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [destination, setDestination] = useState(
    new URLSearchParams(location.search).get("locationId") ?? "",
  );
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const keys = useRef(new Map<string, string>());
  const createKey = useRef<{ fingerprint: string; key: string } | null>(null);
  async function call<T>(
    kind: "query" | "command",
    operation: string,
    payload: object,
    version: number | null = null,
    key?: string,
  ) {
    const {
      data: { session },
    } = await client.auth.getSession();
    return callOps<T>(fetch, session?.access_token ?? "", {
      kind,
      name: operation,
      workspaceId,
      payload,
      ...(kind === "command"
        ? {
            meta: {
              idempotencyKey: key ?? crypto.randomUUID(),
              expectedVersion: version,
            },
          }
        : {}),
    });
  }
  useEffect(() => {
    let active = true;
    void call<Location[]>("query", "location.list", {})
      .then((rows) => {
        if (active) setLocations(rows);
      })
      .catch((cause) => {
        if (active)
          setMessage(
            cause instanceof Error ? cause.message : "Locations could not load",
          );
      });
    return () => {
      active = false;
    };
  }, [client, workspaceId]);
  const selected = locations?.find((entry) => entry.id === destination);

  async function createLocation(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const fingerprint = JSON.stringify({ code, name, parentId });
      if (createKey.current?.fingerprint !== fingerprint)
        createKey.current = { fingerprint, key: crypto.randomUUID() };
      const result = await call<{ locationId: string }>(
        "command",
        "location.create",
        { code, name, ...(parentId ? { parentId } : {}) },
        null,
        createKey.current.key,
      );
      createKey.current = null;
      const rows = await call<Location[]>("query", "location.list", {});
      setLocations(rows);
      setDestination(result.locationId);
      setCode("");
      setName("");
      setParentId("");
      history.replaceState(
        null,
        "",
        `/app/inventory/put-away?locationId=${encodeURIComponent(result.locationId)}`,
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Location could not be saved",
      );
    } finally {
      setBusy(false);
    }
  }

  async function putAway(scannedCode: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const resolved = await call<Resolution>("query", "scan.resolve", {
        code: scannedCode,
      });
      if (resolved.kind === "location") {
        const locationId = resolved.locations[0].locationId;
        setDestination(locationId);
        history.replaceState(
          null,
          "",
          `/app/inventory/put-away?locationId=${encodeURIComponent(locationId)}`,
        );
        setMessage(
          `Destination set to ${resolved.locations[0].code}. Scan an item next.`,
        );
        return;
      }
      if (resolved.kind !== "item")
        throw new Error(
          resolved.kind === "ambiguous"
            ? "This code matches more than one item. Use its physical SKU or QR label."
            : "Code not found.",
        );
      if (!destination)
        throw new Error("Choose or scan a destination before moving an item.");
      const itemId = resolved.items[0].itemId;
      const detail = await call<{
        version: number;
        custody: string;
        location_id: string | null;
      }>("query", "item.detail", { itemId });
      if (detail.custody !== "on_hand")
        throw new Error(
          "This item is not on hand. Review its custody state before moving it.",
        );
      const fingerprint = `${itemId}:${destination}:${detail.version}`;
      if (!keys.current.has(fingerprint))
        keys.current.set(fingerprint, crypto.randomUUID());
      await call(
        "command",
        "item.move",
        { itemId, locationId: destination },
        detail.version,
        keys.current.get(fingerprint),
      );
      keys.current.delete(fingerprint);
      setMessage(
        `${resolved.items[0].displaySku} is in ${selected?.code ?? "the selected location"}. Scan the next item.`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Put-away failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ops-inventory">
      <p>
        <a href="/app/inventory">Inventory</a> / Put away
      </p>
      <h2>Put away: {selected?.code ?? "Choose a location"}</h2>
      <p>
        {selected?.name ??
          "The destination stays selected while you scan several items."}
      </p>
      <label>
        Destination location
        <select
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
            history.replaceState(
              null,
              "",
              event.target.value
                ? `/app/inventory/put-away?locationId=${encodeURIComponent(event.target.value)}`
                : "/app/inventory/put-away",
            );
          }}
        >
          <option value="">Choose a location</option>
          {locations?.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.code} {entry.name}
            </option>
          ))}
        </select>
      </label>
      <Scanner
        onCode={(value) => {
          void putAway(value);
        }}
        disabled={busy}
      />
      {message && <p role="status">{message}</p>}
      {selected && (
        <PrintLabel
          code={locationLookupCode(selected.id)}
          label={selected.code}
        />
      )}
      {(role === "owner" || role === "manager" || role === "warehouse") && (
        <form onSubmit={createLocation}>
          <h3>Add a location</h3>
          <label>
            Code
            <input
              required
              maxLength={80}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <label>
            Name
            <input
              required
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Parent (optional)
            <select
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Root location</option>
              {locations?.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} {entry.name}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy}>Create location</button>
        </form>
      )}
    </section>
  );
}
