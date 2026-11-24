-- Perfis do financeiro. Troque os e-mails pelos reais e rode no SQL Editor (pode rodar de novo quando mudar alguém).
-- admin: você e os outros dois administradores · pagador: quem paga e opera a folha · solicitante: quem pede pagamentos.
-- Quem ainda não tem login: crie antes em Authentication → Users → Add user (marque "Auto Confirm User").
-- O papel no galpão (admin, almoxarife, consultor) continua o mesmo; quem só usa o financeiro fica como consultor no galpão.
update public.perfis p set financeiro = v.financeiro
from (values
  ('EMAIL_DO_CLINTON',      'admin'),
  ('EMAIL_ADMINISTRADOR_2', 'admin'),
  ('EMAIL_ADMINISTRADOR_3', 'admin'),
  ('EMAIL_PAGADOR_1',       'pagador'),
  ('EMAIL_PAGADOR_2',       'pagador'),
  ('EMAIL_SOLICITANTE_1',   'solicitante')
) as v (email, financeiro)
join auth.users u on lower(u.email) = lower(v.email)
where p.id = u.id;

-- Para tirar alguém do financeiro: update public.perfis set financeiro = null where id = (select id from auth.users where email = 'EMAIL');

-- Conferência
select u.email, p.nome, p.papel as galpao, p.financeiro from public.perfis p join auth.users u on u.id = p.id order by p.financeiro nulls last, p.nome;
