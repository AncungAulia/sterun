import { ForOrganisers } from "@/modules/organiser/intro/ForOrganisers";

export const metadata = {
  title: "For organisers",
  description: "Sell entries, check runners in without signal, and give every finisher a result they can prove.",
};

/** The public way in for somebody who runs races, before they have a console. */
export default function ForOrganisersRoute() {
  return <ForOrganisers />;
}
