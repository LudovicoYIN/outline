import { find } from "es-toolkit/compat";
import { observer } from "mobx-react";
import { EmailIcon } from "outline-icons";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { useLocation, Link, Redirect } from "react-router-dom";
import styled from "styled-components";
import { getCookie, setCookie } from "tiny-cookie";
import { s } from "@shared/styles";
import { Client, UserPreference } from "@shared/types";
import { isPWA } from "@shared/utils/browser";
import { parseDomain } from "@shared/utils/domains";
import type { Config } from "~/stores/AuthStore";
import { AvatarSize } from "~/components/Avatar";
import ButtonLarge from "~/components/ButtonLarge";
import ChangeLanguage from "~/components/ChangeLanguage";
import Flex from "~/components/Flex";
import Heading from "~/components/Heading";
import OutlineIcon from "~/components/Icons/OutlineIcon";
import Input from "~/components/Input";
import LoadingIndicator from "~/components/LoadingIndicator";
import { OneTimePasswordInput } from "~/components/OneTimePasswordInput";
import PageTitle from "~/components/PageTitle";
import TeamLogo from "~/components/TeamLogo";
import Text from "~/components/Text";
import env from "~/env";
import useCurrentUser from "~/hooks/useCurrentUser";
import {
  useLastVisitedPath,
  usePostLoginPath,
} from "~/hooks/useLastVisitedPath";
import useQuery from "~/hooks/useQuery";
import useStores from "~/hooks/useStores";
import Desktop from "~/utils/Desktop";
import isCloudHosted from "~/utils/isCloudHosted";
import { detectLanguage } from "~/utils/language";
import { homePath } from "~/utils/routeHelpers";
import AuthenticationProvider from "./components/AuthenticationProvider";
import { BackButton } from "./components/BackButton";
import { Background } from "./components/Background";
import { Centered } from "./components/Centered";
import { EmailInboxButtons } from "./components/EmailInboxButtons";
import { Notices } from "./components/Notices";
import { PasskeyAuthenticationProvider } from "./components/PasskeyAuthenticationProvider";
import { SigningIn } from "./components/SigningIn";
import { SwitchHostButton } from "./components/SwitchHostButton";
import { navigateToSubdomain } from "./urls";
import lazyWithRetry from "@shared/utils/lazyWithRetry";
import { getRedirectUrl } from "~/utils/urls";

const WorkspaceSetup = lazyWithRetry(
  () => import("./components/WorkspaceSetup")
);

type Props = {
  children?: (config?: Config) => React.ReactNode;
  onBack?: () => void;
};

function Login({ children, onBack }: Props) {
  const location = useLocation();
  const query = useQuery();
  const notice = query.get("notice");
  const forceOTP = query.get("forceOTP");

  const { t } = useTranslation();
  const user = useCurrentUser({ rejectOnEmpty: false });
  const { auth } = useStores();
  const { config } = auth;
  const [error, setError] = React.useState(null);
  const [emailLinkSentTo, setEmailLinkSentTo] = React.useState("");
  const isCreate = location.pathname === "/create";
  const rememberLastPath = !!user?.getPreference(
    UserPreference.RememberLastPath
  );
  const [lastVisitedPath] = useLastVisitedPath();
  const [spendPostLoginPath] = usePostLoginPath();
  const hasRedirectedToOidc = React.useRef(false);

  const shouldRedirectToOidc =
    !auth.authenticated &&
    !auth.isFetching &&
    config?.providers.length === 1 &&
    config.providers[0].id === "oidc" &&
    !env.OIDC_DISABLE_REDIRECT &&
    !query.get("notice") &&
    !query.get("logout");

  React.useEffect(() => {
    if (shouldRedirectToOidc && !hasRedirectedToOidc.current && config) {
      hasRedirectedToOidc.current = true;
      window.location.href = getRedirectUrl(config.providers[0].authUrl);
    }
  }, [shouldRedirectToOidc, config]);

  const handleReset = React.useCallback(() => {
    setEmailLinkSentTo("");
  }, []);
  const handleEmailSuccess = React.useCallback((email: string) => {
    setEmailLinkSentTo(email);
  }, []);

  const handleGoSubdomain = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      await navigateToSubdomain(data.subdomain as string);
    },
    []
  );

  React.useEffect(() => {
    auth.fetchConfig().catch(setError);
  }, [auth]);

  React.useEffect(() => {
    const entries = Object.fromEntries(query.entries());
    const existing = getCookie("signupQueryParams");

    // We don't want to set this cookie if we're viewing an error notice via
    // query string(notice =), if there are no query params, or it's already set
    if (Object.keys(entries).length && !query.get("notice") && !existing) {
      setCookie("signupQueryParams", JSON.stringify(entries));
    }
  }, [query]);

  // A passkey login initiated from the desktop app must complete the login
  // ceremony even when this browser already has a session.
  const isPasskeyLogin = query.get("method") === "passkey";

  // When the desktop app forces a passkey login it opens this page in the
  // system browser, where the ceremony is triggered automatically. Show the
  // "Signing in" screen rather than the login buttons.
  const isDesktopPasskeyRedirect =
    isPasskeyLogin &&
    query.get("client") === Client.Desktop &&
    !Desktop.isElectron();

  if (auth.authenticated && !isPasskeyLogin) {
    const postLoginPath = spendPostLoginPath();
    if (postLoginPath) {
      return <Redirect to={postLoginPath} />;
    }

    if (rememberLastPath && lastVisitedPath !== location.pathname) {
      return <Redirect to={lastVisitedPath} />;
    }

    if (auth.team?.defaultCollectionId) {
      return <Redirect to={`/collection/${auth.team?.defaultCollectionId}`} />;
    }

    return <Redirect to={homePath()} />;
  }

  if (error) {
    return (
      <Background>
        <BackButton onBack={onBack} />
        <ChangeLanguage locale={detectLanguage()} />
        <SwitchHostButton />
        <Centered>
          <PageTitle title={t("Login")} />
          <Heading centered>{t("Error")}</Heading>
          <Note>
            {t("Failed to load configuration.")}
            {!isCloudHosted && (
              <p>
                {t(
                  "Check the network requests and server logs for full details of the error."
                )}
              </p>
            )}
          </Note>
        </Centered>
      </Background>
    );
  }

  // we're counting on the config request being fast, so just a simple loading
  // indicator here that's delayed by 250ms
  if (!config) {
    return <LoadingIndicator />;
  }

  // The passkey ceremony is triggered automatically here, so render the
  // "Signing in" screen in place of the login buttons. The passkey provider is
  // still mounted (hidden) to drive the ceremony and form submission, revealing
  // a retry button if the ceremony fails.
  if (isDesktopPasskeyRedirect) {
    return (
      <Background>
        <ChangeLanguage locale={detectLanguage()} />
        <Centered gap={12}>
          <SigningIn />
          <PasskeyAuthenticationProvider />
        </Centered>
      </Background>
    );
  }

  const isCustomDomain = parseDomain(window.location.origin).custom;

  // Unmapped custom domain
  if (isCloudHosted && isCustomDomain && !config.name) {
    return (
      <Background>
        <BackButton onBack={onBack} config={config} />
        <ChangeLanguage locale={detectLanguage()} />
        <Centered>
          <PageTitle title={t("Custom domain setup")} />
          <Heading centered>{t("Almost there")}…</Heading>
          <Note>
            {t(
              "Your custom domain is successfully pointing at Outline. To complete the setup process please contact support."
            )}
          </Note>
        </Centered>
      </Background>
    );
  }

  if (Desktop.isElectron() && notice === "domain-required") {
    return (
      <Background>
        <BackButton onBack={onBack} config={config} />
        <ChangeLanguage locale={detectLanguage()} />

        <Centered as="form" onSubmit={handleGoSubdomain}>
          <Heading centered>{t("Choose workspace")}</Heading>
          <Note>
            {t(
              "This login method requires choosing your workspace to continue"
            )}
            …
          </Note>
          <Flex>
            <Input
              name="subdomain"
              style={{ textAlign: "right" }}
              placeholder={t("subdomain")}
              pattern="^[a-z\d-]+$"
              required
            >
              <Domain>.getoutline.com</Domain>
            </Input>
          </Flex>
          <ButtonLarge type="submit" fullwidth>
            {t("Continue")}
          </ButtonLarge>
        </Centered>
      </Background>
    );
  }

  const firstRun =
    config.providers.length === 0 && !isCloudHosted && !config.name;
  const hasMultipleProviders = config.providers.length > 1;
  const defaultProvider = find(
    config.providers,
    (provider) => provider.id === auth.lastSignedIn && !isCreate
  );
  const clientType = Desktop.isElectron() ? Client.Desktop : Client.Web;
  const preferOTP = isPWA || !!forceOTP;

  if (firstRun) {
    return (
      <React.Suspense fallback={null}>
        <WorkspaceSetup onBack={onBack} />
      </React.Suspense>
    );
  }

  if (emailLinkSentTo) {
    return (
      <Background>
        <BackButton onBack={onBack} config={config} />
        <Centered>
          <PageTitle title={t("Check your email")} />
          <CheckEmailIcon size={38} />
          <Heading centered>{t("Check your email")}</Heading>
          {preferOTP ? (
            <>
              <Note>
                <Trans
                  defaults="Enter the sign-in code sent to the email <em>{{ emailLinkSentTo }}</em>"
                  values={{ emailLinkSentTo }}
                  components={{ em: <em /> }}
                />
                .
              </Note>
              <Form
                method="POST"
                action="/auth/email.callback"
                style={{ width: "100%" }}
              >
                <input type="hidden" name="email" value={emailLinkSentTo} />
                <input type="hidden" name="client" value={clientType} />
                <input type="hidden" name="follow" value="true" />
                <OneTimePasswordInput name="code" />
                <br />
                <ButtonLarge type="submit" fullwidth>
                  {t("Continue")}
                </ButtonLarge>
              </Form>
            </>
          ) : (
            <>
              <Note>
                <Trans
                  defaults="A magic sign-in link has been sent to the email <em>{{ emailLinkSentTo }}</em> if an account exists."
                  values={{ emailLinkSentTo }}
                  components={{ em: <em /> }}
                />
              </Note>
              <br />
              <EmailInboxButtons email={emailLinkSentTo} />
            </>
          )}
          <ButtonLarge onClick={handleReset} fullwidth neutral>
            {t("Back to login")}
          </ButtonLarge>
        </Centered>
      </Background>
    );
  }

  // If there is only one provider and it's OIDC, the redirect is performed
  // from the effect above – render a loading indicator while we wait.
  if (shouldRedirectToOidc) {
    return <LoadingIndicator />;
  }

  return (
    <Background>
      <BackButton onBack={onBack} config={config} />
      <ChangeLanguage locale={detectLanguage()} />
      <SwitchHostButton />

      <LoginShell>
        <BrandPanel>
          <BrandIdentity>
            <BrandMark>
              {config.logo && !isCreate ? (
                <TeamLogo size={AvatarSize.XXLarge} src={config.logo} />
              ) : (
                <OutlineIcon size={28} />
              )}
            </BrandMark>
            <BrandName>{config.name || env.APP_NAME}</BrandName>
          </BrandIdentity>
          <BrandSymbol aria-hidden="true">
            <OutlineIcon size={112} color="#B8E8D1" />
          </BrandSymbol>
          <BrandFooter>{window.location.host}</BrandFooter>
        </BrandPanel>
        <FormPanel>
          <FormContent>
            <PageTitle
              title={config.name ? `${config.name} – ${t("Login")}` : t("Login")}
            />
            {isCreate ? (
              <>
                <StyledHeading as="h2">
                  {t("Create a workspace")}
                </StyledHeading>
                <Content>
                  {t(
                    "Get started by choosing a sign-in method for your new workspace below…"
                  )}
                </Content>
              </>
            ) : (
              <>
                <StyledHeading as="h2">
                  {t("Log in to {{ authProviderName }}", {
                    authProviderName: config.name || env.APP_NAME,
                  })}
                </StyledHeading>
                {children?.(config)}
              </>
            )}
            <Notices />
            {defaultProvider && (
              <React.Fragment key={defaultProvider.id}>
                <AuthenticationProvider
                  isCreate={isCreate}
                  onEmailSuccess={handleEmailSuccess}
                  preferOTP={preferOTP}
                  {...defaultProvider}
                />
                {hasMultipleProviders && (
                  <>
                    <Note>
                      {t("You signed in with {{ authProviderName }} last time.", {
                        authProviderName: defaultProvider.name,
                      })}
                    </Note>
                    <Or data-text={t("Or")} />
                  </>
                )}
              </React.Fragment>
            )}
            {config.providers.map((provider) => {
              if (defaultProvider && provider.id === defaultProvider.id) {
                return null;
              }

              return (
                <AuthenticationProvider
                  key={provider.id}
                  isCreate={isCreate}
                  onEmailSuccess={handleEmailSuccess}
                  preferOTP={preferOTP}
                  neutral={defaultProvider && hasMultipleProviders}
                  {...provider}
                />
              );
            })}
            {isCreate && (
              <Note>
                <Trans>
                  Already have an account? Go to <Link to="/">login</Link>.
                </Trans>
              </Note>
            )}
          </FormContent>
        </FormPanel>
      </LoginShell>
    </Background>
  );
}

const Form = styled.form`
  margin: 1em 0;
`;

const StyledHeading = styled(Heading)`
  margin: 0 0 28px;
  font-size: 26px;
  line-height: 1.2;
  overflow-wrap: anywhere;
`;

const Domain = styled.div`
  color: ${s("textSecondary")};
  padding: 0 8px 0 0;
`;

const CheckEmailIcon = styled(EmailIcon)`
  margin-bottom: -1.5em;
`;

const LoginShell = styled.div`
  display: grid;
  grid-template-columns: minmax(270px, 0.82fr) minmax(0, 1.18fr);
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto 1fr;
  }
`;

const BrandPanel = styled.aside`
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 48px clamp(28px, 4vw, 64px);
  background: #173e36;
  color: ${s("white")};

  @media (max-width: 760px) {
    min-height: 80px;
    flex-direction: row;
    align-items: center;
    padding: calc(14px + env(safe-area-inset-top)) 20px 14px;
  }
`;

const BrandIdentity = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`;

const BrandMark = styled.div`
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #d8f4e7;

  @media (max-width: 760px) {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
  }
`;

const BrandName = styled.span`
  min-width: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;

  @media (max-width: 760px) {
    font-size: 18px;
  }
`;

const BrandSymbol = styled.div`
  position: absolute;
  right: 12%;
  bottom: 25%;
  display: grid;
  place-items: center;
  width: 184px;
  height: 184px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  transform: rotate(-8deg);

  @media (max-width: 760px) {
    display: none;
  }
`;

const BrandFooter = styled.div`
  position: relative;
  z-index: 1;
  color: rgba(255, 255, 255, 0.66);
  font-size: 13px;
  overflow-wrap: anywhere;

  @media (max-width: 760px) {
    display: none;
  }
`;

const FormPanel = styled.main`
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  min-height: 100%;
  padding: 64px 48px;
  background: ${s("background")};

  @media (max-width: 760px) {
    min-height: 0;
    padding: 44px 24px calc(32px + env(safe-area-inset-bottom));
  }
`;

const FormContent = styled.div`
  width: 100%;
  max-width: 400px;
  min-width: 0;
`;

const Content = styled(Text)`
  color: ${s("textSecondary")};
  text-align: start;
  margin: -12px 0 24px;
`;

const Note = styled(Text)`
  color: ${s("textTertiary")};
  text-align: start;
  font-size: 14px;
  margin-top: 8px;

  em {
    font-style: normal;
    font-weight: 500;
  }
`;

const Or = styled.hr`
  margin: 1em 0;
  position: relative;
  width: 100%;
  border: 0;
  border-top: 1px solid ${s("divider")};

  &:after {
    content: attr(data-text);
    display: block;
    position: absolute;
    left: 50%;
    transform: translate3d(-50%, -50%, 0);
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 500;
    color: ${s("textTertiary")};
    background: ${s("background")};
    border-radius: 2px;
    padding: 0 4px;
  }
`;

export default observer(Login);
