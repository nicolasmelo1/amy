# @amykit/ui-conformance

The frame's conformance script. It drives a renderer through a fixed script
over a fixed world — by the default keys, by a remapped keymap and by the
mouse, and the default way twice — and reads back what the renderer laid out,
never what it says it did ([the frame is closed](../../docs/design/the-frame-is-closed.md)).

The frame, the approved golden and the conformance config are not here: they
ship with [`@amykit/ui`](../ui/README.md), which this package reads them from.

## What a run checks

Per step, a **projection**: the regions in the frame's order, what each holds,
whether each spans the full height, and how every pair sits relative to each
other — `left-of`, `above`, `overlaps` — never a box. So a pixel and a cell
compare the same way and a font changes nothing.

Eleven assertions, each failing by name:

| Assertion | Fails when |
| --- | --- |
| `frame.every_region_sits_where_declared` | a region is missing, drawn while closed, or breaks the relation its place promises |
| `frame.no_region_is_invented` | a region or a hold the frame does not declare is drawn |
| `frame.every_key_does_what_it_is_declared_to` | a key or a gesture asks for anything but the action the keymap or the frame's mouse gives it |
| `frame.renderers_agree_on_every_region` | two renderers' projections differ, naming the first node |
| `frame.nothing_moved_since_it_was_approved` | a projection differs from the locked golden |
| `frame.a_slot_takes_only_what_it_declares` | a plugin's contribution is drawn outside its slot, or its tab before the fixed ones |
| `frame.the_fixed_sections_come_first` | nav 1's sections are not the config's order and then the plugin's |
| `frame.no_region_is_lost_at_the_narrowest_width` | a region is missing or has no room at the narrowest window |
| `frame.keys_remaps_and_the_mouse_agree` | the three runs yield different projections |
| `frame.a_surface_is_drawn_only_where_declared` | a surface is drawn that the renderer did not declare, or with a primitive it does not hold |
| `frame.a_projection_is_deterministic` | the same script twice is not the same bytes |

## The command

```sh
amy-ui-conformance                          # every plugins/ui-* renderer under the current directory
amy-ui-conformance --root <workspace>       # under another one
amy-ui-conformance --renderer <module.js>   # the renderers a module exports; repeatable
amy-ui-conformance --report <file.json>     # also write the report
amy-ui-conformance --approve                # the window is meant to change: write the golden, then `sf lock`
```

A renderer is found by its package naming a module under `amy.conformance`,
and that module exporting `renderers`, until *a renderer is chosen by name*
finds them through the `ui-renderer` collection instead.
