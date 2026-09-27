import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ontology } from "../../../contracts/extraction";
import type { ConfirmedFacts } from "../../../contracts/listings";
import { renderListing } from "../../../../../utils/ops/listings/render";
import { callOps } from "../../gateway";
import {
  browserExtensionTransport,
  prepareWithExtension,
  type HandoffPacket,
} from "./bridge";

const emptyFacts: ConfirmedFacts = {
  brand: null,
  model: null,
  category: null,
  size: null,
  colour: null,
  material: null,
  condition: null,
  measurements: [],
  defects: [],
};
type ReviewData = {
  item: { id: string; display_sku: string; capture_revision: number } | null;
  facts: { revision: number; values: ConfirmedFacts } | null;
  listing: {
    id: string;
    status: string;
    version: number;
    current_revision_id: string | null;
    approved_revision_id: string | null;
  } | null;
  media: { id: string; position: number; url: string | null }[];
  analysis: { id: string; status: string; omitted_count: number }[];
  proposals: {
    id: string;
    field_name: string;
    value_text: string | null;
    reason: string;
    label_text: string | null;
    ops_analysis_evidence: { asset_id: string }[];
  }[];
  revisions: {
    id: string;
    title: string;
    description: string;
    price_minor: number;
    currency: string;
    human_description_override: string | null;
    approved_at: string | null;
  }[];
};

function useOps(client: SupabaseClient, workspaceId: string) {
  const pending = useRef<{ name: string; key: string } | null>(null);
  return async <T,>(
    kind: "query" | "command",
    name: string,
    payload: object,
  ): Promise<T> => {
    const {
      data: { session },
    } = await client.auth.getSession();
    const key =
      kind === "command"
        ? pending.current?.name === name
          ? pending.current.key
          : crypto.randomUUID()
        : undefined;
    if (key) pending.current = { name, key };
    const result = await callOps<T>(fetch, session?.access_token ?? "", {
      kind,
      name,
      workspaceId,
      payload,
      ...(key ? { meta: { idempotencyKey: key, expectedVersion: null } } : {}),
    });
    if (key) pending.current = null;
    return result;
  };
}

export function ReviewListing({
  client,
  workspaceId,
  itemId,
  extensionId,
}: {
  client: SupabaseClient;
  workspaceId: string;
  itemId: string;
  extensionId?: string;
}) {
  const request = useOps(client, workspaceId);
  const [data, setData] = useState<ReviewData | null>(null);
  const [facts, setFacts] = useState<ConfirmedFacts>(emptyFacts);
  const [locale, setLocale] = useState<
    "en" | "nl" | "fr" | "de" | "pl" | "es" | "it"
  >("nl");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [override, setOverride] = useState("");
  const [measurements, setMeasurements] = useState("");
  const [defects, setDefects] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [packet, setPacket] = useState<HandoffPacket | null>(null);
  const [handoffState, setHandoffState] = useState<
    "prepared" | "filled" | null
  >(null);

  async function refresh(reset = false) {
    const detail = await request<ReviewData>("query", "listing.detail", {
      itemId,
    });
    setData(detail);
    if (reset) {
      setFacts({ ...emptyFacts, ...(detail.facts?.values ?? {}) });
      setMeasurements(
        (detail.facts?.values.measurements ?? [])
          .map((m) => `${m.label}: ${m.value} ${m.unit}`)
          .join("\n"),
      );
      setDefects((detail.facts?.values.defects ?? []).join("\n"));
      const latest = detail.revisions[0];
      if (latest) {
        setPrice((latest.price_minor / 100).toFixed(2));
        setCurrency(latest.currency);
        setOverride(latest.human_description_override ?? "");
      }
    }
  }
  useEffect(() => {
    void refresh(true).catch((cause) =>
      setMessage(
        cause instanceof Error ? cause.message : "Review could not load",
      ),
    );
  }, [itemId, workspaceId]);

  const preview = useMemo(
    () => renderListing(facts, { locale }, override.trim() || null),
    [facts, locale, override],
  );
  function parseMeasurements() {
    return measurements
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = /^(.+?):\s*(\d+(?:\.\d+)?)\s*(cm|in)$/.exec(line.trim());
        if (!match)
          throw new Error(
            "Use one measurement per line, for example waist: 76 cm",
          );
        return {
          label: match[1].trim(),
          value: Number(match[2]),
          unit: match[3] as "cm" | "in",
        };
      });
  }
  async function act(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh(true);
      setMessage(label);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  function update(field: keyof ConfirmedFacts, value: string | null) {
    setFacts((current) => ({ ...current, [field]: value }));
  }
  async function prepareHandoff() {
    if (!data?.listing?.approved_revision_id || !latest) return;
    setBusy(true);
    setMessage("");
    try {
      const ids = { itemId, listingId: data.listing.id, revisionId: latest.id };
      const approved = await request<HandoffPacket>(
        "query",
        "handoff.packet",
        ids,
      );
      setPacket(approved);
      const requestId = crypto.randomUUID();
      let state: "prepared" | "filled" = "prepared";
      let reason =
        "Manual packet is ready. Review and publish in Vinted yourself.";
      let channel: "manual" | "extension" = "manual";
      const transport = browserExtensionTransport(undefined, extensionId);
      if (transport) {
        try {
          const { data: auth } = await client.auth.getUser();
          if (!auth.user) throw new Error("Sign in again before handoff.");
          const result = await prepareWithExtension(
            transport,
            approved,
            auth.user.id,
            requestId,
          );
          state = result.state;
          reason =
            result.reason ??
            (state === "filled"
              ? "The Vinted form was filled. Review it and publish yourself."
              : "Manual packet is ready.");
          if (state === "filled") channel = "extension";
        } catch (cause) {
          reason =
            cause instanceof Error
              ? cause.message
              : "Extension unavailable. Use manual handoff.";
        }
      }
      await request("command", "handoff.ack", {
        ...ids,
        requestId,
        state,
        channel,
      });
      setHandoffState(state);
      setMessage(reason);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Handoff unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <p role="status">Loading item review... {message}</p>;
  if (!data.item) return <p role="alert">Item not found in this workspace.</p>;
  const latest = data.revisions[0];
  return (
    <section className="ops-review">
      <p>
        <a href={`/app/inventory/item?itemId=${encodeURIComponent(itemId)}`}>
          Back to {data.item.display_sku}
        </a>
      </p>
      <p role="status">{message}</p>
      <p>
        Confirmed facts, revision {data.facts?.revision ?? 0}. Listing:{" "}
        {data.listing?.status ?? "not started"}.
      </p>
      <div className="ops-review-grid">
        <section>
          <h2>Evidence</h2>
          {data.media.length === 0 ? (
            <p>No verified photos yet. Add photos before approval.</p>
          ) : (
            <div className="ops-review-images">
              {data.media.map((asset) => (
                <figure key={asset.id}>
                  {asset.url ? (
                    <img
                      src={asset.url}
                      alt={`Item evidence ${asset.position + 1}`}
                    />
                  ) : (
                    <span>Photo unavailable</span>
                  )}
                  <figcaption>Photo {asset.position + 1}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <button
            disabled={busy || !data.item.capture_revision}
            onClick={() =>
              void act(
                "Analysis requested. Review every suggestion before confirming.",
                async () => {
                  const result = await request<{
                    status: string;
                    reason?: string;
                  }>("command", "analysis.request", {
                    itemId,
                    captureRevision: data.item!.capture_revision,
                    mode: "initial",
                  });
                  if (result.status === "manual")
                    throw new Error(result.reason ?? "Enter facts manually.");
                },
              )
            }
          >
            Request photo suggestions
          </button>
          {data.analysis[0] && (
            <p>
              Latest analysis: {data.analysis[0].status}.{" "}
              {data.analysis[0].omitted_count > 0 &&
                `${data.analysis[0].omitted_count} photos were not sent.`}
            </p>
          )}
          <h3>Suggestions, unconfirmed</h3>
          {data.proposals.length === 0 ? (
            <p>Enter facts manually or wait for analysis.</p>
          ) : (
            <ul>
              {data.proposals.map((proposal) => (
                <li key={proposal.id}>
                  {proposal.field_name}:{" "}
                  {proposal.value_text ?? proposal.reason}
                  {proposal.label_text && (
                    <small> Label reads: {proposal.label_text}</small>
                  )}
                  {proposal.ops_analysis_evidence?.length > 0 && (
                    <small>
                      {" "}
                      Evidence:{" "}
                      {proposal.ops_analysis_evidence
                        .map(
                          (e) =>
                            data.media.find((m) => m.id === e.asset_id)
                              ?.position ?? "?",
                        )
                        .join(", ")}
                    </small>
                  )}
                  {proposal.value_text &&
                    [
                      "brand",
                      "model",
                      "category",
                      "size",
                      "colour",
                      "material",
                      "condition",
                    ].includes(proposal.field_name) && (
                      <button
                        type="button"
                        onClick={() =>
                          update(
                            proposal.field_name as keyof ConfirmedFacts,
                            proposal.value_text,
                          )
                        }
                      >
                        Use suggestion in form
                      </button>
                    )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2>Confirm item facts</h2>
          <p>
            Check the garment and photos. Suggestions are never approved
            automatically.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act("Facts confirmed.", () =>
                request("command", "facts.confirm", {
                  itemId,
                  factRevision: data.facts?.revision ?? 0,
                  values: {
                    ...facts,
                    measurements: parseMeasurements(),
                    defects: defects
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                }),
              );
            }}
          >
            {(["brand", "model", "size", "colour", "material"] as const).map(
              (field) => (
                <label key={field}>
                  {field}
                  <input
                    value={facts[field] ?? ""}
                    onChange={(event) =>
                      update(field, event.target.value.trim() || null)
                    }
                  />
                </label>
              ),
            )}
            <label>
              Category
              <select
                value={facts.category ?? ""}
                onChange={(event) =>
                  update("category", event.target.value || null)
                }
              >
                <option value="">Not confirmed</option>
                {ontology.category.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select
                value={facts.condition ?? ""}
                onChange={(event) =>
                  update("condition", event.target.value || null)
                }
              >
                <option value="">Not confirmed</option>
                {ontology.condition.map((value) => (
                  <option key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Measurements, one per line
              <textarea
                value={measurements}
                onChange={(event) => setMeasurements(event.target.value)}
                placeholder="waist: 76 cm"
              />
            </label>
            <label>
              Defects, one per line
              <textarea
                value={defects}
                onChange={(event) => setDefects(event.target.value)}
              />
            </label>
            <button disabled={busy}>Confirm facts</button>
          </form>
        </section>
        <section>
          <h2>Prepare listing</h2>
          <label>
            Locale
            <select
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as typeof locale)
              }
            >
              {["en", "nl", "fr", "de", "pl", "es", "it"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Price
            <input
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              maxLength={3}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            Human description override
            <textarea
              value={override}
              onChange={(event) => setOverride(event.target.value)}
              placeholder="Leave blank to use the template"
            />
          </label>
          <h3>Preview</h3>
          <p>{preview.title || "Confirm facts for a title."}</p>
          <pre>{preview.description || "Confirm facts for a description."}</pre>
          <button
            disabled={busy || !data.facts}
            onClick={() =>
              void act(
                "Draft saved. Review the exact revision before approval.",
                async () => {
                  if (!/^\d+(?:\.\d{1,2})?$/.test(price))
                    throw new Error(
                      "Enter a valid price with up to two decimals",
                    );
                  const minor = Math.round(Number(price) * 100);
                  await request("command", "listing.save", {
                    itemId,
                    locale,
                    priceMinor: minor,
                    currency,
                    humanDescriptionOverride: override.trim() || null,
                    expectedFactRevision: data.facts!.revision,
                    expectedListingVersion: data.listing?.version ?? 0,
                  });
                },
              )
            }
          >
            Save draft
          </button>
          {latest && (
            <section>
              <h3>Saved revision</h3>
              <p>{latest.title}</p>
              <pre>{latest.description}</pre>
              <p>
                {latest.price_minor / 100} {latest.currency}
              </p>
              <button
                disabled={
                  busy ||
                  data.listing?.current_revision_id !== latest.id ||
                  data.listing?.approved_revision_id === latest.id
                }
                onClick={() =>
                  void act("Listing approved for handoff.", () =>
                    request("command", "listing.approve", {
                      listingId: data.listing!.id,
                      revisionId: latest.id,
                      expectedListingVersion: data.listing!.version,
                    }),
                  )
                }
              >
                Approve this revision
              </button>
            </section>
          )}
        </section>
      </div>
      {data.listing?.status === "ready" &&
        data.listing.approved_revision_id === latest?.id && (
          <section>
            <h2>Manual or assisted handoff</h2>
            <p>
              A prepared packet or filled form is not a live listing. Publish in
              Vinted yourself and verify it there.
            </p>
            <button disabled={busy} onClick={() => void prepareHandoff()}>
              Prepare handoff
            </button>
            {packet && (
              <div>
                <p>
                  Handoff state: {handoffState ?? "prepared"}. Marketplace
                  status: unverified.
                </p>
                <p>Reference: {packet.reference}</p>
                <label>
                  Title
                  <input readOnly value={packet.title} />
                </label>
                <label>
                  Description
                  <textarea readOnly value={packet.description} />
                </label>
                <p>
                  Price: {packet.price.minor / 100} {packet.price.currency}
                </p>
                <ul>
                  {packet.photos.map((photo, index) => (
                    <li key={photo.assetId}>
                      <a
                        href={photo.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download approved photo {index + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
    </section>
  );
}

export function ListingQueue({
  client,
  workspaceId,
}: {
  client: SupabaseClient;
  workspaceId: string;
}) {
  const request = useOps(client, workspaceId);
  const [rows, setRows] = useState<
    {
      id: string;
      item_id: string;
      status: string;
      ops_items: { display_sku: string } | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void request<typeof rows>("query", "listing.queue", {})
      .then(setRows)
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Queue unavailable"),
      );
  }, [workspaceId]);
  return (
    <section>
      <h2>Listing queue</h2>
      <p role="alert">{error}</p>
      {rows.length === 0 ? (
        <p>
          No drafts or ready listings yet. Open an inventory item to review it.
        </p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <a
                href={`/app/listings/review?itemId=${encodeURIComponent(row.item_id)}`}
              >
                {row.ops_items?.display_sku ?? row.item_id}
              </a>{" "}
              · {row.status}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TemplateSettings({
  client,
  workspaceId,
}: {
  client: SupabaseClient;
  workspaceId: string;
}) {
  const request = useOps(client, workspaceId);
  const [locale, setLocale] = useState<
    "en" | "nl" | "fr" | "de" | "pl" | "es" | "it"
  >("nl");
  const [rows, setRows] = useState<
    { locale: string; prefix: string; suffix: string; version: number }[]
  >([]);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void request<typeof rows>("query", "template.list", {})
      .then(setRows)
      .catch((cause) =>
        setMessage(
          cause instanceof Error ? cause.message : "Templates unavailable",
        ),
      );
  }, [workspaceId]);
  useEffect(() => {
    const current = rows.find((row) => row.locale === locale);
    setPrefix(current?.prefix ?? "");
    setSuffix(current?.suffix ?? "");
  }, [rows, locale]);
  return (
    <section>
      <h2>Listing template settings</h2>
      <p role="status">{message}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void request<{ version: number }>("command", "template.save", {
            locale,
            prefix,
            suffix,
            expectedVersion:
              rows.find((row) => row.locale === locale)?.version ?? 0,
          })
            .then((saved) => {
              setRows((current) => [
                ...current.filter((row) => row.locale !== locale),
                { locale, prefix, suffix, version: saved.version },
              ]);
              setMessage(
                "Template saved. Existing listing revisions stay unchanged.",
              );
            })
            .catch((cause) =>
              setMessage(
                cause instanceof Error
                  ? cause.message
                  : "Template could not be saved",
              ),
            );
        }}
      >
        <label>
          Locale
          <select
            value={locale}
            onChange={(event) => setLocale(event.target.value as typeof locale)}
          >
            {["en", "nl", "fr", "de", "pl", "es", "it"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Opening text
          <textarea
            maxLength={1000}
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
          />
        </label>
        <label>
          Closing text
          <textarea
            maxLength={1000}
            value={suffix}
            onChange={(event) => setSuffix(event.target.value)}
          />
        </label>
        <button>Save template</button>
      </form>
    </section>
  );
}
