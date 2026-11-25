-- Três pilares: papéis de estoque (controle, consultor, nenhum) e quem paga. Roda depois da 010.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000b1', 'joana@x.com', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', 'daniel@x.com', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', 'augusto@x.com', '{}');
do $$ begin
  assert (select papel from public.perfis where id = '00000000-0000-0000-0000-0000000000e1') = 'nenhum', 'login novo começa sem acesso ao estoque';
end $$;
update public.perfis set papel = 'controle', financeiro = 'pagador', paga = true where id = '00000000-0000-0000-0000-0000000000b1';
update public.perfis set papel = 'consultor', financeiro = 'admin', paga = false where id = '00000000-0000-0000-0000-0000000000d1';
update public.perfis set papel = 'nenhum', financeiro = 'solicitante' where id = '00000000-0000-0000-0000-0000000000e1';
update public.perfis set paga = true where id = '00000000-0000-0000-0000-0000000000ad';
do $$ begin
  begin
    update public.perfis set papel = 'chefe' where id = '00000000-0000-0000-0000-0000000000e1';
    raise exception 'FALHA: aceitou papel inválido';
  exception when check_violation then null; end;
end $$;

set role authenticated;
-- Almoxarife cadastra um material e um EPI e lança
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.itens (id, dados) values
  ('p-cimento', '{"id":"p-cimento","nome":"CIMENTO","unidade":"sc","ativo":true}'),
  ('p-luva', '{"id":"p-luva","nome":"LUVA","unidade":"par","ativo":true,"categoria":"EPI"}');
insert into public.movimentos (id, dados) values
  ('p-m1', '{"id":"p-m1","tipo":"entrada","itemId":"p-cimento","quantidade":10}'),
  ('p-m2', '{"id":"p-m2","tipo":"entrada","itemId":"p-luva","quantidade":10}');
insert into public.anexos (id, dados) values ('p-a1', '{"id":"p-a1","grupo":"p-m1","formato":"imagem"}');
insert into storage.objects (bucket_id, name) values ('anexos', 'p-m1/p-a1.jpg');

-- Joana (controle): EPI, ferramentas, funcionários e locações sim; materiais não
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
do $$ begin
  assert (select count(*) from public.itens where id in ('p-cimento', 'p-luva')) = 2, 'controle vê materiais e EPI';
  assert (select count(*) from storage.objects where name = 'p-m1/p-a1.jpg') = 1, 'controle vê foto do estoque';
end $$;
insert into public.movimentos (id, dados) values ('p-m3', '{"id":"p-m3","tipo":"epi","itemId":"p-luva","quantidade":1,"funcionarioId":"z"}');
insert into public.itens (id, dados) values ('p-bota', '{"id":"p-bota","nome":"BOTA","unidade":"par","ativo":true,"categoria":"EPI"}');
insert into public.itens (id, dados) values ('p-bota', '{"id":"p-bota","nome":"BOTA 40","unidade":"par","ativo":true,"categoria":"EPI"}')
  on conflict (id) do update set dados = excluded.dados;
insert into public.funcionarios (id, dados) values ('p-f1', '{"id":"p-f1","nome":"ZE","ativo":true,"grupo":"epi"}');
insert into public.bens (id, dados) values ('p-b1', '{"id":"p-b1","nome":"BETONEIRA","tipo":"locado","controle":"unidade","ativo":true}');
insert into public.movimentos_bens (id, dados) values ('p-mb1', '{"id":"p-mb1","bemId":"p-b1","quantidade":1,"origem":{"tipo":"externo"},"destino":{"tipo":"galpao"}}');
do $$ begin
  begin
    insert into public.movimentos (id, dados) values ('p-x1', '{"id":"p-x1","tipo":"saida","itemId":"p-cimento","quantidade":1}');
    raise exception 'FALHA: controle lançou material';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.movimentos (id, dados) values ('p-m1', '{"id":"p-m1","tipo":"entrada","itemId":"p-cimento","quantidade":99}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: controle alterou lançamento de material';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.itens (id, dados) values ('p-areia', '{"id":"p-areia","nome":"AREIA","unidade":"m3","ativo":true}');
    raise exception 'FALHA: controle cadastrou material';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.itens (id, dados) values ('p-cimento', '{"id":"p-cimento","nome":"CIMENTO","unidade":"sc","ativo":true,"categoria":"EPI"}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: controle transformou material em EPI';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.locais (id, dados) values ('p-l1', '{"id":"p-l1","nome":"OBRA","ativo":true}');
    raise exception 'FALHA: controle criou frente';
  exception when insufficient_privilege then null; end;
end $$;

-- Daniel (consultor + admin que não paga): vê o estoque, não lança
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
do $$ begin
  assert (select count(*) from public.movimentos where id like 'p-m%') = 3, 'consultor vê os lançamentos';
  assert (select count(*) from public.bens where id = 'p-b1') = 1, 'consultor vê ferramentas e locações';
  begin
    insert into public.movimentos (id, dados) values ('p-x2', '{"id":"p-x2","tipo":"epi","itemId":"p-luva","quantidade":1}');
    raise exception 'FALHA: consultor lançou EPI';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.bens (id, dados) values ('p-x3', '{"id":"p-x3","nome":"X","ativo":true}');
    raise exception 'FALHA: consultor cadastrou ferramenta';
  exception when insufficient_privilege then null; end;
end $$;

-- Augusto (só pagamentos): não vê o estoque; abre pedido e anexa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  assert (select count(*) from public.itens) = 0, 'sem estoque não vê itens';
  assert (select count(*) from storage.objects where name = 'p-m1/p-a1.jpg') = 0, 'sem estoque não vê fotos do estoque';
end $$;
insert into public.pedidos (id, dados) values
  ('p-p1', '{"id":"p-p1","tipo":"pix","status":"enviado","valor":100,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"Augusto"},"historico":[]}');
insert into public.anexos (id, dados) values ('p-a2', '{"id":"p-a2","grupo":"p-p1","formato":"pdf"}');
insert into storage.objects (bucket_id, name) values ('anexos', 'p-p1/p-a2.pdf');
do $$ begin
  assert (select count(*) from storage.objects where name = 'p-p1/p-a2.pdf') = 1, 'solicitante vê o arquivo do próprio pedido';
end $$;

-- Almoxarife que não é do financeiro não vê arquivo de pedido
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.anexos where id = 'p-a2') = 0, 'FALHA: almoxarife viu anexo de pedido';
  assert (select count(*) from storage.objects where name = 'p-p1/p-a2.pdf') = 0, 'FALHA: almoxarife viu arquivo de pedido';
end $$;

-- Daniel confere, mas não paga
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
insert into public.pedidos (id, dados) values
  ('p-p1', '{"id":"p-p1","tipo":"pix","status":"pronto","valor":100,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"Augusto"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin
  assert (select count(*) from storage.objects where name = 'p-p1/p-a2.pdf') = 1, 'administrador vê arquivo de pedido';
  begin
    insert into public.pedidos (id, dados) values
      ('p-p1', '{"id":"p-p1","tipo":"pix","status":"pago","valor":100,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"Augusto"},"historico":[]}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: administrador que não paga registrou pagamento';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- Joana paga
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
insert into public.pedidos (id, dados) values
  ('p-p1', '{"id":"p-p1","tipo":"pix","status":"pago","valor":100,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000e1","nome":"Augusto"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.pedidos where id = 'p-p1') = 'pago', 'pagadora pagou'; end $$;
reset role;
\echo 'Três pilares OK'
