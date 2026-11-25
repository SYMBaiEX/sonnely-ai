// @ts-nocheck
import * as __fd_glob_17 from "../content/docs/workspace.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/troubleshooting.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/teams.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/streaming.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/sdks.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/quickstart.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/providers.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/observability.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/migration.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/keys.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/dry-docks.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/blackboxes.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/billing.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/batch.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/attestation.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/api.mdx?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, }, {"api.mdx": __fd_glob_1, "attestation.mdx": __fd_glob_2, "batch.mdx": __fd_glob_3, "billing.mdx": __fd_glob_4, "blackboxes.mdx": __fd_glob_5, "dry-docks.mdx": __fd_glob_6, "index.mdx": __fd_glob_7, "keys.mdx": __fd_glob_8, "migration.mdx": __fd_glob_9, "observability.mdx": __fd_glob_10, "providers.mdx": __fd_glob_11, "quickstart.mdx": __fd_glob_12, "sdks.mdx": __fd_glob_13, "streaming.mdx": __fd_glob_14, "teams.mdx": __fd_glob_15, "troubleshooting.mdx": __fd_glob_16, "workspace.mdx": __fd_glob_17, });