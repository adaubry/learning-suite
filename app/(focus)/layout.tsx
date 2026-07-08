import { FocusShell } from "@/components/focus-shell";

export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <FocusShell>{children}</FocusShell>;
}
