import "./globals.css";

export const metadata = {
  title: "Riff Machine - AI Creative Discovery Engine",
  description: "Enter seed ideas, discover unexpected connections across art, music, philosophy, finance, food, and more. Find real articles, songs, books, and people. Synthesize emergent themes. Export to Markdown for Substack and Medium.",
  keywords: ["creative discovery", "AI research tool", "idea generation", "cross-domain connections", "riff machine", "synthesis engine"],
  openGraph: {
    title: "Riff Machine - AI Creative Discovery Engine",
    description: "Discover unexpected connections across art, music, philosophy, finance, and more. Powered by Claude.",
    type: "website",
    siteName: "Riff Machine",
  },
  twitter: {
    card: "summary_large_image",
    title: "Riff Machine - AI Creative Discovery Engine",
    description: "Discover unexpected connections across art, music, philosophy, finance, and more.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Riff Machine",
              "description": "AI-powered creative discovery engine. Enter seed ideas, discover real articles, music, art, books, and people that connect in surprising ways. Synthesize emergent themes across domains.",
              "applicationCategory": "CreativeWork",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Organization",
                "name": "Riff Machine"
              }
            })
          }}
        />
        {children}
      </body>
    </html>
  );
}
