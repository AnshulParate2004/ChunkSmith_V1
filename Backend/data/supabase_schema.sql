-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Conversations Table
create table if not exists conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) not null,
  project_id text not null,
  title text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

-- Messages Table
create table if not exists messages (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamp with time zone default now() not null
);

-- RLS Policies
alter table conversations enable row level security;

create policy "Users can view their own conversations" on conversations
  for select using (auth.uid() = user_id);

create policy "Users can insert their own conversations" on conversations
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own conversations" on conversations
  for update using (auth.uid() = user_id);

create policy "Users can delete their own conversations" on conversations
  for delete using (auth.uid() = user_id);

alter table messages enable row level security;

create policy "Users can view messages in their conversations" on messages
  for select using (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in their conversations" on messages
  for insert with check (
    exists (
      select 1 from conversations
      where conversations.id = messages.conversation_id
      and conversations.user_id = auth.uid()
    )
  );
