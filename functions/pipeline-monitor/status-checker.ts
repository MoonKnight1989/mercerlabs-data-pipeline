import { google } from 'googleapis';
import { Logging } from '@google-cloud/logging';

const PROJECT_ID = 'mercer-labs-488707';
const REGION = 'us-east1';

export interface JobResult {
  name: string;
  type: 'function' | 'transform';
  status: 'OK' | 'FAILED' | 'NO_RUN';
  detail: string;
  error?: string;
}

// Cloud Functions to check (most recent execution via Cloud Logging)
const CLOUD_FUNCTIONS = [
  { name: 'vivenuIngest', display: 'Vivenu Daily Catchup' },
  { name: 'ga4Ingest', display: 'GA4 Daily Ingest' },
];

// BQ Data Transfer configs to check
const BQ_TRANSFERS = [
  {
    configId: '69ad0891-0000-2471-8547-30fd38104c04',
    display: 'Transform 1: Tickets',
  },
  {
    configId: '69ad880e-0000-2c29-87ef-24058875ba70',
    display: 'Transform 2: Daily Revenue',
  },
  {
    configId: '69ac201a-0000-25a3-a46b-14c14ef3a5f8',
    display: 'Transform 3: Daily Capacity',
  },
  {
    configId: '69b79f74-0000-2be1-89d6-3c286d3bb34a',
    display: 'Transform 4: Campaign Attribution',
  },
];

/**
 * Check Cloud Functions by looking at their most recent log entries.
 * We look for the function's completion log line from today.
 */
export async function checkCloudFunctions(): Promise<JobResult[]> {
  const logging = new Logging({ projectId: PROJECT_ID });
  const results: JobResult[] = [];

  // Look back 2 hours from now to catch the morning run window
  const sinceTime = new Date();
  sinceTime.setHours(sinceTime.getHours() - 3);
  const sinceStr = sinceTime.toISOString();

  for (const fn of CLOUD_FUNCTIONS) {
    try {
      // Check for any error-level logs from this function today
      const [errorEntries] = await logging.getEntries({
        filter:
          `resource.type="cloud_run_revision" ` +
          `resource.labels.service_name="${fn.name.toLowerCase()}" ` +
          `severity>=ERROR ` +
          `timestamp>="${sinceStr}"`,
        pageSize: 1,
        orderBy: 'timestamp desc',
      });

      // Check for the completion log line
      const [completionEntries] = await logging.getEntries({
        filter:
          `resource.type="cloud_run_revision" ` +
          `resource.labels.service_name="${fn.name.toLowerCase()}" ` +
          `textPayload:"Complete:" OR textPayload:"Complete:" ` +
          `timestamp>="${sinceStr}"`,
        pageSize: 1,
        orderBy: 'timestamp desc',
      });

      if (errorEntries.length > 0) {
        const errorMsg =
          (errorEntries[0]?.data as Record<string, unknown>)?.['message'] ??
          (errorEntries[0]?.data as string) ??
          'Unknown error';
        results.push({
          name: fn.display,
          type: 'function',
          status: 'FAILED',
          detail: 'Error in recent execution',
          error: String(errorMsg).slice(0, 200),
        });
      } else if (completionEntries.length > 0) {
        const logMsg =
          (completionEntries[0]?.data as string) ?? 'Completed';
        results.push({
          name: fn.display,
          type: 'function',
          status: 'OK',
          detail: String(logMsg).slice(0, 200),
        });
      } else {
        results.push({
          name: fn.display,
          type: 'function',
          status: 'NO_RUN',
          detail: 'No execution found in last 3 hours',
        });
      }
    } catch (err) {
      results.push({
        name: fn.display,
        type: 'function',
        status: 'FAILED',
        detail: 'Could not check status',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

/**
 * Check BQ Data Transfer scheduled queries by fetching their most recent run.
 */
export async function checkBQTransfers(): Promise<JobResult[]> {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/bigquery'],
  });
  const authClient = await auth.getClient();

  const results: JobResult[] = [];

  for (const transfer of BQ_TRANSFERS) {
    try {
      const configPath = `projects/${PROJECT_ID}/locations/${REGION}/transferConfigs/${transfer.configId}`;

      const url = `https://bigquerydatatransfer.googleapis.com/v1/${configPath}/runs?pageSize=1`;
      const response = await (authClient as { request: (opts: { url: string }) => Promise<{ data: Record<string, unknown> }> }).request({ url });

      const data = response.data as {
        transferRuns?: Array<{
          state?: string;
          errorStatus?: { message?: string };
          runTime?: string;
        }>;
      };
      const runs = data.transferRuns ?? [];
      if (runs.length === 0) {
        results.push({
          name: transfer.display,
          type: 'transform',
          status: 'NO_RUN',
          detail: 'No runs found',
        });
        continue;
      }

      const latestRun = runs[0]!;
      const state = latestRun.state ?? 'UNKNOWN';
      const runTime = latestRun.runTime ?? '';

      if (state === 'SUCCEEDED') {
        results.push({
          name: transfer.display,
          type: 'transform',
          status: 'OK',
          detail: `Succeeded at ${runTime}`,
        });
      } else if (state === 'FAILED') {
        results.push({
          name: transfer.display,
          type: 'transform',
          status: 'FAILED',
          detail: `Failed at ${runTime}`,
          error: latestRun.errorStatus?.message?.slice(0, 200),
        });
      } else {
        results.push({
          name: transfer.display,
          type: 'transform',
          status: 'OK',
          detail: `State: ${state} at ${runTime}`,
        });
      }
    } catch (err) {
      results.push({
        name: transfer.display,
        type: 'transform',
        status: 'FAILED',
        detail: 'Could not check status',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
