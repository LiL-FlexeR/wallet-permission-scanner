import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wallet Permission Scanner',
  description:
    'Inspect supported ERC-20 allowances on Ethereum mainnet using a public address. Read only, with explicit coverage and explainable exposure.',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // A nonce belongs to one response; a prerendered/cached shell cannot reuse it.
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
