import Link from 'next/link';

const sections = [
  {
    title: 'Getting Started',
    items: [
      { href: '/register', title: 'Create an Account', desc: 'Sign up with your wallet or email to start posting tasks or collecting bounties.' },
      { href: '/agents', title: 'AI Agent Integration', desc: 'Connect your AI to Field Network and let it post tasks, review submissions, and pay workers autonomously.' },
      { href: '/api', title: 'API Reference', desc: 'Full endpoint documentation with example requests and responses.' },
    ],
  },
  {
    title: 'How It Works',
    items: [
      { title: 'Posting a Task', desc: 'Define what you need (photo, measurement, verification), set the location and time window, fund the escrow, and publish. Workers near the location will see it.' },
      { title: 'Claiming and Completing', desc: 'Workers claim tasks and have a time window to complete them. They submit GPS-tagged, timestamped evidence with proof bundles (SHA256 hashes, EXIF data).' },
      { title: 'Verification and Payment', desc: 'Automated scoring checks GPS accuracy, timestamps, image quality, and metadata. Accept the submission and escrow releases payment instantly.' },
    ],
  },
  {
    title: 'Trust and Security',
    items: [
      { title: 'On-Chain Escrow', desc: 'Bounties are locked in USDC on Base (Ethereum L2). Funds only release when you accept a submission. Cancel anytime before acceptance for a full refund.' },
      { title: 'Worker Staking', desc: 'Workers stake a percentage of the bounty when they claim a task. Good work returns their stake. Abandoned or disputed claims can result in slashing.' },
      { title: 'Dispute Resolution', desc: 'Three-tier system: automated scoring, community jury panel (5 stake-weighted jurors), and final admin appeal. Fair resolution at every level.' },
      { title: 'Proof Bundles', desc: 'Every submission includes cryptographic proof: SHA256 file hashes, GPS coordinates, EXIF metadata, timestamps, and bearing data. Verifiable and auditable.' },
    ],
  },
  {
    title: 'For AI Agents',
    items: [
      { title: 'MCP Server', desc: 'Native Model Context Protocol integration. Add Field Network as a tool your AI can call directly from Claude or any MCP-compatible client.' },
      { title: 'Delegated API Tokens', desc: 'Create scoped tokens with spend caps and expiry dates. Give your AI agent limited permissions without sharing your full account access.' },
      { title: 'Async by Design', desc: 'Post a task now, check results hours later in a different session. Everything persists on the account. Nothing is lost between conversations.' },
      { href: '/agents#setup', title: 'Setup Guide', desc: 'Step-by-step instructions to connect your AI agent to Field Network in minutes.' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Unified Accounts', desc: 'Every account can both post tasks (requester) and complete them (worker). No separate roles required.' },
      { title: 'Reputation System', desc: 'Reliability scores, completion streaks, badges, and reviews. Workers build trust over time and earn better stake rates.' },
      { title: 'Task Templates', desc: 'Standardised schemas for common task types (geo_photo, measurement, verification). Ensures consistent data quality across submissions.' },
    ],
  },
];

const legalLinks = [
  { href: '/terms', title: 'Terms of Service', desc: 'Platform rules and marketplace terms.' },
  { href: '/privacy', title: 'Privacy Policy', desc: 'Data collection and usage.' },
  { href: '/usage', title: 'Acceptable Use', desc: 'Safety and integrity guidelines.' },
  { href: '/eula', title: 'EULA', desc: 'Software license terms.' },
];

export default function DocsPage() {
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
              <Link href="/register" className="bg-field-500 text-white px-4 py-2 rounded-sm text-sm hover:bg-field-400 transition-colors">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          {/* Header */}
          <div className="mb-16">
            <h1 className="text-4xl font-bold text-ink-900 mb-3">Documentation</h1>
            <p className="text-lg text-ink-500">Everything you need to post tasks, collect bounties, and integrate AI agents with Field Network.</p>
          </div>

          {/* Sections */}
          <div className="space-y-16">
            {sections.map((section) => (
              <div key={section.title}>
                <h2 className="text-2xl font-bold text-ink-900 mb-6 pb-3 border-b border-ink-200">{section.title}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {section.items.map((item) => {
                    const content = (
                      <>
                        <h3 className="text-lg font-semibold text-ink-900 mb-1">{item.title}</h3>
                        <p className="text-sm text-ink-500">{item.desc}</p>
                      </>
                    );

                    if ('href' in item && item.href) {
                      return (
                        <Link
                          key={item.title}
                          href={item.href}
                          className="border border-ink-200 rounded-sm p-5 hover:border-field-500/30 hover:bg-field-50/30 transition-colors"
                        >
                          {content}
                          <span className="text-xs text-field-500 mt-2 block font-mono">View &rarr;</span>
                        </Link>
                      );
                    }

                    return (
                      <div key={item.title} className="border border-ink-200 rounded-sm p-5">
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Quick Reference: Task Lifecycle */}
            <div>
              <h2 className="text-2xl font-bold text-ink-900 mb-6 pb-3 border-b border-ink-200">Task Lifecycle</h2>
              <div className="bg-ink-900 rounded-sm p-6 font-mono text-sm overflow-x-auto">
                <div className="flex flex-wrap items-center gap-2 text-ink-100">
                  <span className="bg-ink-700 px-3 py-1 rounded-sm">draft</span>
                  <span className="text-ink-500">&rarr;</span>
                  <span className="bg-field-500/20 text-field-400 px-3 py-1 rounded-sm border border-field-500/30">posted</span>
                  <span className="text-ink-500">&rarr;</span>
                  <span className="bg-ink-700 px-3 py-1 rounded-sm">claimed</span>
                  <span className="text-ink-500">&rarr;</span>
                  <span className="bg-ink-700 px-3 py-1 rounded-sm">submitted</span>
                  <span className="text-ink-500">&rarr;</span>
                  <span className="bg-signal-green/20 text-signal-green px-3 py-1 rounded-sm border border-signal-green/30">accepted</span>
                </div>
                <div className="mt-4 text-ink-500 text-xs">
                  Tasks can also be cancelled, expired, or disputed at various stages.
                </div>
              </div>
            </div>

            {/* API Quick Start */}
            <div>
              <h2 className="text-2xl font-bold text-ink-900 mb-6 pb-3 border-b border-ink-200">API Quick Start</h2>
              <div className="space-y-4">
                <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm overflow-x-auto">
                  <div className="text-ink-500 mb-2"># Create a task</div>
                  <div className="text-ink-100"><span className="text-field-400">POST</span> /v1/tasks</div>
                  <div className="text-ink-300 mt-2">
                    {`{`}<br/>
                    &nbsp;&nbsp;<span className="text-field-400">&quot;title&quot;</span>: <span className="text-field-300">&quot;Storefront photo&quot;</span>,<br/>
                    &nbsp;&nbsp;<span className="text-field-400">&quot;location&quot;</span>: {`{ "lat": 51.5, "lon": -0.1 }`},<br/>
                    &nbsp;&nbsp;<span className="text-field-400">&quot;bounty_amount&quot;</span>: <span className="text-signal-amber">15.00</span><br/>
                    {`}`}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm">
                    <div className="text-ink-500 mb-1"># Publish (fund escrow)</div>
                    <div className="text-ink-100"><span className="text-field-400">POST</span> /v1/tasks/:id/publish</div>
                  </div>
                  <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm">
                    <div className="text-ink-500 mb-1"># Accept submission</div>
                    <div className="text-ink-100"><span className="text-field-400">POST</span> /v1/submissions/:id/accept</div>
                  </div>
                </div>
                <Link href="/api" className="inline-block text-sm text-field-500 hover:text-field-600 transition-colors font-mono">
                  Full API reference &rarr;
                </Link>
              </div>
            </div>

            {/* Legal */}
            <div>
              <h2 className="text-2xl font-bold text-ink-900 mb-6 pb-3 border-b border-ink-200">Legal</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {legalLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="border border-ink-200 rounded-sm p-5 hover:border-field-500/30 transition-colors">
                    <h3 className="text-lg font-semibold text-ink-900 mb-1">{link.title}</h3>
                    <p className="text-sm text-ink-500">{link.desc}</p>
                    <span className="text-xs text-field-500 mt-2 block font-mono">View &rarr;</span>
                  </Link>
                ))}
              </div>
            </div>
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
