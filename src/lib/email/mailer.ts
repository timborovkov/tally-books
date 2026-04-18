import { Resend } from "resend";

import { env } from "@/lib/env";

import { renderInvite } from "./templates";

export interface SendResult {
  to: string;
  subject: string;
}

export interface Mailer {
  sendInvite(args: {
    to: string;
    inviteUrl: string;
    scopeSummary: string;
    invitedByName: string | null;
    invitedByEmail: string;
  }): Promise<SendResult>;
}

class ResendMailer implements Mailer {
  private readonly resend = new Resend(env.RESEND_API_KEY);

  async sendInvite(args: {
    to: string;
    inviteUrl: string;
    scopeSummary: string;
    invitedByName: string | null;
    invitedByEmail: string;
  }): Promise<SendResult> {
    const rendered = renderInvite(args);
    const result = await this.resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: args.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    if (result.error) {
      throw new Error(`Resend failed: ${result.error.message}`);
    }
    return { to: args.to, subject: rendered.subject };
  }
}

const resendMailer = new ResendMailer();

export function getMailer(): Mailer {
  return resendMailer;
}
