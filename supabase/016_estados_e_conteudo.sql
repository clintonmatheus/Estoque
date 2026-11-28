-- Segurança dos pedidos e dos registros (achados da auditoria completa). Rode uma vez no SQL Editor do Supabase
-- "Estoque", depois da 015. É seguro rodar de novo.
-- 1) Pedido cancelado ou rejeitado fica congelado, pedido pago não muda de status e o status é obrigatório (só o
--    administrador sai dessas regras). Antes, um pagador podia cancelar o pedido trocando o aprovador, reabrir e pagar
--    sem o administrador, ou trocar a chave Pix nesse meio tempo.
-- 2) Todo registro gravado precisa ter o mesmo id dentro e fora do conteúdo, e os que têm autoria precisam trazê-la
--    completa. Antes, um registro malformado gravado direto na API travava a fila de pagamentos e o estoque de quem
--    sincronizava. Vale só para gravações novas: os registros que já existem não são conferidos.

-- 1. Estados do pedido
create or replace function public.proteger_estado() returns trigger
language plpgsql security definer set search_path = public as $$
declare novo text := new.dados ->> 'status'; antigo text;
begin
  if public.admin_financeiro() then return new; end if;
  if novo is null or novo not in ('enviado', 'aprovacao', 'pronto', 'pago', 'devolvido', 'rejeitado', 'cancelado') then
    raise exception 'Status do pedido inválido';
  end if;
  if tg_op = 'INSERT' then return new; end if;
  antigo := old.dados ->> 'status';
  if antigo in ('cancelado', 'rejeitado') and new.dados is distinct from old.dados then
    raise exception 'Pedido encerrado: só o administrador altera';
  end if;
  if antigo = 'pago' and novo <> 'pago' then raise exception 'Pedido pago não volta atrás: só o administrador altera'; end if;
  if novo = 'cancelado' and (
       new.dados ->> 'valor' is distinct from old.dados ->> 'valor'
       or new.dados ->> 'tipo' is distinct from old.dados ->> 'tipo'
       or new.dados ->> 'aprovador' is distinct from old.dados ->> 'aprovador') then
    raise exception 'Ao cancelar não se altera valor, tipo ou aprovação';
  end if;
  return new;
end $$;
drop trigger if exists proteger_estado on public.pedidos;
create trigger proteger_estado before insert or update on public.pedidos for each row execute function public.proteger_estado();


-- 2. Conteúdo coerente com a linha
create or replace function public.conferir_dados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(new.dados) is distinct from 'object' or new.dados ->> 'id' is distinct from new.id
     or new.id !~ '^[A-Za-z0-9_-]{1,100}$' then
    raise exception 'Registro inválido: o id do conteúdo precisa ser igual ao da linha';
  end if;
  if tg_table_name <> 'funcionarios' and (jsonb_typeof(new.dados -> 'criado') is distinct from 'object'
       or jsonb_typeof(new.dados -> 'criado' -> 'id') is distinct from 'string'
       or jsonb_typeof(new.dados -> 'criado' -> 'nome') is distinct from 'string'
       or jsonb_typeof(new.dados -> 'criado' -> 'em') is distinct from 'string') then
    raise exception 'Registro inválido: falta a autoria (criado)';
  end if;
  if tg_table_name in ('movimentos', 'movimentos_bens', 'compras') and coalesce(new.dados ->> 'data', '') !~ '^\d{4}-\d{2}-\d{2}' then
    raise exception 'Registro inválido: data ausente';
  end if;
  if tg_table_name = 'pedidos' and jsonb_typeof(new.dados -> 'historico') is distinct from 'array' then
    raise exception 'Registro inválido: pedido sem histórico';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['itens', 'locais', 'funcionarios', 'movimentos', 'anexos', 'bens', 'movimentos_bens', 'empresas',
    'contas', 'centros', 'fornecedores', 'tipos_despesa', 'encargos', 'pedidos', 'compras'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists conferir_dados on public.%I', t);
    execute format('create trigger conferir_dados before insert or update on public.%I for each row execute function public.conferir_dados()', t);
  end loop;
end $$;
