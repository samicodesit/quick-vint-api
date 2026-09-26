import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { callOps } from "../../gateway";

type Field =
  | "sku"
  | "externalId"
  | "title"
  | "location"
  | "cost"
  | "currency"
  | "saleState"
  | "source"
  | "imageUrl";
const fields: Array<{ id: Field; label: string }> = [
  { id: "sku", label: "Existing SKU" },
  { id: "externalId", label: "External listing ID" },
  { id: "title", label: "Title" },
  { id: "location", label: "Location" },
  { id: "cost", label: "Acquisition cost" },
  { id: "currency", label: "Cost currency" },
  { id: "saleState", label: "Sale state" },
  { id: "source", label: "Source" },
  { id: "imageUrl", label: "Image reference" },
];
type ImportView = {
  importId: string;
  status: string;
  rowCount: number;
  counts: Record<string, number>;
  sample: Array<{
    row_number: number;
    status: string;
    reason: string | null;
    mapped_values: Record<string, unknown>;
  }>;
};
function guess(headers: string[]): Partial<Record<Field, string>> {
  const aliases: Record<Field, string[]> = {
    sku: ["sku", "item sku"],
    externalId: ["listing id", "external id"],
    title: ["title", "name"],
    location: ["location", "box"],
    cost: ["cost", "acquisition cost"],
    currency: ["currency", "cost currency"],
    saleState: ["sale state", "status"],
    source: ["source"],
    imageUrl: ["image url", "photo url"],
  };
  return Object.fromEntries(
    fields.map(({ id }) => [
      id,
      headers.find((header) => aliases[id].includes(header.toLowerCase())) ??
        "",
    ]),
  );
}

export function ImportStock({
  client,
  workspaceId,
}: {
  client: SupabaseClient;
  workspaceId: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [columns, setColumns] = useState<Partial<Record<Field, string>>>({});
  const [accountScope, setAccountScope] = useState("manual");
  const [view, setView] = useState<ImportView | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const token = useCallback(
    async () =>
      (await client.auth.getSession()).data.session?.access_token ?? "",
    [client],
  );
  const request = useCallback(
    async <T,>(kind: "query" | "command", name: string, payload: unknown) =>
      callOps<T>(fetch, await token(), {
        kind,
        name,
        workspaceId,
        payload,
        ...(kind === "command"
          ? {
              meta: {
                idempotencyKey: crypto.randomUUID(),
                expectedVersion: null,
              },
            }
          : {}),
      }),
    [token, workspaceId],
  );
  useEffect(() => {
    const importId = new URLSearchParams(location.search).get("importId");
    if (!importId) return;
    void request<ImportView>("query", "import.detail", { importId })
      .then(setView)
      .catch((cause) =>
        setMessage(
          cause instanceof Error ? cause.message : "Could not load import",
        ),
      );
  }, [request]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setMessage("Saving CSV...");
    try {
      if (file.size > 4_000_000) throw new Error("CSV exceeds 4 MB");
      const response = await fetch("/api/ops-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/json",
          "x-ops-workspace-id": workspaceId,
        },
        body: JSON.stringify({ name: file.name, csv: await file.text() }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: { fileId: string; headers: string[]; rowCount: number };
        error?: { message: string };
      };
      if (!result.ok || !result.data)
        throw new Error(result.error?.message ?? "CSV could not be saved");
      setFileId(result.data.fileId);
      setHeaders(result.data.headers);
      setColumns(guess(result.data.headers));
      setMessage(
        `${result.data.rowCount} rows saved. Check the column mapping before preview.`,
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    if (!fileId) return;
    setBusy(true);
    setMessage("Checking rows...");
    try {
      const result = await request<ImportView>("command", "import.preview", {
        fileId,
        mapping: {
          columns: Object.fromEntries(
            Object.entries(columns).map(([key, value]) => [key, value || null]),
          ),
          accountScope,
        },
      });
      setView(result);
      history.replaceState(
        null,
        "",
        `/app/import?importId=${encodeURIComponent(result.importId)}`,
      );
      setMessage("Preview saved. Review conflicts before applying.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!view) return;
    setBusy(true);
    try {
      for (let batch = 0; batch < 200; batch++) {
        const progress = await request<{
          remaining: number;
          processed: number;
          status: string;
        }>("command", "import.apply", { importId: view.importId });
        setMessage(
          `${progress.remaining} rows left. ${progress.processed} checked in the latest batch.`,
        );
        if (!progress.remaining) break;
      }
      setView(
        await request<ImportView>("query", "import.detail", {
          importId: view.importId,
        }),
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Import paused. You can resume it here.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function downloadResults() {
    if (!view) return;
    try {
      const csv = await request<string>("query", "import.export", {
        importId: view.importId,
      });
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `autolister-import-${view.importId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Could not export results",
      );
    }
  }
  return (
    <div className="ops-import">
      <p>
        Import existing stock from your CSV. Costs and locations can be added
        later. Image links remain unresolved for review.
      </p>
      <p role="status">{message}</p>
      <section>
        <h2>1. Choose a CSV</h2>
        <input
          aria-label="CSV file"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button disabled={!file || busy} onClick={() => void upload()}>
          Save CSV
        </button>
      </section>
      {fileId && (
        <section>
          <h2>2. Map columns</h2>
          <label>
            Account scope{" "}
            <input
              value={accountScope}
              maxLength={120}
              onChange={(event) => setAccountScope(event.target.value)}
            />
          </label>
          <p>
            Use one stable account name for listing IDs from the same seller
            account.
          </p>
          <div className="ops-import-map">
            {fields.map(({ id, label }) => (
              <label key={id}>
                {label}
                <select
                  value={columns[id] ?? ""}
                  onChange={(event) =>
                    setColumns((current) => ({
                      ...current,
                      [id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Not in CSV</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            disabled={busy || !accountScope.trim()}
            onClick={() => void preview()}
          >
            Preview import
          </button>
        </section>
      )}
      {view && (
        <section>
          <h2>3. Review and apply</h2>
          <p>
            {view.rowCount} rows.{" "}
            {Object.entries(view.counts)
              .map(([status, count]) => `${count} ${status}`)
              .join(", ")}
            .
          </p>
          <div className="ops-import-table">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>SKU</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {view.sample.map((row) => (
                  <tr key={row.row_number}>
                    <td>{row.row_number}</td>
                    <td>{String(row.mapped_values.sku ?? "")}</td>
                    <td>{String(row.mapped_values.title ?? "")}</td>
                    <td>{row.status}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.status !== "complete" && (
            <button disabled={busy} onClick={() => void apply()}>
              {view.status === "applying" ? "Resume import" : "Apply import"}
            </button>
          )}
          <button disabled={busy} onClick={() => void downloadResults()}>
            Download row results
          </button>
        </section>
      )}
    </div>
  );
}
