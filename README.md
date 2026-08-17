# 피드포그램즈 (Feed4Grams)

RSS 피드를 등록하면 기사를 모아 보여주고, 기사를 골라 인스타그램 게시물로 미리보기/게시까지 할 수 있는 Next.js 앱이에요.

## 아키텍처 요약

- **RSS 가져오기** — 브라우저가 아니라 서버(`/api/feed`)에서 `rss-parser`로 직접 가져와요. 그래서 CORS 프록시가 필요 없고, 훨씬 안정적이에요.
- **AI 캡션 생성** — `/api/caption`이 서버에서 Anthropic API를 호출해요. API 키는 서버에만 있고 브라우저에 노출되지 않아요.
- **인스타그램 게시** — `/api/instagram`이 Instagram Graph API를 직접 호출해요. 환경변수가 없으면 자동으로 "미리보기 모드"로 동작하고, 설정하면 코드 수정 없이 바로 실게시로 전환돼요.
- **피드 목록**은 현재 브라우저의 localStorage에 저장돼요 (기기별 저장, 서버 DB 없음).

## 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000 접속

## 환경변수

`.env.example`을 참고해서 `.env.local`을 만드세요.

| 변수 | 필수 여부 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI 캡션 생성 기능에 필요 | [console.anthropic.com](https://console.anthropic.com)에서 발급 |
| `ANTHROPIC_MODEL` | 선택 | 기본값 `claude-sonnet-5` |
| `INSTAGRAM_ACCESS_TOKEN` | 실제 게시에 필요 | Meta for Developers에서 발급하는 Instagram Graph API 장기 액세스 토큰 |
| `INSTAGRAM_BUSINESS_ID` | 실제 게시에 필요 | 연결된 Instagram 비즈니스 계정의 ID |
| `GRAPH_API_VERSION` | 선택 | 기본값 `v21.0` |

이 변수들이 없어도 앱은 정상적으로 켜지고, RSS 조회와 게시물 미리보기까지는 그대로 동작해요. 캡션 생성/실게시만 각각 비활성화돼요.

## Instagram 실게시를 켜려면 (요약)

1. 인스타그램 계정을 비즈니스/크리에이터 계정으로 전환하고 Facebook 페이지와 연결
2. [Meta for Developers](https://developers.facebook.com/)에서 앱 생성 → Instagram Graph API 권한 신청
3. 장기 액세스 토큰과 비즈니스 계정 ID 발급
4. 위 값을 `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ID`로 Vercel 환경변수에 등록

세부 조건(콘텐츠 정책, 게시 빈도 제한 등)은 Meta 공식 문서를 꼭 확인하세요.

## GitHub에 올리고 Vercel로 배포하기

### 1) GitHub에 올리기

```bash
git init
git add .
git commit -m "feedgram: initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

`.env.local`은 `.gitignore`에 이미 포함돼 있어서 실수로 커밋되지 않아요.

### 2) Vercel에서 배포

1. [vercel.com](https://vercel.com) 로그인 → **Add New → Project**
2. 방금 만든 GitHub 저장소 Import (Next.js 프로젝트는 별도 빌드 설정 없이 자동 인식돼요)
3. **Environment Variables**에 위 표의 값들을 입력 (필요한 것만 넣어도 앱은 동작해요)
4. **Deploy** 클릭 → 빌드가 끝나면 바로 `https://<project>.vercel.app` 주소로 서비스돼요

이후 `main` 브랜치에 push할 때마다 Vercel이 자동으로 다시 빌드/배포해요.

## 폴더 구조

```
app/
  page.tsx           # 메인 UI (피드 사이드바 · 기사 그리드 · IG 미리보기)
  layout.tsx          # 전역 레이아웃, 폰트 로드
  globals.css          # 디자인 토큰 (색상/폰트) + Tailwind v4
  api/
    feed/route.ts      # 서버에서 RSS/Atom 파싱
    caption/route.ts    # Anthropic API로 캡션 생성
    instagram/route.ts   # Instagram Graph API 게시 (또는 미리보기 모드)
lib/
  rss.ts              # RSS 파싱/이미지 추출 로직
  types.ts             # 공용 타입
```
