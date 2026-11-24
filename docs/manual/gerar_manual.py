"""Gera o HTML do manual de treinamento (depois convertido em PDF pelo Chromium).
Uso: python3 gerar_manual.py <pasta_das_telas> <saida.html>"""
import sys
TELAS, SAIDA = sys.argv[1], sys.argv[2]

def tela(nome, legenda=''):
    return f'<figure class="tel"><img src="{TELAS}/{nome}.png"><figcaption>{legenda}</figcaption></figure>'

def bloco(texto, *imgs):
    return f'<div class="bloco"><div class="imgs">{"".join(imgs)}</div><div class="txt">{texto}</div></div>'

def dica(t): return f'<div class="nota dica"><b>Dica.</b> {t}</div>'
def atencao(t): return f'<div class="nota atencao"><b>Atenção.</b> {t}</div>'
def secao(n, titulo, intro=''):
    return f'<section class="sec"><div class="num">{n}</div><h1>{titulo}</h1>{f"<p class=intro>{intro}</p>" if intro else ""}'

h = []
h.append('''
<div class="capa">
  <div class="faixa"></div>
  <div class="capa-txt">
    <div class="sobre">Manual de uso e treinamento</div>
    <h1 class="titulo">Estoque do Galpão</h1>
    <p class="sub">Materiais, ferramentas, equipamentos locados e EPI — na palma da mão.</p>
    <div class="perfis-capa">
      <div><b>Almoxarife</b><span>lança entradas, saídas, movimentações e entregas</span></div>
      <div><b>Administrador</b><span>tudo da almoxarife, cadastros e correções</span></div>
      <div><b>Consultor</b><span>consulta saldos de material</span></div>
    </div>
  </div>
  <div class="capa-img">''' + tela('02_estoque') + '''</div>
  <div class="rodape-capa">Versão de novembro de 2026 · as telas usam dados de exemplo</div>
</div>
''')

h.append('''<section class="sec sumario"><h1>Conteúdo</h1><ol class="indice">
<li>Para que serve e quem usa</li><li>Como o app funciona (internet e sincronização)</li><li>Primeiro acesso</li>
<li>Aba Estoque — consultar saldos</li><li>Aba Lançar — entradas, saídas, devoluções e transferências</li>
<li>Aba Equipamentos — ferramentas e locados</li><li>Aba EPI — entregas, trocas e ficha</li>
<li>Mais — histórico, relatórios, cadastros, inventário e importação</li><li>Consultor — consulta de saldos</li>
<li>Rotina recomendada</li><li>Dúvidas frequentes</li><li>Guia rápido (1 página)</li></ol>
<div class="nota dica"><b>Como usar este manual no treinamento.</b> Siga a ordem: cada capítulo mostra a tela real e os passos.
Para a almoxarife, os capítulos 4 a 8 e 10 são os principais. Para consultores, basta o capítulo 9. Ao final há um guia rápido de uma página para imprimir e deixar no galpão.</div>
</section>''')

h.append(secao(1, 'Para que serve e quem usa', 'O app controla tudo o que entra e sai do galpão, quanto custou e para qual obra foi — além de onde está cada ferramenta e equipamento locado, e a entrega de EPI aos funcionários.'))
h.append('''
<table class="tab"><tr><th>O que controla</th><th>Como</th></tr>
<tr><td>Materiais (tintas, revestimentos, louças, fechaduras…)</td><td>Saldo por item, custo pelo PEPS (o primeiro que entra é o primeiro que sai) e valor por frente de serviço / centro de custo.</td></tr>
<tr><td>Ferramentas próprias</td><td>Cada unidade (ex.: Furadeira 03) ou por quantidade, com quem está e em qual obra, com prazo de devolução.</td></tr>
<tr><td>Equipamentos locados (andaimes, escoras, sapatas, pisos)</td><td>Peças por obra, contrato, valor, prazo e alerta quando estão numa obra diferente da que a locadora cobra.</td></tr>
<tr><td>EPI</td><td>Entrega por funcionário, com nº do CA, tamanho e data de troca.</td></tr></table>
<h2>Perfis de acesso</h2>
<table class="tab"><tr><th>Perfil</th><th>Pode</th><th>Não pode</th></tr>
<tr><td><b>Almoxarife</b> (Marilia)</td><td>Lançar entradas, saídas, devoluções, transferências, EPI, movimentar equipamentos, inventário, importar planilha, corrigir e cancelar lançamentos.</td><td>—</td></tr>
<tr><td><b>Administrador</b> (Clinton)</td><td>Tudo o que a almoxarife faz. Cria os acessos no servidor.</td><td>—</td></tr>
<tr><td><b>Consultor</b> (Arthur, Joana)</td><td>Ver saldos de material e itens abaixo do mínimo.</td><td>Ver valores (R$), lançar ou ver equipamentos.</td></tr></table>
''' + dica('Quem precisa de material e não encontra a almoxarife manda uma foto do pedido pelo WhatsApp. Depois, a almoxarife ou o administrador lança a saída e anexa essa foto.') + '</section>')

h.append(secao(2, 'Como o app funciona', 'O app guarda tudo primeiro no próprio celular e envia ao servidor quando há internet. Por isso funciona mesmo no galpão sem sinal.'))
h.append('''<ul class="lista">
<li><b>Sem internet:</b> pode lançar normalmente. Os lançamentos ficam na fila do aparelho.</li>
<li><b>Com internet:</b> a fila é enviada sozinha em poucos segundos, e o que outros lançaram chega no seu aparelho.</li>
<li><b>Onde ver:</b> no topo de cada tela aparece "Sincronizado às 11:58" ou "Sincronizando…". Em <b>Mais</b> há o botão <b>Atualizar</b> para forçar.</li>
<li><b>Correções ficam registradas:</b> nada é apagado. Um lançamento errado é <b>cancelado com motivo</b> ou <b>editado</b>, e o app guarda quem fez e quando.</li>
<li><b>Saldo negativo é bloqueado:</b> o app não deixa sair mais do que existe — nem de material, nem de peças de equipamento.</li>
</ul>''' + atencao('Não desinstale o app nem limpe os dados com lançamentos ainda não sincronizados (verifique se aparece "Sincronizado").') + '</section>')

h.append(secao(3, 'Primeiro acesso', ''))
h.append(bloco('''<ol class="passos">
<li>Instale o app enviado pelo administrador (Android: arquivo APK; iPhone: instalação indicada pelo administrador).</li>
<li>Abra e entre com o <b>e-mail</b> e a <b>senha</b> criados pelo administrador.</li>
<li>Na primeira vez o app baixa os dados do servidor (precisa de internet). Depois funciona sem internet.</li>
<li>Para sair da conta: <b>Mais → Sair</b>.</li></ol>''' + dica('Esqueceu a senha? Peça ao administrador para redefinir.'), tela('01_login', 'Tela de entrada')) + '</section>')

h.append(secao(4, 'Aba Estoque — consultar saldos', 'Mostra cada item com a quantidade em destaque à direita.'))
h.append(bloco('''<ul class="lista">
<li><b>Buscar:</b> digite parte do nome ("delanil gelo", "massa 25").</li>
<li><b>Cartões do topo:</b> total de itens, <b>Zerados</b> e <b>Abaixo do mínimo</b>. Toque no cartão para filtrar.</li>
<li><b>Filtros prontos:</b> Com saldo, Zerados, Abaixo do mínimo, Parados (sem saída há 60 dias) e por categoria (Pintura, Elétrica, Hidráulica…).</li>
<li><b>Valor em estoque:</b> soma do valor dos itens no galpão (pelo custo PEPS).</li></ul>''', tela('02_estoque', 'Lista de itens'), tela('03_estoque_minimo', 'Filtro "Abaixo do mínimo"')))
h.append(bloco('''<p>Toque em um item para ver os <b>lotes</b> (quantidade e preço de cada compra, na ordem em que serão usados) e os <b>últimos lançamentos</b>.</p>''' +
    dica('O estoque mínimo de cada item é definido em Mais → Cadastros. Quando o saldo fica abaixo dele, o item aparece em laranja.'), tela('04_estoque_detalhe', 'Detalhe do item')) + '</section>')

h.append(secao(5, 'Aba Lançar', 'Escolha o tipo no topo: Saída, Entrada, Devolução ou Transferência.'))
h.append(bloco('''<h2>Saída (galpão → frente de serviço)</h2><ol class="passos">
<li>Toque em <b>Saída</b>. Confira a data (pode mudar para lançar um dia anterior).</li>
<li>Escolha a <b>frente de serviço (destino)</b> — o custo vai para ela e para o centro de custo do contrato.</li>
<li>Escolha <b>quem retirou</b>.</li>
<li>Toque em <b>+ Adicionar item</b>, busque e escolha. O app mostra o saldo no galpão. Digite a quantidade. Repita para cada item.</li>
<li>Se houver pedido pelo WhatsApp, anexe a foto em <b>Foto do pedido</b> (galeria ou câmera).</li>
<li>Toque em <b>Registrar saída</b>.</li></ol>''' + atencao('Se a quantidade for maior que o saldo, o app avisa "Saldo insuficiente" e não grava. Confira se faltou lançar uma entrada.'),
    tela('05_saida', 'Saída preenchida'), tela('06_saida_fim', 'Foto do pedido e botão Registrar')))
h.append(bloco('''<h2>Entrada (compra ou sobra sem obra de origem)</h2><ol class="passos">
<li>Toque em <b>Entrada</b>. Informe a <b>nota fiscal</b> e o <b>fornecedor</b>.</li>
<li>Adicione os itens com a <b>quantidade</b> e o <b>valor unitário</b> da nota. O total aparece embaixo.</li>
<li>Itens vendidos em caixa (ex.: revestimento) podem ser lançados em <b>caixas</b>: o app converte em peças.</li>
<li>Toque em <b>Registrar entrada</b>.</li></ol>''' + dica('Massa corrida da mesma marca em embalagens diferentes (ex.: 5 kg e 25 kg) são itens diferentes. Escolha o item da embalagem certa.'),
    tela('07_entrada', 'Entrada com nota fiscal')))
h.append('''<h2>Devolução e transferência</h2><ul class="lista">
<li><b>Devolução:</b> sobra que volta de uma frente para o galpão. Escolha a frente de origem; o valor é abatido do custo daquela frente.</li>
<li><b>Transferência:</b> material que passa de uma frente para outra sem voltar ao galpão. Escolha origem e destino; o custo muda de frente.</li></ul></section>''')

h.append(secao(6, 'Aba Equipamentos — ferramentas e locados', 'Cada ferramenta ou equipamento tem uma posse: no galpão, ou com uma pessoa (mestre/encarregado) em uma frente de serviço. Toda mudança é registrada no app.'))
h.append(bloco('''<ul class="lista">
<li><b>Filtros:</b> Todos, Ferramentas, Locados e <b>Alertas</b>.</li>
<li>Itens individuais mostram onde estão; itens por quantidade mostram o total e a divisão (ex.: Galpão 40 · Riachuelo 40 · Pedra Grande 20).</li>
<li>O <b>número vermelho</b> na aba indica quantos itens têm alerta.</li></ul>
<h3>Alertas</h3><ul class="lista">
<li><b>Devolução atrasada:</b> ferramenta individual passou da data "Devolver até".</li>
<li><b>Locação vence / vencida:</b> faltam 7 dias ou menos para o fim previsto do contrato.</li>
<li><b>Peças em outra obra que a cobrada:</b> a locadora cobra numa obra, mas há peças em outra. Corrija a movimentação ou avise o setor de compras/contratos.</li></ul>''',
    tela('08_equipamentos', 'Lista de equipamentos'), tela('12_equip_alertas', 'Filtro Alertas')))
h.append(bloco('''<h2>Cadastrar (levantamento)</h2><ol class="passos">
<li>Toque em <b>+ Cadastrar ferramenta ou equipamento</b>.</li>
<li>Escolha <b>Ferramenta</b> ou <b>Equipamento locado</b>, o nome e o código da unidade (se houver).</li>
<li><b>Como controlar:</b> <i>Cada peça (individual)</i> para ferramentas como furadeiras e serras; <i>Por quantidade</i> para escoras, andaimes, sapatas, carrinhos.</li>
<li>Locado: preencha <b>locadora</b>, contrato, valor por peça (dia ou mês), início, fim previsto e a <b>obra em que a locadora cobra</b>.</li>
<li>Em <b>Onde está agora</b>, informe a quantidade e se está no galpão ou com quem/em qual obra. Toque em <b>Salvar</b>.</li></ol>''' +
    dica('Para cadastrar muitos itens de uma vez, use a planilha de levantamento (capítulo 8, Importar planilha).'),
    tela('13_cadastro_locado', 'Dados do equipamento locado'), tela('14_cadastro_posse', 'Onde está agora')))
h.append(bloco('''<h2>Movimentar (galpão ↔ obra, obra → obra, devolução à locadora)</h2><ol class="passos">
<li>Toque no equipamento. Veja <b>onde estão</b> as peças.</li>
<li>Em <b>Movimentar</b>, informe a quantidade (itens por quantidade) e <b>de onde sai</b>.</li>
<li>Escolha <b>para onde vai</b>: Pessoa em obra (escolha a pessoa e a frente), Galpão, Devolver à locadora, Perdido ou Baixa.</li>
<li>Ferramenta individual indo para obra: informe <b>Devolver até</b> (o app sugere 7 dias).</li>
<li>Toque em <b>Registrar movimentação</b>.</li></ol>''',
    tela('09_equip_detalhe', 'Detalhe com alertas e posses'), tela('10_equip_movimentar', 'Movimentar 20 peças para a UBS')))
h.append(bloco('''<p>O <b>Histórico</b> no fim da tela mostra todas as movimentações, com data, observação e quem lançou. Um lançamento errado é cancelado em <b>Cancelar lançamento</b>, informando o motivo; o app não deixa cancelar se isso deixar alguma posse negativa.</p>''' +
    atencao('Empréstimo de uma obra para outra também deve ser lançado (Pessoa em obra → outra pessoa/obra). É isso que evita fatura de locação cobrada na obra errada.'),
    tela('11_equip_historico', 'Histórico de movimentações')) + '</section>')

h.append(secao(7, 'Aba EPI', 'Três partes: Entregar, Trocas e Ficha do funcionário.'))
h.append(bloco('''<h3>Entregar</h3><ol class="passos">
<li>Escolha o <b>funcionário que recebeu</b>.</li>
<li>Adicione o EPI (ex.: bota, luva) e a quantidade.</li>
<li>Preencha <b>nº do CA</b>, <b>tamanho</b> e <b>trocar em</b> (data de validade/troca).</li>
<li>Toque em <b>Registrar entrega de EPI</b>.</li></ol>
<p>A entrega baixa o estoque do galpão, mas <b>não entra no custo das frentes de serviço</b>.</p>''', tela('15_epi_entregar', 'Entrega de EPI')))
h.append(bloco('''<ul class="lista"><li><b>Trocas:</b> EPIs vencidos ou que vencem em até 30 dias. Vale só a última entrega de cada item a cada funcionário.</li>
<li><b>Ficha do funcionário:</b> tudo o que a pessoa recebeu, com data, CA, tamanho e troca.</li></ul>''' +
    dica('A empresa continua usando a ficha de EPI em papel com assinatura. O app serve para controle e consulta rápida.'),
    tela('16_epi_trocas', 'Trocas vencidas/próximas'), tela('17_epi_ficha', 'Ficha do funcionário')) + '</section>')

h.append(secao(8, 'Mais', 'Histórico, Relatórios, Cadastros, Inventário e Importar planilha.'))
h.append(bloco('''<h2>Histórico</h2><ul class="lista">
<li>Lista de todos os lançamentos de material, com filtros por tipo.</li>
<li>Toque em um lançamento para <b>editar</b> dados (data, frente, quem retirou, nota…) ou uma linha (quantidade, custo).</li>
<li><b>Cancelar</b> exige motivo. O lançamento fica riscado, com quem cancelou.</li></ul>''' +
    atencao('Corrigir sempre pelo Histórico, nunca lançando "ao contrário". Assim o custo das obras fica certo.'),
    tela('18_mais', 'Menu Mais'), tela('20_historico_detalhe', 'Detalhe de uma saída')))
h.append(bloco('''<h2>Relatórios (PDF e Excel)</h2><ul class="lista">
<li><b>Saldo atual:</b> quantidade, custo médio e valor de cada item.</li>
<li><b>Material por centro de custo:</b> quanto (R$) foi para cada frente/contrato no período, já descontadas as devoluções.</li>
<li><b>Histórico do item:</b> todas as movimentações de um item no período.</li>
<li><b>Ferramentas e equipamentos</b> (onde está cada um) e <b>Equipamentos locados</b> (contrato, prazo, peças em outra obra).</li>
<li><b>Entrega de EPI</b> por funcionário.</li></ul>''', tela('21_relatorios', 'Relatórios de material'), tela('22_relatorios_2', 'Equipamentos e EPI')))
h.append(bloco('''<h2>Cadastros</h2><ul class="lista">
<li><b>Itens:</b> nome, unidade, embalagem (ex.: caixa com 11 peças), estoque mínimo, categoria.</li>
<li><b>Frentes de serviço:</b> cada obra/frente com seu centro de custo (contrato).</li>
<li><b>Funcionários:</b> quem retira material e quem fica com equipamentos.</li>
<li>Nada é apagado: cadastros sem uso são <b>desativados</b>.</li></ul>
<h2>Inventário</h2><ul class="lista"><li>Conte o galpão, digite a quantidade contada de cada item, revise as diferenças e confirme. O app lança os ajustes.</li></ul>''',
    tela('23_cadastros', 'Cadastros'), tela('24_inventario', 'Inventário')))
h.append(bloco('''<h2>Importar planilha (levantamento geral)</h2><ol class="passos">
<li>Toque em <b>Baixar planilha modelo</b> (ou use o arquivo enviado pelo administrador).</li>
<li>Preencha as abas: <b>Frentes de serviço</b>, <b>Funcionários</b>, <b>Materiais</b> (quantidade contada e custo) e <b>Equipamentos</b> (com quem e em qual obra). A aba Instruções explica cada coluna.</li>
<li>No app, informe a <b>data do levantamento</b> e toque em <b>Escolher planilha</b>.</li>
<li>O app confere tudo sem gravar e mostra <b>o que será importado</b> ou os <b>erros com aba e linha</b>.</li>
<li>Sem erros, toque em <b>Importar agora</b>.</li></ol>''' +
    atencao('Item que já tem saldo no app não é importado de novo — para corrigir, use o Inventário.'), tela('25_importar', 'Importar planilha')) + '</section>')

h.append(secao(9, 'Consultor — consulta de saldos', ''))
h.append(bloco('''<ul class="lista">
<li>O consultor vê a lista de itens com o saldo atual, os zerados e os abaixo do mínimo, com busca e filtros.</li>
<li>Não vê valores (R$), não lança e não vê equipamentos.</li>
<li>A consulta precisa de internet. Toque em <b>Atualizar saldos</b> para ver o mais recente.</li>
<li>Precisa de material? Peça à almoxarife (ou mande a foto do pedido pelo WhatsApp).</li></ul>''', tela('26_consultor', 'Tela do consultor')) + '</section>')

h.append(secao(10, 'Rotina recomendada', ''))
h.append('''<table class="tab"><tr><th>Quando</th><th>O quê</th></tr>
<tr><td><b>Todo dia</b></td><td>Lançar no mesmo dia todas as entradas (com NF) e saídas (com quem retirou e a frente). Lançar pedidos recebidos por WhatsApp com a foto. Registrar toda ferramenta/equipamento que saiu, voltou ou mudou de obra.</td></tr>
<tr><td><b>Toda semana</b></td><td>Ver o número vermelho das abas Equipamentos e EPI: cobrar devoluções atrasadas, programar trocas de EPI, avisar compras sobre locações vencendo. Conferir o filtro Abaixo do mínimo para pedir reposição.</td></tr>
<tr><td><b>Todo mês</b></td><td>Gerar o relatório Material por centro de custo do mês (para o financeiro) e Equipamentos locados (para conferir as faturas das locadoras).</td></tr>
<tr><td><b>A cada 3 meses</b></td><td>Fazer o inventário do galpão (Mais → Inventário).</td></tr></table></section>''')

h.append(secao(11, 'Dúvidas frequentes', ''))
faq = [
  ('Lancei com quantidade errada. E agora?', 'Mais → Histórico → toque no lançamento → Editar na linha do item. Se o lançamento inteiro estiver errado, Cancelar com motivo.'),
  ('Apareceu "Saldo insuficiente".', 'O app não deixa o estoque ficar negativo. Verifique se a entrada (nota) foi lançada, ou se o item certo foi escolhido (ex.: embalagem diferente).'),
  ('Não aparece o que outra pessoa lançou.', 'Veja no topo se está "Sincronizado". Sem internet, os dados chegam quando o sinal voltar. Em Mais, toque em Atualizar.'),
  ('Uma escora foi emprestada de uma obra para outra.', 'Equipamentos → escora → Movimentar: de "pessoa · obra A" para "Pessoa em obra" (pessoa · obra B).'),
  ('Devolvemos parte dos andaimes à locadora.', 'Equipamentos → andaime → Movimentar a quantidade devolvida, de onde estava, para "Devolver à locadora".'),
  ('Uma ferramenta sumiu.', 'Movimente para "Perdido" com uma observação. Ela sai do controle, mas o histórico fica guardado.'),
  ('Quem trabalha sem a almoxarife precisa de material.', 'Manda foto do pedido pelo WhatsApp; a almoxarife ou o administrador lança a saída e anexa a foto.'),
  ('O revestimento é comprado em caixa e usado em peças.', 'O item é controlado em peças; na entrada e na saída dá para informar em caixas e o app converte.'),
]
h.append('<div class="faq">' + ''.join(f'<div class="q"><b>{q}</b><p>{a}</p></div>' for q, a in faq) + '</div></section>')

h.append('''<section class="sec rapido"><h1>Guia rápido</h1><p class="intro">Para imprimir e deixar no galpão.</p>
<div class="grade">
<div class="cx"><h3>Saída de material</h3><p>Lançar → Saída → frente → quem retirou → + Adicionar item → quantidade → (foto do pedido) → Registrar saída.</p></div>
<div class="cx"><h3>Entrada (compra)</h3><p>Lançar → Entrada → nota fiscal e fornecedor → itens com quantidade e valor unitário → Registrar entrada.</p></div>
<div class="cx"><h3>Sobra voltou da obra</h3><p>Lançar → Devolução → frente de origem → itens → Registrar.</p></div>
<div class="cx"><h3>Material de uma obra para outra</h3><p>Lançar → Transferência → origem e destino → itens → Registrar.</p></div>
<div class="cx"><h3>Ferramenta/equipamento saiu ou mudou de obra</h3><p>Equipamentos → item → Movimentar → de onde sai → para onde vai (pessoa e obra) → Registrar.</p></div>
<div class="cx"><h3>Devolução à locadora</h3><p>Equipamentos → item locado → Movimentar → quantidade → "Devolver à locadora".</p></div>
<div class="cx"><h3>Entrega de EPI</h3><p>EPI → Entregar → funcionário → item → CA, tamanho, trocar em → Registrar.</p></div>
<div class="cx"><h3>Corrigir um lançamento</h3><p>Mais → Histórico → lançamento → Editar (ou Cancelar com motivo).</p></div>
<div class="cx"><h3>Números vermelhos</h3><p>Equipamentos: atraso, locação vencendo ou peças em outra obra. EPI: trocas a fazer.</p></div>
<div class="cx"><h3>Relatórios</h3><p>Mais → Relatórios → escolha → PDF ou Excel.</p></div>
</div>
<div class="nota atencao"><b>Regra de ouro.</b> Tudo o que sai, entra ou muda de lugar é lançado no app, no mesmo dia. Sem internet também funciona.</div>
</section>''')

CSS = '''
@page { size: A4; margin: 14mm 15mm 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: Inter, 'Open Sans', sans-serif; color: #1C1C1E; font-size: 10.2pt; line-height: 1.45; margin: 0; }
h1 { font-size: 20pt; margin: 0 0 4mm; letter-spacing: -0.3px; color: #1C1C1E; }
h2 { font-size: 13pt; margin: 5mm 0 2mm; color: #1F5F8B; }
h3 { font-size: 11pt; margin: 3mm 0 1mm; }
p { margin: 0 0 2mm; }
.sec { page-break-before: always; }
.num { display: inline-block; background: #1F5F8B; color: #fff; font-weight: 800; border-radius: 6px; padding: 1mm 3mm; font-size: 10pt; margin-bottom: 2mm; }
.intro { font-size: 11pt; color: #3F4752; margin-bottom: 4mm; }
.bloco { margin: 3mm 0 5mm; break-inside: avoid; page-break-inside: avoid; overflow: hidden; }
.bloco .txt { overflow: hidden; }
.bloco .imgs { float: right; margin-left: 6mm; white-space: nowrap; }
.bloco .imgs .tel { display: inline-block; vertical-align: top; margin-left: 4mm; white-space: normal; }
.bloco .imgs .tel:first-child { margin-left: 0; }
.bloco .txt > h2:first-child { margin-top: 0; }
.tel { margin: 0; width: 50mm; text-align: center; }
.tel img { width: 50mm; border-radius: 4mm; border: 0.6mm solid #333; box-shadow: 0 1mm 3mm rgba(0,0,0,.15); display: block; }
.tel figcaption { font-size: 8pt; color: #6B7280; margin-top: 1.5mm; }
.passos, .lista { padding-left: 5mm; margin: 0 0 2mm; }
.passos li, .lista li { margin-bottom: 1.6mm; }
.nota { border-radius: 3mm; padding: 2.5mm 3.5mm; margin: 3mm 0; font-size: 9.6pt; page-break-inside: avoid; }
.dica { background: #E3EEF6; border-left: 1.2mm solid #1F5F8B; }
.atencao { background: #FDEDE3; border-left: 1.2mm solid #C2410C; }
.tab { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.6pt; page-break-inside: avoid; }
.tab th { background: #333; color: #fff; text-align: left; padding: 2mm 2.5mm; }
.tab td { border-bottom: 0.3mm solid #E3E6EA; padding: 2mm 2.5mm; vertical-align: top; }
.indice { font-size: 12pt; line-height: 2; padding-left: 7mm; }
.faq .q { border-bottom: 0.3mm solid #E3E6EA; padding: 2.5mm 0; page-break-inside: avoid; }
.faq .q p { margin: 1mm 0 0; color: #3F4752; }
.grade { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.cx { border: 0.4mm solid #D3D8DE; border-radius: 3mm; padding: 2.5mm 3.5mm; page-break-inside: avoid; }
.cx h3 { margin: 0 0 1mm; color: #1F5F8B; font-size: 10.5pt; }
.cx p { margin: 0; font-size: 9.4pt; }
.capa { position: relative; height: 265mm; overflow: hidden; }
.capa .faixa { position: absolute; left: 0; right: 0; top: 0; height: 118mm; background: #333; border-radius: 5mm; }
.capa-txt { position: relative; color: #fff; padding: 18mm 0 0 9mm; width: 112mm; }
.capa .sobre { font-size: 11pt; color: #C4C7CC; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
.capa .titulo { font-size: 34pt; color: #fff; margin: 3mm 0 3mm; line-height: 1.05; }
.capa .sub { font-size: 12.5pt; color: #E3E6EA; }
.perfis-capa { margin-top: 52mm; color: #1C1C1E; display: grid; gap: 3mm; }
.perfis-capa div { border-left: 1.2mm solid #1F5F8B; padding-left: 3mm; }
.perfis-capa b { display: block; font-size: 11pt; }
.perfis-capa span { color: #6B7280; font-size: 9.5pt; }
.capa-img { position: absolute; right: 9mm; top: 20mm; }
.capa-img .tel, .capa-img .tel img { width: 62mm; }
.rodape-capa { position: absolute; bottom: 0; left: 9mm; color: #6B7280; font-size: 9pt; }
'''
open(SAIDA, 'w', encoding='utf-8').write(f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{"".join(h)}</body></html>')
print('ok')
