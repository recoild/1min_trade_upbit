// components/UpbitTable.tsx (예시)
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // shadcn/ui Table 컴포넌트 경로

interface CoinData {
  market: string;
  korean_name: string;
  trade_volume_1m: number;
}

interface UpbitTableProps {
  data: CoinData[];
}

export function UpbitTable({ data }: UpbitTableProps) {
  return (
    <Table>
      <TableCaption>최근 1분 기준 거래량입니다.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[150px]">종목코드</TableHead>
          <TableHead>종목명</TableHead>
          <TableHead className="text-right">1분 거래량</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((coin) => (
          <TableRow key={coin.market}>
            <TableCell className="font-medium">{coin.market}</TableCell>
            <TableCell>{coin.korean_name || "정보 없음"}</TableCell>
            <TableCell className="text-right">{coin.trade_volume_1m.toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}