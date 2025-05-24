// app/page.tsx

'use client'; // 클라이언트 컴포넌트로 명시

import { useEffect, useState, useRef } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
// import { Badge } from "@/components/ui/badge"; // Badge는 현재 사용되지 않으므로 주석 처리 또는 제거 가능

// 초기 마켓 정보 (한글명 등) - REST API로 가져옴
interface MarketInfo {
  market: string; // 예: "KRW-BTC"
  korean_name: string;
  english_name: string;
}

// 테이블에 표시될 데이터 구조
interface CoinDisplayData {
  market_code: string;            // 예: "KRW-BTC"
  korean_name: string;
  trade_price: number;            // 현재가 (KRW)
  signed_change_rate: number;     // 등락률
  acc_trade_price_24h: number;    // API에서 직접 제공하는 24H 누적 거래대금 (KRW) - 참고용
  trade_price_1min_krw?: number;  // 계산된 1분 거래대금 (KRW)
}

// 웹소켓 중계 서버로부터 수신하는 Ticker 데이터 타입
interface UpbitRelayedTickerData {
  type: "ticker";
  code: string;                   // 마켓 코드
  korean_name?: string;           // 중계 서버가 추가해줄 수 있는 한글명
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  prev_closing_price: number;
  acc_trade_price: number;
  acc_trade_price_24h: number;   // 24시간 누적 거래대금 (KRW)
  acc_trade_volume: number;
  acc_trade_volume_24h: number;
  trade_volume: number;
  signed_change_price: number;
  signed_change_rate: number;    // 이 값을 등락률로 사용
  change: "RISE" | "EVEN" | "FALL";
  change_price: number;
  change_rate: number;
  ask_bid: "ASK" | "BID";
  trade_date: string;
  trade_time: string;
  trade_timestamp: number;
  timestamp: number;             // 수신 타임스탬프 (1분 계산 기준)
  stream_type?: "SNAPSHOT" | "REALTIME";
}

// 1분 거래대금 계산을 위한 기록 타입
type VolumeHistoryEntry = { ts: number; acc_price: number }; // (타임스탬프, 누적 거래대금)
type VolumeHistoryType = Record<string, VolumeHistoryEntry[]>;

// 업비트 REST API를 통해 초기 마켓 정보(한글명 등)를 가져오는 함수
async function getInitialMarketInfo(): Promise<MarketInfo[]> {
  try {
    const response = await fetch('https://api.upbit.com/v1/market/all?isDetails=false');
    if (!response.ok) {
      console.error('[CLIENT] Failed to fetch market info from Upbit API:', response.status);
      return [];
    }
    const data: any[] = await response.json();
    return data
      .filter(m => m.market.startsWith('KRW-')) // KRW 마켓만 필터링
      .map(m => ({
        market: m.market,
        korean_name: m.korean_name,
        english_name: m.english_name,
      }));
  } catch (error) {
    console.error('[CLIENT] Error fetching initial market info:', error);
    return [];
  }
}

export default function HomePage() {
  const [marketDetails, setMarketDetails] = useState<Record<string, MarketInfo>>({});
  const [coinDisplayData, setCoinDisplayData] = useState<Record<string, CoinDisplayData>>({});
  const ws = useRef<WebSocket | null>(null);
  const volumeHistoryRef = useRef<VolumeHistoryType>({});

  const [isInitialPriming, setIsInitialPriming] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialPrimingAttemptedRef = useRef(false); // 카운트다운 중복 시작 방지

  // 1. 초기 마켓 정보 로드
  useEffect(() => {
    const fetchMarketDetails = async () => {
      console.log('[CLIENT] Fetching initial market details...');
      const infoArray = await getInitialMarketInfo();
      const details: Record<string, MarketInfo> = {};
      const initialDisplayData: Record<string, CoinDisplayData> = {};

      infoArray.forEach(market => {
        details[market.market] = market;
        initialDisplayData[market.market] = {
          market_code: market.market,
          korean_name: market.korean_name,
          trade_price: 0,
          signed_change_rate: 0,
          acc_trade_price_24h: 0,
          trade_price_1min_krw: undefined,
        };
      });
      setMarketDetails(details);
      setCoinDisplayData(initialDisplayData);
      console.log(`[CLIENT] Initial market details loaded for ${infoArray.length} markets.`);
    };
    fetchMarketDetails();
  }, []);

  // 2. 웹소켓 연결 및 관리 (marketDetails 로드 후 실행)
  useEffect(() => {
    if (Object.keys(marketDetails).length === 0) {
      console.log('[CLIENT] Market details not ready, WebSocket connection deferred.');
      return;
    }

    // .env.local 파일에 NEXT_PUBLIC_WEBSOCKET_RELAY_URL=wss://ws.recoild-toy.xyz/ 와 같이 설정
    const RELAY_SERVER_URL = process.env.NEXT_PUBLIC_WEBSOCKET_RELAY_URL || 'ws://localhost:8080'; 
    
    console.log(`[CLIENT] Setting up WebSocket connection to: ${RELAY_SERVER_URL}`);
    ws.current = new WebSocket(RELAY_SERVER_URL);

    ws.current.onopen = () => {
      console.log(`[CLIENT] 🚀 Successfully connected to WebSocket relay server: ${RELAY_SERVER_URL}`);
      if (!initialPrimingAttemptedRef.current && !isInitialPriming) {
        // onopen 시점에 coinDisplayData를 직접 참조하면 stale closure 문제가 있을 수 있으므로,
        // 프라이밍 시도 여부(initialPrimingAttemptedRef)만으로 판단하거나,
        // 또는 별도의 useEffect에서 isConnected 상태를 기반으로 프라이밍을 시작하는 것도 방법입니다.
        // 여기서는 ref를 사용하여 한 번만 시도하도록 단순화합니다.
        console.log('[CLIENT] Attempting to start initial 60s data priming countdown.');
        setIsInitialPriming(true);
        setCountdown(60);
        initialPrimingAttemptedRef.current = true;
      }
    };

    ws.current.onmessage = (event: MessageEvent) => {
      try {
        const receivedData = JSON.parse(event.data as string) as UpbitRelayedTickerData;

        if (receivedData.type === 'ticker' && marketDetails[receivedData.code]) {
          const code = receivedData.code;
          const currentTime = receivedData.timestamp;
          const currentAccPrice = receivedData.acc_trade_price_24h;

          if (!volumeHistoryRef.current[code]) {
            volumeHistoryRef.current[code] = [];
          }
          const coinHistory = volumeHistoryRef.current[code];
          coinHistory.push({ ts: currentTime, acc_price: currentAccPrice });

          let tradePrice1MinKrw: number | undefined = undefined;
          let accPriceAt1MinAgo = -1;
          let latestValidPastTimestamp = -1;

          for (const entry of coinHistory) {
            if (currentTime - entry.ts >= 60000) {
              if (entry.ts > latestValidPastTimestamp) {
                latestValidPastTimestamp = entry.ts;
                accPriceAt1MinAgo = entry.acc_price;
              }
            }
          }

          if (accPriceAt1MinAgo !== -1) {
            tradePrice1MinKrw = Math.max(0, currentAccPrice - accPriceAt1MinAgo);
          }

          volumeHistoryRef.current[code] = coinHistory.filter(
            entry => currentTime - entry.ts < 70000 // 70초 데이터 유지
          );
          
          setCoinDisplayData(prevData => {
            const marketDetailInfo = marketDetails[code];
            const currentDisplayEntry = prevData[code] || {};
            const newEntry: CoinDisplayData = {
              market_code: code,
              korean_name: receivedData.korean_name || marketDetailInfo?.korean_name || currentDisplayEntry.korean_name || '',
              trade_price: receivedData.trade_price,
              signed_change_rate: receivedData.signed_change_rate,
              acc_trade_price_24h: currentAccPrice,
              trade_price_1min_krw: tradePrice1MinKrw !== undefined ? tradePrice1MinKrw : currentDisplayEntry.trade_price_1min_krw,
            };
            return { ...prevData, [code]: newEntry };
          });
        }
      } catch (e) {
        console.error('[CLIENT] Error processing message from relay server:', e, 'Raw data:', event.data);
      }
    };
    
    ws.current.onerror = (errorEvent) => {
      console.error(`[CLIENT] 😥 WebSocket relay connection error to ${RELAY_SERVER_URL}:`, errorEvent);
    };

    ws.current.onclose = (event) => {
      console.log(`[CLIENT] 👋 WebSocket relay connection closed. URL: ${RELAY_SERVER_URL}, Code: ${event.code}, Reason: ${event.reason}`);
      // 연결이 끊어졌을 때 initialPrimingAttemptedRef를 false로 리셋하여, 다음 연결 시 프라이밍을 다시 시도하게 할 수 있습니다.
      // initialPrimingAttemptedRef.current = false; // 필요에 따라 주석 해제
    };

    return () => {
      if (ws.current) {
        console.log('[CLIENT] Closing WebSocket connection due to useEffect cleanup.');
        ws.current.close();
      }
      // countdownIntervalRef는 카운트다운 useEffect에서 정리됩니다.
    };
  }, [marketDetails]); // 의존성 배열에서 coinDisplayData와 isInitialPriming 제거

  // 3. 카운트다운 로직
  useEffect(() => {
    if (isInitialPriming && countdown > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prevCount => prevCount - 1);
      }, 1000);
    } else if (countdown <= 0 && isInitialPriming) {
      console.log('[CLIENT] Countdown finished. Hiding countdown UI.');
      setIsInitialPriming(false);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    }
    return () => { // 이 useEffect가 unmount되거나 재실행되기 전에 interval 정리
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isInitialPriming, countdown]);

  const sortedCoinData = Object.values(coinDisplayData)
    .filter(coin => coin.korean_name)
    .sort((a, b) => (b.trade_price_1min_krw ?? -1) - (a.trade_price_1min_krw ?? -1));

  const isLoadingMarketDetails = Object.keys(marketDetails).length === 0;

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8 min-h-screen">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
          업비트 실시간 현황 💰
        </h1>
        <p className="text-lg text-muted-foreground mt-3">(1분 거래대금 기준 정렬)</p>
      </div>

      {isInitialPriming && (
        <div className="my-6 p-4 bg-card border rounded-lg shadow-sm max-w-md mx-auto">
          <p className="text-sm text-center text-primary font-medium mb-2">
            실시간 1분 거래대금 계산을 위해 초기 데이터를 수집 중입니다... ⏳
          </p>
          <Progress value={((60 - countdown) / 60) * 100} className="w-full h-3 transition-all duration-1000 ease-linear" />
          <p className="text-xs text-center text-muted-foreground mt-1">
            {countdown > 0 ? `${countdown}초 남음` : "데이터 수집 완료!"}
          </p>
        </div>
      )}
      
      {isLoadingMarketDetails ? (
        <div className="text-center py-10">
          <div role="status" className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]">
            <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
          </div>
          <p className="mt-3 text-lg text-muted-foreground">마켓 기본 정보를 불러오는 중입니다...</p>
        </div>
      ) : (
        <Card className="shadow-xl">
          <CardHeader className="pb-4 pt-6">
            <CardTitle className="text-2xl font-semibold">실시간 시세 TOP 🔥</CardTitle>
            <CardDescription>
              {sortedCoinData.length === 0 && !isInitialPriming ? "데이터가 없거나 모든 데이터 수신 대기 중입니다..." : "업비트 KRW 마켓 (1분 거래대금 활발 순)"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[640px]"> 
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/60">
                    <TableHead className="w-[100px] sm:w-[120px] sticky left-0 bg-muted/50 z-20 px-3 py-3.5 text-xs sm:text-sm font-semibold">종목코드</TableHead>
                    <TableHead className="min-w-[100px] sticky left-[100px] sm:left-[120px] bg-muted/50 z-20 px-3 py-3.5 text-xs sm:text-sm font-semibold">종목명</TableHead>
                    <TableHead className="text-right min-w-[110px] px-3 py-3.5 text-xs sm:text-sm font-semibold">현재가</TableHead>
                    <TableHead className="text-right min-w-[120px] px-3 py-3.5 text-xs sm:text-sm font-semibold">1분 거래대금</TableHead>
                    <TableHead className="text-right min-w-[90px] px-3 py-3.5 text-xs sm:text-sm font-semibold">등락률</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCoinData.length > 0 ? sortedCoinData.map((coin) => (
                    <TableRow key={coin.market_code} className="hover:bg-muted/30 data-[state=selected]:bg-muted">
                      <TableCell className="font-medium sticky left-0 bg-background group-hover:bg-muted/30 z-10 px-3 py-3 text-xs sm:text-sm">{coin.market_code}</TableCell>
                      <TableCell className="sticky left-[100px] sm:left-[120px] bg-background group-hover:bg-muted/30 z-10 px-3 py-3 text-xs sm:text-sm">{coin.korean_name}</TableCell>
                      <TableCell className="text-right px-3 py-3 text-xs sm:text-sm tabular-nums">
                        {coin.trade_price.toLocaleString(undefined, { 
                          minimumFractionDigits: coin.trade_price < 1 ? 4 : (coin.trade_price < 100 ? 2 : 0),
                          maximumFractionDigits: coin.trade_price < 1 ? 4 : (coin.trade_price < 100 ? 2 : 0)
                        })} 원
                      </TableCell>
                      <TableCell className="text-right font-semibold px-3 py-3 text-xs sm:text-sm tabular-nums">
                        {coin.trade_price_1min_krw !== undefined 
                          ? (coin.trade_price_1min_krw > 0 ? `${Math.floor(coin.trade_price_1min_krw).toLocaleString()} 원` : <span className="text-muted-foreground">-</span>)
                          : <span className="text-muted-foreground italic text-xs">계산중</span>}
                      </TableCell>
                      <TableCell 
                        className={`text-right px-3 py-3 text-xs sm:text-sm tabular-nums ${ // tabular-nums: 숫자 너비 고정
                          coin.signed_change_rate > 0 ? 'text-red-600 font-semibold' : 
                          coin.signed_change_rate < 0 ? 'text-blue-600 font-semibold' : 'text-muted-foreground'
                        }`}
                      >
                        {coin.signed_change_rate === 0 ? '0.00%' : `${(coin.signed_change_rate * 100).toFixed(2)}%`}
                      </TableCell>
                    </TableRow>
                  )) : (
                     <TableRow>
                        <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                          {isLoadingMarketDetails || isInitialPriming ? "데이터를 불러오고 있습니다..." : "표시할 데이터가 없습니다. 잠시 후 다시 시도해주세요."}
                        </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      <footer className="text-center mt-12 mb-6 text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Realtime Upbit Dashboard. All rights reserved.</p>
        <p className="mt-1">Data provided by Upbit. Not financial advice.</p>
      </footer>
    </div>
  );
}