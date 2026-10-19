import type { ColumnSort } from "@tanstack/react-table";
import { observer } from "mobx-react";
import { GroupIcon } from "outline-icons";
import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { UserRole } from "@shared/types";
import Badge from "~/components/Badge";
import { ConditionalFade } from "~/components/Fade";
import Heading from "~/components/Heading";
import InputSearch from "~/components/InputSearch";
import Scene from "~/components/Scene";
import { SortableTable } from "~/components/SortableTable";
import type { Column as TableColumn } from "~/components/Table";
import Text from "~/components/Text";
import Time from "~/components/Time";
import { VStack } from "~/components/primitives/VStack";
import useQuery from "~/hooks/useQuery";
import { useTableRequest } from "~/hooks/useTableRequest";
import type { FetchPageParams, PaginatedResponse } from "~/stores/base/Store";
import { PAGINATION_SYMBOL } from "~/stores/base/Store";
import { client } from "~/utils/ApiClient";

interface GlobalUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: UserRole;
  lastActiveAt: string | null;
  isSuspended: boolean;
  createdAt: string;
  memberships: {
    id: string;
    role: UserRole;
    isSuspended: boolean;
    team: { id: string; name: string };
  }[];
}

interface GlobalUsersResponse {
  data: GlobalUser[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    nextPath: string;
  };
}

const EMPTY_USERS: GlobalUser[] = [];

/** Displays distinct login accounts and their workspace access to global admins. */
function GlobalUsers() {
  const location = useLocation();
  const history = useHistory();
  const { t } = useTranslation();
  const params = useQuery();
  const [query, setQuery] = useState(() => params.get("query") || "");
  const [users, setUsers] = useState<GlobalUser[]>();

  const reqParams = useMemo(
    () => ({
      query: params.get("query") || undefined,
      sort: params.get("sort") || "name",
      direction: (params.get("direction") || "asc").toUpperCase() as
        | "ASC"
        | "DESC",
    }),
    [params]
  );

  const sort: ColumnSort = useMemo(
    () => ({
      id: reqParams.sort,
      desc: reqParams.direction === "DESC",
    }),
    [reqParams.direction, reqParams.sort]
  );

  const fetchGlobalUsers = useCallback(
    async (
      pageParams: FetchPageParams
    ): Promise<PaginatedResponse<GlobalUser>> => {
      const response = await client.post<GlobalUsersResponse>(
        "/users.global_list",
        {
          offset: pageParams.offset ?? 0,
          limit: pageParams.limit ?? 25,
          query: pageParams.query,
          sort: pageParams.sort,
          direction: pageParams.direction,
        }
      );
      const page = Object.assign(response.data, {
        [PAGINATION_SYMBOL]: response.pagination,
      });

      setUsers((previous) =>
        pageParams.offset
          ? [...(previous ?? EMPTY_USERS), ...response.data]
          : response.data
      );

      return page;
    },
    []
  );

  const { data, error, loading, next } = useTableRequest({
    data: users ?? EMPTY_USERS,
    sort,
    reqFn: fetchGlobalUsers,
    reqParams,
  });

  const updateQueryParam = useCallback(
    (name: string, value: string) => {
      const nextParams = new URLSearchParams(location.search);
      if (value) {
        nextParams.set(name, value);
      } else {
        nextParams.delete(name);
      }

      history.replace({
        pathname: location.pathname,
        search: nextParams.toString(),
      });
    },
    [history, location.pathname, location.search]
  );

  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  useEffect(() => {
    if (error) {
      toast.error(t("Could not load users"));
    }
  }, [error, t]);

  useEffect(() => {
    const timeout = setTimeout(() => updateQueryParam("query", query), 250);
    return () => clearTimeout(timeout);
  }, [query, updateQueryParam]);

  const columns = useMemo<TableColumn<GlobalUser>[]>(
    () => [
      {
        type: "data",
        id: "name",
        header: t("Name"),
        accessor: (user) => user.name,
        component: (user) => (
          <VStack align="flex-start" spacing={0}>
            <Text selectable>{user.name}</Text>
            <Text type="tertiary" selectable>
              {user.email ?? user.username}
            </Text>
          </VStack>
        ),
        width: "3fr",
      },
      {
        type: "data",
        id: "teamId",
        header: t("Workspace"),
        accessor: (user) =>
          user.memberships.map(({ team }) => team.name).join(", "),
        component: (user) => (
          <VStack align="flex-start" spacing={0}>
            {user.memberships.map((membership) => (
              <Text key={membership.id} selectable>
                {membership.team.name} ·{" "}
                {membership.role === UserRole.Admin
                  ? t("Admin")
                  : membership.role === UserRole.Viewer
                    ? t("Viewer")
                    : membership.role === UserRole.Guest
                      ? t("Guest")
                      : t("Editor")}
                {membership.isSuspended ? ` · ${t("Suspended")}` : ""}
              </Text>
            ))}
          </VStack>
        ),
        width: "2fr",
        sortable: false,
      },
      {
        type: "data",
        id: "role",
        header: t("Role"),
        accessor: (user) => user.role,
        component: (user) => (
          <Badge primary={user.role === UserRole.Admin}>
            {user.role === UserRole.Admin
              ? t("Admin")
              : user.role === UserRole.Viewer
                ? t("Viewer")
                : user.role === UserRole.Guest
                  ? t("Guest")
                  : t("Editor")}
          </Badge>
        ),
        width: "minmax(120px, 1fr)",
      },
      {
        type: "data",
        id: "status",
        header: t("Status"),
        accessor: (user) => (user.isSuspended ? 2 : user.lastActiveAt ? 0 : 1),
        component: (user) =>
          user.isSuspended ? (
            <Badge>{t("Suspended")}</Badge>
          ) : user.lastActiveAt ? (
            <Badge>{t("Active")}</Badge>
          ) : (
            <Badge>{t("Invited")}</Badge>
          ),
        width: "minmax(120px, 1fr)",
        sortable: false,
      },
      {
        type: "data",
        id: "lastActiveAt",
        header: t("Last active"),
        accessor: (user) => user.lastActiveAt,
        component: (user) =>
          user.lastActiveAt ? (
            <Time dateTime={user.lastActiveAt} addSuffix shorten />
          ) : null,
        width: "2fr",
        hideOnMobile: true,
      },
    ],
    [t]
  );

  return (
    <Scene title={t("User management")} icon={<GroupIcon />} wide>
      <Heading>{t("User management")}</Heading>
      <Text as="p" type="secondary">
        {t("Each account is listed once, with its workspaces and permissions.")}
      </Text>
      <InputSearch
        short
        value={query}
        placeholder={`${t("Filter")}…`}
        onChange={handleSearch}
      />
      <ConditionalFade animate={!users}>
        <SortableTable
          id="global-users"
          data={data ?? EMPTY_USERS}
          columns={columns}
          sort={sort}
          loading={loading}
          rowHeight={76}
          page={{ hasNext: !!next, fetchNext: next }}
        />
      </ConditionalFade>
    </Scene>
  );
}

export default observer(GlobalUsers);
