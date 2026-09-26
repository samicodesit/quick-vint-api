import { createClient, type User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

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

  const current = window.location.pathname
    .replace(/^\/app\/?/, "")
    .split("/")[0];
  const title =
    desktop[paths.indexOf(current as (typeof paths)[number])] ?? "Today";
  return (
    <div className="ops-shell">
      <header>
        <a href="/app">AutoLister</a>
        <span>{user.email}</span>
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
        <p>
          Your workspace is being connected. No inventory changes can be made
          here yet.
        </p>
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
