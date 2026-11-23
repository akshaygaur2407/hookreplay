import { gql } from "@apollo/client";
import { useQuery } from "@apollo/client/react";
import { Activity, Webhook } from "lucide-react";

interface HelloQueryData {
  hello: string;
}

const HELLO_QUERY = gql`
  query {
    hello
  }
`;

function App() {
  const { data, loading, error } = useQuery<HelloQueryData>(
    HELLO_QUERY
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-8 py-5">
        <div className="flex items-center gap-3">
          <Webhook className="text-indigo-400" size={28} />
          <h1 className="text-xl font-bold">HookReplay</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-16">
        <div className="flex items-center gap-2 text-indigo-400">
          <Activity size={20} />
          <span className="text-sm">Backend connection</span>
        </div>

        <h2 className="mt-4 text-4xl font-bold">
          Welcome to HookReplay
        </h2>

        <p className="mt-4 text-slate-400">
          Your webhook debugging platform.
        </p>

        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          {loading && <p>Connecting...</p>}

          {error && (
            <p className="text-red-400">{error.message}</p>
          )}

          {data && (
            <p className="text-emerald-400">
              Backend connected: {data.hello}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;