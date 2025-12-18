# 참참참! (Neon)

이미지에 적힌 규칙 그대로 만든 **3레인 회피 게임**입니다.

## 실행

`charm/index.html`을 브라우저에서 열면 바로 실행됩니다.

## 조작

- 키보드: `← / →`(한 칸 이동), `↑ / ↓`(MID), 또는 `A / D / W / S`
- 모바일:
  - 게임 화면(캔버스) 왼쪽 탭 = 왼쪽으로 한 칸
  - 게임 화면(캔버스) 오른쪽 탭 = 오른쪽으로 한 칸
  - 아래 버튼(LEFT/MID/RIGHT) 터치도 가능

## 규칙

- 정체모를 미사일이 랜덤 라인에서 **아래 → 위**로 발사됩니다.
- 같은 라인에 있으면 피격 → **OUT(라이프 -1)** / 0이면 게임오버
- 피하면 점수 증가 + “통과” 연출

## 랭킹(Supabase)

브라우저(클라이언트)에서 동작하는 간단한 랭킹입니다. **Supabase anon key**만 사용하세요.

### 테이블

Supabase에 `rankings` 테이블을 만들고 아래 컬럼을 추가하세요 (업서트/기간 랭킹용):

- `id` uuid (PK, default: gen_random_uuid())
- `created_at` timestamptz (default: now())
- `updated_at` timestamptz (default: now())
- `game_id` text (예: "run", "charm")
- `name` text
- `name_key` text (유니크, 예: lower(name))
- `score` int
- `best_combo` int
- `round` int

### 설정

DevTools 콘솔에서 아래를 실행하고 새로고침하면 랭킹이 활성화됩니다:

```js
localStorage.setItem("SB_URL", "https://xxxx.supabase.co");
localStorage.setItem("SB_ANON_KEY", "YOUR_ANON_KEY");
localStorage.setItem("SB_GAME_ID", "run"); // 같은 프로젝트에서 게임 분리
```

### (권장) Edge Function으로 업서트/기간 랭킹/검증

이 프로젝트는 `supabase/functions/leaderboard` Edge Function을 포함합니다.

- **중복 닉네임 최신 점수만 유지**: `name_key` 기준 `upsert`
- **일간/주간 랭킹**: `updated_at` 기준 필터 (KST 기준)
- **치팅 방지(기본)**: 서버에서 점수/라운드/콤보 범위 및 관계 체크 + 간단한 레이트리밋

#### SQL (유니크 키)

Supabase SQL Editor에서 실행:

```sql
alter table public.rankings
  add column if not exists name_key text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists game_id text not null default 'run';

update public.rankings
set name_key = lower(coalesce(name, 'PLAYER'))
where name_key is null;

create unique index if not exists rankings_game_name_key_key
on public.rankings (game_id, name_key);
```

#### 배포

Supabase CLI로 배포:

```bash
supabase functions deploy leaderboard
```
