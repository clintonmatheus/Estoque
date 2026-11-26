-- Pagamento a terceirizado: o pagamento sai primeiro e as notas fiscais chegam depois (lista "terceirizado" dentro do pedido).
-- Rode uma vez no SQL Editor do Supabase "Estoque", depois da 013. É seguro rodar de novo.
-- Regras no servidor: só pagador ou administrador abre esse tipo de pedido e lança, remove ou encerra notas; as notas só entram
-- depois do pagamento (pedido "pago"); depois da conferência o pedido não vira nem deixa de ser de terceirizado.
create or replace function public.proteger_terceirizado() returns trigger
language plpgsql security definer set search_path = public as $$
declare novo jsonb := new.dados -> 'terceirizado'; antigo jsonb;
begin
  -- Upsert de pedido que já existe chega aqui como INSERT; as regras rodam no gatilho de UPDATE.
  if tg_op = 'INSERT' and exists (select 1 from public.pedidos x where x.id = new.id) then return new; end if;
  antigo := case when tg_op = 'UPDATE' then old.dados -> 'terceirizado' else null end;
  if novo is not distinct from antigo then return new; end if;
  if novo is not null and coalesce(public.papel_financeiro() in ('admin', 'pagador'), false) is not true then
    raise exception 'Só o pagador ou o administrador lança pagamento a terceirizado ou suas notas';
  end if;
  if novo is not null and jsonb_array_length(coalesce(novo -> 'notas', '[]'::jsonb)) > 0 and new.dados ->> 'status' <> 'pago' then
    raise exception 'As notas do terceirizado só entram depois do pagamento';
  end if;
  if tg_op = 'UPDATE' and (antigo is null) <> (novo is null) and old.dados ->> 'status' not in ('enviado', 'devolvido') then
    raise exception 'Depois da conferência o pedido não muda para (nem deixa de ser) pagamento a terceirizado';
  end if;
  return new;
end $$;
drop trigger if exists proteger_terceirizado on public.pedidos;
create trigger proteger_terceirizado before insert or update on public.pedidos for each row execute function public.proteger_terceirizado();
