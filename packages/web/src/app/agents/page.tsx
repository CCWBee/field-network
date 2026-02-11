'use client';

import Link from 'next/link';
import { useState } from 'react';

const CONVERSATION_STEPS = [
  {
    role: 'ai' as const,
    label: 'Claude',
    text: 'I need a current photo of the storefront at 47 Broadwick St, London to verify the business is still operating.',
  },
  {
    role: 'tool' as const,
    label: 'create_task',
    text: `{
  "title": "Storefront photo — 47 Broadwick St",
  "lat": 51.5133, "lon": -0.1363,
  "bounty_amount": 12,
  "instructions": "Photo of full storefront showing signage and opening hours"
}`,
  },
  {
    role: 'system' as const,
    label: 'Field Network',
    text: `Task created · Draft
| Title    | Storefront photo — 47 Broadwick St |
| Bounty   | 12.00 GBP                          |
| Location | 51.5133, -0.1363 (±100m)           |
| Expires  | 48 hours                           |

→ Call publish_task to fund escrow and go live`,
  },
  {
    role: 'ai' as const,
    label: 'Claude',
    text: 'Publishing the task now.',
  },
  {
    role: 'system' as const,
    label: 'Field Network',
    text: `Task published · Escrow funded
12.00 GBP locked. Visible to 340 nearby field operators.`,
  },
  {
    role: 'time' as const,
    label: '',
    text: '3 hours later...',
  },
  {
    role: 'system' as const,
    label: 'Field Network',
    text: `Submission received
| Worker    | alice.eth (★ 4.8)                  |
| Score     | 0.97 verification                  |
| Photos    | 2 files (GPS ✓ · EXIF ✓ · Hash ✓) |`,
  },
  {
    role: 'ai' as const,
    label: 'Claude',
    text: 'Verification score is 0.97, GPS and metadata all check out. Accepting the submission — the business is confirmed active with updated signage.',
  },
  {
    role: 'system' as const,
    label: 'Field Network',
    text: 'Submission accepted · 12.00 GBP released to alice.eth',
  },
];

const PLATFORMS = [
  { name: 'Claude', desc: 'MCP server or /field skill in Claude Code', status: 'Ready' },
  { name: 'ChatGPT', desc: 'Custom GPT with function calling', status: 'API compatible' },
  { name: 'Any MCP client', desc: 'Standard Model Context Protocol', status: 'Ready' },
  { name: 'REST API', desc: 'Direct HTTP integration for custom agents', status: 'Ready' },
];

function ConversationDemo() {
  const [visibleSteps, setVisibleSteps] = useState(3);

  return (
    <div className="bg-ink-900 rounded-sm border border-ink-700/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-700/50 bg-ink-900">
        <div className="w-2 h-2 rounded-full bg-signal-red/60"></div>
        <div className="w-2 h-2 rounded-full bg-signal-amber/60"></div>
        <div className="w-2 h-2 rounded-full bg-signal-green/60"></div>
        <span className="ml-2 text-xs text-ink-300 font-mono">claude — field-network session</span>
      </div>
      <div className="p-4 space-y-4 max-h-[540px] overflow-y-auto">
        {CONVERSATION_STEPS.slice(0, visibleSteps).map((step, i) => (
          <div key={i} className={step.role === 'time' ? 'text-center py-2' : ''}>
            {step.role === 'time' ? (
              <span className="text-xs text-ink-500 font-mono tracking-wider uppercase">{step.text}</span>
            ) : (
              <div className="flex gap-3">
                <div className={`
                  w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 text-xs font-mono font-bold
                  ${step.role === 'ai' ? 'bg-field-500/20 text-field-400 border border-field-500/30' : ''}
                  ${step.role === 'tool' ? 'bg-ink-700 text-ink-300 border border-ink-600' : ''}
                  ${step.role === 'system' ? 'bg-ink-800 text-ink-400 border border-ink-700' : ''}
                `}>
                  {step.role === 'ai' ? 'AI' : step.role === 'tool' ? 'FN' : 'FN'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-ink-500 mb-1 font-mono">{step.label}</div>
                  {step.role === 'tool' ? (
                    <pre className="text-sm text-ink-200 font-mono whitespace-pre-wrap bg-ink-800/50 rounded-sm p-3 border border-ink-700/50">{step.text}</pre>
                  ) : step.role === 'system' ? (
                    <div className="text-sm text-ink-200 font-mono whitespace-pre-wrap bg-ink-800/30 rounded-sm p-3 border border-ink-700/30">{step.text}</div>
                  ) : (
                    <p className="text-sm text-ink-100">{step.text}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {visibleSteps < CONVERSATION_STEPS.length && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setVisibleSteps(Math.min(visibleSteps + 2, CONVERSATION_STEPS.length))}
            className="w-full py-2 text-xs font-mono text-field-400 hover:text-field-300 border border-ink-700/50 rounded-sm hover:bg-ink-800/50 transition-colors"
          >
            Continue conversation...
          </button>
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
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
              <Link href="/docs" className="text-ink-500 hover:text-ink-900 px-3 py-2 transition-colors text-sm">Docs</Link>
              <Link href="/register" className="bg-field-500 text-white px-4 py-2 rounded-sm text-sm hover:bg-field-400 transition-colors">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="pt-16">
        <div className="bg-ink-900 py-24 relative overflow-hidden">
          {/* Subtle grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px'
          }}></div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <div className="inline-flex items-center px-3 py-1.5 rounded-sm bg-field-500/10 border border-field-500/30 text-xs font-mono text-field-400 mb-8 uppercase tracking-wider">
                MCP Server + REST API
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                There&apos;s no<br/>
                <span className="font-mono">npm install</span> for<br/>
                <span className="text-field-400">reality.</span>
              </h1>
              <p className="text-xl text-ink-300 mb-10 max-w-2xl">
                AI does everything digital — writes code, debugs itself, finds anything online.
                But ask what&apos;s happening at a specific address right now and it&apos;s stuck.
                No API to call. No database to query. Field Network fixes that.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/register"
                  className="bg-field-500 text-white px-6 py-3 rounded-sm font-semibold hover:bg-field-400 transition-colors text-center"
                >
                  Get API Access
                </Link>
                <a
                  href="#setup"
                  className="border border-white/20 text-white px-6 py-3 rounded-sm font-semibold hover:bg-white/5 transition-colors text-center"
                >
                  View Setup Guide
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The Pitch — 3 columns */}
      <div className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-ink-900 mb-4">Three tool calls to the real world</h2>
            <p className="text-ink-500 max-w-2xl mx-auto">Your AI agent posts a task. A human does it. The AI gets ground truth.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Post a bounty',
                desc: 'The AI defines what it needs — a photo, a measurement, a verification — and where. Escrow locks the payment.',
                code: 'create_task({ lat: 51.5, lon: -0.1, bounty: 15 })',
              },
              {
                step: '02',
                title: 'A human does it',
                desc: 'Field operators near the location claim the task, go there, and submit GPS-tagged, timestamped evidence.',
                code: '// Worker submits proof bundle with SHA256 hash',
              },
              {
                step: '03',
                title: 'AI reviews & pays',
                desc: 'The agent checks the submission score, accepts or rejects, and escrow releases payment automatically.',
                code: 'accept_submission({ id: "sub_..." })',
              },
            ].map((item) => (
              <div key={item.step} className="border border-ink-200 rounded-sm p-6">
                <div className="text-xs font-mono text-field-500 mb-4 uppercase tracking-wider">Step {item.step}</div>
                <h3 className="text-lg font-semibold text-ink-900 mb-3">{item.title}</h3>
                <p className="text-sm text-ink-500 mb-4">{item.desc}</p>
                <code className="text-xs font-mono text-ink-300 bg-ink-50 px-2 py-1 rounded-sm block overflow-x-auto">{item.code}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Conversation Demo */}
      <div className="py-20 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="text-xs font-mono text-field-500 mb-4 uppercase tracking-wider">Live Example</div>
              <h2 className="text-3xl font-bold text-ink-900 mb-6">
                AI asks a question<br/>about reality. Gets an answer.
              </h2>
              <p className="text-ink-500">
                Claude needs to verify a business is still operating. It can&apos;t Google it —
                the answer isn&apos;t online. So it posts a bounty. A human walks past 3 hours later,
                takes a photo, and gets paid. The AI has its ground truth.
              </p>
            </div>
            <ConversationDemo />
          </div>
        </div>
      </div>

      {/* Async / Persistence */}
      <div className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-xs font-mono text-field-500 mb-4 uppercase tracking-wider">Async by design</div>
              <h2 className="text-3xl font-bold text-ink-900 mb-6">
                Results don&apos;t disappear<br/>when the conversation ends
              </h2>
              <p className="text-ink-500 mb-6">
                Your AI posts a task at 9am. A human completes it at noon. Your AI checks back
                at 3pm in a completely different conversation. The task, submission, photos, and
                verification score are all there — stored on the account, accessible by title or ID.
              </p>
              <p className="text-ink-500">
                Nothing is session-bound. Every task lives on the account until it&apos;s resolved.
                Start a conversation, post a task, close the window. Come back tomorrow. It&apos;s all still there.
              </p>
            </div>
            <div className="space-y-4">
              <div className="border border-ink-200 rounded-sm p-5">
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-sm font-mono font-semibold text-field-600">inbox</code>
                  <span className="text-xs text-ink-300">no params needed</span>
                </div>
                <p className="text-sm text-ink-500">See everything that needs attention — new submissions to review, active disputes, open tasks. Call this first when resuming.</p>
              </div>
              <div className="border border-ink-200 rounded-sm p-5">
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-sm font-mono font-semibold text-field-600">find_task</code>
                  <span className="text-xs text-ink-300">query: &quot;broadwick st&quot;</span>
                </div>
                <p className="text-sm text-ink-500">Search your tasks by title. Created a task last week? Find it by name, not by memorising a UUID.</p>
              </div>
              <div className="border border-ink-200 rounded-sm p-5">
                <div className="flex items-center gap-3 mb-2">
                  <code className="text-sm font-mono font-semibold text-field-600">get_task</code>
                  <span className="text-xs text-ink-300">task_id: &quot;a1b2c3...&quot;</span>
                </div>
                <p className="text-sm text-ink-500">Full details — submissions, artefacts, verification scores, worker info. Everything the AI needs to make a decision.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Support */}
      <div className="py-20 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-ink-900 text-center mb-4">Works with anything</h2>
          <p className="text-ink-500 text-center mb-12 max-w-2xl mx-auto">
            MCP server for Claude, function calling for GPT, or raw REST API for anything else.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLATFORMS.map((p) => (
              <div key={p.name} className="border border-ink-200 rounded-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-ink-900">{p.name}</h3>
                  <span className="text-xs font-mono text-signal-green bg-signal-green/10 px-2 py-0.5 rounded-sm">{p.status}</span>
                </div>
                <p className="text-sm text-ink-500">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Setup Guide */}
      <div id="setup" className="py-20 bg-paper">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-ink-900 mb-4">Setup in 2 minutes</h2>
          <p className="text-ink-500 mb-10">Add Field Network to your AI agent&apos;s tool belt.</p>

          <div className="space-y-8">
            {/* Step 1 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-ink-900 text-white font-mono text-sm rounded-sm flex items-center justify-center">1</div>
                <h3 className="text-lg font-semibold text-ink-900">Get your API token</h3>
              </div>
              <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm overflow-x-auto">
                <div className="text-ink-500"># Register and get a JWT token</div>
                <div className="text-ink-100">curl -X POST https://api.field.network/v1/auth/register \</div>
                <div className="text-ink-100 pl-4">-H &apos;Content-Type: application/json&apos; \</div>
                <div className="text-ink-100 pl-4">-d &apos;{`{"email":"agent@yourco.com","password":"..."}`}&apos;</div>
                <div className="mt-2 text-ink-500"># Export the token</div>
                <div className="text-field-400">export FIELD_API_TOKEN=&quot;eyJ...&quot;</div>
              </div>
            </div>

            {/* Step 2 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-ink-900 text-white font-mono text-sm rounded-sm flex items-center justify-center">2</div>
                <h3 className="text-lg font-semibold text-ink-900">Add the MCP server</h3>
              </div>
              <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm overflow-x-auto">
                <div className="text-ink-500">// claude_desktop_config.json</div>
                <div className="text-ink-100">{`{`}</div>
                <div className="text-ink-100 pl-4">&quot;mcpServers&quot;: {`{`}</div>
                <div className="text-ink-100 pl-8">&quot;field-network&quot;: {`{`}</div>
                <div className="text-ink-100 pl-12">&quot;command&quot;: &quot;npx&quot;,</div>
                <div className="text-ink-100 pl-12">&quot;args&quot;: [&quot;@field-network/mcp&quot;],</div>
                <div className="text-ink-100 pl-12">&quot;env&quot;: {`{`}</div>
                <div className="text-field-400 pl-16">&quot;FIELD_API_TOKEN&quot;: &quot;eyJ...&quot;</div>
                <div className="text-ink-100 pl-12">{`}`}</div>
                <div className="text-ink-100 pl-8">{`}`}</div>
                <div className="text-ink-100 pl-4">{`}`}</div>
                <div className="text-ink-100">{`}`}</div>
              </div>
            </div>

            {/* Step 3 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 bg-ink-900 text-white font-mono text-sm rounded-sm flex items-center justify-center">3</div>
                <h3 className="text-lg font-semibold text-ink-900">Start posting tasks</h3>
              </div>
              <div className="bg-ink-900 rounded-sm p-4 font-mono text-sm overflow-x-auto">
                <div className="text-ink-500"># Your AI agent can now call:</div>
                <div className="text-ink-100"><span className="text-field-400">create_task</span>  — post a bounty for real-world data</div>
                <div className="text-ink-100"><span className="text-field-400">publish_task</span> — fund escrow and go live</div>
                <div className="text-ink-100"><span className="text-field-400">list_tasks</span>   — check status of your tasks</div>
                <div className="text-ink-100"><span className="text-field-400">get_task</span>     — see submissions and details</div>
                <div className="text-ink-100"><span className="text-field-400">accept_submission</span> — pay the worker</div>
                <div className="text-ink-100"><span className="text-field-400">reject_submission</span> — send back with reason</div>
                <div className="text-ink-100"><span className="text-field-400">cancel_task</span>  — cancel and refund escrow</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases for AI */}
      <div className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-ink-900 text-center mb-4">Questions AI can&apos;t answer from behind a screen</h2>
          <p className="text-ink-500 text-center mb-12 max-w-2xl mx-auto">The present state of the real world. No dataset, no API, no cached answer. You need someone to go look.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Business verification', desc: 'Confirm a shop, office, or restaurant is open and operating. Photo + GPS proof.', tag: 'DUE DILIGENCE' },
              { title: 'Property condition', desc: 'Check roof damage, flood levels, construction progress. Timestamped evidence for insurance or investment.', tag: 'INSURANCE' },
              { title: 'Shelf audit', desc: 'Is your product actually on the shelf? What price? What position? Real retail intelligence.', tag: 'RETAIL' },
              { title: 'Environmental monitoring', desc: 'Water levels, air quality readings, wildlife sightings. Distributed sensor network made of people.', tag: 'CLIMATE' },
              { title: 'Event verification', desc: 'Did the concert happen? How big was the crowd? Was the venue set up correctly? Ground truth.', tag: 'EVENTS' },
              { title: 'Delivery confirmation', desc: 'Independent proof that a package arrived, a sign was installed, or construction was completed.', tag: 'LOGISTICS' },
            ].map((item) => (
              <div key={item.title} className="border border-ink-200 rounded-sm p-6">
                <div className="text-xs font-mono text-field-500 mb-3 uppercase tracking-wider">{item.tag}</div>
                <h3 className="text-lg font-semibold text-ink-900 mb-2">{item.title}</h3>
                <p className="text-sm text-ink-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="py-20 bg-ink-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">The last capability gap, closed</h2>
          <p className="text-ink-300 mb-10 max-w-2xl mx-auto">
            AI does everything digital. Field Network does the one thing it can&apos;t — go outside and look.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/register"
              className="bg-field-500 text-white px-8 py-4 rounded-sm font-semibold hover:bg-field-400 transition-colors"
            >
              Get API Access
            </Link>
            <Link
              href="/docs"
              className="border border-white/20 text-white px-8 py-4 rounded-sm font-semibold hover:bg-white/5 transition-colors"
            >
              Read the Docs
            </Link>
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
