import { CreateEvent } from "@/modules/organiser/create/CreateEvent";

export const metadata = { title: "New race" };

export default function NewEventPage() {
  return <CreateEvent />;
}
