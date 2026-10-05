-- =========================================================
-- GMAT VOCA 기록 저장용 테이블
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
-- =========================================================

-- 닉네임
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 단어별 기록 (모드별로 따로)
create table if not exists public.word_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('m', 'v')),
  word text not null,
  correct int not null default 0,
  wrong int not null default 0,
  streak int not null default 0,         -- 연속 정답 수
  last_seen timestamptz,
  in_note boolean not null default false, -- 오답 노트에 있는지
  primary key (user_id, mode, word)
);

-- 날짜별 학습량
create table if not exists public.daily_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  answered int not null default 0,
  correct int not null default 0,
  seconds int not null default 0,
  primary key (user_id, day)
);

-- 학습 한 판 한 판의 결과
create table if not exists public.sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  played_at timestamptz not null default now(),
  mode text not null,
  days int[] not null default '{}',
  total int not null default 0,
  correct int not null default 0,
  wrong int not null default 0,
  hints int not null default 0,
  result text not null,
  duration_sec int not null default 0
);
create index if not exists sessions_user_played on public.sessions (user_id, played_at desc);

-- 본인 기록만 읽고 쓸 수 있도록 (Row Level Security)
alter table public.profiles       enable row level security;
alter table public.word_stats     enable row level security;
alter table public.daily_activity enable row level security;
alter table public.sessions       enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own word_stats" on public.word_stats;
create policy "own word_stats" on public.word_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own daily_activity" on public.daily_activity;
create policy "own daily_activity" on public.daily_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
