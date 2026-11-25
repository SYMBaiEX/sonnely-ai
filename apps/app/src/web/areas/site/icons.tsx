// spec/app/site/index.md, "Story: Check the service status"
import {
  Activity,
  Box,
  Boxes,
  Code2,
  Container,
  Cpu,
  CreditCard,
  Fingerprint,
  Radio,
  ReceiptText,
  Send,
  Terminal,
  Wallet,
} from "lucide-react";

const icons = {
  Activity,
  Box,
  Boxes,
  Code2,
  Container,
  Cpu,
  CreditCard,
  Fingerprint,
  Radio,
  ReceiptText,
  Send,
  Terminal,
  Wallet,
} as const;

export function ProductIcon({ name, size }: { name: string; size: number }) {
  const Icon = (icons as Record<string, (typeof icons)[keyof typeof icons]>)[name] ?? Box;
  return <Icon size={size} aria-hidden="true" />;
}
