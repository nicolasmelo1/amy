# @amy/core

The kernel. It knows no domain.

What lives here is the catalogue of **actions** that can be taken, how each one
is dispatched, the generic work record, the plan, the plugin contracts, the
registry that assembles them, and the process-level infrastructure everything
shares.

To this package a state is a `string` and an action is an open name. It cannot
tell a ticket from a deploy, and that is the point: a workflow is only the
order in which actions happen, so a second workflow reuses `implement` rather
than dragging a whole domain along with it.

## The action catalogue

Each action names the **port** that must be mounted for it to run, and the
method on that port it invokes. A plugin may add an action the core does not
have, and when it does it has to bring the port that runs it in the same
package: an action nobody can execute is a promise the machine cannot keep.

## What it refuses, and when

Everything at mount, by name, before a ticket is touched:

- a setting that is not one the plugin declared, because that is a typo and
  ignoring it means the setting silently never applied
- two plugins claiming the same port, or the same action, or the same
  observation
- an action the workflow says it emits that nothing can run

`unmetNeeds` is where the price of an open action name gets paid.

## The one rule that holds this together

`L0.CORE_STAYS_IGNORANT`, a local rule in `.software-factory/rules/`: nothing
under `src/` may import an `@amy/workflow-*` or `@amy/plugin-*` package. One
such import and the core learns a domain, and every workflow after the first
becomes a fork. It has a mutation fixture, and `sf verify` proves it still
fires.
