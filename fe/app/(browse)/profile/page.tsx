import { IS_TESTNET } from "@/lib/chain/env";
import { MyProfilePage } from "@/modules/profile/MyProfilePage";
import { parseProfileTab } from "@/modules/profile/lib/profile-tab";

export const metadata = { title: "Your profile" };

/**
 * The connected wallet's own page: entries, passes, race record and test money.
 *
 * The section is read here, from the address, rather than held in the page's
 * own state, so a tab can be linked to and Back returns to the one it came
 * from. `parseProfileTab` needs no wallet and no chain read, so this stays a
 * server component and no Suspense boundary is required.
 */
export default async function ProfileRoute({ searchParams }: PageProps<"/profile">) {
  const { tab } = await searchParams;
  return <MyProfilePage tab={parseProfileTab(tab, IS_TESTNET)} />;
}
