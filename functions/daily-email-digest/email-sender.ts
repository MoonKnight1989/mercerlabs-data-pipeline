import sgMail from '@sendgrid/mail';

interface EmailOptions {
  sendgridApiKey: string;
  to: string[];
  reportDate: string;
  dayOfWeek: string;
  narrative: string;
  dashboardUrl?: string;
}

export async function sendDigestEmail(options: EmailOptions): Promise<void> {
  const { sendgridApiKey, to, reportDate, dayOfWeek, narrative, dashboardUrl } = options;

  sgMail.setApiKey(sendgridApiKey);

  const dashboardLink = dashboardUrl
    ? `<a href="${dashboardUrl}">Open full dashboard</a><br>`
    : '';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="margin-bottom: 4px;">Mercer Labs Daily Briefing</h2>
      <p style="color: #666; margin-top: 0;">${reportDate} — ${dayOfWeek}</p>
      <hr style="border: 1px solid #eee;">
      <div style="line-height: 1.6;">
        ${narrative}
      </div>
      <hr style="border: 1px solid #eee;">
      <p style="color: #999; font-size: 12px;">
        ${dashboardLink}
        Auto-generated from Mercer Labs Analytics Pipeline. Data as of 06:30 ET.
      </p>
    </div>
  `;

  const msg = {
    to,
    from: {
      email: 'analytics@massivemarketing.co.uk',
      name: 'Mercer Labs Analytics',
    },
    subject: `Mercer Labs — ${dayOfWeek} ${reportDate}`,
    html,
  };

  console.log(`[email-sender] Sending digest to ${to.length} recipient(s)`);
  await sgMail.send(msg);
  console.log('[email-sender] Email sent successfully');
}
