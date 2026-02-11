import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Development Platform",
  description:
    "Dashboard for the AI Development Framework - progress, scores, alerts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          backgroundColor: "#0a0a0a",
          color: "#ededed",
          minHeight: "100vh",
        }}
      >
        <header
          style={{
            borderBottom: "1px solid #222",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "20px", fontWeight: 700 }}>
            AI Development Platform
          </span>
          <span
            style={{
              fontSize: "12px",
              color: "#666",
              border: "1px solid #333",
              borderRadius: "4px",
              padding: "2px 8px",
            }}
          >
            v0.1.0
          </span>
        </header>
        <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
