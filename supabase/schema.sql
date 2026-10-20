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
  mode text not null check (mode in ('m', 'v', 'r')),
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
  viewed int not null default 0,          -- 공부 모드에서 본 카드 수
  voca_done boolean,                      -- 그날 VOCA Day 하나를 끝까지 봤는지
  rc_done boolean,                        -- 그날 RC set Day 하나를 끝까지 봤는지
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

-- ---------- 공부 모드 ----------
-- 헷갈리는 단어장
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  status text not null default 'vague' check (status in ('known', 'vague', 'hard')),  -- vague=애매, hard=어렵
  primary key (user_id, word)
);

-- 공부 모드 이어보기 위치
create table if not exists public.study_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  idx int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.bookmarks      enable row level security;
alter table public.study_progress enable row level security;

drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own study_progress" on public.study_progress;
create policy "own study_progress" on public.study_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.bookmarks, public.study_progress to authenticated;

-- 공부 모드에서 한 번이라도 본 카드 (Day 진도 막대)
create table if not exists public.seen_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.seen_cards enable row level security;
drop policy if exists "own seen_cards" on public.seen_cards;
create policy "own seen_cards" on public.seen_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- 기기 간 '오늘의 연속 학습 조건' 동기화
-- =========================================================

-- 오늘 공부 모드에서 본 카드 (폰 + PC에서 본 것을 합쳐서 Day 완료를 판단)
create table if not exists public.today_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  deck text not null check (deck in ('voca', 'rc')),
  day_no int not null,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day, deck, key)
);
alter table public.today_views enable row level security;
drop policy if exists "own today_views" on public.today_views;
create policy "own today_views" on public.today_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.today_views to authenticated;

-- 하루 기록을 덮어쓰지 않고 합치기: 숫자는 큰 값, 완료 표시는 한 번 켜지면 유지
create or replace function public.merge_daily(
  p_day date, p_answered int, p_correct int, p_seconds int, p_viewed int,
  p_voca_done boolean, p_rc_done boolean
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.daily_activity (user_id, day, answered, correct, seconds, viewed, voca_done, rc_done)
  values (auth.uid(), p_day, coalesce(p_answered, 0), coalesce(p_correct, 0), coalesce(p_seconds, 0), coalesce(p_viewed, 0), p_voca_done, p_rc_done)
  on conflict (user_id, day) do update set
    answered  = greatest(daily_activity.answered, excluded.answered),
    correct   = greatest(daily_activity.correct, excluded.correct),
    seconds   = greatest(daily_activity.seconds, excluded.seconds),
    viewed    = greatest(daily_activity.viewed, excluded.viewed),
    voca_done = case when excluded.voca_done is null then daily_activity.voca_done
                     else coalesce(daily_activity.voca_done, false) or excluded.voca_done end,
    rc_done   = case when excluded.rc_done is null then daily_activity.rc_done
                     else coalesce(daily_activity.rc_done, false) or excluded.rc_done end;
$$;
grant execute on function public.merge_daily(date, int, int, int, int, boolean, boolean) to authenticated;
