// A mark only the copy of the core that made it can read.
export const MARK = Symbol("a-mark");
export const marked = (value: object) => ({ ...value, [MARK]: true });
