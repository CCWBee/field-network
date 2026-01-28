/**
 * Alerting Service
 *
 * Provides centralized alerting for critical events including:
 * - Failed escrow transactions
 * - Low operator wallet balance
 * - Contract events (pause, role changes)
 * - API errors
 *
 * Supports multiple alert channels:
 * - Webhook (Slack, Discord, PagerDuty)
 * - Email (SMTP)
 * - Console (development)
 */

import { getCurrentChainConfig, getExplorerTxUrl, getExplorerAddressUrl } from '../config/tokens';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertPayload {
  severity: AlertSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AlertChannel {
  name: string;
  send(alert: AlertPayload): Promise<void>;
}

/**
 * Console Alert Channel (development/fallback)
 */
class ConsoleAlertChannel implements AlertChannel {
  name = 'console';

  async send(alert: AlertPayload): Promise<void> {
    const prefix = {
      info: '[INFO]',
      warning: '[WARN]',
      error: '[ERROR]',
      critical: '[CRITICAL]',
    }[alert.severity];

    console.log(`\n${prefix} ${alert.title}`);
    console.log(`  ${alert.message}`);
    if (alert.details) {
      console.log('  Details:', JSON.stringify(alert.details, null, 2));
    }
  }
}

/**
 * Webhook Alert Channel (Slack, Discord, PagerDuty, etc.)
 */
class WebhookAlertChannel implements AlertChannel {
  name = 'webhook';
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(alert: AlertPayload): Promise<void> {
    const emoji = {
      info: ':information_source:',
      warning: ':warning:',
      error: ':x:',
      critical: ':rotating_light:',
    }[alert.severity];

    const color = {
      info: '#36a64f',
      warning: '#ffcc00',
      error: '#ff0000',
      critical: '#8b0000',
    }[alert.severity];

    // Slack-compatible webhook payload
    const payload = {
      text: `${emoji} *${alert.title}*`,
      attachments: [
        {
          color,
          text: alert.message,
          fields: alert.details
            ? Object.entries(alert.details).map(([key, value]) => ({
                title: key,
                value: String(value),
                short: String(value).length < 40,
              }))
            : [],
          footer: 'Field Network Alerts',
          ts: Math.floor((alert.timestamp || new Date()).getTime() / 1000),
        },
      ],
    };

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`Webhook alert failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Webhook alert error:', error);
    }
  }
}

/**
 * Email Alert Channel (SMTP)
 */
class EmailAlertChannel implements AlertChannel {
  name = 'email';
  private config: {
    host: string;
    port: number;
    user: string;
    pass: string;
    to: string;
  };

  constructor() {
    this.config = {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      to: process.env.ALERT_EMAIL_TO || '',
    };
  }

  async send(alert: AlertPayload): Promise<void> {
    if (!this.config.host || !this.config.to) {
      console.log('Email alerts not configured, skipping');
      return;
    }

    // Note: In production, use a proper email library like nodemailer
    // This is a placeholder that logs the email that would be sent
    console.log(`[EMAIL ALERT] Would send to ${this.config.to}:`);
    console.log(`  Subject: [${alert.severity.toUpperCase()}] ${alert.title}`);
    console.log(`  Body: ${alert.message}`);
  }
}

/**
 * Alert Service
 */
class AlertService {
  private channels: AlertChannel[] = [];
  private minSeverity: AlertSeverity = 'warning';

  constructor() {
    // Always add console channel
    this.channels.push(new ConsoleAlertChannel());

    // Add webhook channel if configured
    const webhookUrl = process.env.ALERT_WEBHOOK_URL;
    if (webhookUrl) {
      this.channels.push(new WebhookAlertChannel(webhookUrl));
    }

    // Add email channel if configured
    if (process.env.SMTP_HOST) {
      this.channels.push(new EmailAlertChannel());
    }

    // Set minimum severity from env
    const minSev = process.env.ALERT_MIN_SEVERITY as AlertSeverity;
    if (minSev && ['info', 'warning', 'error', 'critical'].includes(minSev)) {
      this.minSeverity = minSev;
    }
  }

  private shouldSend(severity: AlertSeverity): boolean {
    const levels = { info: 0, warning: 1, error: 2, critical: 3 };
    return levels[severity] >= levels[this.minSeverity];
  }

  async send(alert: AlertPayload): Promise<void> {
    if (!this.shouldSend(alert.severity)) {
      return;
    }

    alert.timestamp = alert.timestamp || new Date();

    const sendPromises = this.channels.map((channel) =>
      channel.send(alert).catch((error) => {
        console.error(`Alert channel ${channel.name} failed:`, error);
      })
    );

    await Promise.all(sendPromises);
  }

  // Convenience methods
  async info(title: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'info', title, message, details });
  }

  async warning(title: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'warning', title, message, details });
  }

  async error(title: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'error', title, message, details });
  }

  async critical(title: string, message: string, details?: Record<string, unknown>): Promise<void> {
    await this.send({ severity: 'critical', title, message, details });
  }
}

// Export singleton
export const alertService = new AlertService();

// =============================================================================
// Pre-built alert helpers for common scenarios
// =============================================================================

/**
 * Alert for failed escrow transaction
 */
export async function alertEscrowTransactionFailed(
  operation: 'deposit' | 'release' | 'refund' | 'accept' | 'assignWorker',
  taskId: string,
  error: string,
  txHash?: string
): Promise<void> {
  const chainConfig = getCurrentChainConfig();

  await alertService.error(
    `Escrow ${operation} failed`,
    `Failed to ${operation} escrow for task ${taskId}`,
    {
      'Task ID': taskId,
      Operation: operation,
      Error: error,
      'Transaction': txHash ? getExplorerTxUrl(txHash) : 'N/A',
      Network: chainConfig.name,
      Timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Alert for low operator wallet balance
 */
export async function alertLowOperatorBalance(
  address: string,
  balance: string,
  threshold: string
): Promise<void> {
  const chainConfig = getCurrentChainConfig();

  await alertService.warning(
    'Low operator wallet balance',
    `Operator wallet balance (${balance} ETH) is below threshold (${threshold} ETH). Fund the wallet to continue processing escrow operations.`,
    {
      Address: getExplorerAddressUrl(address),
      'Current Balance': `${balance} ETH`,
      Threshold: `${threshold} ETH`,
      Network: chainConfig.name,
      Action: 'Fund wallet with ETH for gas',
    }
  );
}

/**
 * Alert for contract pause
 */
export async function alertContractPaused(
  contractAddress: string,
  pausedBy: string,
  txHash: string
): Promise<void> {
  const chainConfig = getCurrentChainConfig();

  await alertService.critical(
    'Escrow contract PAUSED',
    'The escrow contract has been paused. No deposits, releases, or refunds can be processed until unpaused.',
    {
      Contract: getExplorerAddressUrl(contractAddress),
      'Paused By': pausedBy,
      Transaction: getExplorerTxUrl(txHash),
      Network: chainConfig.name,
      Action: 'Investigate and unpause when ready',
    }
  );
}

/**
 * Alert for contract unpause
 */
export async function alertContractUnpaused(
  contractAddress: string,
  unpausedBy: string,
  txHash: string
): Promise<void> {
  const chainConfig = getCurrentChainConfig();

  await alertService.info(
    'Escrow contract unpaused',
    'The escrow contract has been unpaused. Normal operations have resumed.',
    {
      Contract: getExplorerAddressUrl(contractAddress),
      'Unpaused By': unpausedBy,
      Transaction: getExplorerTxUrl(txHash),
      Network: chainConfig.name,
    }
  );
}

/**
 * Alert for role changes on contract
 */
export async function alertRoleChanged(
  role: string,
  granted: boolean,
  account: string,
  txHash: string
): Promise<void> {
  const chainConfig = getCurrentChainConfig();
  const action = granted ? 'granted to' : 'revoked from';

  await alertService.warning(
    `Contract role ${granted ? 'granted' : 'revoked'}`,
    `${role} was ${action} ${account}`,
    {
      Role: role,
      Action: granted ? 'Granted' : 'Revoked',
      Account: getExplorerAddressUrl(account),
      Transaction: getExplorerTxUrl(txHash),
      Network: chainConfig.name,
    }
  );
}

/**
 * Alert for dispute opened
 */
export async function alertDisputeOpened(
  disputeId: string,
  taskId: string,
  escrowAmount: string
): Promise<void> {
  await alertService.info(
    'New dispute opened',
    `A dispute has been opened for task ${taskId}. Review required.`,
    {
      'Dispute ID': disputeId,
      'Task ID': taskId,
      'Escrow Amount': `${escrowAmount} USDC`,
      Action: 'Review and resolve in admin dashboard',
    }
  );
}

/**
 * Alert for high error rate
 */
export async function alertHighErrorRate(
  errorCount: number,
  timeWindowMinutes: number,
  threshold: number
): Promise<void> {
  await alertService.error(
    'High API error rate detected',
    `${errorCount} errors in the last ${timeWindowMinutes} minutes (threshold: ${threshold})`,
    {
      'Error Count': errorCount,
      'Time Window': `${timeWindowMinutes} minutes`,
      Threshold: threshold,
      Action: 'Check API logs and error handler',
    }
  );
}

/**
 * Alert for deployment completion
 */
export async function alertDeploymentComplete(
  environment: string,
  version: string,
  contractAddress?: string
): Promise<void> {
  await alertService.info(
    'Deployment complete',
    `Successfully deployed to ${environment}`,
    {
      Environment: environment,
      Version: version,
      Contract: contractAddress || 'N/A',
      Timestamp: new Date().toISOString(),
    }
  );
}
