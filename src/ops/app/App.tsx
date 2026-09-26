import { createClient, type User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { callOps } from "./gateway";
import { Inventory } from "./Inventory";

const desktop = ["Today", "Inventory", "Listings", "Orders"] as const;
const paths = ["", "inventory", "listings", "orders"] as const;

export default function App({
  supabaseUrl,
  anonKey,
}: {
  supabaseUrl?: string;
  anonKey?: string;
}) {
  const client = useMemo(
    () => (supabaseUrl && anonKey ? createClient(supabaseUrl, anonKey) : null),
    [supabaseUrl, anonKey],
  );
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    void client.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  if (!client)
    return <main>Sign-in is not configured for this environment.</main>;
  if (loading) return <main>Checking your session...</main>;
  if (!user)
    return (
      <main>
        <h1>Sign in to AutoLister</h1>
        <p>Use the email address linked to your account.</p>
        <SignIn client={client} />
      </main>
    );

  return <WorkspacePanel client={client} user={user} />;
}

type Workspace = { workspaceId: string; role: string; name: string };
const emptyWorkspaceId = "00000000-0000-0000-0000-000000000000";

function WorkspacePanel({
  client,
  user,
}: {
  client: ReturnType<typeof createClient<any>>;
  user: User;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const pendingBootstrap = useRef<{ name: string; key: string } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const {
        data: { session },
      } = await client.auth.getSession();
      const list = await callOps<Workspace[]>(
        fetch,
        session?.access_token ?? "",
        {
          kind: "query",
          name: "workspace.list",
          workspaceId: emptyWorkspaceId,
          payload: {},
        },
      );
      if (active) {
        setWorkspaces(list);
        const remembered = localStorage.getItem("ops-workspace-id");
        setSelected(
          list.find((workspace) => workspace.workspaceId === remembered)
            ?.workspaceId ??
            list[0]?.workspaceId ??
            null,
        );
      }
    })().catch((cause) => {
      if (active)
        setError(
          cause instanceof Error ? cause.message : "Could not load workspaces",
        );
    });
    return () => {
      active = false;
    };
  }, [client, user.id]);

  useEffect(() => {
    if (selected) localStorage.setItem("ops-workspace-id", selected);
  }, [selected]);

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      if (pendingBootstrap.current?.name !== name)
        pendingBootstrap.current = { name, key: crypto.randomUUID() };
      const {
        data: { session },
      } = await client.auth.getSession();
      const result = await callOps<{ workspaceId: string }>(
        fetch,
        session?.access_token ?? "",
        {
          kind: "command",
          name: "workspace.bootstrap",
          workspaceId: emptyWorkspaceId,
          payload: { name },
          meta: {
            idempotencyKey: pendingBootstrap.current.key,
            expectedVersion: null,
          },
        },
      );
      pendingBootstrap.current = null;
      setWorkspaces((current) => [
        ...(current ?? []),
        { workspaceId: result.workspaceId, role: "owner", name },
      ]);
      setSelected(result.workspaceId);
      setName("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create workspace",
      );
    } finally {
      setCreating(false);
    }
  }

  const current = window.location.pathname
    .replace(/^\/app\/?/, "")
    .split("/")[0];
  const title =
    desktop[paths.indexOf(current as (typeof paths)[number])] ?? "Today";
  return (
    <div className="ops-shell">
      <header>
        <a href="/app">AutoLister</a>
        <span>
          {workspaces?.find((workspace) => workspace.workspaceId === selected)
            ?.name ?? user.email}
        </span>
      </header>
      <nav aria-label="Workspace">
        {desktop.map((label, index) => (
          <a
            key={label}
            href={`/app/${paths[index]}`}
            aria-current={label === title ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <main>
        <h1>{title}</h1>
        {error && <p role="alert">{error}</p>}
        {workspaces === null ? (
          <p>Loading workspaces...</p>
        ) : workspaces.length === 0 ? (
          <section>
            <h2>Create your workspace</h2>
            <p>
              Start with your business name. You can add stock without setting
              up a warehouse.
            </p>
            <form onSubmit={createWorkspace}>
              <label>
                Workspace name{" "}
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <button type="submit" disabled={creating}>
                Create workspace
              </button>
            </form>
          </section>
        ) : (
          <section>
            {workspaces.length > 1 && (
              <label>
                Workspace{" "}
                <select
                  value={selected ?? ""}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {workspaces.map((workspace) => (
                    <option
                      key={workspace.workspaceId}
                      value={workspace.workspaceId}
                    >
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {current === "inventory" && selected ? (
              <Inventory
                client={client}
                workspaceId={selected}
                role={
                  workspaces.find(
                    (workspace) => workspace.workspaceId === selected,
                  )?.role ?? "warehouse"
                }
              />
            ) : (
              <p>Choose Inventory to add and review stock.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SignIn({ client }: { client: ReturnType<typeof createClient<any>> }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}/app` },
        });
        setMessage(
          error ? error.message : "Check your email for a sign-in link.",
        );
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
      <button type="submit">Send sign-in link</button>
      <p role="status">{message}</p>
    </form>
  );
}
