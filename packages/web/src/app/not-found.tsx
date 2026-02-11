import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-ink-900 mb-4">404</h1>
        <p className="text-ink-500 mb-8">Page not found.</p>
        <Link
          href="/"
          className="bg-field-500 text-white px-6 py-3 rounded-sm font-semibold hover:bg-field-400 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
