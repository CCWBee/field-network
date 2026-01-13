import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface bg-gradient-mesh flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="mb-8">
          <span className="text-8xl font-bold text-gradient">404</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">
          Page not found
        </h1>
        <p className="text-slate-600 mb-8 max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="bg-field-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-field-400 transition-colors glow-sm"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="glass-light text-slate-700 px-6 py-2 rounded-lg font-medium hover:bg-field-50 transition-colors border border-field-200"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
