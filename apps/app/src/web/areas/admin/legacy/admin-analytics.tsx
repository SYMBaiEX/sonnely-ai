// @ts-nocheck — legacy Convex return types are reconstructed by the admin migration adapter.
import { useEffect, useState } from "react";
import type { FunctionReturnType } from "./convex-server.ts";
import type { api } from "./convex-api.ts";
import { models, shorten, usd } from "./lib/models.ts";
import { providerNames } from "./lib/provider-catalog.ts";
import { EmptyState, Skeleton } from "./admin/ui.tsx";
import { CopyButton } from "./shared.tsx";
import { request } from "./wallet";

type Analytics = FunctionReturnType<typeof api.analytics.daily>;
type Point = { day: string; value: number };

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    Date.parse(day),
  );
const modelName = (id: string) => models.find((item) => item.id === id)?.name ?? id;

function Series({
  title,
  points,
  format = (value: number) => value.toLocaleString(),
}: {
  title: string;
  points: Point[];
  format?: (value: number) => string;
}) {
  const high = Math.max(1, ...points.map((point) => point.value));
  return (
    <section className="panel chart-panel">
      <h2>{title}</h2>
      <div className="bars" role="img" aria-label={title + " by UTC day"}>
        {points.map((point) => (
          <span
            key={point.day}
            title={dayLabel(point.day) + " · " + format(point.value)}
            data-empty={!point.value || undefined}
            style={{ height: point.value ? Math.max(1, (point.value / high) * 100) + "%" : "1px" }}
          />
        ))}
      </div>
      <div className="between caption">
        <span>{dayLabel(points[0].day)}</span>
        <span>{dayLabel(points[points.length - 1].day)}</span>
      </div>
    </section>
  );
}

export function AdminAnalytics() {
  const [range, setRange] = useState(30);
  const [state, setState] = useState<{ range: number; data?: Analytics; error?: string }>();
  useEffect(() => {
    let active = true;
    void request<Analytics>("admin-crm?view=analytics&days=" + range)
      .then((data) => {
        if (active) setState({ range, data });
      })
      .catch((error: Error) => {
        if (active) setState({ range, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [range]);
  const current = state?.range === range ? state : undefined;
  const data = current?.data;
  const totals = data?.days.reduce(
    (sum, day) => ({
      requests: sum.requests + day.requests,
      completed: sum.completed + day.completed,
      spend: sum.spend + day.spend,
      signups: sum.signups + day.signups,
      deposits: sum.deposits + day.deposits,
      depositUsd: sum.depositUsd + day.depositUsd,
    }),
    { requests: 0, completed: 0, spend: 0, signups: 0, deposits: 0, depositUsd: 0 },
  );
  const providerTotal = data?.providerSplit.reduce((sum, row) => sum + row.requests, 0) ?? 0;
  return (
    <>
      <section className="panel stack-panel" aria-labelledby="admin-analytics-heading">
        <div className="between">
          <div>
            <h2 id="admin-analytics-heading">Analytics</h2>
            <p className="caption">Platform requests, spend, signups, and deposits by UTC day.</p>
          </div>
          <label className="control-label">
            Date range
            <select value={range} onChange={(event) => setRange(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
        {current?.error ? (
          <p className="error" role="alert">
            {current.error}
          </p>
        ) : !data || !totals ? (
          <Skeleton rows={5} />
        ) : (
          <>
            <div className="stat-grid">
              {[
                ["Requests", totals.requests.toLocaleString()],
                [
                  "Completed rate",
                  totals.requests
                    ? Math.round((totals.completed / totals.requests) * 100) + "%"
                    : "—",
                ],
                ["Spend", usd(totals.spend)],
                ["Signups", totals.signups.toLocaleString()],
                ["USDC deposited", usd(totals.depositUsd)],
              ].map(([label, value]) => (
                <div className="panel stat" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {data.truncated && (
              <p className="caption">
                Totals cover the 2,000 most recent records of each type in this range.
              </p>
            )}
          </>
        )}
      </section>
      {data && totals && (
        <>
          <Series
            title="Requests per day"
            points={data.days.map((day) => ({ day: day.day, value: day.requests }))}
          />
          <Series
            title="Spend per day"
            points={data.days.map((day) => ({ day: day.day, value: day.spend }))}
            format={usd}
          />
          <Series
            title="Signups per day"
            points={data.days.map((day) => ({ day: day.day, value: day.signups }))}
          />
          <Series
            title="Deposits per day"
            points={data.days.map((day) => ({ day: day.day, value: day.deposits }))}
          />
          <section className="panel breakdown">
            <h2 id="analytics-top-customers">Top customers by spend</h2>
            {data.topCustomers.length ? (
              <div
                className="table-wrap workspace-data-table"
                role="region"
                aria-labelledby="analytics-top-customers"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th className="num">Spend</th>
                      <th className="num">Requests</th>
                      <th>Wallet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((row) => (
                      <tr key={row.id}>
                        <th scope="row">
                          <span className="crm-identity" title={row.wallet}>
                            <strong>
                              {row.name || (row.username ? "@" + row.username : shorten(row.wallet))}
                            </strong>
                            <span className="caption">
                              {row.name && row.username ? "@" + row.username + " · " : ""}
                              {shorten(row.wallet)}
                            </span>
                          </span>
                        </th>
                        <td className="num">{usd(row.spend)}</td>
                        <td className="num">{row.requests.toLocaleString()}</td>
                        <td>
                          <CopyButton value={row.wallet} label="Copy customer wallet" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No customer spend"
                hint="Customers with completed, costed requests in this range will appear here."
              />
            )}
          </section>
          <section className="panel breakdown">
            <h2 id="analytics-top-models">Top models by spend</h2>
            {data.topModels.length ? (
              <div
                className="table-wrap workspace-data-table"
                role="region"
                aria-labelledby="analytics-top-models"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Spend</th>
                      <th className="num">Requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topModels.map((row) => (
                      <tr key={row.model}>
                        <th scope="row">{modelName(row.model)}</th>
                        <td className="num">{usd(row.spend)}</td>
                        <td className="num">{row.requests.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No model spend"
                hint="Completed requests with recorded provider cost will appear here."
              />
            )}
          </section>
          <section className="panel breakdown">
            <h2 id="analytics-provider-split">Provider split</h2>
            {data.providerSplit.length ? (
              <div
                className="table-wrap workspace-data-table"
                role="region"
                aria-labelledby="analytics-provider-split"
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th className="num">Requests</th>
                      <th className="num">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providerSplit.map((row) => (
                      <tr key={row.provider}>
                        <th scope="row">{providerNames[row.provider] ?? row.provider}</th>
                        <td className="num">{row.requests.toLocaleString()}</td>
                        <td className="num">
                          {providerTotal
                            ? Math.round((row.requests / providerTotal) * 100) + "%"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No requests"
                hint="Provider traffic will appear here once requests complete in this range."
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
