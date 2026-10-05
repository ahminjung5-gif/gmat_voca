-- =========================================================
-- 공부 모드 추가용 SQL (이미 schema.sql 을 실행한 프로젝트에 한 번만 실행)
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 헷갈리는 단어장
create table if not exists public.bookmarks (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
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

-- 날짜별로 공부 모드에서 본 카드 수
alter table public.daily_activity add column if not exists viewed int not null default 0;

alter table public.bookmarks      enable row level security;
alter table public.study_progress enable row level security;

drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own study_progress" on public.study_progress;
create policy "own study_progress" on public.study_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.bookmarks, public.study_progress to authenticated;
