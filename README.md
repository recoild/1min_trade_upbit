# 🚀 1min_trade_upbit

업비트 거래소의 **실시간 1분 거래량**을 시각화하는 Next.js 대시보드와, 업비트 WebSocket 데이터를 중계하는 Node.js 릴레이 서버 프로젝트입니다.

---

## ✨ 주요 기능

🔹 **업비트 KRW 마켓 전체**의 실시간 1분 거래량 집계 및 테이블 표시 </br>
🔹 업비트 공식 REST API로 마켓 정보(한글명 등) 자동 로드</br>
🔹 WebSocket 릴레이 서버를 통한 실시간 데이터 수신 (직접 Upbit에 연결하지 않고 중계)</br>
🔹 Docker로 프론트엔드/릴레이 서버 모두 손쉽게 배포 가능</br>

---

## ⚡️ 설치 및 실행

### 1️⃣ 릴레이 서버 실행

릴레이 서버는 별도의 레포지토리에서 관리됩니다. 아래 명령어를 참고하세요:

```bash
# 릴레이 서버 레포지토리 클론
git clone https://github.com/recoild/1min_trade_upbit_relay_socket.git

# 릴레이 서버 디렉토리로 이동
cd 1min_trade_upbit_relay_socket

# 의존성 설치
npm install

# 서버 실행
npm start
```
👉 기본 포트: `8080` (`WEBSOCKET_RELAY_PORT` 환경 변수로 변경 가능)

### 2️⃣ 프론트엔드 실행

```bash
npm install --force
npm run dev
```
👉 기본 포트: `3000`

### 3️⃣ 환경 변수

프론트엔드 루트에 `.env.local` 파일 생성:

```env
NEXT_PUBLIC_WEBSOCKET_RELAY_URL=ws://localhost:8080
```

릴레이 서버는 `.env` 파일에서 포트 지정 가능:

```env
WEBSOCKET_RELAY_PORT=8080
```

---

## 🐳 Docker로 실행

```bash
docker compose up -d --build
```

---

## 🛠️ 사용 기술

- ⚡ Next.js 15 (App Router)
- ⚛️ React 19
- 🟦 TypeScript
- 🖥️ shadcn/ui (테이블 등 UI 컴포넌트)
- 🟩 Node.js (릴레이 서버)
- 🔌 WebSocket, REST API
- 🐳 Docker

---

## 📚 참고

- [업비트 공식 API](https://docs.upbit.com/)
- 실시간 데이터는 **릴레이 서버**를 통해서만 수신합니다.

---

## 🌐 릴레이 서버 레포지토리

릴레이 서버는 별도의 레포지토리에서 관리됩니다. 아래 링크를 참고하세요:

🔗 [1min_trade_upbit_relay_socket](https://github.com/recoild/1min_trade_upbit_relay_socket)
