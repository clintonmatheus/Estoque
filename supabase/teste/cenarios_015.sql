-- Cenários da 015 (quem recebe não muda depois da conferência). Roda depois de cenarios_014.sql
-- (usuários: Joana pagadora ...b1, Daniel admin ...d1, Augusto solicitante ...e1, Clinton admin ...ad).
\set ON_ERROR_STOP on
\i supabase/015_proteger_favorecido.sql
\i supabase/015_proteger_favorecido.sql
set role authenticated;

-- Augusto (solicitante) pede R$ 1.000 por Pix; Joana confere e corrige o fornecedor ainda na conferência (permitido)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
insert into public.pedidos (id, dados) values ('fv1', '{"id":"fv1","tipo":"pix","status":"enviado","valor":1000,"aprovador":"admin","favorecido":"Loja A","chavePix":"11111111111","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"A","em":"2026-11-28T10:00:00Z"},"historico":[]}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
update public.pedidos set dados = dados || '{"status":"aprovacao","fornecedorId":"f-loja-a"}' where id = 'fv1';

-- Daniel (administrador) aprova
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
update public.pedidos set dados = dados || '{"status":"pronto"}' where id = 'fv1';

-- Joana não troca a chave Pix nem o favorecido do pedido aprovado (nem por upsert, como o app grava)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  begin
    update public.pedidos set dados = dados || '{"chavePix":"99999999999"}' where id = 'fv1';
    raise exception 'FALHA: pagadora trocou a chave Pix depois da aprovação';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
  begin
    insert into public.pedidos (id, dados) select 'fv1', dados || '{"favorecido":"Outra pessoa","status":"pago"}' from public.pedidos where id = 'fv1'
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: pagadora trocou o favorecido ao pagar';
  exception when raise_exception then
    if sqlerrm like 'FALHA%' then raise; end if;
  end;
end $$;

-- Joana paga normalmente (sem mudar quem recebe)
update public.pedidos set dados = dados || '{"status":"pago","pagamento":{"valor":1000}}' where id = 'fv1';

-- O administrador ainda pode corrigir quem recebe
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
update public.pedidos set dados = dados || '{"favorecido":"Loja A Ltda"}' where id = 'fv1';
reset role;

do $$ begin
  assert (select dados ->> 'chavePix' from public.pedidos where id = 'fv1') = '11111111111', 'chave Pix original mantida';
  assert (select dados ->> 'status' from public.pedidos where id = 'fv1') = 'pago', 'pagamento registrado';
  assert (select dados ->> 'favorecido' from public.pedidos where id = 'fv1') = 'Loja A Ltda', 'administrador corrigiu';
end $$;

-- Quem não fez login não chama as funções auxiliares
set role anon;
do $$ begin
  begin
    perform public.aprovador_exigido('pix', 10, null);
    raise exception 'FALHA: anônimo chamou aprovador_exigido';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'CENÁRIOS DA 015 PASSARAM' as resultado;
