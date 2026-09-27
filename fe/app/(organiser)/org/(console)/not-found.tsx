import { NotFoundMessage } from "@/components/layout/NotFoundMessage";

/**
 * The console layout has already drawn the rail and the <main> by the time a
 * console page calls notFound(), so this supplies no chrome of its own. The
 * rule, from fe/CLAUDE.md: a boundary file supplies the chrome only if its own
 * layouts do not.
 */
export default function ConsoleNotFound() {
  return <NotFoundMessage />;
}
