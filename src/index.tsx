import { createContext, onMount, onCleanup, useContext, createResource, InitializedResource, Setter, ResourceReturn, createSignal, createEffect, on } from "solid-js";
import type { ParentComponent, Accessor, InitializedResourceReturn, Signal } from "solid-js";
import { ReactiveMap } from "@solid-primitives/map";
// @ts-ignore
import stableHash from "stable-hash";

type Fetcher = (...args: any[]) => Promise<any>;

interface QueryConfig {
    fetcher: Fetcher
}

interface QueryData {
    fetcher: Fetcher
    cache: ReactiveMapWithStableHash<string, unknown>
}

const QueryContext = createContext<QueryData>();

class ReactiveMapWithStableHash<K, V> extends ReactiveMap<K, V> {
    set(key: K, value: V): this {
        if (stableHash(super.get(key)) === stableHash(value)) {
            return this;
        }

        return super.set(key, value);
    }
}

// TODO:
// - deduplikace
// - infinite query
// - error retry
// - isRefething 
// - refetch on reconnect

export function useQueryContext() {
    return useContext(QueryContext)!;
}

export const QueryConfig: ParentComponent<QueryConfig> = (props) => {
    const cache = new ReactiveMapWithStableHash<string, unknown>(); // Tady možná je trochu overheat, že has atd je reaktivní.

    return (
        <QueryContext.Provider value={{ fetcher: props.fetcher, cache }}>
            {props.children}
        </QueryContext.Provider>
    );
}

export function useCache() {
    const { fetcher, cache } = useQueryContext();
    return cache;
}

export function useMutate<T>() {
    const { fetcher, cache } = useQueryContext();
    return async (key: string, data?: T) => { cache.set(key, data ? data : await fetcher(key)); }
}

export function useQuery<T>(getKey: Accessor<string | null>, initialValue?: T): [InitializedResource<T>, { mutate: (data?: T) => Promise<void> }] {
    const { fetcher, cache } = useQueryContext();
    const globalMutate = useMutate<T>();

    const mutate = (data?: T) => globalMutate(getKey()!, data);
    const refetch = () => mutate();

    const cacheStorage = (initialValue: T) => {
        const key = getKey()!;

        if (!cache.has(key) && initialValue) {
            cache.set(key, initialValue);
        }

        return [
            () => cache.get(key),
            (newValue: Accessor<T>) => {
                cache.set(key, newValue());
                return cache.get(key);
            }
        ] as Signal<T>;
    }

    const cacheFetcher = async (key: string) => {
        if (cache.has(key)) {
            (async () => cache.set(key, await fetcher(key)))();
            return cache.get(key);
        }

        return await fetcher(key);
    }

    // @ts-ignore
    // TODO: opravit type problem.
    const [resource] = createResource<T>(getKey, cacheFetcher, { storage: cacheStorage, initialValue });

    onMount(() => window.addEventListener("focus", refetch));
    onCleanup(() => window.removeEventListener("focus", refetch));

    return [resource, { mutate }];
}
