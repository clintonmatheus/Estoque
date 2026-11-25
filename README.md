# Estoque do galpão

App (Android, iPhone e navegador) para controlar materiais, ferramentas e EPIs do galpão: entradas com nota fiscal,
saídas para as frentes de serviço, devoluções, transferências, inventário e relatórios em PDF e Excel.

## Como funciona

- **Custo PEPS:** o primeiro material que entra é o primeiro que sai (20 un a R$ 50 e depois 10 a R$ 52 → as 20 primeiras saem a R$ 50).
- **Centro de custo:** cada frente de serviço (ex.: Riachuelo) pertence a um contrato (ex.: Escritórios da RMG). O relatório mostra quanto (R$) foi para cada frente e contrato.
- **Devolução:** a sobra volta ao galpão pelo custo médio do que estava na frente, e esse valor é abatido da frente.
- **Saldo nunca negativo:** saída, devolução, edição ou cancelamento que deixaria saldo negativo é bloqueado.
- **Embalagens:** cada tamanho é um item (massa 18 L ≠ massa 25 kg). Itens fracionados (revestimento) são controlados em peças, com entrada/saída também em caixas.
- **Correções:** almoxarife e administrador editam ou cancelam (com motivo); fica registrado quem alterou e quando.
- **Foto do pedido:** na ausência da almoxarife, o pedido chega por foto (WhatsApp) e é anexado à saída.
- **Papéis:** administrador e almoxarife lançam e veem valores; consultor só vê saldos (sem R$), com internet.
- **Sem internet:** no celular, tudo é gravado no aparelho e enviado quando houver conexão. No navegador, precisa de internet.

## Supabase (uma vez)

1. **SQL Editor → New query:** cole `supabase/001_esquema.sql` e clique em **Run**.
2. **Authentication → Users → Add user:** crie os 4 usuários (marque *Auto Confirm User*).
3. **SQL Editor → New query:** cole `supabase/002_usuarios.sql`, troque os e-mails e clique em **Run**. A consulta no final deve listar os 4 com o papel certo.
4. Entre no app como administrador → **Mais → Cadastros → Importar lista da planilha** (45 itens) e cadastre as frentes de serviço e os funcionários.
5. **Mais → Inventário:** faça a contagem inicial. Ela vira o saldo de partida, valorizado pelo custo da planilha.

**Atualização (categorias):** quem já rodou o `001`, rode também `supabase/003_categorias.sql` (uma vez).

**Atualização (Financeiro, etapa 1):** rode `supabase/006_financeiro_cadastros.sql` e depois `supabase/006b_perfis_financeiro.sql` (troque os e-mails).

**Atualização (três pilares e perfis):** rode `supabase/010_pilares.sql` e depois `supabase/010b_perfis_pilares.sql` (troque os e-mails do Daniel e do Augusto). Gere o APK novo e publique a versão web.

**Atualização (Financeiro, etapa 2 — pedidos de pagamento e fatura semanal):** rode, nesta ordem, `supabase/007_pedidos.sql` e `supabase/008_compras.sql` (depois da 006). Gere o APK novo (inclui a câmera para ler boletos) e publique a versão web.

**Atualização (Etapa 2 — equipamentos e EPI):** rode também, uma vez cada, `supabase/004_epi.sql` (o saldo do consultor passa a descontar o EPI entregue) e `supabase/005_equipamentos.sql` (tabelas de ferramentas/equipamentos locados e suas movimentações).

As permissões foram testadas num Postgres local: `bash supabase/teste/rodar.sh`.

## Etapa 2: equipamentos e EPI

- **Aba Equipamentos:** ferramentas próprias e equipamentos locados (andaimes, escoras, sapatas, pisos...). Cada um tem uma **posse atual**: no galpão, com uma pessoa (mestre/encarregado) em uma frente de serviço, ou fora da empresa. Toda mudança (galpão → obra, obra → obra, volta ao galpão, devolução à locadora, perda/baixa) é uma movimentação registrada com data e autor, e pode ser cancelada com motivo.
  - **Controle:** cada peça individual (ex.: Furadeira 03, com data prevista de devolução e alerta de atraso) ou por quantidade (ex.: 120 escoras, divididas entre galpão e obras). O app bloqueia tirar mais peças do que há na posse.
  - **Levantamento geral:** "+ Cadastrar" já pede onde o item está agora.
  - **Locados:** locadora, nº do contrato, valor por peça (dia ou mês), início, fim previsto e a obra em que a locadora cobra. Alertas: locação vencida/vencendo (7 dias) e **peças em obra diferente da cobrada**.
  - O número vermelho na aba mostra quantos itens têm alerta; o filtro "Alertas" lista só eles.
- **Aba EPI:** *Entregar* (funcionário, CA, tamanho e data de troca; baixa o estoque pelo PEPS, sem custo por centro de custo), *Trocas* (vencidos ou a vencer em 30 dias) e *Ficha do funcionário*.
- **Mais:** Histórico, Relatórios, Cadastros e Inventário.
- **EPI separado do material (não precisa de SQL novo):** item de EPI é o item com categoria "EPI"; funcionário de EPI é um grupo à parte de quem retira material do galpão. Ao lançar EPI só aparecem itens e funcionários de EPI, e as telas de material não mostram EPI. A aba EPI também tem *Estoque de EPI*, *Compra* e *Inventário*. Cadastros em Mais → Cadastros (*Itens de EPI* e *Funcionários de EPI*) ou pelas planilhas em Mais → Importar EPI (`modelos/Funcionarios_EPI.xlsx` e `modelos/Itens_EPI.xlsx`, gerados por `scripts/gerar_modelo_epi.py`). O cadastro do item guarda CA, vida útil (sugere a data de troca) e tamanhos; o do funcionário guarda CPF, função e tamanhos usuais, que só sugerem na entrega. Quem já recebeu EPI e nunca retirou material passa sozinho para o grupo de EPI na primeira abertura.
- **Relatórios novos (PDF e Excel):** ferramentas e equipamentos (onde está cada um), equipamentos locados e entrega de EPI por funcionário.
- Só admin e almoxarife veem e lançam; o consultor continua vendo apenas saldos de material.

## Financeiro — etapa 1: cadastros

Primeira etapa do sistema de pedidos de pagamento, centros de custo e conciliação (desenho completo no documento "Desenho — Pagamentos, Centros de Custo e Conciliação").

- **Perfis independentes do galpão:** `admin` (cadastra, aprova, vê tudo), `pagador` (paga e opera a folha; não vê relatórios nem despesas gerais) e `solicitante` (pede pagamentos). Quem só usa o financeiro entra direto na tela do financeiro e também consulta os saldos do galpão.
- **Cadastros:** empresas (ALN, Passos) e contas bancárias; centros de custo (a administração é uma só: qualquer empresa paga custos de qualquer centro; tipos Obra, Administração e Estoque/Galpão, com um só de Administração e um só de Galpão; situação Ativo ou Parado; "outros nomes" para as grafias das planilhas); frentes de serviço dentro de cada centro (as mesmas do estoque); fornecedores (CPF/CNPJ e chave Pix conferidos, forma Pix, Boleto ou Fatura semanal com dia de fechamento); tipos de despesa; **custos fixos mensais** de cada centro (ex.: Despesa geral de R$ 20.000 no RMG Água desde 08/2026; serão lançados todo mês na etapa 3); **encargos** (37,77% e 67,05% iniciais, editáveis em Financeiro → Encargos; cada mudança vale a partir de um mês e guarda o histórico).
- **Começar:** botão "Criar cadastros iniciais" (ALN e Passos com as contas informadas, os centros Administração e Estoque/Galpão, 19 tipos de despesa) ou a planilha `modelos/Cadastros_Financeiro.xlsx` (já vem com 13 centros e 21 frentes da lista de presença e dos caixas; as frentes do estoque com contrato conhecido são ligadas sozinhas). Importação em **Financeiro → Importar planilha**, com simulação e erros por aba e linha. Regerar o modelo: `python3 scripts/gerar_modelo_financeiro.py .`
- **Frentes antigas do estoque:** em Centros de custo, cada contrato digitado no estoque aparece para ser ligado a um centro (ou virar um centro novo).
- **Supabase:** rode `supabase/006_financeiro_cadastros.sql` (uma vez) e depois `supabase/006b_perfis_financeiro.sql` com os e-mails reais.


## Financeiro — etapa 2: pedidos de pagamento
- **Fluxo:** solicitante abre o pedido → pagador/administrador **confere** e classifica → **aprova** (quando o valor exige) → **pagador paga** e registra empresa, conta, valor, data e comprovante. Cada passo fica no histórico; um pedido é um pagamento (sem parcelas).
- **Tipos:** Pix, Boleto e Reembolso. Centro de custo obrigatório; frente de serviço e tipo de despesa opcionais (a conferência corrige).
- **Aprovação:** até R$ 300 não precisa; acima, só administrador. Reembolso: até R$ 150 o pagador aprova, acima só administrador. Pedido aberto pelo pagador sempre vai a um administrador.
- **Quem vê:** solicitante só os seus; pagador e administrador veem todos. O servidor (Supabase) aplica as mesmas regras.
- **Leitura de documentos:** linha digitável/código de barras do boleto (confere dígitos, preenche valor e vencimento), **XML da NF-e** (fornecedor pelo CNPJ, valor, vencimento, número e chave; avisa quando a nota tem várias parcelas) e anexos PDF/foto. Pedido repetido (mesmo boleto, mesma nota ou mesmo favorecido, valor e data) é barrado ou pede confirmação.
- **Onde fica:** quem só usa o financeiro entra em "Pedidos"; quem também usa o galpão acha em Mais → Pedidos de pagamento.
- **Mais formas de ler o boleto:** câmera (código de barras, só no celular), PDF (acha a linha digitável dentro do texto do PDF; PDF escaneado, que é só imagem, não tem texto: digite ou use a câmera) e XML de NFS-e (padrões ABRASF e nacional) além da NF-e. Toda leitura confere os dígitos verificadores.
- **Fatura semanal (compras a faturar):** em lojas cadastradas com forma "Fatura semanal", almoxarife, solicitante, pagador e administrador lançam cada compra (loja, valor, centro de custo, **nota ou foto obrigatória**). O pagador/administrador fecha a fatura da loja: marca as compras, informa o valor cobrado (boleto ou Pix) e o sistema gera **um pedido de pagamento**. Se o valor da fatura difere da soma das compras, é preciso justificar. Cancelar ou rejeitar o pedido devolve as compras à lista em aberto. O centro de custo do pedido é o da maior compra; a divisão por centro fica nas compras (usada no livro de custos, etapa 3).
- **Supabase:** rode `supabase/008_compras.sql` depois da 007.

## Levantamento e treinamento

- **Planilha de levantamento:** `modelos/Levantamento_Estoque.xlsx` (frentes, funcionários, materiais com saldo inicial, ferramentas e locados). Importação em **Mais → Importar planilha**: o app simula, lista erros com aba e linha e só grava sem erros. Regerar o modelo: `python3 scripts/gerar_modelo_planilha.py .`
- **Manual em PDF:** `docs/Manual_Estoque.pdf` (como regerar em `docs/manual/LEIAME.md`).

## Instalar

No GitHub, aba **Actions**:
- **Gerar app Android (APK)** → Run workflow → baixe o artefato e instale no celular.
- **Gerar app iPhone (.ipa sem assinatura)** → instale com o Sideloadly.
- **Publicar versão para computador (web)** → publica no GitHub Pages (`https://clintonmatheus.github.io/Estoque/`). Em repositório privado, o GitHub Pages exige plano pago.

## Desenvolvimento

```
npm install
npm test          # testes
npm run typecheck
npx expo start
```

## Pilares e perfis
O rodapé mostra só os pilares a que a pessoa tem acesso: **Estoque** (materiais, EPI, ferramentas e locações), **Pagamentos** (pedidos e compras a faturar), **Financeiro** (cadastros e custos) e **Conta** (acessos, sincronizar, sair).

| Pessoa | Estoque (`papel`) | Pagamentos (`financeiro`) | Paga (`paga`) | Financeiro |
|---|---|---|---|---|
| Clinton | admin: tudo | admin: pede, confere, aprova | sim | sim |
| Arthur, Daniel | consultor: só consulta | admin: pede, confere, aprova | não | sim |
| Marilia | almoxarife: tudo | solicitante: pede | — | não |
| Joana | controle: EPI, ferramentas e locações (materiais só consulta) | pagador: pede, confere e paga | sim | não |
| Caio, Augusto | nenhum | solicitante: pede | — | não |

As mesmas regras valem no servidor (RLS): o controle só grava itens/lançamentos de EPI, funcionários, ferramentas e locações; o consultor só lê; só quem `paga` marca um pedido como pago; arquivos de pedidos e compras ficam visíveis só para pagador/administrador e para quem os lançou. Login novo começa sem acesso (`nenhum`) até o administrador definir o perfil.

## EPI por tamanho
Item de EPI com "tamanhos disponíveis" tem o saldo separado por tamanho: a compra, a entrega e o inventário pedem o tamanho, e nenhum tamanho pode ficar negativo. Na planilha de itens de EPI, o saldo inicial de um item com tamanhos é escrito assim: `38: 2; 39: 3; 40: 4`. Saldo antigo, lançado antes do controle por tamanho, aparece como "sem tamanho" e é zerado no primeiro inventário de EPI contado por tamanho.
