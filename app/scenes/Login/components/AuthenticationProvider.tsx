import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { Client } from "@shared/types";
import ButtonLarge from "~/components/ButtonLarge";
import InputLarge from "~/components/InputLarge";
import Text from "~/components/Text";
import PluginIcon from "~/components/PluginIcon";
import { client } from "~/utils/ApiClient";
import Desktop from "~/utils/Desktop";
import { getRedirectUrl } from "~/utils/urls";
import { PasskeyAuthenticationProvider } from "./PasskeyAuthenticationProvider";

type Props = React.ComponentProps<typeof ButtonLarge> & {
  id: string;
  name: string;
  authUrl: string;
  isCreate: boolean;
  onEmailSuccess: (email: string) => void;
  preferOTP: boolean;
};

type AuthState = "initial" | "email" | "code";

function AuthenticationProvider(props: Props) {
  const { t } = useTranslation();
  const [authState, setAuthState] = React.useState<AuthState>("email");
  const [isSubmitting, setSubmitting] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [hasAuthError, setHasAuthError] = React.useState(false);
  const { isCreate, id, name, authUrl, onEmailSuccess, preferOTP, ...rest } =
    props;
  const clientType = Desktop.isElectron() ? Client.Desktop : Client.Web;

  const handleChangeUsername = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
    setHasAuthError(false);
  };

  const handleSubmitEmail = async (
    event: React.SyntheticEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (authState === "email" && username) {
      setSubmitting(true);

      try {
        const response = await client.post(event.currentTarget.action, {
          username,
          password,
          client: clientType,
          preferOTP,
        });

        if (response.redirect) {
          window.location.href = response.redirect;
        } else {
          setSubmitting(false);
          onEmailSuccess?.(username);
        }
      } catch (_err) {
        setHasAuthError(true);
        setSubmitting(false);
      }
    } else {
      setAuthState("email");
    }
  };

  const href = getRedirectUrl(authUrl);

  if (id === "passkeys") {
    return <PasskeyAuthenticationProvider {...rest} />;
  }

  if (id === "email") {
    if (isCreate) {
      return null;
    }

    return (
      <Wrapper>
        <Form method="POST" action="/auth/email" onSubmit={handleSubmitEmail}>
          {authState === "email" ? (
            <>
              <InputLarge
                type="text"
                name="username"
                placeholder={t("Username")}
                value={username}
                onChange={handleChangeUsername}
                disabled={isSubmitting}
                autoFocus
                required
                short
              />
              <InputLarge
                type="password"
                name="password"
                placeholder={t("Password")}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setHasAuthError(false);
                }}
                disabled={isSubmitting}
                autoComplete="current-password"
                required
                short
              />
              {hasAuthError && <Text type="secondary">{t("Invalid username or password")}</Text>}
              <ButtonLarge type="submit" disabled={isSubmitting} {...rest}>
                {t("Sign In")} →
              </ButtonLarge>
            </>
          ) : (
            <ButtonLarge type="submit" fullwidth {...rest}>
              {t("Continue with username and password")}
            </ButtonLarge>
          )}
        </Form>
      </Wrapper>
    );
  }

  return (
    <ButtonLarge
      onClick={() => (window.location.href = href)}
      icon={<PluginIcon id={id} />}
      fullwidth
      {...rest}
    >
      {t("Continue with {{ authProviderName }}", {
        authProviderName: name,
      })}
    </ButtonLarge>
  );
}

const Wrapper = styled.div`
  width: 100%;
`;

const Form = styled.form`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: space-between;
`;

export default AuthenticationProvider;
