// The smallest violation there is: a view that renders instead of
// describing. It draws in a browser and nowhere else, and a plugin shipping
// it brings a second copy of React into somebody's window.
import { useState } from "react";

export function StatusView(props: { readonly records: readonly string[] }) {
  const [open] = useState(false);
  return <ul hidden={open}>{props.records.map((id) => <li key={id}>{id}</li>)}</ul>;
}
