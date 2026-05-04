create table if not exists public.room_member (
  id serial not null,
  room_key character varying(64) not null,
  username character varying(64) not null,
  role character varying(32) null default 'member'::character varying,
  joined_at timestamp without time zone null,
  constraint room_member_pkey primary key (id)
);

create unique index if not exists ix_room_member_unique
  on public.room_member (room_key, username);

create index if not exists ix_room_member_username
  on public.room_member (username);

create index if not exists ix_room_member_room_key
  on public.room_member (room_key);
