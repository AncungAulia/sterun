import { OpenPass } from "@/modules/pass/OpenPass";

export const metadata = { title: "Your race pass" };

/**
 * Where the installed app starts (`app/manifest.ts`). It sends the phone to the
 * pass it holds, and says so plainly when it holds none.
 */
export default function OpenPassRoute() {
  return <OpenPass />;
}
