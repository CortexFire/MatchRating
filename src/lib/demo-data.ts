export type DemoPlayer = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Admin" | "Member";
  rating: number;
  rd: number;
  rank: number;
  gamesPlayed: number;
  record: string;
  trend: number;
  status: "Active" | "Pending review";
};

export type DemoMatch = {
  id: string;
  format: "singles" | "doubles";
  status: "Pending confirmation" | "Confirmed" | "Disputed";
  submittedAt: string;
  teamA: string[];
  teamB: string[];
  scores: string[];
  winnerTeam: "A" | "B";
  ratingDelta: string;
};

export type DemoCurrentGame = {
  id: string;
  status: "In progress" | "Complete";
  groupName: string;
  startedAt: string;
  players: string[];
};

export const demoUser = {
  id: "alice",
  name: "Alice Tan",
  initials: "AT",
};

export const demoGroup = {
  id: "demo",
  name: "Wednesday Club Ladder",
  description: "Friendly competitive badminton ladder for weekly club nights.",
  memberCount: 8,
  matchCount: 32,
  pendingReviews: 3,
  inviteUrl: "https://matchrating.app/join/wednesday-club",
};

export const demoGroups = [
  {
    id: "demo",
    name: "Wednesday Club Ladder",
    description: "Friendly competitive badminton ladder for weekly club nights.",
    memberCount: 8,
    matchCount: 32,
  },
  {
    id: "downtown-rec",
    name: "Downtown Rec Club",
    description: "Drop-in matches and weekend ladder play.",
    memberCount: 14,
    matchCount: 48,
  },
];

export const demoPlayers: DemoPlayer[] = [
  {
    id: "alice",
    name: "Alice Tan",
    initials: "AT",
    role: "Owner",
    rating: 1684,
    rd: 61,
    rank: 1,
    gamesPlayed: 26,
    record: "20-6",
    trend: 28,
    status: "Pending review",
  },
  {
    id: "bea",
    name: "Bea Rivera",
    initials: "BR",
    role: "Admin",
    rating: 1629,
    rd: 74,
    rank: 2,
    gamesPlayed: 21,
    record: "15-6",
    trend: 14,
    status: "Active",
  },
  {
    id: "cory",
    name: "Cory Shah",
    initials: "CS",
    role: "Member",
    rating: 1588,
    rd: 83,
    rank: 3,
    gamesPlayed: 18,
    record: "12-6",
    trend: -8,
    status: "Active",
  },
  {
    id: "dev",
    name: "Dev Okafor",
    initials: "DO",
    role: "Member",
    rating: 1547,
    rd: 92,
    rank: 4,
    gamesPlayed: 16,
    record: "9-7",
    trend: 21,
    status: "Active",
  },
  {
    id: "emi",
    name: "Emi Wilson",
    initials: "EW",
    role: "Member",
    rating: 1502,
    rd: 111,
    rank: 5,
    gamesPlayed: 11,
    record: "5-6",
    trend: -4,
    status: "Pending review",
  },
  {
    id: "finn",
    name: "Finn Liu",
    initials: "FL",
    role: "Member",
    rating: 1466,
    rd: 126,
    rank: 6,
    gamesPlayed: 9,
    record: "4-5",
    trend: 7,
    status: "Active",
  },
  {
    id: "gia",
    name: "Gia Patel",
    initials: "GP",
    role: "Member",
    rating: 1420,
    rd: 148,
    rank: 7,
    gamesPlayed: 5,
    record: "2-3",
    trend: -16,
    status: "Active",
  },
  {
    id: "henry",
    name: "Henry Park",
    initials: "HP",
    role: "Member",
    rating: 1394,
    rd: 170,
    rank: 8,
    gamesPlayed: 3,
    record: "1-2",
    trend: 3,
    status: "Active",
  },
];

export const demoMatches: DemoMatch[] = [
  {
    id: "match-104",
    format: "doubles",
    status: "Pending confirmation",
    submittedAt: "Today, 8:42 PM",
    teamA: ["Alice Tan", "Cory Shah"],
    teamB: ["Bea Rivera", "Dev Okafor"],
    scores: ["21-19", "17-21", "21-15"],
    winnerTeam: "A",
    ratingDelta: "+12 / -12",
  },
  {
    id: "match-103",
    format: "singles",
    status: "Pending confirmation",
    submittedAt: "Today, 7:18 PM",
    teamA: ["Emi Wilson"],
    teamB: ["Finn Liu"],
    scores: ["18-21", "21-16", "21-17"],
    winnerTeam: "A",
    ratingDelta: "+19 / -19",
  },
  {
    id: "match-102",
    format: "doubles",
    status: "Pending confirmation",
    submittedAt: "Mon, 9:05 PM",
    teamA: ["Bea Rivera", "Gia Patel"],
    teamB: ["Alice Tan", "Henry Park"],
    scores: ["21-14", "19-21", "18-21"],
    winnerTeam: "B",
    ratingDelta: "Rebuild queued",
  },
  {
    id: "match-101",
    format: "singles",
    status: "Confirmed",
    submittedAt: "Mon, 8:14 PM",
    teamA: ["Dev Okafor"],
    teamB: ["Cory Shah"],
    scores: ["21-13", "21-18"],
    winnerTeam: "A",
    ratingDelta: "+16 / -16",
  },
];

export const demoCurrentGames: DemoCurrentGame[] = [
  {
    id: "game-206",
    status: "In progress",
    groupName: "Wednesday Club Ladder",
    startedAt: "Today, 8:53 PM",
    players: ["Alice Tan", "Cory Shah", "Bea Rivera", "Dev Okafor"],
  },
  {
    id: "game-205",
    status: "In progress",
    groupName: "Downtown Rec Club",
    startedAt: "Today, 8:14 PM",
    players: ["Emi Wilson", "Finn Liu"],
  },
  {
    id: "game-204",
    status: "Complete",
    groupName: "Wednesday Club Ladder",
    startedAt: "Mon, 7:40 PM",
    players: ["Gia Patel", "Henry Park"],
  },
];

export function getDemoMatch(matchId: string) {
  return demoMatches.find((match) => match.id === matchId) ?? demoMatches[0];
}
