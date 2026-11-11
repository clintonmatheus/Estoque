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

As permissões foram testadas num Postgres local: `bash supabase/teste/rodar.sh`.

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
