drop policy if exists "room_members_select" on public.room_members;

create policy "room_members_select" on public.room_members for select using (
  auth.uid() = user_id
  or private.is_room_member_sd(room_id)
  or private.is_room_admin_or_public_sd(room_id)
);
