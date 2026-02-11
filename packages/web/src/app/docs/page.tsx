import Link from 'next/link';

const links = [
  { href: '/api', title: 'API Overview', desc: 'Endpoints and example requests.' },
  { href: '/terms', title: 'Terms of Service', desc: 'Platform terms and marketplace rules.' },
  { href: '/privacy', title: 'Privacy Policy', desc: 'How data is collected and used.' },
  { href: '/usage', title: 'Acceptable Use', desc: 'Safety and integrity guidelines.' },
  { href: '/eula', title: 'EULA', desc: 'Software license terms.' },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-paper py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold text-ink-900">Field Network Docs</h1>
          <p className="text-ink-500 mt-2">Reference material for builders, requesters, and collectors.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="bg-paper rounded-sm border border-ink-200 p-6 hover:border-field-500/30 transition-colors">
              <h2 className="text-lg font-semibold text-ink-900">{link.title}</h2>
              <p className="text-sm text-ink-500 mt-2">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
