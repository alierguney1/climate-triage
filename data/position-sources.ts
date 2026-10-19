import type { PositionBoard, PositionSource } from "@/types/positions";

// The applicant tracking systems the organizations run their boards on, by name.
export const BOARD_NAMES: Record<PositionBoard, string> = {
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever"
};

// The climate tech organizations we list positions for.
//
// Every entry was checked against the live board, so the token points at the organization's
// own job board and not at an unrelated company that uses the same name. Run
// `pnpm positions:check` to re-verify the list.
export const POSITION_SOURCES: PositionSource[] = [
  {
    id: "form-energy",
    name: "Form Energy",
    description: "Iron-air batteries for the grid",
    url: "https://jobs.ashbyhq.com/formenergy",
    board: "ashby",
    token: "formenergy",
    category: "energy",
    // The board page is titled "Jobs" and names no organization, so the check cannot
    // verify it. The postings themselves come from the token, which is checked by hand.
    nameUnverifiable: true
  },
  {
    id: "helion",
    name: "Helion",
    description: "Fusion power",
    url: "https://jobs.ashbyhq.com/helion",
    board: "ashby",
    token: "helion",
    category: "energy"
  },
  {
    id: "watershed",
    name: "Watershed",
    description: "Carbon accounting software",
    url: "https://jobs.ashbyhq.com/watershed",
    board: "ashby",
    token: "watershed",
    category: "software"
  },
  {
    id: "sylvera",
    name: "Sylvera",
    description: "Carbon analytics for energy companies and utilities",
    url: "https://jobs.ashbyhq.com/sylvera",
    board: "ashby",
    token: "sylvera",
    category: "software"
  },
  {
    id: "twelve",
    name: "Twelve",
    description: "Sustainable aviation fuel made from carbon dioxide and water",
    url: "https://jobs.ashbyhq.com/twelve",
    board: "ashby",
    token: "twelve",
    category: "fuels"
  },
  {
    id: "redwood-materials",
    name: "Redwood Materials",
    description: "Battery recycling and energy storage",
    url: "https://job-boards.greenhouse.io/redwoodmaterials",
    board: "greenhouse",
    token: "redwoodmaterials",
    category: "energy"
  },
  {
    id: "hyliion",
    name: "Hyliion",
    description: "E-fuels made from biomass and green hydrogen",
    url: "https://job-boards.greenhouse.io/hyliion",
    board: "greenhouse",
    token: "hyliion",
    category: "fuels"
  },
  {
    id: "noon-energy",
    name: "Noon Energy",
    description: "Iron-air batteries for long duration storage",
    url: "https://job-boards.greenhouse.io/noonenergy",
    board: "greenhouse",
    token: "noonenergy",
    category: "energy"
  },
  {
    id: "sunnova",
    name: "Sunnova Energy",
    description: "Solar installations and energy storage",
    url: "https://job-boards.greenhouse.io/sunnova",
    board: "greenhouse",
    token: "sunnova",
    category: "energy"
  },
  {
    id: "airco",
    name: "AIRCO",
    description: "E-methanol made from captured carbon dioxide",
    url: "https://job-boards.greenhouse.io/aircompany",
    board: "greenhouse",
    token: "aircompany",
    category: "fuels"
  },
  {
    id: "carbonchain",
    name: "CarbonChain",
    description: "Carbon accounting for companies and their supply chains",
    url: "https://job-boards.greenhouse.io/carbonchain",
    board: "greenhouse",
    token: "carbonchain",
    category: "software"
  },
  {
    id: "pivot-bio",
    name: "Pivot Bio",
    description: "Microbes that replace nitrogen fertilizer",
    url: "https://job-boards.greenhouse.io/pivotbio",
    board: "greenhouse",
    token: "pivotbio",
    category: "food"
  },
  {
    id: "nuro",
    name: "Nuro",
    description: "Autonomous vehicles for delivery",
    url: "https://job-boards.greenhouse.io/nuro",
    board: "greenhouse",
    token: "nuro",
    category: "mobility"
  },
  {
    id: "kodiak",
    name: "Kodiak",
    description: "Autonomous trucks for freight",
    url: "https://job-boards.greenhouse.io/kodiak",
    board: "greenhouse",
    token: "kodiak",
    category: "mobility"
  },
  {
    id: "voltus",
    name: "Voltus",
    description: "Demand response for distributed energy resources",
    url: "https://jobs.lever.co/voltus",
    board: "lever",
    token: "voltus",
    category: "energy"
  },
  {
    id: "enable",
    name: "Enable",
    description: "Software for utility pricing and rebates",
    url: "https://jobs.lever.co/enable",
    board: "lever",
    token: "enable",
    category: "energy"
  },
  {
    id: "waabi",
    name: "Waabi",
    description: "Autonomous trucking, built AI first",
    url: "https://jobs.lever.co/waabi",
    board: "lever",
    token: "waabi",
    category: "mobility"
  },
  {
    id: "living-carbon",
    name: "Living Carbon",
    description: "Forest carbon removal on marginal land",
    url: "https://jobs.lever.co/livingcarbon",
    board: "lever",
    token: "livingcarbon",
    category: "carbon"
  },
  {
    id: "captura",
    name: "Captura",
    description: "Carbon removal with direct ocean capture",
    url: "https://job-boards.greenhouse.io/captura",
    board: "greenhouse",
    token: "captura",
    category: "carbon"
  }
];
