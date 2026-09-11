"use client";

/**
 * The visitor's area, named in the header, chosen in a dialog.
 *
 * The form is loaded only when the dialog opens. Its province list comes from
 * the places dataset, 176 KB of JSON (50 KB gzipped), and a visitor who never
 * picks an area should not download that to read a list of races. The button's
 * own label needs none of it: the country name is stored with the area.
 */
import { MapPinIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Area } from "@/lib/area";

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
          {area ? `${area.province}, ${area.country}` : "Choose your area"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="heading-strong text-xl text-ink">Your area</DialogTitle>
          <DialogDescription>
            Races in this province get a row of their own. The choice is saved in this browser only.
          </DialogDescription>
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
