import { createContext, onMount, onCleanup, useContext } from "solid-js";
import type { ParentComponent, Accessor } from "solid-js";
import { createMutable } from "solid-js/store";

type Fetcher = (...args: any[]) => Promise<unknown>;

interface CacheItem {
    data: unknown
    error: unknown
}

type StringKeydObject = { [key: string]: CacheItem };

interface QueryConfig {
    fetcher: Fetcher
}

interface QueryData {
    fetcher: Fetcher
    cache: StringKeydObject
}

const QueryContext = createContext<QueryData>();

export function useQueryContext() {
    return useContext(QueryContext)!;
}

export const QueryConfig: ParentComponent<QueryConfig> = (props) => {
    const cache = createMutable<StringKeydObject>({});

    return (
        <QueryContext.Provider value={{ fetcher: props.fetcher, cache }}>
            {props.children}
        </QueryContext.Provider>
    );
}

async function fetchData(path: string, cache: StringKeydObject, fetcher: Fetcher) {
    try {
        const res = fetcher(path);
        const newCache = await res;
        cache[path] = { data: newCache, error: null };
    } catch (e) {
        cache[path] = { data: null, error: e };
    }
}

export function useQuery<T>(path: string): { data: Accessor<T>, error: Accessor<unknown> } {
    const { fetcher, cache } = useQueryContext();
    const data = () => cache[path]?.data as T;
    const error = () => cache[path]?.error;
    const fatchDataCall = () => fetchData(path, cache, fetcher);

    fatchDataCall();

    onMount(() => window.addEventListener("focus", fatchDataCall));
    onCleanup(() => window.removeEventListener("focus", fatchDataCall));

    return { data, error };
}

export function useMutate<T>() {
    const { fetcher, cache } = useQueryContext();

    return (path: string, data?: T) => {
        if (data) {
            cache[path] = { data, error: null };
            return;
        }

        fetchData(path, cache, fetcher);
    }
}