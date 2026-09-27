import { useEffect, useState } from "react";
import { callOps } from "../../gateway";

type Client = any;
type Location = { id: string; code: string };
type Take = {
  id: string;
  location_id: string;
  status: string;
  ops_locations: { code: string } | null;
};
type Row = {
  itemId: string;
  code: string;
  classification: string;
  currentVersion: number;
};
type Comparison = { stocktakeId: string; rows: Row[] };

export function Stocktake({
  client,
  workspaceId,
  role,
}: {
  client: Client;
  workspaceId: string;
  role: string;
}) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [takes, setTakes] = useState<Take[]>([]);
  const [locationId, setLocationId] = useState("");
  const [takeId, setTakeId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function load(id?: string) {
    const auth = await token();
    const [places, records] = await Promise.all([
      callOps<Location[]>(fetch, auth, {
        kind: "query",
        name: "location.list",
        workspaceId,
        payload: {},
      }),
      callOps<Take[]>(fetch, auth, {
        kind: "query",
        name: "stocktake.list",
        workspaceId,
        payload: {},
      }),
    ]);
    setLocations(places);
    setTakes(records);
    const selected = id ?? takeId;
    if (selected)
      setComparison(
        await callOps<Comparison>(fetch, auth, {
          kind: "query",
          name: "stocktake.compare",
          workspaceId,
          payload: { stocktakeId: selected },
        }),
      );
  }
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load counts",
      ),
    );
  }, [workspaceId]);
  async function command(
    name: string,
    payload: Record<string, unknown>,
    expectedVersion: number | null = null,
  ) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await callOps<any>(fetch, await token(), {
        kind: "command",
        name,
        workspaceId,
        payload,
        meta: { idempotencyKey: crypto.randomUUID(), expectedVersion },
      });
      await load(name === "stocktake.start" ? result.stocktakeId : undefined);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Count action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-stocktake">
      <p>
        Count one location at a time. Items moved after the snapshot need review
        before any stock adjustment.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        <h2>Start location count</h2>
        <label>
          Location{" "}
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Choose location</option>
            {locations.map((place) => (
              <option value={place.id} key={place.id}>
                {place.code}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !locationId}
          onClick={async () => {
            const result = await command("stocktake.start", { locationId });
            if (result) {
              setTakeId(result.stocktakeId);
              setNotice(
                `Snapshot saved with ${result.expectedCount} expected items.`,
              );
            }
          }}
        >
          Start count
        </button>
      </section>
      <section>
        <h2>Count queue</h2>
        <label>
          Open count{" "}
          <select
            value={takeId}
            onChange={(event) => {
              setTakeId(event.target.value);
              void load(event.target.value);
            }}
          >
            <option value="">Choose count</option>
            {takes
              .filter((take) => take.status === "open")
              .map((take) => (
                <option key={take.id} value={take.id}>
                  {take.ops_locations?.code ?? take.location_id} (
                  {take.id.slice(0, 8)})
                </option>
              ))}
          </select>
        </label>
        {takeId && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                await command("stocktake.observe", {
                  stocktakeId: takeId,
                  itemCode: code,
                })
              ) {
                setCode("");
                setNotice("Item observation saved.");
              }
            }}
          >
            <label>
              Scan item code{" "}
              <input
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button disabled={busy}>Record scan</button>
          </form>
        )}
      </section>
      {comparison && (
        <section>
          <h2>Compare snapshot</h2>
          <ul>
            {comparison.rows.map((row) => (
              <li key={row.itemId}>
                <strong>{row.code}</strong>: {row.classification}
                {["missing", "unexpected"].includes(row.classification) &&
                  ["owner", "manager"].includes(role) && (
                    <div>
                      <label>
                        Resolution note{" "}
                        <input
                          value={notes[row.itemId] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [row.itemId]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      {row.classification === "missing" && (
                        <button
                          disabled={busy || !notes[row.itemId]?.trim()}
                          onClick={async () => {
                            if (
                              await command(
                                "stocktake.resolve",
                                {
                                  stocktakeId: takeId,
                                  itemId: row.itemId,
                                  decision: "accept_missing",
                                  note: notes[row.itemId],
                                },
                                row.currentVersion,
                              )
                            )
                              setNotice(
                                "Missing stock recorded with an audit event.",
                              );
                          }}
                        >
                          Mark missing
                        </button>
                      )}
                      {row.classification === "missing" && (
                        <button
                          disabled={busy || !notes[row.itemId]?.trim()}
                          onClick={async () => {
                            if (
                              await command(
                                "stocktake.resolve",
                                {
                                  stocktakeId: takeId,
                                  itemId: row.itemId,
                                  decision: "write_off",
                                  note: notes[row.itemId],
                                },
                                row.currentVersion,
                              )
                            )
                              setNotice(
                                "Write-off recorded with an audit event.",
                              );
                          }}
                        >
                          Write off
                        </button>
                      )}
                      {row.classification === "unexpected" && (
                        <button
                          disabled={busy || !notes[row.itemId]?.trim()}
                          onClick={async () => {
                            if (
                              await command(
                                "stocktake.resolve",
                                {
                                  stocktakeId: takeId,
                                  itemId: row.itemId,
                                  decision: "accept_unexpected",
                                  note: notes[row.itemId],
                                },
                                row.currentVersion,
                              )
                            )
                              setNotice("Unexpected item acknowledged.");
                          }}
                        >
                          Acknowledge item
                        </button>
                      )}
                    </div>
                  )}
              </li>
            ))}
          </ul>
          {["owner", "manager"].includes(role) && (
            <button
              disabled={busy || comparison.rows.some((row) => row.classification === "missing")}
              onClick={async () => {
                if (await command("stocktake.close", { stocktakeId: takeId })) {
                  setTakeId("");
                  setComparison(null);
                  setNotice("Count closed with its observations and resolutions saved.");
                }
              }}
            >
              Close count
            </button>
          )}
        </section>
      )}
    </div>
  );
}
