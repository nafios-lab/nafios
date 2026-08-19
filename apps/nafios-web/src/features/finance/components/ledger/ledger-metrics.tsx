import { Card } from "@nafios/ui/components/ui/card";

export function LedgerMetrics() {
  return (
    <div className="grid grid-cols-5 gap-4 px-4 pb-4">
      <Card className="flex flex-col gap-3 rounded-xl  p-4 h-[100px] border-none"></Card>
      <Card className="flex flex-col gap-3 rounded-xl  p-4 h-[100px] border-none"></Card>
      <Card className="flex flex-col gap-3 rounded-xl  p-4 h-[100px] border-none"></Card>
      <Card className="flex flex-col gap-3 rounded-xl  p-4 h-[100px] border-none"></Card>
      <Card className="flex flex-col gap-3 rounded-xl  p-4 h-[100px] border-none"></Card>
    </div>
  );
}
