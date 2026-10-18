import { partition, uniqBy } from "es-toolkit/compat";
import { UserRole } from "@shared/types";
import InviteEmail from "@server/emails/templates/InviteEmail";
import env from "@server/env";
import Logger from "@server/logging/Logger";
import { User, Team } from "@server/models";
import { UserFlag } from "@server/models/User";
import type { APIContext } from "@server/types";
import { DomainNotAllowedError, ValidationError } from "@server/errors";
import { authorize, can } from "@server/policies";
import { hashPassword } from "@server/utils/localPassword";

export type Invite = {
  name: string;
  username?: string;
  email?: string | null;
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

  const compactedInvites = invites.filter(
    (invite) => !!invite.username?.trim() || !!invite.email?.trim()
  );
  const normalizedInvites = uniqBy(
    compactedInvites.map((invite) => ({
      ...invite,
      username: (invite.username ?? invite.email?.split("@")[0] ?? "")
        .trim()
        .toLowerCase(),
      email: invite.email?.trim().toLowerCase() ?? null,
    })),
    "username"
  );
  const usernames = normalizedInvites.map((invite) => invite.username);

  if (!can(user, "update", team)) {
    for (const invite of normalizedInvites) {
      if (invite.email && !(await team.isDomainAllowed(invite.email))) {
        throw DomainNotAllowedError();
      }
    }
  }

  if (normalizedInvites.some((invite) => invite.password)) {
    authorize(user, "update", team);
  }

  const existingUsers = await User.findAll({
    where: {
      teamId: user.teamId,
      username: usernames,
    },
  });
  const existingUsernames = existingUsers.map((existingUser) => existingUser.username);
  const [existingInvites, filteredInvites] = partition(
    normalizedInvites,
    (invite) => existingUsernames.includes(invite.username)
  );
  if (
    !env.EMAIL_ENABLED &&
    filteredInvites.some((invite) => !invite.username || !invite.password)
  ) {
    throw ValidationError(
      "Create a username and password account before sharing with this person"
    );
  }
  const users = [];

  if (existingInvites.some((invite) => invite.password)) {
    authorize(user, "update", team);
    for (const invite of existingInvites) {
      const existingUser = existingUsers.find(
        (candidate) => candidate.username === invite.username
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
        username: invite.username,
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

    if (!suppressEmail && env.EMAIL_ENABLED && invite.email) {
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
