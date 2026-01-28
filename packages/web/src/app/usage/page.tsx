import { promises as fs } from 'fs';
import path from 'path';

export default async function UsagePage() {
  const filePath = path.resolve(process.cwd(), '..', '..', 'USAGE-POLICY.md');
  const content = await fs.readFile(filePath, 'utf8');

  return (
    <div className="min-h-screen bg-surface py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-slate-800">Acceptable Use Policy</h1>
        <p className="text-slate-500 mt-2">Full usage policy for Field Network.</p>
        <pre className="mt-10 whitespace-pre-wrap text-sm text-slate-600 leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}
