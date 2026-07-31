import { getActivityFeed } from "@/actions/activity-feed";
import { getCrmUsers } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { ActivitiesView } from "./activities-view";

export default async function ActivitiesPage() {
  const [feedResult, usersResult] = await Promise.all([
    getActivityFeed({ page: 1, perPage: DEFAULT_PAGE_SIZE }),
    getCrmUsers(),
  ]);

  return (
    <ActivitiesView
      initialRows={feedResult.data?.rows ?? []}
      initialTotal={feedResult.data?.total ?? 0}
      users={usersResult.data ?? []}
    />
  );
}
