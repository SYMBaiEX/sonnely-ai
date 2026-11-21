import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("Recover finalized USDC deposits", { minutes: 2 }, internal.depositRecovery.sweep, {});
export default crons;
