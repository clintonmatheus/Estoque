-- Financeiro: compras a faturar (fatura semanal das lojas). Rode uma vez no SQL Editor do Supabase "Estoque", depois da 007.
-- É seguro rodar de novo.
-- Quem lança: almoxarife, solicitante, pagador e administrador (só em loja cadastrada como "fatura semanal").
-- Quem vê: pagador e administrador veem todas; os demais, só as que lançaram.
-- Quem fecha a fatura (marca a compra "em_fatura"): pagador e administrador.

create table if not exists public.compras (
  id text primary key,
  dados jsonb not null,
  alterado_por uuid references auth.users (id) default auth.uid(),
  servidor_em timestamptz not null default now()
);
create index if not exists idx_compras_servidor_em on public.compras (servidor_em);
alter table public.compras enable row level security;
drop trigger if exists marcar on public.compras;
create trigger marcar before insert or update on public.compras for each row execute function public.marcar_gravacao();

drop policy if exists "leitura" on public.compras;
drop policy if exists "criar" on public.compras;
drop policy if exists "alterar" on public.compras;
create policy "leitura" on public.compras for select to authenticated using (
  public.papel_financeiro() in ('admin', 'pagador') or dados -> 'criado' ->> 'id' = auth.uid()::text
);
-- (upsert: compra que já existe passa aqui e as regras de alteração decidem; ver comentário da 007)
create policy "criar" on public.compras for insert to authenticated with check (
  (public.pode_lancar() or public.tem_financeiro()) and (
    (dados -> 'criado' ->> 'id' = auth.uid()::text and dados ->> 'status' = 'aberta')
    or (exists (select 1 from public.compras x where x.id = compras.id)
        and (public.papel_financeiro() in ('admin', 'pagador') or dados -> 'criado' ->> 'id' = auth.uid()::text))
  )
);
create policy "alterar" on public.compras for update to authenticated
  using (
    public.papel_financeiro() in ('admin', 'pagador')
    or (dados -> 'criado' ->> 'id' = auth.uid()::text and dados ->> 'status' = 'aberta')
  )
  with check (
    public.papel_financeiro() in ('admin', 'pagador')
    or (dados -> 'criado' ->> 'id' = auth.uid()::text and dados ->> 'status' in ('aberta', 'cancelada'))
  );

-- Regras no servidor: a loja precisa ser de fatura semanal; quem lançou não muda valor, loja ou centro depois.
create or replace function public.proteger_compra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from public.compras x where x.id = new.id) then return new; end if;  -- upsert: vale o gatilho de UPDATE
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.fornecedores f where f.id = new.dados ->> 'fornecedorId' and f.dados ->> 'forma' = 'fatura') then
      raise exception 'A loja da compra precisa ser de fatura semanal';
    end if;
    if coalesce((new.dados ->> 'valor')::numeric, 0) <= 0 then raise exception 'Informe o valor da compra'; end if;
  else
    if (old.dados -> 'criado' ->> 'id') is distinct from (new.dados -> 'criado' ->> 'id') then
      raise exception 'Não é possível trocar quem lançou a compra';
    end if;
    if not (public.papel_financeiro() in ('admin', 'pagador')) and (
         new.dados ->> 'valor' is distinct from old.dados ->> 'valor'
         or new.dados ->> 'fornecedorId' is distinct from old.dados ->> 'fornecedorId'
         or new.dados ->> 'centroId' is distinct from old.dados ->> 'centroId') then
      raise exception 'Só o pagador ou o administrador altera valor, loja ou centro da compra';
    end if;
    if old.dados ->> 'status' = 'em_fatura' and new.dados ->> 'status' = 'cancelada' then
      raise exception 'Compra que está numa fatura não se cancela: cancele ou devolva o pedido da fatura';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists proteger on public.compras;
create trigger proteger before insert or update on public.compras for each row execute function public.proteger_compra();

-- Comprovantes: quem lançou a compra também vê os arquivos dela (além de pedidos próprios, galpão e financeiro).
drop policy if exists "leitura" on public.anexos;
create policy "leitura" on public.anexos for select to authenticated using (
  public.pode_lancar() or public.papel_financeiro() in ('admin', 'pagador')
  or exists (select 1 from public.pedidos p where p.id = anexos.dados ->> 'grupo' and p.dados -> 'criado' ->> 'id' = auth.uid()::text)
  or exists (select 1 from public.compras c where c.id = anexos.dados ->> 'grupo' and c.dados -> 'criado' ->> 'id' = auth.uid()::text)
);
drop policy if exists "anexos arquivos: leitura" on storage.objects;
create policy "anexos arquivos: leitura" on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    public.pode_lancar() or public.papel_financeiro() in ('admin', 'pagador')
    or exists (select 1 from public.pedidos p where p.id = split_part(name, '/', 1) and p.dados -> 'criado' ->> 'id' = auth.uid()::text)
    or exists (select 1 from public.compras c where c.id = split_part(name, '/', 1) and c.dados -> 'criado' ->> 'id' = auth.uid()::text)
  )
);

do $$ begin
  begin alter publication supabase_realtime add table public.compras;
  exception when duplicate_object then null; end;
end $$;
