import { Suspense } from "react";

import { Directory } from "@/modules/directory/Directory";

export const metadata = { title: "Browse races" };

/**
 * The boundary is here because the list reads the search from the address
 * (`useSearchParams`), and Next needs one around anything that does.
 */
export default function DirectoryPage() {
  return (
    <Suspense>
      <Directory />
    </Suspense>
  );
}
