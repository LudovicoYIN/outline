import { observer } from "mobx-react";
import { PlusIcon } from "outline-icons";
import pluralize from "pluralize";
import * as React from "react";
import { useTranslation, Trans } from "react-i18next";
import { toast } from "sonner";
import styled from "styled-components";
import { errToString } from "@shared/utils/error";
import { UserRole } from "@shared/types";
import { UserValidation } from "@shared/validations";
import Button from "~/components/Button";
import Flex from "~/components/Flex";
import Input from "~/components/Input";
import type { Option } from "~/components/InputSelect";
import { InputSelect } from "~/components/InputSelect";
import { ResizingHeightContainer } from "~/components/ResizingHeightContainer";
import Text from "~/components/Text";
import Tooltip from "~/components/Tooltip";
import useCurrentUser from "~/hooks/useCurrentUser";
import useStores from "~/hooks/useStores";

type Props = {
  onSubmit: () => void;
};

type InviteRequest = {
  username: string;
  name: string;
  password: string;
};

function Invite({ onSubmit }: Props) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [invites, setInvites] = React.useState<InviteRequest[]>([
    {
      username: "",
      name: "",
      password: "",
    },
  ]);
  const { users, collections } = useStores();
  const user = useCurrentUser();
  const { t } = useTranslation();
  const [role, setRole] = React.useState<UserRole>(UserRole.Member);

  const handleSubmit = React.useCallback(
    async (ev: React.SyntheticEvent) => {
      ev.preventDefault();
      setIsSaving(true);

      try {
        const response = await users.invite(
          invites
            .filter((invite) => invite.username)
            .map((memo) => ({ ...memo, role }))
        );
        onSubmit();

        if (response.length > 0) {
          toast.success(
            t("{{ count }} accounts created or updated", {
              count: response.length,
            })
          );
        } else {
          toast.message(t("Those usernames already exist"));
        }
      } catch (err) {
        toast.error(errToString(err));
      } finally {
        setIsSaving(false);
      }
    },
    [onSubmit, invites, role, t, users]
  );

  const handleChange = React.useCallback(
    (
      ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      index: number
    ) => {
      setInvites((prevInvites) => {
        const newInvites = [...prevInvites];
        newInvites[index][ev.target.name as keyof InviteRequest] =
          ev.target.value;
        return newInvites;
      });
    },
    []
  );

  const handleAdd = React.useCallback(() => {
    if (invites.length >= UserValidation.maxInvitesPerRequest) {
      toast.message(
        t("Sorry, you can only send {{MAX_INVITES}} invites at a time", {
          MAX_INVITES: UserValidation.maxInvitesPerRequest,
        })
      );
    }

    setInvites((prevInvites) => {
      const newInvites = [...prevInvites];
      newInvites.push({
        username: "",
        name: "",
        password: "",
      });
      return newInvites;
    });
  }, [invites, t]);

  const handleKeyDown = React.useCallback(
    (ev: React.KeyboardEvent<HTMLInputElement>) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  const roleName = pluralize(role);
  const collectionCount = collections.nonPrivate.length;
  const collectionAccessNote = collectionCount ? (
    <span>
      <Trans>Invited {{ roleName }} will receive access to</Trans>{" "}
      <Tooltip
        content={
          <>
            {collections.nonPrivate.map((collection) => (
              <li key={collection.id}>{collection.name}</li>
            ))}
          </>
        }
      >
        <strong>
          <Trans>{{ collectionCount }} collections</Trans>
        </strong>
      </Tooltip>
      .{" "}
    </span>
  ) : undefined;

  const options = React.useMemo<Option[]>(() => {
    const memo: Option[] = [];

    if (user.isAdmin) {
      memo.push({
        type: "item",
        label: t("Admin"),
        description: t("Can manage all workspace settings"),
        value: UserRole.Admin,
      });
    }

    return [
      ...memo,
      {
        type: "item",
        label: t("Editor"),
        description: t("Can create, edit, and delete documents"),
        value: UserRole.Member,
      },
      {
        type: "item",
        label: t("Viewer"),
        description: t("Can view and comment"),
        value: UserRole.Viewer,
      },
    ];
  }, [t, user]);

  return (
    <form onSubmit={handleSubmit}>
      <Flex gap={8} column>
        <Text as="p" type="secondary">
          {t("Accounts use a username and password. No email is sent.")}
          {collectionAccessNote}
        </Text>
        <Flex gap={12} column>
          <InputSelect
            options={options}
            onChange={(r) => setRole(r as UserRole)}
            value={role}
            label={t("Invite as")}
          />

          <ResizingHeightContainer style={{ minHeight: 72, marginBottom: 8 }}>
            {invites.map((invite, index) => (
              <Flex key={index} gap={8} column>
                <Flex gap={8}>
                  <StyledInput
                    type="text"
                    name="username"
                    label={t("Username")}
                    labelHidden={index !== 0}
                    onKeyDown={handleKeyDown}
                    onChange={(ev) => handleChange(ev, index)}
                    placeholder={t("Username")}
                    value={invite.username}
                    required={index === 0}
                    autoComplete="off"
                    autoFocus
                    data-1p-ignore
                    flex
                  />
                <StyledInput
                  type="text"
                  name="name"
                  label={t("Name")}
                  labelHidden={index !== 0}
                  onKeyDown={handleKeyDown}
                  onChange={(ev) => handleChange(ev, index)}
                  autoComplete="off"
                  data-1p-ignore
                  value={invite.name}
                  required={!!invite.username}
                  flex
                />
                </Flex>
                <StyledInput
                  type="password"
                  name="password"
                  label={t("Password (min 8 characters)")}
                  labelHidden={index !== 0}
                  placeholder={t("Password")}
                  onKeyDown={handleKeyDown}
                  onChange={(ev) => handleChange(ev, index)}
                  autoComplete="new-password"
                  data-1p-ignore
                  minLength={8}
                  value={invite.password}
                  required={!!invite.username}
                  flex
                />
              </Flex>
            ))}
          </ResizingHeightContainer>
        </Flex>

        <Flex justify="space-between">
          {invites.length <= UserValidation.maxInvitesPerRequest ? (
            <Button
              type="button"
              onClick={handleAdd}
              icon={<PlusIcon />}
              neutral
            >
              {t("Add another")}
            </Button>
          ) : null}
          <Button
            type="submit"
            disabled={isSaving}
            data-on="click"
            data-event-category="invite"
            data-event-action="sendInvites"
          >
            {isSaving ? `${t("Saving")}…` : t("Create Accounts")}
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

const StyledInput = styled(Input)`
  margin-bottom: -4px;
  min-width: 0;
  flex-shrink: 1;
`;

export default observer(Invite);
