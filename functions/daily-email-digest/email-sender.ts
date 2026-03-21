import { google } from 'googleapis';

interface SendEmailOptions {
  serviceAccountKeyJson: string;
  fromEmail: string;
  to: string[];
  subject: string;
  html: string;
}

/**
 * Send an email via Gmail API using domain-wide delegation.
 * The service account impersonates fromEmail (a real Workspace user)
 * to send through Gmail.
 */
export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const { serviceAccountKeyJson, fromEmail, to, subject, html } = options;
  const credentials = JSON.parse(serviceAccountKeyJson);

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    subject: fromEmail, // impersonate the sending address
  });

  const gmail = google.gmail({ version: 'v1', auth });

  // Build RFC 2822 MIME message
  const boundary = `boundary_${Date.now()}`;
  const mime = [
    `From: Mercer Labs Analytics <${fromEmail}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  ].join('\r\n');

  const raw = Buffer.from(mime).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  console.log(`[email-sender] Email sent to ${to.length} recipient(s) via Gmail API`);
}
