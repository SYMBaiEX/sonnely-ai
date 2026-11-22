import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("Recover finalized USDC deposits", { minutes: 2 }, internal.depositRecovery.sweep, {});
crons.interval("Recover and expire compute runs", { minutes: 1 }, internal.compute.sweep, {});
crons.interval("Deliver UsageMax gateway receipts", { minutes: 1 }, internal.usageMaxOutbox.dispatch, {});
crons.interval("Expire UsageMax delivery records", { hours: 1 }, internal.usageMaxOutbox.purge, {});
crons.interval("Sync provider costs and gateway alerts", { minutes: 5 }, internal.operations.sweep, {});
crons.interval("Send gateway alert emails", { minutes: 1 }, internal.operations.dispatch, {});
crons.interval("Expire gateway alert email records", { hours: 1 }, internal.operations.expire, {});
export default crons;
