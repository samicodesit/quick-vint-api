import { createClient, type User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { callOps } from "./gateway";
import { Inventory } from "./Inventory";
import { CaptureDesk, PhoneCapture } from "./features/capture/Capture";
import { ImportStock } from "./features/imports/ImportStock";
import { Orders } from "./features/orders/Orders";
import { Pick } from "./features/pick/Pick";
import { Pack } from "./features/pack/Pack";
import { Returns } from "./features/returns/Returns";
import { Stocktake } from "./features/stocktake/Stocktake";
import {
  ListingQueue,
  ReviewListing,
  TemplateSettings,
} from "./features/listings/Review";

const desktop = [
  "Today",
  "Inventory",
  "Listings",
  "Orders",
  "Pick",
  "Pack",
  "Returns",
  "Stocktake",
] as const;
const paths = [
  "",
  "inventory",
  "listings",
  "orders",
  "pick",
  "pack",
  "returns",
  "stocktake",
] as const;

export default function App({
  supabaseUrl,
  anonKey,
}: {
  supabaseUrl?: string;
  anonKey?: string;
}) {
  const phoneRoute = window.location.pathname === "/app/phone";
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

  if (phoneRoute) return <PhoneCapture />;
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
    desktop[paths.indexOf(current as (typeof paths)[number])] ??
    (current === "capture"
      ? "Capture"
      : current === "import"
        ? "Import stock"
        : "Today");
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
            {current === "import" && selected ? (
              <ImportStock client={client} workspaceId={selected} />
            ) : current === "capture" && selected ? (
              <CaptureDesk client={client} workspaceId={selected} />
            ) : current === "listings" && selected ? (
              workspaces.find((workspace) => workspace.workspaceId === selected)
                ?.role === "warehouse" ? (
                <p>
                  Listing review is available to owners, managers and listers.
                </p>
              ) : window.location.pathname.endsWith("/review") &&
                new URLSearchParams(window.location.search).get("itemId") ? (
                <ReviewListing
                  client={client}
                  workspaceId={selected}
                  itemId={
                    new URLSearchParams(window.location.search).get("itemId")!
                  }
                />
              ) : window.location.pathname.endsWith("/templates") ? (
                ["owner", "manager"].includes(
                  workspaces.find(
                    (workspace) => workspace.workspaceId === selected,
                  )?.role ?? "",
                ) ? (
                  <TemplateSettings client={client} workspaceId={selected} />
                ) : (
                  <p>Template settings are available to owners and managers.</p>
                )
              ) : (
                <>
                  <ListingQueue client={client} workspaceId={selected} />
                  {["owner", "manager"].includes(
                    workspaces.find(
                      (workspace) => workspace.workspaceId === selected,
                    )?.role ?? "",
                  ) && (
                    <p>
                      <a href="/app/listings/templates">Template settings</a>
                    </p>
                  )}
                </>
              )
            ) : current === "inventory" && selected ? (
              <Inventory
                client={client}
                workspaceId={selected}
                role={
                  workspaces.find(
                    (workspace) => workspace.workspaceId === selected,
                  )?.role ?? "warehouse"
                }
              />
            ) : current === "orders" && selected ? (
              <Orders
                client={client}
                workspaceId={selected}
                role={
                  workspaces.find(
                    (workspace) => workspace.workspaceId === selected,
                  )?.role ?? "warehouse"
                }
              />
            ) : current === "pick" && selected ? (
              workspaces.find((workspace) => workspace.workspaceId === selected)
                ?.role === "lister" ? (
                <p>
                  Pick work is available to owners, managers and warehouse
                  staff.
                </p>
              ) : (
                <Pick client={client} workspaceId={selected} />
              )
            ) : current === "pack" && selected ? (
              workspaces.find((workspace) => workspace.workspaceId === selected)
                ?.role === "lister" ? (
                <p>
                  Packing is available to owners, managers and warehouse staff.
                </p>
              ) : (
                <Pack client={client} workspaceId={selected} />
              )
            ) : current === "returns" && selected ? (
              workspaces.find((workspace) => workspace.workspaceId === selected)
                ?.role === "lister" ? (
                <p>
                  Returns are available to owners, managers and warehouse staff.
                </p>
              ) : (
                <Returns
                  client={client}
                  workspaceId={selected}
                  role={
                    workspaces.find(
                      (workspace) => workspace.workspaceId === selected,
                    )?.role ?? "warehouse"
                  }
                />
              )
            ) : current === "stocktake" && selected ? (
              workspaces.find((workspace) => workspace.workspaceId === selected)
                ?.role === "lister" ? (
                <p>
                  Stocktake is available to owners, managers and warehouse
                  staff.
                </p>
              ) : (
                <Stocktake
                  client={client}
                  workspaceId={selected}
                  role={
                    workspaces.find(
                      (workspace) => workspace.workspaceId === selected,
                    )?.role ?? "warehouse"
                  }
                />
              )
            ) : (
              <p>
                Choose <a href="/app/import">Import existing stock</a> or{" "}
                <a href="/app/inventory/new">Add new stock</a>.
              </p>
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
