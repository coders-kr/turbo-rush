# Turbo Rush

Three.js로 만든 오리지널 웹 아케이드 카트 레이싱 게임입니다. 카트라이더·마리오카트에서 영감을 받은 **스피드전 프로토타입**으로, 특정 게임의 캐릭터·차량·맵·상표·원본 에셋을 복제하지 않고 절차적 3D 그래픽으로 구성했습니다.

- 플레이: <https://turbo-rush.coders.kr/>
- 배포 상태: Coders.kr 운영 배포본 제공 중
- 저장소: <https://github.com/boclair98/turbo-rush>

## 게임 특징

- 3랩 스피드전, 플레이어 1명과 AI 레이서 8명
- 자유 조향 기반의 아케이드 주행 물리
- 일반 드리프트, 짧게 반복하는 톡톡이, 지속 끌기, 커팅 드리프트
- 드리프트 게이지와 N2O 부스트 탱크, 퍼펙트 스타트
- 벽 충돌 감속, 타이어 자국·연기·스파크 효과
- 절차적 3D 트랙, 체크포인트, 랩/순위/미니맵 HUD
- 키보드와 모바일 터치 버튼 지원
- 노랑 헬멧과 오렌지 수트의 오리지널 드라이버, 블랙 메탈·골드 하이퍼카트

### 조작법

| 입력 | 동작 |
| --- | --- |
| `W` / `↑` | 가속 |
| `S` / `↓` | 브레이크·후진 |
| `A` / `←` | 왼쪽 조향 |
| `D` / `→` | 오른쪽 조향 |
| `Shift` | 드리프트 |
| `Space` | N2O 부스트 |
| `R` | 레이스 재시작 |

왼쪽·오른쪽 방향은 차량의 진행 방향을 기준으로 계산합니다. 따라서 카메라가 회전하거나 트랙이 굽어도 화면 기준이 아니라 실제 차량 기준으로 자연스럽게 조향됩니다.

## 기술 스택과 구조

- Frontend: Next.js 16, React 19, TypeScript, Three.js 0.185
- Styling: CSS, Geist 폰트
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- 배포: Coders.kr `mode: native`, nginx 정적 웹 서비스 + API 서비스

현재 레이스 화면은 브라우저에서 동작하는 클라이언트 게임이며, 백엔드 템플릿에는 사용자·리더보드·WebSocket 확장을 위한 기본 경계가 남아 있습니다. 공식 게임 서버나 계정·결제·외부 공개 데이터 API와 연결하는 기능은 포함하지 않습니다.

```text
frontend/
  app/speed-rush-game.tsx  Three.js 씬, 카트 물리, AI, 드리프트, HUD
  app/page.tsx             게임 진입점
  app/globals.css          레이스 화면·메뉴·터치 컨트롤 스타일
  public/og.png             저장소/배포 미리보기 이미지
backend/
  app/main.py              FastAPI 앱
  app/game.py              템플릿 실시간 게임 서버 경계
  app/routes/               사용자·리더보드·WebSocket 라우트
  alembic/                  데이터베이스 마이그레이션
coders.yaml                Coders.kr web/api/db 서비스 정의
compose.yaml               로컬 PostgreSQL·FastAPI·Next.js 구성
```

## 로컬 실행

필수 도구: Docker Desktop, Git. 프론트엔드만 빠르게 확인하려면 Node.js 22와 pnpm 9도 사용할 수 있습니다.

```bash
# 전체 스택: PostgreSQL + FastAPI + Next.js
docker compose up

# 브라우저
# http://localhost:3000
```

프론트엔드 단독 빌드/검사:

```bash
cd frontend
corepack pnpm install
corepack pnpm build
corepack pnpm lint
```

백엔드 테스트와 마이그레이션:

```bash
cd backend
uv sync --frozen
uv run alembic upgrade head
uv run pytest
```

로컬 Compose는 `backend/.env`가 없어도 실행되며 개발용 PostgreSQL 계정을 사용합니다. 다른 값을 쓰려면 `backend/.env.example`을 복사해 `backend/.env`로 만들고 수정하세요.

## 환경 변수

| 이름 | 용도 | 필수 | 발급/설정 위치 |
| --- | --- | --- | --- |
| `DATABASE_URL` | FastAPI가 연결할 PostgreSQL 주소 | 로컬 Compose에서는 자동 설정 | 로컬 `.env` 또는 Coders.kr 서비스 변수 |
| `DEV_FAKE_USER` | 플랫폼 인증이 없는 로컬 개발용 사용자 UUID | 선택 | 로컬 `.env`만 사용 |
| `BACKEND_URL` | nginx/Next가 API 서비스로 프록시할 내부 주소 | Coders.kr에서 자동 주입 | `coders.yaml`의 `${api.internal_url}` |

실제 토큰, 비밀번호, 쿠키, 개인 키는 저장소에 넣지 않습니다. `.env`, `.env.*`, `.coders/`는 `.gitignore`로 제외되어 있습니다.

## Coders.kr 배포

Coders.kr 배포 문서(`https://coders.kr/llms.txt`)에 따라 GitHub canonical 저장소를 배포 소스로 사용합니다.

1. `boclair98/turbo-rush`의 기본 브랜치에 변경사항을 push합니다.
2. `coders-kr/turbo-rush`는 canonical 저장소의 실제 fork로 유지하고 기본 브랜치를 동기화합니다.
3. Coders.kr에서 `https://github.com/boclair98/turbo-rush`를 배포 소스로 선택합니다.
4. 배포가 `ready`가 된 뒤 <https://turbo-rush.coders.kr/>에서 게임 로딩과 키보드·터치 조작을 확인합니다.

서비스 정의는 `coders.yaml`에 있으며, WebSocket 경로를 통과하는 `web`·`api` 서비스의 timeout은 3600초로 설정되어 있습니다. 재배포·스팟 노드 회수 때 소켓이 끊길 수 있으므로 클라이언트는 재연결을 전제로 설계해야 합니다.

### 저장소 토폴로지

- Upstream: `https://github.com/boclair98/turbo-rush`
- Organization fork: `https://github.com/coders-kr/turbo-rush`
- 배포 소스: canonical upstream

조직 fork를 동기화할 때는 upstream의 실제 기본 브랜치와 전체 커밋 SHA가 같은지 확인합니다. canonical 저장소에서 먼저 검증·커밋·push한 뒤 fork를 동기화하는 순서를 지킵니다.

## 검증 체크리스트

- `corepack pnpm build` 성공
- `corepack pnpm lint` 실행
- `uv run pytest` 실행(백엔드 변경 시)
- 데스크톱 1440×900에서 트랙·HUD·메뉴 확인
- 모바일 390×844에서 가로 스크롤·터치 버튼·HUD 겹침 확인
- 왼쪽/오른쪽 방향키, 드리프트, 부스트, 랩 완료 확인
- 브라우저 콘솔의 런타임 오류와 정적 리소스 404 확인

## 라이선스와 권리

프로젝트 코드는 별도 라이선스 고지가 없는 한 저장소 작성자의 저작물입니다. 카트라이더, 마리오카트 및 관련 상표·캐릭터·차량·맵·음원과 제휴하지 않으며, 해당 원본 에셋을 포함하지 않습니다. 상업적 사용이나 재배포 전에는 저장소 소유자에게 문의하세요.

[![Deploy on coders.kr](https://coders.kr/deploy-button.svg)](https://coders.kr/deploy?repo=https://github.com/cykim8811/template-coders)

A realtime multiplayer game starter for the
[coders.kr](https://coders.kr) platform. Hand a Claude Code session the
link to this repo, ask it to deploy, and you have a live game where:

- Anyone can play instantly — a fullscreen canvas arena over a
  WebSocket, no sign-in wall.
- Rooms are just links: `/?room=friday-crew` is its own world.
- Signing in (optional, one click, no OAuth code in this repo) upgrades
  a guest to a named player whose **best score persists** on a public
  leaderboard.

The example game is a tiny "orb arena" — steer a circle, eat orbs,
score points. It's deliberately small: the point of this template is
the *wiring* every realtime game here needs — the socket lifecycle,
reconnect, interpolation, optional identity, server-authoritative
state — with the game rules isolated where you'll swap them out.

> Building a plain CRUD site instead? Use the **Basic Full-Stack Web**
> template on the [`main` branch](https://github.com/coders-kr/template-coders)
> — same platform wiring, request/response app shape. This branch was
> cloned with:
> ```bash
> git clone -b game --single-branch https://github.com/coders-kr/template-coders <name>
> ```

## What the platform gives you

Identity works on the WebSocket exactly like it does on HTTP: the gate
validates the visitor's `coders_session` cookie on the **handshake**
and stamps `X-Coders-User` (+ `X-Coders-User-Name`) before the request
reaches you. Two twists matter for games (PLATFORM.md §5):

1. **The handshake is a GET, so the gate never forces sign-in.**
   Anonymous visitors connect fine — that's what makes login *optional*
   here. Guests get a generated nick; signed-in players keep their
   coders.kr name and their best score.
2. **The gate can't see inside the socket.** Once upgraded, individual
   messages aren't method-gated — authorize every state-changing
   message in your own handler. This template's server is authoritative
   end-to-end: clients send *intent* (a direction vector), the server
   integrates movement, detects pickups, and owns every score.

Cost model you're designing against (PLATFORM.md §5b): **WebSockets are
billed by egress bytes, not open-time** — an idle socket is ~free, and
what costs money is snapshot size × tick rate × players. This template
ticks at 15 Hz with compact single-letter keys; raise either only on
purpose.

And one operational truth: **sockets drop routinely** (Spot-node
preemption, redeploys, idle scale-to-zero). The client treats a dead
socket as normal and reconnects with backoff; the server treats every
connect as a fresh join. Build your game state around that assumption.

## Code tour

```
backend/
  app/game.py             the game: rooms, players, orbs, 15 Hz tick loop,
                          server-side collision — swap THIS for your game
  app/routes/ws.py        /api/ws — handshake identity, message loop,
                          persist-best-score on disconnect
  app/routes/leaderboard.py  GET /api/leaderboard + the GREATEST() upsert
  app/routes/users.py     /api/me — auto-upserts the local row on first sight
  app/models.py           User + Score (one best-score row per user)
frontend/
  lib/ws.ts               reconnecting GameSocket (backoff + jitter, 20s ping)
  lib/game.ts             wire types + snapshot-interpolation buffer
  components/GameCanvas.tsx  fullscreen DPR-aware canvas, rAF render loop,
                          camera follow, keyboard + touch input → intent
  components/Hud.tsx      status/score overlay, optional sign-in corner,
                          leaderboard panel
  app/page.tsx            glues socket ↔ buffer ↔ canvas ↔ HUD
  nginx.conf.template     /api/ws location with Upgrade headers + 3600s
coders.yaml               web + api (+postgres), timeout: 3600 on both
```

The split to internalize: `app/game.py` and the drawing half of
`GameCanvas.tsx` are the *example game*; everything else is the
*template* and survives whatever game you build.

## Local development

```bash
docker compose up
```

Zero setup — Postgres + FastAPI (:8000) + Next dev (:3000). Open
http://localhost:3000 in two windows to see multiplayer. REST `/api/*`
is proxied by the Next dev server; the WebSocket connects straight to
`ws://localhost:8000` (Next dev can't proxy sockets).

There's no platform gate locally, so compose pre-sets `DEV_FAKE_USER`
and every request/socket counts as that signed-in user. Unset it (or
override in `backend/.env`) to exercise the guest path.

Backend tests (needs a Postgres; compose's works):

```bash
cd backend && uv run pytest
```

## Deploying

This repo ships a [`.mcp.json`](./.mcp.json) that points Claude Code at
the coders.kr MCP server. Then, in Claude Code:

```
deploy https://github.com/<you>/<your-repo>
```

The platform reads `coders.yaml`, builds both images, wires Postgres,
and fronts everything at `<name>.coders.kr` — WebSocket included (the
gate proxies upgrades; `timeout: 3600` in coders.yaml is what keeps a
socket open past Knative's 300s default).

## Platform policies (read before you ship)

[**PLATFORM.md**](./PLATFORM.md) — identity, the cost model, quota
pools, cold start. For this template **§5 is the one that bites**:
egress-billed WebSockets (cheap when idle, priced by your snapshot
bytes), the 3600s timeout ceiling, and why disconnects are a fact of
life, not a bug.

## Going further

- **Swap the game**: keep the message shape (`input` in, `state` out)
  and replace `app/game.py`'s `_step` + the canvas drawing code.
- **Cut egress**: send deltas instead of full snapshots, or drop the
  tick rate for slow-paced games (a turn-based game can broadcast only
  on moves — zero idle cost).
- **Keep rooms across pods?** Room state is in-process by design (one
  api pod). If you ever scale out, move rooms to a `redis` component.
- **Match history / unlocks**: FK new tables on `users.id` — the
  first-sight upsert in `routes/users.py` already gives every signed-in
  player a stable local UUID.
