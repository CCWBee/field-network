import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Web3Provider } from '@/lib/web3/provider';
import { ToastProvider } from '@/components/ui';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Field Network - Decentralized Real-World Data',
  description: 'A distributed network for verifiable real-world observations. Post tasks, collect proof, pay for results.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <Web3Provider>
          <ToastProvider>
            <div className="min-h-screen bg-surface">
              {children}
            </div>
          </ToastProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
