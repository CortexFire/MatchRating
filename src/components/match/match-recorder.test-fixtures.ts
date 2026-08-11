import { type AppPlayer } from "@/lib/app-data";

export const matchRecorderPlayers = [
  { id: "alice", name: "Alice Tan", initials: "AT", role: "Owner", rating: 1684, rd: 61, rank: 1, gamesPlayed: 26, status: "Inactive" },
  { id: "bea", name: "Bea Rivera", initials: "BR", role: "Admin", rating: 1629, rd: 74, rank: 2, gamesPlayed: 21, status: "Active" },
  { id: "cory", name: "Cory Shah", initials: "CS", role: "Member", rating: 1588, rd: 83, rank: 3, gamesPlayed: 18, status: "Active" },
  { id: "dev", name: "Dev Okafor", initials: "DO", role: "Member", rating: 1547, rd: 92, rank: 4, gamesPlayed: 16, status: "Active" },
  { id: "emi", name: "Emi Wilson", initials: "EW", role: "Member", rating: 1502, rd: 111, rank: 5, gamesPlayed: 11, status: "Inactive" },
  { id: "finn", name: "Finn Liu", initials: "FL", role: "Member", rating: 1466, rd: 126, rank: 6, gamesPlayed: 9, status: "Active" },
  { id: "gia", name: "Gia Patel", initials: "GP", role: "Member", rating: 1420, rd: 148, rank: 7, gamesPlayed: 5, status: "Active" },
  { id: "henry", name: "Henry Park", initials: "HP", role: "Member", rating: 1394, rd: 170, rank: 8, gamesPlayed: 3, status: "Active" },
] satisfies AppPlayer[];
