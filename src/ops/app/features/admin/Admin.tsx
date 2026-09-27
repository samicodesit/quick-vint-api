import { useEffect, useState } from "react";
import { callOps } from "../../gateway";
const NIL = "00000000-0000-0000-0000-000000000000";
type Overview = {
  members: Array<{ user_id: string; role: string; active: boolean }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    accepted_at: string | null;
    revoked_at: string | null;
    expires_at: string;
  }>;
  settings: {
    ai_monthly_budget_minor: number;
    ai_currency: string;
    media_retention_days: number;
  };
  credentials: Array<{
    provider: string;
    last_verified_at: string | null;
    updated_at: string;
  }>;
  deletionRequests: Array<{ id: string; status: string }>;
  jobs?: Array<{
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }>;
  problems?: Array<{ id: string; source_kind: string; message: string }>;
  connections?: Array<{
    id: string;
    environment: string;
    verified_at: string | null;
    last_reconciled_at: string | null;
  }>;
};
export function Admin({
  client,
  workspaceId,
}: {
  client: any;
  workspaceId: string;
}) {
  const [overview, setOverview] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("warehouse"),
    [inviteUrl, setInviteUrl] = useState("");
  const [budget, setBudget] = useState("0"),
    [currency, setCurrency] = useState("EUR"),
    [retention, setRetention] = useState("365");
  const [provider, setProvider] = useState("vinted_pro"),
    [secret, setSecret] = useState("");
  async function token() {
    return (await client.auth.getSession()).data.session?.access_token ?? "";
  }
  async function load() {
    const result = await callOps<Overview>(fetch, await token(), {
      kind: "query",
      name: "admin.overview",
      workspaceId,
      payload: {},
    });
    setOverview(result);
    setBudget(String(Number(result.settings.ai_monthly_budget_minor) / 100));
    setCurrency(result.settings.ai_currency);
    setRetention(String(result.settings.media_retention_days));
  }
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load settings",
      ),
    );
  }, [workspaceId]);
  async function command(name: string, payload: Record<string, unknown>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await callOps<any>(fetch, await token(), {
        kind: "command",
        name,
        workspaceId,
        payload,
        meta: { idempotencyKey: crypto.randomUUID(), expectedVersion: null },
      });
      await load();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function exportWorkspace() {
    setError("");
    setBusy(true);
    try {
      const auth = await token();
      const { tables } = await callOps<{ tables: string[] }>(fetch, auth, {
        kind: "query",
        name: "workspace.export.tables",
        workspaceId,
        payload: {},
      });
      const output: Record<string, unknown[]> = {};
      for (const table of tables) {
        const rows: unknown[] = [];
        let offset = 0;
        for (;;) {
          const page = await callOps<{
            rows: unknown[];
            nextOffset: number | null;
          }>(fetch, auth, {
            kind: "query",
            name: "workspace.export.page",
            workspaceId,
            payload: { table, offset },
          });
          rows.push(...page.rows);
          if (page.nextOffset === null) break;
          offset = page.nextOffset;
        }
        output[table] = rows;
      }
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                workspaceId,
                exportedAt: new Date().toISOString(),
                tables: output,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `autolister-workspace-${workspaceId}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Workspace data export downloaded. Stored media files are listed by path and require a separate private media export.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ops-admin">
      <p>Team access, AI budget and data controls for this workspace.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <section>
        <h2>Invite a teammate</h2>
        <p>
          Create a 48-hour, email-matched link. No email is sent automatically.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await command("invite.create", { email, role });
            if (result) {
              setInviteUrl(
                `${window.location.origin}/app/invite?token=${result.token}`,
              );
              setEmail("");
            }
          }}
        >
          <label>
            Email{" "}
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Role{" "}
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="warehouse">Warehouse</option>
              <option value="lister">Lister</option>
              <option value="manager">Manager</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <button disabled={busy}>Create invite link</button>
        </form>
        {inviteUrl && (
          <p>
            Share this link with the named teammate: <code>{inviteUrl}</code>
          </p>
        )}
        <h3>Pending invitations</h3>
        <ul>
          {overview?.invitations
            .filter((invite) => !invite.accepted_at && !invite.revoked_at)
            .map((invite) => (
              <li key={invite.id}>
                {invite.email} ({invite.role}), expires{" "}
                {new Date(invite.expires_at).toLocaleString()}{" "}
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await command("invite.revoke", { inviteId: invite.id }))
                      setNotice("Invitation revoked.");
                  }}
                >
                  Revoke
                </button>
              </li>
            ))}
        </ul>
      </section>
      <section>
        <h2>Members</h2>
        <ul>
          {overview?.members.map((member) => (
            <li key={member.user_id}>
              {member.user_id.slice(0, 8)}: {member.role},{" "}
              {member.active ? "active" : "revoked"}{" "}
              {member.active && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await command("member.update", {
                        userId: member.user_id,
                        role: member.role,
                        active: false,
                      })
                    )
                      setNotice("Member access revoked.");
                  }}
                >
                  Revoke access
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>AI and retention settings</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              await command("settings.update", {
                aiMonthlyBudgetMinor: Math.round(Number(budget) * 100),
                aiCurrency: currency,
                mediaRetentionDays: Number(retention),
              })
            )
              setNotice("Settings saved.");
          }}
        >
          <label>
            Monthly AI budget{" "}
            <input
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <label>
            Currency{" "}
            <input
              maxLength={3}
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
            />
          </label>
          <label>
            Media retention days{" "}
            <input
              type="number"
              min="30"
              max="3650"
              value={retention}
              onChange={(event) => setRetention(event.target.value)}
            />
          </label>
          <button disabled={busy}>Save settings</button>
        </form>
      </section>
      <section>
        <h2>Connection credentials</h2>
        <p>
          Stored secrets are encrypted on the server. A saved credential is
          unverified until a separate provider check passes.
        </p>
        <ul>
          {overview?.credentials.map((credential) => (
            <li key={credential.provider}>
              {credential.provider}:{" "}
              {credential.last_verified_at
                ? `verified ${credential.last_verified_at}`
                : "not verified"}{" "}
              <button
                disabled={busy}
                onClick={async () => {
                  if (
                    await command("credential.delete", {
                      provider: credential.provider,
                    })
                  )
                    setNotice("Credential removed.");
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await command("credential.store", { provider, secret })) {
              setSecret("");
              setNotice(
                "Credential encrypted and stored. Provider connection remains unverified.",
              );
            }
          }}
        >
          <label>
            Provider{" "}
            <select
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="vinted_pro">Vinted Pro</option>
              <option value="resend">Resend</option>
            </select>
          </label>
          <label>
            Secret{" "}
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              required
            />
          </label>
          <button disabled={busy}>Store credential</button>
        </form>
      </section>
      <section>
        <h2>Operational health</h2>
        <p>
          Recent jobs and unresolved problems are shown from the workspace
          database.
        </p>
        <ul>
          {(overview?.jobs ?? []).map((job) => (
            <li key={job.id}>
              {job.kind}: {job.status}, attempt {job.attempts}
              {job.last_error ? `, ${job.last_error}` : ""}
            </li>
          ))}
        </ul>
        <ul>
          {(overview?.problems ?? []).map((problem) => (
            <li key={problem.id}>
              {problem.source_kind}: {problem.message}
            </li>
          ))}
        </ul>
        {(overview?.connections ?? []).map((connection) => (
          <p key={connection.id}>
            {connection.environment} Vinted connection:{" "}
            {connection.verified_at
              ? `verified ${connection.verified_at}`
              : "not verified"}
            . Last reconciliation: {connection.last_reconciled_at ?? "never"}.
          </p>
        ))}
      </section>
      <section>
        <h2>Privacy and data</h2>
        <button disabled={busy} onClick={() => void exportWorkspace()}>
          Download workspace data
        </button>
        <p>
          The JSON export includes database records and private media paths.
          Stored media binaries need a separate private export before deletion.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            if (await command("workspace.deletion.request", {}))
              setNotice(
                "Deletion request recorded for privacy review. No data has been deleted.",
              );
          }}
        >
          Request workspace deletion
        </button>
        <p>
          {overview?.deletionRequests
            .map((request) => `${request.status} (${request.id.slice(0, 8)})`)
            .join(", ")}
        </p>
      </section>
    </div>
  );
}

export function AcceptInvite({ client }: { client: any }) {
  const [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  return (
    <main>
      <h1>Join workspace</h1>
      <p>Accept this invitation with the email address it was sent to.</p>
      {error && <p role="alert">{error}</p>}
      {done ? (
        <p role="status">
          Invitation accepted. <a href="/app">Open workspace</a>
        </p>
      ) : (
        <button
          disabled={busy || !/^[0-9a-f]{64}$/.test(token)}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const auth =
                (await client.auth.getSession()).data.session?.access_token ??
                "";
              await callOps(fetch, auth, {
                kind: "command",
                name: "invite.accept",
                workspaceId: NIL,
                payload: { token },
                meta: {
                  idempotencyKey: crypto.randomUUID(),
                  expectedVersion: null,
                },
              });
              setDone(true);
              window.history.replaceState(null, "", "/app/invite");
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Invitation could not be accepted",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Accept invitation
        </button>
      )}
    </main>
  );
}
