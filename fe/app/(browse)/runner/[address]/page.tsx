import { RunnerProfilePage } from "@/modules/profile/RunnerProfilePage";

export const metadata = { title: "Race record" };

/**
 * STE-24: a runner's public race record. The address is checked on the page,
 * in the browser, so a mistyped link gets its own screen rather than a 404.
 */
export default async function RunnerRoute({ params }: PageProps<"/runner/[address]">) {
  const { address } = await params;
  return <RunnerProfilePage address={address} />;
}
