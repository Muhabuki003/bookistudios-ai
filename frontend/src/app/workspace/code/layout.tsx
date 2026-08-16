import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

export default function CodeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PromptInputProvider>{children}</PromptInputProvider>;
}
