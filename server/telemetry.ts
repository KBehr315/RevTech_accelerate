// Sends traces, metrics and logs to Application Insights when
// APPLICATIONINSIGHTS_CONNECTION_STRING is set (Azure); does nothing otherwise.
//
// Loaded with --import before the app's own code, after the OpenTelemetry
// loader, because ES modules can only be instrumented if the hooks exist
// before they are first imported:
//
//   node --import @azure/monitor-opentelemetry/loader --import ./server/telemetry.ts server/index.ts
//
// Collected: incoming and outgoing HTTP (API requests, PostgREST, Key Vault,
// AI providers), Postgres queries, console warnings and errors, and one span
// per worker job (worker/queue.ts). Prompts and completions are never logged.

import { useAzureMonitor } from '@azure/monitor-opentelemetry'

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING },
    instrumentationOptions: {
      http: { enabled: true },
      azureSdk: { enabled: true },
      postgreSql: { enabled: true },
      console: { enabled: true },
    },
  })
}
