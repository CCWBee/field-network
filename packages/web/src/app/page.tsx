'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-gradient">Field Network</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/login"
                className="text-slate-600 hover:text-field-600 px-3 py-2 transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="bg-field-500 text-white px-4 py-2 rounded-lg hover:bg-field-400 transition-colors glow-sm"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center bg-gradient-mesh">
        <div className="absolute inset-0 bg-surface/50"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 pt-40">
          <div className="text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-full glass-light text-sm text-slate-600 mb-8">
              <span className="w-2 h-2 bg-field-400 rounded-full mr-2 animate-pulse"></span>
              Decentralized observation network
            </div>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-slate-800">
              Real-world data
              <br />
              <span className="text-gradient">on demand</span>
            </h1>
            <p className="text-xl md:text-2xl text-slate-600 max-w-3xl mx-auto mb-10">
              A distributed network of collectors gathering verifiable observations.
              Post tasks, set bounties, get proof.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link
                href="/register"
                className="bg-field-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-field-400 transition-all glow-sm hover:glow-md"
              >
                Post a Task
              </Link>
              <Link
                href="/register"
                className="glass-light text-slate-700 px-8 py-4 rounded-lg font-semibold hover:bg-field-50 transition-colors border border-field-200"
              >
                Join the Network
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-800">--</div>
              <div className="text-sm text-slate-500">Active collectors</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-800">--</div>
              <div className="text-sm text-slate-500">Tasks completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-slate-800">--</div>
              <div className="text-sm text-slate-500">Locations covered</div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="py-24 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-4">
            How it works
          </h2>
          <p className="text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            Three steps from question to verified answer
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="glass rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-field-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-field-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-4">1. Define</h3>
              <p className="text-slate-600">
                Specify location, time window, requirements, and bounty.
                Fund escrow with USDC.
              </p>
            </div>
            <div className="glass rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-accent-cyan/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-4">2. Collect</h3>
              <p className="text-slate-600">
                Network collectors claim tasks, capture photos
                with verified timestamps and GPS.
              </p>
            </div>
            <div className="glass rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-accent-purple/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-4">3. Verify</h3>
              <p className="text-slate-600">
                Automated checks validate submissions.
                Accept and escrow releases payment.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Use Cases Section */}
      <div className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-slate-800 mb-4">
            Use cases
          </h2>
          <p className="text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            When you need eyes on the ground
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: 'Property & Insurance', desc: 'Storm damage, rebuild progress, occupancy verification', icon: '🏠' },
              { title: 'Construction', desc: 'Site progress, compliance checks, safety signage', icon: '🏗️' },
              { title: 'Retail', desc: 'Shelf audits, price checks, promo compliance', icon: '🏪' },
              { title: 'Logistics', desc: 'Gate status, queue length, delivery conditions', icon: '📦' },
              { title: 'Environment', desc: 'Pollution readings, drainage, wildlife surveys', icon: '🌿' },
              { title: 'Research', desc: 'Fieldwork data, standardized measurements', icon: '🔬' },
            ].map((item, i) => (
              <div key={i} className="glass-light rounded-xl p-6 hover:bg-field-50 transition-colors">
                <span className="text-2xl mb-3 block">{item.icon}</span>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech Section */}
      <div className="py-24 bg-surface-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-800 mb-6">
                Built for trust
              </h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-field-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-field-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-slate-800 font-semibold mb-1">On-chain escrow</h3>
                    <p className="text-slate-600 text-sm">USDC locked on Base until verification passes. No trust required.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-accent-cyan/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-slate-800 font-semibold mb-1">Proof bundles</h3>
                    <p className="text-slate-600 text-sm">SHA256 hashes, EXIF metadata, GPS coordinates. Verifiable and auditable.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-accent-purple/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-slate-800 font-semibold mb-1">API-first</h3>
                    <p className="text-slate-600 text-sm">Delegated credentials let agents post tasks within caps and scopes.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="glass rounded-2xl p-8">
              <div className="font-mono text-sm">
                <div className="text-slate-500 mb-2">// Request observation</div>
                <div className="text-slate-800">
                  <span className="text-accent-purple">POST</span> /v1/tasks
                </div>
                <div className="text-slate-600 mt-4">
                  {`{`}<br/>
                  &nbsp;&nbsp;<span className="text-field-400">"template"</span>: <span className="text-accent-cyan">"geo_photo_v1"</span>,<br/>
                  &nbsp;&nbsp;<span className="text-field-400">"location"</span>: {`{ "lat": 51.5, "lon": -0.1 }`},<br/>
                  &nbsp;&nbsp;<span className="text-field-400">"bounty"</span>: <span className="text-accent-orange">15.00</span><br/>
                  {`}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-24 bg-gradient-mesh relative">
        <div className="absolute inset-0 bg-surface/80"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-slate-800 mb-4">Join the network</h2>
          <p className="text-slate-600 mb-10 max-w-2xl mx-auto">
            Start collecting real-world data or become a field operator earning bounties.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/register"
              className="bg-field-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-field-400 transition-all glow-sm hover:glow-md"
            >
              Create Account
            </Link>
            <Link
              href="#"
              className="glass-light text-slate-800 px-8 py-4 rounded-lg font-semibold hover:bg-field-50 transition-colors"
            >
              Read the Docs
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-surface-50 border-t border-surface-200 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-gradient font-bold">Field Network</span>
            <div className="flex space-x-6">
              <a href="#" className="text-slate-500 hover:text-slate-600 transition-colors">API</a>
              <a href="#" className="text-slate-500 hover:text-slate-600 transition-colors">Docs</a>
              <a href="#" className="text-slate-500 hover:text-slate-600 transition-colors">Terms</a>
              <a href="#" className="text-slate-500 hover:text-slate-600 transition-colors">Privacy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
