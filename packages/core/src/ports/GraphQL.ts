/**
 * A GraphQL endpoint, behind a port.
 *
 * Keeping the transport out of the adapter means the adapter's queries and
 * its mapping can be tested without a network or an API key.
 */
export interface GraphQLClient {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}
