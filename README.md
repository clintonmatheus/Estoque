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
- **Relatórios novos (PDF e Excel):** ferramentas e equipamentos (onde está cada um), equipamentos locados e entrega de EPI por funcionário.
- Só admin e almoxarife veem e lançam; o consultor continua vendo apenas saldos de material.

## Financeiro — etapa 1: cadastros

Primeira etapa do sistema de pedidos de pagamento, centros de custo e conciliação (desenho completo no documento "Desenho — Pagamentos, Centros de Custo e Conciliação").

- **Perfis independentes do galpão:** `admin` (cadastra, aprova, vê tudo), `pagador` (paga e opera a folha; não vê relatórios nem despesas gerais) e `solicitante` (pede pagamentos). Quem só usa o financeiro entra direto na tela do financeiro e também consulta os saldos do galpão.
- **Cadastros:** empresas (ALN, Passos) e contas bancárias; centros de custo (a administração é uma só: qualquer empresa paga custos de qualquer centro; tipos Obra, Administração e Estoque/Galpão, com um só de Administração e um só de Galpão; situação Ativo ou Parado; "outros nomes" para as grafias das planilhas); frentes de serviço dentro de cada centro (as mesmas do estoque); fornecedores (CPF/CNPJ e chave Pix conferidos, forma Pix, Boleto ou Fatura semanal com dia de fechamento); tipos de despesa; **custos fixos mensais** de cada centro (ex.: Despesa geral de R$ 20.000 no RMG Água desde 08/2026; serão lançados todo mês na etapa 3); **encargos** (37,77% e 67,05% iniciais, editáveis em Financeiro → Encargos; cada mudança vale a partir de um mês e guarda o histórico).
- **Começar:** botão "Criar cadastros iniciais" (ALN e Passos com as contas informadas, os centros Administração e Estoque/Galpão, 19 tipos de despesa) ou a planilha `modelos/Cadastros_Financeiro.xlsx` (já vem com 13 centros e 21 frentes da lista de presença e dos caixas; as frentes do estoque com contrato conhecido são ligadas sozinhas). Importação em **Financeiro → Importar planilha**, com simulação e erros por aba e linha. Regerar o modelo: `python3 scripts/gerar_modelo_financeiro.py .`
- **Frentes antigas do estoque:** em Centros de custo, cada contrato digitado no estoque aparece para ser ligado a um centro (ou virar um centro novo).
- **Supabase:** rode `supabase/006_financeiro_cadastros.sql` (uma vez) e depois `supabase/006b_perfis_financeiro.sql` com os e-mails reais.

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
