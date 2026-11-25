\set ON_ERROR_STOP on
insert into public.itens (id, dados) values
  ('i-massa-corrida-fama', '{"id":"i-massa-corrida-fama","nome":"MASSA CORRIDA FAMA","unidade":"balde","embalagem":{"nome":"balde","fator":1}}'),
  ('i-massa-corrida-sbras', '{"id":"i-massa-corrida-sbras","nome":"MASSA CORRIDA SBRAS","unidade":"balde"}');
\i supabase/009_massa_corrida_fama_saco.sql
\i supabase/009_massa_corrida_fama_saco.sql
do $$ begin
  assert (select dados ->> 'unidade' from public.itens where id = 'i-massa-corrida-fama') = 'saco', 'Fama virou saco';
  assert (select dados -> 'embalagem' ->> 'nome' from public.itens where id = 'i-massa-corrida-fama') = 'saco', 'embalagem da Fama virou saco';
  assert (select dados ->> 'unidade' from public.itens where id = 'i-massa-corrida-sbras') = 'balde', 'outras massas não mudam';
end $$;
\echo 'Massa corrida Fama OK'
