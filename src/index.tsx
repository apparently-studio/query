import { createContext, onMount, onCleanup, useContext, createResource } from "solid-js";
import type { ParentComponent, Accessor, InitializedResourceReturn, Signal } from "solid-js";
import { createMutable } from "solid-js/store";

type Fetcher = (...args: any[]) => Promise<any>;

type Cache = { [key: string]: any };

interface QueryConfig {
    fetcher: Fetcher
}

interface QueryData {
    fetcher: Fetcher
    cache: Cache
}

const QueryContext = createContext<QueryData>();

export function useQueryContext() {
    return useContext(QueryContext)!;
}

export const QueryConfig: ParentComponent<QueryConfig> = (props) => {
    const cache = createMutable<Cache>({});

    return (
        <QueryContext.Provider value={{ fetcher: props.fetcher, cache }}>
            {props.children}
        </QueryContext.Provider>
    );
}

export function useCache() {
    const { fetcher, cache } = useQueryContext();

    return {
        remove(keyOrPredicate: string | ((key: string) => boolean)) {
            if (typeof keyOrPredicate == "function") {
                for (const key in cache) {
                    if (!keyOrPredicate(key)) continue;
                    this.remove(key);
                }

                return;
            }

            delete cache[keyOrPredicate];
        },

        set(key: string, data: unknown) {
            cache[key] = data;
        },

        get(key: string) {
            return cache[key];
        }
    };
}

export function useQuery<T>(getKey: Accessor<string | null>, initialValue?: T): InitializedResourceReturn<T> {
    const { fetcher, cache } = useQueryContext();

    const cacheStorage = (initialValue: T) => {
        if (!cache.hasOwnProperty(getKey()!)) {
            cache[getKey()!] = initialValue;
        }

        return [
            () => cache[getKey()!],
            (newValue: Accessor<T>) => {
                cache[getKey()!] = newValue();
                return cache[getKey()!];
            }
        ] as Signal<T>;
    }

    const cacheFetcher = async (key: string) => {
        if (cache.hasOwnProperty(key)) {
            (async () => {
                cache[key] = await fetcher(key);
            })();

            return cache[key];
        }

        return await fetcher(key);
    }

    // @ts-ignore
    // TODO: opravit type problem.
    const [resource, { refetch, mutate }] = createResource<T>(getKey, cacheFetcher, { storage: cacheStorage, initialValue });

    onMount(() => window.addEventListener("focus", refetch));
    onCleanup(() => window.removeEventListener("focus", refetch));

    return [resource, { refetch, mutate }];
}

export function useMutate<T>() {
    const { fetcher, cache } = useQueryContext();

    return (path: string, data?: T) => {
        if (data) {
            cache[path] = { data, error: null };
            return;
        }

        (async () => {
            cache[path] = await fetcher(path);
        })();
    }
}