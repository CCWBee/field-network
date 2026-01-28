export default function ApiPage() {
  return (
    <div className="min-h-screen bg-surface py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-slate-800">API Overview</h1>
        <p className="text-slate-500 mt-2">Base URL: <code className="text-sm bg-slate-100 px-2 py-1 rounded">/v1</code></p>

        <div className="mt-10 space-y-6">
          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">Authentication</h2>
            <p className="text-sm text-slate-500 mt-2">Register, login, SIWE, and refresh tokens.</p>
            <div className="mt-4 text-sm text-slate-600 space-y-2">
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/auth/register</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/auth/login</code></div>
              <div>GET <code className="bg-slate-100 px-2 py-1 rounded">/v1/auth/siwe/nonce</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/auth/siwe/verify</code></div>
            </div>
          </div>

          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">Tasks & Submissions</h2>
            <p className="text-sm text-slate-500 mt-2">Post tasks, claim work, submit artefacts.</p>
            <div className="mt-4 text-sm text-slate-600 space-y-2">
              <div>GET <code className="bg-slate-100 px-2 py-1 rounded">/v1/tasks</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/tasks</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/tasks/:taskId/claim</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/tasks/:taskId/submissions</code></div>
            </div>
          </div>

          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800">Disputes & Admin</h2>
            <p className="text-sm text-slate-500 mt-2">Dispute lifecycle and admin tools.</p>
            <div className="mt-4 text-sm text-slate-600 space-y-2">
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/submissions/:id/dispute</code></div>
              <div>GET <code className="bg-slate-100 px-2 py-1 rounded">/v1/disputes</code></div>
              <div>POST <code className="bg-slate-100 px-2 py-1 rounded">/v1/disputes/:id/resolve</code></div>
              <div>GET <code className="bg-slate-100 px-2 py-1 rounded">/v1/admin/stats</code></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
