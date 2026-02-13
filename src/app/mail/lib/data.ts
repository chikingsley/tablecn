import type { LucideIcon } from "lucide-react";

export interface Account {
  label: string;
  email: string;
  icon: LucideIcon;
}

export interface Contact {
  name: string;
  email: string;
}

export const contacts: Contact[] = [
  { name: "Emma Johnson", email: "emma.johnson@example.com" },
  { name: "Liam Wilson", email: "liam.wilson@example.com" },
  { name: "Olivia Davis", email: "olivia.davis@example.com" },
  { name: "Noah Martinez", email: "noah.martinez@example.com" },
  { name: "Ava Anderson", email: "ava.anderson@example.com" },
  { name: "Lucas Taylor", email: "lucas.taylor@example.com" },
  { name: "Sophia Thomas", email: "sophia.thomas@example.com" },
  { name: "Ethan Jackson", email: "ethan.jackson@example.com" },
  { name: "Isabella White", email: "isabella.white@example.com" },
  { name: "Mason Harris", email: "mason.harris@example.com" },
  { name: "Mia Robinson", email: "mia.robinson@example.com" },
  { name: "James Clark", email: "james.clark@example.com" },
  { name: "Charlotte Lewis", email: "charlotte.lewis@example.com" },
  { name: "Benjamin Walker", email: "benjamin.walker@example.com" },
  { name: "Amelia Hall", email: "amelia.hall@example.com" },
  { name: "Alexander Young", email: "alexander.young@example.com" },
  { name: "Harper King", email: "harper.king@example.com" },
  { name: "Daniel Wright", email: "daniel.wright@example.com" },
  { name: "Evelyn Scott", email: "evelyn.scott@example.com" },
  { name: "Michael Green", email: "michael.green@example.com" },
];
