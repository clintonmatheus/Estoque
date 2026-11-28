-- Verificação (só consulta, não altera nada). Rode no SQL Editor do Supabase "Estoque".
-- Mostra, para cada script, se o que ele cria já existe. Rode de novo os que aparecerem como "FALTA", na ordem.
-- As verificações são por presença do que cada script cria; como todos podem ser repetidos sem risco, na dúvida rode de novo.
select script, case when ok then 'ok' else 'FALTA' end as situacao, o_que_confere
from (values
  ('001_esquema',            to_regclass('public.itens') is not null and to_regclass('public.movimentos') is not null and to_regclass('public.anexos') is not null, 'tabelas itens, movimentos e anexos'),
  ('002_usuarios',           exists (select 1 from public.perfis where papel <> 'nenhum'), 'algum perfil com papel definido'),
  ('003_categorias',         to_regprocedure('public.saldos()') is not null, 'função saldos()'),
  ('004_epi',                to_regprocedure('public.saldos()') is not null and exists (select 1 from pg_proc where proname = 'saldos' and prosrc ilike '%EPI%'), 'saldos() considera EPI'),
  ('005_equipamentos',       to_regclass('public.bens') is not null and to_regclass('public.movimentos_bens') is not null, 'tabelas bens e movimentos_bens'),
  ('006_financeiro_cadastros', to_regclass('public.centros') is not null and to_regclass('public.fornecedores') is not null and to_regclass('public.empresas') is not null, 'tabelas centros, fornecedores e empresas'),
  ('006b_perfis_financeiro', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfis' and column_name = 'financeiro') and exists (select 1 from public.perfis where financeiro is not null), 'coluna financeiro preenchida'),
  ('007_pedidos',            to_regclass('public.pedidos') is not null and exists (select 1 from pg_trigger where tgrelid = 'public.pedidos'::regclass and tgname = 'proteger'), 'tabela pedidos e seu gatilho de proteção'),
  ('008_compras',            to_regclass('public.compras') is not null and exists (select 1 from pg_trigger where tgrelid = 'public.compras'::regclass and tgname = 'proteger'), 'tabela compras e seu gatilho de proteção'),
  ('009_massa_corrida_fama', not exists (select 1 from public.itens where upper(dados ->> 'nome') = 'MASSA CORRIDA FAMA' and (dados ->> 'unidade' is distinct from 'saco' or dados -> 'embalagem' ->> 'nome' = 'balde')), 'massa corrida Fama em saco (ok também se o item não existir)'),
  ('010_pilares',            to_regprocedure('public.papel_estoque()') is not null and to_regprocedure('public.pode_pagar()') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfis' and column_name = 'paga'), 'funções papel_estoque e pode_pagar e coluna paga'),
  ('010b_perfis_pilares',    exists (select 1 from public.perfis where paga) and exists (select 1 from public.perfis where papel = 'consultor' and financeiro = 'admin'), 'perfis com paga e administradores definidos'),
  ('011_saldos_e_login',     (select pg_get_constraintdef(oid) ilike '%saldos%' from pg_constraint where conname = 'perfis_papel_check' and conrelid = 'public.perfis'::regclass) and not exists (select 1 from auth.users where lower(email) = 'construtorapassosrn@gmail.com'), 'papel saldos aceito e login antigo removido'),
  ('012_saldos_ferramentas', to_regprocedure('public.ve_ferramentas()') is not null, 'função ve_ferramentas'),
  ('013_auditoria_seguranca', to_regclass('public.auditoria') is not null and exists (select 1 from pg_trigger where tgname = 'auditar'), 'tabela auditoria e gatilhos de auditoria'),
  ('014_terceirizados',      exists (select 1 from pg_trigger where tgname = 'proteger_terceirizado'), 'gatilho de proteção do pagamento a terceirizado'),
  ('015_proteger_favorecido', exists (select 1 from pg_trigger where tgname = 'proteger_favorecido'), 'quem recebe não muda depois da conferência')
) as v (script, ok, o_que_confere)
order by script;

-- Pessoas e acessos (conferir se Daniel e Augusto aparecem com o papel certo)
select u.email, p.nome, p.papel as estoque, p.financeiro as pagamentos, p.paga
  from public.perfis p join auth.users u on u.id = p.id
 order by p.nome;
