-- ============================================================================
-- Receipts storage — private bucket for expense receipt images/PDFs.
--
-- Objects are namespaced by org: path = '<org_id>/<uuid>.<ext>'. Access is
-- gated to owners/managers of that org (financial documents), mirroring the
-- manager-only RLS on the expenses table. The bucket is private; the app serves
-- files through short-lived signed URLs.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/png','image/jpeg','image/jpg','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

-- One policy for every operation: the first path segment must be an org the
-- caller manages. storage.objects already has RLS enabled by Supabase.
drop policy if exists "receipts manager access" on storage.objects;
create policy "receipts manager access" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.org_memberships m
      where m.user_id = auth.uid()
        and m.role in ('owner','manager')
        and m.org_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.org_memberships m
      where m.user_id = auth.uid()
        and m.role in ('owner','manager')
        and m.org_id::text = (storage.foldername(name))[1]
    )
  );
