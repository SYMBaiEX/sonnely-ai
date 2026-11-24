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
import type * as adminActions from "../adminActions.js";
import type * as alertFallback from "../alertFallback.js";
import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as compute from "../compute.js";
import type * as computeCapacity from "../computeCapacity.js";
import type * as computeProvider from "../computeProvider.js";
import type * as computeValidators from "../computeValidators.js";
import type * as computeWorker from "../computeWorker.js";
import type * as confidentialPayments from "../confidentialPayments.js";
import type * as confidentialPilot from "../confidentialPilot.js";
import type * as creditRecovery from "../creditRecovery.js";
import type * as crm from "../crm.js";
import type * as crmTasks from "../crmTasks.js";
import type * as crons from "../crons.js";
import type * as currentKey from "../currentKey.js";
import type * as depositRecovery from "../depositRecovery.js";
import type * as events from "../events.js";
import type * as finance from "../finance.js";
import type * as launchGuard from "../launchGuard.js";
import type * as ledger from "../ledger.js";
import type * as operations from "../operations.js";
import type * as operationsContract from "../operationsContract.js";
import type * as operators from "../operators.js";
import type * as providerInvoiceContract from "../providerInvoiceContract.js";
import type * as providerInvoices from "../providerInvoices.js";
import type * as recoveryData from "../recoveryData.js";
import type * as referralPipeline from "../referralPipeline.js";
import type * as relay from "../relay.js";
import type * as requestLogContract from "../requestLogContract.js";
import type * as requestLogs from "../requestLogs.js";
import type * as sonnely from "../sonnely.js";
import type * as statementFeed from "../statementFeed.js";
import type * as support from "../support.js";
import type * as ticketBulk from "../ticketBulk.js";
import type * as usageExport from "../usageExport.js";
import type * as usageMaxOutbox from "../usageMaxOutbox.js";
import type * as usageMaxOutboxValidators from "../usageMaxOutboxValidators.js";
import type * as usageMaxTrace from "../usageMaxTrace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  adminActions: typeof adminActions;
  alertFallback: typeof alertFallback;
  analytics: typeof analytics;
  audit: typeof audit;
  compute: typeof compute;
  computeCapacity: typeof computeCapacity;
  computeProvider: typeof computeProvider;
  computeValidators: typeof computeValidators;
  computeWorker: typeof computeWorker;
  confidentialPayments: typeof confidentialPayments;
  confidentialPilot: typeof confidentialPilot;
  creditRecovery: typeof creditRecovery;
  crm: typeof crm;
  crmTasks: typeof crmTasks;
  crons: typeof crons;
  currentKey: typeof currentKey;
  depositRecovery: typeof depositRecovery;
  events: typeof events;
  finance: typeof finance;
  launchGuard: typeof launchGuard;
  ledger: typeof ledger;
  operations: typeof operations;
  operationsContract: typeof operationsContract;
  operators: typeof operators;
  providerInvoiceContract: typeof providerInvoiceContract;
  providerInvoices: typeof providerInvoices;
  recoveryData: typeof recoveryData;
  referralPipeline: typeof referralPipeline;
  relay: typeof relay;
  requestLogContract: typeof requestLogContract;
  requestLogs: typeof requestLogs;
  sonnely: typeof sonnely;
  statementFeed: typeof statementFeed;
  support: typeof support;
  ticketBulk: typeof ticketBulk;
  usageExport: typeof usageExport;
  usageMaxOutbox: typeof usageMaxOutbox;
  usageMaxOutboxValidators: typeof usageMaxOutboxValidators;
  usageMaxTrace: typeof usageMaxTrace;
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
