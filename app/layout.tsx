import './globals.css';

export const metadata = {
  title: 'Voltix — Deriv Reshare Trading',
  description: 'Trade synthetic indices powered by Deriv',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
