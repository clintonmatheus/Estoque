-- Três pilares (Estoque/Controle, Pagamentos e Financeiro) e as permissões de cada pessoa.
-- Rode uma vez no SQL Editor do Supabase "Estoque", depois da 009. É seguro rodar de novo.
-- Depois rode 010b_perfis_pilares.sql para definir o papel de cada pessoa.
--
-- Estoque (coluna papel):  admin / almoxarife = tudo · controle = EPI, ferramentas e locações (materiais só consulta)
--                          consultor = vê tudo, não lança · nenhum = não usa o estoque
-- Pagamentos (coluna financeiro): solicitante = pede · pagador = pede, confere e paga
--                                 admin = pede, confere, aprova e usa o pilar Financeiro
-- Coluna paga: o administrador também registra pagamentos (o pagador sempre paga).

-- 1. Perfis
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'almoxarife', 'controle', 'consultor', 'nenhum'));
alter table public.perfis alter column papel set default 'nenhum';
alter table public.perfis add column if not exists paga boolean not null default false;

create or replace function public.papel_estoque() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where id = auth.uid()
$$;
-- Vê o estoque (saldos, EPI, ferramentas, locações, histórico e relatórios)
create or replace function public.ve_estoque() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_estoque() in ('admin', 'almoxarife', 'controle', 'consultor'), false)
$$;
-- Lança EPI, ferramentas e locações e cadastra funcionários
create or replace function public.opera_controle() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_estoque() in ('admin', 'almoxarife', 'controle'), false)
$$;
-- Registra pagamentos
create or replace function public.pode_pagar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select financeiro = 'pagador' or (financeiro = 'admin' and paga) from public.perfis where id = auth.uid()), false)
$$;
create or replace function public.item_eh_epi(item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.itens i where i.id = item and i.dados ->> 'categoria' = 'EPI')
$$;
-- Grupo de anexo que pertence a um pedido de pagamento ou a uma compra a faturar
create or replace function public.anexo_de_pagamento(grupo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pedidos p where p.id = grupo) or exists (select 1 from public.compras c where c.id = grupo)
$$;
create or replace function public.anexo_meu(grupo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.pedidos p where p.id = grupo and p.dados -> 'criado' ->> 'id' = auth.uid()::text)
      or exists (select 1 from public.compras c where c.id = grupo and c.dados -> 'criado' ->> 'id' = auth.uid()::text)
$$;

-- 2. Estoque: quem vê o estoque lê tudo; materiais só admin/almoxarife gravam; o controle grava EPI,
--    funcionários, ferramentas e locações. (O app grava por "upsert": as regras valem para criar e alterar.)
do $$
declare t text;
begin
  foreach t in array array['itens', 'funcionarios', 'movimentos', 'bens', 'movimentos_bens'] loop
    execute format('drop policy if exists "leitura" on public.%I', t);
    execute format('drop policy if exists "criar" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    execute format('create policy "leitura" on public.%I for select to authenticated using (public.ve_estoque())', t);
  end loop;
  foreach t in array array['funcionarios', 'bens', 'movimentos_bens'] loop
    execute format('create policy "criar" on public.%I for insert to authenticated with check (public.opera_controle())', t);
    execute format('create policy "alterar" on public.%I for update to authenticated using (public.opera_controle()) with check (public.opera_controle())', t);
  end loop;
end $$;

create policy "criar" on public.itens for insert to authenticated
  with check (public.pode_lancar() or (public.opera_controle() and dados ->> 'categoria' = 'EPI'));
create policy "alterar" on public.itens for update to authenticated
  using (public.pode_lancar() or (public.opera_controle() and dados ->> 'categoria' = 'EPI'))
  with check (public.pode_lancar() or (public.opera_controle() and dados ->> 'categoria' = 'EPI'));

create policy "criar" on public.movimentos for insert to authenticated
  with check (public.pode_lancar() or (public.opera_controle() and public.item_eh_epi(dados ->> 'itemId')));
create policy "alterar" on public.movimentos for update to authenticated
  using (public.pode_lancar() or (public.opera_controle() and public.item_eh_epi(dados ->> 'itemId')))
  with check (public.pode_lancar() or (public.opera_controle() and public.item_eh_epi(dados ->> 'itemId')));

-- Frentes de serviço: quem vê o estoque ou usa pagamentos lê; almoxarifado e admin do financeiro gravam (sem mudança).
drop policy if exists "leitura" on public.locais;
create policy "leitura" on public.locais for select to authenticated using (public.ve_estoque() or public.tem_financeiro());

-- 3. Anexos: os do estoque, quem vê o estoque; os de pagamentos (pedidos e compras), só pagador/admin e quem lançou.
drop policy if exists "leitura" on public.anexos;
drop policy if exists "criar" on public.anexos;
drop policy if exists "alterar" on public.anexos;
create policy "leitura" on public.anexos for select to authenticated using (
  case when public.anexo_de_pagamento(dados ->> 'grupo')
    then public.papel_financeiro() in ('admin', 'pagador') or public.anexo_meu(dados ->> 'grupo')
    else public.ve_estoque() end
);
create policy "criar" on public.anexos for insert to authenticated with check (public.opera_controle() or public.tem_financeiro());
create policy "alterar" on public.anexos for update to authenticated
  using (public.opera_controle() or public.tem_financeiro()) with check (public.opera_controle() or public.tem_financeiro());

drop policy if exists "anexos arquivos: leitura" on storage.objects;
create policy "anexos arquivos: leitura" on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    case when public.anexo_de_pagamento(split_part(name, '/', 1))
      then public.papel_financeiro() in ('admin', 'pagador') or public.anexo_meu(split_part(name, '/', 1))
      else public.ve_estoque() end
  )
);
drop policy if exists "anexos arquivos: enviar" on storage.objects;
create policy "anexos arquivos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (public.opera_controle() or public.tem_financeiro()));
drop policy if exists "anexos arquivos: substituir" on storage.objects;
create policy "anexos arquivos: substituir" on storage.objects for update to authenticated
  using (bucket_id = 'anexos' and (public.opera_controle() or public.tem_financeiro()))
  with check (bucket_id = 'anexos' and (public.opera_controle() or public.tem_financeiro()));

-- 4. Pagamentos: só quem paga marca o pedido como pago (os administradores aprovam, mas não pagam, salvo "paga").
create or replace function public.proteger_pagamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.dados ->> 'status' = 'pago' and old.dados ->> 'status' is distinct from 'pago' and not public.pode_pagar() then
    raise exception 'Só quem está marcado para pagar registra o pagamento';
  end if;
  return new;
end $$;
drop trigger if exists proteger_pagamento on public.pedidos;
create trigger proteger_pagamento before update on public.pedidos for each row execute function public.proteger_pagamento();
