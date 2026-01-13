import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Web3Provider } from '@/lib/web3/provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <Web3Provider>
          <div className="min-h-screen bg-surface">
            {children}
          </div>
        </Web3Provider>
      </body>
    </html>
  );
}
