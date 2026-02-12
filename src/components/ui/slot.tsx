import { Slot as RadixSlot } from "@radix-ui/react-slot";
import type * as React from "react";

type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

const Slot = RadixSlot as unknown as React.ForwardRefExoticComponent<
  SlotProps & React.RefAttributes<HTMLElement>
>;

export { Slot };
