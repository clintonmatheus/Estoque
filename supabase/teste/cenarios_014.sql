-- Pagamento a terceirizado. Roda depois de cenarios_pilares.sql (usuários: Joana pagadora ...b1, Daniel admin ...d1, Augusto solicitante ...e1, Clinton admin ...ad).
\set ON_ERROR_STOP on
set role authenticated;

-- Solicitante não abre pedido de terceirizado
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  begin
    insert into public.pedidos (id, dados) values ('t0', '{"id":"t0","tipo":"pix","status":"enviado","valor":50,"aprovador":"nenhum","terceirizado":{"notas":[]},"criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-25T10:00:00Z"},"historico":[]}');
    raise exception 'FALHA: solicitante abriu pedido de terceirizado';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- Clinton (administrador) abre, confere e paga; depois lança as notas
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.pedidos (id, dados) values ('t1', '{"id":"t1","tipo":"pix","status":"enviado","valor":5000,"aprovador":"admin","terceirizado":{"notas":[]},"criado":{"id":"00000000-0000-0000-0000-0000000000ad","nome":"C","em":"2026-11-25T10:00:00Z"},"historico":[]}');
do $$ begin
  begin
    update public.pedidos set dados = jsonb_set(dados, '{terceirizado,notas}', '[{"id":"n1","numero":"1","valor":100}]') where id = 't1';
    raise exception 'FALHA: nota entrou antes do pagamento';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;
update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 't1';
update public.pedidos set dados = jsonb_set(dados, '{status}', '"pago"') where id = 't1';
update public.pedidos set dados = jsonb_set(dados, '{terceirizado,notas}', '[{"id":"n1","numero":"1","valor":3000}]') where id = 't1';

-- Joana (pagadora) lança outra nota via upsert (como o app grava)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
insert into public.pedidos (id, dados) select 't1', jsonb_set(dados, '{terceirizado}', '{"notas":[{"id":"n1","numero":"1","valor":3000},{"id":"n2","numero":"2","valor":2000}],"encerrada":{"por":{"id":"x"}}}')
  from public.pedidos where id = 't1'
  on conflict (id) do update set dados = excluded.dados;
do $$ begin
  assert (select jsonb_array_length(dados -> 'terceirizado' -> 'notas') from public.pedidos where id = 't1') = 2, 'pagadora lançou a nota';
end $$;

-- Daniel (administrador que não paga) também lança nota; Augusto (solicitante) não vê nem altera
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
update public.pedidos set dados = jsonb_set(dados, '{terceirizado,encerrada,justificativa}', '"ok"') where id = 't1';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  assert (select count(*) from public.pedidos where id = 't1') = 0, 'solicitante não vê o pedido de terceirizado dos outros';
  update public.pedidos set dados = jsonb_set(dados, '{terceirizado,notas}', '[]') where id = 't1';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ begin
  assert (select jsonb_array_length(dados -> 'terceirizado' -> 'notas') from public.pedidos where id = 't1') = 2, 'solicitante não conseguiu apagar as notas';
end $$;

-- Pedido comum não vira terceirizado depois de conferido
insert into public.pedidos (id, dados) values ('t2', '{"id":"t2","tipo":"pix","status":"enviado","valor":100,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000ad","nome":"C","em":"2026-11-25T10:00:00Z"},"historico":[]}');
update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 't2';
do $$ begin
  begin
    update public.pedidos set dados = jsonb_set(dados, '{terceirizado}', '{"notas":[]}') where id = 't2';
    raise exception 'FALHA: pedido conferido virou terceirizado';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;
select 'cenarios_014 ok' as resultado;
