# O roadmap

Este é o documento que dirige o trabalho todo. Ele viveu em
`~/.claude/plans/` — fora de qualquer repo, sem exit condition validada e sem
estar em nenhuma ordem de execução, que é exatamente o problema que a fase 12
descreve: o sf não via o plano que dirige o sf. Agora vê.

Está em português porque foi escrito assim, e traduzir 800 linhas não é o
trabalho de hoje. O resto do repositório é em inglês.

## Onde cada fase está

| Fase | Estado | O que responde por ela |
| :-- | :-- | :-- |
| 1 a 5 | entregues | os guardrails, o log, a config por plugin, a contabilidade do agente e o relay estão de pé e cobertos por teste |
| 6 | entregue, com a resposta trocada | [what runs is not this repo](what-runs-is-not-this-repo.md), e o binário compilado sai em [plugins are installed, not compiled in](plugins-are-installed-not-compiled-in.md) |
| 7 | entregue | o budget e o teto de reviewer, provados pelo gate `plugin-agent-relay` |
| 8 | entregue pela metade | a escada de skills por passo existe no `@amy/plugin-agent-relay`; o scaffolder não |
| 9 | entregue | [the engine fails out loud](the-engine-fails-out-loud.md), gate `plugin-serial-engine`, e o desenho em [docs/design](../docs/design/the-engine-fails-out-loud.md) |
| 10 | próxima | ainda sem plano próprio neste diretório |
| 11 | depois da 10 | ainda sem plano próprio |
| 12 | depois da 11 | ainda sem plano próprio; sobe para o software-factory |
| 13 | parada | esperando as três anteriores |

O que cada fase entregue provou de verdade está no gate dela, não aqui: uma
linha nesta tabela envelhece, um digest expira.

**Exit condition:** cada fase de 10 a 13 tem um plano próprio neste diretório,
listado em [next-steps.md](next-steps.md), ou está parada lá com a
precondição que espera escrita; e cada fase marcada entregue acima nomeia o
gate ou o plano que responde por ela.

---

## Contexto

O amy está em `nicolasmelo1/automate-my-work` (privado): **20 pacotes `@amy/*`
(24 no fim desta fase), 413 testes, e as regras do `sf` todas provadas por
fixture de mutação**, `amy doctor` dando `ready`, e o `amy discover` lendo o
Linear de verdade pelo engine montado. O core não conhece domínio: ele é dono do
catálogo de ações e o workflow é só a ordem delas.

**Feito:** fase 1 (guardrails, incluindo a regra local que impede o core de
conhecer um workflow), fase 2 (log de eventos e o freio de mão que mata
processo em voo, verificado de outro processo), fase 3 (cada plugin declara
sua config, o notifier quebrado em três, README em cada pacote, e o `mount()`
carregando plugins do config em vez de o CLI construir adapter na mão).

**Feito:** fase 4 (o envelope `AgentRun`, o `@amy/model-specs` vendorado com
preço de 10 modelos, e o custo com `costSource` honesto). Um bug real só
apareceu contra envelope de verdade: o `ephemeral_1h_input_tokens` era
ignorado e o custo calculado saía 60% curto.

**Feito:** fase 5 (troca de harness por quota, escalonamento de modelo por
falha, e o relay como único dono da porta `agent`). O e2e achou um bug que
teste unitário não pegava: `triage` e `addressThreads` lançavam quando a
corrida não completava, então o relay nunca via a causa e o escalonamento
inteiro era pulado justamente quando era necessário.

**Feito:** fase 6 (`amy` virou binário instalado em `~/.local/bin`, e o log
carimba qual build escreveu cada linha). O bug que a fase pegou antes de
existir: o loader resolvia plugin com `import(spec)`, que nenhum bundler
consegue seguir, então o primeiro binário compilado teria montado **zero**
plugins passando todos os 512 testes.

**Em andamento:** a fase 7, budget e teto de reviewer.

O que amarra o resto: **tudo tem que ser reportável pro logion, e nada tem
que reportar.** Reportável não é reportando. O logion é opcional, e é essa a
ideia de tudo ser plugin: quem instala o amy e quer o logion, ótimo; quem não
quer, também. O tracking acontece porque eu tenho o logion instalado, não
porque o amy quer. Uma pessoa que baixou o amy hoje não precisa abrir issue
no amy, nem saber que o software-factory e o logion existem.

O que o logion ganha com isso é real: ele vê o que funciona e o que não
funciona, e depois o amy roda em outra máquina com outros agentes e reporta
também, o que prova que dois agentes usando um sistema melhoram ele mais que
um sozinho. Mas isso é um consumidor do log, não uma condição para o amy
andar.

### A espinha: um log de eventos

Quatro dos sete pedidos leem ou escrevem a mesma coisa: acompanhar o fluxo
(6), parar em caso de falha (6), controlar gasto (7), e reportar pro logion.
Se cada um tiver seu próprio estado, eles vão discordar entre si.

Então tudo passa por **um log append-only** em `.amy/log/<data>.jsonl`, uma
linha por evento, e todo o resto é leitura dele. `amy observe` lê. O ledger de
budget agrega. O reporter do logion projeta. Uma fonte, quatro consumidores.

### A restrição que o logion impõe, e que vira guardrail

Li o contrato: `packages/cli/cli/usage/observations.py` define o envelope
`UsageObservation`, e as regras do
`packages/agent-companion/references/use-observation-and-feedback.md` são
explícitas:

> Never put a prompt, repository name, source code, customer data, or personal
> information in a feedback body.
>
> Never enable a harness integration on your own. Show the diff, then ask.
>
> `DO_NOT_TRACK=1` forces `off` everywhere — do not try to work around it.

O amy trabalha em repos do meu empregador, com ID de ticket real e nome de
colega.
Então o reporter **não pode** mandar nome de repo, conteúdo de ticket ou
pessoa. Isso não pode depender de disciplina: vira **regra local do sf** que
falha o build. É o dogfood na veia, o software-factory checando se o amy
respeita o contrato do logion.

O que sai é só: qual plugin, qual versão, `outcome` de
`completed|failed|abandoned|unknown`, `duration_bucket` de
`instant|seconds|minutes|hours`, `task_class`, e escopo opaco. Modo default
`off`, e o amy mostra o diff e pergunta antes de ligar.

**Decisões tomadas:** escalonamento pela causa (rate-limit troca de harness,
falha escala modelo). Handoff continua de onde o agente anterior parou.
CodeForge entra como plugin de agente, pinado no meu fork enquanto os PRs não
mergeiam.

---

## Fase 1: os guardrails que protegem o resto

Primeiro, porque tudo depois fica mais seguro. O `sf` tem 36 regras e o amy
usa 14.

**Regra local, e é a mais valiosa que o amy pode ter.** A arquitetura que
acabamos de construir hoje é sustentada só por disciplina. Em
`.software-factory/rules/core-stays-ignorant.yaml`:

```yaml
id: L0.CORE_STAYS_IGNORANT
layer: L0
severity: high
title: The core imports no workflow and no plugin
statement: Nothing under packages/core/src imports an @amy/workflow-* or @amy/plugin-* package.
why: >-
  The core owns the catalogue of actions and nothing else. The moment it
  imports a workflow it learns a domain, and every workflow after the first
  becomes a fork rather than a package. This is the one invariant the whole
  plugin model rests on, and it is one import away from being lost.
fix: Move the type into the workflow package, or make the core generic over it.
ratchet: allowlist
check:
  kind: text_pattern
defaults:
  scope: ["packages/core/src/**"]
  forbidden:
    - regex: 'from "@amy/(workflow|plugin)-'
      message: "The core must not know a workflow or a plugin."
```

**Do catálogo, o que se aplica:**

| Regra | Por que no amy |
| :-- | :-- |
| `L0.NO_CROSS_LAYER_IMPORT` | força importar do barrel do pacote, não de `src/` fundo |
| `L0.EXCEPTIONS_HAVE_ONE_HOME` | hoje é `throw new Error` solto em 9 pacotes |
| `L2` (as 7) | locks: catálogo, policy, dependências, artefatos derivados, e nenhuma exceção permanente |
| `L6.DEAD_CODE_IS_DETECTED` | "não ter código redundante", via `knip` |
| `L6.DEPENDENCY_VULNERABILITIES_ARE_SCANNED` | `npm audit` no CI |
| `L6.SECRETS_ARE_SCANNED` | há um `.env` com chave do Linear nesse repo |
| `L6.INSECURE_PATTERNS_ARE_SCANNED` | `eslint-plugin-security` ou semgrep |
| `L6.WORKFLOWS_ARE_SCANNED` | `zizmor` no `.github/workflows` |

Não aplicáveis, e não vou fingir: `L0.ONE_ENTRYPOINT_PER_FILE` e
`L0.PERSISTENCE_STAYS_IN_REPOSITORIES` (não há superfície HTTP nem banco), e
as três de concorrência do L6 (não há lock nem thread). Habilitar qualquer uma
delas cai em `L5.NO_INERT_RULE`, que é justamente a regra que impede fingir
cobertura.

**"Garantir que testamos tudo":** `vitest --coverage` com piso por pacote,
dentro do gate. Cobertura não é regra do sf, é comando do gate.

Vale rodar o `sf interview` (a skill `factory-init` já está instalada) e
re-inicializar com `--answers`: o amy é `kind: cli`,
`architecture: hexagonal`, `errors_home: per-module`, e as regras saem
tayloradas em vez de genéricas.

`L3` fica pra fase 8, porque `L3.GATE_COVERS_THE_PLAN` precisa de um plano com
critérios que nomeiem checks, e esses critérios são o trabalho das fases 2 a 7.

## Fase 2: o log de eventos, e o freio de mão

`@amy/core` ganha `EventLog` (porta) e `@amy/plugin-file-log` a
implementação, `.amy/log/<data>.jsonl`. Toda transição, toda ação, todo
resultado de agente, todo gasto vira uma linha.

`amy stop` escreve `.amy/STOP`. O engine checa antes de reivindicar item da
fila e antes de despachar ação, e mata processo filho em voo. Determinístico:
existe o arquivo, não começa trabalho novo. `amy start` remove.

Ficam duas paradas distintas, e a diferença importa: `amy stop` é o freio de
mão que tu puxa, e a parada por budget da fase 6 é automática e temporária.

## Fase 3: `amy.conf`, e cada plugin dono da sua config

Hoje o `.amy/config.yaml` é um objeto único que o CLI conhece inteiro. Passa a
ser por plugin, e **cada plugin declara o schema da sua**:

```yaml
plugins:
  "@amy/plugin-linear":
    workingStatusName: In Progress
    repoByTeam: { TBO: acme/backend }
  "@amy/plugin-notify-hermes":
    target: slack:nico-and-his-bot
  "@amy/plugin-agent-relay":
    ladder: [claude, codex, hermes]
```

`Plugin` ganha `configSchema` opcional, e o loader valida na montagem. Config
desconhecida ou inválida falha alto, no boot.

**E o rename que tu pediu.** O `plugin-slack-hermes` está errado em dois
sentidos: não é específico de Slack, e junta três canais que não são do Hermes.
Quebra em:

- `@amy/plugin-notify-fanout` — o fan-out genérico, sem canal nenhum
- `@amy/plugin-notify-hermes` — o canal Hermes, alvo configurável
- `@amy/plugin-notify-inbox` — arquivo em disco mais notificação de desktop
- o canal que comenta no ticket vai pro `@amy/plugin-linear`, que é quem é o tracker

## Fase 4: o agente sabe dizer o que aconteceu com ele

Pré-requisito das fases 5 e 6. Sem isso, as duas são chute.

**Os três harnesses expõem uso por invocação**, o que derruba o risco que este
plano assumia. Confirmei os três:

| Harness | Invocação | Tokens | Custo | Classificação |
| :-- | :-- | :-- | :-- | :-- |
| claude | `-p --output-format json` | `usage` e `modelUsage` | `total_cost_usd` | `api_error_status`, `stop_reason`, `is_error` |
| codex | `exec --json` (JSONL de eventos) | evento de uso, nomes variam por versão | calculado | exit code e stream |
| hermes | `--usage-file PATH` | `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | `estimated_cost_usd` | exit code e `guardrail` |

A fase 4 faz **só o claude**. Codex e Hermes são a fase 5, e o contrato nasce
com a forma deles em mente.

### O contrato

Um envelope só, genérico sobre o que o método já devolvia, para não mudar três
assinaturas de três formas diferentes:

```ts
export type AgentOutcome = "completed" | "failed" | "rate-limited" | "abandoned";

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** De onde veio o número, porque estimativa e medição não são a mesma coisa. */
export type CostSource = "reported" | "computed" | "unknown";

export interface AgentRun {
  outcome: AgentOutcome;
  harness: string;
  model: string;
  /** Ausente quando o harness não diz. Nunca estimado. */
  tokens?: TokenUsage;
  costUsd?: number;
  costSource: CostSource;
  durationMs: number;
  /** Verbatim, para o próximo prompt. */
  output: string;
}

export interface AgentResult<T> {
  value: T;
  run: AgentRun;
}
```

`triage`, `implement` e `addressThreads` passam a devolver
`AgentResult<TriageOutcome>`, `AgentResult<AttemptOutcome>` e
`AgentResult<ThreadVerdict[]>`. O engine loga o `run` e passa o `value`
adiante, então cada call site muda numa linha.

**`costSource` é a peça que eu não teria posto sozinho, e é do Hermes.** Ele
grava `estimated_cost_usd` junto com `cost_source` e `cost_status`, ou seja,
ele diz quando o número é estimativa. Sem esse campo, um custo calculado de
tabela desatualizada e um custo reportado pelo harness ficam
indistinguíveis no log e no report pro logion.

### `@amy/model-specs`

Pacote próprio, porque preço não é kernel e não é domínio, e porque a fase 6
também lê. Modelado no `ModelsDevPricingInfo` do CodexBar, que tem uma
sutileza que eu não teria previsto: **o preço muda acima de um limiar de
tokens**.

```ts
export interface ModelSpec {
  provider: string;
  model: string;
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken?: number;
  cacheWritePerToken?: number;
  contextWindow?: number;
  /** Acima deste tanto de input, as taxas trocam. */
  thresholdTokens?: number;
  aboveThreshold?: Omit<ModelSpec, "provider" | "model" | "thresholdTokens" | "aboveThreshold">;
}

export function specFor(model: string): ModelSpec | undefined;
export function costOf(spec: ModelSpec, tokens: TokenUsage): number;
```

`specs.json` **vendorado e versionado**, sem rede no caminho que decide gasto.
Mais `amy models refresh`, que puxa do models.dev quando eu mandar, e
`amy models show`. O `L2.GENERATED_FILES_ARE_LOCKED` tranca o `specs.json`,
então um refresh aparece no diff como ato deliberado em vez de drift.

**Normalizar o id do modelo importa.** O claude reporta
`claude-opus-5[1m]` no `modelUsage`, com sufixo de janela. A busca tem que
normalizar, ou toda linha cai em `unknown` e o custo calculado nunca existe.

### Onde o custo vem de cada lugar

Ordem, e sem misturar:

1. o harness reportou custo, e ele sabe do plano e dos descontos que eu não
   sei → `costSource: "reported"`
2. o harness reportou só token, e a tabela tem o modelo →
   `costSource: "computed"`
3. nem um nem outro → `costUsd` ausente e `costSource: "unknown"`

Nunca estimar contagem de token. Se o harness não disser, `tokens` fica
ausente, e a fase 6 conta só o que sabe.

## Fase 5: trocar de agente e escalar modelo

### Contexto: por que a fase existe, e o que já está de pé

Um harness só é um ponto único de falha em cima de uma quota que não é minha.
Quando o claude bate no limite às 3 da manhã, o ticket morre ali. A fase 4 deu
a peça que faltava para resolver isso sem chutar: o `AgentRun` agora diz
**por que** uma tentativa não deu certo, e `rate-limited` e `failed` pedem
reações opostas.

Já escrito e compilando: o `@amy/agent-kit` (a interface `Harness`, o
`HarnessAgent` com os prompts que saíram verbatim do `ClaudeAgent`, e o
`NamedAgent`), os três harnesses (`ClaudeHarness`, `CodexHarness`,
`HermesHarness`), e o `AgentRelay` com a política. Duas convenções opostas de
`input_tokens` foram confirmadas contra envelope real, e é por isso que os
parsers não são compartilhados:

- codex **inclui** o cache no total, então `input = 17571 - 11008`
- hermes **exclui**, e `7466 + 8704 + 5 = 16175` fecha com o total dele

### A política, e as duas decisões que a fecham

```text
rate-limited  -> pula todo o resto daquele harness, vai pro proximo harness
failed        -> proximo modelo do mesmo harness, e quando acabarem,
                 o proximo harness
abandoned     -> para a escada, ponto
esgotou tudo  -> a acao falha e o workflow escala pra ti
```

Confirmado: **falha anda na escada inteira**, os dois eixos, porque um bug do
harness não se resolve trocando de modelo dentro dele. O preço é que um ticket
impossível queima os três antes de me chamar, e o teto da fase 6 é o que
limita isso.

E `abandoned` **não** avança, que é a decisão que não estava no plano
original. Um `abandoned` vem de duas causas: binário que não existe, ou o
`amy stop` matando o filho. Retentar a segunda subiria um processo novo no
instante em que eu puxei o freio de mão. Binário faltando é trabalho do
`amy doctor`, antes de um ticket ser tocado.

O handoff continua de onde o anterior parou: a árvore fica como está e o
próximo recebe o texto do anterior mais "isso é trabalho meio feito, continue,
não comece de novo". Só o `implement` carrega esse contexto, porque é o único
método da porta com canal pra isso.

### A inversão que faz três harnesses coexistirem

Uma porta tem um dono só, então três harnesses querendo ser *o* `agent` se
recusam a montar juntos. Cada harness passa a **contribuir** um `NamedAgent`
por tier de modelo (`claude:sonnet`, `claude:opus`, `codex:gpt-5`), e o relay
é o único que monta a porta, lendo as contribuições **na primeira chamada** e
não na montagem, senão a ordem dos plugins passaria a importar.

Ladder vazia significa tudo que foi contribuído, na ordem de montagem. Um nome
que ninguém contribuiu é **recusado** em vez de ignorado: uma ladder com typo
ficaria mais curta do que eu acredito, e o primeiro sintoma seria um ticket
escalando sem motivo.

### O que falta, em ordem

1. **Os 7 erros de build**, todos em `plugin-agent-relay/src/plugin.ts` e de
   duas causas: importei `Agent` de `@amy/core`, onde ele não vive (é
   `@amy/workflow-ticket-to-qa`), e deleguei com rest-spread, que o
   TypeScript não estreita. Vira três métodos explícitos. O `registry.port`
   aceita `object`, então o proxy não precisa do tipo pra montar, só pra eu
   não errar a forma.
2. **`@amy/agent-kit` na dependência do relay**, que está faltando no
   `package.json` dele.
3. **`plugin.ts` e `config.ts` do codex e do hermes**, no formato do claude:
   um `NamedAgent` por tier, `contribute(AGENT_COLLECTION, ...)`.
4. **A fiação, e é aqui que mora o estrago.** O `unmetNeeds` recusa a
   montagem quando a porta de uma ação não tem dono, e o claude acabou de
   parar de montar `agent`. Então **sem o relay no `DEFAULT_PLUGINS`, todo
   boot passa a ser recusado.** Entra o relay no default; codex e hermes ficam
   opt-in, montados quando a ladder nomeia eles, no mesmo padrão que o
   `notify-hermes` já usa. Install novo continua se comportando como hoje.
   `AmyConfig.agent` ganha `ladder`, e o `pluginSlices` passa ela adiante.
5. **`tests/ClaudeAgent.test.ts`** ainda importa a classe que virou
   `ClaudeHarness`. Reescreve como `ClaudeHarness.test.ts`.
6. **Testes.** Não é opcional: o piso de cobertura é global (87/83/85/89) e
   cinco arquivos novos sem teste derrubam o gate. O `nextRung` é função pura,
   então a matriz de política testa direto. Mais o `AgentRelay` com harness
   falso, o `CodexHarness` e o `HermesHarness` contra os envelopes reais que
   eu já capturei, e o `HarnessAgent`.
7. **README nos quatro pacotes**, e o do relay explica a política pela causa.
8. **A prova e2e do relay**, em `.software-factory/evidence/`, no formato que
   o `plugin-file-queue` estabeleceu: `dist/index.js` importado de outro
   processo, com executáveis de mentira no `PATH` (um que sai 429, um que sai
   1, um que funciona). É o que o item 5 da verificação sempre pediu, e não
   precisa de credencial nenhuma. Sela com `sf seal`.
9. **`sf lock`** no mesmo commit, porque as dependências mudaram, e o gate.

Cada troca é uma linha `agent.handoff` no log, com harness, modelo, causa e
qual eixo andou. É disso que sai o `reliability` do report pro logion.

## Fase 6: o que executa deixa de ser este repo

Primeiro, e isso mudou de lugar. Tudo o que vem depois passa a ser testado
como coisa **instalada** em vez de coisa rodada de dentro do checkout, e o
risco de vazar algo do meu empregador neste repo acaba antes de existir em
depois.

Passa a haver duas coisas distintas: **o código fonte**, que é este repo, e
**o que roda**, que é um binário instalado na máquina. Bun, não por
velocidade, mas porque ele compila para um executável só.

Consequência que decorre disso e que precisa existir junto: **o log grava
qual build produziu cada linha.** Sem isso, "melhoramos o repo" e "o que
falhou ontem" deixam de ser comparáveis, e o report pro logion passa a somar
versões diferentes no mesmo número.

## Fase 7: budget, e o teto de reviewer

`.amy/budget.json`, agregado do log, com janelas configuráveis:

```yaml
"@amy/plugin-agent-relay":
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek: { tokens: 30000000, costUsd: 150 }
    stopAt: 0.9   # a que fracao do teto para de comecar trabalho novo
```

**Dois tetos, e o primeiro que estourar para.** Token é o que a assinatura
limita e é o que bloqueia às 3 da manhã; USD é o que importa se o gasto for
por API.

Uma linha do log com `costSource: "unknown"` conta **token** e não conta USD.
Somar um custo que ninguém mediu no teto em dólar seria inventar o número que
decide a parada. E `costSource: "included"` conta zero de verdade, porque a
assinatura já pagou.

Checado **antes** de cada chamada, não depois. Passou do `stopAt`, o engine
não começa ação nova e reenfileira com atraso até a janela virar. O ticket
nunca é perdido, só estacionado.

**E o teto de reviewer, que é gasto de outra moeda.** Ninguém aqui quer abrir
vinte PRs na cara dos colegas. Isso já quase existe: o `machine.ts` escolhe
por `leastLoadedReviewer(roster, obs.reviewLoad)` e já tem o caminho "nenhum
reviewer disponível, espera e avisa uma vez". Teto por pessoa é um campo na
`Policy` e uma condição a mais nesse mesmo branch:

```yaml
policy:
  maxOpenReviewsPerReviewer: 2
```

Estourado o teto de todos, o PR fica **aberto e sem ninguém atribuído**, e o
ticket espera na fila. O trabalho continua andando; só a fila de revisão
humana respeita a paciência de quem revisa.

## Fase 8: uma skill por evento, que é o relay generalizado

O pedido é poder escolher quem faz cada passo: um `code-review` que pode ser
`/antikus-code-review` ou `/logion`, e usar o logion de verdade em vez de só
reportar pra ele.

Isso é **a mesma máquina da fase 5**. Contribuições nomeadas, uma escada, e
recusa no boot. `@amy/plugin-skill-relay` monta uma porta `skill` e compõe o
que os plugins contribuíram, exatamente como o `AgentRelay` compõe
`NamedAgent`. O `nextRung` provavelmente sai de lá para um pacote comum.

```yaml
skills:
  code-review: [/antikus-code-review, /logion]
  triage: [/logion]
```

**Skill nomeada que não está instalada é recusa no boot**, nomeando o que
havia para escolher, igual à ladder de agentes. Config é verdade ou não é.

E o ponto que fecha o ciclo do logion: se a skill é de terceiro, usamos e
reportamos uso, e na segunda passagem ela entra na escada mais alto porque
**se provou**. Se a skill é nossa e falhou, isso não é report, é trabalho: cai
na fase 10.

### Scaffolder é uma skill, e é a razão mais forte pra fase existir

Toda convenção que uma regra checa é uma convenção que algo poderia ter
escrito. Chega uma task pedindo uma query, um router e um service; a forma dos
três já era conhecida antes do agente começar. Pagar modelo pra redescobrir
isso é a maneira mais cara de obter algo que ninguém tinha dúvida sobre.

Então um scaffolder entra na escada como qualquer skill: `code-scaffold`
antes de `implement`, e o agente chama uma CLI em vez de escrever a mesma
coisa de novo. **Nada disso mora no amy**, porque a forma de um router de um
empregador é dele, não deste repo. O amy só chama.

A parte difícil, que é provar que o gerador continua correto quando a
convenção muda, é trabalho do software-factory e virou plano lá:
`plans/scaffolds-are-proven-in-micro-sandboxes.md`. O resumo: a regra e o
scaffolder são duas declarações da mesma convenção, e o build falha no
instante em que discordam.

E a economia deixa de ser conversa: a fase 7 já grava token por ação, então
um passo scaffoldado custa perto de zero contra alguns milhares de um agente
escrevendo à mão. Isso é exatamente a dimensão `token-efficiency` do report da
fase 11, medida em vez de afirmada.

## Fase 9: falhar em voz alta

O sistema vai falhar. A API do GitHub vai cair, o Claude vai sair do ar. Não
tem shutdown elegante nenhum: falha, avisa, e segue.

Três mudanças, e uma delas é só generalizar o que já existe:

**Avisa na primeira falha, e continua tentando por baixo.** Hoje o engine
tenta até `maxItemAttempts` e só avisa no fim, o que é o comportamento errado:
você descobre na quinta tentativa. Passa a avisar na queda, ficar em silêncio
nas tentativas do meio, e avisar de novo quando voltar. Um aviso na queda, um
na volta.

**Um plugin que morre não derruba o tick.** É literalmente a regra que o
`FanOutNotifier` já aplica a canal de notificação: um que falha não para os
outros, e só lança quando todos falharam. Sobe de canal para plugin em geral.

**O log vira contrato versionado.** A partir do momento em que quatro
harnesses e uma UI leem `.amy/log/*.jsonl`, o `EventKind` deixa de ser detalhe
interno. Acrescentar campo é seguro, renomear é breaking, e isso quer um lock
do mesmo naipe do que tranca o `specs.json`.

## Fase 10: a fila aberta, e a auto-melhoria

**A fila aceita coisa que não é ticket do Linear.** `EnqueueRequest` já é
`{workId, reason}`, genérico. O bloqueio é um só e é pequeno: `observe()`
chama `requireTicket(record.id)`, então hoje todo item precisa existir no
tracker. Passa a haver trabalho injetado, por pasta ou por comando, que não
tem ticket e não precisa.

**E o erro passa a melhorar os meus repos.** Qualquer falha, ponto de atrito
ou limitação que aparecer no fluxo entra como PR de `plans/` no repo certo:
software-factory, automate-my-work ou logion. Não usa Linear; usa a `plans/`
que os três já têm, com `next-steps.md` já ordenado nos três. Quem trabalha
nesses planos é um agente em outra máquina.

**O que impede isso de virar spam já existe, e é o próprio sf.** Um plano
precisa de exit condition e de uma linha no `next-steps.md` ordenado, senão o
`L4.PLAN_DECLARES_EXIT_CONDITION` fica vermelho. Isso é barra de qualidade e
limitador de vazão de graça. A lógica do teto de reviewer vale aqui também,
com número diferente.

Três memórias que se complementam, e nenhuma delas é um markdown que alguém
tem que lembrar de atualizar:

| Repo | Que memória é | Como expira |
| :-- | :-- | :-- |
| logion | o que funciona e o que não funciona | receipt contra contrato pinado |
| software-factory | o que o agente tem que provar | digest que expira quando o path muda |
| amy | a ordem das tarefas e o que já custou | log append-only, agregado por janela |

## Fase 11: o reporter do logion, opcional e fora do default

Vai para o fim porque é o único que não desbloqueia nada, e porque **logion é
opcional**. Quem instala o amy hoje não precisa saber que o logion existe. O
tracking acontece porque eu tenho o logion instalado, não porque o amy quer.

`@amy/plugin-logion-reporter`, **fora do conjunto default**, projetando o log
no envelope `UsageObservation`. Modos do próprio logion e default `off`.
`DO_NOT_TRACK=1` força `off` e não se contorna. Ligar mostra o diff e
pergunta.

Reportável não é reportando: o log é a costura, e o reporter é um consumidor
entre outros. Isso vira duas regras locais do sf:

- nenhum pacote `@amy/*` importa logion, exceto o próprio reporter, na forma
  da `CORE_STAYS_IGNORANT`
- nada em `packages/plugin-logion-reporter/src/**` cita nome de repo, padrão
  de ID de ticket, e-mail ou caminho de checkout

As quatro dimensões saem de dado que o amy já tem, não de opinião:
`reliability` das trocas de agente, `token-efficiency` do budget,
`usefulness` de chegar a QA ou escalar, `tool-safety` do gate ficar verde sem
intervenção.

## Fase 12: o sf gerencia plano de harness

Tem um exemplo vivo agora: a `L4.PLAN_DECLARES_EXIT_CONDITION` tem escopo
`plans/*.md` **dentro do repo**, e o plano que dirige todo este trabalho está
em `~/.claude/plans/kind-strolling-castle.md`, fora de qualquer repo, sem exit
condition validada e sem estar em nenhum `next-steps.md`. O sf não vê o plano
que dirige o sf.

Então o sf passa a reconciliar o diretório de planos do harness, qualquer
harness, com o `plans/` do repo, e a gerenciar isso sozinho. Vai upstream no
software-factory, porque não é específico do amy.

## Fase 13: CodeForge, e depois o ARC-AGI

`@amy/plugin-codeforge`, pinado no meu fork enquanto os PRs #4 a #7 não
mergeiam. A ação `implement` passa por spec, `plan generate` e `run`, que faz
sentido justamente onde uma chamada só é fraca: ticket grande.

**E aí o ARC-AGI-1, pelo motivo certo.** O que transfere é forte: o gate
determinístico é literalmente o que o ARC pede, porque um candidato tem que
reproduzir todos os pares de treino e isso é verificável sem opinião. O relay
dá diversidade de modelo. O logion dá "essa heurística se provou em N
tarefas", que é a memória que solver de ARC precisa e quase nenhum tem.

O que não transfere é o workflow: PR, review e QA não significam nada ali.
Precisa de um segundo workflow que não compartilha ação nenhuma com o
primeiro.

E é aí que está o valor: **um segundo workflow que reusa fila, gate, relay,
budget e report e não reusa nenhuma ação é a prova mais forte que o modelo de
plugin pode receber.** O argumento do logion deixa de ser "funciona no meu
trabalho" e passa a ser "funciona em dois domínios sem código em comum".

Sobre placar, e sem prometer número: o score vem do solver, não do arcabouço.

## Riscos, ditos na cara

**Dez fases é muito.** As fases 1, 2 e 4 são o que destrava o resto: guardrail,
log e um agente que sabe se reportar. Sem a 4, as fases 5, 6 e 7 são chute.

**A tabela de preço envelhece, e um preço errado é uma decisão de parada
errada.** Mitigação: o teto de token não depende da tabela, então o amy
continua parando na hora certa mesmo com preço velho. É o teto em USD que
sofre, e o `costSource` no log deixa visível qual linha foi calculada em vez
de reportada.

**A forma do envelope do codex varia por versão.** O CodexBar lê o uso dele
com fallback entre vários nomes de chave, o que é sinal de que mudou mais de
uma vez. O parser do codex nasce tolerante, e um envelope que ele não entende
vira `tokens` ausente em vez de zero, porque zero é um número e ausente é a
verdade.

**O envelope do logion pode mudar.** Ele está em beta. Mitigação: o
`integration_version` já está no envelope, e o reporter é um pacote só, então
é um lugar pra ajustar.

**`amy stop` não pode ser cooperativo demais.** Se um agente estiver rodando
em subprocesso, escrever `.amy/STOP` não mata o filho por si. A fase 2 tem que
matar o processo, não só recusar trabalho novo, senão o freio de mão não freia.

---

## Verificação

Gate, sobre todos os workspaces:

```sh
npm run build && npm test && npm run lint && sf check && sf verify
```

Por fase:

1. A regra `L0.CORE_STAYS_IGNORANT` tem que **falhar** quando eu adicionar um
   `import ... from "@amy/workflow-ticket-to-qa"` no core, e passar depois de
   tirar. `sf verify` provando o fixture de mutação de cada regra nova. Regra
   habilitada que não consegue produzir finding cai em `L5.NO_INERT_RULE`.
2. `amy stop` com um `amy run` em voo: o processo filho morre e a fila não
   avança. `amy start` volta a andar, e o ticket continua de onde estava.
3. Config de plugin inválida faz o `amy doctor` falhar nomeando o plugin e o
   campo. Plugin sem config nenhuma continua montando.
4. Um `implement` **real** grava uma linha `agent.run` cujos tokens e custo
   batem com o `usage` e o `total_cost_usd` do envelope daquela invocação, com
   `costSource: "reported"`. Exit não-zero classifica `failed`; um
   `api_error_status` de 429, simulado, classifica `rate-limited` e não
   `failed`. O `costOf` contra a tabela vendorada reproduz um número calculado
   à mão, incluindo um caso acima do `thresholdTokens`. Um `modelUsage` com
   sufixo de janela, tipo `claude-opus-5[1m]`, encontra o spec em vez de cair
   em `unknown`. E editar o `specs.json` à mão sem `sf lock` **falha** o gate,
   que é o `L2.GENERATED_FILES_ARE_LOCKED` fazendo o refresh ser deliberado.
5. Forçar rate-limit (ou simular pelo `api_error_status`) faz trocar de harness
   e não de modelo; forçar exit 1 faz subir de modelo e não de harness. Os dois
   com asserção na linha `agent.handoff` do log, incluindo o campo que diz qual
   eixo andou. Um `abandoned` **não** produz handoff nenhum, que é o freio de
   mão continuando a frear. Uma ladder que nomeia um agente inexistente falha
   no boot em vez de rodar mais curta. E o e2e roda contra o `dist`, de outro
   processo, com binário de mentira no `PATH`: exit 429, exit 1, e um que
   fecha. Sem credencial, repetível por qualquer um.
6. `amy` **instalado** fecha um ticket sem que este repo esteja no PATH, e a
   linha do log diz qual build fez. Rodar de dentro do checkout e rodar
   instalado dão o mesmo resultado, senão a separação é decorativa.
7. Budget com teto baixo de propósito: o engine para de começar ação e
   reenfileira, sem perder o ticket. Com `maxOpenReviewsPerReviewer: 0`, o PR
   é aberto e fica **sem ninguém atribuído**, e o ticket espera em vez de
   falhar. Uma linha com `costSource: "unknown"` move o teto de token e não
   move o de USD.
8. Uma escada de skill que nomeia `/nao-existe` **falha no boot**, nomeando o
   que havia para escolher. Com duas skills instaladas, a primeira responde e
   a segunda não é chamada; matando a primeira, a segunda responde. Ambos com
   asserção no log.
9. Derrubar a API do GitHub no meio de um tick: **um** aviso na queda, silêncio
   nas tentativas do meio, **um** aviso na volta, e o ticket continua de onde
   estava. Um canal de notificação quebrado não impede o tick de terminar.
   Renomear um `EventKind` sem `sf lock` **falha** o gate.
10. Um item injetado que não existe no Linear atravessa a fila e é trabalhado
    sem tracker nenhum. E uma falha real produz um PR de `plans/` no repo
    certo, que o `sf check` daquele repo aceita: com exit condition e uma
    linha no `next-steps.md`. Um plano sem isso **falha**, o que é o
    limitador de vazão funcionando.
11. `DO_NOT_TRACK=1` faz o reporter não mandar nada. Sem modo configurado,
    também não manda. O reporter **não está** no conjunto default: um install
    limpo não fala com o logion. A regra local **falha** se eu meter um nome
    de repo no reporter, e a outra **falha** se qualquer pacote que não seja
    o reporter importar logion.
12. Um plano em `~/.claude/plans/` sem exit condition **falha** o `sf check`
    do repo a que ele pertence, o que hoje não acontece.
13. Um ticket grande fechado via CodeForge. E o ARC-AGI-1 rodando com um
    segundo workflow que reusa fila, gate, relay e budget e **não reusa
    nenhuma ação** do primeiro. Sem prometer score.

E a que fecha tudo: **um ticket real, ponta a ponta, com `amy tick`.** O
`TBO-1239` está em In Progress.
