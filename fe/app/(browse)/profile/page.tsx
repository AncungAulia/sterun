import { MyProfilePage } from "@/modules/profile/MyProfilePage";

export const metadata = { title: "Your profile" };

/** The connected wallet's own page: entries, passes, race record and test money. */
export default function ProfileRoute() {
  return <MyProfilePage />;
}
