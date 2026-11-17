/** A request made without the one transport: the mutation this fixture proves. */
export async function ask(url: string): Promise<number> {
  const response = await fetch(url);
  return response.status;
}
