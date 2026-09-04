function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function layout(input: { title: string; preheader: string; bodyHtml: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8eef5;font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;color:#1a2740;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8eef5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #d5dee9;">
          <tr>
            <td style="background:#0f2748;padding:22px 28px;">
              <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3a0;font-weight:700;">GCS WorkHub</div>
              <div style="margin-top:6px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-.02em;">${escapeHtml(input.title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 24px;border-top:1px solid #e8eef5;font-size:12px;line-height:1.5;color:#6b7a90;">
              This message was sent by GCS WorkHub. If you were not expecting it, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:8px;padding:12px 20px;background:#1d6b4f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(label)}</a>`
}

export function inviteSetupEmail(input: {
  firstName: string
  inviterName: string
  companyName: string
  roleName: string
  departmentName?: string | null
  setupUrl: string
  expiresInDays: number
}) {
  const subject = `You're invited to ${input.companyName} on GCS WorkHub`
  const deptLine = input.departmentName ? ` in ${input.departmentName}` : ''
  const text = [
    `Hi ${input.firstName},`,
    '',
    `${input.inviterName} has added you to ${input.companyName} on GCS WorkHub as ${input.roleName}${deptLine}.`,
    '',
    `Set up your account here (link expires in ${input.expiresInDays} days):`,
    input.setupUrl,
    '',
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n')

  const html = layout({
    title: 'You are invited',
    preheader: `${input.inviterName} invited you to ${input.companyName} on WorkHub.`,
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(input.firstName)},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
        <strong>${escapeHtml(input.inviterName)}</strong> has added you to
        <strong>${escapeHtml(input.companyName)}</strong> on GCS WorkHub as
        <strong>${escapeHtml(input.roleName)}</strong>${input.departmentName ? ` in <strong>${escapeHtml(input.departmentName)}</strong>` : ''}.
      </p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">
        Choose a password to activate your account. This link expires in ${input.expiresInDays} days.
      </p>
      ${ctaButton(input.setupUrl, 'Set up your account')}
      <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7a90;word-break:break-all;">
        Or paste this link into your browser:<br />${escapeHtml(input.setupUrl)}
      </p>
    `,
  })

  return { subject, html, text }
}

export function tempPasswordEmail(input: {
  firstName: string
  inviterName: string
  companyName: string
  loginUrl: string
  temporaryPassword: string
}) {
  const subject = `Your temporary GCS WorkHub password`
  const text = [
    `Hi ${input.firstName},`,
    '',
    `${input.inviterName} created your ${input.companyName} WorkHub account.`,
    '',
    `Sign in at: ${input.loginUrl}`,
    `Temporary password: ${input.temporaryPassword}`,
    '',
    'You will be asked to choose a new password on first sign-in.',
    'Do not share this password. Change it as soon as you can.',
  ].join('\n')

  const html = layout({
    title: 'Your temporary password',
    preheader: `${input.inviterName} created your WorkHub account.`,
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(input.firstName)},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">
        <strong>${escapeHtml(input.inviterName)}</strong> created your account on
        <strong>${escapeHtml(input.companyName)}</strong> WorkHub.
      </p>
      <div style="margin:0 0 18px;padding:14px 16px;border-radius:10px;background:#f3f7fb;border:1px solid #d5dee9;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b7a90;">Temporary password</div>
        <div style="margin-top:6px;font-family:Consolas,Monaco,monospace;font-size:18px;font-weight:700;letter-spacing:.04em;color:#0f2748;">${escapeHtml(input.temporaryPassword)}</div>
      </div>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">
        Sign in, then choose a new password. You will be required to change this temporary password before using WorkHub.
      </p>
      ${ctaButton(input.loginUrl, 'Sign in to WorkHub')}
    `,
  })

  return { subject, html, text }
}

export function passwordResetEmail(input: {
  firstName: string
  resetUrl: string
  expiresInHours: number
}) {
  const subject = 'Reset your GCS WorkHub password'
  const text = [
    `Hi ${input.firstName},`,
    '',
    `Reset your WorkHub password using this link (expires in ${input.expiresInHours} hours):`,
    input.resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')

  const html = layout({
    title: 'Reset your password',
    preheader: 'Use this link to choose a new WorkHub password.',
    bodyHtml: `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(input.firstName)},</p>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.55;">
        We received a request to reset your GCS WorkHub password. This link expires in ${input.expiresInHours} hours.
      </p>
      ${ctaButton(input.resetUrl, 'Choose a new password')}
      <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7a90;word-break:break-all;">
        Or paste this link into your browser:<br />${escapeHtml(input.resetUrl)}
      </p>
    `,
  })

  return { subject, html, text }
}
