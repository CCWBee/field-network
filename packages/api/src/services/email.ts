import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import * as sgMail from '@sendgrid/mail';

/**
 * Email Service
 *
 * Provides email sending capabilities with multiple providers:
 * - SendGrid (production recommended)
 * - SMTP (generic, works with most email providers)
 * - Console (development, just logs emails)
 *
 * Configure via EMAIL_PROVIDER environment variable.
 */

// Email provider interface
export interface EmailProvider {
  send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendTemplate(options: SendTemplateOptions): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface SendTemplateOptions {
  to: string | string[];
  template: EmailTemplate;
  data: Record<string, any>;
}

// Supported email templates
export type EmailTemplate =
  | 'welcome'
  | 'password-reset'
  | 'task-claimed'
  | 'submission-received'
  | 'submission-accepted'
  | 'submission-rejected'
  | 'dispute-opened'
  | 'dispute-resolved';

// ============================================================================
// EMAIL TEMPLATES
// ============================================================================

interface TemplateContent {
  subject: string;
  text: (data: Record<string, any>) => string;
  html: (data: Record<string, any>) => string;
}

const EMAIL_TEMPLATES: Record<EmailTemplate, TemplateContent> = {
  welcome: {
    subject: 'Welcome to Field Network!',
    text: (data) =>
      `Welcome to Field Network, ${data.username || 'there'}!\n\n` +
      `You've successfully created your account. You can now:\n\n` +
      `- Post tasks and request real-world observations\n` +
      `- Claim tasks and earn bounties by completing observations\n` +
      `- Build your reputation and unlock lower fees\n\n` +
      `Get started at: ${data.dashboardUrl || 'https://field-network.com/dashboard'}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">Welcome to Field Network!</h1>
        <p>Hi ${data.username || 'there'},</p>
        <p>You've successfully created your account. You can now:</p>
        <ul style="line-height: 1.8;">
          <li>Post tasks and request real-world observations</li>
          <li>Claim tasks and earn bounties by completing observations</li>
          <li>Build your reputation and unlock lower fees</li>
        </ul>
        <p style="margin-top: 24px;">
          <a href="${data.dashboardUrl || 'https://field-network.com/dashboard'}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Go to Dashboard
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'password-reset': {
    subject: 'Reset Your Password - Field Network',
    text: (data) =>
      `Hi ${data.username || 'there'},\n\n` +
      `We received a request to reset your password.\n\n` +
      `Click this link to reset your password: ${data.resetUrl}\n\n` +
      `This link will expire in ${data.expiresIn || '1 hour'}.\n\n` +
      `If you didn't request this, you can safely ignore this email.\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">Reset Your Password</h1>
        <p>Hi ${data.username || 'there'},</p>
        <p>We received a request to reset your password.</p>
        <p style="margin-top: 24px;">
          <a href="${data.resetUrl}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="margin-top: 16px; color: #666; font-size: 14px;">
          This link will expire in ${data.expiresIn || '1 hour'}.
        </p>
        <p style="margin-top: 24px; color: #666;">
          If you didn't request this, you can safely ignore this email.
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'task-claimed': {
    subject: 'Your Task Has Been Claimed - Field Network',
    text: (data) =>
      `Hi ${data.requesterName || 'there'},\n\n` +
      `Great news! Your task "${data.taskTitle}" has been claimed by ${data.workerName}.\n\n` +
      `They have ${data.ttlHours || 4} hours to complete and submit their work.\n\n` +
      `View task: ${data.taskUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">Task Claimed!</h1>
        <p>Hi ${data.requesterName || 'there'},</p>
        <p>Great news! Your task <strong>"${data.taskTitle}"</strong> has been claimed by <strong>${data.workerName}</strong>.</p>
        <p>They have ${data.ttlHours || 4} hours to complete and submit their work.</p>
        <p style="margin-top: 24px;">
          <a href="${data.taskUrl}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Task
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'submission-received': {
    subject: 'New Submission Received - Field Network',
    text: (data) =>
      `Hi ${data.requesterName || 'there'},\n\n` +
      `A new submission has been received for your task "${data.taskTitle}".\n\n` +
      `Worker: ${data.workerName}\n` +
      `Verification Score: ${data.verificationScore}%\n\n` +
      `Please review the submission and accept or reject it.\n\n` +
      `View submission: ${data.submissionUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">New Submission Received</h1>
        <p>Hi ${data.requesterName || 'there'},</p>
        <p>A new submission has been received for your task <strong>"${data.taskTitle}"</strong>.</p>
        <div style="background-color: #f0fdfa; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Worker:</strong> ${data.workerName}</p>
          <p style="margin: 8px 0 0 0;"><strong>Verification Score:</strong> ${data.verificationScore}%</p>
        </div>
        <p>Please review the submission and accept or reject it.</p>
        <p style="margin-top: 24px;">
          <a href="${data.submissionUrl}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Review Submission
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'submission-accepted': {
    subject: 'Submission Accepted - Payment Released! - Field Network',
    text: (data) =>
      `Hi ${data.workerName || 'there'},\n\n` +
      `Congratulations! Your submission for "${data.taskTitle}" has been accepted.\n\n` +
      `Payment: ${data.currency} ${data.bountyAmount}\n\n` +
      `The payment has been released to your wallet.\n\n` +
      `View details: ${data.submissionUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">Submission Accepted!</h1>
        <p>Hi ${data.workerName || 'there'},</p>
        <p>Congratulations! Your submission for <strong>"${data.taskTitle}"</strong> has been accepted.</p>
        <div style="background-color: #f0fdfa; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 24px; color: #14b8a6;"><strong>${data.currency} ${data.bountyAmount}</strong></p>
          <p style="margin: 8px 0 0 0; color: #666;">Payment released</p>
        </div>
        <p>The payment has been released to your wallet.</p>
        <p style="margin-top: 24px;">
          <a href="${data.submissionUrl}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Details
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'submission-rejected': {
    subject: 'Submission Rejected - Field Network',
    text: (data) =>
      `Hi ${data.workerName || 'there'},\n\n` +
      `Unfortunately, your submission for "${data.taskTitle}" has been rejected.\n\n` +
      `Reason: ${data.reasonCode}\n` +
      `${data.comment ? `Comment: ${data.comment}\n` : ''}` +
      `\nYou can dispute this decision within 48 hours if you believe it was made in error.\n\n` +
      `View submission: ${data.submissionUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #ef4444; margin-bottom: 24px;">Submission Rejected</h1>
        <p>Hi ${data.workerName || 'there'},</p>
        <p>Unfortunately, your submission for <strong>"${data.taskTitle}"</strong> has been rejected.</p>
        <div style="background-color: #fef2f2; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Reason:</strong> ${data.reasonCode}</p>
          ${data.comment ? `<p style="margin: 8px 0 0 0;"><strong>Comment:</strong> ${data.comment}</p>` : ''}
        </div>
        <p>You can dispute this decision within 48 hours if you believe it was made in error.</p>
        <p style="margin-top: 24px;">
          <a href="${data.submissionUrl}"
             style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Submission
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'dispute-opened': {
    subject: 'Dispute Opened - Field Network',
    text: (data) =>
      `Hi ${data.recipientName || 'there'},\n\n` +
      `A dispute has been opened for task "${data.taskTitle}".\n\n` +
      `${data.isRequester
        ? 'A worker has disputed your rejection of their submission.'
        : 'Your dispute has been submitted for review.'
      }\n\n` +
      `Our team will review the case and make a decision.\n\n` +
      `View dispute: ${data.disputeUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #f59e0b; margin-bottom: 24px;">Dispute Opened</h1>
        <p>Hi ${data.recipientName || 'there'},</p>
        <p>A dispute has been opened for task <strong>"${data.taskTitle}"</strong>.</p>
        <p>${data.isRequester
          ? 'A worker has disputed your rejection of their submission.'
          : 'Your dispute has been submitted for review.'
        }</p>
        <p>Our team will review the case and make a decision.</p>
        <p style="margin-top: 24px;">
          <a href="${data.disputeUrl}"
             style="background-color: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Dispute
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },

  'dispute-resolved': {
    subject: 'Dispute Resolved - Field Network',
    text: (data) =>
      `Hi ${data.recipientName || 'there'},\n\n` +
      `The dispute for task "${data.taskTitle}" has been resolved.\n\n` +
      `Resolution: ${data.resolutionMessage}\n\n` +
      `View details: ${data.disputeUrl}\n\n` +
      `Best regards,\nThe Field Network Team`,
    html: (data) => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #14b8a6; margin-bottom: 24px;">Dispute Resolved</h1>
        <p>Hi ${data.recipientName || 'there'},</p>
        <p>The dispute for task <strong>"${data.taskTitle}"</strong> has been resolved.</p>
        <div style="background-color: #f0fdfa; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Resolution:</strong> ${data.resolutionMessage}</p>
        </div>
        <p style="margin-top: 24px;">
          <a href="${data.disputeUrl}"
             style="background-color: #14b8a6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            View Details
          </a>
        </p>
        <p style="margin-top: 24px; color: #666;">
          Best regards,<br>The Field Network Team
        </p>
      </div>
    `,
  },
};

// ============================================================================
// SENDGRID PROVIDER
// ============================================================================

class SendGridProvider implements EmailProvider {
  private fromEmail: string;
  private fromName: string;

  constructor() {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      throw new Error('SENDGRID_API_KEY environment variable is required for SendGrid provider');
    }
    sgMail.setApiKey(apiKey);
    this.fromEmail = process.env.EMAIL_FROM || 'noreply@field-network.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Field Network';
  }

  async send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const [response] = await sgMail.send({
        to: options.to,
        from: {
          email: this.fromEmail,
          name: this.fromName,
        },
        subject: options.subject,
        text: options.text || '',
        html: options.html,
      });

      return {
        success: true,
        messageId: response.headers['x-message-id'] as string,
      };
    } catch (error) {
      console.error('SendGrid email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SendGrid error',
      };
    }
  }

  async sendTemplate(options: SendTemplateOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const template = EMAIL_TEMPLATES[options.template];
    if (!template) {
      return { success: false, error: `Unknown template: ${options.template}` };
    }

    return this.send({
      to: options.to,
      subject: template.subject,
      text: template.text(options.data),
      html: template.html(options.data),
    });
  }
}

// ============================================================================
// SMTP PROVIDER
// ============================================================================

class SMTPProvider implements EmailProvider {
  private transporter: Transporter;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host) {
      throw new Error('SMTP_HOST environment variable is required for SMTP provider');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: user && pass ? { user, pass } : undefined,
    });

    this.fromEmail = process.env.EMAIL_FROM || 'noreply@field-network.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'Field Network';
  }

  async send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('SMTP email error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown SMTP error',
      };
    }
  }

  async sendTemplate(options: SendTemplateOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const template = EMAIL_TEMPLATES[options.template];
    if (!template) {
      return { success: false, error: `Unknown template: ${options.template}` };
    }

    return this.send({
      to: options.to,
      subject: template.subject,
      text: template.text(options.data),
      html: template.html(options.data),
    });
  }
}

// ============================================================================
// CONSOLE PROVIDER (Development)
// ============================================================================

class ConsoleProvider implements EmailProvider {
  async send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log('========== EMAIL (Console Provider) ==========');
    console.log(`To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log('---');
    console.log(options.text || options.html);
    console.log('==============================================');

    return {
      success: true,
      messageId: `console-${Date.now()}`,
    };
  }

  async sendTemplate(options: SendTemplateOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const template = EMAIL_TEMPLATES[options.template];
    if (!template) {
      return { success: false, error: `Unknown template: ${options.template}` };
    }

    console.log('========== EMAIL (Console Provider) ==========');
    console.log(`Template: ${options.template}`);
    console.log(`To: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    console.log(`Subject: ${template.subject}`);
    console.log('Data:', JSON.stringify(options.data, null, 2));
    console.log('---');
    console.log(template.text(options.data));
    console.log('==============================================');

    return {
      success: true,
      messageId: `console-${Date.now()}`,
    };
  }
}

// ============================================================================
// PROVIDER FACTORY
// ============================================================================

let emailProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (emailProvider) {
    return emailProvider;
  }

  const providerType = process.env.EMAIL_PROVIDER || 'console';

  switch (providerType.toLowerCase()) {
    case 'sendgrid':
      emailProvider = new SendGridProvider();
      console.log('Email provider: SendGrid');
      break;
    case 'smtp':
      emailProvider = new SMTPProvider();
      console.log('Email provider: SMTP');
      break;
    case 'console':
    default:
      emailProvider = new ConsoleProvider();
      console.log('Email provider: Console (emails will be logged, not sent)');
      break;
  }

  return emailProvider;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Send a plain email
 */
export async function sendEmail(options: SendEmailOptions) {
  return getEmailProvider().send(options);
}

/**
 * Send a templated email
 */
export async function sendTemplateEmail(options: SendTemplateOptions) {
  return getEmailProvider().sendTemplate(options);
}

/**
 * Send a welcome email to a new user
 */
export async function sendWelcomeEmail(email: string, data: { username?: string; dashboardUrl?: string }) {
  return sendTemplateEmail({
    to: email,
    template: 'welcome',
    data,
  });
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  data: { username?: string; resetUrl: string; expiresIn?: string }
) {
  return sendTemplateEmail({
    to: email,
    template: 'password-reset',
    data,
  });
}

/**
 * Send task claimed notification email
 */
export async function sendTaskClaimedEmail(
  email: string,
  data: {
    requesterName?: string;
    taskTitle: string;
    workerName: string;
    taskUrl: string;
    ttlHours?: number;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'task-claimed',
    data,
  });
}

/**
 * Send submission received notification email
 */
export async function sendSubmissionReceivedEmail(
  email: string,
  data: {
    requesterName?: string;
    taskTitle: string;
    workerName: string;
    verificationScore: number;
    submissionUrl: string;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'submission-received',
    data,
  });
}

/**
 * Send submission accepted notification email
 */
export async function sendSubmissionAcceptedEmail(
  email: string,
  data: {
    workerName?: string;
    taskTitle: string;
    bountyAmount: number;
    currency: string;
    submissionUrl: string;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'submission-accepted',
    data,
  });
}

/**
 * Send submission rejected notification email
 */
export async function sendSubmissionRejectedEmail(
  email: string,
  data: {
    workerName?: string;
    taskTitle: string;
    reasonCode: string;
    comment?: string;
    submissionUrl: string;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'submission-rejected',
    data,
  });
}

/**
 * Send dispute opened notification email
 */
export async function sendDisputeOpenedEmail(
  email: string,
  data: {
    recipientName?: string;
    taskTitle: string;
    isRequester: boolean;
    disputeUrl: string;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'dispute-opened',
    data,
  });
}

/**
 * Send dispute resolved notification email
 */
export async function sendDisputeResolvedEmail(
  email: string,
  data: {
    recipientName?: string;
    taskTitle: string;
    resolutionMessage: string;
    disputeUrl: string;
  }
) {
  return sendTemplateEmail({
    to: email,
    template: 'dispute-resolved',
    data,
  });
}
