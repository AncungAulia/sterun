"use client";

/**
 * The place the directory is filtered to, named in the header and chosen in a
 * dialog. With nothing chosen it reads "All locations".
 *
 * The form is loaded only when the dialog opens. Its province list comes from
 * the places dataset, 176 KB of JSON (50 KB gzipped), and a visitor who never
 * picks a place should not download that to read a list of races. The button's
 * own label needs none of it: the country name is stored with the place, and
 * `placeLabel` comes from `lib/area`, which imports nothing.
 */
import { MapPinIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { placeLabel, type Area } from "@/lib/area";

const AreaForm = lazy(() => import("./AreaForm").then((module) => ({ default: module.AreaForm })));

interface AreaPickerProps {
  area: Area | null;
  onSave: (area: Area) => void;
  onClear: () => void;
}

export function AreaPicker({ area, onSave, onClear }: AreaPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-3 text-n-600">
          <MapPinIcon aria-hidden />
          {area ? placeLabel(area) : "All locations"}
        </Button>
      </DialogTrigger>
      {/* The title says all there is to say, so there is no description for Radix to link. */}
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="heading-strong text-xl text-ink">Location</DialogTitle>
        </DialogHeader>
        <Suspense fallback={<p role="status" className="text-sm text-n-500">Loading provinces</p>}>
          <AreaForm
            area={area}
            onSave={(next) => {
              onSave(next);
              setOpen(false);
            }}
            onClear={() => {
              onClear();
              setOpen(false);
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}
