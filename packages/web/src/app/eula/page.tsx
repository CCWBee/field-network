import { promises as fs } from 'fs';
import path from 'path';

export default async function EulaPage() {
  const filePath = path.resolve(process.cwd(), '..', '..', 'EULA.md');
  const content = await fs.readFile(filePath, 'utf8');

  return (
    <div className="min-h-screen bg-paper py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-ink-900">End User License Agreement</h1>
        <p className="text-ink-500 mt-2">Full software license terms for Field Network.</p>
        <pre className="mt-10 whitespace-pre-wrap text-sm text-ink-700 leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}
