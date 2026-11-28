-- Segurança dos pagamentos. Rode uma vez no SQL Editor do Supabase "Estoque", depois da 014. É seguro rodar de novo.
-- 1) Depois que o pedido sai da conferência (aguardando aprovação, pronto para pagar ou pago), quem recebe o dinheiro
--    (fornecedor, favorecido, chave Pix e boleto) só muda pelo administrador. Antes, um pagador podia trocar a chave
--    Pix de um pedido já aprovado. Para corrigir, devolva o pedido: ele volta à conferência e, se o valor exigir,
--    precisa ser aprovado de novo.
-- 2) As funções auxiliares deixam de responder a quem não fez login.

create or replace function public.proteger_favorecido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.dados ->> 'status' in ('aprovacao', 'pronto', 'pago') and not public.admin_financeiro() and (
       new.dados ->> 'fornecedorId' is distinct from old.dados ->> 'fornecedorId'
       or new.dados ->> 'favorecido' is distinct from old.dados ->> 'favorecido'
       or new.dados ->> 'chavePix' is distinct from old.dados ->> 'chavePix'
       or new.dados ->> 'boleto' is distinct from old.dados ->> 'boleto') then
    raise exception 'Só o administrador muda quem recebe depois da conferência: devolva o pedido para corrigir';
  end if;
  return new;
end $$;
drop trigger if exists proteger_favorecido on public.pedidos;
create trigger proteger_favorecido before update on public.pedidos for each row execute function public.proteger_favorecido();

-- Funções auxiliares: só para quem fez login (o padrão do Postgres libera para todos, inclusive sem login)
do $$
declare f text;
begin
  foreach f in array array['pode_lancar()', 'papel_financeiro()', 'tem_financeiro()', 'admin_financeiro()',
    'aprovador_exigido(text, numeric, uuid)', 'papel_estoque()', 've_estoque()', 'opera_controle()', 'pode_pagar()',
    'item_eh_epi(text)', 'anexo_de_pagamento(text)', 'anexo_meu(text)', 've_ferramentas()'] loop
    if to_regprocedure('public.' || f) is null then continue; end if;
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
