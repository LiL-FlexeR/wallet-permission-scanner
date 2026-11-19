import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wallet Permission Scanner',
  description:
    'Inspect supported ERC-20 allowances on Ethereum mainnet using a public address. Read only, with explicit coverage and explainable exposure.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
