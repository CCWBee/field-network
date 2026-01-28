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
    <div className="min-h-screen bg-surface py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold text-slate-800">Field Network Docs</h1>
          <p className="text-slate-500 mt-2">Reference material for builders, requesters, and collectors.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="glass rounded-lg border border-surface-200 p-6 hover:shadow-md transition-shadow">
              <h2 className="text-lg font-semibold text-slate-800">{link.title}</h2>
              <p className="text-sm text-slate-500 mt-2">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
