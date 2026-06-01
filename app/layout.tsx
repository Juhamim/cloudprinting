import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from '@/components/Providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'CloudPrint — Print from Anywhere',
  description:
    'Upload documents from any device and print to your USB printer at home or office — instantly, securely, from anywhere in the world.',
  keywords: ['cloud printing', 'remote print', 'USB printer', 'print from anywhere'],
  openGraph: {
    title: 'CloudPrint',
    description: 'Print from anywhere to your home printer',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-zinc-950 text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
