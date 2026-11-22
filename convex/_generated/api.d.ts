/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as compute from "../compute.js";
import type * as computeCapacity from "../computeCapacity.js";
import type * as computeProvider from "../computeProvider.js";
import type * as computeValidators from "../computeValidators.js";
import type * as computeWorker from "../computeWorker.js";
import type * as creditRecovery from "../creditRecovery.js";
import type * as crm from "../crm.js";
import type * as crons from "../crons.js";
import type * as depositRecovery from "../depositRecovery.js";
import type * as finance from "../finance.js";
import type * as ledger from "../ledger.js";
import type * as recoveryData from "../recoveryData.js";
import type * as referralPipeline from "../referralPipeline.js";
import type * as relay from "../relay.js";
import type * as sonnely from "../sonnely.js";
import type * as usageExport from "../usageExport.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  compute: typeof compute;
  computeCapacity: typeof computeCapacity;
  computeProvider: typeof computeProvider;
  computeValidators: typeof computeValidators;
  computeWorker: typeof computeWorker;
  creditRecovery: typeof creditRecovery;
  crm: typeof crm;
  crons: typeof crons;
  depositRecovery: typeof depositRecovery;
  finance: typeof finance;
  ledger: typeof ledger;
  recoveryData: typeof recoveryData;
  referralPipeline: typeof referralPipeline;
  relay: typeof relay;
  sonnely: typeof sonnely;
  usageExport: typeof usageExport;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
