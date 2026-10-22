/**
 * Builds a `mailto:` link. There is no backend: the contact form only composes
 * a message and hands it to the visitor's own email app.
 */
export function buildMailto({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body?: string;
}): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to}?${params.join("&")}`;
}

/** Plain-text email body for the contact form, with CRLF line breaks as mailto expects. */
export function composeContactBody({
  trainerFirstName,
  name,
  phone,
  message,
}: {
  trainerFirstName: string;
  name: string;
  phone?: string;
  message: string;
}): string {
  const lines = [`Hello ${trainerFirstName},`, "", message.trim(), "", `Kind regards,`, name.trim()];
  const phoneText = phone?.trim();
  if (phoneText) lines.push(`Phone: ${phoneText}`);
  return lines.join("\r\n");
}
