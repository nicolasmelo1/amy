/** A resolver built without its profile: the mutation this fixture proves. */
export function load(home: string, paths: (home: string) => { plugins: string }): (spec: string) => string {
  return pluginsRootResolver(home, paths(home).plugins);
}
