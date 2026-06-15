'use client';

import {
  useQuery,
  useMutation,
  useSubscription,
} from '@apollo/client/react';

export { useQuery as useGraphQLQuery } from '@apollo/client/react';
export { useMutation as useGraphQLMutation } from '@apollo/client/react';
export { useSubscription as useGraphQLSubscription } from '@apollo/client/react';

export type UseQueryHook = typeof useQuery;
export type UseMutationHook = typeof useMutation;
export type UseSubscriptionHook = typeof useSubscription;
