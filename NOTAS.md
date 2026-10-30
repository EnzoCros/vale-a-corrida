# NOTAS — Vale a Corrida v2

Decisões e pontos para conferir. Nada foi commitado; está tudo como alteração local para você revisar.

## Como rodar

```bash
npm install
cp .env.example .env        # preencha DB_PASSWORD e troque o JWT_SECRET
npm start                   # http://localhost:3000
```

- O banco `vale_a_corrida` e as tabelas são criados sozinhos quando o servidor sobe (`CREATE ... IF NOT EXISTS`). Para criar sem subir o servidor, use `npm run db:init`.
- Evidências: com o servidor rodando, `npm run evidencias` (ou `BASE_URL=http://localhost:3100 npm run evidencias`). Cada execução cria um usuário novo (`joao.XXXXX`), então dá para rodar de novo sem limpar o banco.
- **Teste:** não sei a senha do root do seu MySQL80, então **não mexi nele**. Testei tudo numa instância MySQL 8.0 temporária (porta 3307, dados no diretório temporário da sessão), que já foi desligada. Para rodar na sua máquina, você só precisa preencher o `.env`.

## Estrutura

```
public/            front-end (servido pelo Express)
  index.html       3 telas: login/cadastro, veículo, painel
  styles.css       estilo original + telas novas + layout desktop (>= 980px em 2 colunas)
  app.js           lógica da interface; fala com a API via fetch
  calc.js          regras de cálculo, COMPARTILHADAS entre front e backend
  icon.png         ícone que antes estava em base64 dentro do HTML
server/
  index.js         Express + rotas + tratamento de erros
  db/schema.sql    tabelas
  db/index.js      pool mysql2 + initDatabase()
  middleware/auth.js  valida o JWT (Authorization: Bearer ...)
  routes/          auth, veiculos, corridas, dias
scripts/evidencias.js   Playwright (iPhone 390x844)
evidencias/        prints
```

O `index.html` saiu da raiz e foi para `public/` (via `git mv`, então o histórico continua).

## Rotas da API

Todas, menos cadastro e login, exigem `Authorization: Bearer <token>`. Os erros sempre voltam como `{ "erro": "mensagem" }`.

| Método | Rota | Corpo / observação |
|---|---|---|
| POST | `/api/auth/cadastro` | `{ nome, usuario, senha }` → `201 { token, usuario }` · 409 se o usuário já existir |
| POST | `/api/auth/login` | `{ usuario, senha }` → `{ token, usuario }` · 401 com mensagem genérica |
| GET | `/api/auth/me` | usuário logado + critérios + `veiculoAtivoId` |
| PUT | `/api/auth/me/config` | `{ amberKm, greenKm, amberH, greenH }` (critérios do semáforo) |
| PUT | `/api/auth/me/veiculo-ativo` | `{ veiculoId }` |
| GET | `/api/veiculos` | lista, com `custoKm` detalhado (combustível, manutenção, pneus, seguro, ipva, total) |
| GET | `/api/veiculos/:id` | |
| POST | `/api/veiculos` | cria; o primeiro veículo vira o ativo automaticamente |
| PUT | `/api/veiculos/:id` | edita |
| DELETE | `/api/veiculos/:id` | se era o ativo, passa a ser o mais antigo que sobrou |
| POST | `/api/corridas` | `{ veiculoId, app, km, valor, tempo, kmColeta?, tempoColeta?, status: "aceita"\|"recusada" }` |
| GET | `/api/corridas?limite=200` | mais recentes primeiro (máx. 1000) |
| DELETE | `/api/corridas` | "apagar histórico" (ver regra abaixo) |
| GET | `/api/dias` | `{ hoje, semana, dias[] }` |
| POST | `/api/dias/fechar` | "salvar dia" |

Os campos da API estão em camelCase e as colunas do banco em snake_case. A conversão fica em `paraJson()` em cada arquivo de rota.

## Tabelas (`server/db/schema.sql`)

- **usuarios**: `usuario` UNIQUE, `senha_hash` CHAR(60) em bcrypt, os 4 critérios do semáforo (`cfg_*`) e `veiculo_ativo_id`.
- **veiculos**: N por usuário (FK com `ON DELETE CASCADE`), `tipo` ENUM(carro, moto, bicicleta), `combustivel` ENUM(gasolina, etanol, diesel, gnv, eletrico, nenhum), preço e consumo, mais 4 pares opcionais `*_valor` / `*_km` (manutenção, pneus, seguro, IPVA).
- **corridas**: guarda os dados digitados, o app e uma **cópia do custo/km do veículo no momento da corrida** (`custo_km`), junto com o custo, o lucro, o lucro/km, o lucro/h e o veredito. Se você editar o veículo depois, o histórico antigo não muda. `veiculo_id` usa `ON DELETE SET NULL`, e `dia_id` fica NULL enquanto o dia está aberto.
- **dias**: uma linha por (usuário, data), com UNIQUE, somando ganho bruto, custo, lucro, km, minutos e corridas aceitas.

`usuarios.veiculo_ativo_id` **não tem FK**, porque isso criaria uma referência circular com `veiculos`. A consistência é garantida no código, na rota DELETE de veículos.

## Decisões que valem conferir

1. **Vírgula decimal.** O parser (`Calc.parseNum`) aceita `12,5`, `12.5`, `1.234,56`, `1,234.56` e `R$ 7,90`. Quando há um ponto sozinho seguido de exatamente 3 dígitos, ele é tratado como **milhar**: `10.000` = dez mil. Então `5.890` vira 5890, e não 5,89. Escolhi assim porque nos campos de km o padrão brasileiro é o mais comum. `5.89` e `0.500` continuam sendo lidos como decimais. Os campos numéricos também bloqueiam letras enquanto você digita.
2. **O semáforo agora usa o lucro líquido** (valor − km × custo/km), e não mais o valor bruto. Por isso mudei os critérios padrão para **R$/km 1,20 (amarelo) / 1,60 (verde)** e **R$/h 15 / 22**, contra 1,8/2,2 e 20/28 antes. Ajuste pela engrenagem ou mude o DEFAULT no schema.
3. **Combustível:** é obrigatório para carro e moto. A **bicicleta** não tem combustível nem IPVA (os dois blocos somem do formulário), mas pode ter manutenção, pneus e seguro. Tirei a opção **"a pé"** (você pediu carro/moto/bicicleta) e o combustível **"flex"**: quem tem carro flex escolhe o que está abastecendo. **GNV** usa R$/m³ e km/m³, e **elétrico** usa R$/kWh e km/kWh.
4. **Custos extras:** em cada item, o valor e o km vão juntos. Preencher só um dos dois dá erro de validação, porque do contrário a conta ficaria silenciosamente errada.
5. **Apps de entrega:** coloquei chips para iFood, Uber, 99, Rappi, Lalamove, Loggi, inDrive e Outro, e o app fica salvo em cada corrida. Também criei os campos opcionais **"Até a coleta" (km/min)**, porque Uber e 99 mostram separado o deslocamento até o passageiro ou a coleta, e esse trecho também gasta combustível. O custo e o R$/h consideram o total.
6. Troquei o texto do amarelo, que era **"No limite — sai pro destrava"**, por **"No limite — avalie bem"**. Entendi que era gíria de um app específico. Se não era, é só voltar em `ROTULOS` no `app.js`.
7. **"Hoje" e o histórico de dias:** o card "Hoje" soma as corridas aceitas de hoje que ainda não foram fechadas. Os dias anteriores que ficarem abertos são fechados sozinhos quando o painel carrega (como o app antigo fazia na virada do dia). Se você "salvar dia" duas vezes no mesmo dia, os valores são somados na mesma linha de `dias`.
8. **"Apagar histórico"** apaga as corridas, **menos as aceitas do dia em aberto**, porque são elas que formam o card "Hoje". Os totais de `dias` não são afetados.
9. **localStorage:** agora ele guarda **só o token JWT**. Todos os dados estão no MySQL. Por isso removi o card de **exportar/importar backup** (ele existia porque o Safari podia apagar os dados) e troquei o rodapé.
10. **Autenticação:** bcrypt com 10 rounds, senha entre 6 e 72 bytes (72 é o limite do bcrypt), e usuário em minúsculas `[a-z0-9._-]{3,40}`. O JWT vale 7 dias (`JWT_EXPIRES_IN`) e não tem refresh token: quando expira, o app volta para o login com um aviso. O servidor não sobe sem `JWT_SECRET`.
11. **O backend recalcula** o custo e o veredito de cada corrida com o `calc.js`. Ele não confia nos números calculados pelo front.
12. **Datas:** o "dia" de cada corrida usa o fuso local do servidor.
13. **Confirmações** ("salvar dia", "apagar histórico", "excluir veículo") continuam com o `confirm()` nativo, como no app original.

## Evidências (`evidencias/`)

Todas foram tiradas em viewport de iPhone 390x844 (deviceScaleFactor 3), com app, API e MySQL reais.

| Arquivo | Seção |
|---|---|
| 01-campos-decimais-com-virgula.png | 1 — valores `8,5` / `21,90` calculados |
| 02-tela-login.png | 2 |
| 03-tela-cadastro-usuario.png | 2 |
| 04-primeiro-acesso-leva-ao-cadastro-de-veiculo.png | 2 — redirecionamento sem veículo |
| 05-cadastro-veiculo-custo-operacional.png | 3 — todos os custos extras e o custo/km total |
| 06-seletor-multiplos-veiculos.png | 4 — carro + moto no seletor |
| 07-editar-veiculo-pelo-lapis.png | 4 — edição pelo lápis |
| 08-historico-persistido-no-banco.png | 5 — depois de sair e entrar de novo, com dia salvo e corridas |
| 09-corrida-uber-com-deslocamento-ate-coleta.png | 6 — Uber com km/min até a coleta |
| 10-painel-principal-corrida-calculada.png | painel completo |

**Ressalva:** os prints foram gerados no fim, num único roteiro automatizado sobre o app pronto, e não um a um conforme cada seção ficava pronta. A numeração segue as seções, não a ordem de execução do script. O layout desktop não tem print em `evidencias/` porque você pediu todos em viewport de celular, mas eu verifiquei em 1440x900: ficam duas colunas, com a calculadora à esquerda e Hoje/Histórico à direita.

## Comentários no código

Seguindo seu pedido no meio do trabalho, os arquivos que criei ou editei **depois** dele estão sem comentários: `app.js`, `scripts/evidencias.js`, `styles.css` e `index.html` (removi os comentários antigos desses dois). Os arquivos criados **antes** do pedido ainda têm comentários: `server/**/*.js`, `server/db/schema.sql`, `public/calc.js` e `.env.example`. Se quiser, eu tiro de todos.
