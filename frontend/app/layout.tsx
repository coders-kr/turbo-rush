import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL('https://turbo-rush.coders.kr'),
  title: 'Turbo Rush — Original Web Kart',
  description: '드리프트와 부스터로 질주하는 오리지널 3D 웹 카트 레이싱 게임',
  openGraph: {
    title: 'Turbo Rush — Original Web Kart',
    description: '드리프트와 부스터로 질주하는 오리지널 3D 웹 카트 레이싱 게임',
    images: ['/og.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Turbo Rush — Original Web Kart',
    description: '절벽 위 서킷에서 펼쳐지는 오리지널 아케이드 카트 레이스',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
