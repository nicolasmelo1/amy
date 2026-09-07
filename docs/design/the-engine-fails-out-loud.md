---
title: Failing out loud
description: The design behind one warning down, silence, one warning back — and the rule about which port calls may be swallowed.
group: Design notes
order: 1
---

# Fase 9: falhar em voz alta — o desenho

Entregue. O plano de registro é
[the engine fails out loud](the-engine-fails-out-loud.md)
prova é o gate `plugin-serial-engine`. Este documento é o desenho que veio
antes, guardado porque explica as decisões que o plano só cita.

## Contexto

Do plano mestre (`~/.claude/plans/kind-strolling-castle.md`), fases 1 a 8
fechadas. A 9 é a que assume que o sistema **vai** falhar: a API do GitHub cai,
o Claude sai do ar. Não tem shutdown elegante — falha, avisa, e segue.

Três mudanças, e o que cada uma conserta hoje:

1. **Hoje você descobre na quinta tentativa.** `Worker.recordFailure()`
   (`plugins/serial-engine/src/Worker.ts:284`) é o único leitor de
   `maxItemAttempts`, e só avisa quando `attempt >= maxItemAttempts`. As
   tentativas do meio são silenciosas e a volta não avisa nada.
2. **Um canal de notificação quebrado derruba o tick.** A porta `notifier`
   monta um `FanOutNotifier` novo por anúncio
   (`plugins/notify-fanout/src/plugin.ts:13`), que lança quando
   *todos* os canais falham. Num install de um canal só, isso sobe pelo
   `Worker.announce()` e o tick inteiro vira `failed`.
3. **`EventKind` é uma união TS solta.** Sem versão, sem schema, sem doc.
   `packages/core/src/ports/EventLog.ts` é o único lugar onde os 15 nomes
   existem, e `detail` é `Record<string, unknown>` que cada leitor adivinha.

Decisões já tomadas: **gate L3 novo sobre o engine**, o aviso do teto
**continua** (com texto novo), e o contrato do log trava **os kinds e o
formato do `detail`**.

---

## Um bug que apareceu no caminho, e que vem primeiro

`Worker.parked()` diz, em comentário, que o record não é salvo de propósito
"so the ticket keeps its state and its attempt count". Isso é verdade do
`WorkRecord.attempts` (o contador por estado) e **falso** do
`QueueItem.attempt`: o branch de park em `advance()` (Worker.ts:203)
reenfileira sem `attempt`, e `FileQueue.enqueue` faz `request.attempt ?? 0`
(`plugins/file-queue/src/FileQueue.ts:40`).

Hoje: um ticket na quarta tentativa que bate num park ganha o orçamento de
retry de volta, de graça. Depois desta fase seria pior — o tick seguinte leria
`attempt === 0` e anunciaria uma recuperação que não houve.

Conserto: `attempt: item.attempt` naquele `enqueue`, e o comentário passa a
dizer de qual contador ele está falando.

---

## (a) Um aviso na queda, silêncio no meio, um na volta

**O sinal é o `QueueItem.attempt`**, que já é durável (um JSON por item em
`.amy/queue/`), já atravessa processo, já significa *falhas consecutivas
deste trabalho*, e já é zerado pelo evento que significa recuperação.

As alternativas caem por motivo próprio: um campo no work record passaria pelo
`applyTicketPlan`, que é função pura do workflow e descartaria — engine
escrevendo no record do workflow é a camada que este repo existe pra impedir;
`deps.log.read()` não serve porque `log` é opcional (`WorkerDeps.log?`), e o
contrato do aviso não pode variar por install; contador no `Worker` não serve
porque `amy tick` é um processo novo a cada vez.

### As edições

**`recordFailure()`** ganha um privado que concentra a decisão, e devolve o
texto ou `null`:

```ts
private failureNotice(item, record, attempt, message): string | null
```

- `attempt >= maxItemAttempts` → texto do teto (**o teto ganha do que cai**,
  então `maxItemAttempts: 1` dá um aviso, não dois)
- `item.attempt === 0` → texto da queda
- resto → `null`, que é o silêncio

A guarda é `item.attempt === 0`, não `attempt === 1`: lê-se "este item nunca
tinha falhado", que é a condição de verdade. Extrair mantém o branch count de
`recordFailure` embaixo do `L1.COMPLEXITY_CEILING` e deixa
queda/silêncio/teto testável direto.

Textos:

- queda: `${workId} is failing in ${state} and I am retrying: ${message}`
- teto: `${workId} failed ${attempt} times in ${state}, I have given up, and
  it is off the queue: ${message}` — texto novo, mantendo a substring
  `is off the queue` que o teste existente já procura

**`advance()`** ganha um privado chamado dos dois pontos onde ele já registra
o desfecho (o branch `settled` e o de sucesso), pra não ganhar branch novo:

```ts
private async announceRecovery(item, state): Promise<void>
```

No-op quando `item.attempt === 0`. Texto: `${workId} is moving again in
${state} after ${item.attempt} failed attempt(s).`

Chamar no `settled` também: chegar num estado terminal depois de uma queda
*é* "o ticket continuou de onde estava".

**Não** entra: recuperação depois do teto. Passado o teto o item sai da fila,
nada mais carrega `attempt > 0` daquele workId, e o próximo item vem do
`amy discover` com `attempt: 0`. Isso é correto e vai escrito no plano como
não-objetivo: o aviso do teto já diz "parei, vem olhar", e anunciar
"recuperou" um trabalho que a pessoa mesma reenfileirou seria dar à máquina o
crédito do conserto de um humano.

Dois `EventKind` novos: `work.degraded` (`detail: { attempt, error }`) e
`work.recovered` (`detail: { afterAttempts }`). Sem eles, toda UI reconstrói
"houve uma queda" pareando `work.failed` com o `work.advanced` seguinte, que é
a mesma fragilidade derivada que desqualificou o `log.read()` acima — só que
replicada em cada leitor em vez de resolvida no engine uma vez.

E `WorkerConfig.maxItemAttempts` muda de significado: o comentário diz "before
the operator is told" e vira "before the machine gives up on it".

---

## (b) Isolamento, e onde exatamente fica a linha

A regra, dita como regra, e que vai literal no plano do repo:

> **Uma chamada de porta só pode ser engolida quando a falha dela não torna o
> record uma mentira.**

`advance()` calcula `next = applyTicketPlan(...)` e salva. Record e mundo têm
que concordar depois disso. Então:

| Porta | Decisão | Porque |
| :-- | :-- | :-- |
| `tracker` | falha o tick | engolir `setStatus` deixa o record em `HANDED_OFF` com o ticket ainda In Progress, e como o estado andou, ninguém retenta |
| `code-host` | falha o tick | engolir `openPullRequest` deixa o record afirmando um PR com `pullRequestNumber: undefined` |
| `agent`, `gate` | falha o tick | o resultado deles *é* `outcomes`; é o que o `refuseAnIncompleteRun()` já existe pra impedir |
| `notifier` | isolada | nada a jusante lê |
| event log | isolada | nada a jusante lê *dentro do tick* |

A frase da fase ("um plugin que morre não derruba o tick") é mais larga que o
próprio critério dela ("um canal de notificação quebrado não impede o tick de
terminar"). Constrói-se o critério, e a regra estreita vai escrita pra que a
frase larga nunca seja citada como licença.

### Três edições

**`Worker.announce()`** (Worker.ts:553) ganha try/catch e grava
`notify.failed` com `{ error, text }`. Tem que ser aqui e não só no fan-out,
porque `notifier` é uma **porta** e um install pode montar outro plugin: a
promessa "notificação não custa ticket" é do engine, não de quem estiver
montado.

Isso conserta um bug de perda de trabalho que existe hoje: `recordFailure()`
chama `this.deps.notifier.announce(...)` **direto**, e **depois** de
`queue.complete(item)`. Canal único quebrado ⇒ o anúncio do teto lança, sobe
pelo `tick()` sem ninguém pegar, e o item já foi completado sem reenfileirar.
O ticket some da fila sem registro do motivo. Rotear por `this.announce`
fecha.

**`Worker.record()`** (Worker.ts:584) ganha try/catch. Disco cheio ou permissão
ruim em `.amy/log` não pode custar um ticket, mas não pode ser silencioso, ou
a máquina parece saudável e não tem log. Vai pra `console.error` **uma vez por
instância de Worker** (flag privada), porque um log quebrado lança nas ~8
chamadas de `record()` por tick, e enxurrada em stderr é a sua própria queda.
Não anuncia: `announce` numa máquina cujo log quebrou pode estar quebrado
também (os dois escrevem embaixo de `.amy/`).

**`plugin-notify-fanout/src/plugin.ts`** passa um sink apoiado no `ctx.log`
em vez do `console.error` default, e mantém o stderr junto — quem está olhando
`amy run` tem que ver na hora. `PluginContext` já expõe `log` e `now`.

O `throw` do `FanOutNotifier` quando **todos** os canais falham **fica**. Ele
fazia dois trabalhos e só um sobrevive: "não deixe uma notificação perdida
passar despercebida" continua, agora melhor, na linha `notify.failed` que nomeia
o workId e o estado; "faça o operador saber que a máquina travou" não é
executável por um notificador que, por construção, não tem mais canal nenhum —
aquele throw só transformava "você não foi avisado" em "você não foi avisado
**e** o ticket parou".

**Não** se constrói um helper genérico `isolated(port, fn)`. No instante em que
ele existe alguém embrulha `tracker.setStatus`, e "não pode tornar o record uma
mentira" não é coisa que helper cheque. Dois `catch` explícitos, cada um com o
comentário do argumento, é a versão que um revisor audita.

Fora de escopo, e anotado: `mount()` já isola o throw de `register`/`ready`
por plugin, mas qualquer problema recusa o boot inteiro — um install com três
canais onde um tem config ruim não sobe. Fazer um plugin *contribuinte* falhar
sem derrubar o boot, enquanto um *dono de porta* continua fatal, é o análogo
disso no boot. Não é o critério desta fase.

---

## (c) O log vira contrato versionado

### O arquivo

`packages/core/events.json`, mantido à mão e vendorado, do mesmo jeito que
`packages/model-specs/specs.json` fica ao lado do `src` dele:

```json
{
  "version": 1,
  "kinds": {
    "agent.run": {
      "says": "An agent ran: which harness, which model, what it cost.",
      "requires": ["workId", "state"],
      "detail": {
        "harness": "string",
        "model": "string?",
        "outcome": "string",
        "durationMs": "number",
        "costSource": "string",
        "costUsd": "number?",
        "tokens": "object?"
      }
    }
  }
}
```

Vocabulário mínimo: `string`, `number`, `boolean`, `object`, `array`, com `?`
de opcional. `requires` diz quais campos de topo aquele kind exige
(`run.idle` não exige nenhum; os `work.*` exigem `workId`).

`version` sobe em rename ou remoção; acrescentar kind ou campo não sobe.
**E isso não é checado por máquina** — precisaria de uma regra que compara com
o commit anterior, que o `sf` não tem. O lock garante que o revisor *vê o
diff*; quem faz valer a versão é o revisor. É uma garantia real, e não é a
mesma coisa que um check. Vai dito assim no plano.

### O que impede o arquivo de apodrecer

Declarar o `detail` só ajuda se algo compara a declaração com o que é
realmente escrito. Um validador puro em `@amykit/core`:

```ts
export function checkEvent(event: Event, contract = EVENT_CONTRACT): string[]
```

Devolve as violações: kind desconhecido, campo de topo exigido e ausente,
campo de `detail` exigido e ausente, tipo errado, e **campo de `detail` não
declarado** — porque se campo novo passa calado, o contrato apodrece do mesmo
jeito que o JSDoc apodreceu.

Três consumidores, e nenhum deles no caminho quente de produção:

1. `packages/core/tests/event-contract.test.ts` — nomes do arquivo e da união
   batem, `version` é inteiro positivo, toda descrição é não-vazia.
2. `RecordingEventLog` (`packages/test-fixtures/src/fakes.ts:103`) passa a
   **lançar** numa violação. Com isso, cada um dos ~45 arquivos de teste que
   já dirige o engine e o relay vira teste de conformidade de graça. Esperar
   trabalho aqui: a primeira rodada vai acusar declarações faltando, e é
   exatamente esse o serviço.
3. O probe do e2e lê as linhas reais do `.amy/log/*.jsonl` e checa todas.

### O par que solda nomes em tempo de compilação

Em `packages/core/src/ports/EventLog.ts`, no mesmo arquivo da união pra não
poderem se separar:

```ts
export const EVENT_KINDS: Readonly<Record<EventKind, string>> = { ... };
export function isEventKind(value: string): value is EventKind
```

`Record<EventKind, string>` solda nos dois sentidos: tirar ou renomear um
membro da união dá *Property 'x' is missing*; acrescentar um membro dá o mesmo
erro pro novo; pôr uma chave que não está na união dá *Object literal may only
specify known properties*.

`isEventKind` ganha consumidor real (o knip exige) em
`FileEventLog.eventsIn()`, que hoje faz `JSON.parse` e casta pra `Event` **sem
validação nenhuma** — uma linha corrompida com `kind: "banana"` entra direto no
`spendSince`. Filtrar no `read()`, **nunca** no `append()`, e a ressalva vai
escrita: um binário velho lendo log novo descarta as linhas novas caladinho.

### O lock, e o que fica vermelho

Acrescenta `"packages/core/events.json"` no `options.scope` do
`L2.GENERATED_FILES_ARE_LOCKED` (`.software-factory/policy.yaml:114-118`) e
roda `sf lock`, que escreve o SHA-256 em
`.software-factory/locks/generated.lock.json` ao lado dos dois que já estão
lá. Nada mais é preciso: a regra já tem fixture de mutação, o
`L5.EVERY_CHECK_HAS_A_MUTATION_TEST` é por *regra* e não por arquivo, e
acrescentar caminho aperta, então o `L2.POLICY_ONLY_TIGHTENS` fica satisfeito.

Renomear `work.failed` pra `work.errored` sem `sf lock`, passo a passo:

1. `npm run build` quebra primeiro — `EVENT_KINDS` e todo `record("work.failed")`.
2. `npm run test:coverage` quebra em seguida — o teste de contrato acha
   `work.failed` no JSON e `work.errored` no código.
3. `sf check --allow-commands` quebra por último —
   `L2.GENERATED_FILES_ARE_LOCKED`, severidade crítica, sem grandfathering: o
   hash não bate. **É este o vermelho que a fase pede.**
4. `sf lock` reescreve o hash, e o diff de uma linha de hash ao lado de um kind
   renomeado é o que obriga o revisor a perguntar quem lê aquele kind.

Ressalva honesta: *acrescentar* um kind percorre o mesmo caminho, só que sem
subir `version`. Lock por cima de um arquivo que lista os kinds não deixa
adição virar coisa sem cerimônia. Então "acrescentar campo é seguro, renomear é
breaking" vale como **"os dois são visíveis, só um é breaking"**.

E "falha o gate" aqui é `sf check`, que é *regra*, não gate L3 — verdade via
`npm run gate`, e o plano do repo diz `npm run gate`, não "sf gate".

Antes de travar, reconferir que todo kind da união é realmente escrito por
alguém. Hoje sim (`stop.requested` sai do `packages/cli/src/index.ts:189`,
`agent.handoff` do `AgentRelay.ts:154,175`), mas travar um kind que ninguém
escreve congela uma mentira num arquivo cujo propósito inteiro é ser verdade.
E o comentário do `EventLog.ts` cita `amy observe`, **que não existe** — ou
conserta aqui, ou o contrato nasce mentindo.

---

## O gate

`plugin-serial-engine` é o único pacote grande sem gate, e é o que decide se um
ticket se perde. E o argumento é o mesmo que
`docs/design/the-relay-is-proven-end-to-end.md` faz por si: os caminhos que isto
existe pra cobrir são caminhos que um dia bom nunca alcança. Nenhum teste
unitário alcança o `mount()` de verdade, o fan-out com um canal que lança de
verdade, ou o `plugin-github` contra um `gh` fora do ar — e o que de fato
quebra é estado de arquivo **entre ticks**, quer dizer, entre processos.

Em `.software-factory/policy.yaml`:

```yaml
  plugin-serial-engine:
    activation:
      - "plugins/serial-engine/src/**"
      - "plugins/notify-fanout/src/**"
    evidence: ".software-factory/evidence/plugin-serial-engine.json"
    plan: "plans/the-engine-fails-out-loud.md"
    required_assertions:
      - "engine.warns_once_on_the_first_failure"
      - "engine.stays_quiet_on_the_middle_attempts"
      - "engine.warns_once_when_it_recovers"
      - "engine.carries_on_from_where_it_was"
      - "engine.keeps_the_attempt_count_across_a_park"
      - "engine.announces_once_at_the_ceiling"
      - "engine.finishes_the_tick_when_a_channel_throws"
      - "engine.records_the_notification_it_could_not_send"
      - "engine.finishes_the_tick_when_every_channel_throws"
      - "engine.finishes_the_tick_when_the_log_cannot_be_written"
      - "engine.every_line_matches_the_contract"
```

`plugin-notify-fanout/src/**` entra na ativação pelo mesmo motivo que o gate do
relay lista `agent-kit/src/**`: o fan-out é a outra metade da afirmação de
isolamento.

**`packages/core/src/ports/EventLog.ts` fica fora da ativação, de propósito.**
Incluir faria toda adição de kind expirar a evidência: conserto de compilação,
conserto de teste, `sf lock` **e** re-seal — quatro cerimônias pra uma mudança
aditiva é onde as pessoas começam a caçar a saída de emergência. O contrato se
prova por compilação, teste e lock; o gate fica sobre (a) e (b), onde o
argumento do artefato buildado é real.

### O scenario

`.software-factory/evidence/plugin-serial-engine-scenario.sh`, moldado no
`plugin-agent-relay-scenario.sh`: mesmo cabeçalho, mesmo `mktemp -d` + `trap`,
mesmo preflight do `dist/index.js`, mesmo probe `node --input-type=module`
escrevendo um report JSON.

Derrubar o GitHub no meio do tick: um `gh` falso em `$work/bin` (o scenario do
relay já faz isso com `claude`/`codex`) cujo comportamento é um arquivo que o
probe cria e remove entre ticks:

```sh
if [ -f "$AMY_E2E_GH_DOWN" ]; then
  echo "gh: could not connect to api.github.com" >&2; exit 1
fi
```

O probe monta os plugins **buildados** (`core`, `plugin-file-queue`,
`plugin-file-store`, `plugin-file-log`, `plugin-github`,
`plugin-serial-engine`, `plugin-notify-fanout`) mais um plugin de canal
descartável, definido inline no probe, que contribui pro `CHANNEL_COLLECTION` e
grava ou lança sob comando. O canal é o falso; o fan-out e o engine são reais,
exatamente como o scenario do relay falsifica a CLI e não o relay.

A sequência:

1. `touch $AMY_E2E_GH_DOWN`, tick → **um** anúncio, nomeando ticket e falha.
2. Mais dois ticks → **nenhum** anúncio novo, e o `attempt` do item subiu. O
   item está atrás do `pollBackoffMs`, então o probe adianta o relógio — `now`
   é serviço de host passado pro `mount()`, então o probe é dono dele.
3. `rm $AMY_E2E_GH_DOWN`, tick → **um** anúncio novo dizendo que voltou a
   andar, e o record no estado que estava mais o movimento que devia.
4. Canal passa a lançar, tick → o resultado **não** é `failed`, o record andou,
   e tem uma linha `notify.failed` no `.amy/log/*.jsonl`.
5. Log impossível de escrever, tick → ainda devolve `worked`.
6. Todas as linhas escritas passam pelo `checkEvent`.

Armadilha do passo 5, que vale antecipar: `chmod 000` no diretório de log não
resolve (o construtor do `FileEventLog` faz `mkdirSync`, e root ignora o modo).
Apontar o caminho do log pra um diretório cujo **pai** é um arquivo comum — aí
o `mkdirSync` lança `ENOTDIR` de forma determinística pra qualquer um.

Depois: `sf seal plugin-serial-engine`, e o script entra no `npm run e2e`.

### O plano no repo

`docs/design/the-engine-fails-out-loud.md`, com linha 4 no `plans/next-steps.md`:

> | 4 | [The engine fails out loud](the-engine-fails-out-loud.md) | A dependency that goes down produces one warning on the way down, silence while it is down, and one warning when it comes back, and no broken notification channel ever costs a ticket a move |

Cada critério carrega `(proof: assertion:engine.<nome>)` batendo com o
`required_assertions` — `L3.GATE_COVERS_THE_PLAN` checa um sentido,
`L4.PLAN_CRITERION_NAMES_ITS_CHECK` o outro.

O item (c) **não** vira critério com `assertion:`: ele é provado por regra
(`sf check`), não por asserção de scenario. Vai na prosa do corpo, que a regra
não varre, numa seção de fecho como a que o plano do relay tem.

---

## Ordem

Seis commits, cada um verde no `npm run gate` sozinho. O contrato entra em
segundo pra que os dois commits seguintes ensaiem o lock de ponta a ponta.

| # | Commit | O que entra |
| :-- | :-- | :-- |
| 1 | o attempt atravessa o park | `attempt: item.attempt` no branch de park, comentário corrigido, teste em `tests/budget.test.ts` |
| 2 | o contrato do log | `events.json`, `EVENT_KINDS`, `isEventKind`, `checkEvent`, filtro no `eventsIn()`, `RecordingEventLog` lançando, teste de contrato, `files` do `package.json` do core, escopo no `policy.yaml`, `sf lock` no mesmo commit |
| 3 | isolamento | try/catch no `announce()` e no `record()`, teto roteado por `this.announce`, sink do fan-out via `ctx.log`, kind `notify.failed`, `ThrowingNotifier`/`ThrowingEventLog` nas fixtures |
| 4 | queda e volta | `failureNotice()`, `announceRecovery()`, kinds `work.degraded` e `work.recovered` |
| 5 | o gate | scenario, `npm run e2e`, `sf seal`, bloco no `policy.yaml`, `docs/design/the-engine-fails-out-loud.md`, linha no `next-steps.md` — **não dá pra partir**, as quatro regras se referenciam |
| 6 | README | qualquer promessa nova precisa de `<!-- claim: ... proven-by: plugin-serial-engine -->` (`L4.CLAIM_CITES_ITS_EVIDENCE`) |

Testes existentes que mudam:

- `plugins/serial-engine/tests/Worker.test.ts:248` — "retries after an
  error, behind a backoff" afirma hoje que **não** houve notificação, e essa
  afirmação *é* o comportamento velho. Vira "warns once on the first failure
  and retries behind a backoff", com um único anúncio nomeando ticket e erro.
  As asserções de fila não mudam.
- `plugins/serial-engine/tests/Worker.test.ts:260` — enfileira com
  `attempt: maxItemAttempts - 1`, então `item.attempt !== 0` e o aviso da queda
  não dispara. **Passa sem mudar**, o que é sinal útil de que a guarda está na
  condição certa. Apertar pra `toHaveLength(1)`, pra que o teto nunca vire dois
  anúncios calado.

Testes novos: silêncio no meio; um anúncio na volta com o item reenfileirado em
`attempt: 0`; "não confunde um park com uma recuperação" (o que fixa o commit
1); e uma tabela direto no `failureNotice()`.

Dois ratchets pra vigiar: os commits 3 e 4 acrescentam branch no `Worker.ts`, e
cada `catch` novo precisa do teste dele ou o piso de 83% de branches escorrega
— é pra isso que servem as fixtures que lançam. **Piso nunca desce.** E se
`recordFailure` ou `advance` bater no `L1.COMPLEXITY_CEILING`, extrai mais; não
acrescenta chave no `ratchet.yaml`, que o cabeçalho do próprio arquivo chama de
"the one move this file exists to make visible in review".

---

## Verificação

```sh
npm run build && npm test && npm run lint && npm run knip && npm run audit \
  && sf check --allow-commands && sf verify
npm run e2e
```

E, ponta a ponta:

1. `gh` falso fora do ar no meio de um tick: **um** aviso na queda, silêncio
   nas tentativas do meio, **um** aviso na volta, e o ticket continua de onde
   estava.
2. Canal de notificação quebrado: o tick termina, o record anda, e a linha
   `notify.failed` diz o que não foi entregue.
3. Log impossível de escrever: o tick termina, e o stderr avisa uma vez.
4. Renomear um `EventKind` sem `sf lock`: `npm run gate` fica vermelho no
   `L2.GENERATED_FILES_ARE_LOCKED`. Rodar `sf lock` fecha.
5. Um park não zera o `attempt` e não é lido como recuperação.

## O que não fica provado, e vai dito

- **"Um aviso na queda" é por ticket, não por queda.** `item.attempt` é por
  item de fila, então uma queda do GitHub afetando cinco tickets dá cinco
  avisos de queda e cinco de volta. Um scenario de um ticket só nunca percebe.
  A versão por **porta** exige estado de saúde por dependência, é
  materialmente maior, e fica anotada como follow-up pra quando alguém rodar
  mais que um punhado de tickets.
- **Não há recuperação depois do teto**, pelo motivo argumentado acima.
- **Um crash não produz aviso de queda.** `FileQueue.recover()` devolve o item
  por `rename`, preservando o `attempt`, então um worker morto no meio volta no
  *mesmo* attempt. Defensável — crash não é queda de dependência — e vale
  escrito.
- **A convenção de `version` é do revisor, não da máquina**, pelo motivo da
  seção (c).
- **Binário velho lendo log novo descarta as linhas que não conhece**, que é o
  preço de filtrar por `isEventKind` no `read()`.
