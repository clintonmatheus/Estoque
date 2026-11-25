-- Financeiro, etapa 2: pedidos de pagamento (rode uma vez no SQL Editor do Supabase "Estoque", depois do 006).
-- É seguro rodar de novo.
-- Quem vê: pagador e administrador veem todos os pedidos; o solicitante só os seus.
-- Quem altera: o solicitante só o próprio pedido enquanto está "enviado" ou "devolvido" (pode cancelar);
-- pagador e administrador conferem, aprovam e pagam. O servidor confere a regra de aprovação, então
-- um aparelho com versão antiga ou com defeito não consegue pagar sem a aprovação exigida.

-- 1. Quem precisa aprovar (a mesma regra do app): pedido aberto por pagador vai ao administrador;
--    reembolso até R$ 150 o pagador aprova, acima o administrador; outros pedidos só acima de R$ 300.
create or replace function public.aprovador_exigido(tipo text, valor numeric, criador uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when (select financeiro from public.perfis where id = criador) = 'pagador' then 'admin'
    when tipo = 'reembolso' then case when valor > 150 then 'admin' else 'pagador' end
    else case when valor > 300 then 'admin' else 'nenhum' end
  end
$$;

-- 2. Tabela
create table if not exists public.pedidos (
  id text primary key,
  dados jsonb not null,
  alterado_por uuid references auth.users (id) default auth.uid(),
  servidor_em timestamptz not null default now()
);
create index if not exists idx_pedidos_servidor_em on public.pedidos (servidor_em);
alter table public.pedidos enable row level security;
drop trigger if exists marcar on public.pedidos;
create trigger marcar before insert or update on public.pedidos for each row execute function public.marcar_gravacao();

drop policy if exists "leitura" on public.pedidos;
drop policy if exists "criar" on public.pedidos;
drop policy if exists "alterar" on public.pedidos;
create policy "leitura" on public.pedidos for select to authenticated using (
  public.papel_financeiro() in ('admin', 'pagador') or dados -> 'criado' ->> 'id' = auth.uid()::text
);
create policy "criar" on public.pedidos for insert to authenticated with check (
  public.tem_financeiro() and dados -> 'criado' ->> 'id' = auth.uid()::text
);
create policy "alterar" on public.pedidos for update to authenticated
  using (
    public.papel_financeiro() in ('admin', 'pagador')
    or (dados -> 'criado' ->> 'id' = auth.uid()::text and dados ->> 'status' in ('enviado', 'devolvido'))
  )
  with check (
    public.papel_financeiro() in ('admin', 'pagador')
    or (dados -> 'criado' ->> 'id' = auth.uid()::text and dados ->> 'status' in ('enviado', 'devolvido', 'cancelado'))
  );

-- 3. Regras do fluxo no servidor
create or replace function public.proteger_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare novo text := new.dados ->> 'status'; antigo text; exigido text; criador uuid;
begin
  criador := (new.dados -> 'criado' ->> 'id')::uuid;
  if tg_op = 'INSERT' then
    if novo <> 'enviado' then raise exception 'Pedido novo precisa começar como enviado'; end if;
  else
    antigo := old.dados ->> 'status';
    if (old.dados -> 'criado' ->> 'id') is distinct from (new.dados -> 'criado' ->> 'id') then
      raise exception 'Não é possível trocar quem abriu o pedido';
    end if;
  end if;

  -- O valor exigido de aprovação é recalculado no servidor enquanto o pedido está com o solicitante.
  if novo in ('enviado', 'devolvido') then
    exigido := public.aprovador_exigido(new.dados ->> 'tipo', (new.dados ->> 'valor')::numeric, criador);
    if new.dados ->> 'aprovador' is distinct from exigido then
      raise exception 'Aprovação exigida inconsistente (esperado: %)', exigido;
    end if;
  end if;

  if tg_op = 'UPDATE' and not public.admin_financeiro() then
    -- valor, tipo e aprovação só mudam com o pedido no solicitante (enviado/devolvido); depois, só o administrador altera
    if novo not in ('enviado', 'devolvido', 'cancelado') and (
         new.dados ->> 'valor' is distinct from old.dados ->> 'valor'
         or new.dados ->> 'tipo' is distinct from old.dados ->> 'tipo'
         or new.dados ->> 'aprovador' is distinct from old.dados ->> 'aprovador') then
      raise exception 'Só o administrador altera valor, tipo ou aprovação depois da conferência';
    end if;
    if novo = 'pronto' and antigo is distinct from 'pronto' then
      if not ((antigo = 'enviado' and old.dados ->> 'aprovador' in ('nenhum', 'pagador'))
           or (antigo = 'aprovacao' and old.dados ->> 'aprovador' = 'pagador')) then
        raise exception 'Este pedido precisa da aprovação de um administrador';
      end if;
    end if;
    if novo = 'rejeitado' then raise exception 'Só o administrador rejeita um pedido'; end if;
    if novo = 'aprovacao' and old.dados ->> 'aprovador' = 'nenhum' then raise exception 'Este pedido não precisa de aprovação'; end if;
  end if;
  if tg_op = 'UPDATE' and novo = 'pago' and antigo is distinct from 'pago' and antigo <> 'pronto' then
    raise exception 'Só se paga pedido que está pronto para pagar';
  end if;
  return new;
end $$;
drop trigger if exists proteger on public.pedidos;
create trigger proteger before insert or update on public.pedidos for each row execute function public.proteger_pedido();

-- 4. Anexos (foto, PDF, XML): o financeiro também envia; o solicitante só vê os arquivos dos próprios pedidos
drop policy if exists "leitura" on public.anexos;
drop policy if exists "criar" on public.anexos;
drop policy if exists "alterar" on public.anexos;
create policy "leitura" on public.anexos for select to authenticated using (
  public.pode_lancar() or public.papel_financeiro() in ('admin', 'pagador')
  or exists (select 1 from public.pedidos p where p.id = anexos.dados ->> 'grupo' and p.dados -> 'criado' ->> 'id' = auth.uid()::text)
);
create policy "criar" on public.anexos for insert to authenticated with check (public.pode_lancar() or public.tem_financeiro());
create policy "alterar" on public.anexos for update to authenticated
  using (public.pode_lancar() or public.tem_financeiro()) with check (public.pode_lancar() or public.tem_financeiro());

drop policy if exists "anexos arquivos: leitura" on storage.objects;
create policy "anexos arquivos: leitura" on storage.objects for select to authenticated using (
  bucket_id = 'anexos' and (
    public.pode_lancar() or public.papel_financeiro() in ('admin', 'pagador')
    or exists (select 1 from public.pedidos p where p.id = split_part(name, '/', 1) and p.dados -> 'criado' ->> 'id' = auth.uid()::text)
  )
);
drop policy if exists "anexos arquivos: enviar" on storage.objects;
create policy "anexos arquivos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (public.pode_lancar() or public.tem_financeiro()));
drop policy if exists "anexos arquivos: substituir" on storage.objects;
create policy "anexos arquivos: substituir" on storage.objects for update to authenticated
  using (bucket_id = 'anexos' and (public.pode_lancar() or public.tem_financeiro()))
  with check (bucket_id = 'anexos' and (public.pode_lancar() or public.tem_financeiro()));

-- 5. Tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null; end;
end $$;
