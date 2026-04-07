import Link from 'next/link';

export default function ApiPage() {
  return (
    <div className="min-h-screen bg-paper">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-paper border-b border-ink-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-3">
                <img src="/icon.svg" alt="Field Network" className="h-10 w-10" />
                <span className="text-xl font-bold text-ink-900">Field Network</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-ink-500 hover:text-ink-900 px-3 py-2 transition-colors text-sm">Home</Link>
              <Link href="/agents" className="text-ink-500 hover:text-ink-900 px-3 py-2 transition-colors text-sm">AI Agents</Link>
              <Link href="/docs" className="text-ink-500 hover:text-ink-900 px-3 py-2 transition-colors text-sm">Docs</Link>
              <Link href="/register" className="bg-field-500 text-white px-4 py-2 rounded-sm text-sm hover:bg-field-400 transition-colors">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-16">
        <div className="bg-paper-warm py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center px-3 py-1.5 rounded-sm bg-signal-amber/10 border border-signal-amber/30 text-xs font-mono text-signal-amber uppercase tracking-wider mb-6">
              Coming Soon
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-ink-900 mb-6">REST API Documentation</h1>
            <p className="text-lg text-ink-500 max-w-2xl mx-auto mb-10">
              Full REST API documentation for building integrations with Field Network.
              Create tasks, manage submissions, handle disputes, and automate your
              real-world data pipeline programmatically.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/register"
                className="bg-field-500 text-white px-6 py-3 rounded-sm font-semibold hover:bg-field-400 transition-colors"
              >
                Get Early Access
              </Link>
              <Link
                href="/agents"
                className="border border-ink-200 text-ink-700 px-6 py-3 rounded-sm font-semibold hover:bg-paper-warm transition-colors"
              >
                View AI Agent Docs
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* What's Coming */}
      <div className="py-20 bg-paper">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-ink-900 mb-4">What the API will cover</h2>
          <p className="text-ink-500 mb-10">
            Interactive OpenAPI/Swagger documentation with request/response examples,
            authentication guides, and SDKs for common languages.
          </p>

          <div className="space-y-6">
            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink-900">Authentication</h2>
                <span className="px-2 py-0.5 text-xs font-mono rounded-sm bg-signal-green/10 text-signal-green border border-signal-green/20">Available</span>
              </div>
              <p className="text-sm text-ink-500 mt-2">Register, login, SIWE wallet auth, and token refresh. JWT-based with automatic refresh.</p>
              <div className="mt-4 text-sm text-ink-700 space-y-2">
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/auth/register</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/auth/login</code></div>
                <div>GET <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/auth/siwe/nonce</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/auth/siwe/verify</code></div>
              </div>
            </div>

            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink-900">Tasks &amp; Submissions</h2>
                <span className="px-2 py-0.5 text-xs font-mono rounded-sm bg-signal-green/10 text-signal-green border border-signal-green/20">Available</span>
              </div>
              <p className="text-sm text-ink-500 mt-2">Create tasks with bounties, claim work, upload artefacts, and manage the full task lifecycle.</p>
              <div className="mt-4 text-sm text-ink-700 space-y-2">
                <div>GET <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/tasks</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/tasks</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/tasks/:taskId/claim</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/tasks/:taskId/submissions</code></div>
              </div>
            </div>

            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink-900">Disputes &amp; Admin</h2>
                <span className="px-2 py-0.5 text-xs font-mono rounded-sm bg-signal-green/10 text-signal-green border border-signal-green/20">Available</span>
              </div>
              <p className="text-sm text-ink-500 mt-2">Multi-tier dispute resolution, jury voting, and admin tools for platform management.</p>
              <div className="mt-4 text-sm text-ink-700 space-y-2">
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/submissions/:id/dispute</code></div>
                <div>GET <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/disputes</code></div>
                <div>POST <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/disputes/:id/resolve</code></div>
                <div>GET <code className="bg-ink-50 px-2 py-1 rounded-sm">/v1/admin/stats</code></div>
              </div>
            </div>

            <div className="bg-paper rounded-sm border border-ink-200 p-6 border-dashed">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink-900">Webhooks &amp; Events</h2>
                <span className="px-2 py-0.5 text-xs font-mono rounded-sm bg-signal-amber/10 text-signal-amber border border-signal-amber/20">Coming Soon</span>
              </div>
              <p className="text-sm text-ink-500 mt-2">Real-time notifications for task events, submission updates, and dispute resolutions delivered to your endpoint.</p>
            </div>

            <div className="bg-paper rounded-sm border border-ink-200 p-6 border-dashed">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-ink-900">SDKs &amp; Client Libraries</h2>
                <span className="px-2 py-0.5 text-xs font-mono rounded-sm bg-signal-amber/10 text-signal-amber border border-signal-amber/20">Coming Soon</span>
              </div>
              <p className="text-sm text-ink-500 mt-2">Official TypeScript, Python, and Go clients with typed responses and built-in retry logic.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Base URL reference */}
      <div className="py-16 bg-paper-warm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-ink-900 mb-6">Quick Reference</h2>
          <div className="bg-ink-900 rounded-sm p-6 font-mono text-sm overflow-x-auto">
            <div className="text-ink-500"># Base URL</div>
            <div className="text-field-400 mb-4">https://api.field-network.com/v1</div>
            <div className="text-ink-500"># Authentication</div>
            <div className="text-ink-100 mb-1">curl -X POST /v1/auth/login \</div>
            <div className="text-ink-100 mb-1 pl-4">-H &quot;Content-Type: application/json&quot; \</div>
            <div className="text-ink-100 mb-4 pl-4">-d {`'{"email": "you@example.com", "password": "..."}'`}</div>
            <div className="text-ink-500"># Use the token</div>
            <div className="text-ink-100 mb-1">curl /v1/tasks \</div>
            <div className="text-ink-100 pl-4">-H &quot;Authorization: Bearer YOUR_TOKEN&quot;</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-paper border-t border-ink-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-ink-900 font-bold">Field Network</span>
            <div className="flex space-x-6">
              <Link href="/agents" className="text-ink-500 hover:text-ink-700 transition-colors">AI Agents</Link>
              <Link href="/docs" className="text-ink-500 hover:text-ink-700 transition-colors">Docs</Link>
              <Link href="/terms" className="text-ink-500 hover:text-ink-700 transition-colors">Terms</Link>
              <Link href="/privacy" className="text-ink-500 hover:text-ink-700 transition-colors">Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
