import { partition, uniqBy } from "es-toolkit/compat";
import { UserRole } from "@shared/types";
import InviteEmail from "@server/emails/templates/InviteEmail";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { User, Team } from "@server/models";
import { UserFlag } from "@server/models/User";
import type { APIContext } from "@server/types";
import { DomainNotAllowedError } from "@server/errors";
import { authorize, can } from "@server/policies";
import { hashPassword } from "@server/utils/localPassword";

export type Invite = {
  name: string;
  email: string;
  role: UserRole;
  password?: string;
};

type Props = {
  invites: Invite[];
  suppressEmail?: boolean;
};

export default async function userInviter(
  ctx: APIContext,
  { invites, suppressEmail = !env.EMAIL_ENABLED }: Props
): Promise<{
  sent: Invite[];
  unsent: Invite[];
  users: User[];
}> {
  const { user } = ctx.state.auth;
  const team = await Team.findByPk(user.teamId, { rejectOnEmpty: true });

  if (invites.some((invite) => invite.role === UserRole.Guest)) {
    authorize(user, "addGuest", team);
  }

  // filter out empties and obvious non-emails
  const compactedInvites = invites.filter(
    (invite) => !!invite.email.trim() && invite.email.match("@")
  );
  // normalize to lowercase and remove duplicates
  const normalizedInvites = uniqBy(
    compactedInvites.map((invite) => ({
      ...invite,
      email: invite.email.toLowerCase(),
    })),
    "email"
  );
  // filter out any existing users in the system
  const emails = normalizedInvites.map((invite) => invite.email);

  if (!can(user, "update", team)) {
    for (const email of emails) {
      if (!(await team.isDomainAllowed(email))) {
        throw DomainNotAllowedError();
      }
    }
  }

  const existingUsers = await User.findAll({
    where: {
      teamId: user.teamId,
      email: emails,
    },
  });
  const existingEmails = existingUsers.map(
    (existingUser) => existingUser.email
  );
  const [existingInvites, filteredInvites] = partition(
    normalizedInvites,
    (invite) => existingEmails.includes(invite.email)
  );
  const users = [];

  if (existingInvites.some((invite) => invite.password)) {
    authorize(user, "update", team);
    for (const invite of existingInvites) {
      const existingUser = existingUsers.find(
        (candidate) => candidate.email === invite.email
      );
      if (existingUser && invite.password) {
        existingUser.passwordHash = await hashPassword(invite.password);
        await existingUser.save();
        users.push(existingUser);
      }
    }
  }

  // send and record remaining invites
  for (const invite of filteredInvites) {
    const newUser = await User.createWithCtx(
      ctx,
      {
        teamId: user.teamId,
        name: invite.name,
        email: invite.email,
        passwordHash: invite.password ? await hashPassword(invite.password) : undefined,
        role:
          invite.role === UserRole.Guest
            ? UserRole.Guest
            : user.isAdmin && invite.role === UserRole.Admin
              ? UserRole.Admin
              : user.isViewer || invite.role === UserRole.Viewer
                ? UserRole.Viewer
                : UserRole.Member,
        invitedById: user.id,
        flags: suppressEmail
          ? undefined
          : {
              [UserFlag.InviteSent]: 1,
            },
      },
      {
        name: "invite",
      }
    );
    users.push(newUser);

    if (!suppressEmail && env.EMAIL_ENABLED) {
      await new InviteEmail({
        to: invite.email,
        language: newUser.language,
        name: invite.name,
        actorName: user.name,
        actorEmail: user.email,
        teamName: team.name,
        teamUrl: team.url,
      }).schedule();
    }

    if (env.isDevelopment) {
      Logger.info(
        "email",
        `Sign in immediately: ${
          env.URL
        }/auth/email.callback?token=${newUser.getEmailSigninToken(ctx)}`
      );
    }
  }

  return {
    sent: filteredInvites,
    unsent: existingInvites,
    users,
  };
}
