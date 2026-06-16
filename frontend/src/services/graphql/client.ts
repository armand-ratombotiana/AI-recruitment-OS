'use client';

import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  from,
} from '@apollo/client';
import { ApolloLink } from '@apollo/client/link';
import { ErrorLink } from '@apollo/client/link/error';
import { setContext } from '@apollo/client/link/context';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Observable } from 'rxjs';

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ||
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/graphql';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airos_token');
}

const httpLink = new HttpLink({ uri: GRAPHQL_URL });

const authLink = setContext((_, { headers }) => {
  const token = getToken();
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const errorLink = new ErrorLink(({ error, operation }) => {
  if (CombinedGraphQLErrors.is(error)) {
    error.errors.forEach(({ message, locations, path }) => {
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${JSON.stringify(locations)}, Path: ${path}`
      );
      if (message.includes('Unauthorized') || message.includes('unauthenticated')) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('airos_token');
          window.dispatchEvent(new CustomEvent('airos:unauthorized'));
        }
      }
    });
  } else {
    console.error(`[Network error]: ${error}`);
  }
});

const loggingLink = new ApolloLink((operation, forward) => {
  const startTime = Date.now();
  return new Observable((observer) => {
    const subscription = forward(operation).subscribe({
      next: (response) => {
        const duration = Date.now() - startTime;
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[GraphQL] ${operation.operationName} completed in ${duration}ms`
          );
        }
        observer.next(response);
      },
      error: (err) => observer.error(err),
      complete: () => observer.complete(),
    });
    return () => subscription.unsubscribe();
  });
});

const cache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        candidates: {
          keyArgs: ['status', 'search'],
          merge(existing, incoming, { args }) {
            if (!args?.offset || args.offset === 0) return incoming;
            return {
              ...incoming,
              items: [...(existing?.items || []), ...(incoming.items || [])],
            };
          },
        },
        jobs: {
          keyArgs: ['status', 'search'],
          merge(existing, incoming, { args }) {
            if (!args?.offset || args.offset === 0) return incoming;
            return {
              ...incoming,
              items: [...(existing?.items || []), ...(incoming.items || [])],
            };
          },
        },
      },
    },
    Candidate: { keyFields: ['id'] },
    Job: { keyFields: ['id'] },
    Interview: { keyFields: ['id'] },
    Assessment: { keyFields: ['id'] },
  },
});

export const apolloClient = new ApolloClient({
  link: from([loggingLink, errorLink, authLink, httpLink]),
  cache,
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
    query: { fetchPolicy: 'network-only' },
  },
});

export function updateAuthToken(token: string | null) {
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('airos_token', token);
    else localStorage.removeItem('airos_token');
  }
}

export { gql } from '@apollo/client';
