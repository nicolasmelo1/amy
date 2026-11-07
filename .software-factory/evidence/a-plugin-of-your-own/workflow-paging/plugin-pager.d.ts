// The plugin this workflow imports by name, as its own package declares it:
// what the scenario installs beside it, never resolved from this checkout.
declare module "@acme/plugin-pager" {
  export const said: string;
}
