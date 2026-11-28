-- Cenários da 016 (estados do pedido e conteúdo coerente). Roda por último, depois de cenarios_015.sql e da restauração
-- (usuários: Joana pagadora ...b1, Augusto solicitante ...e1; o pedido fv1 já está pago).
\set ON_ERROR_STOP on
\i supabase/016_estados_e_conteudo.sql
\i supabase/016_estados_e_conteudo.sql
set role authenticated;
-- Desvio pelo status "cancelado": a pagadora não cancela trocando o aprovador, não reabre um cancelado, não tira o status
-- e não volta um pedido pago. (Achado da auditoria: assim ela pagava sem o administrador e trocava a chave Pix.)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
insert into public.pedidos (id, dados) values ('fv2', '{"id":"fv2","tipo":"pix","status":"enviado","valor":1000,"aprovador":"admin","favorecido":"Loja B","chavePix":"22222222222","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-28T10:00:00Z"},"historico":[]}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  begin
    update public.pedidos set dados = dados || '{"status":"cancelado","aprovador":"pagador"}' where id = 'fv2';
    raise exception 'FALHA: pagadora cancelou trocando o aprovador';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = (dados - 'status') || '{"aprovador":"nenhum"}' where id = 'fv2';
    raise exception 'FALHA: pagadora tirou o status do pedido';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
-- cancelar sem mexer em mais nada continua permitido; depois disso o pedido fica congelado
update public.pedidos set dados = dados || '{"status":"cancelado"}' where id = 'fv2';
do $$ begin
  begin
    update public.pedidos set dados = dados || '{"status":"aprovacao"}' where id = 'fv2';
    raise exception 'FALHA: pagadora reabriu um pedido cancelado';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = dados || '{"chavePix":"99999999999"}' where id = 'fv2';
    raise exception 'FALHA: pagadora trocou a chave Pix de um pedido cancelado';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = dados || '{"status":"cancelado"}' where id = 'fv1';
    raise exception 'FALHA: pagadora tirou um pedido do pago';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
-- pedido novo sem status não entra
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  begin
    insert into public.pedidos (id, dados) values ('fv3', '{"id":"fv3","tipo":"pix","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-28T10:00:00Z"},"historico":[]}');
    raise exception 'FALHA: entrou pedido sem status';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert (select dados ->> 'status' from public.pedidos where id = 'fv2') = 'cancelado', 'cancelado continua cancelado';
  assert (select dados ->> 'aprovador' from public.pedidos where id = 'fv2') = 'admin', 'aprovador não mudou';
  assert (select dados ->> 'chavePix' from public.pedidos where id = 'fv2') = '22222222222', 'chave Pix não mudou';
end $$;


-- Registro malformado gravado direto na API (sem o app) é recusado
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  begin
    insert into public.pedidos (id, dados) values ('fv4', '{"id":"fv4","tipo":"pix","status":"enviado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1"},"historico":[]}');
    raise exception 'FALHA: entrou pedido sem data de criação';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    insert into public.pedidos (id, dados) values ('fv5', '{"id":"outro","tipo":"pix","status":"enviado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-28T10:00:00Z"},"historico":[]}');
    raise exception 'FALHA: entrou pedido com id diferente no conteúdo';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
-- pedido normal continua entrando
insert into public.pedidos (id, dados) values ('fv6', '{"id":"fv6","tipo":"pix","status":"enviado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-28T10:00:00Z"},"historico":[]}');
reset role;
select 'CENÁRIOS DA 016 PASSARAM' as resultado;
