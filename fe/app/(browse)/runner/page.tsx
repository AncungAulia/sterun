import { RunnerLookupPage } from "@/modules/profile/RunnerLookupPage";

export const metadata = { title: "Find a race record" };

/** STE-24: open any runner's race record by pasting their address. */
export default function RunnerLookupRoute() {
  return <RunnerLookupPage />;
}
