import { createContext, onMount, onCleanup, useContext, createResource, InitializedResource, Setter, ResourceReturn, createSignal, createEffect, on, untrack } from "solid-js";
import type { ParentComponent, Accessor, InitializedResourceReturn, Signal } from "solid-js";
import { ReactiveMap } from "@solid-primitives/map";
// @ts-ignore
import stableHash from "stable-hash";
import { format } from "path";

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
// - infiniteQuery (v postupu)
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

// TODO: caching, suspense, klasický nekonečný scroll (bez deloadingu), vyčistit kód...

//type UseInfiniteQueryGetKey<T> = (pageIndex: number, previousPageData: T | null) => string;
//type UseInfiniteQuery<T> = [InitializedResource<T[][]>, { setSize: Setter<number>, size: Accessor<number>, loadingNextPage: Accessor<boolean> }];

// export function useInfiniteQuery<T>(getKey: UseInfiniteQueryGetKey<T>, initialValue?: T[]) {
//     const { fetcher, cache } = useQueryContext();

//     const [size, setSize] = createSignal(0);
//     const [loadingPage, setLoadingPage] = createSignal(false);

//     const [data, setData] = createSignal<T[]>([]);

//     let max = 0;

//     onMount(async () => setData(await fetcher(getKey(0, null))));

//     createEffect(() => {
//         if (data().length > max) {
//             max = data().length;
//         }

//         const _size = untrack(size);

//         console.log("Max loaded sofar:", max, "Size:", _size);
//     });

//     async function forward() {
//         if (loadingPage()) {
//             return;
//         }
//         setLoadingPage(true);

//         let _data = untrack(data);

//         const newSize = size() + 1;
//         const fetchedData = await fetcher(getKey(newSize, null));

//         let newData = [..._data, ...fetchedData];

//         if (newSize % 4 == 0) {
//             newData = newData.slice(newData.length - 200, newData.length);
//         }

//         setData(newData);
//         setSize(newSize);
//         setLoadingPage(false);
//     }

//     async function back() {
//         if (loadingPage()) {
//             return;
//         }

//         if (size() <= 3) {
//             if (size() != 0) {
//                 setSize(0);
//             }

//             return;
//         }

//         setLoadingPage(true);
//         let _data = untrack(data);

//         const newSize = size() - 1;
//         const fetchedData = await fetcher(getKey(newSize - 3, null));

//         let newData = [...fetchedData, ..._data];

//         if (newSize % 4 == 0) {
//             newData = newData.slice(0, newData.length - 200);
//         }

//         setData(newData);
//         setSize(newSize);
//         setLoadingPage(false);
//     }

//     return [data, { back, forward }];
// }