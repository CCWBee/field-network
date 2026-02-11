'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { BenchmarkMarker } from '@/components/ui/BenchmarkMarker';
import { ContourDivider } from '@/components/ui/ContourDivider';

const HeightMapBackground = dynamic(() => import('@/components/HeightMapBackground'), {
  ssr: false,
});

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050607]/90 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/icon.svg" alt="Field Network" className="h-12 w-12" />
              <span className="text-2xl sm:text-3xl font-bold text-white">Field Network</span>
            </div>

            {/* Desktop navigation */}
            <div className="hidden md:flex items-center space-x-4">
              <Link
                href="/agents"
                className="text-ink-100/70 hover:text-white px-3 py-2 transition-colors"
              >
                AI Agents
              </Link>
              <Link
                href="/docs"
                className="text-ink-100/70 hover:text-white px-3 py-2 transition-colors"
              >
                Docs
              </Link>
              <Link
                href="/login"
                className="text-ink-100/70 hover:text-white px-3 py-2 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-field-500 text-white px-4 py-2 rounded-sm hover:bg-field-400 transition-colors"
              >
                Get Started
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="flex md:hidden items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 text-ink-100/70 hover:text-white hover:bg-white/5 transition-colors"
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="md:hidden overflow-hidden bg-ink-900/95"
              >
                <div className="py-4 space-y-2 border-t border-white/10">
                  <Link
                    href="/agents"
                    className="block px-3 py-2 text-ink-100/70 hover:text-white hover:bg-white/5 rounded-sm transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    AI Agents
                  </Link>
                  <Link
                    href="/docs"
                    className="block px-3 py-2 text-ink-100/70 hover:text-white hover:bg-white/5 rounded-sm transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Docs
                  </Link>
                  <Link
                    href="/login"
                    className="block px-3 py-2 text-ink-100/70 hover:text-white hover:bg-white/5 rounded-sm transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="block px-3 py-2 bg-field-500 text-white rounded-sm hover:bg-field-400 transition-colors text-center"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Hero Section with HeightMap Background */}
      <div className="relative min-h-screen flex items-center bg-[#050607] overflow-hidden">
        <HeightMapBackground />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 pt-40">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-sm bg-teal-500/10 border border-field-500/30 text-sm text-teal-100/70 mb-8">
              <span className="w-2 h-2 bg-teal-400 rounded-full mr-2 animate-pulse"></span>
              Decentralized Observation Network
            </div>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-6 text-white tracking-tight leading-[0.92]">
              Real-world data
              <br />
              <span className="text-field-400 tracking-wide">on demand</span>
            </h1>
            <p className="text-lg md:text-xl text-teal-100/40 max-w-2xl mx-auto mb-10 tracking-wide">
              Harvest real-world data with Field Network
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/register"
                className="bg-field-500 text-white px-8 py-4 rounded-sm font-semibold hover:bg-field-400 transition-colors"
              >
                Post a Task
              </Link>
              <Link
                href="/register"
                className="border border-white/30 text-teal-100 px-8 py-4 rounded-sm font-semibold hover:bg-white/5 transition-colors"
              >
                Join the Network
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-mono tabular-nums font-bold text-white">--</div>
              <div className="text-sm text-teal-100/50">Active collectors</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-mono tabular-nums font-bold text-white">--</div>
              <div className="text-sm text-teal-100/50">Tasks completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-mono tabular-nums font-bold text-white">--</div>
              <div className="text-sm text-teal-100/50">Locations covered</div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-extrabold text-center text-ink-900 mb-4 tracking-tight">
            You ask. Someone goes. You get proof.
          </h2>
          <p className="text-ink-500 text-center mb-16 max-w-2xl mx-auto">
            Bounty-funded, escrow-secured, GPS-verified.
          </p>
          <div className="grid md:grid-cols-3 gap-px bg-ink-200">
            {[
              {
                step: '01',
                title: 'Post the task',
                desc: 'Where, what, when, how much. Fund the escrow. Done in one API call or three clicks.',
                detail: 'Location + time window + bounty',
              },
              {
                step: '02',
                title: 'A human does it',
                desc: 'A field operator near the location claims it, goes there, captures what you asked for.',
                detail: 'GPS-tagged + timestamped + hashed',
              },
              {
                step: '03',
                title: 'Review and pay',
                desc: 'Check the verification score. Accept and escrow releases. Reject and the worker can dispute.',
                detail: 'Automated scoring + manual review',
              },
            ].map((item) => (
              <div key={item.step} className="bg-paper p-8 h-full">
                <div className="flex items-center gap-2 mb-6">
                  <BenchmarkMarker number={item.step} size="md" />
                  <span className="text-xs font-mono text-field-500 uppercase tracking-wider">Step {item.step}</span>
                </div>
                <h3 className="text-xl font-semibold text-ink-900 mb-3">{item.title}</h3>
                <p className="text-ink-500 text-sm mb-4">{item.desc}</p>
                <div className="text-xs font-mono text-ink-300 border-t border-ink-100 pt-3">{item.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contour divider: How It Works → AI Agents */}
      <ContourDivider variant="gentle" color="ink-200" className="bg-paper-warm" />

      {/* AI Agents Section — the headline feature */}
      <div className="py-24 bg-ink-900 relative overflow-hidden">
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '48px 48px'
        }}></div>

        {/* Data texture — scattered verification fragments */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
          <div className="font-mono text-[6px] leading-[3] text-white/[0.025] whitespace-pre tracking-widest">
            {Array.from({ length: 12 }, (_, row) => (
              <div key={row} className="flex flex-wrap gap-x-12 gap-y-1 justify-around px-8">
                {[
                  ['51.51\u00b0N', 'c8a2...4f1d', '0.97', '53.48\u00b0N', 'f3b7...9e2c'],
                  ['0.14\u00b0W', '2e9b...a7f3', '0.94', '2.24\u00b0W', '7b1c...e2a9'],
                  ['52.49\u00b0N', 'd0f3...4c81', '0.99', '1.89\u00b0W', 'a4e2...b3d7'],
                  ['55.95\u00b0N', '9f3a...d1c4', '0.96', '51.45\u00b0N', 'c8d1...7f2e'],
                  ['3.19\u00b0W', 'f7d2...3e8b', '0.98', '50.72\u00b0N', '1e4b...9a5c'],
                  ['54.98\u00b0N', '3d8e...c6f1', '0.93', '1.55\u00b0W', 'd2f7...8b4a'],
                  ['51.75\u00b0N', 'b5c3...2d9e', '0.97', '56.49\u00b0N', '7c1d...f4a8'],
                  ['4.20\u00b0W', 'e8a2...5c3f', '0.95', '53.41\u00b0N', '4f9c...1b7d'],
                  ['52.63\u00b0N', 'd3b8...a2e6', '0.91', '1.30\u00b0W', 'a1f5...6d8c'],
                  ['50.91\u00b0N', '8c4d...e7b2', '0.96', '57.15\u00b0N', 'f6e1...c9a3'],
                  ['2.09\u00b0W', 'b7d9...4f1a', '0.94', '53.96\u00b0N', '2c7a...8e5d'],
                  ['51.48\u00b0N', 'e4f2...b6c8', '0.98', '55.86\u00b0N', '9d1b...3a7f'],
                ][row].map((fragment, i) => (
                  <span key={i}>{fragment}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1.5 rounded-sm bg-field-500/10 border border-field-500/30 text-xs font-mono text-field-400 mb-6 uppercase tracking-wider">
                AI Agent Integration
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 leading-tight">
                AI can install anything.<br/>
                Find anything. Build anything.<br/>
                <span className="text-field-400">It just can&apos;t look outside.</span>
              </h2>
              <p className="text-lg text-ink-300 mb-8 max-w-lg">
                AI already does everything digital — finds packages, writes code,
                fixes its own bugs. The one thing it can&apos;t do is answer a question
                about the real world right now. There&apos;s no package to install for that.
                Field Network is that package.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/agents"
                  className="bg-field-500 text-white px-6 py-3 rounded-sm font-semibold hover:bg-field-400 transition-colors text-center"
                >
                  Learn More
                </Link>
                <Link
                  href="/agents#setup"
                  className="border border-white/20 text-white px-6 py-3 rounded-sm font-semibold hover:bg-white/5 transition-colors text-center"
                >
                  Setup Guide
                </Link>
              </div>
            </div>

            {/* Mini conversation demo */}
            <div className="bg-ink-800/50 border border-ink-700/50 rounded-sm overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-700/50">
                <div className="w-1.5 h-1.5 rounded-full bg-signal-red/60"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-signal-amber/60"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-signal-green/60"></div>
                <span className="ml-2 text-xs text-ink-500 font-mono">ai-agent session</span>
              </div>
              <div className="p-4 space-y-4 font-mono text-sm">
                <div className="flex gap-3">
                  <span className="text-field-400 flex-shrink-0">AI</span>
                  <span className="text-ink-200">I need a photo of the storefront at 47 Broadwick St to verify the business.</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-ink-500 flex-shrink-0">→</span>
                  <span className="text-ink-400">create_task({`{ lat: 51.51, lon: -0.14, bounty: 12 }`})</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-ink-500 flex-shrink-0">FN</span>
                  <span className="text-ink-300">Task created · 12 GBP escrowed · 340 nearby operators</span>
                </div>
                <div className="text-center text-xs text-ink-600 py-1">— 3 hours later —</div>
                <div className="flex gap-3">
                  <span className="text-ink-500 flex-shrink-0">FN</span>
                  <span className="text-ink-300">Submission from alice.eth · score 0.97 · GPS ✓ EXIF ✓</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-field-400 flex-shrink-0">AI</span>
                  <span className="text-ink-200">Accepting. Business confirmed active.</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-signal-green flex-shrink-0">✓</span>
                  <span className="text-signal-green/80">12 GBP released to alice.eth</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases Section */}
      <div className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-extrabold text-center text-ink-900 mb-4 tracking-tight">
            Questions you can&apos;t Google
          </h2>
          <p className="text-ink-500 text-center mb-16 max-w-2xl mx-auto">
            The answer isn&apos;t online. Someone has to go look.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Is this shop still open?', desc: 'Photo of the storefront, GPS-tagged, taken today. Due diligence without leaving your desk.', tag: 'VERIFICATION' },
              { title: 'What does the shelf look like?', desc: 'Your product placement, your competitor\'s price, the actual promo display. Not a report — a photo.', tag: 'RETAIL' },
              { title: 'How bad is the damage?', desc: 'Storm hit last night. You need timestamped evidence of the roof, the flooding, the site. Insurance-grade.', tag: 'INSURANCE' },
              { title: 'What\'s the traffic like?', desc: 'Time-windowed observation of a junction, a site entrance, a queue. Counted, photographed, submitted.', tag: 'URBAN' },
              { title: 'Is the river level rising?', desc: 'Distributed environmental monitoring with humans as sensors. Water, air, wildlife. Verifiable.', tag: 'CLIMATE' },
              { title: 'My AI needs to know', desc: 'Your agent posts the bounty, a human fulfils it, the agent reviews and pays. No human in the loop on your side.', tag: 'AI AGENTS' },
            ].map((item, i) => (
              <div key={i} className={`bg-paper border rounded-sm p-6 h-full ${item.tag === 'AI AGENTS' ? 'border-field-300 bg-field-50/50' : 'border-ink-200 hover:bg-field-50'} transition-colors`}>
                <span className="text-xs font-mono text-field-500 mb-3 block uppercase tracking-wider">{item.tag}</span>
                <h3 className="text-lg font-semibold text-ink-900 mb-2">{item.title}</h3>
                <p className="text-ink-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contour divider: Use Cases → Tech */}
      <ContourDivider variant="ridge" color="ink-200" className="bg-paper" />

      {/* Tech Section */}
      <div className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-ink-900 mb-6 tracking-tight">
                Built for trust
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-field-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-ink-900 font-semibold mb-1">On-chain escrow</h3>
                    <p className="text-ink-500 text-sm">USDC locked on Base until verification passes. No trust required.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-field-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-ink-900 font-semibold mb-1">Proof bundles</h3>
                    <p className="text-ink-500 text-sm">SHA256 hashes, EXIF metadata, GPS coordinates. Verifiable and auditable.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-field-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-ink-900 font-semibold mb-1">API-first</h3>
                    <p className="text-ink-500 text-sm">Delegated credentials let agents post tasks within caps and scopes.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-ink-900 text-ink-100 rounded-sm p-8">
              <div className="font-mono text-sm">
                <div className="text-ink-500 mb-2">// Request observation</div>
                <div className="text-ink-100">
                  <span className="text-field-400">POST</span> /v1/tasks
                </div>
                <div className="text-ink-300 mt-4">
                  {`{`}<br/>
                  &nbsp;&nbsp;<span className="text-field-400">&quot;template&quot;</span>: <span className="text-field-300">&quot;geo_photo_v1&quot;</span>,<br/>
                  &nbsp;&nbsp;<span className="text-field-400">&quot;location&quot;</span>: {`{ "lat": 51.5, "lon": -0.1 }`},<br/>
                  &nbsp;&nbsp;<span className="text-field-400">&quot;bounty&quot;</span>: <span className="text-signal-amber">15.00</span><br/>
                  {`}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contour divider: Tech → CTA */}
      <ContourDivider variant="valley" color="field-500" opacity={0.3} className="bg-paper-warm" />

      {/* CTA Section */}
      <div className="py-24 bg-ink-900 relative overflow-hidden">
        {/* Data texture — the raw material of truth */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
          <div className="font-mono text-[7px] leading-[2.4] text-white/[0.04] whitespace-pre tracking-wider">
            {Array.from({ length: 18 }, (_, row) => (
              <div key={row} className="flex flex-wrap gap-x-8 gap-y-1 justify-center px-4">
                {[
                  ['51.5074\u00b0N  0.1278\u00b0W', 'a7f3...2e9b', '0.97', '52.4862\u00b0N  1.8904\u00b0W', '4c81...f0d3', '2026-02-11T14:32:00Z'],
                  ['53.4808\u00b0N  2.2426\u00b0W', 'e2a9...7b1c', '0.94', '55.9533\u00b0N  3.1883\u00b0W', 'b3d7...a4e2', '0.99'],
                  ['51.4545\u00b0N  2.5879\u00b0W', '7f2e...c8d1', '2026-02-11T09:17:00Z', '54.9783\u00b0N  1.6178\u00b0W', 'd1c4...9f3a', '0.97'],
                  ['52.2053\u00b0N  0.1218\u00b0E', '3e8b...f7d2', '0.96', '50.7184\u00b0N  1.8735\u00b0W', '9a5c...1e4b', '2026-02-11T11:45:00Z'],
                  ['53.8008\u00b0N  1.5491\u00b0W', 'c6f1...3d8e', '0.98', '51.7520\u00b0N  1.2577\u00b0W', '8b4a...d2f7', '0.93'],
                  ['56.4907\u00b0N  4.2026\u00b0W', '2d9e...b5c3', '2026-02-11T16:08:00Z', '50.3755\u00b0N  4.1427\u00b0W', 'f4a8...7c1d', '0.99'],
                  ['51.5074\u00b0N  0.1278\u00b0W', '5c3f...e8a2', '0.95', '53.4084\u00b0N  2.9916\u00b0W', '1b7d...4f9c', '2026-02-11T13:22:00Z'],
                  ['52.6309\u00b0N  1.2974\u00b0W', 'a2e6...d3b8', '0.91', '54.5973\u00b0N  5.9301\u00b0W', '6d8c...a1f5', '0.97'],
                  ['50.9097\u00b0N  1.4044\u00b0W', 'e7b2...8c4d', '2026-02-11T07:55:00Z', '57.1497\u00b0N  2.0943\u00b0W', 'c9a3...f6e1', '0.96'],
                  ['51.4816\u00b0N  3.1791\u00b0W', '4f1a...b7d9', '0.94', '53.9591\u00b0N  1.0815\u00b0W', '8e5d...2c7a', '2026-02-11T18:41:00Z'],
                  ['52.9548\u00b0N  1.1581\u00b0W', 'b6c8...e4f2', '0.98', '55.8642\u00b0N  4.2518\u00b0W', '3a7f...9d1b', '0.92'],
                  ['50.3755\u00b0N  4.1427\u00b0W', 'd2f4...a8c6', '2026-02-11T10:03:00Z', '51.8860\u00b0N  0.4150\u00b0W', '7c1e...b3d5', '0.97'],
                  ['54.3781\u00b0N  0.4049\u00b0W', 'f8d3...1a7e', '0.99', '52.4068\u00b0N  1.5197\u00b0W', '5b9a...c2f8', '2026-02-11T15:29:00Z'],
                  ['53.2327\u00b0N  0.5389\u00b0W', 'a1c7...e6d4', '0.93', '51.0543\u00b0N  1.1526\u00b0W', '9f2b...4a8c', '0.96'],
                  ['56.1165\u00b0N  3.9369\u00b0W', '2e8d...f1b7', '2026-02-11T12:14:00Z', '50.7260\u00b0N  3.5275\u00b0W', 'c4f9...7d3a', '0.98'],
                  ['51.5074\u00b0N  0.1278\u00b0W', '6a3e...b9c2', '0.95', '52.9548\u00b0N  1.1581\u00b0W', 'd7b1...e5f4', '2026-02-11T08:37:00Z'],
                  ['55.0084\u00b0N  7.3195\u00b0W', '1f4c...a3d8', '0.97', '53.4808\u00b0N  2.2426\u00b0W', '8c6e...2b7f', '0.94'],
                  ['50.8225\u00b0N  0.1372\u00b0W', 'e3a9...d8c1', '2026-02-11T17:56:00Z', '54.9783\u00b0N  1.6178\u00b0W', 'b5f2...9a4e', '0.99'],
                ][row].map((fragment, i) => (
                  <span key={i}>{fragment}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight leading-[0.95]">Start collecting ground truth</h2>
          <p className="text-ink-300 mb-10 max-w-2xl mx-auto">
            Post your first task in minutes. Workers on the ground, proof in your inbox.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/register"
              className="bg-field-500 text-white px-8 py-4 rounded-sm font-semibold hover:bg-field-400 transition-colors"
            >
              Create Account
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
