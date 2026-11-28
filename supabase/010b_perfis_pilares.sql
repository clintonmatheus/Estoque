-- Papel de cada pessoa nos três pilares. Rode depois da 010 (pode rodar de novo quando mudar alguém).
-- Quem ainda não tem login (Augusto e Daniel): crie antes em Authentication → Users → Add user (marque "Auto Confirm User")
-- e troque EMAIL_DO_AUGUSTO e EMAIL_DO_DANIEL pelos e-mails reais. Linhas cujo e-mail ou nome não existe são ignoradas.
--
-- papel (estoque): admin, almoxarife, controle (EPI/ferramentas/locações), consultor (vê tudo), saldos (saldos do galpão e ferramentas), nenhum
-- financeiro (pagamentos): admin (aprova e vê o Financeiro), pagador (confere e paga), solicitante (pede)
-- paga: true para quem registra pagamentos (o pagador já paga; entre os administradores, só o Clinton)

-- Pelo e-mail
update public.perfis p
   set nome = v.nome, papel = v.papel, financeiro = v.financeiro, paga = v.paga
  from (values
    ('joanad.moura@hotmail.com', 'Joana',   'controle',  'pagador',     true),
    ('caioosouza6@gmail.com',    'Caio',    'saldos',    'solicitante', false),
    ('EMAIL_DO_DANIEL',          'Daniel',  'consultor', 'admin',       false),
    ('EMAIL_DO_AUGUSTO',         'Augusto', 'saldos',    'solicitante', false)
  ) as v (email, nome, papel, financeiro, paga)
  join auth.users u on lower(u.email) = lower(v.email)
 where p.id = u.id;

-- Quem já usa o app e está identificado pelo nome (Clinton, Marilia e Arthur).
-- Segurança: o nome vem do cadastro e qualquer um pode escolher o mesmo. Se houver mais de um perfil com o nome,
-- nenhum recebe o papel (confira a lista no fim e use o bloco do e-mail acima para essa pessoa).
update public.perfis p
   set papel = v.papel, financeiro = v.financeiro, paga = v.paga
  from (values
    ('Clinton', 'admin',      'admin',       true),
    ('Marilia', 'almoxarife', 'solicitante', false),
    ('Arthur',  'consultor',  'admin',       false)
  ) as v (nome, papel, financeiro, paga)
 where p.nome = v.nome
   and (select count(*) from public.perfis o where o.nome = v.nome) = 1;

-- Conferência: cada pessoa com o papel certo nos pilares
select u.email, p.nome, p.papel as estoque, p.financeiro as pagamentos, p.paga
  from public.perfis p join auth.users u on u.id = p.id
 order by p.nome;
