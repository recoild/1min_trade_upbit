// server.js
require('dotenv').config(); // .env 파일 로드
const WebSocket = require('ws');
const fetch = require('node-fetch'); // node-fetch v2 사용 시

const UPBIT_WEBSOCKET_URL = 'wss://api.upbit.com/websocket/v1';
const RELAY_PORT = process.env.WEBSOCKET_RELAY_PORT || 8080;

const clients = new Set(); // 연결된 클라이언트(Next.js 앱)들을 관리
let upbitSocket = null; // 업비트와의 웹소켓 연결 객체
let marketCodesToSubscribe = [];
let marketDetailsForKoreanName = {};

// 업비트 API에서 초기 마켓 정보 가져오기
async function fetchInitialMarketInfo() {
  try {
    console.log('[RELAY_SERVER] Fetching initial market info from Upbit...');
    const response = await fetch('https://api.upbit.com/v1/market/all?isDetails=false');
    if (!response.ok) {
      console.error(`[RELAY_SERVER] Failed to fetch market info: ${response.status}`);
      return {};
    }
    const data = await response.json();
    const krwMarkets = data.filter(m => m.market.startsWith('KRW-'));
    
    const details = {};
    krwMarkets.forEach(m => {
      details[m.market] = { korean_name: m.korean_name, english_name: m.english_name };
    });
    marketCodesToSubscribe = krwMarkets.map(m => m.market);
    marketDetailsForKoreanName = details;
    console.log(`[RELAY_SERVER] Initial market info fetched. ${marketCodesToSubscribe.length} KRW markets found.`);
    return details;
  } catch (error) {
    console.error('[RELAY_SERVER] Error fetching market info:', error);
    return {};
  }
}

// 업비트 웹소켓 연결 함수
function connectToUpbit() {
  if (upbitSocket && (upbitSocket.readyState === WebSocket.OPEN || upbitSocket.readyState === WebSocket.CONNECTING)) {
    console.log('[RELAY_SERVER] Already connected or connecting to Upbit.');
    return;
  }

  console.log('[RELAY_SERVER] Connecting to Upbit WebSocket...');
  upbitSocket = new WebSocket(UPBIT_WEBSOCKET_URL);
  upbitSocket.binaryType = 'arraybuffer';

  upbitSocket.onopen = () => {
    console.log('[RELAY_SERVER] ✅ Connected to Upbit WebSocket');
    if (marketCodesToSubscribe.length > 0) {
      const chunkSize = 500; // 업비트에서 한 번에 구독 가능한 codes 개수 (문서 확인 필요)
      for (let i = 0; i < marketCodesToSubscribe.length; i += chunkSize) {
        const chunk = marketCodesToSubscribe.slice(i, i + chunkSize);
        const subscriptionMessage = [
          { ticket: `relay-server-ticker-${Date.now()}-${i}` },
          { type: 'ticker', codes: chunk, isOnlyRealtime: false }, // 스냅샷 + 실시간
        ];
        upbitSocket.send(JSON.stringify(subscriptionMessage));
        console.log(`[RELAY_SERVER] Subscribed to Upbit for ${chunk.length} markets.`);
      }
    }
  };

  upbitSocket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      try {
        const decodedString = new TextDecoder('utf-8').decode(event.data);
        const jsonData = JSON.parse(decodedString);
        
        // 클라이언트에 보낼 데이터 가공 (예: 한글명 추가)
        if (jsonData.type === 'ticker' && marketDetailsForKoreanName[jsonData.code]) {
            jsonData.korean_name = marketDetailsForKoreanName[jsonData.code].korean_name;
        }
        const messageToSend = JSON.stringify(jsonData);

        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(messageToSend);
          }
        });
      } catch (e) {
        console.error('[RELAY_SERVER] Error processing message from Upbit:', e);
      }
    }
  };

  upbitSocket.onerror = (error) => {
    console.error('[RELAY_SERVER] 💣 Upbit WebSocket error:', error.message || error);
  };

  upbitSocket.onclose = (event) => {
    console.log(`[RELAY_SERVER] 🔌 Upbit WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
    upbitSocket = null;
    console.log('[RELAY_SERVER] Reconnecting to Upbit in 5 seconds...');
    setTimeout(connectToUpbit, 5000);
  };
}

// 클라이언트 연결을 위한 웹소켓 서버 (릴레이 서버)
const relayWSServer = new WebSocket.Server({ port: RELAY_PORT });

relayWSServer.on('connection', (wsClient, req) => {
  const clientIp = req.socket.remoteAddress;
  clients.add(wsClient);
  console.log(`[RELAY_SERVER] 🧍 Client connected: ${clientIp}. Total clients: ${clients.size}`);

  // 새 클라이언트가 연결되면 업비트 연결 상태 확인 및 시도
  if (!upbitSocket || upbitSocket.readyState === WebSocket.CLOSED) {
    connectToUpbit();
  }

  wsClient.on('message', (message) => {
    console.log('[RELAY_SERVER] Received message from client (should not happen):', message.toString());
    // 기본적으로 클라이언트가 이 서버로 메시지를 보낼 일은 없음
  });

  wsClient.on('close', () => {
    clients.delete(wsClient);
    console.log(`[RELAY_SERVER] 🧍 Client disconnected. Total clients: ${clients.size}`);
  });

  wsClient.on('error', (error) => {
    console.error(`[RELAY_SERVER] Client WebSocket error for ${clientIp}:`, error.message);
    clients.delete(wsClient);
  });
});

// 릴레이 서버 시작
async function startRelayServer() {
    await fetchInitialMarketInfo(); // 마켓 정보 먼저 로드
    if (marketCodesToSubscribe.length > 0) {
        connectToUpbit(); // 그 후 업비트 연결
    } else {
        console.error("[RELAY_SERVER] No market codes to subscribe. Cannot connect to Upbit.");
        // 선택: 마켓 정보 로드 실패 시 주기적으로 재시도 로직 추가 가능
    }
    console.log(`[RELAY_SERVER] WebSocket relay server started on ws://localhost:${RELAY_PORT}`);
}

startRelayServer();