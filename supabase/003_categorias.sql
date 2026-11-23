-- Atualização (rode uma vez no SQL Editor): a consulta de saldos passa a informar a categoria do item.
drop function if exists public.saldos();
create function public.saldos() returns table (item_id text, nome text, unidade text, embalagem jsonb, estoque_minimo numeric, categoria text, saldo numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.dados ->> 'nome', i.dados ->> 'unidade', i.dados -> 'embalagem',
         coalesce((i.dados ->> 'estoqueMinimo')::numeric, 0),
         i.dados ->> 'categoria',
         coalesce(sum(case m.dados ->> 'tipo'
           when 'entrada' then (m.dados ->> 'quantidade')::numeric
           when 'devolucao' then (m.dados ->> 'quantidade')::numeric
           when 'ajuste' then (m.dados ->> 'quantidade')::numeric
           when 'saida' then -(m.dados ->> 'quantidade')::numeric
           else 0 end), 0)
  from public.itens i
  left join public.movimentos m on m.dados ->> 'itemId' = i.id and m.dados -> 'cancelado' is null
  where auth.uid() is not null and coalesce((i.dados ->> 'ativo')::boolean, true)
  group by i.id
  order by 2
$$;
revoke all on function public.saldos() from public, anon;
grant execute on function public.saldos() to authenticated;
