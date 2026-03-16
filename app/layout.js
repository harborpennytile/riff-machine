import "./globals.css";

export const metadata = {
  title: "Riff Machine",
  description: "Creative discovery engine — find connections across art, music, philosophy, finance, food, nature, tech, and more.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
