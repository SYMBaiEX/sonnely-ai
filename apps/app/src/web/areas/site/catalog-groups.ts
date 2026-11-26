// spec/app/models.md, "Story: Filter the catalog"; spec/app/console/catalog.md, "Story: Browse the catalog"
export interface CatalogIdentity {
  readonly provider: string;
  readonly upstreamId: string;
  readonly name: string;
  readonly workload: string;
  readonly summary: string;
  readonly context: number;
  readonly routes: readonly {
    readonly endpoint: string;
    readonly modelId: string;
  }[];
}

export interface CanonicalModel<T extends CatalogIdentity> {
  readonly key: string;
  readonly name: string;
  readonly representative: T;
  readonly entries: readonly T[];
  readonly routable: readonly T[];
  readonly providers: readonly string[];
  readonly endpoints: readonly string[];
  readonly context: number;
  readonly routeCount: number;
  readonly catalogOnly: boolean;
  readonly searchText: string;
}

type MutableGroup<T extends CatalogIdentity> = {
  keys: Set<string>;
  entries: [T, ...T[]];
};

export function cleanModelName(name: string) {
  return name.replace(/^[^:]+:\s*/, "").trim();
}

export function normalizeModelKey(value: string) {
  return value
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function basename(value: string) {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function identityKeys(entry: CatalogIdentity) {
  const keys = new Set<string>();
  const name = normalizeModelKey(cleanModelName(entry.name));
  const upstream = normalizeModelKey(basename(entry.upstreamId));
  if (name) keys.add("name:" + name);
  if (upstream) keys.add("upstream:" + upstream);
  for (const route of entry.routes) {
    const routed = normalizeModelKey(basename(route.modelId));
    if (routed) keys.add("route:" + routed);
  }
  return keys;
}

function intersects<T extends CatalogIdentity>(keys: Set<string>, group: MutableGroup<T>) {
  return [...keys].some((key) => group.keys.has(key));
}

function mergeInto<T extends CatalogIdentity>(
  groups: MutableGroup<T>[],
  matches: MutableGroup<T>[],
  entry: T,
  keys: Set<string>,
) {
  const first = matches[0];
  for (const extra of matches.slice(1)) {
    first.entries.push(...extra.entries);
    for (const key of extra.keys) first.keys.add(key);
    groups.splice(groups.indexOf(extra), 1);
  }
  first.entries.push(entry);
  for (const key of keys) first.keys.add(key);
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function groupCatalog<T extends CatalogIdentity>(catalog: readonly T[]): CanonicalModel<T>[] {
  const groups: MutableGroup<T>[] = [];
  for (const entry of catalog) {
    const keys = identityKeys(entry);
    const matches = groups.filter((group) => intersects(keys, group));
    if (matches.length) mergeInto(groups, matches, entry, keys);
    else groups.push({ keys, entries: [entry] });
  }
  return groups.map((group, index) => {
    const entries = [...group.entries];
    const routable = entries.filter((entry) => entry.routes.length > 0);
    const representative = routable[0] ?? entries[0];
    const name = cleanModelName(representative.name) || basename(representative.upstreamId);
    const key =
      normalizeModelKey(name) ||
      normalizeModelKey(basename(representative.upstreamId)) ||
      representative.provider + "-" + index;
    return {
      key,
      name,
      representative,
      entries,
      routable,
      providers: unique(entries.map((entry) => entry.provider)),
      endpoints: unique(entries.flatMap((entry) => entry.routes.map((route) => route.endpoint))),
      context: Math.max(...entries.map((entry) => entry.context ?? 0)),
      routeCount: entries.reduce((count, entry) => count + entry.routes.length, 0),
      catalogOnly: routable.length === 0,
      searchText: entries
        .flatMap((entry) => [
          entry.name,
          cleanModelName(entry.name),
          entry.upstreamId,
          entry.provider,
          entry.workload,
          entry.summary,
          ...entry.routes.flatMap((route) => [route.endpoint, route.modelId]),
        ])
        .join(" ")
        .toLowerCase(),
    };
  });
}
