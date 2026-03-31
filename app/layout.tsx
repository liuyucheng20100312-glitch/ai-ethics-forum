import "./globals.css";
import { LanguageProvider } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import Navbar from "@/components/Navbar";
import FloatingFeedback from "@/components/FloatingFeedback";

export const metadata = {
  title: "广东碧桂园学校 AI 伦理论坛",
  description: "广东碧桂园学校学生 AI 伦理讨论平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors">
        <ThemeProvider>
          <AuthProvider>
            <LanguageProvider>
              <Navbar />
              <main className="max-w-7xl mx-auto px-6 py-8">
                {children}
              </main>
              <FloatingFeedback />
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
