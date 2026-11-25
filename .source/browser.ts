// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"api.mdx": () => import("../content/docs/api.mdx?collection=docs"), "attestation.mdx": () => import("../content/docs/attestation.mdx?collection=docs"), "batch.mdx": () => import("../content/docs/batch.mdx?collection=docs"), "billing.mdx": () => import("../content/docs/billing.mdx?collection=docs"), "blackboxes.mdx": () => import("../content/docs/blackboxes.mdx?collection=docs"), "dry-docks.mdx": () => import("../content/docs/dry-docks.mdx?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "keys.mdx": () => import("../content/docs/keys.mdx?collection=docs"), "migration.mdx": () => import("../content/docs/migration.mdx?collection=docs"), "observability.mdx": () => import("../content/docs/observability.mdx?collection=docs"), "providers.mdx": () => import("../content/docs/providers.mdx?collection=docs"), "quickstart.mdx": () => import("../content/docs/quickstart.mdx?collection=docs"), "sdks.mdx": () => import("../content/docs/sdks.mdx?collection=docs"), "streaming.mdx": () => import("../content/docs/streaming.mdx?collection=docs"), "teams.mdx": () => import("../content/docs/teams.mdx?collection=docs"), "troubleshooting.mdx": () => import("../content/docs/troubleshooting.mdx?collection=docs"), "workspace.mdx": () => import("../content/docs/workspace.mdx?collection=docs"), }),
};
export default browserCollections;